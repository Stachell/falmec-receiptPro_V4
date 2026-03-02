/**
 * Run 2 — Partial Fillup (Aggregated)
 *
 * PROJ-23 Phase A4: Second pass of the 3-Run Matching Engine.
 * Operates on AGGREGATED invoice lines (qty > 1 possible).
 *
 * Two strategies:
 *   A. Reference Match: PDF orderCandidates match pool entries, but qty differs.
 *      Fill from matching refs with partial allocation (consume available qty).
 *   B. Smart Qty Match: No PDF candidates, but exactly ONE pool entry with
 *      remainingQty === line's remaining qty.
 *
 * @module services/matching/runs/run2PartialFillup
 */

import type {
  InvoiceLine,
  AllocatedOrder,
  OrderAssignmentReason,
  ParsedInvoiceLineExtended,
} from '@/types';
import type { OrderPool } from '../orderPool';
import { consumeFromPool } from '../orderPool';

export interface Run2Result {
  /** Updated aggregated lines */
  lines: InvoiceLine[];
  /** Number of reference-based partial allocations */
  referenceMatchCount: number;
  /** Number of smart-qty matches */
  smartQtyMatchCount: number;
}

/**
 * Run 2: Partial Fillup on aggregated positions.
 *
 * Processes lines that are still pending (or partially allocated from Run 1
 * if that only covered part of the qty — though Run 1 only does exact matches).
 */
export function run2PartialFillup(
  lines: InvoiceLine[],
  pool: OrderPool,
  parsedPositions: ParsedInvoiceLineExtended[],
): Run2Result {
  // Build positionIndex → orderCandidates lookup
  const candidatesMap = new Map<number, string[]>();
  for (const pos of parsedPositions) {
    candidatesMap.set(pos.positionIndex, pos.orderCandidates ?? []);
  }

  let referenceMatchCount = 0;
  let smartQtyMatchCount = 0;

  const updatedLines = lines.map(line => {
    // Skip lines that are fully assigned
    if (line.orderAssignmentReason !== 'pending') return line;

    const artNoDE = (line.falmecArticleNo ?? '').trim();
    if (!artNoDE) return line;

    const poolEntries = pool.byArticle.get(artNoDE) ?? [];
    if (poolEntries.length === 0) return line;

    const orderCandidates = candidatesMap.get(line.positionIndex) ?? [];
    const allocations: AllocatedOrder[] = [...line.allocatedOrders];
    let remainingQty = line.qty - allocations.reduce((s, a) => s + a.qty, 0);

    // Strategy A: Reference Match — PDF candidates with partial qty
    if (orderCandidates.length > 0 && remainingQty > 0) {
      for (const candidateRef of orderCandidates) {
        if (remainingQty <= 0) break;

        const ref5 = candidateRef.replace(/\D/g, '').slice(-5);
        if (!ref5) continue;

        // Find all matching pool entries (sorted oldest-first already)
        const matchingEntries = poolEntries.filter(entry => {
          const opRef5 = entry.position.orderNumber.slice(-5);
          return opRef5 === ref5 && entry.remainingQty > 0;
        });

        for (const entry of matchingEntries) {
          if (remainingQty <= 0) break;
          const take = Math.min(remainingQty, entry.remainingQty);
          if (take <= 0) continue;

          consumeFromPool(pool, entry.position.id, take);
          allocations.push({
            orderNumber: `${entry.position.orderYear}-${entry.position.orderNumber}`,
            orderYear: entry.position.orderYear,
            qty: take,
            reason: 'reference-match' as OrderAssignmentReason,
            vorgang: entry.position.vorgang || undefined,
          });
          remainingQty -= take;
          referenceMatchCount++;
        }
      }
    }

    // Strategy B: Smart Qty Match — exactly ONE pool entry with remaining === remaining qty
    if (remainingQty > 0) {
      const exactMatches = poolEntries.filter(e => e.remainingQty === remainingQty);
      if (exactMatches.length === 1) {
        const entry = exactMatches[0];
        consumeFromPool(pool, entry.position.id, remainingQty);
        allocations.push({
          orderNumber: `${entry.position.orderYear}-${entry.position.orderNumber}`,
          orderYear: entry.position.orderYear,
          qty: remainingQty,
          reason: 'smart-qty-match' as OrderAssignmentReason,
          vorgang: entry.position.vorgang || undefined,
        });
        remainingQty -= remainingQty;
        smartQtyMatchCount++;
      }
    }

    // If allocations were made, update the line
    if (allocations.length > 0) {
      const firstAlloc = allocations[0];
      const overallReason = firstAlloc.reason;

      return {
        ...line,
        allocatedOrders: allocations,
        orderAssignmentReason: overallReason,
        orderNumberAssigned: firstAlloc.orderNumber,
        orderYear: firstAlloc.orderYear,
        orderCode: firstAlloc.orderNumber.split('-').pop() ?? null,
        orderVorgang: firstAlloc.vorgang ?? null,
      };
    }

    return line;
  });

  console.debug(`[Run2] Reference matches: ${referenceMatchCount}, Smart-qty matches: ${smartQtyMatchCount}`);
  return { lines: updatedLines, referenceMatchCount, smartQtyMatchCount };
}
