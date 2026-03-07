/**
 * OrderMatcher – PROJ-11 Phase C
 *
 * 3-rule priority system for matching expanded invoice lines against open order positions.
 * Tracks consumed quantities to prevent double-assignment.
 *
 * Rules (priority order):
 *   1. Exact qty match – openQty matches the number of pending lines for this article
 *   2. Oldest first – sort by orderYear ASC, belegnummer ASC
 *   3. No match – mark as 'not-ordered'
 */

import type { InvoiceLine, OpenWEPosition, OrderAssignmentReason } from '@/types';

export interface OrderMatchResult {
  orderNumberAssigned: string | null;
  orderYear: number | null;
  orderCode: string | null;
  orderVorgang: string | null;
  orderOpenQty: number | null;
  supplierId: string | null;
  orderAssignmentReason: OrderAssignmentReason;
}

/**
 * Match all expanded invoice lines against open order positions.
 *
 * Consumption tracking: each OpenWEPosition's openQty is decremented as lines
 * are assigned. Lines sharing the same article are processed together so that
 * the "exact qty match" rule can compare against group size.
 */
export function matchAllOrders(
  lines: InvoiceLine[],
  openPositions: OpenWEPosition[]
): InvoiceLine[] {
  // Consumption tracker: how many units of each OpenWEPosition have been consumed
  const consumed = new Map<string, number>();

  const result = [...lines];

  for (let i = 0; i < result.length; i++) {
    const line = result[i];

    // Skip lines that already have an order assignment (e.g. manual)
    if (line.orderAssignmentReason !== 'pending') continue;

    // Find matching open positions for this article (by code or EAN)
    const candidates = findCandidates(line, openPositions, consumed);

    if (candidates.length === 0) {
      // Rule 3: no matching order found
      result[i] = { ...line, orderAssignmentReason: 'not-ordered' };
      continue;
    }

    // Count how many pending lines remain for this same article
    const pendingForArticle = result.filter(
      l =>
        l.orderAssignmentReason === 'pending' &&
        (l.manufacturerArticleNo === line.manufacturerArticleNo ||
          (l.ean && l.ean === line.ean))
    ).length;

    // Rule 1: check for exact qty match
    const exactMatch = candidates.find(op => {
      const remaining = op.openQty - (consumed.get(op.id) ?? 0);
      return remaining === pendingForArticle;
    });

    // Fallback to Rule 2: oldest first (candidates are already sorted)
    const chosen = exactMatch ?? candidates[0];

    // Consume 1 unit from the chosen position
    consumed.set(chosen.id, (consumed.get(chosen.id) ?? 0) + 1);

    // Extract order code (last 5 digits of belegnummer)
    const orderCode = extractOrderCode(chosen.belegnummer);

    result[i] = {
      ...line,
      orderNumberAssigned: `${chosen.orderYear}-${orderCode}`,
      orderYear: chosen.orderYear,
      orderCode,
      orderVorgang: chosen.vorgang,
      orderOpenQty: chosen.openQty,
      supplierId: chosen.supplierId || line.supplierId,
      orderAssignmentReason: exactMatch ? 'exact-qty-match' : 'oldest-first',
    };
  }

  return result;
}

/**
 * Find candidate OpenWE positions for a given line.
 * Filters by article match (code or EAN), remaining capacity, and sorts oldest-first.
 */
function findCandidates(
  line: InvoiceLine,
  openPositions: OpenWEPosition[],
  consumed: Map<string, number>
): OpenWEPosition[] {
  return openPositions
    .filter(op => {
      // Match by manufacturer article number or EAN
      const codeMatch =
        line.manufacturerArticleNo &&
        op.manufacturerArticleNo === line.manufacturerArticleNo;
      const eanMatch = line.ean && op.ean && op.ean === line.ean;
      return codeMatch || eanMatch;
    })
    .filter(op => {
      // Only positions with remaining open quantity
      const used = consumed.get(op.id) ?? 0;
      return op.openQty - used > 0;
    })
    .sort((a, b) => {
      // Rule 2: oldest first (year ASC, then belegnummer ASC)
      if (a.orderYear !== b.orderYear) return a.orderYear - b.orderYear;
      return a.belegnummer.localeCompare(b.belegnummer);
    });
}

/**
 * Extract the 5-digit order code from a belegnummer.
 * If belegnummer is shorter than 5 chars, return as-is.
 */
function extractOrderCode(belegnummer: string): string {
  return belegnummer.length >= 5
    ? belegnummer.slice(-5)
    : belegnummer;
}
