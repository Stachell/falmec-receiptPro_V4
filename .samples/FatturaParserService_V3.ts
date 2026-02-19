/**
 * Fattura PDF Parser Service V3 — The Golden Anchor
 * * Final Fixes:
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
  CONTRIBUTO_MARKER,
  AMOUNT_TO_PAY_MARKER,
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
  // Fixes spaces around commas and dots (e.g., "3 . 596 , 00" -> "3.596,00")
  let result = text.replace(/(\d)\s*([.,])\s*(\d)/g, '$1$2$3');
  // Fixes space as thousand separator (e.g., "3 596,00" -> "3596,00")
  result = result.replace(/(\d)\s+(\d{3}(?:[,.]\d{2})?\b)/g, '$1$2');
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

  // Anywhere EAN (no \b boundaries)
  const eanMatch = joined.match(/(803\d{10})/) || spaceJoined.match(/(803\d{10})/);
  const ean = eanMatch ? eanMatch[1] : '';

  let articleNo = '';

  // Only accept items that contain AT LEAST ONE DIGIT (kills E.P.CAP)
  for (const item of items) {
    const text = item.text.trim();
    if (text.length >= 4 && /\d/.test(text)) {
      if (ARTICLE_PATTERNS.some(pat => pat.test(text))) {
        articleNo = text;
        break;
      }
    }
  }

  // Fallback for hashes
  if (!articleNo) {
    const hashMatch = spaceJoined.match(/[A-Z0-9.\-_]+#[A-Z0-9]+/);
    if (hashMatch && /\d/.test(hashMatch[0])) {
      articleNo = hashMatch[0];
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

export class FatturaParserService_V3 implements InvoiceParser {
  public readonly moduleId = 'FatturaParserService_V3';
  public readonly name = 'Fattura Falmec V3 v3.0.0';
  public readonly provider = 'Falmec';
  private orderTracker = new OrderBlockTracker();

  async parseInvoice(pdfFile: File, runId?: string): Promise<ParsedInvoiceResult> {
    const activeRunId = runId || `fallback_${Date.now()}`;
    try {
      const pages = await extractTextFromPDF(pdfFile);
      const header = this.parseHeaderFromItems(pages[0].items);
      const { lines, warnings } = this.parsePositionsStateful(pages, header, activeRunId);
      const validation = this.runValidation(lines, header);
      
      return { header, lines, validation, warnings };
    } catch (error) {
      logService.error(`[v3] PDF-Parsing failed`, { runId: activeRunId });
      throw error;
    }
  }

  private parseHeaderFromItems(items: ExtractedTextItem[]): ParsedInvoiceHeader {
    const text = items.map(i => i.text).join(' ');
    let invoiceNumber = '';
    for (const pat of INVOICE_NUMBER_PATTERNS) {
      const m = text.match(pat);
      if (m) { invoiceNumber = m[1].trim(); break; }
    }
    const dateMatch = text.match(FATTURA_DATE);
    const date = dateMatch ? dateMatch[1] : '';
    
    return {
      invoiceNumber,
      invoiceDate: date,
      packagesCount: this.parsePackagesCountFromItems(items),
      invoiceTotal: this.parseInvoiceTotalFromItems(items),
    };
  }

  private detectZone(page: ExtractedPage): ZoneBounds {
    const descItem = page.items.find(it => it.text.toUpperCase().includes('DESCRIPTION'));
    const amountItem = page.items.find(it => it.text.toUpperCase().includes('AMOUNT'));
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

  private parsePositionsStateful(pages: ExtractedPage[], header: ParsedInvoiceHeader, runId: string) {
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

      enrichedLines.push({
        positionIndex: posIndex++,
        articleNo: currentBlock.articleNo || 'N/A',
        ean: currentBlock.ean || 'N/A',
        descriptionIT: currentBlock.descriptionParts.join(' ').trim(),
        qty: currentBlock.pzQty,
        unitPrice,
        totalPrice,
        orderReferences: [...orders]
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

        const normalizedText = normalizeEuropeanPrices(row.text);
        const zone3Text = normalizeEuropeanPrices(smartJoinRowItems(zoned.zone3));
        
        // Implicit Commit: 2nd PZ on same block
        const pzMatch = zone3Text.match(/PZ\s+(\d+)/i) || normalizedText.match(/PZ\s+(\d+)/i);
        if (pzMatch) {
          const qty = parseIntSafe(pzMatch[1]);
          if (currentBlock.pzQty > 0) {
            commitBlock();
            currentBlock = { articleNo: '', ean: '', descriptionParts: [], pzQty: qty, priceValues: [], rawLines: [], rows: [] };
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

  // Fallback helpers for header/footer (identical to V2)
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

  private runValidation(lines: ParsedInvoiceLine[], header: ParsedInvoiceHeader): ValidationResult {
    const results = [];
    const sumAmount = Math.round(lines.reduce((sum, l) => sum + l.totalPrice, 0) * 100) / 100;
    if (header.invoiceTotal && Math.abs(sumAmount - header.invoiceTotal) >= 0.02) {
      results.push({ ruleId: 'amount_vs_total', ruleName: 'Amount', passed: false, message: `Diff: ${Math.abs(sumAmount - header.invoiceTotal).toFixed(2)}`, severity: 'error', details: {} as any });
    }
    return { passed: results.length === 0, results };
  }
}