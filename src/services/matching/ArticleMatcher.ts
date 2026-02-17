/**
 * ArticleMatcher – PROJ-11 Phase B
 *
 * Stateless matching of InvoiceLines against ArticleMaster[].
 * Computes MatchStatus (5 states) and PriceCheckStatus per line.
 *
 * NULL-SAFETY: All field access is guarded against null/undefined/empty-string.
 * Lines with no article number AND no EAN get 'no-match' without crashing.
 */

import type {
  InvoiceLine,
  ArticleMaster,
  MatchStatus,
  PriceCheckStatus,
} from '@/types';

export interface ArticleMatchResult {
  matchStatus: MatchStatus;
  falmecArticleNo: string | null;
  descriptionDE: string | null;
  unitPriceSage: number | null;
  serialRequired: boolean;
  activeFlag: boolean;
  storageLocation: string | null;
  supplierId: string | null;
  priceCheckStatus: PriceCheckStatus;
  unitPriceFinal: number | null;
}

/** No-match result constant to avoid re-creating the object on every call */
const NO_MATCH_RESULT: ArticleMatchResult = {
  matchStatus: 'no-match',
  falmecArticleNo: null,
  descriptionDE: null,
  unitPriceSage: null,
  serialRequired: false,
  activeFlag: true,
  storageLocation: null,
  supplierId: null,
  priceCheckStatus: 'missing',
  unitPriceFinal: null,
};

/**
 * Match a single InvoiceLine against the article master catalog.
 *
 * Priority: manufacturerArticleNo match takes precedence over EAN-only match
 * when both resolve to different catalog entries.
 *
 * SAFE: handles null, undefined, empty-string for both articleNo and EAN.
 */
export function matchArticle(
  line: InvoiceLine,
  articles: ArticleMaster[],
  tolerance: number
): ArticleMatchResult {
  if (!line || !Array.isArray(articles)) {
    console.warn('[ArticleMatcher] Invalid input: line or articles missing');
    return { ...NO_MATCH_RESULT };
  }

  // Coerce to trimmed strings — guards against null/undefined/number
  const lineCode = String(line.manufacturerArticleNo ?? '').trim();
  const lineEan = String(line.ean ?? '').trim();

  // GUARD: Both identifiers empty → no-match immediately (e.g. Pos 14,25,34,41,42)
  if (!lineCode && !lineEan) {
    return { ...NO_MATCH_RESULT };
  }

  // 1. Look up by manufacturer article number (Artikel-# IT)
  //    Only search if we have a non-empty code
  const byCode = lineCode
    ? articles.find(a => String(a?.manufacturerArticleNo ?? '').trim() === lineCode)
    : undefined;

  // 2. Look up by EAN — only if non-empty
  const byEan = lineEan
    ? articles.find(a => String(a?.ean ?? '').trim() === lineEan)
    : undefined;

  // 3. Determine MatchStatus
  let matchStatus: MatchStatus;
  let matchedArticle: ArticleMaster | undefined;

  if (byCode && byEan) {
    matchStatus = 'full-match';
    matchedArticle = byCode; // Code-match has priority for master data
  } else if (byCode) {
    matchStatus = 'code-it-only';
    matchedArticle = byCode;
  } else if (byEan) {
    matchStatus = 'ean-only';
    matchedArticle = byEan;
  } else {
    matchStatus = 'no-match';
  }

  // 4. No match → return early with missing status
  if (!matchedArticle) {
    return { ...NO_MATCH_RESULT, matchStatus };
  }

  // 5. Price check with tolerance — guard against non-finite values
  const invoicePrice = Number.isFinite(line?.unitPriceInvoice) ? line.unitPriceInvoice : 0;
  const sagePrice = Number.isFinite(matchedArticle?.unitPriceNet) ? matchedArticle.unitPriceNet : 0;
  const priceCheckStatus = checkPrice(invoicePrice, sagePrice, tolerance);

  return {
    matchStatus,
    falmecArticleNo: matchedArticle?.falmecArticleNo ?? null,
    descriptionDE: null, // ArticleMaster doesn't carry descriptionDE currently
    unitPriceSage: sagePrice || null,
    serialRequired: matchedArticle?.serialRequirement ?? false,
    activeFlag: matchedArticle?.activeFlag ?? true,
    storageLocation: matchedArticle?.storageLocation ?? null,
    supplierId: null, // comes from OpenWE, not ArticleMaster
    priceCheckStatus,
    unitPriceFinal: priceCheckStatus === 'ok' ? invoicePrice : null,
  };
}

/**
 * Price check with tolerance (inclusive bounds).
 * Returns 'missing' if either price is <= 0 or non-finite.
 */
export function checkPrice(
  invoicePrice: number,
  sagePrice: number,
  tolerance: number
): PriceCheckStatus {
  if (!Number.isFinite(invoicePrice) || invoicePrice <= 0) return 'missing';
  if (!Number.isFinite(sagePrice) || sagePrice <= 0) return 'missing';
  const diff = Math.abs(invoicePrice - sagePrice);
  return diff <= tolerance ? 'ok' : 'mismatch';
}

/**
 * Batch-match all invoice lines against the article master catalog.
 * Returns a new array with updated match/price fields.
 *
 * SAFE: catches per-line errors so one bad line doesn't crash the whole batch.
 */
export function matchAllArticles(
  lines: InvoiceLine[],
  articles: ArticleMaster[],
  tolerance: number
): InvoiceLine[] {
  if (!Array.isArray(lines)) {
    console.error('[ArticleMatcher] matchAllArticles: lines is not an array');
    return [];
  }
  if (!Array.isArray(articles)) {
    console.error('[ArticleMatcher] matchAllArticles: articles is not an array');
    return lines; // return unchanged
  }

  return lines.map((line, idx) => {
    try {
      const result = matchArticle(line, articles, tolerance);
      return { ...line, ...result };
    } catch (error) {
      console.error(`[ArticleMatcher] CRITICAL: Error matching line ${idx} (${line?.lineId}):`, error);
      // Return line as-is with no-match status
      return { ...line, matchStatus: 'no-match' as const, priceCheckStatus: 'missing' as const };
    }
  });
}
