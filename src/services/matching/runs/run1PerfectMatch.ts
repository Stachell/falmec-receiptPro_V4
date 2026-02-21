/**
 * Run 1 — Perfect Match (Aggregated)
 *
 * PROJ-23 Phase A4: First pass of the 3-Run Matching Engine.
 * Operates on AGGREGATED invoice lines (qty > 1 possible).
 *
 * Match condition:
 *   - PDF orderCandidate matches a pool entry's orderNumber (last 5 digits)
 *   - AND pool entry's remainingQty === line.qty (exact quantity match)
 *
 * Oldest-first: If duplicate order numbers exist across years
 * (e.g. 2024-10153 and 2025-10153), always consume the oldest year first.
 *
 * @module services/matching/runs/run1PerfectMatch
 */

import type {
  InvoiceLine,
  AllocatedOrder,
  OrderAssignmentReason,
  ParsedInvoiceLineExtended,
} from '@/types';
import type { OrderPool, OrderPoolEntry } from '../orderPool';
import { consumeFromPool } from '../orderPool';

export interface Run1Result {
  /** Updated aggregated lines (with allocatedOrders set for perfect matches) */
  lines: InvoiceLine[];
  /** Number of perfect matches found */
  perfectMatchCount: number;
}

/**
 * Run 1: Perfect Match on aggregated positions.
 *
 * For each aggregated line with pending order assignment:
 *   1. Look up PDF orderCandidates for this position
 *   2. For each candidate, find pool entries matching the last 5 digits
 *   3. If a pool entry has remainingQty === line.qty → consume & assign
 *   4. On duplicate refs: oldest year wins (pool entries are pre-sorted)
 */
export function run1PerfectMatch(
  lines: InvoiceLine[],
  pool: OrderPool,
  parsedPositions: ParsedInvoiceLineExtended[],
): Run1Result {
  // Build positionIndex → orderCandidates lookup
  const candidatesMap = new Map<number, string[]>();
  for (const pos of parsedPositions) {
    candidatesMap.set(pos.positionIndex, pos.orderCandidates ?? []);
  }

  let perfectMatchCount = 0;

  const updatedLines = lines.map(line => {
    // Skip lines that already have an order assignment
    if (line.orderAssignmentReason !== 'pending') return line;

    const orderCandidates = candidatesMap.get(line.positionIndex) ?? [];
    if (orderCandidates.length === 0) return line;

    // Find pool entries for this article
    const artNoDE = (line.falmecArticleNo ?? '').trim();
    if (!artNoDE) return line;

    const poolEntries = pool.byArticle.get(artNoDE) ?? [];
    if (poolEntries.length === 0) return line;

    // Try each PDF candidate for a perfect match
    for (const candidateRef of orderCandidates) {
      const ref5 = candidateRef.replace(/\D/g, '').slice(-5);
      if (!ref5) continue;

      // Find matching pool entry: ref matches AND remaining === qty
      // Pool entries are sorted oldest-first, so first match = oldest year
      const matchEntry = poolEntries.find(entry => {
        const opRef5 = entry.position.orderNumber.slice(-5);
        return opRef5 === ref5 && entry.remainingQty === line.qty;
      });

      if (matchEntry) {
        consumeFromPool(pool, matchEntry.position.id, line.qty);
        perfectMatchCount++;

        const allocation: AllocatedOrder = {
          orderNumber: `${matchEntry.position.orderYear}-${matchEntry.position.orderNumber}`,
          orderYear: matchEntry.position.orderYear,
          qty: line.qty,
          reason: 'perfect-match' as OrderAssignmentReason,
        };

        return {
          ...line,
          allocatedOrders: [allocation],
          orderAssignmentReason: 'perfect-match' as OrderAssignmentReason,
          orderNumberAssigned: allocation.orderNumber,
          orderYear: allocation.orderYear,
          orderCode: matchEntry.position.orderNumber,
        };
      }
    }

    return line;
  });

  console.debug(`[Run1] Perfect matches: ${perfectMatchCount}`);
  return { lines: updatedLines, perfectMatchCount };
}
