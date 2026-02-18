/**
 * Fattura PDF Parser Service V2 — Delayed Commit / Block-Aggregation
 *
 * Fixes over V1:
 * 1. Price Clipping: normalizeEuropeanPrices() merges split thousands ("3. 596,00" → "3.596,00")
 * 2. Greedy Extraction: Stateful accumulator replaces 80px bounding-box lookup
 * 3. Order-Block: Sequential top-to-bottom tracking instead of per-PZ-row backtracking
 * 4. Delayed Commit: A position block is only committed when the NEXT block-starter
 *    is detected. All lines (text, PZ, prices) between two block-starters belong to
 *    the same position. This correctly handles multi-line article descriptions that
 *    extend both above AND below the PZ line.
 *
 * Architecture:
 *   For each page → group items into rows → sort top-to-bottom → classify each row
 *   → on block-starter: commit previous block, open new → accumulate PZ/prices/text
 *   → flush last block after all pages
 */

import { logService } from '../../logService';
import type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParsedInvoiceHeader,
  ParsedInvoiceLine,
  ParserWarning,
  ValidationResult,
} from '../types';
import {
  extractTextFromPDF,
  type ExtractedPage,
  type ExtractedTextItem,
} from '../utils/pdfTextExtractor';
import { OrderBlockTracker, extractOrderReferences } from '../utils/OrderBlockTracker';
import { enrichOrderCandidates } from '../utils/ExtendedOrderRecognition';
import { parsePrice, parseIntSafe } from '../utils/priceParser';
import {
  INVOICE_NUMBER_PATTERNS,
  ARTICLE_PATTERNS,
  EAN_PATTERN,
  PRICE_VALUE_PATTERN,
  FATTURA_DATE,
  CONTRIBUTO_MARKER,
  AMOUNT_TO_PAY_MARKER,
  shouldSkipLine,
  isOrderReferenceLine,
} from '../constants/fatturaPatterns';

// ─── Constants ────────────────────────────────────────────────────────
const Y_TOLERANCE = 5;
const BODY_START_LABELS = ['DESCRIPTION', 'Q.TY', 'PRICE'];
const BODY_END_PATTERNS = [
  /Number\s+of\s+packages/i,
  /Volume\s+MC/i,
  /CONTRIBUTO\s+AMBIENTALE/i,
  /AMOUNT\s+.*TO\s+PAY/i,
  /^TOTAL/i,
];

// ─── Interfaces ───────────────────────────────────────────────────────
interface ZoneBounds {
  bodyStartY: number;
  bodyEndY: number;
}

interface RowGroup {
  y: number;
  items: ExtractedTextItem[];
}

interface PositionBlock {
  articleNo: string;
  ean: string;
  descriptionParts: string[];
  pzQty: number;
  priceValues: number[];
  rawLines: string[];
  rows: RowGroup[];
}

// ─── Utility: European Price Normalization ────────────────────────────

/**
 * Merge split European prices: "3. 596,00" → "3.596,00"
 * pdfjs-dist may extract "3.596,00" as separate items ("3." + "596,00"),
 * and the space-join produces "3. 596,00" which breaks the price regex.
 */
function normalizeEuropeanPrices(text: string): string {
  return text.replace(/(\d)\.\s+(\d{3}[,.])/g, '$1.$2');
}

/**
 * Join row items with smart spacing — items with tiny X-gap (<3px) are
 * concatenated without space to preserve split European prices.
 */
function smartJoinRowItems(items: ExtractedTextItem[]): string {
  if (items.length === 0) return '';
  let result = items[0].text;
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const curr = items[i];
    const gap = curr.x - (prev.x + prev.width);
    if (gap < 3) {
      result += curr.text;
    } else {
      result += ' ' + curr.text;
    }
  }
  return result;
}

// ─── Block helpers ────────────────────────────────────────────────────

function createEmptyBlock(): PositionBlock {
  return {
    articleNo: '',
    ean: '',
    descriptionParts: [],
    pzQty: 0,
    priceValues: [],
    rawLines: [],
    rows: [],
  };
}

/**
 * Detect whether a row starts a new article block.
 * Returns { articleNo, ean } when at least one identifier is found.
 */
function isBlockStarter(
  items: ExtractedTextItem[]
): { articleNo: string; ean: string } | null {
  const joined = items.map(it => it.text).join(' ').trim();

  // 1. "combined" pattern on the joined text (article + EAN together)
  const combinedPat = ARTICLE_PATTERNS.find(p => p.name === 'combined');
  if (combinedPat) {
    const cm = joined.match(combinedPat.regex);
    if (cm) return { articleNo: cm[1], ean: cm[2] };
  }

  // 2. Check each item individually against anchored article patterns
  let articleNo = '';
  let ean = '';

  for (const item of items) {
    const t = item.text.trim();
    if (!t) continue;

    if (!ean && EAN_PATTERN.test(t)) {
      ean = t.match(EAN_PATTERN)![1];
      continue;
    }

    if (!articleNo) {
      for (const pat of ARTICLE_PATTERNS) {
        if (pat.name === 'combined') continue; // already handled
        const m = t.match(pat.regex);
        if (m) {
          articleNo = m[1];
          break;
        }
      }
    }
  }

  if (articleNo || ean) return { articleNo, ean };
  return null;
}

/**
 * Commit a completed PositionBlock to a ParsedInvoiceLine.
 * Returns null if the block has no valid PZ quantity or no total price.
 */
function commitBlock(
  block: PositionBlock,
  posIndex: number,
  orderTracker: OrderBlockTracker,
): ParsedInvoiceLine | null {
  if (block.pzQty <= 0) return null;

  // Prices: last two values from accumulated priceValues
  let unitPrice = 0;
  let totalPrice = 0;
  const pv = block.priceValues;
  if (pv.length >= 2) {
    unitPrice = pv[pv.length - 2];
    totalPrice = pv[pv.length - 1];
  } else if (pv.length === 1) {
    unitPrice = pv[0];
    totalPrice = pv[0];
  }

  if (totalPrice <= 0) return null;

  const description = block.descriptionParts.join(' ').trim();

  const orderCandidates = orderTracker.getOrdersForPosition();
  const orderStatus: 'YES' | 'NO' | 'check' =
    orderCandidates.length === 1 ? 'YES'
    : orderCandidates.length === 0 ? 'NO' : 'check';

  return {
    positionIndex: posIndex,
    manufacturerArticleNo: block.articleNo,
    ean: block.ean,
    descriptionIT: description,
    quantityDelivered: block.pzQty,
    unitPrice,
    totalPrice,
    orderCandidates,
    orderCandidatesText: orderCandidates.join('|'),
    orderStatus,
    rawPositionText: block.rawLines.join(' | '),
  };
}

// ─── Parser Class ─────────────────────────────────────────────────────
export class FatturaParserService_V2 implements InvoiceParser {
  readonly moduleId = 'fattura_falmec_v2';
  readonly moduleName = 'Fattura Falmec V2';
  readonly version = '2.0.0';

  private orderTracker = new OrderBlockTracker();

  async parseInvoice(pdfFile: File, runId?: string): Promise<ParsedInvoiceResult> {
    const activeRunId = runId || `fallback_${Date.now()}`;
    const startTime = Date.now();

    logService.info(`[v2] PDF-Parsing gestartet: ${pdfFile.name}`, {
      runId: activeRunId,
      step: 'Rechnung auslesen',
      details: `Dateigroesse: ${(pdfFile.size / 1024).toFixed(2)} KB`,
    });

    try {
      const pages = await extractTextFromPDF(pdfFile, Y_TOLERANCE);
      logService.info(`${pages.length} Seiten extrahiert`, { runId: activeRunId });

      for (const page of pages) {
        logService.debug(`[v2] Rohtext Seite ${page.pageNumber}`, {
          runId: activeRunId,
          step: 'RawText',
          details: page.fullText,
        });
      }

      // 1. Header (page 1)
      const header = this.parseHeaderFromItems(pages[0], activeRunId);

      // 2. Packages count (last page)
      const packagesCount = this.parsePackagesCountFromItems(pages[pages.length - 1], activeRunId);
      if (packagesCount > 0) {
        header.packagesCount = packagesCount;
      }

      // 3. Parse positions — STATEFUL TOP-TO-BOTTOM (core V2 change)
      const { lines, warnings } = this.parsePositionsStateful(pages, activeRunId);

      // 4. Invoice total (last page)
      const invoiceTotal = this.parseInvoiceTotalFromItems(pages[pages.length - 1], activeRunId);
      if (invoiceTotal > 0) {
        header.invoiceTotal = invoiceTotal;
      }

      // 5. Totals
      header.totalQty = lines.reduce((sum, l) => sum + l.quantityDelivered, 0);
      header.parsedPositionsCount = lines.length;

      if (header.packagesCount && header.totalQty > 0) {
        header.qtyValidationStatus =
          header.totalQty === header.packagesCount ? 'ok' : 'mismatch';
      } else {
        header.qtyValidationStatus = 'unknown';
      }

      // 6. Validation rules
      const validationResults = this.runValidation(header, lines);

      // 7. Standard warnings
      if (header.qtyValidationStatus === 'mismatch') {
        warnings.push({
          code: 'QTY_SUM_MISMATCH',
          message: `Mengensumme ${header.totalQty} != Paketzahl ${header.packagesCount}`,
          severity: 'warning',
        });
      }

      if (header.invoiceTotal && header.invoiceTotal > 0) {
        const sumAmount = Math.round(lines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
        const priceDiff = Math.abs(sumAmount - header.invoiceTotal);
        if (priceDiff > 0.02) {
          warnings.push({
            code: 'PRICE_SUM_MISMATCH',
            message: `Preissumme ${sumAmount.toFixed(2)} != Rechnungstotal ${header.invoiceTotal.toFixed(2)} (Diff: ${priceDiff.toFixed(2)})`,
            severity: 'warning',
          });
        }
      }

      if (!header.fatturaNumber) {
        warnings.push({
          code: 'MISSING_FATTURA_NUMBER',
          message: 'Rechnungsnummer konnte nicht extrahiert werden',
          severity: 'error',
        });
      }

      if (lines.length === 0) {
        warnings.push({
          code: 'NO_POSITIONS_FOUND',
          message: 'Keine Rechnungspositionen gefunden',
          severity: 'error',
        });
      }

      const duration = Date.now() - startTime;
      logService.info(
        `[v2] PDF-Parsing abgeschlossen (${duration}ms): ${lines.length} Positionen, ${header.totalQty} Gesamtmenge`,
        { runId: activeRunId, details: `RgNr: ${header.fatturaNumber || 'N/A'}, Datum: ${header.fatturaDate || 'N/A'}` }
      );

      return {
        success: warnings.filter(w => w.severity === 'error').length === 0,
        header,
        lines,
        warnings,
        validationResults,
        parserModule: this.moduleId,
        parsedAt: new Date().toISOString(),
        sourceFileName: pdfFile.name,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logService.error(`[v2] PDF-Parsing fehlgeschlagen: ${errorMsg}`, {
        runId: activeRunId,
        details: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`PDF-Parsing fehlgeschlagen: ${errorMsg}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HEADER EXTRACTION (identical to V1 — label-based with search radius)
  // ═══════════════════════════════════════════════════════════════════

  private parseHeaderFromItems(page: ExtractedPage, runId: string): ParsedInvoiceHeader {
    const items = page.items;
    const fullText = page.fullText;

    let invoiceNumber = '';
    for (const { name, regex } of INVOICE_NUMBER_PATTERNS) {
      const match = fullText.match(regex);
      if (match) {
        invoiceNumber = name === 'FATTURA_NUMBER_FLEXIBLE'
          ? `${match[1]}.${match[2]}`
          : match[1];
        logService.info(`[v2] Rechnungsnummer: ${invoiceNumber} (${name})`, { runId, step: 'Header' });
        break;
      }
    }

    let date = '';
    const dateMatch = fullText.match(FATTURA_DATE);
    if (dateMatch) {
      date = dateMatch[1].replace(/\//g, '.');
      logService.info(`[v2] Datum: ${date}`, { runId, step: 'Header' });
    }

    let packagesCount = 0;
    const packLabel = items.find(it => /Number\s+of\s+packages/i.test(it.text));
    if (packLabel) {
      const below = items.filter(
        it => it.y < packLabel.y && Math.abs(it.x - packLabel.x) < 80 && (packLabel.y - it.y) < 30
      );
      for (const item of below) {
        const num = item.text.match(/(\d{1,4})/);
        if (num) {
          packagesCount = parseIntSafe(num[1]);
          break;
        }
      }
    }

    return {
      fatturaNumber: invoiceNumber,
      fatturaDate: date,
      packagesCount: packagesCount || null,
      invoiceTotal: 0,
      totalQty: 0,
      parsedPositionsCount: 0,
      qtyValidationStatus: 'unknown',
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ZONE DETECTION
  // ═══════════════════════════════════════════════════════════════════

  private detectZone(page: ExtractedPage): ZoneBounds {
    const items = page.items;

    let bodyStartY = Number.POSITIVE_INFINITY;
    for (const item of items) {
      const text = item.text.trim().toUpperCase();
      if (BODY_START_LABELS.some(label => text.includes(label))) {
        if (item.y < bodyStartY) {
          bodyStartY = item.y;
        }
      }
    }

    let bodyEndY = Number.NEGATIVE_INFINITY;
    for (const item of items) {
      if (BODY_END_PATTERNS.some(pat => pat.test(item.text))) {
        if (bodyEndY === Number.NEGATIVE_INFINITY || item.y > bodyEndY) {
          bodyEndY = item.y;
        }
      }
    }

    if (bodyStartY === Number.POSITIVE_INFINITY) {
      bodyStartY = Math.max(...items.map(it => it.y)) + 1;
    }
    if (bodyEndY === Number.NEGATIVE_INFINITY) {
      bodyEndY = Math.min(...items.map(it => it.y)) - 1;
    }

    return { bodyStartY, bodyEndY };
  }

  private getBodyItems(page: ExtractedPage, zone: ZoneBounds): ExtractedTextItem[] {
    return page.items.filter(
      it => it.y < zone.bodyStartY && it.y > zone.bodyEndY
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // POSITION EXTRACTION — Delayed Commit / Block-Aggregation (V2 CORE)
  // ═══════════════════════════════════════════════════════════════════

  private parsePositionsStateful(
    pages: ExtractedPage[],
    runId: string
  ): { lines: ParsedInvoiceLine[]; warnings: ParserWarning[] } {
    const allLines: ParsedInvoiceLine[] = [];
    const allWarnings: ParserWarning[] = [];
    const allBodyItems: Array<{ pageNumber: number; items: ExtractedTextItem[] }> = [];
    const allOrderRefs: Array<{ pageNumber: number; y: number; orders: string[] }> = [];
    this.orderTracker.reset();
    let positionIndex = 0;

    // Delayed-commit block — only committed when NEXT block-starter is seen
    let currentBlock: PositionBlock | null = null;

    /** Try to commit the current block, push to allLines if valid */
    const tryCommit = () => {
      if (!currentBlock || currentBlock.pzQty <= 0) return;
      positionIndex++;
      const line = commitBlock(currentBlock, positionIndex, this.orderTracker);
      if (line) {
        allLines.push(line);
        if (!line.manufacturerArticleNo && !line.ean) {
          allWarnings.push({
            code: 'POSITION_MISSING_IDENTIFIER',
            message: `Position ${positionIndex}: Keine Artikelnummer oder EAN erkannt`,
            severity: 'warning',
            positionIndex,
          });
        }
        logService.debug(
          `[v2] Pos ${positionIndex}: art=${line.manufacturerArticleNo || 'N/A'}, ean=${line.ean || 'N/A'}, qty=${line.quantityDelivered}, unit=${line.unitPrice}, total=${line.totalPrice}, orders=[${line.orderCandidates.join(',')}]`,
          { runId, step: 'Position' }
        );
      } else {
        // commitBlock returned null (e.g. totalPrice<=0) — rollback index
        positionIndex--;
      }
    };

    for (const page of pages) {
      const zone = this.detectZone(page);
      const bodyItems = this.getBodyItems(page, zone);

      logService.debug(
        `[v2] Page ${page.pageNumber}: zone Y=[${zone.bodyEndY.toFixed(0)}..${zone.bodyStartY.toFixed(0)}], ${bodyItems.length} body items`,
        { runId, step: 'Position' }
      );

      if (bodyItems.length === 0) continue;

      allBodyItems.push({ pageNumber: page.pageNumber, items: bodyItems });

      const rows = this.groupItemsIntoRows(bodyItems);
      // TOP-TO-BOTTOM: pdfjs Y descending = top of page first
      rows.sort((a, b) => b.y - a.y);

      for (const row of rows) {
        const rawText = row.items.map(it => it.text).join(' ');
        const smartText = smartJoinRowItems(row.items);
        const normalizedText = normalizeEuropeanPrices(smartText);

        // 1. Skip header/footer lines
        if (shouldSkipLine(rawText)) continue;

        // A) Order reference → commit current block + start new order block
        if (isOrderReferenceLine(rawText)) {
          tryCommit();
          currentBlock = null;
          const orders = extractOrderReferences(rawText);
          if (orders.length > 0) {
            this.orderTracker.startNewBlock(orders);
            allOrderRefs.push({ pageNumber: page.pageNumber, y: row.y, orders });
            logService.debug(
              `[v2] Order block: [${orders.join(',')}] at Y=${row.y.toFixed(0)}`,
              { runId, step: 'Position' }
            );
          }
          continue;
        }

        // B) Block-Starter (article/EAN detected)?
        const starter = isBlockStarter(row.items);
        if (starter) {
          if (currentBlock && currentBlock.pzQty > 0) {
            // Previous block is complete (has PZ) → commit, then start new
            tryCommit();
            currentBlock = createEmptyBlock();
            currentBlock.articleNo = starter.articleNo;
            currentBlock.ean = starter.ean;
          } else if (currentBlock) {
            // MERGE: current block has no PZ yet → still in article header
            // (e.g. article on line 1, EAN on line 2)
            if (starter.articleNo && !currentBlock.articleNo) {
              currentBlock.articleNo = starter.articleNo;
            }
            if (starter.ean && !currentBlock.ean) {
              currentBlock.ean = starter.ean;
            }
          } else {
            // No open block → start new
            currentBlock = createEmptyBlock();
            currentBlock.articleNo = starter.articleNo;
            currentBlock.ean = starter.ean;
          }
          // FALL-THROUGH: this line is also checked for PZ + prices below!
        }

        // C) No block open? Open an empty one
        if (!currentBlock) {
          currentBlock = createEmptyBlock();
        }

        // D) PZ match on this line?
        const pzMatch = normalizedText.match(/PZ\s+(\d+)/i);
        if (pzMatch && currentBlock.pzQty === 0) {
          currentBlock.pzQty = parseIntSafe(pzMatch[1]);
        }

        // E) Extract prices from this line
        const prices = this.extractPricesFromText(normalizedText);
        currentBlock.priceValues.push(...prices);

        // F) Accumulate description text (strip PZ pattern and price patterns)
        let descText = normalizedText
          .replace(/PZ\s+\d+/gi, '')
          .replace(new RegExp(PRICE_VALUE_PATTERN.source, 'g'), '')
          .trim();
        if (descText) {
          currentBlock.descriptionParts.push(descText);
        }

        currentBlock.rawLines.push(rawText);
        currentBlock.rows.push(row);
      }
    }

    // FLUSH: commit last open block after all pages
    tryCommit();

    // Extended order recognition enrichment
    const { enrichedLines, warnings: enrichWarnings } = enrichOrderCandidates(
      allLines, allBodyItems, allOrderRefs,
    );
    allWarnings.push(...enrichWarnings);

    logService.info(`[v2] ${enrichedLines.length} Positionen extrahiert`, { runId, step: 'Position' });
    return { lines: enrichedLines, warnings: allWarnings };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ROW GROUPING
  // ═══════════════════════════════════════════════════════════════════

  private groupItemsIntoRows(items: ExtractedTextItem[]): RowGroup[] {
    if (items.length === 0) return [];

    const sorted = [...items].sort((a, b) => b.y - a.y);
    const rows: RowGroup[] = [];
    let currentY = sorted[0].y;
    let currentItems: ExtractedTextItem[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const item = sorted[i];
      if (Math.abs(item.y - currentY) <= Y_TOLERANCE) {
        currentItems.push(item);
      } else {
        rows.push({
          y: currentItems.reduce((sum, it) => sum + it.y, 0) / currentItems.length,
          items: currentItems.sort((a, b) => a.x - b.x),
        });
        currentY = item.y;
        currentItems = [item];
      }
    }

    if (currentItems.length > 0) {
      rows.push({
        y: currentItems.reduce((sum, it) => sum + it.y, 0) / currentItems.length,
        items: currentItems.sort((a, b) => a.x - b.x),
      });
    }

    return rows;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRICE EXTRACTION (with European price normalization)
  // ═══════════════════════════════════════════════════════════════════

  private extractPricesFromText(text: string): number[] {
    const prices: number[] = [];
    const pattern = new RegExp(PRICE_VALUE_PATTERN.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text)) !== null) {
      const val = parsePrice(m[1]);
      if (val > 0) prices.push(val);
    }
    return prices;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ARTICLE / EAN EXTRACTION
  // ═══════════════════════════════════════════════════════════════════

  private extractArticleEanFromBlock(
    text: string
  ): { articleNo: string; ean: string; description: string } {
    const trimmed = text.trim();
    if (!trimmed) return { articleNo: '', ean: '', description: '' };

    const eanMatch = trimmed.match(/\b(803\d{10})\b/);

    if (eanMatch) {
      const ean = eanMatch[1];
      const eanIndex = trimmed.indexOf(ean);
      const articleNo = trimmed.substring(0, eanIndex).trim();
      const description = trimmed.substring(eanIndex + ean.length).trim();
      return { articleNo, ean, description };
    } else {
      return { articleNo: trimmed, ean: '', description: trimmed };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // FOOTER EXTRACTION (identical to V1)
  // ═══════════════════════════════════════════════════════════════════

  private parsePackagesCountFromItems(page: ExtractedPage, runId: string): number {
    const items = page.items;

    const label = items.find(it => /Number\s+of\s+packages/i.test(it.text));
    if (!label) return 0;

    const candidates = items.filter(
      it =>
        it.y < label.y &&
        label.y - it.y < 30 &&
        Math.abs(it.x - label.x) < 100 &&
        /^\d{1,4}$/.test(it.text.trim())
    );

    candidates.sort((a, b) => (label.y - a.y) - (label.y - b.y));
    if (candidates.length > 0) {
      const count = parseIntSafe(candidates[0].text.trim());
      if (count > 0) {
        logService.info(`[v2] Paketzahl: ${count}`, { runId, step: 'Footer' });
        return count;
      }
    }

    const inlineMatch = label.text.match(/packages\s*[\n\s]*(\d{1,4})/i);
    if (inlineMatch) {
      const count = parseIntSafe(inlineMatch[1]);
      logService.info(`[v2] Paketzahl (inline): ${count}`, { runId, step: 'Footer' });
      return count;
    }

    const groupedLines = page.groupedLines;
    for (let i = 0; i < groupedLines.length; i++) {
      if (/Number\s+of\s+packages/i.test(groupedLines[i].text)) {
        for (let j = i + 1; j < Math.min(i + 3, groupedLines.length); j++) {
          const numMatch = groupedLines[j].text.match(/(\d{1,4})/);
          if (numMatch) {
            const count = parseIntSafe(numMatch[1]);
            logService.info(`[v2] Paketzahl (grouped fallback): ${count}`, { runId, step: 'Footer' });
            return count;
          }
        }
        break;
      }
    }

    return 0;
  }

  private parseInvoiceTotalFromItems(page: ExtractedPage, runId: string): number {
    const groupedLines = page.groupedLines;

    for (let i = 0; i < groupedLines.length; i++) {
      if (CONTRIBUTO_MARKER.test(groupedLines[i].text) && i > 0) {
        const prevLine = groupedLines[i - 1].text;
        const priceMatch = prevLine.match(PRICE_VALUE_PATTERN);
        if (priceMatch) {
          const total = parsePrice(priceMatch[0]);
          logService.info(`[v2] Rechnungssumme (CONTRIBUTO): ${total}`, { runId, step: 'Footer' });
          return total;
        }
      }
    }

    for (let i = 0; i < groupedLines.length; i++) {
      if (AMOUNT_TO_PAY_MARKER.test(groupedLines[i].text)) {
        for (let j = i + 1; j < Math.min(i + 3, groupedLines.length); j++) {
          const priceMatch = groupedLines[j].text.match(PRICE_VALUE_PATTERN);
          if (priceMatch) {
            const total = parsePrice(priceMatch[0]);
            logService.info(`[v2] Rechnungssumme (AMOUNT TO PAY): ${total}`, { runId, step: 'Footer' });
            return total;
          }
        }
      }
    }

    logService.warn('[v2] Rechnungssumme nicht gefunden', { runId, step: 'Footer' });
    return 0;
  }

  // ═══════════════════════════════════════════════════════════════════
  // VALIDATION RULES
  // ═══════════════════════════════════════════════════════════════════

  private runValidation(
    header: ParsedInvoiceHeader,
    lines: ParsedInvoiceLine[]
  ): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Rule 1: qty_vs_packages
    const sumQty = lines.reduce((sum, l) => sum + l.quantityDelivered, 0);
    if (header.packagesCount == null) {
      results.push({
        ruleId: 'qty_vs_packages',
        ruleName: 'Quantity Sum vs Packages Count',
        passed: true,
        message: 'Paketzahl nicht verfuegbar — Pruefung uebersprungen',
        severity: 'info',
        details: { sumQty, packagesCount: null },
      });
    } else if (sumQty === header.packagesCount) {
      results.push({
        ruleId: 'qty_vs_packages',
        ruleName: 'Quantity Sum vs Packages Count',
        passed: true,
        message: `Mengensumme ${sumQty} == Paketzahl ${header.packagesCount}`,
        severity: 'info',
        details: { sumQty, packagesCount: header.packagesCount, difference: 0 },
      });
    } else {
      results.push({
        ruleId: 'qty_vs_packages',
        ruleName: 'Quantity Sum vs Packages Count',
        passed: false,
        message: `Mengensumme ${sumQty} != Paketzahl ${header.packagesCount} (Diff: ${Math.abs(sumQty - header.packagesCount)})`,
        severity: 'warning',
        details: { sumQty, packagesCount: header.packagesCount, difference: sumQty - header.packagesCount },
      });
    }

    // Rule 2: amount_vs_total
    const sumAmount = Math.round(lines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
    const invoiceTotal = header.invoiceTotal ?? 0;
    if (!invoiceTotal || invoiceTotal === 0) {
      results.push({
        ruleId: 'amount_vs_total',
        ruleName: 'Amount Sum vs Invoice Total',
        passed: true,
        message: 'Rechnungstotal nicht verfuegbar — Pruefung uebersprungen',
        severity: 'info',
        details: { sumAmount, invoiceTotal: null },
      });
    } else if (Math.abs(sumAmount - invoiceTotal) < 0.02) {
      results.push({
        ruleId: 'amount_vs_total',
        ruleName: 'Amount Sum vs Invoice Total',
        passed: true,
        message: `Preissumme ${sumAmount.toFixed(2)} == Rechnungstotal ${invoiceTotal.toFixed(2)}`,
        severity: 'info',
        details: { sumAmount, invoiceTotal, difference: 0 },
      });
    } else {
      results.push({
        ruleId: 'amount_vs_total',
        ruleName: 'Amount Sum vs Invoice Total',
        passed: false,
        message: `Preissumme ${sumAmount.toFixed(2)} != Rechnungstotal ${invoiceTotal.toFixed(2)} (Diff: ${Math.abs(sumAmount - invoiceTotal).toFixed(2)})`,
        severity: 'warning',
        details: { sumAmount, invoiceTotal, difference: sumAmount - invoiceTotal },
      });
    }

    return results;
  }
}
