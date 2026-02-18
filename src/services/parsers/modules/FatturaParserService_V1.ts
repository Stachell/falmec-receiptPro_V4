/**
 * Fattura PDF Parser Service V1 — Bounding-Box & Column Model
 *
 * Architecture:
 * 1. Zone Detection — header/body/footer boundaries per page via anchor lines
 * 2. Y-Axis Matching — PZ-anchored rows, cross-reference columns at same Y ±5px
 * 3. Column-Based Extraction — article/EAN from left, qty/prices from right
 * 4. Label-Based Header/Footer — search by label position, extract value below
 *
 * NOTE: Moved from src/services/parsers/FatturaParserService.ts to modules/ subfolder.
 * Known issues: price clipping >999 EUR, greedy 80px above-item extraction.
 */

import { logService } from '../../logService';
import type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParsedInvoiceHeader,
  ParsedInvoiceLine,
  ParserWarning,
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
  PRICE_VALUE_PATTERN,
  FATTURA_DATE,
  CONTRIBUTO_MARKER,
  AMOUNT_TO_PAY_MARKER,
} from '../constants/fatturaPatterns';

// ─── Constants ────────────────────────────────────────────────────────
/** Y-coordinate tolerance for matching items on the same logical row */
const Y_TOLERANCE = 5;

/** EAN inline pattern (13 digits starting with 803) */
const EAN_INLINE = /\b(803\d{10})\b/;

/** PZ keyword pattern — anchors a position row */
const PZ_ANCHOR = /\bPZ\b/i;

/** Body start anchor: the column header row */
const BODY_START_LABELS = ['DESCRIPTION', 'Q.TY', 'PRICE'];

/** Body end anchors */
const BODY_END_PATTERNS = [
  /Number\s+of\s+packages/i,
  /Volume\s+MC/i,
  /CONTRIBUTO\s+AMBIENTALE/i,
  /AMOUNT\s+.*TO\s+PAY/i,
  /^TOTAL/i,
];

// ─── Interfaces ───────────────────────────────────────────────────────
interface ZoneBounds {
  bodyStartY: number; // Y below which body content starts (pdfjs: lower Y = lower on page)
  bodyEndY: number;   // Y above which body content ends
}

// ─── Parser Class ─────────────────────────────────────────────────────
export class FatturaParserService_V1 implements InvoiceParser {
  readonly moduleId = 'fattura_falmec_v1';
  readonly moduleName = 'Fattura Falmec V1';
  readonly version = '1.0.0';

  private orderTracker = new OrderBlockTracker();

  async parseInvoice(pdfFile: File, runId?: string): Promise<ParsedInvoiceResult> {
    const activeRunId = runId || `fallback_${Date.now()}`;
    const startTime = Date.now();

    logService.info(`[v1] PDF-Parsing gestartet: ${pdfFile.name}`, {
      runId: activeRunId,
      step: 'Rechnung auslesen',
      details: `Dateigroesse: ${(pdfFile.size / 1024).toFixed(2)} KB`,
    });

    try {
      // Extract at y_tolerance=5 — we do our own Y-matching
      const pages = await extractTextFromPDF(pdfFile, Y_TOLERANCE);
      logService.info(`${pages.length} Seiten extrahiert`, { runId: activeRunId });

      // Raw text dump: log full text of each page for run-log.json
      for (const page of pages) {
        logService.debug(`[v1] Rohtext Seite ${page.pageNumber}`, {
          runId: activeRunId,
          step: 'RawText',
          details: page.fullText,
        });
      }

      // 1. Header (page 1 only)
      const header = this.parseHeaderFromItems(pages[0], activeRunId);

      // 2. Packages count (last page)
      const packagesCount = this.parsePackagesCountFromItems(pages[pages.length - 1], activeRunId);
      if (packagesCount > 0) {
        header.packagesCount = packagesCount;
      }

      // 3. Parse positions from ALL pages using bounding-box model
      const { lines, warnings } = this.parsePositionsBoundingBox(pages, activeRunId);

      // 4. Invoice total (last page)
      const invoiceTotal = this.parseInvoiceTotalFromItems(pages[pages.length - 1], activeRunId);
      if (invoiceTotal > 0) {
        header.invoiceTotal = invoiceTotal;
      }

      // 5. Totals & validation
      header.totalQty = lines.reduce((sum, l) => sum + l.quantityDelivered, 0);
      header.parsedPositionsCount = lines.length;

      // Qty validation
      if (header.packagesCount && header.totalQty > 0) {
        header.qtyValidationStatus =
          header.totalQty === header.packagesCount ? 'ok' : 'mismatch';
      } else {
        header.qtyValidationStatus = 'unknown';
      }

      // Price validation (warning only)
      if (header.invoiceTotal && header.invoiceTotal > 0) {
        const sumAmount = lines.reduce((sum, l) => sum + l.totalPrice, 0);
        const priceDiff = Math.abs(sumAmount - header.invoiceTotal);
        if (priceDiff > 0.02) {
          warnings.push({
            code: 'PRICE_SUM_MISMATCH',
            message: `Preissumme ${sumAmount.toFixed(2)} != Rechnungstotal ${header.invoiceTotal.toFixed(2)} (Diff: ${priceDiff.toFixed(2)})`,
            severity: 'warning',
          });
        }
      }

      // Qty validation warning
      if (header.qtyValidationStatus === 'mismatch') {
        warnings.push({
          code: 'QTY_SUM_MISMATCH',
          message: `Mengensumme ${header.totalQty} != Paketzahl ${header.packagesCount}`,
          severity: 'warning',
        });
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
        `[v1] PDF-Parsing abgeschlossen (${duration}ms): ${lines.length} Positionen, ${header.totalQty} Gesamtmenge`,
        { runId: activeRunId, details: `RgNr: ${header.fatturaNumber || 'N/A'}, Datum: ${header.fatturaDate || 'N/A'}` }
      );

      return {
        success: warnings.filter(w => w.severity === 'error').length === 0,
        header,
        lines,
        warnings,
        parserModule: this.moduleId,
        parsedAt: new Date().toISOString(),
        sourceFileName: pdfFile.name,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logService.error(`[v1] PDF-Parsing fehlgeschlagen: ${errorMsg}`, {
        runId: activeRunId,
        details: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(`PDF-Parsing fehlgeschlagen: ${errorMsg}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HEADER EXTRACTION (Page 1 only, label-based with search radius)
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
        logService.info(`[v1] Rechnungsnummer: ${invoiceNumber} (${name})`, { runId, step: 'Header' });
        break;
      }
    }

    let date = '';
    const dateMatch = fullText.match(FATTURA_DATE);
    if (dateMatch) {
      date = dateMatch[1].replace(/\//g, '.');
      logService.info(`[v1] Datum: ${date}`, { runId, step: 'Header' });
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
  // ZONE DETECTION — find body boundaries per page
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
  // POSITION EXTRACTION — Bounding Box & Y-Axis Matching
  // ═══════════════════════════════════════════════════════════════════

  private parsePositionsBoundingBox(
    pages: ExtractedPage[],
    runId: string
  ): { lines: ParsedInvoiceLine[]; warnings: ParserWarning[] } {
    const allLines: ParsedInvoiceLine[] = [];
    const allWarnings: ParserWarning[] = [];
    const allBodyItems: Array<{ pageNumber: number; items: ExtractedTextItem[] }> = [];
    const allOrderRefs: Array<{ pageNumber: number; y: number; orders: string[] }> = [];
    this.orderTracker.reset();
    let positionIndex = 0;

    for (const page of pages) {
      const zone = this.detectZone(page);
      const bodyItems = this.getBodyItems(page, zone);

      logService.debug(
        `[v1] Page ${page.pageNumber}: zone Y=[${zone.bodyEndY.toFixed(0)}..${zone.bodyStartY.toFixed(0)}], ${bodyItems.length} body items`,
        { runId, step: 'Position' }
      );

      if (bodyItems.length === 0) continue;

      allBodyItems.push({ pageNumber: page.pageNumber, items: bodyItems });

      const rows = this.groupItemsIntoRows(bodyItems);

      const pzRows: { rowY: number; rowText: string; rowItems: ExtractedTextItem[]; pzItem: ExtractedTextItem }[] = [];
      const orderRefs: { y: number; orders: string[] }[] = [];

      for (const row of rows) {
        const rowText = row.items.map(it => it.text).join(' ');

        if (/Vs\.\s*ORDINE/i.test(rowText)) {
          const orders = extractOrderReferences(rowText);
          if (orders.length > 0) {
            orderRefs.push({ y: row.y, orders });
          }
          continue;
        }

        const pzItem = row.items.find(it => PZ_ANCHOR.test(it.text));
        if (pzItem && /PZ\s+\d+/i.test(rowText)) {
          pzRows.push({ rowY: row.y, rowText, rowItems: row.items, pzItem });
        }
      }

      orderRefs.sort((a, b) => b.y - a.y);

      for (const ref of orderRefs) {
        allOrderRefs.push({ pageNumber: page.pageNumber, ...ref });
      }

      if (pzRows.length === 0) {
        logService.debug(`[v1] Page ${page.pageNumber}: no PZ rows found`, { runId, step: 'Position' });
        continue;
      }

      pzRows.sort((a, b) => b.rowY - a.rowY);

      for (const { rowY, rowText, rowItems, pzItem } of pzRows) {
        const pzMatch = rowText.match(/PZ\s+(\d+)/i);
        if (!pzMatch) continue;

        const qty = parseIntSafe(pzMatch[1]);
        if (qty <= 0) continue;

        for (const ref of orderRefs) {
          if (ref.y > rowY + Y_TOLERANCE) {
            this.orderTracker.startNewBlock(ref.orders);
            break;
          }
        }

        const priceMatches = this.extractPricesFromText(rowText);

        if (priceMatches.length < 2) {
          for (const nextRow of rows) {
            if (nextRow.y >= rowY - Y_TOLERANCE) continue;
            if (rowY - nextRow.y > 25) break;

            const nextRowText = nextRow.items.map(it => it.text).join(' ');
            if (/Vs\.\s*ORDINE/i.test(nextRowText)) break;
            if (/PZ\s+\d+/i.test(nextRowText)) break;

            const nextPrices = this.extractPricesFromText(nextRowText);
            priceMatches.push(...nextPrices);
            if (priceMatches.length >= 2) break;
          }
        }

        let unitPrice = 0;
        let totalPrice = 0;
        if (priceMatches.length >= 2) {
          unitPrice = priceMatches[priceMatches.length - 2];
          totalPrice = priceMatches[priceMatches.length - 1];
        } else if (priceMatches.length === 1) {
          unitPrice = priceMatches[0];
          totalPrice = priceMatches[0];
        }

        if (totalPrice <= 0) continue;

        const leftItems = rowItems.filter(it => it.x < pzItem.x);
        const leftText = leftItems.map(it => it.text).join(' ');

        const aboveItems = bodyItems
          .filter(it =>
            it.y > rowY + Y_TOLERANCE &&
            it.y < rowY + 80 &&
            !orderRefs.some(ref => Math.abs(it.y - ref.y) <= Y_TOLERANCE) &&
            !pzRows.some(pr => pr !== pzRows.find(p => p.rowY === rowY) && Math.abs(it.y - pr.rowY) <= Y_TOLERANCE)
          )
          .sort((a, b) => b.y - a.y);
        const aboveText = aboveItems.map(it => it.text).join(' ');

        const searchText = aboveText ? `${aboveText} ${leftText}` : leftText;
        const { articleNo, ean, description } = this.extractArticleEanFromBlock(searchText);

        positionIndex += 1;
        const orderCandidates = this.orderTracker.getOrdersForPosition();
        const orderStatus: 'YES' | 'NO' | 'check' =
          orderCandidates.length === 1 ? 'YES' : orderCandidates.length === 0 ? 'NO' : 'check';

        allLines.push({
          positionIndex,
          manufacturerArticleNo: articleNo,
          ean,
          descriptionIT: description,
          quantityDelivered: qty,
          unitPrice,
          totalPrice,
          orderCandidates,
          orderCandidatesText: orderCandidates.join('|'),
          orderStatus,
          rawPositionText: rowText,
        });

        if (!articleNo && !ean) {
          allWarnings.push({
            code: 'POSITION_MISSING_IDENTIFIER',
            message: `Position ${positionIndex}: Keine Artikelnummer oder EAN erkannt`,
            severity: 'warning',
            positionIndex,
          });
        }

        logService.debug(
          `[v1] Pos ${positionIndex}: art=${articleNo || 'N/A'}, ean=${ean || 'N/A'}, qty=${qty}, unit=${unitPrice}, total=${totalPrice}, orders=[${orderCandidates.join(',')}]`,
          { runId, step: 'Position' }
        );
      }
    }

    const { enrichedLines, warnings: enrichWarnings } = enrichOrderCandidates(
      allLines, allBodyItems, allOrderRefs,
    );
    allWarnings.push(...enrichWarnings);

    logService.info(`[v1] ${enrichedLines.length} Positionen extrahiert`, { runId, step: 'Position' });
    return { lines: enrichedLines, warnings: allWarnings };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ROW GROUPING & PRICE EXTRACTION
  // ═══════════════════════════════════════════════════════════════════

  private groupItemsIntoRows(
    items: ExtractedTextItem[]
  ): { y: number; items: ExtractedTextItem[] }[] {
    if (items.length === 0) return [];

    const sorted = [...items].sort((a, b) => b.y - a.y);
    const rows: { y: number; items: ExtractedTextItem[] }[] = [];
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
  // ARTICLE / EAN EXTRACTION — Column 1 splitting logic
  // ═══════════════════════════════════════════════════════════════════

  private extractArticleEanFromBlock(
    text: string
  ): { articleNo: string; ean: string; description: string } {
    const trimmed = text.trim();
    if (!trimmed) return { articleNo: '', ean: '', description: '' };

    const eanMatch = trimmed.match(EAN_INLINE);

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
  // FOOTER EXTRACTION (last page only)
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
        logService.info(`[v1] Paketzahl: ${count}`, { runId, step: 'Footer' });
        return count;
      }
    }

    const inlineMatch = label.text.match(/packages\s*[\n\s]*(\d{1,4})/i);
    if (inlineMatch) {
      const count = parseIntSafe(inlineMatch[1]);
      logService.info(`[v1] Paketzahl (inline): ${count}`, { runId, step: 'Footer' });
      return count;
    }

    const groupedLines = page.groupedLines;
    for (let i = 0; i < groupedLines.length; i++) {
      if (/Number\s+of\s+packages/i.test(groupedLines[i].text)) {
        for (let j = i + 1; j < Math.min(i + 3, groupedLines.length); j++) {
          const numMatch = groupedLines[j].text.match(/(\d{1,4})/);
          if (numMatch) {
            const count = parseIntSafe(numMatch[1]);
            logService.info(`[v1] Paketzahl (grouped fallback): ${count}`, { runId, step: 'Footer' });
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
          logService.info(`[v1] Rechnungssumme (CONTRIBUTO): ${total}`, { runId, step: 'Footer' });
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
            logService.info(`[v1] Rechnungssumme (AMOUNT TO PAY): ${total}`, { runId, step: 'Footer' });
            return total;
          }
        }
      }
    }

    logService.warn('[v1] Rechnungssumme nicht gefunden', { runId, step: 'Footer' });
    return 0;
  }
}
