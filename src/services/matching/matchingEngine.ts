/**
 * Matching Engine — PROJ-23 Phase A4
 *
 * 3-Run orchestrator for the order mapping pipeline.
 * Replaces the single-pass waterfall mapper (orderMapper.ts) as the
 * primary mapping strategy.
 *
 * Pipeline:
 *   Run 1 — Perfect Match (Aggregated): ArtNo + PDF ref + exact qty
 *   Run 2 — Partial Fillup (Aggregated): PDF refs partial + Smart-Qty
 *   Run 3 — Expand + FIFO: Expand to qty=1, then FIFO-fill remaining
 *
 * Input:
 *   - Aggregated InvoiceLine[] (~45 positions, qty > 1 possible)
 *   - OrderPool (from Phase A3, article-first filtered)
 *   - ParsedInvoiceLineExtended[] (for PDF orderCandidates)
 *
 * Output:
 *   - Expanded InvoiceLine[] (~295 lines, qty=1 each)
 *   - Mutated OrderPool (with consumed quantities tracked)
 *   - Issues for unmatched / incomplete / multi-split positions
 *   - Stats for KPI tiles
 *
 * @module services/matching/matchingEngine
 */

import type {
  InvoiceLine,
  ParsedInvoiceLineExtended,
  Issue,
  RunStats,
} from '@/types';
import type { OrderPool } from './orderPool';
import { run1PerfectMatch } from './runs/run1PerfectMatch';
import { run2PartialFillup } from './runs/run2PartialFillup';
import { run3ExpandFifo } from './runs/run3ExpandFifo';
import { logService } from '@/services/logService';

// ── Result type ──────────────────────────────────────────────────────

export interface MatchingEngineResult {
  /** Expanded individual lines (qty=1 each, ~295) */
  lines: InvoiceLine[];
  /** Mutated OrderPool with all consumption from Runs 1-3 */
  pool: OrderPool;
  /** Step 4 stats */
  stats: Pick<
    RunStats,
    | 'perfectMatchCount'
    | 'referenceMatchCount'
    | 'smartQtyMatchCount'
    | 'fifoFallbackCount'
    | 'matchedOrders'
    | 'notOrderedCount'
  >;
  /** Issues for unmatched and problematic lines */
  issues: Issue[];
}

// ── Issue builders ───────────────────────────────────────────────────

function buildEngineIssues(
  expandedLines: InvoiceLine[],
  runId: string,
): Issue[] {
  const issues: Issue[] = [];
  const now = new Date().toISOString();

  // 1. order-no-match: Expanded lines without any order assignment
  const notOrderedLines = expandedLines.filter(l => l.orderAssignmentReason === 'not-ordered');
  if (notOrderedLines.length > 0) {
    // Group by positionIndex for cleaner reporting
    const positionIndices = new Set(notOrderedLines.map(l => l.positionIndex));
    issues.push({
      id: `issue-${runId}-step4-not-ordered-${Date.now()}`,
      runId,
      severity: 'warning',
      stepNo: 4,
      type: 'order-no-match',
      message: `${positionIndices.size} Positionen (${notOrderedLines.length} Einzelartikel) ohne Bestellzuordnung`,
      details: `${positionIndices.size} Positionen ohne Bestellzuordnung`,
      relatedLineIds: notOrderedLines.map(l => l.lineId),
      affectedLineIds: notOrderedLines.map(l => l.lineId),
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
      context: { field: 'orderAssignmentReason', expectedValue: 'assigned', actualValue: 'not-ordered' },
    });
  }

  // 2. order-fifo-only: Positions assigned exclusively via FIFO (no PDF reference)
  const fifoOnlyLines = expandedLines.filter(l =>
    l.allocatedOrders.length > 0 && l.allocatedOrders.every(a => a.reason === 'fifo-fallback')
  );
  if (fifoOnlyLines.length > 0) {
    const positionIndices = new Set(fifoOnlyLines.map(l => l.positionIndex));
    issues.push({
      id: `issue-${runId}-step4-fifo-only-${Date.now()}`,
      runId,
      severity: 'info',
      stepNo: 4,
      type: 'order-fifo-only',
      message: `${positionIndices.size} Positionen nur via FIFO zugeordnet (keine PDF-Referenz)`,
      details: `${positionIndices.size} Positionen nur via FIFO zugeordnet`,
      relatedLineIds: fifoOnlyLines.map(l => l.lineId),
      affectedLineIds: fifoOnlyLines.map(l => l.lineId),
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
      context: { field: 'orderAssignmentReason', expectedValue: 'reference-match', actualValue: 'fifo-fallback' },
    });
  }

  // 3. order-multi-split: Positions where expanded lines reference 3+ different orders
  const positionOrders = new Map<number, Set<string>>();
  for (const line of expandedLines) {
    if (line.orderNumberAssigned) {
      const set = positionOrders.get(line.positionIndex) ?? new Set();
      set.add(line.orderNumberAssigned);
      positionOrders.set(line.positionIndex, set);
    }
  }
  const multiSplitPositions = Array.from(positionOrders.entries())
    .filter(([, orders]) => orders.size >= 3);
  if (multiSplitPositions.length > 0) {
    const relatedLines = expandedLines.filter(l =>
      multiSplitPositions.some(([pi]) => l.positionIndex === pi)
    );
    issues.push({
      id: `issue-${runId}-step4-multi-split-${Date.now()}`,
      runId,
      severity: 'info',
      stepNo: 4,
      type: 'order-multi-split',
      message: `${multiSplitPositions.length} Positionen auf 3+ Bestellungen aufgeteilt`,
      details: `${multiSplitPositions.length} Positionen auf 3+ Bestellungen aufgeteilt`,
      relatedLineIds: relatedLines.map(l => l.lineId),
      affectedLineIds: relatedLines.map(l => l.lineId),
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
      context: { field: 'allocatedOrders' },
    });
  }

  return issues;
}

// ── Main orchestrator ────────────────────────────────────────────────

/**
 * Execute the 3-Run Matching Engine.
 *
 * @param aggregatedLines - Aggregated InvoiceLine[] (~45 positions)
 * @param pool - OrderPool (article-first filtered, from Phase A3)
 * @param parsedPositions - For PDF orderCandidates lookup
 * @param runId - Current run ID
 */
export function executeMatchingEngine(
  aggregatedLines: InvoiceLine[],
  pool: OrderPool,
  parsedPositions: ParsedInvoiceLineExtended[],
  runId: string,
): MatchingEngineResult {
  logService.debug(`[MatchingEngine] Starting 3-Run pipeline...`, { runId, step: 'Bestellungen mappen' });

  // ── Run 1: Perfect Match (Aggregated) ──
  const r1 = run1PerfectMatch(aggregatedLines, pool, parsedPositions);
  logService.debug(`[MatchingEngine] Run 1 complete...`, { runId, step: 'Bestellungen mappen' });

  // ── Run 2: Partial Fillup (Aggregated) ──
  const r2 = run2PartialFillup(r1.lines, pool, parsedPositions);
  logService.debug(`[MatchingEngine] Run 2 complete...`, { runId, step: 'Bestellungen mappen' });

  // ── Run 3: Expand + FIFO (CRITICAL TRANSITION) ──
  const r3 = run3ExpandFifo(r2.lines, pool, runId);
  logService.debug(`[MatchingEngine] Run 3 complete...`, { runId, step: 'Bestellungen mappen' });

  // ── Build issues from expanded lines ──
  const issues = buildEngineIssues(r3.lines, runId);

  // ── Compute stats ──
  const matchedOrders = r3.lines.filter(
    l => l.orderAssignmentReason !== 'pending' && l.orderAssignmentReason !== 'not-ordered'
  ).length;
  const notOrderedCount = r3.lines.filter(l => l.orderAssignmentReason === 'not-ordered').length;

  const stats = {
    perfectMatchCount: r1.perfectMatchCount,
    referenceMatchCount: r2.referenceMatchCount,
    smartQtyMatchCount: r2.smartQtyMatchCount,
    fifoFallbackCount: r3.fifoFallbackCount,
    matchedOrders,
    notOrderedCount,
  };

  logService.debug(`[MatchingEngine] Pipeline result...`, { runId, step: 'Bestellungen mappen' });

  return {
    lines: r3.lines,
    pool,
    stats,
    issues,
  };
}
