/**
 * OrderPool — PROJ-23 Phase A3 (ADDON: 2-of-3 Per-Article Scoring)
 *
 * Orders enter the pool only if they score >= 2 on the 3-field
 * cross-reference check (artNoDE, artNoIT, EAN) against a SINGLE
 * invoice article. Pool key = falmecArticleNo of the matched invoice
 * article (not the Excel artNoDE). Supports consume/return for
 * bidirectional manual reassignment.
 *
 * Composite key enforcement: All order references use YYYY-XXXXX format.
 *
 * @module services/matching/orderPool
 */

import type {
  ParsedOrderPosition,
  InvoiceLine,
  ArticleMaster,
  Issue,
} from '@/types';

// ── Interfaces ─────────────────────────────────────────────────────────

export interface OrderPoolEntry {
  position: ParsedOrderPosition;
  initialQty: number;       // Original openQuantity
  consumedQty: number;      // Consumed so far
  remainingQty: number;     // = initialQty - consumedQty
}

export interface OrderPool {
  /** falmecArticleNo → entries (sorted oldest-first: orderYear ASC, belegnummer ASC) */
  byArticle: Map<string, OrderPoolEntry[]>;
  /** position.id → entry (O(1) lookup for consume/return) */
  byId: Map<string, OrderPoolEntry>;
  /** Sum of all remainingQty across pool */
  totalRemaining: number;
}

/** Serializable snapshot for IndexedDB persistence. */
export interface SerializedOrderPool {
  entries: Array<{
    positionId: string;
    artNoDE: string;
    initialQty: number;
    consumedQty: number;
    remainingQty: number;
    position: ParsedOrderPosition;
  }>;
  totalRemaining: number;
}

// ── Build ──────────────────────────────────────────────────────────────

export interface BuildOrderPoolResult {
  pool: OrderPool;
  issues: Issue[];
  filteredInCount: number;   // Orders that passed the article filter
  filteredOutCount: number;  // Orders that were excluded
}

/**
 * Build an OrderPool from parsed orders using the "2 of 3" per-article
 * scoring filter. For each Excel order, we compare artNoDE/artNoIT/ean
 * against each unique invoice article's falmecArticleNo/manufacturerArticleNo/ean.
 * All 2+ points must come from the SAME invoice article (no Frankenstein matches).
 *
 * Pool key = falmecArticleNo of the matched invoice article (original case).
 * order.artNoDE is auto-healed to this key so MatchingEngine Run 1/2/3 work correctly.
 *
 * @param parsedOrders - All parsed order positions from orderParser
 * @param invoiceLines - Current invoice lines (after Step 2 matching)
 * @param masterArticles - Full article master for validation
 * @param runId - Current run ID for issue generation
 */
export function buildOrderPool(
  parsedOrders: ParsedOrderPosition[],
  invoiceLines: InvoiceLine[],
  masterArticles: ArticleMaster[],
  runId: string,
): BuildOrderPoolResult {
  // ── 1. Build unique invoice article reference list ──────────────────
  // Each ref has all 3 fields for per-article scoring.
  // falmecOriginalCase preserves the original case for Map keys.

  interface InvoiceArticleRef {
    falmecNorm: string;              // lowercase for comparison
    manufacturerArticleNoNorm: string; // lowercase for comparison
    eanNorm: string;                 // lowercase for comparison
  }

  const invoiceArticleRefs: InvoiceArticleRef[] = [];
  const seenFalmec = new Set<string>();
  const falmecOriginalCase = new Map<string, string>(); // lowercase → original

  for (const line of invoiceLines) {
    const falmecOrig = (line.falmecArticleNo ?? '').trim();
    const falmecNorm = falmecOrig.toLowerCase();
    if (!falmecNorm) continue;

    // Store original case mapping
    if (!falmecOriginalCase.has(falmecNorm)) {
      falmecOriginalCase.set(falmecNorm, falmecOrig);
    }

    // Deduplicate by falmecArticleNo
    if (seenFalmec.has(falmecNorm)) continue;
    seenFalmec.add(falmecNorm);

    invoiceArticleRefs.push({
      falmecNorm,
      manufacturerArticleNoNorm: (line.manufacturerArticleNo ?? '').trim().toLowerCase(),
      eanNorm: (line.ean ?? '').trim().toLowerCase(),
    });
  }

  // ── 2. Score each Excel order against invoice articles ─────────────
  const byArticle = new Map<string, OrderPoolEntry[]>();
  const byId = new Map<string, OrderPoolEntry>();
  const issues: Issue[] = [];
  const now = new Date().toISOString();
  let filteredInCount = 0;
  let filteredOutCount = 0;
  let totalRemaining = 0;

  // Build master lookup for validation
  const masterByArtNo = new Map<string, ArticleMaster>();
  for (const art of masterArticles) {
    if (art.falmecArticleNo) masterByArtNo.set(art.falmecArticleNo, art);
  }

  // Track orders with missing EAN+ArtNoIT for soft-fail warnings
  const missingIdOrders: string[] = [];

  for (const order of parsedOrders) {
    const orderArtNoDENorm = (order.artNoDE ?? '').trim().toLowerCase();
    const orderArtNoITNorm = (order.artNoIT ?? '').trim().toLowerCase();
    const orderEanNorm     = (order.ean ?? '').trim().toLowerCase();

    // Per-article scoring: find FIRST invoice article with score >= 2
    let matchedFalmecNorm: string | null = null;

    for (const ref of invoiceArticleRefs) {
      let score = 0;
      if (orderArtNoDENorm && orderArtNoDENorm === ref.falmecNorm)              score++;
      if (orderArtNoITNorm && orderArtNoITNorm === ref.manufacturerArticleNoNorm) score++;
      if (orderEanNorm     && orderEanNorm === ref.eanNorm)                     score++;

      if (score >= 2) {
        matchedFalmecNorm = ref.falmecNorm;
        break;
      }
    }

    if (!matchedFalmecNorm) {
      filteredOutCount++;
      continue;
    }

    filteredInCount++;

    // Resolve original-case pool key from the matched invoice article
    const groupKey = falmecOriginalCase.get(matchedFalmecNorm) ?? matchedFalmecNorm;

    // Auto-heal: update order.artNoDE to the matched falmecArticleNo
    // so MatchingEngine Run 1/2/3 find this order under the correct key
    order.artNoDE = groupKey;

    // Validation: check if order has at least EAN or ArtNoIT
    const hasEan = !!(order.ean ?? '').trim();
    const hasArtNoIT = !!(order.artNoIT ?? '').trim();
    if (!hasEan && !hasArtNoIT) {
      missingIdOrders.push(`${order.orderYear}-${order.orderNumber}`);
    }

    const entry: OrderPoolEntry = {
      position: order,
      initialQty: order.openQuantity,
      consumedQty: 0,
      remainingQty: order.openQuantity,
    };

    // Add to byArticle map (key = falmecArticleNo original case)
    const existing = byArticle.get(groupKey) ?? [];
    existing.push(entry);
    byArticle.set(groupKey, existing);

    // Add to byId map
    byId.set(order.id, entry);

    totalRemaining += order.openQuantity;
  }

  // Sort each article's entries oldest-first
  for (const entries of byArticle.values()) {
    entries.sort((a, b) => {
      if (a.position.orderYear !== b.position.orderYear) {
        return a.position.orderYear - b.position.orderYear;
      }
      return a.position.belegnummer.localeCompare(b.position.belegnummer);
    });
  }

  // Emit soft-fail warning for orders missing both EAN and ArtNoIT
  if (missingIdOrders.length > 0) {
    issues.push({
      id: `issue-${runId}-pool-missing-ids-${Date.now()}`,
      runId,
      severity: 'warning',
      stepNo: 4,
      type: 'order-no-match',
      message: `${missingIdOrders.length} Bestellpositionen ohne EAN und Herstellerartikelnr.`,
      details: `${missingIdOrders.length} Bestellpositionen ohne EAN und Herstellerartikelnr.`,
      relatedLineIds: [],
      affectedLineIds: [],
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
    });
  }

  const pool: OrderPool = { byArticle, byId, totalRemaining };

  console.debug(
    `[OrderPool] 2-of-3 per-article filter: ${filteredInCount} in, ${filteredOutCount} out, ` +
    `${byArticle.size} articles, ${totalRemaining} total remaining qty | ` +
    `Invoice refs: ${invoiceArticleRefs.length} unique articles`
  );

  return { pool, issues, filteredInCount, filteredOutCount };
}

// ── Consume / Return ───────────────────────────────────────────────────

/**
 * Consume qty from a specific order position in the pool.
 * Decrements remainingQty, increments consumedQty.
 *
 * @returns true if consumption succeeded, false if insufficient remaining
 */
export function consumeFromPool(
  pool: OrderPool,
  positionId: string,
  qty: number,
): boolean {
  const entry = pool.byId.get(positionId);
  if (!entry) {
    console.warn(`[OrderPool] consumeFromPool: position ${positionId} not found`);
    return false;
  }

  if (entry.remainingQty < qty) {
    console.warn(
      `[OrderPool] consumeFromPool: insufficient qty for ${positionId} ` +
      `(remaining: ${entry.remainingQty}, requested: ${qty})`
    );
    return false;
  }

  entry.consumedQty += qty;
  entry.remainingQty -= qty;
  pool.totalRemaining -= qty;
  return true;
}

/**
 * Return qty back to a specific order position in the pool.
 * Increments remainingQty, decrements consumedQty.
 * Used for bidirectional manual reassignment.
 *
 * @returns true if return succeeded, false if would exceed initialQty
 */
export function returnToPool(
  pool: OrderPool,
  positionId: string,
  qty: number,
): boolean {
  const entry = pool.byId.get(positionId);
  if (!entry) {
    console.warn(`[OrderPool] returnToPool: position ${positionId} not found`);
    return false;
  }

  if (entry.consumedQty < qty) {
    console.warn(
      `[OrderPool] returnToPool: consumed qty too low for ${positionId} ` +
      `(consumed: ${entry.consumedQty}, returning: ${qty})`
    );
    return false;
  }

  entry.consumedQty -= qty;
  entry.remainingQty += qty;
  pool.totalRemaining += qty;
  return true;
}

// ── Serialization ──────────────────────────────────────────────────────

/**
 * Serialize the OrderPool for IndexedDB persistence.
 * Maps are not directly serializable — convert to flat arrays.
 */
export function serializeOrderPool(pool: OrderPool): SerializedOrderPool {
  const entries: SerializedOrderPool['entries'] = [];

  for (const [artNoDE, poolEntries] of pool.byArticle) {
    for (const entry of poolEntries) {
      entries.push({
        positionId: entry.position.id,
        artNoDE,
        initialQty: entry.initialQty,
        consumedQty: entry.consumedQty,
        remainingQty: entry.remainingQty,
        position: entry.position,
      });
    }
  }

  return { entries, totalRemaining: pool.totalRemaining };
}

/**
 * Deserialize an OrderPool from IndexedDB data.
 */
export function deserializeOrderPool(data: SerializedOrderPool): OrderPool {
  const byArticle = new Map<string, OrderPoolEntry[]>();
  const byId = new Map<string, OrderPoolEntry>();

  for (const raw of data.entries) {
    const entry: OrderPoolEntry = {
      position: raw.position,
      initialQty: raw.initialQty,
      consumedQty: raw.consumedQty,
      remainingQty: raw.remainingQty,
    };

    const existing = byArticle.get(raw.artNoDE) ?? [];
    existing.push(entry);
    byArticle.set(raw.artNoDE, existing);

    byId.set(raw.positionId, entry);
  }

  return {
    byArticle,
    byId,
    totalRemaining: data.totalRemaining,
  };
}

/**
 * Get remaining pool entries for a specific article (for ManualOrderPopup dropdown).
 * Returns entries with remainingQty > 0, sorted oldest-first.
 */
export function getAvailableForArticle(
  pool: OrderPool,
  artNoDE: string,
): OrderPoolEntry[] {
  const entries = pool.byArticle.get(artNoDE) ?? [];
  return entries.filter(e => e.remainingQty > 0);
}
