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

// ── Art-# (DE) Validation ─────────────────────────────────────────────
/**
 * PROJ-17: German ERP article number validation.
 * Rule: exactly 6 digits, MUST start with "1".
 */
const ARTNO_DE_REGEX = /^1\d{5}$/;

// ── Normalization helper ──────────────────────────────────────────────
function normalize(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase();
}

// ── Sanitize helper (Strategy 3) ─────────────────────────────────────
/** Strips special chars used in Falmec article numbers before comparison. */
function sanitize(value: string): string {
  return value.replace(/[.\-#/,\s]/g, '');
}

// ── Price check ───────────────────────────────────────────────────────
function checkPrice(invoicePrice: number, sagePrice: number, tolerance: number): PriceCheckStatus {
  if (!Number.isFinite(invoicePrice) || invoicePrice <= 0) return 'missing';
  if (!Number.isFinite(sagePrice) || sagePrice <= 0) return 'missing';
  const diff = Math.abs(invoicePrice - sagePrice);
  return diff <= tolerance ? 'ok' : 'mismatch';
}

// ── Schema Definition ─────────────────────────────────────────────────
export const FALMEC_SCHEMA: SchemaDefinition = {
  name: 'Falmec Artikelstamm',
  fields: [
    {
      fieldId: 'artNoDE',
      label: 'Art-# (DE)',
      aliases: [
        'Art.-Nr. DE',
        'Artikelnummer DE',
        'Falmec Art.-Nr.',
        'DE-Artikelnummer',
        'Art. DE',
        'Artikel DE',
        'Art-# (DE)',
        'Artikelnummer' 
      ],
      required: true,
      validationPattern: '^1\\d{5}$',
      validate: (v) => ARTNO_DE_REGEX.test(v.trim()),
    },
    {
      fieldId: 'artNoIT',
      label: 'Art-# (IT)',
      aliases: [
        'Herstellerartikelnummer',
        'Hersteller-Artikelnummer',
        'Hersteller ArtNr',
        'Art.-Nr.',
        'Article No',
        'Codice Articolo',
        'Art. IT',
        'Art-# (IT)'
      ],
      required: true,
    },
    {
      fieldId: 'ean',
      label: 'EAN',
      aliases: ['EAN', 'EAN-Code', 'EAN-NUMMER', 'Barcode', 'GTIN'],
      required: true,
    },
    {
      fieldId: 'price',
      label: 'Preis netto',
      aliases: ['Preis netto', 'VK netto', 'Net Price', 'Prezzo', 'Einzelpreis'],
      required: true,
    },
    {
      fieldId: 'serialRequired',
      label: 'SN-Pflicht',
      aliases: ['SN-Pflicht', 'Serial Required', 'Seriennummer', 'Seriennummerpflicht', 'Seriennummernpflicht'],
      required: false,
    },
    {
      fieldId: 'storageLocation',
      label: 'Lagerort',
      aliases: ['Lagerort', 'Storage Location', 'Magazzino', 'Hauptlagerplatz', 'Hauptlager'],
      required: false,
    },
    {
      fieldId: 'supplierId',
      label: 'Lieferant',
      aliases: [
        'Lieferant', 'Supplier', 'Fornitore', 'Hauptlieferant',
        'Hersteller', 'Lieferantennummer', 'Lieferanten-Nr.', 'Lieferantennr.', 'fornitore',
      ],
      required: false,
    },
    {
      fieldId: 'descriptionDE',
      label: 'Bezeichnung (DE)',
      aliases: ['Artikelmatchcode', 'Matchcode', 'Bezeichnung DE', 'Beschreibung', 'Beschreibung DE'],
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

    // ── FAIL-FAST: Lieferant-Validierung (PROJ-40, 3 Blocker) ─────────
    const SUPPLIER_REGEX = /^\d{5}$/;
    const now2C = new Date().toISOString();

    // Blocker 1: Spalte komplett fehlend (alle ArticleMaster haben supplierId === null)
    if (articles.length > 0 && articles.every(a => a.supplierId === null)) {
      issues.push({
        id: `issue-${runId}-step2-supplier-col-${Date.now()}`,
        runId,
        severity: 'error',
        stepNo: 2,
        type: 'parser-error',
        message: 'Lieferant-Spalte nicht gefunden in Artikelliste',
        details: 'Die Artikelliste enthält keine Spalte für die Lieferantennummer (5-stellig). Bitte Spalte "Lieferant" bzw. Alias hinzufügen und erneut hochladen.',
        relatedLineIds: [],
        affectedLineIds: [],
        status: 'open',
        createdAt: now2C,
        resolvedAt: null,
        resolutionNote: null,
      });
    } else {
      // Blocker 2: Zeile hat supplierId null (Spalte vorhanden, Zelle leer)
      const missingSupplier = articles.filter(a => a.supplierId === null);
      if (missingSupplier.length > 0) {
        const artNos = missingSupplier.map(a => a.falmecArticleNo || a.manufacturerArticleNo).join(', ');
        issues.push({
          id: `issue-${runId}-step2-supplier-missing-${Date.now()}`,
          runId,
          severity: 'error',
          stepNo: 2,
          type: 'parser-error',
          message: `Lieferant fehlt für ${missingSupplier.length} Artikel`,
          details: `Lieferant fehlt für Artikel: ${artNos}`,
          relatedLineIds: [],
          affectedLineIds: [],
          status: 'open',
          createdAt: now2C,
          resolvedAt: null,
          resolutionNote: null,
        });
      }

      // Blocker 3: supplierId vorhanden aber nicht 5-stellig numerisch
      const invalidSupplier = articles.filter(
        a => a.supplierId !== null && !SUPPLIER_REGEX.test(a.supplierId),
      );
      if (invalidSupplier.length > 0) {
        const artNos = invalidSupplier
          .map(a => `${a.falmecArticleNo || a.manufacturerArticleNo} ("${a.supplierId}")`)
          .join(', ');
        issues.push({
          id: `issue-${runId}-step2-supplier-invalid-${Date.now()}`,
          runId,
          severity: 'error',
          stepNo: 2,
          type: 'parser-error',
          message: `Lieferant ungueltig bei ${invalidSupplier.length} Artikel (erwartet: 5-stellig numerisch)`,
          details: `Ungueltige Lieferantennummern: ${artNos}`,
          relatedLineIds: [],
          affectedLineIds: [],
          status: 'open',
          createdAt: now2C,
          resolvedAt: null,
          resolutionNote: null,
        });
      }
    }
    // ── Ende Fail-Fast ────────────────────────────────────────────────

    // Pre-index articles by normalized ArtNo and EAN for O(1) lookups
    const byArtNo = new Map<string, ArticleMaster>();
    const byEan = new Map<string, ArticleMaster>();
    // Strategy 3: sanitized ArtNo index (special chars stripped)
    const bySanitizedArt = new Map<string, ArticleMaster>();

    for (const article of articles) {
      const normArt = normalize(article.manufacturerArticleNo);
      const normEan = normalize(article.ean);
      if (normArt) byArtNo.set(normArt, article);
      if (normEan) byEan.set(normEan, article);
      const san = sanitize(normArt);
      if (san && san !== normArt) bySanitizedArt.set(san, article);
    }

    // PROJ-18: Collect per-line match results with trace reasons
    const matchResults = lines.map((line) => {
      try {
        return this.matchSingleLine(line, byArtNo, byEan, bySanitizedArt, articles, config, warnings);
      } catch (error) {
        console.error(`[FalmecMatcher] Error matching line ${line.lineId}:`, error);
        return {
          line: { ...line, matchStatus: 'no-match' as const, priceCheckStatus: 'missing' as const },
          reason: `Fehler beim Matching: ${error instanceof Error ? error.message : error}`,
          isConflict: false,
        };
      }
    });

    const updatedLines: InvoiceLine[] = matchResults.map(r => r.line);

    // Compute stats
    const stats = this.computeStats(updatedLines);

    // PROJ-17: Per-line MATCH_TRACE warnings for every no-match line → Log-Tab
    for (const result of matchResults) {
      if (result.line.matchStatus === 'no-match') {
        warnings.push({
          code: 'MATCH_TRACE',
          message: `Zeile ${result.line.lineId}: ${result.reason}`,
          severity: 'warning',
          lineId: result.line.lineId,
        });
      }
    }

    // PROJ-17: Categorized issues instead of single summary
    const noMatchNoConflict = matchResults.filter(r => r.line.matchStatus === 'no-match' && !r.isConflict);
    const conflictResults = matchResults.filter(r => r.isConflict);
    const now = new Date().toISOString();

    // Rollup: no-article-match (backwards-compatible summary)
    const allNoMatch = matchResults.filter(r => r.line.matchStatus === 'no-match');
    if (allNoMatch.length > 0) {
      issues.push({
        id: `issue-${runId}-step2-no-match-${Date.now()}`,
        runId,
        severity: 'error',
        stepNo: 2,
        type: 'no-article-match',
        message: `${allNoMatch.length} Artikel ohne Match in Stammdaten`,
        details: `${allNoMatch.length} Artikel ohne Match in Stammdaten`,
        relatedLineIds: allNoMatch.map(r => r.line.lineId),
        affectedLineIds: allNoMatch.map(r => r.line.lineId),
        status: 'open',
        createdAt: now,
        resolvedAt: null,
        resolutionNote: null,
      });
    }

    // Granular: match-artno-not-found (no-match lines that are NOT conflicts)
    if (noMatchNoConflict.length > 0) {
      issues.push({
        id: `issue-${runId}-step2-artno-${Date.now()}`,
        runId,
        severity: 'error',
        stepNo: 2,
        type: 'match-artno-not-found',
        message: `${noMatchNoConflict.length} Zeilen: Artikelnummer/EAN nicht im Stamm gefunden`,
        details: `${noMatchNoConflict.length} Zeilen: Artikelnummer/EAN nicht im Stamm`,
        relatedLineIds: noMatchNoConflict.map(r => r.line.lineId),
        affectedLineIds: noMatchNoConflict.map(r => r.line.lineId),
        status: 'open',
        createdAt: now,
        resolvedAt: null,
        resolutionNote: null,
      });
    }

    // Granular: match-conflict-id
    if (conflictResults.length > 0) {
      issues.push({
        id: `issue-${runId}-step2-conflict-${Date.now()}`,
        runId,
        severity: 'error',
        stepNo: 2,
        type: 'match-conflict-id',
        message: `${conflictResults.length} Zeilen: ArtNo/EAN-Konflikt (verschiedene Artikel)`,
        details: `${conflictResults.length} Zeilen: ArtNo/EAN-Konflikt`,
        relatedLineIds: conflictResults.map(r => r.line.lineId),
        affectedLineIds: conflictResults.map(r => r.line.lineId),
        status: 'open',
        createdAt: now,
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
    bySanitizedArt: Map<string, ArticleMaster>,
    articles: ArticleMaster[],
    config: MatcherConfig,
    warnings: MatcherWarning[],
  ): { line: InvoiceLine; reason: string; isConflict: boolean } {
    const lineCode = normalize(line.manufacturerArticleNo);
    const lineEan = normalize(line.ean);

    // GUARD: Both identifiers empty → no-match
    if (!lineCode && !lineEan) {
      return {
        line: {
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
        },
        reason: 'ArtNo und EAN leer — kein Lookup moeglich',
        isConflict: false,
      };
    }

    const attempts: string[] = [];

    // ── Strategy 1: Exact ArtNo match (O(1)) ─────────────────────────
    const matchByCode = lineCode ? byArtNo.get(lineCode) : undefined;
    if (!matchByCode && lineCode) attempts.push(`Exact-ArtNo fail ('${line.manufacturerArticleNo}')`);

    // ── Strategy 2: Exact EAN match (O(1)) ───────────────────────────
    const matchByEan = lineEan ? byEan.get(lineEan) : undefined;
    if (!matchByEan && lineEan) attempts.push(`Exact-EAN fail ('${line.ean}')`);

    // Determine MatchStatus
    let matchStatus: MatchStatus;
    let matchedArticle: ArticleMaster | undefined;
    let reason: string;
    let isConflict = false;

    if (matchByCode && matchByEan) {
      // Both match — check if same article
      if (matchByCode.id === matchByEan.id) {
        matchStatus = 'full-match';
        matchedArticle = matchByCode;
        reason = `Volltreffer: ArtNo + EAN → ${matchByCode.falmecArticleNo}`;
      } else {
        // CONFLICT: ArtNo → Article A, EAN → Article B
        matchStatus = 'no-match';
        matchedArticle = undefined;
        isConflict = true;
        reason = `KONFLIKT: ArtNo '${line.manufacturerArticleNo}' → ${matchByCode.falmecArticleNo}, EAN '${line.ean}' → ${matchByEan.falmecArticleNo}`;
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
      reason = `Strat-1 Exact-ArtNo Match: '${line.manufacturerArticleNo}' → ${matchByCode.falmecArticleNo}`;
    } else if (matchByEan) {
      matchStatus = 'ean-only';
      matchedArticle = matchByEan;
      reason = `Strat-2 Exact-EAN Match: '${line.ean}' → ${matchByEan.falmecArticleNo}`;
    } else {
      // ── Strategy 3: Sanitized ArtNo match (O(1)) ─────────────────
      const lineSanitized = lineCode ? sanitize(lineCode) : '';
      const matchBySanitized = lineSanitized ? bySanitizedArt.get(lineSanitized) : undefined;

      if (matchBySanitized) {
        matchStatus = 'code-it-only';
        matchedArticle = matchBySanitized;
        reason = `Strat-3 Sanitized-ArtNo Match: '${line.manufacturerArticleNo}' → '${lineSanitized}' → ${matchBySanitized.falmecArticleNo}`;
        warnings.push({
          code: 'MATCH_TRACE',
          message: `[Strat-3] ${attempts.join('; ')} → Sanitized Treffer: '${lineSanitized}' → ${matchBySanitized.falmecArticleNo}`,
          severity: 'info' as MatcherWarning['severity'],
          lineId: line.lineId,
        });
      } else {
        if (lineSanitized) attempts.push(`Sanitized-ArtNo fail ('${lineSanitized}')`);

        // ── Strategy 4: Partial ArtNo match (linear scan, fallback) ──
        let matchByPartial: ArticleMaster | undefined;
        if (lineCode && lineCode.length >= 4) {
          matchByPartial = articles.find(a => {
            const normA = normalize(a.manufacturerArticleNo);
            return normA.includes(lineCode) || lineCode.includes(normA);
          });
        }

        if (matchByPartial) {
          matchStatus = 'code-it-only';
          matchedArticle = matchByPartial;
          reason = `Strat-4 Partial-ArtNo Match: '${line.manufacturerArticleNo}' ⊆ '${matchByPartial.manufacturerArticleNo}' → ${matchByPartial.falmecArticleNo}`;
          warnings.push({
            code: 'MATCH_TRACE',
            message: `[Strat-4] ${attempts.join('; ')} → Partial Treffer: '${line.manufacturerArticleNo}' ~ '${matchByPartial.manufacturerArticleNo}' → ${matchByPartial.falmecArticleNo}`,
            severity: 'info' as MatcherWarning['severity'],
            lineId: line.lineId,
          });
        } else {
          matchStatus = 'no-match';
          matchedArticle = undefined;
          if (lineCode) attempts.push(`Partial-ArtNo fail`);
          reason = attempts.join('; ') || 'Kein Identifier vorhanden';
        }
      }
    }

    // No match → return with missing status
    if (!matchedArticle) {
      return {
        line: {
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
        },
        reason,
        isConflict,
      };
    }

    // Price check with tolerance
    const invoicePrice = Number.isFinite(line.unitPriceInvoice) ? line.unitPriceInvoice : 0;
    const sagePrice = Number.isFinite(matchedArticle.unitPriceNet) ? matchedArticle.unitPriceNet : 0;
    const priceCheckStatus = checkPrice(invoicePrice, sagePrice, config.tolerance);

    return {
      line: {
        ...line,
        matchStatus,
        falmecArticleNo: matchedArticle.falmecArticleNo ?? null,
        descriptionDE: matchedArticle.descriptionDE ?? null,
        unitPriceSage: sagePrice || null,
        serialRequired: matchedArticle.serialRequirement ?? false,
        activeFlag: matchedArticle.activeFlag ?? true,
        storageLocation: matchedArticle.storageLocation ?? null,
        supplierId: matchedArticle.supplierId ?? null,
        priceCheckStatus,
        unitPriceFinal: priceCheckStatus === 'ok' ? invoicePrice : null,
      },
      reason,
      isConflict,
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
    const issues: Issue[] = [];

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

      // PROJ-17: Blocking issue for missing invoice reference
      issues.push({
        id: `issue-step3-ref-${Date.now()}`,
        severity: 'error',
        stepNo: 3,
        type: 'sn-invoice-ref-missing',
        message: `Rechnungsreferenz '${invoiceRef5}' nicht im S/N-Dokument gefunden`,
        details: `Abgeleitete 5-Ziffern-Referenz: '${invoiceRef5}' aus Rechnungsnr. '${invoiceNumber}'. S/N-Extraktion abgebrochen.`,
        relatedLineIds: [],
        affectedLineIds: [],
        status: 'open',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolutionNote: null,
      });

      return {
        lines,
        stats: { assignedCount: 0, requiredCount: lines.filter(l => l.serialRequired).length, mismatchCount: 0 },
        warnings,
        issues,
        checksum: { regexHits: 0, assignedSNs: 0, match: true },
      };
    }

    // Extract serial candidates from matching rows via regex
    for (const row of matchingRows) {
      if (!row.serialCandidate) {
        const match = SN_REGEX.exec(row.serialRaw);
        row.serialCandidate = match ? match[0] : null;
      }
      // PROJ-17: Per-row warning when regex finds no serial
      if (row.serialCandidate === null) {
        warnings.push({
          code: 'SN_REGEX_FAILED',
          message: `S/N-Zeile ${row.rowIndex}: Regex /K[0-2]\\d{10}K/ kein Treffer in '${row.serialRaw.substring(0, 40)}'`,
          severity: 'warning',
        });
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

    // PROJ-17: Issue when not enough serials for required lines
    if (mismatchCount > 0) {
      const unassignedLineIds = updatedLines
        .filter(l => l.serialRequired && !l.serialNumber)
        .map(l => l.lineId);
      issues.push({
        id: `issue-step3-insufficient-${Date.now()}`,
        severity: 'warning',
        stepNo: 3,
        type: 'sn-insufficient-count',
        message: `${mismatchCount} Zeilen ohne Seriennummer (${assignedCount}/${requiredCount} zugewiesen)`,
        details: `${mismatchCount} Zeilen ohne Seriennummer (${assignedCount}/${requiredCount} zugewiesen)`,
        relatedLineIds: unassignedLineIds,
        affectedLineIds: unassignedLineIds,
        status: 'open',
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        resolutionNote: null,
      });
    }

    return {
      lines: updatedLines,
      stats: { assignedCount, requiredCount, mismatchCount },
      warnings,
      issues,
      checksum: { regexHits, assignedSNs: assignedCount, match: checksumMatch },
    };
  }
}
