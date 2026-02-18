/**
 * Fattura PDF Parser Service V3 — The Golden Anchor
 *
 * Final Fixes:
 * 1. Digit-Enforcer: isBlockStarter ONLY accepts article numbers containing at least one digit (kills "E.P.CAP").
 * 2. Aggressive Price Healing: normalizeEuropeanPrices removes ANY whitespace between digits and punctuation.
 * 3. Anywhere EANs: Removed word-boundaries to catch EANs glued to other text.
 * 4. Adjusted Zone Margins: -5px tolerance for X-anchors.
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
import { enrichOrderCandidates } from '../utils/ExtendedOrderRecognition';
import { parsePrice, parseIntSafe } from '../utils/priceParser';
import {
  INVOICE_NUMBER_PATTERNS,
  ARTICLE_PATTERNS,
  PRICE_VALUE_PATTERN,
  FATTURA_DATE,
  shouldSkipLine,
  isOrderReferenceLine,
} from '../constants/fatturaPatterns';

const Y_TOLERANCE = 5;

interface ZoneBounds { bodyStartY: number; bodyEndY: number; }
interface ColumnZones { descriptionX: number; qtyX: number; valid: boolean; }
interface ZonedItems { zone1: ExtractedTextItem[]; zone2: ExtractedTextItem[]; zone3: ExtractedTextItem[]; }
interface RowGroup { y: number; items: ExtractedTextItem[]; text: string; }
interface PositionBlock {
  articleNo: string;
  ean: string;
  descriptionParts: string[];
  pzQty: number;
  priceValues: number[];
  rawLines: string[];
  rows: RowGroup[];
}

// ─── 1. AGGRESSIVE PRICE HEALING ──────────────────────────────────────
function normalizeEuropeanPrices(text: string): string {
  // Pass 1: Fixes spaces around commas and dots (e.g., "3 . 596 , 00" -> "3.596,00")
  let result = text.replace(/(\d)\s*([.,])\s*(\d)/g, '$1$2$3');
  // Pass 2: Fixes space as thousand separator (e.g., "3 596,00" -> "3596,00")
  result = result.replace(/(\d)\s+(\d{3}(?:[,.]\d{2})?\b)/g, '$1$2');
  // Pass 3: Fixes "digits SPACE , digits" edge case
  result = result.replace(/(\d)\s+,\s*(\d)/g, '$1,$2');
  return result;
}

function smartJoinRowItems(items: ExtractedTextItem[], gapThreshold = 25): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let result = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const gap = curr.x - (prev.x + prev.width);
    result += (gap > gapThreshold) ? ' ' + curr.text : curr.text;
  }
  return result;
}

// ─── 2. DIGIT-ENFORCER & ANYWHERE EAN ──────────────────────────────────
function isBlockStarter(items: ExtractedTextItem[]): { articleNo: string; ean: string } | null {
  if (!items || items.length === 0) return null;
  const joined = items.map(it => it.text).join('');
  const spaceJoined = items.map(it => it.text).join(' ');

  // EAN Check
  const eanMatch = joined.match(/(803\d{10})/) || spaceJoined.match(/(803\d{10})/);
  const ean = eanMatch ? eanMatch[1] : '';

  let articleNo = '';

  // Korrigierter Digit-Enforcer & Regex-Check
  for (const item of items) {
    const text = item.text.trim();
    // Nur prüfen, wenn Text eine Zahl enthält und lang genug ist
    if (text.length >= 4 && /\d/.test(text)) {
      // Sicherheits-Check: Sicherstellen, dass pat eine valide Regex ist
      const match = ARTICLE_PATTERNS.some(pat => {
        return (pat instanceof RegExp) ? pat.test(text) : new RegExp(String(pat)).test(text);
      });
      
      if (match) {
        articleNo = text;
        break;
      }
    }
  }

  if (!articleNo && !ean) return null;
  return { articleNo, ean };
}

function classifyItemsByZone(items: ExtractedTextItem[], zones: ColumnZones): ZonedItems {
  if (!zones.valid) return { zone1: items, zone2: [], zone3: [] };
  const zone1: ExtractedTextItem[] = [];
  const zone2: ExtractedTextItem[] = [];
  const zone3: ExtractedTextItem[] = [];

  // -5px margin to prevent aggressive cutting
  for (const item of items) {
    if (item.x < zones.descriptionX - 5) zone1.push(item);
    else if (item.x < zones.qtyX - 5) zone2.push(item);
    else zone3.push(item);
  }
  return { zone1, zone2, zone3 };
}

function deriveOrderStatus(candidates: string[]): OrderStatus {
  if (candidates.length === 0) return 'NO';
  if (candidates.length === 1) return 'YES';
  return 'check';
}

// ─── 3. PARSER CLASS ─────────────────────────────────────────────────────
export class FatturaParserService_V3 implements InvoiceParser {
  public readonly moduleId = 'FatturaParserService_V3';
  public readonly moduleName = 'Fattura Falmec V3';
  public readonly version = '3.0.0';
  private orderTracker = new OrderBlockTracker();

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

      // 1. Header (page 1)
      const header = this.parseHeaderFromItems(pages[0]);

      // 2. Packages count (last page)
      const packagesCount = this.parsePackagesCountFromItems(pages[pages.length - 1].items);
      if (packagesCount > 0) {
        header.packagesCount = packagesCount;
      }

      // 3. Parse positions — STATEFUL TOP-TO-BOTTOM
      const { lines, warnings } = this.parsePositionsStateful(pages, activeRunId);

      // 4. Invoice total (last page)
      const invoiceTotal = this.parseInvoiceTotalFromItems(pages[pages.length - 1].items);
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

  // ═══════════════════════════════════════════════════════════════════
  // HEADER EXTRACTION
  // ═══════════════════════════════════════════════════════════════════

  private parseHeaderFromItems(page: ExtractedPage): ParsedInvoiceHeader {
    const items = page.items;
    const text = items.map(i => i.text).join(' ');

    let invoiceNumber = '';
    for (const { name, regex } of INVOICE_NUMBER_PATTERNS) {
      const m = text.match(regex);
      if (m) {
        invoiceNumber = name === 'FATTURA_NUMBER_FLEXIBLE'
          ? `${m[1]}.${m[2]}`
          : m[1];
        break;
      }
    }

    const dateMatch = text.match(FATTURA_DATE);
    const date = dateMatch ? dateMatch[1].replace(/\//g, '.') : '';

    return {
      fatturaNumber: invoiceNumber,
      fatturaDate: date,
      packagesCount: null,
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
    const descItem = page.items.find(it => it.text.toUpperCase().includes('DESCRIPTION'));
    const bodyStartY = descItem ? descItem.y + 10 : 120;

    const footerItem = page.items.find(it =>
      it.text.toUpperCase().includes('TOTAL EUR') ||
      it.text.toUpperCase().includes('INTRA') ||
      it.text.toUpperCase().includes('NET WEIGHT')
    );
    const bodyEndY = footerItem ? footerItem.y - 10 : 750;

    return { bodyStartY, bodyEndY };
  }

  private detectColumnZones(page: ExtractedPage, bodyStartY: number): ColumnZones {
    const headerItems = page.items.filter(it => Math.abs(it.y - (bodyStartY - 10)) <= Y_TOLERANCE * 3);
    const descItem = headerItems.find(it => it.text.toUpperCase().includes('DESCRIPTION'));
    const qtyItem = headerItems.find(it => it.text.toUpperCase().includes('Q.TY') || it.text.toUpperCase().includes('PZ'));

    if (!descItem || !qtyItem) return { descriptionX: 0, qtyX: Infinity, valid: false };
    return { descriptionX: descItem.x, qtyX: qtyItem.x, valid: true };
  }

  private groupItemsIntoRows(items: ExtractedTextItem[]): RowGroup[] {
    const rows: RowGroup[] = [];
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const item of sorted) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(item.y - lastRow.y) > Y_TOLERANCE) {
        rows.push({ y: item.y, items: [item], text: '' });
      } else {
        lastRow.items.push(item);
      }
    }
    rows.forEach(r => r.text = smartJoinRowItems(r.items));
    return rows;
  }

  private extractPricesFromText(text: string): number[] {
    const prices: number[] = [];
    const matches = [...text.matchAll(new RegExp(PRICE_VALUE_PATTERN.source, 'g'))];
    for (const match of matches) {
      const p = parsePrice(match[0]);
      if (p !== null && p > 0) prices.push(p);
    }
    return prices;
  }

  // ═══════════════════════════════════════════════════════════════════
  // POSITION PARSING — STATEFUL TOP-TO-BOTTOM
  // ═══════════════════════════════════════════════════════════════════

  private parsePositionsStateful(pages: ExtractedPage[], runId: string) {
    const enrichedLines: ParsedInvoiceLine[] = [];
    const allWarnings: ParserWarning[] = [];
    let posIndex = 1;
    let currentBlock: PositionBlock | null = null;
    const orders: string[] = [];

    const commitBlock = () => {
      if (!currentBlock || currentBlock.pzQty <= 0) return;

      const prices = currentBlock.priceValues;
      if (prices.length < 2) return;
      const unitPrice = prices.length >= 2 ? prices[prices.length - 2] : prices[0];
      const totalPrice = prices[prices.length - 1];

      const orderCandidates = [...orders];
      const orderStatus = deriveOrderStatus(orderCandidates);

      enrichedLines.push({
        positionIndex: posIndex++,
        manufacturerArticleNo: currentBlock.articleNo || 'N/A',
        ean: currentBlock.ean || 'N/A',
        descriptionIT: currentBlock.descriptionParts.join(' ').trim(),
        quantityDelivered: currentBlock.pzQty,
        unitPrice,
        totalPrice,
        orderCandidates,
        orderCandidatesText: orderCandidates.join('|'),
        orderStatus,
        rawPositionText: currentBlock.rawLines.join(' | '),
      });
      currentBlock = null;
    };

    for (const page of pages) {
      const zone = this.detectZone(page);
      const cols = this.detectColumnZones(page, zone.bodyStartY);
      const bodyItems = page.items.filter(it => it.y >= zone.bodyStartY && it.y <= zone.bodyEndY);
      const rows = this.groupItemsIntoRows(bodyItems);

      for (const row of rows) {
        if (shouldSkipLine(row.text)) continue;

        if (isOrderReferenceLine(row.text)) {
          commitBlock();
          this.orderTracker.startNewBlock(extractOrderReferences(row.text));
          orders.splice(0, orders.length, ...this.orderTracker.getCurrentOrders());
          continue;
        }

        const zoned = classifyItemsByZone(row.items, cols);
        const starter = isBlockStarter(zoned.zone1);

        if (starter) {
          if (currentBlock && currentBlock.pzQty > 0) commitBlock();
          if (!currentBlock) {
            currentBlock = { articleNo: starter.articleNo, ean: starter.ean, descriptionParts: [], pzQty: 0, priceValues: [], rawLines: [], rows: [] };
          } else {
            if (starter.articleNo && !currentBlock.articleNo) currentBlock.articleNo = starter.articleNo;
            if (starter.ean && !currentBlock.ean) currentBlock.ean = starter.ean;
          }
        }

        if (!currentBlock) currentBlock = { articleNo: '', ean: '', descriptionParts: [], pzQty: 0, priceValues: [], rawLines: [], rows: [] };

        // Track raw text
        currentBlock.rawLines.push(row.text);

        const normalizedText = normalizeEuropeanPrices(row.text);
        const zone3Text = normalizeEuropeanPrices(smartJoinRowItems(zoned.zone3));

        // Implicit Commit: 2nd PZ on same block
        const pzMatch = zone3Text.match(/PZ\s+(\d+)/i) || normalizedText.match(/PZ\s+(\d+)/i);
        if (pzMatch) {
          const qty = parseIntSafe(pzMatch[1]);
          if (currentBlock.pzQty > 0) {
            commitBlock();
            currentBlock = { articleNo: '', ean: '', descriptionParts: [], pzQty: qty, priceValues: [], rawLines: [row.text], rows: [] };
          } else {
            currentBlock.pzQty = qty;
          }
        }

        // Anywhere EAN fallback
        if (!currentBlock.ean) {
          const eanFallback = normalizedText.match(/(803\d{10})/);
          if (eanFallback) currentBlock.ean = eanFallback[1];
        }

        const extractedPrices = zoned.zone3.length > 0 ? this.extractPricesFromText(zone3Text) : this.extractPricesFromText(normalizedText);
        currentBlock.priceValues.push(...extractedPrices);

        let descText = zoned.zone2.length > 0 ? smartJoinRowItems(zoned.zone2) : normalizedText;
        descText = descText.replace(/PZ\s+\d+/gi, '').replace(new RegExp(PRICE_VALUE_PATTERN.source, 'g'), '').trim();
        if (descText) currentBlock.descriptionParts.push(descText);
      }
    }
    commitBlock();

    return { lines: enrichedLines, warnings: allWarnings };
  }

  // ═══════════════════════════════════════════════════════════════════
  // HEADER HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private parsePackagesCountFromItems(items: ExtractedTextItem[]): number {
    const text = items.map(i => i.text).join(' ');
    const match = text.match(/packages\s*(\d{1,4})/i);
    return match ? parseIntSafe(match[1]) : 0;
  }

  private parseInvoiceTotalFromItems(items: ExtractedTextItem[]): number {
    const text = normalizeEuropeanPrices(items.map(i => i.text).join(' '));
    const match = text.match(/(?:CONTRIBUTO\s+AMBIENTALE|AMOUNT\s+.*TO\s+PAY|TOTAL\s+EUR).*?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    return match ? parsePrice(match[1]) || 0 : 0;
  }

  // ═══════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════

  private runValidation(header: ParsedInvoiceHeader, lines: ParsedInvoiceLine[]): ValidationResult[] {
    const results: ValidationResult[] = [];
    const sumAmount = Math.round(lines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
    if (header.invoiceTotal && Math.abs(sumAmount - header.invoiceTotal) >= 0.02) {
      results.push({
        ruleId: 'amount_vs_total',
        ruleName: 'Amount vs Total',
        passed: false,
        message: `Preissumme ${sumAmount.toFixed(2)} weicht von Rechnungstotal ${header.invoiceTotal.toFixed(2)} ab (Diff: ${Math.abs(sumAmount - header.invoiceTotal).toFixed(2)})`,
        severity: 'error',
      });
    }
    return results;
  }
}
