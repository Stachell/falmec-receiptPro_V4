/**
 * FatturaParser_Master — Coordinate-Based Invoice Parser
 *
 * Evolved from V3 (PROJ-14 Phase E). This is the sole production parser and the
 * technological foundation for all future parser modules in this project.
 *
 * Deterministic extraction using vendor profile column bands and PZ-anchor detection.
 * Single top-down pass per page ensures correct order block → line item assignment.
 *
 * Column Bands (X-ranges in PDF points, page width = 595):
 *   LEFT_COL:    10–82   (article numbers, EAN codes)
 *   DESCRIPTION: 82–400  (product text, order headers)
 *   UM:          400–425 ("PZ" anchor)
 *   QTY:         425–470 (quantity)
 *   UNIT_PRICE:  470–520 (unit price EUR)
 *   TOTAL_PRICE: 520–560 (line total EUR)
 */

import { logService } from '../../logService';
import type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParsedInvoiceHeader,
  ParsedInvoiceLine,
  ParserWarning,
  ValidationResult,
  OrderStatus,
} from '../types';
import {
  extractTextFromPDF,
  type ExtractedPage,
  type ExtractedTextItem,
} from '../utils/pdfTextExtractor';
import { OrderBlockTracker, extractOrderReferences } from '../utils/OrderBlockTracker';
import { parsePrice, parseIntSafe } from '../utils/priceParser';

// ─── COORDINATE CONSTANTS (from vendor profile & coordinate-map) ─────────

const PAGE_HEIGHT = 841; // A4 height in points
const Y_TOL = 5;         // ±5pt for "same line" matching
const NUM_BLOCK_SCAN = 25; // scan 25pt below PZ for number block

/** Column band X-ranges */
const COL = {
  LEFT_COL:    { xMin: 10,  xMax: 82  },
  DESCRIPTION: { xMin: 82,  xMax: 400 },
  UM:          { xMin: 400, xMax: 425 },
  QTY:         { xMin: 425, xMax: 470 },
  UNIT_PRICE:  { xMin: 470, xMax: 520 },
  TOTAL_PRICE: { xMin: 515, xMax: 560 },  // widened from 520 for "31.000,00" at x=518
} as const;

/** Header coordinate regions (top-down Y) */
const HEADER = {
  invoiceNumber: { xMin: 420, xMax: 470, yMin: 235, yMax: 255 },
  invoiceDate:   { xMin: 470, xMax: 535, yMin: 235, yMax: 255 },
};

/** Footer coordinate regions (top-down Y, last page only) */
const FOOTER = {
  packagesValue:    { xMin: 25,  xMax: 65,  yMin: 722, yMax: 745 },
  totalGoodsValue:  { xMin: 315, xMax: 385, yMin: 722, yMax: 745 },
  invoiceTotalValue:{ xMin: 485, xMax: 560, yMin: 722, yMax: 800 },
  dueDate:          { xMin: 290, xMax: 350, yMin: 780, yMax: 800 },
};

/** Regex patterns */
const PAT = {
  invoiceNumber: /(\d{2}\.\d{3})/,
  invoiceDate:   /(\d{2}\/\d{2}\/\d{4})/,
  ean:           /(803\d{10})/,
  eurPrice:      /([\d.]+,\d{2})/,
  quantity:       /^(\d+)$/,
  vsOrder:       /Vs\.\s+ORDINE/i,
  nsOrder:       /Ns\.\s+ORDINE/i,
  orderBlock:    /(?:Vs\.|Ns\.)\s+ORDINE\s+(?:ESTERO|WEB\s*\(?NET-PORTAL\)?|SOSTITUZ\.\/RICAMBI)\s+Nr\.?\s*(.+?)\s+del\s+(\d{2}\/\d{2}\/\d{4})/i,
  articleNumber: /^([A-Z][A-Z0-9]+(?:[.#\/][A-Z0-9#]+)*)/,
};

// ─── HELPER TYPES ────────────────────────────────────────────────────────

interface TopDownItem {
  text: string;
  x: number;       // original X from pdfjs
  topY: number;    // converted top-down Y
  width: number;
  height: number;
}

interface Row {
  y: number;        // representative topDownY
  items: TopDownItem[];
}

// ─── PURE HELPERS ────────────────────────────────────────────────────────

/** Convert pdfjs bottom-up Y to top-down Y */
function toTopDown(pdfjsY: number): number {
  return PAGE_HEIGHT - pdfjsY;
}

/** Check if item X falls within a column band */
function inCol(x: number, col: { xMin: number; xMax: number }): boolean {
  return x >= col.xMin && x <= col.xMax;
}

/** Check if item is within a coordinate region */
function inRegion(item: TopDownItem, region: { xMin: number; xMax: number; yMin: number; yMax: number }): boolean {
  return item.x >= region.xMin && item.x <= region.xMax && item.topY >= region.yMin && item.topY <= region.yMax;
}

/** Parse European price string: "1.758,00" → 1758.00 */
function parseEurPrice(text: string): number | null {
  const match = text.match(PAT.eurPrice);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, '').replace(',', '.');
  const value = parseFloat(normalized);
  return isNaN(value) ? null : value;
}

/** Convert ExtractedTextItem[] to TopDownItem[] sorted by topY ascending */
function convertAndSort(items: ExtractedTextItem[]): TopDownItem[] {
  return items
    .map(it => ({
      text: it.text,
      x: it.x,
      topY: toTopDown(it.y),
      width: it.width,
      height: it.height,
    }))
    .sort((a, b) => a.topY - b.topY || a.x - b.x);
}

/** Group sorted TopDownItems into rows by Y-proximity (±Y_TOL) */
function groupIntoRows(items: TopDownItem[]): Row[] {
  const rows: Row[] = [];
  for (const item of items) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(item.topY - last.y) <= Y_TOL) {
      last.items.push(item);
    } else {
      rows.push({ y: item.topY, items: [item] });
    }
  }
  return rows;
}

/** Get full text of a row (items sorted by X, space-separated) */
function rowText(row: Row): string {
  return [...row.items].sort((a, b) => a.x - b.x).map(it => it.text).join(' ');
}

/** Get items in a specific column band from a row, sorted by X */
function colItems(row: Row, col: { xMin: number; xMax: number }): TopDownItem[] {
  return row.items.filter(it => inCol(it.x, col)).sort((a, b) => a.x - b.x);
}

/**
 * Concatenate adjacent items into a single string.
 * pdfjs often splits article numbers like "CPON90.E" + "11" + "P2#EUB490F"
 * into separate text items. We join them (no space if gap < 3pt).
 */
function concatItemsText(items: TopDownItem[]): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let result = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.x - (prev.x + prev.width);
    result += (gap > 3 ? ' ' : '') + curr.text;
  }
  return result;
}

/** Derive OrderStatus from candidate count */
function deriveOrderStatus(candidates: string[]): OrderStatus {
  if (candidates.length === 0) return 'NO';
  if (candidates.length === 1) return 'YES';
  return 'check';
}

// ─── PARSER CLASS ────────────────────────────────────────────────────────

export class FatturaParser_Master implements InvoiceParser {
  public readonly moduleId = 'FatturaParser_Master';
  public readonly moduleName = 'fatturaParser_master';
  public readonly version = '3.1.0';
  private orderTracker = new OrderBlockTracker();

  // ── canHandle: Falmec-Türsteher ──────────────────────────────────────

  async canHandle(pdfFile: File): Promise<boolean> {
    try {
      const pages = await extractTextFromPDF(pdfFile);
      if (pages.length === 0) return false;
      const text = pages[0].fullText.toUpperCase();
      return (
        text.includes('FALMEC SPA') ||
        text.includes('WWW.FALMEC.COM') ||
        text.includes('02344900267')
      );
    } catch {
      return false;
    }
  }

  // ── parseInvoice ─────────────────────────────────────────────────────

  async parseInvoice(pdfFile: File, runId?: string): Promise<ParsedInvoiceResult> {
    const activeRunId = runId || `fallback_${Date.now()}`;
    const startTime = Date.now();

    logService.info(`[v3] PDF-Parsing gestartet: ${pdfFile.name}`, {
      runId: activeRunId,
      step: 'Rechnung auslesen',
      details: `Dateigroesse: ${(pdfFile.size / 1024).toFixed(2)} KB`,
    });

    try {
      const pages = await extractTextFromPDF(pdfFile);
      logService.info(`${pages.length} Seiten extrahiert`, { runId: activeRunId });

      // Reset order tracker for fresh parse
      this.orderTracker.reset();

      // 1. Header (page 1)
      const header = this.extractHeader(pages[0]);

      // 2. Body: single-pass extraction across all pages
      const { lines, warnings } = this.extractBody(pages, activeRunId);

      // 3. Footer (last page)
      const lastPage = pages[pages.length - 1];
      const footer = this.extractFooter(lastPage);

      // 4. Populate header summary fields
      header.totalQty = lines.reduce((sum, l) => sum + l.quantityDelivered, 0);
      header.parsedPositionsCount = lines.length;
      header.pzCount = lines.length;
      header.packagesCount = footer.packages;
      header.invoiceTotal = footer.invoiceTotal;

      if (header.packagesCount && header.totalQty > 0) {
        header.qtyValidationStatus =
          header.totalQty === header.packagesCount ? 'ok' : 'mismatch';
      } else {
        header.qtyValidationStatus = 'unknown';
      }

      // 5. Validation rules
      const validationResults = this.runValidation(header, lines, footer);

      // 6. Standard warnings
      if (header.qtyValidationStatus === 'mismatch') {
        warnings.push({
          code: 'QTY_SUM_MISMATCH',
          message: `Mengensumme ${header.totalQty} != Paketzahl ${header.packagesCount}`,
          severity: 'warning',
        });
      }

      if (footer.invoiceTotal > 0) {
        const sumAmount = Math.round(lines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
        const priceDiff = Math.abs(sumAmount - footer.invoiceTotal);
        if (priceDiff > 0.02) {
          warnings.push({
            code: 'PRICE_SUM_MISMATCH',
            message: `Preissumme ${sumAmount.toFixed(2)} != Rechnungstotal ${footer.invoiceTotal.toFixed(2)} (Diff: ${priceDiff.toFixed(2)})`,
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
        `[v3] PDF-Parsing abgeschlossen (${duration}ms): ${lines.length} Positionen, ${header.totalQty} Gesamtmenge`,
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
      logService.error(`[v3] PDF-Parsing fehlgeschlagen: ${errorMsg}`, {
        runId: activeRunId,
        details: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`PDF-Parsing fehlgeschlagen: ${errorMsg}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HEADER EXTRACTION (Page 1 only, coordinate-based)
  // ═══════════════════════════════════════════════════════════════════════

  private extractHeader(page: ExtractedPage): ParsedInvoiceHeader {
    const allItems = convertAndSort(page.items);

    let invoiceNumber = '';
    let invoiceDate = '';

    // Find invoice number in coordinate region
    for (const item of allItems) {
      if (inRegion(item, HEADER.invoiceNumber)) {
        const m = item.text.match(PAT.invoiceNumber);
        if (m) { invoiceNumber = m[1]; break; }
      }
    }

    // Find invoice date in coordinate region
    for (const item of allItems) {
      if (inRegion(item, HEADER.invoiceDate)) {
        const m = item.text.match(PAT.invoiceDate);
        if (m) { invoiceDate = m[1].replace(/\//g, '.'); break; }
      }
    }

    return {
      fatturaNumber: invoiceNumber,
      fatturaDate: invoiceDate,
      packagesCount: null,
      invoiceTotal: 0,
      totalQty: 0,
      parsedPositionsCount: 0,
      qtyValidationStatus: 'unknown',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BODY EXTRACTION — Single top-down pass per page
  // ═══════════════════════════════════════════════════════════════════════

  private extractBody(pages: ExtractedPage[], runId: string): { lines: ParsedInvoiceLine[]; warnings: ParserWarning[] } {
    const lines: ParsedInvoiceLine[] = [];
    const warnings: ParserWarning[] = [];
    let posIndex = 1;

    for (const page of pages) {
      // Convert all items to top-down and sort
      const allItems = convertAndSort(page.items);

      // Detect body boundaries on this page
      const { bodyStartY, bodyEndY } = this.detectBodyBounds(allItems);

      // Filter to body area items only
      const bodyItems = allItems.filter(it => it.topY > bodyStartY && it.topY < bodyEndY);

      // Group into rows
      const rows = groupIntoRows(bodyItems);

      // Single top-down pass
      for (let ri = 0; ri < rows.length; ri++) {
        const row = rows[ri];
        const text = rowText(row);

        // Check for order block line (Vs. or Ns. ORDINE)
        if (PAT.vsOrder.test(text)) {
          // "Vs." line — update active order block
          // Normalize "N r." → "Nr." (pdfjs text splitting artifact)
          const normalizedText = text.replace(/N\s+r\./g, 'Nr.');
          const refs = extractOrderReferences(normalizedText);
          this.orderTracker.startNewBlock(refs);
          continue;
        }
        if (PAT.nsOrder.test(text)) {
          // "Ns." line — informational only, do NOT update tracker
          continue;
        }

        // Check for PZ anchor in UM column band
        const pzItems = colItems(row, COL.UM);
        const hasPZ = pzItems.some(it => it.text.trim().toUpperCase() === 'PZ');

        if (!hasPZ) continue; // Not a line item row

        // ── This is a LINE ITEM row ──

        // Extract quantity from QTY column (same row ±Y_TOL)
        const qtyRaw = this.findValueInBand(rows, ri, COL.QTY);
        const quantity = qtyRaw ? parseIntSafe(qtyRaw) : 0;

        // Extract unit price from UNIT_PRICE column (same row ±Y_TOL)
        const unitPriceRaw = this.findValueInBand(rows, ri, COL.UNIT_PRICE);
        const unitPriceParsed = unitPriceRaw ? parseEurPrice(unitPriceRaw) : null;

        // Extract total price from TOTAL_PRICE column (same row ±Y_TOL)
        const totalPriceRaw = this.findValueInBand(rows, ri, COL.TOTAL_PRICE);
        const totalPriceParsed = totalPriceRaw ? parseEurPrice(totalPriceRaw) : null;

        // Handle missing unit price (Position 31 edge case)
        let unitPrice = unitPriceParsed ?? 0;
        let totalPrice = totalPriceParsed ?? 0;
        const itemWarnings: string[] = [];

        if (unitPrice === 0 && totalPrice > 0 && quantity > 0) {
          unitPrice = Math.round((totalPrice / quantity) * 100) / 100;
          itemWarnings.push(`Unit price calculated: ${totalPrice} / ${quantity} = ${unitPrice}`);
        }

        // Extract number block (article + EAN)
        const numberBlock = this.extractNumberBlock(row, rows, ri, bodyItems);

        // Extract description
        const description = this.extractDescription(row, rows, ri);

        // Get current order assignment
        const orderCandidates = [...this.orderTracker.getOrdersForPosition()];
        const orderStatus = deriveOrderStatus(orderCandidates);

        lines.push({
          positionIndex: posIndex++,
          manufacturerArticleNo: numberBlock.articleNumber || 'N/A',
          ean: numberBlock.ean || 'N/A',
          descriptionIT: description,
          quantityDelivered: quantity,
          unitPrice,
          totalPrice,
          orderCandidates,
          orderCandidatesText: orderCandidates.join('|'),
          orderStatus,
          rawPositionText: text,
        });

        if (itemWarnings.length > 0) {
          for (const w of itemWarnings) {
            warnings.push({
              code: 'CALCULATED_UNIT_PRICE',
              message: w,
              severity: 'warning',
              positionIndex: posIndex - 1,
            });
          }
        }
      }
    }

    return { lines, warnings };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // BODY BOUNDS DETECTION
  // ═══════════════════════════════════════════════════════════════════════

  private detectBodyBounds(allItems: TopDownItem[]): { bodyStartY: number; bodyEndY: number } {
    // Body starts below "DESCRIPTION" header text
    let bodyStartY = 289; // default from coordinate map
    for (const item of allItems) {
      if (item.text.toUpperCase() === 'DESCRIPTION' && item.topY > 280 && item.topY < 300) {
        bodyStartY = item.topY;
        break;
      }
    }

    // Body ends above "Number of packages" or "Continues..."
    let bodyEndY = 717; // default
    for (const item of allItems) {
      if (/^Number\s+of/i.test(item.text) && item.topY > 700) {
        bodyEndY = item.topY;
        break;
      }
    }
    // Also check for "Continues..." as alternative end marker
    for (const item of allItems) {
      if (/^Continues/i.test(item.text) && item.topY > 780) {
        if (bodyEndY === 717) bodyEndY = item.topY; // only if "Number of packages" not found
        break;
      }
    }

    return { bodyStartY, bodyEndY };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VALUE EXTRACTION — find value in column band near PZ row
  // ═══════════════════════════════════════════════════════════════════════

  /** Find a value in a column band on the PZ row or within ±Y_TOL of adjacent rows */
  private findValueInBand(rows: Row[], pzRowIdx: number, col: { xMin: number; xMax: number }): string | null {
    const pzRow = rows[pzRowIdx];

    // First: check items directly in the PZ row
    const directItems = colItems(pzRow, col);
    if (directItems.length > 0) {
      return directItems[0].text.trim();
    }

    // Second: check the next row (split-line case, e.g., Position 7 where prices are 3.7pt below PZ)
    if (pzRowIdx + 1 < rows.length) {
      const nextRow = rows[pzRowIdx + 1];
      if (Math.abs(nextRow.y - pzRow.y) <= Y_TOL) {
        const nextItems = colItems(nextRow, col);
        if (nextItems.length > 0) {
          return nextItems[0].text.trim();
        }
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DYNAMIC BOUNDARY — find next PZ or order block below current row
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Finds the Y-coordinate of the next logical boundary below the current PZ row.
   * A boundary is either the next PZ line item or the next order block header.
   * Returns null if this is the last item on the page.
   */
  private findNextBoundaryY(rows: Row[], pzRowIdx: number): number | null {
    const pzY = rows[pzRowIdx].y;
    for (let i = pzRowIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.y <= pzY) continue;
      const text = rowText(row);
      // Next PZ line = next line item
      const pzItems = colItems(row, COL.UM);
      if (pzItems.some(it => it.text.trim().toUpperCase() === 'PZ')) return row.y;
      // Order block header = next block
      if (PAT.vsOrder.test(text) || PAT.nsOrder.test(text)) return row.y;
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NUMBER BLOCK EXTRACTION (Article + EAN)
  // ═══════════════════════════════════════════════════════════════════════

  private extractNumberBlock(
    pzRow: Row,
    allRows: Row[],
    pzRowIdx: number,
    bodyItems: TopDownItem[]
  ): { articleNumber: string | null; ean: string | null; status: string } {
    let articleNumber: string | null = null;
    let ean: string | null = null;

    // 1. Check LEFT_COL items on PZ row — concatenate split pdfjs items
    const leftOnPzLine = colItems(pzRow, COL.LEFT_COL);

    if (leftOnPzLine.length > 0) {
      const allLeftText = concatItemsText(leftOnPzLine);
      const eanOnPzLine = allLeftText.match(PAT.ean);

      if (eanOnPzLine) {
        // Compound article+EAN (Pattern B: "KACL.943 8034122710938")
        ean = eanOnPzLine[1];
        const beforeEan = allLeftText.substring(0, allLeftText.indexOf(ean)).trim();
        if (beforeEan) {
          articleNumber = beforeEan;
        }
      } else {
        // No EAN on PZ line — entire LEFT_COL text is article number
        if (allLeftText.length >= 4 && /\d/.test(allLeftText)) {
          articleNumber = allLeftText;
        }
      }
    }

    // Also check if the next row within ±Y_TOL has LEFT_COL items (split line)
    if (!articleNumber && pzRowIdx + 1 < allRows.length) {
      const nextRow = allRows[pzRowIdx + 1];
      if (Math.abs(nextRow.y - pzRow.y) <= Y_TOL) {
        const leftNext = colItems(nextRow, COL.LEFT_COL);
        if (leftNext.length > 0) {
          const text = concatItemsText(leftNext);
          if (!PAT.ean.test(text) && text.length >= 4 && /\d/.test(text)) {
            articleNumber = text;
          }
        }
      }
    }

    // 2. Scan number block below PZ line (dynamic boundary)
    if (!ean) {
      const pzY = pzRow.y;
      const nextBoundary = this.findNextBoundaryY(allRows, pzRowIdx);
      const scanLimit = nextBoundary !== null ? nextBoundary - 2 : pzY + 80;
      const blockItems = bodyItems.filter(it =>
        it.topY > pzY + 2 && it.topY < scanLimit && inCol(it.x, COL.LEFT_COL)
      );

      if (blockItems.length > 0) {
        // Concatenate split pdfjs items (e.g., "80341227" + "11317" → "8034122711317")
        const blockText = concatItemsText(blockItems);
        const eanMatch = blockText.match(PAT.ean);

        if (eanMatch) {
          ean = eanMatch[1];
          if (!articleNumber) {
            const beforeEan = blockText.substring(0, blockText.indexOf(ean)).trim();
            if (beforeEan && beforeEan.length >= 4 && /\d/.test(beforeEan)) {
              articleNumber = beforeEan;
            }
          }
        } else if (!articleNumber) {
          if (blockText.length >= 4 && /\d/.test(blockText)) {
            articleNumber = blockText;
          }
        }
      }
    }

    // Determine status
    let status: string = 'red';
    if (articleNumber && ean) status = 'green';
    else if (articleNumber || ean) status = 'yellow';

    return { articleNumber, ean, status };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DESCRIPTION EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════

  private extractDescription(pzRow: Row, allRows: Row[], pzRowIdx: number): string {
    // Get description text from DESCRIPTION column on PZ row
    const descItems = colItems(pzRow, COL.DESCRIPTION);
    const parts: string[] = [];

    if (descItems.length > 0) {
      parts.push(descItems.map(it => it.text).join(' '));
    }

    return parts.join(' ').trim();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FOOTER EXTRACTION (last page only)
  // ═══════════════════════════════════════════════════════════════════════

  private extractFooter(page: ExtractedPage): { packages: number; totalGoods: number; invoiceTotal: number; dueDate: string } {
    const allItems = convertAndSort(page.items);

    let packages = 0;
    let totalGoods = 0;
    let invoiceTotal = 0;
    let dueDate = '';

    // Check if this is actually the last page (no "Continues...")
    const hasContinues = allItems.some(it => /^Continues/i.test(it.text));
    if (hasContinues) {
      return { packages: 0, totalGoods: 0, invoiceTotal: 0, dueDate: '' };
    }

    // Package count
    for (const item of allItems) {
      if (inRegion(item, FOOTER.packagesValue)) {
        const m = item.text.match(/^(\d+)$/);
        if (m) { packages = parseInt(m[1], 10); break; }
      }
    }

    // Total goods value
    for (const item of allItems) {
      if (inRegion(item, FOOTER.totalGoodsValue)) {
        const p = parseEurPrice(item.text);
        if (p !== null) { totalGoods = p; break; }
      }
    }

    // Invoice total (scan wider area)
    for (const item of allItems) {
      if (inRegion(item, FOOTER.invoiceTotalValue)) {
        const p = parseEurPrice(item.text);
        if (p !== null) { invoiceTotal = p; break; }
      }
    }

    // Due date
    for (const item of allItems) {
      if (inRegion(item, FOOTER.dueDate)) {
        const m = item.text.match(PAT.invoiceDate);
        if (m) { dueDate = m[1]; break; }
      }
    }

    return { packages, totalGoods, invoiceTotal, dueDate };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════

  private runValidation(
    header: ParsedInvoiceHeader,
    lines: ParsedInvoiceLine[],
    footer: { packages: number; totalGoods: number; invoiceTotal: number }
  ): ValidationResult[] {
    const results: ValidationResult[] = [];

    // Rule 1: Position sum vs invoice total
    const sumAmount = Math.round(lines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
    if (footer.invoiceTotal > 0) {
      const diff = Math.abs(sumAmount - footer.invoiceTotal);
      results.push({
        ruleId: 'POSITION_SUM_VS_TOTAL',
        ruleName: 'Position Sum vs Invoice Total',
        passed: diff <= 0.02,
        message: diff <= 0.02
          ? `Preissumme ${sumAmount.toFixed(2)} == Rechnungstotal ${footer.invoiceTotal.toFixed(2)}`
          : `Preissumme ${sumAmount.toFixed(2)} != Rechnungstotal ${footer.invoiceTotal.toFixed(2)} (Diff: ${diff.toFixed(2)})`,
        severity: diff <= 0.02 ? 'info' : 'error',
      });
    }

    // Rule 2: Quantity sum vs package count
    if (footer.packages > 0) {
      const qtySum = lines.reduce((sum, l) => sum + l.quantityDelivered, 0);
      results.push({
        ruleId: 'QUANTITY_SUM_VS_PACKAGES',
        ruleName: 'Quantity Sum vs Package Count',
        passed: qtySum === footer.packages,
        message: qtySum === footer.packages
          ? `Mengensumme ${qtySum} == Paketzahl ${footer.packages}`
          : `Mengensumme ${qtySum} != Paketzahl ${footer.packages}`,
        severity: qtySum === footer.packages ? 'info' : 'error',
      });
    }

    // Rule 3: Line item price check
    let priceCheckFailed = false;
    for (const line of lines) {
      const expected = Math.round(line.quantityDelivered * line.unitPrice * 100) / 100;
      const diff = Math.abs(expected - line.totalPrice);
      if (diff > 0.02) {
        priceCheckFailed = true;
        results.push({
          ruleId: 'LINE_ITEM_PRICE_CHECK',
          ruleName: `Price Check Pos ${line.positionIndex}`,
          passed: false,
          message: `Pos ${line.positionIndex}: ${line.quantityDelivered} x ${line.unitPrice.toFixed(2)} = ${expected.toFixed(2)} != ${line.totalPrice.toFixed(2)}`,
          severity: 'warning',
        });
      }
    }
    if (!priceCheckFailed) {
      results.push({
        ruleId: 'LINE_ITEM_PRICE_CHECK',
        ruleName: 'Line Item Price Check',
        passed: true,
        message: 'All line items: qty x unitPrice == totalPrice',
        severity: 'info',
      });
    }

    return results;
  }
}
