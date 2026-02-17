/**
 * Extended Order Recognition — Addon for Fattura Parser v2
 *
 * Adds two capabilities without modifying the core parser:
 * 1. Extended Y-corridor (±15px) for "Vs. ORDINE" lines that fall outside the 5px row grouping
 * 2. Type-B recognition for 9xxxx order numbers (Sonderbuchungen) with soft-fail warnings
 *
 * Design: Pure functions, no side effects. Existing core results have priority.
 */

import type { ExtractedTextItem } from './pdfTextExtractor';
import type { ParsedInvoiceLine, ParserWarning } from '../types';

// ─── Types ───────────────────────────────────────────────────────────

export type OrderNumberType = 'A' | 'B';

export interface ClassifiedOrder {
  number: string;
  type: OrderNumberType;
}

// ─── Constants ───────────────────────────────────────────────────────

/** Extended corridor for order reference scanning (px) */
const ORDER_SCAN_CORRIDOR = 15;

/** Regex: Typ A — standard 10xxx orders */
const TYPE_A_PATTERN = /\b(10\d{3})\b/g;

/** Regex: Typ B — 9xxxx Sonderbuchung orders */
const TYPE_B_PATTERN = /\b(9\d{4})\b/g;

/** Underscore-encoded order block pattern */
const UNDERSCORE_PATTERN = /(\d+(?:_\d+)+)/;

/** "Vs. ORDINE" marker */
const ORDINE_MARKER = /Vs\.\s*ORDINE/i;

// ─── Core Functions ──────────────────────────────────────────────────

/**
 * Extended order reference extraction with type classification.
 * Supports both 10xxx (Typ A) and 9xxxx (Typ B), including underscore format.
 *
 * @param line - Text line containing "Vs. ORDINE"
 * @returns Classified orders with deduplication
 */
export function extractOrderReferencesExtended(line: string): ClassifiedOrder[] {
  const seen = new Set<string>();
  const results: ClassifiedOrder[] = [];

  function add(num: string, type: OrderNumberType) {
    if (!seen.has(num)) {
      seen.add(num);
      results.push({ number: num, type });
    }
  }

  // ── Underscore format: e.g. "0_10170_173_172" or "0_90100_101_102" ──
  const underscoreMatch = line.match(UNDERSCORE_PATTERN);
  if (underscoreMatch) {
    const parts = underscoreMatch[1].split('_');
    let basePrefix = '';
    for (const part of parts) {
      if (part.length === 5 && /^10\d{3}$/.test(part)) {
        add(part, 'A');
        basePrefix = part.slice(0, 2); // "10"
      } else if (part.length === 5 && /^9\d{4}$/.test(part)) {
        add(part, 'B');
        basePrefix = part.slice(0, 2); // "9x" prefix (2 chars)
      } else if (part.length === 3 && basePrefix) {
        const expanded = basePrefix + part;
        const type: OrderNumberType = basePrefix.startsWith('9') ? 'B' : 'A';
        add(expanded, type);
      }
    }
  }

  // ── Standalone 10xxx (Typ A) ──
  let m: RegExpExecArray | null;
  const typeARegex = new RegExp(TYPE_A_PATTERN.source, 'g');
  while ((m = typeARegex.exec(line)) !== null) {
    add(m[1], 'A');
  }

  // ── Standalone 9xxxx (Typ B) — only if "Vs. ORDINE" present ──
  if (ORDINE_MARKER.test(line)) {
    const typeBRegex = new RegExp(TYPE_B_PATTERN.source, 'g');
    while ((m = typeBRegex.exec(line)) !== null) {
      add(m[1], 'B');
    }
  }

  return results;
}

/**
 * Scan body items for "Vs. ORDINE" text within an extended Y-corridor (±15px)
 * around each PZ row Y-coordinate.
 *
 * @param bodyItems - All extracted text items from the body zone (single page)
 * @param pzRowYs - Y-coordinates of PZ-anchored rows
 * @param buffer - Corridor buffer in px (default: 15)
 * @returns Map of pzRowY → classified orders found in corridor
 */
export function scanExtendedOrderCorridor(
  bodyItems: ExtractedTextItem[],
  pzRowYs: number[],
  buffer: number = ORDER_SCAN_CORRIDOR,
): Map<number, ClassifiedOrder[]> {
  const result = new Map<number, ClassifiedOrder[]>();
  if (bodyItems.length === 0) return result;

  // Group items into Y-rows (±5px) to reconstruct row text
  const rows = groupByY(bodyItems, 5);

  // Find rows whose combined text contains the "Vs. ORDINE" marker
  const ordineRows = rows.filter(row => ORDINE_MARKER.test(row.text));
  if (ordineRows.length === 0) return result;

  for (const ordineRow of ordineRows) {
    const orders = extractOrderReferencesExtended(ordineRow.text);
    if (orders.length === 0) continue;

    // Associate with PZ rows within the corridor
    for (const pzY of pzRowYs) {
      // Ordine should be ABOVE the PZ row (higher Y in pdfjs)
      const delta = ordineRow.y - pzY;
      if (delta > 0 && delta <= buffer) {
        const existing = result.get(pzY) ?? [];
        for (const order of orders) {
          if (!existing.some(e => e.number === order.number)) {
            existing.push(order);
          }
        }
        result.set(pzY, existing);
      }
    }
  }

  return result;
}

/**
 * Enrich already-parsed invoice lines with extended order corridor data.
 * Core parser results have priority — only fills empty orderCandidates.
 *
 * @param lines - Parsed invoice lines from core parser
 * @param allBodyItems - All body items collected across pages (with page context)
 * @param existingOrderRefs - Order refs already found by core parser (y + orders)
 * @returns Enriched lines + Typ-B warnings
 */
export function enrichOrderCandidates(
  lines: ParsedInvoiceLine[],
  allBodyItems: Array<{ pageNumber: number; items: ExtractedTextItem[] }>,
  existingOrderRefs: Array<{ pageNumber: number; y: number; orders: string[] }>,
): { enrichedLines: ParsedInvoiceLine[]; warnings: ParserWarning[] } {
  const warnings: ParserWarning[] = [];
  const enrichedLines = lines.map(line => ({ ...line }));

  // ── Pass 1: Classify existing orderCandidates for Typ-B warnings ──
  for (const line of enrichedLines) {
    if (line.orderCandidates.length > 0) {
      const classified = classifyOrders(line.orderCandidates);
      const hasTypeA = classified.some(c => c.type === 'A');
      const typeBOrders = classified.filter(c => c.type === 'B');

      if (!hasTypeA && typeBOrders.length > 0) {
        // Only Typ B → emit warning
        warnings.push(buildTypeBWarning(line.positionIndex, typeBOrders.map(o => o.number)));
      } else if (hasTypeA && typeBOrders.length > 0) {
        // Mixed: keep only Typ A
        line.orderCandidates = classified
          .filter(c => c.type === 'A')
          .map(c => c.number);
        line.orderCandidatesText = line.orderCandidates.join('|');
        line.orderStatus = line.orderCandidates.length === 1 ? 'YES' : 'check';
      }
    }
  }

  // ── Pass 2: Extended corridor scan for lines without orderCandidates ──
  for (const pageData of allBodyItems) {
    const pageItems = pageData.items;
    const pageNumber = pageData.pageNumber;

    // Find PZ rows on this page that have no orderCandidates
    const linesOnPage = enrichedLines.filter(line => {
      // Match lines to pages via rawPositionText — find the item Y
      // We need the Y position from the raw items; use approximate matching
      return line.orderCandidates.length === 0;
    });

    if (linesOnPage.length === 0) continue;

    // Get PZ row Ys from the page items
    const pzRowYs: number[] = [];
    for (const item of pageItems) {
      if (/\bPZ\b/i.test(item.text)) {
        pzRowYs.push(item.y);
      }
    }

    if (pzRowYs.length === 0) continue;

    // Check if existing order refs already cover these PZ rows (within 5px)
    const pageOrderRefs = existingOrderRefs.filter(r => r.pageNumber === pageNumber);

    const corridorResults = scanExtendedOrderCorridor(pageItems, pzRowYs);

    for (const [pzY, orders] of corridorResults) {
      // Skip if core parser already found orders for this PZ row
      const alreadyCovered = pageOrderRefs.some(
        ref => Math.abs(ref.y - pzY) <= ORDER_SCAN_CORRIDOR &&
               ref.orders.length > 0,
      );
      if (alreadyCovered) continue;

      // Apply priority: Typ A over Typ B
      const typeAOrders = orders.filter(o => o.type === 'A');
      const typeBOrders = orders.filter(o => o.type === 'B');

      const finalOrders = typeAOrders.length > 0 ? typeAOrders : typeBOrders;
      const orderNumbers = finalOrders.map(o => o.number);

      // Find the matching line by PZ Y proximity
      // (We match against lines that don't yet have orderCandidates)
      for (const line of enrichedLines) {
        if (line.orderCandidates.length > 0) continue;

        // Check if this line's rawPositionText matches a PZ item near pzY
        const matchingPzItem = pageItems.find(
          item => /\bPZ\b/i.test(item.text) &&
                  Math.abs(item.y - pzY) <= 5 &&
                  line.rawPositionText?.includes(item.text),
        );

        if (matchingPzItem) {
          line.orderCandidates = orderNumbers;
          line.orderCandidatesText = orderNumbers.join('|');
          line.orderStatus = orderNumbers.length === 1 ? 'YES' : 'check';

          if (typeAOrders.length === 0 && typeBOrders.length > 0) {
            warnings.push(buildTypeBWarning(line.positionIndex, orderNumbers));
          }
          break;
        }
      }
    }
  }

  return { enrichedLines, warnings };
}

/**
 * Build a soft-fail warning for Typ-B order numbers detected.
 */
export function buildTypeBWarning(positionIndex: number, orders: string[]): ParserWarning {
  return {
    code: 'ORDER_TYPE_B_DETECTED',
    message: `Position ${positionIndex}: Sonderbuchungs-Bestellnummer(n) erkannt: ${orders.join(', ')}`,
    severity: 'warning',
    positionIndex,
    context: { orderNumbers: orders, orderType: 'B' },
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────

/**
 * Classify existing order number strings into Typ A/B.
 */
function classifyOrders(orderNumbers: string[]): ClassifiedOrder[] {
  return orderNumbers.map(num => ({
    number: num,
    type: /^10\d{3}$/.test(num) ? 'A' as const : /^9\d{4}$/.test(num) ? 'B' as const : 'A' as const,
  }));
}

/**
 * Group items by Y-coordinate into rows (±tolerance).
 * Returns rows with average Y and combined text.
 */
function groupByY(
  items: ExtractedTextItem[],
  tolerance: number,
): Array<{ y: number; text: string }> {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: Array<{ y: number; items: ExtractedTextItem[] }> = [];
  let currentY = sorted[0].y;
  let currentItems: ExtractedTextItem[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    if (Math.abs(item.y - currentY) <= tolerance) {
      currentItems.push(item);
    } else {
      rows.push({
        y: currentItems.reduce((sum, it) => sum + it.y, 0) / currentItems.length,
        items: currentItems,
      });
      currentY = item.y;
      currentItems = [item];
    }
  }
  rows.push({
    y: currentItems.reduce((sum, it) => sum + it.y, 0) / currentItems.length,
    items: currentItems,
  });

  return rows.map(row => ({
    y: row.y,
    text: row.items
      .sort((a, b) => a.x - b.x)
      .map(it => it.text)
      .join(' '),
  }));
}
