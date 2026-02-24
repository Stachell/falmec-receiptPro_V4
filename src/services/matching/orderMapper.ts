/**
 * orderMapper — PROJ-20
 *
 * 4-stage waterfall order mapper operating on AGGREGATED invoice positions.
 * Replaces the legacy 3-rule OrderMatcher (now 'legacy-waterfall-4' config).
 *
 * Stages (priority order):
 *   1. Perfect Match   — orderCandidate from PDF + openQuantity === position.qty
 *   2. Reference Match — orderCandidate from PDF matches, qty differs → partial allocation
 *   3. Smart Qty Match — no candidate, but exactly ONE order with openQty === remaining qty
 *   4. FIFO Fallback   — fill remaining from oldest orders (year ASC, belegnummer ASC), splitting
 *
 * Input:
 *   - Aggregated InvoiceLine[] (45 positions, each with qty > 1 possible)
 *   - ParsedOrderPosition[] (from orderParser)
 *   - orderCandidates per position (from parsedPositions / ParsedInvoiceLineExtended)
 *
 * Output:
 *   - Updated InvoiceLine[] with allocatedOrders: AllocatedOrder[]
 *   - Per-position: sum(allocatedOrders[].qty) <= line.qty
 *   - Stats: perfectMatchCount, referenceMatchCount, smartQtyMatchCount, fifoFallbackCount
 */

import type {
  InvoiceLine,
  AllocatedOrder,
  OrderAssignmentReason,
  ParsedOrderPosition,
  ParsedInvoiceLineExtended,
  Issue,
  RunStats,
} from '@/types';

// ── Result type ──────────────────────────────────────────────────────

export interface OrderMapperResult {
  lines: InvoiceLine[];
  stats: Pick<RunStats, 'perfectMatchCount' | 'referenceMatchCount' | 'smartQtyMatchCount' | 'fifoFallbackCount' | 'matchedOrders' | 'notOrderedCount'>;
  issues: Issue[];
}

// ── Consumption tracker ──────────────────────────────────────────────

class ConsumptionTracker {
  /** Map: order position ID → consumed qty */
  private consumed = new Map<string, number>();

  remaining(op: ParsedOrderPosition): number {
    return op.openQuantity - (this.consumed.get(op.id) ?? 0);
  }

  consume(op: ParsedOrderPosition, qty: number): void {
    const prev = this.consumed.get(op.id) ?? 0;
    this.consumed.set(op.id, prev + qty);
  }
}

// ── Candidate finder ─────────────────────────────────────────────────

/**
 * Find order positions matching a given invoice line by article identifiers.
 * Returns only positions with remaining open quantity, sorted oldest-first.
 */
function findCandidateOrders(
  line: InvoiceLine,
  orders: ParsedOrderPosition[],
  tracker: ConsumptionTracker,
): ParsedOrderPosition[] {
  const lineArtDE = (line.falmecArticleNo ?? '').trim();
  const lineArtIT = (line.manufacturerArticleNo ?? '').trim();
  const lineEan = (line.ean ?? '').trim();

  return orders
    .filter(op => {
      // Match by Art-DE, Art-IT, or EAN
      const matchDE = lineArtDE && op.artNoDE && op.artNoDE === lineArtDE;
      const matchIT = lineArtIT && op.artNoIT && op.artNoIT === lineArtIT;
      const matchEan = lineEan && op.ean && op.ean === lineEan;
      return matchDE || matchIT || matchEan;
    })
    .filter(op => tracker.remaining(op) > 0)
    .sort((a, b) => {
      // Oldest first: year ASC, then belegnummer ASC
      if (a.orderYear !== b.orderYear) return a.orderYear - b.orderYear;
      return a.belegnummer.localeCompare(b.belegnummer);
    });
}

// ── Waterfall stages ─────────────────────────────────────────────────

/**
 * Stage 1: Perfect Match
 * Order candidate from PDF + openQuantity === position.qty
 */
function stagePerfectMatch(
  line: InvoiceLine,
  orderCandidates: string[],
  candidateOrders: ParsedOrderPosition[],
  tracker: ConsumptionTracker,
): AllocatedOrder | null {
  if (orderCandidates.length === 0) return null;

  for (const candidateRef of orderCandidates) {
    const ref5 = candidateRef.replace(/\D/g, '').slice(-5);
    const match = candidateOrders.find(op => {
      const opRef5 = op.orderNumber.slice(-5);
      return opRef5 === ref5 && tracker.remaining(op) === line.qty;
    });

    if (match) {
      tracker.consume(match, line.qty);
      return {
        orderNumber: `${match.orderYear}-${match.orderNumber}`,
        orderYear: match.orderYear,
        qty: line.qty,
        reason: 'perfect-match' as OrderAssignmentReason,
      };
    }
  }

  return null;
}

/**
 * Stage 2: Reference Match
 * Order candidate from PDF matches but qty differs → partial allocation
 */
function stageReferenceMatch(
  remainingQty: number,
  orderCandidates: string[],
  candidateOrders: ParsedOrderPosition[],
  tracker: ConsumptionTracker,
): AllocatedOrder[] {
  if (orderCandidates.length === 0) return [];

  const allocations: AllocatedOrder[] = [];
  let leftover = remainingQty;

  for (const candidateRef of orderCandidates) {
    if (leftover <= 0) break;

    const ref5 = candidateRef.replace(/\D/g, '').slice(-5);
    const matchingOrders = candidateOrders
      .filter(op => op.orderNumber.slice(-5) === ref5 && tracker.remaining(op) > 0)
      .sort((a, b) => {
        if (a.orderYear !== b.orderYear) return a.orderYear - b.orderYear;
        return a.belegnummer.localeCompare(b.belegnummer);
      });

    for (const op of matchingOrders) {
      if (leftover <= 0) break;
      const take = Math.min(leftover, tracker.remaining(op));
      if (take <= 0) continue;

      tracker.consume(op, take);
      allocations.push({
        orderNumber: `${op.orderYear}-${op.orderNumber}`,
        orderYear: op.orderYear,
        qty: take,
        reason: 'reference-match' as OrderAssignmentReason,
      });
      leftover -= take;
    }
  }

  return allocations;
}

/**
 * Stage 3: Smart Qty Match
 * No candidate from PDF, but exactly ONE order with openQty === remaining qty
 */
function stageSmartQtyMatch(
  remainingQty: number,
  candidateOrders: ParsedOrderPosition[],
  tracker: ConsumptionTracker,
): AllocatedOrder | null {
  if (remainingQty <= 0) return null;

  const exactMatches = candidateOrders.filter(op => tracker.remaining(op) === remainingQty);
  if (exactMatches.length !== 1) return null;

  const op = exactMatches[0];
  tracker.consume(op, remainingQty);
  return {
    orderNumber: `${op.orderYear}-${op.orderNumber}`,
    orderYear: op.orderYear,
    qty: remainingQty,
    reason: 'smart-qty-match' as OrderAssignmentReason,
  };
}

/**
 * Stage 4: FIFO Fallback
 * Fill remaining from oldest orders, splitting as needed
 */
function stageFifoFallback(
  remainingQty: number,
  candidateOrders: ParsedOrderPosition[],
  tracker: ConsumptionTracker,
): AllocatedOrder[] {
  if (remainingQty <= 0) return [];

  const allocations: AllocatedOrder[] = [];
  let leftover = remainingQty;

  // candidateOrders are already sorted oldest-first
  for (const op of candidateOrders) {
    if (leftover <= 0) break;
    const available = tracker.remaining(op);
    if (available <= 0) continue;

    const take = Math.min(leftover, available);
    tracker.consume(op, take);
    allocations.push({
      orderNumber: `${op.orderYear}-${op.orderNumber}`,
      orderYear: op.orderYear,
      qty: take,
      reason: 'fifo-fallback' as OrderAssignmentReason,
    });
    leftover -= take;
  }

  return allocations;
}

// ── Main mapper ──────────────────────────────────────────────────────

/**
 * Map all aggregated invoice lines against parsed order positions using the 4-stage waterfall.
 *
 * @param lines - Aggregated InvoiceLine[] (the 45 positions from the store)
 * @param orders - ParsedOrderPosition[] from orderParser
 * @param parsedPositions - ParsedInvoiceLineExtended[] for orderCandidates lookup
 * @param runId - Current run ID for issue generation
 */
export function mapAllOrders(
  lines: InvoiceLine[],
  orders: ParsedOrderPosition[],
  parsedPositions: ParsedInvoiceLineExtended[],
  runId: string,
): OrderMapperResult {
  const tracker = new ConsumptionTracker();

  // Build positionIndex → orderCandidates lookup
  const candidatesMap = new Map<number, string[]>();
  for (const pos of parsedPositions) {
    candidatesMap.set(pos.positionIndex, pos.orderCandidates ?? []);
  }

  let perfectMatchCount = 0;
  let referenceMatchCount = 0;
  let smartQtyMatchCount = 0;
  let fifoFallbackCount = 0;
  let matchedOrderLines = 0;
  let notOrderedCount = 0;

  const updatedLines = lines.map(line => {
    // Skip lines that already have an order assignment (e.g. manual)
    if (line.orderAssignmentReason !== 'pending') {
      if (line.orderAssignmentReason !== 'not-ordered') matchedOrderLines++;
      return line;
    }

    const orderCandidates = candidatesMap.get(line.positionIndex) ?? [];
    const candidateOrders = findCandidateOrders(line, orders, tracker);
    const allocations: AllocatedOrder[] = [];
    let remainingQty = line.qty;

    // Stage 1: Perfect Match
    const perfectResult = stagePerfectMatch(line, orderCandidates, candidateOrders, tracker);
    if (perfectResult) {
      allocations.push(perfectResult);
      remainingQty -= perfectResult.qty;
      perfectMatchCount++;
    }

    // Stage 2: Reference Match (only if qty remains)
    if (remainingQty > 0) {
      const refAllocations = stageReferenceMatch(remainingQty, orderCandidates, candidateOrders, tracker);
      for (const alloc of refAllocations) {
        allocations.push(alloc);
        remainingQty -= alloc.qty;
        referenceMatchCount++;
      }
    }

    // Stage 3: Smart Qty Match (only if qty remains and no PDF candidates used)
    if (remainingQty > 0) {
      const smartResult = stageSmartQtyMatch(remainingQty, candidateOrders, tracker);
      if (smartResult) {
        allocations.push(smartResult);
        remainingQty -= smartResult.qty;
        smartQtyMatchCount++;
      }
    }

    // Stage 4: FIFO Fallback (only if qty remains)
    if (remainingQty > 0) {
      const fifoAllocations = stageFifoFallback(remainingQty, candidateOrders, tracker);
      for (const alloc of fifoAllocations) {
        allocations.push(alloc);
        remainingQty -= alloc.qty;
        fifoFallbackCount++;
      }
    }

    // Determine overall reason for this position
    let overallReason: OrderAssignmentReason = 'not-ordered';
    if (allocations.length > 0) {
      // Use the reason of the first (highest priority) allocation
      overallReason = allocations[0].reason;
      matchedOrderLines++;
    } else {
      notOrderedCount++;
    }

    // Build orderNumberAssigned from first allocation (backward compat)
    const firstAlloc = allocations[0] ?? null;

    return {
      ...line,
      allocatedOrders: allocations,
      orderAssignmentReason: overallReason,
      orderNumberAssigned: firstAlloc?.orderNumber ?? null,
      orderYear: firstAlloc?.orderYear ?? null,
      orderCode: firstAlloc ? firstAlloc.orderNumber.split('-').pop() ?? null : null,
    };
  });

  // Build issues for unmatched and problematic lines
  const issues: Issue[] = [];
  const now = new Date().toISOString();

  // 1. order-no-match: Positions without any order assignment
  const notOrderedLines = updatedLines.filter(l => l.orderAssignmentReason === 'not-ordered');
  if (notOrderedLines.length > 0) {
    issues.push({
      id: `issue-${runId}-step4-not-ordered-${Date.now()}`,
      runId,
      severity: 'warning',
      stepNo: 4,
      type: 'order-no-match',
      message: `${notOrderedLines.length} Positionen ohne Bestellzuordnung`,
      details: notOrderedLines.map(l => `Pos ${l.positionIndex}: ${l.manufacturerArticleNo || l.ean || l.lineId}`).join(', '),
      relatedLineIds: notOrderedLines.map(l => l.lineId),
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
      context: { field: 'orderAssignmentReason', expectedValue: 'assigned', actualValue: 'not-ordered' },
    });
  }

  // 2. PROJ-21: order-incomplete — allocated qty < line.qty (partial assignment)
  const incompleteLines = updatedLines.filter(l => {
    if (l.allocatedOrders.length === 0) return false;
    const allocated = l.allocatedOrders.reduce((s, a) => s + a.qty, 0);
    return allocated > 0 && allocated < l.qty;
  });
  if (incompleteLines.length > 0) {
    issues.push({
      id: `issue-${runId}-step4-incomplete-${Date.now()}`,
      runId,
      severity: 'warning',
      stepNo: 4,
      type: 'order-incomplete',
      message: `${incompleteLines.length} Positionen nicht vollständig zugeordnet`,
      details: incompleteLines.slice(0, 15).map(l => {
        const allocated = l.allocatedOrders.reduce((s, a) => s + a.qty, 0);
        return `Pos ${l.positionIndex}: ${allocated}/${l.qty}`;
      }).join(', ') + (incompleteLines.length > 15 ? ` ... (+${incompleteLines.length - 15} weitere)` : ''),
      relatedLineIds: incompleteLines.map(l => l.lineId),
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
      context: { field: 'allocatedOrders', expectedValue: 'qty' },
    });
  }

  // 3. PROJ-21: order-multi-split — position split across 3+ orders
  const multiSplitLines = updatedLines.filter(l => l.allocatedOrders.length >= 3);
  if (multiSplitLines.length > 0) {
    issues.push({
      id: `issue-${runId}-step4-multi-split-${Date.now()}`,
      runId,
      severity: 'info',
      stepNo: 4,
      type: 'order-multi-split',
      message: `${multiSplitLines.length} Positionen auf 3+ Bestellungen aufgeteilt`,
      details: multiSplitLines.slice(0, 15).map(l =>
        `Pos ${l.positionIndex}: ${l.allocatedOrders.length} Bestellungen`
      ).join(', ') + (multiSplitLines.length > 15 ? ` ... (+${multiSplitLines.length - 15} weitere)` : ''),
      relatedLineIds: multiSplitLines.map(l => l.lineId),
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
      context: { field: 'allocatedOrders' },
    });
  }

  // 4. PROJ-21: order-fifo-only — position assigned exclusively via FIFO (no PDF reference)
  const fifoOnlyLines = updatedLines.filter(l =>
    l.allocatedOrders.length > 0 && l.allocatedOrders.every(a => a.reason === 'fifo-fallback')
  );
  if (fifoOnlyLines.length > 0) {
    issues.push({
      id: `issue-${runId}-step4-fifo-only-${Date.now()}`,
      runId,
      severity: 'info',
      stepNo: 4,
      type: 'order-fifo-only',
      message: `${fifoOnlyLines.length} Positionen nur via FIFO zugeordnet (keine PDF-Referenz)`,
      details: fifoOnlyLines.slice(0, 15).map(l =>
        `Pos ${l.positionIndex}: ${l.allocatedOrders.map(a => a.orderNumber).join('+')}`
      ).join(', ') + (fifoOnlyLines.length > 15 ? ` ... (+${fifoOnlyLines.length - 15} weitere)` : ''),
      relatedLineIds: fifoOnlyLines.map(l => l.lineId),
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
      context: { field: 'orderAssignmentReason', expectedValue: 'reference-match', actualValue: 'fifo-fallback' },
    });
  }

  return {
    lines: updatedLines,
    stats: {
      perfectMatchCount,
      referenceMatchCount,
      smartQtyMatchCount,
      fifoFallbackCount,
      matchedOrders: matchedOrderLines,
      notOrderedCount,
    },
    issues,
  };
}
