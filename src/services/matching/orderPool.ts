/**
 * OrderPool — PROJ-23 Phase A3
 *
 * Article-First order filtering: only orders whose artNoDE matches
 * an invoice article enter the pool. Supports consume/return for
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
  /** artNoDE → entries (sorted oldest-first: orderYear ASC, belegnummer ASC) */
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
 * Build an OrderPool from parsed orders, filtering to only those whose
 * artNoDE matches an invoice article's falmecArticleNo.
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
  // 1. Collect all falmecArticleNo values from invoice lines (from Step 2 matching)
  const invoiceArticleNos = new Set<string>();
  for (const line of invoiceLines) {
    const artNo = (line.falmecArticleNo ?? '').trim();
    if (artNo) invoiceArticleNos.add(artNo);
  }

  // 2. Filter parsedOrders: only those where artNoDE matches an invoice article
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
    const artNoDE = (order.artNoDE ?? '').trim();

    // Article-First filter: skip orders not matching any invoice article
    if (!artNoDE || !invoiceArticleNos.has(artNoDE)) {
      filteredOutCount++;
      continue;
    }

    filteredInCount++;

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

    // Add to byArticle map
    const existing = byArticle.get(artNoDE) ?? [];
    existing.push(entry);
    byArticle.set(artNoDE, existing);

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
      details: missingIdOrders.slice(0, 20).join(', ') +
        (missingIdOrders.length > 20 ? ` ... (+${missingIdOrders.length - 20} weitere)` : ''),
      relatedLineIds: [],
      status: 'open',
      createdAt: now,
      resolvedAt: null,
      resolutionNote: null,
    });
  }

  const pool: OrderPool = { byArticle, byId, totalRemaining };

  console.debug(
    `[OrderPool] Built pool: ${filteredInCount} orders in, ${filteredOutCount} filtered out, ` +
    `${byArticle.size} articles, ${totalRemaining} total remaining qty`
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
