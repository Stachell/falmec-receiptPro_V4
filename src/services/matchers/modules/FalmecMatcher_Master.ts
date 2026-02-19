/**
 * FalmecMatcher_Master — PROJ-16
 *
 * First concrete MatcherModule implementation.
 * Handles Step 2 (Cross-Match) and Step 3 (S/N-Extraction) for Falmec invoices.
 *
 * CRITICAL RULES:
 * - Normalization: BOTH sides use trim().toUpperCase() before EVERY comparison
 * - S/N Regex: /K[0-2][0-9]{10}K/ (literal K + Baujahr 0-2 + 10 digits + literal K)
 * - CONFLICT: ArtNo matches Article A, EAN matches Article B → no-match + warning
 */

import type {
  MatcherModule,
  MatcherConfig,
  SchemaDefinition,
  CrossMatchResult,
  SerialDocument,
  SerialExtractionResult,
  MatcherWarning,
} from '../types';
import type {
  InvoiceLine,
  ArticleMaster,
  MatchStatus,
  PriceCheckStatus,
  Issue,
  RunStats,
} from '@/types';

// ── S/N Regex ─────────────────────────────────────────────────────────
/** Serial number pattern: literal K + Baujahr [0-2] + exactly 10 more digits + literal K */
const SN_REGEX = /K[0-2][0-9]{10}K/;

// ── Normalization helper ──────────────────────────────────────────────
function normalize(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

// ── Price check ───────────────────────────────────────────────────────
function checkPrice(invoicePrice: number, sagePrice: number, tolerance: number): PriceCheckStatus {
  if (!Number.isFinite(invoicePrice) || invoicePrice <= 0) return 'missing';
  if (!Number.isFinite(sagePrice) || sagePrice <= 0) return 'missing';
  const diff = Math.abs(invoicePrice - sagePrice);
  return diff <= tolerance ? 'ok' : 'mismatch';
}

// ── Schema ────────────────────────────────────────────────────────────
const FALMEC_SCHEMA: SchemaDefinition = {
  name: 'Falmec Artikelstamm',
  fields: [
    {
      fieldId: 'artNo',
      label: 'Artikelnummer',
      aliases: ['Artikelnummer', 'Art.-Nr.', 'Article No', 'Codice Articolo'],
      required: true,
    },
    {
      fieldId: 'ean',
      label: 'EAN',
      aliases: ['EAN', 'EAN-Code', 'Barcode', 'GTIN'],
      required: true,
    },
    {
      fieldId: 'price',
      label: 'Preis netto',
      aliases: ['Preis netto', 'VK netto', 'Net Price', 'Prezzo'],
      required: true,
    },
    {
      fieldId: 'serialRequired',
      label: 'SN-Pflicht',
      aliases: ['SN-Pflicht', 'Serial Required', 'Seriennummer'],
      required: false,
    },
    {
      fieldId: 'storageLocation',
      label: 'Lagerort',
      aliases: ['Lagerort', 'Storage Location', 'Magazzino'],
      required: false,
    },
    {
      fieldId: 'supplierId',
      label: 'Lieferant',
      aliases: ['Lieferant', 'Supplier', 'Fornitore'],
      required: false,
    },
  ],
};

// ── FalmecMatcher_Master ──────────────────────────────────────────────

export class FalmecMatcher_Master implements MatcherModule {
  readonly moduleId = 'FalmecMatcher_Master';
  readonly moduleName = 'Falmec Matcher';
  readonly version = '1.0.0';
  readonly schemaDefinition = FALMEC_SCHEMA;

  // ── Step 2: Cross-Match ─────────────────────────────────────────────

  crossMatch(
    lines: InvoiceLine[],
    articles: ArticleMaster[],
    config: MatcherConfig,
    runId: string,
  ): CrossMatchResult {
    const warnings: MatcherWarning[] = [];
    const issues: Issue[] = [];

    // Pre-index articles by normalized ArtNo and EAN for O(1) lookups
    const byArtNo = new Map<string, ArticleMaster>();
    const byEan = new Map<string, ArticleMaster>();

    for (const article of articles) {
      const normArt = normalize(article.manufacturerArticleNo);
      const normEan = normalize(article.ean);
      if (normArt) byArtNo.set(normArt, article);
      if (normEan) byEan.set(normEan, article);
    }

    const updatedLines: InvoiceLine[] = lines.map((line) => {
      try {
        return this.matchSingleLine(line, byArtNo, byEan, config, warnings);
      } catch (error) {
        console.error(`[FalmecMatcher] Error matching line ${line.lineId}:`, error);
        return { ...line, matchStatus: 'no-match' as const, priceCheckStatus: 'missing' as const };
      }
    });

    // Compute stats
    const stats = this.computeStats(updatedLines);

    // Build issues for no-match articles
    const noMatchLines = updatedLines.filter(l => l.matchStatus === 'no-match');
    if (noMatchLines.length > 0) {
      issues.push({
        id: `issue-${runId}-step2-no-match-${Date.now()}`,
        runId,
        severity: 'blocking',
        stepNo: 2,
        type: 'no-article-match',
        message: `${noMatchLines.length} Artikel ohne Match in Stammdaten`,
        details: noMatchLines.map(l => l.manufacturerArticleNo || l.ean || l.lineId).join(', '),
        relatedLineIds: noMatchLines.map(l => l.lineId),
        status: 'open',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolutionNote: null,
      });
    }

    return { lines: updatedLines, stats, issues, warnings };
  }

  private matchSingleLine(
    line: InvoiceLine,
    byArtNo: Map<string, ArticleMaster>,
    byEan: Map<string, ArticleMaster>,
    config: MatcherConfig,
    warnings: MatcherWarning[],
  ): InvoiceLine {
    const lineCode = normalize(line.manufacturerArticleNo);
    const lineEan = normalize(line.ean);

    // GUARD: Both identifiers empty → no-match
    if (!lineCode && !lineEan) {
      return {
        ...line,
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
    }

    // Lookup by normalized ArtNo and EAN
    const matchByCode = lineCode ? byArtNo.get(lineCode) : undefined;
    const matchByEan = lineEan ? byEan.get(lineEan) : undefined;

    // Determine MatchStatus
    let matchStatus: MatchStatus;
    let matchedArticle: ArticleMaster | undefined;

    if (matchByCode && matchByEan) {
      // Both match — check if same article
      if (matchByCode.id === matchByEan.id) {
        // PERFECT: Both point to the same article
        matchStatus = 'full-match';
        matchedArticle = matchByCode;
      } else {
        // CONFLICT: ArtNo → Article A, EAN → Article B
        matchStatus = 'no-match';
        matchedArticle = undefined;
        warnings.push({
          code: 'CONFLICT',
          message: `Konflikt: ArtNo '${line.manufacturerArticleNo}' → ${matchByCode.falmecArticleNo}, EAN '${line.ean}' → ${matchByEan.falmecArticleNo}`,
          severity: 'warning',
          lineId: line.lineId,
        });
      }
    } else if (matchByCode) {
      matchStatus = 'code-it-only';
      matchedArticle = matchByCode;
    } else if (matchByEan) {
      matchStatus = 'ean-only';
      matchedArticle = matchByEan;
    } else {
      matchStatus = 'no-match';
      matchedArticle = undefined;
    }

    // No match → return with missing status
    if (!matchedArticle) {
      return {
        ...line,
        matchStatus,
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
    }

    // Price check with tolerance
    const invoicePrice = Number.isFinite(line.unitPriceInvoice) ? line.unitPriceInvoice : 0;
    const sagePrice = Number.isFinite(matchedArticle.unitPriceNet) ? matchedArticle.unitPriceNet : 0;
    const priceCheckStatus = checkPrice(invoicePrice, sagePrice, config.tolerance);

    return {
      ...line,
      matchStatus,
      falmecArticleNo: matchedArticle.falmecArticleNo ?? null,
      descriptionDE: null, // ArticleMaster doesn't carry descriptionDE currently
      unitPriceSage: sagePrice || null,
      serialRequired: matchedArticle.serialRequirement ?? false,
      activeFlag: matchedArticle.activeFlag ?? true,
      storageLocation: matchedArticle.storageLocation ?? null,
      supplierId: null, // Comes from OpenWE, not ArticleMaster
      priceCheckStatus,
      unitPriceFinal: priceCheckStatus === 'ok' ? invoicePrice : null,
    };
  }

  private computeStats(lines: InvoiceLine[]): Partial<RunStats> {
    return {
      expandedLineCount: lines.length,
      fullMatchCount: lines.filter(l => l.matchStatus === 'full-match').length,
      codeItOnlyCount: lines.filter(l => l.matchStatus === 'code-it-only').length,
      eanOnlyCount: lines.filter(l => l.matchStatus === 'ean-only').length,
      noMatchCount: lines.filter(l => l.matchStatus === 'no-match').length,
      articleMatchedCount: lines.filter(
        l => l.matchStatus !== 'pending' && l.matchStatus !== 'no-match',
      ).length,
      serialRequiredCount: lines.filter(l => l.serialRequired).length,
      inactiveArticlesCount: lines.filter(l => !l.activeFlag).length,
      priceOkCount: lines.filter(l => l.priceCheckStatus === 'ok').length,
      priceMismatchCount: lines.filter(l => l.priceCheckStatus === 'mismatch').length,
      priceMissingCount: lines.filter(l => l.priceCheckStatus === 'missing').length,
      priceCustomCount: lines.filter(l => l.priceCheckStatus === 'custom').length,
    };
  }

  // ── Step 3: Serial Extraction ───────────────────────────────────────

  serialExtract(
    lines: InvoiceLine[],
    serialDocument: SerialDocument,
    invoiceNumber: string,
  ): SerialExtractionResult {
    const warnings: MatcherWarning[] = [];

    // Extract the 5-digit invoice reference (e.g. "20007" from "FA-20007")
    const invoiceRef5 = invoiceNumber.replace(/\D/g, '').slice(-5);

    // Find all rows matching this invoice reference
    const matchingRows = serialDocument.rows.filter(
      row => row.invoiceRef === invoiceRef5,
    );

    if (matchingRows.length === 0) {
      warnings.push({
        code: 'SN_NO_INVOICE_REF',
        message: `Rechnungsreferenz '${invoiceRef5}' nicht im S/N-Dokument gefunden`,
        severity: 'warning',
      });

      return {
        lines,
        stats: { assignedCount: 0, requiredCount: lines.filter(l => l.serialRequired).length, mismatchCount: 0 },
        warnings,
        checksum: { regexHits: 0, assignedSNs: 0, match: true },
      };
    }

    // Extract serial candidates from matching rows via regex
    for (const row of matchingRows) {
      if (!row.serialCandidate) {
        const match = SN_REGEX.exec(row.serialRaw);
        row.serialCandidate = match ? match[0] : null;
      }
    }

    const regexHits = matchingRows.filter(r => r.serialCandidate !== null).length;

    // Assign serials to lines that require them
    let assignedCount = 0;
    const updatedLines = lines.map(line => {
      if (!line.serialRequired) return line;

      // Find next unconsumed row with a serial candidate
      const availableRow = matchingRows.find(r => r.serialCandidate !== null && !r.consumed);
      if (!availableRow) return line;

      availableRow.consumed = true;
      assignedCount++;

      return {
        ...line,
        serialNumber: availableRow.serialCandidate,
        serialSource: 'serialList' as const,
      };
    });

    const requiredCount = lines.filter(l => l.serialRequired).length;
    const mismatchCount = requiredCount - assignedCount;
    const checksumMatch = regexHits === assignedCount;

    if (!checksumMatch) {
      warnings.push({
        code: 'SN_CHECKSUM_MISMATCH',
        message: `Checksumme: ${regexHits} Regex-Treffer vs. ${assignedCount} zugewiesene S/N`,
        severity: 'warning',
      });
    }

    return {
      lines: updatedLines,
      stats: { assignedCount, requiredCount, mismatchCount },
      warnings,
      checksum: { regexHits, assignedSNs: assignedCount, match: checksumMatch },
    };
  }
}
