/**
 * Invoice Parser Service
 *
 * High-level service for parsing invoice PDFs using pure TypeScript with pdfjs-dist.
 * No server dependency required - all parsing runs in the browser.
 *
 * @module services/invoiceParserService
 */

import {
  findParserForFile,
  type ParsedInvoiceResult,
  type ParsedInvoiceLine,
} from './parsers';
import type { InvoiceLine, InvoiceHeader, AllocatedOrder, ExpandedViewLine } from '@/types';
import { logService } from './logService';

/**
 * Parse an invoice PDF file
 *
 * @param pdfFile - The PDF file to parse
 * @param runId - Optional run ID for logging context
 * @returns Parsed invoice result
 */
export async function parseInvoicePDF(
  pdfFile: File,
  runId?: string
): Promise<ParsedInvoiceResult> {
  logService.info(`Starte PDF-Parsing: ${pdfFile.name}`, {
    runId,
    step: 'Rechnung auslesen',
    details: `Dateigröße: ${(pdfFile.size / 1024).toFixed(2)} KB`,
  });

  try {
    const parser = await findParserForFile(pdfFile);

    logService.info(`Parser: ${parser.moduleName} v${parser.version}`, {
      runId,
      step: 'Rechnung auslesen',
    });

    const result = await parser.parseInvoice(pdfFile, runId);

    if (result.success) {
      const totalEur = result.header.invoiceTotal != null
        ? `, Rechnungsgesamt: ${result.header.invoiceTotal.toFixed(2)} EUR`
        : '';
      logService.info(
        `PDF erfolgreich geparst: ${result.lines.length} Positionen, Fattura: ${result.header.fatturaNumber}`,
        {
          runId,
          step: 'Rechnung auslesen',
          details: `Gesamtmenge: ${result.header.totalQty}, Pakete: ${result.header.packagesCount ?? 'n/a'}${totalEur}`,
        }
      );
    } else {
      logService.warn(
        `PDF-Parsing mit Fehlern: ${result.warnings.filter(w => w.severity === 'error').length} Fehler`,
        { runId, step: 'Rechnung auslesen' }
      );
    }

    for (const warning of result.warnings) {
      if (warning.severity === 'error') {
        logService.error(warning.message, {
          runId,
          step: 'Rechnung auslesen',
          details: `Code: ${warning.code}`,
        });
      } else if (warning.severity === 'warning') {
        logService.warn(warning.message, {
          runId,
          step: 'Rechnung auslesen',
          details: `Code: ${warning.code}`,
        });
      }
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';

    logService.error(`PDF-Parsing fehlgeschlagen: ${errorMessage}`, {
      runId,
      step: 'Rechnung auslesen',
    });

    return {
      success: false,
      header: {
        fatturaNumber: '',
        fatturaDate: '',
        packagesCount: null,
        totalQty: 0,
        parsedPositionsCount: 0,
        qtyValidationStatus: 'unknown',
      },
      lines: [],
      warnings: [{
        code: 'PARSE_EXCEPTION',
        message: errorMessage,
        severity: 'error',
      }],
      parserModule: 'unknown',
      parsedAt: new Date().toISOString(),
      sourceFileName: pdfFile.name,
    };
  }
}

/**
 * PROJ-23: Create aggregated invoice lines — one InvoiceLine per parsed position,
 * preserving the original qty (e.g. qty=7). No expansion to individual lines.
 *
 * LineId schema: {runId}-line-{positionIndex}
 *
 * The expansion to qty=1 individual lines happens later in Run 3 of the
 * MatchingEngine (Phase A4), NOT here.
 */
export function createAggregatedInvoiceLines(
  parsedLines: ParsedInvoiceLine[],
  runId: string
): InvoiceLine[] {
  if (!Array.isArray(parsedLines)) {
    console.error('[createAggregatedInvoiceLines] parsedLines is not an array:', typeof parsedLines);
    return [];
  }

  const lines: InvoiceLine[] = [];

  for (let idx = 0; idx < parsedLines.length; idx++) {
    const parsed = parsedLines[idx];
    if (!parsed) {
      console.warn(`[createAggregatedInvoiceLines] Skipping null/undefined entry at index ${idx}`);
      continue;
    }

    try {
      const positionIndex = parsed.positionIndex ?? idx;
      const rawQty = parsed.quantityDelivered;
      const qty = Number.isFinite(rawQty) ? Math.round(rawQty) : 0;
      const articleNo = parsed.manufacturerArticleNo ?? '';
      const ean = parsed.ean ?? '';
      const descriptionIT = parsed.descriptionIT ?? '';
      const unitPrice = Number.isFinite(parsed.unitPrice) ? parsed.unitPrice : 0;
      const totalPrice = Number.isFinite(parsed.totalPrice) ? parsed.totalPrice : 0;

      if (qty <= 0) {
        console.warn(`[createAggregatedInvoiceLines] Skipping position ${positionIndex} with qty=${qty} (raw: ${rawQty})`);
        continue;
      }

      lines.push({
        lineId: `${runId}-line-${positionIndex}`,
        positionIndex,
        expansionIndex: 0,
        manufacturerArticleNo: articleNo,
        ean,
        descriptionIT,
        qty,
        unitPriceInvoice: unitPrice,
        totalLineAmount: totalPrice,
        orderNumberAssigned: null,
        orderAssignmentReason: 'pending',
        serialNumber: null,
        serialSource: 'none',
        falmecArticleNo: null,
        descriptionDE: null,
        storageLocation: null,
        unitPriceSage: null,
        unitPriceFinal: null,
        activeFlag: true,
        priceCheckStatus: 'pending',
        matchStatus: 'pending',
        serialRequired: false,
        orderYear: null,
        orderCode: null,
        orderVorgang: null,
        orderOpenQty: null,
        supplierId: null,
        serialNumbers: [],
        allocatedOrders: [],
      });
    } catch (error) {
      console.error(`[createAggregatedInvoiceLines] CRITICAL: Error processing position ${idx}:`, error, parsed);
    }
  }

  console.log(`[createAggregatedInvoiceLines] Created ${lines.length} aggregated lines from ${parsedLines.length} positions`);
  return lines;
}

/**
 * Convert parsed invoice lines to application InvoiceLine format (legacy, no expansion)
 */
export function convertToInvoiceLines(
  parsedLines: ParsedInvoiceLine[],
  runId: string
): InvoiceLine[] {
  return expandInvoiceLines(parsedLines, runId);
}

/**
 * @deprecated PROJ-23: This function is kept as a backup reference only.
 * The active workflow now uses createAggregatedInvoiceLines() instead.
 * Expansion to qty=1 lines happens in Run 3 of the MatchingEngine (Phase A4).
 *
 * Expand parsed invoice lines: each position with qty=N becomes N individual lines with qty=1.
 * This is the PROJ-11 expansion logic that replaces the old 1:1 mapping.
 *
 * LineId schema: {runId}-line-{positionIndex}-{expansionIndex}
 */
export function expandInvoiceLines(
  parsedLines: ParsedInvoiceLine[],
  runId: string
): InvoiceLine[] {
  if (!Array.isArray(parsedLines)) {
    console.error('[expandInvoiceLines] parsedLines is not an array:', typeof parsedLines);
    return [];
  }

  const expanded: InvoiceLine[] = [];

  for (let idx = 0; idx < parsedLines.length; idx++) {
    const parsed = parsedLines[idx];
    if (!parsed) {
      console.warn(`[expandInvoiceLines] Skipping null/undefined entry at index ${idx}`);
      continue;
    }

    try {
      // Defensive: coerce all fields to safe types
      const positionIndex = parsed.positionIndex ?? idx;
      const rawQty = parsed.quantityDelivered;
      const qty = Number.isFinite(rawQty) ? Math.round(rawQty) : 0;
      const articleNo = parsed.manufacturerArticleNo ?? '';
      const ean = parsed.ean ?? '';
      const descriptionIT = parsed.descriptionIT ?? '';
      const unitPrice = Number.isFinite(parsed.unitPrice) ? parsed.unitPrice : 0;
      const totalPrice = Number.isFinite(parsed.totalPrice) ? parsed.totalPrice : 0;

      // Edge case: qty <= 0 → skip with console warning
      if (qty <= 0) {
        console.warn(`[expandInvoiceLines] Skipping position ${positionIndex} with qty=${qty} (raw: ${rawQty})`);
        continue;
      }

      for (let i = 0; i < qty; i++) {
        expanded.push({
          lineId: `${runId}-line-${positionIndex}-${i}`,
          positionIndex,
          expansionIndex: i,
          manufacturerArticleNo: articleNo,
          ean,
          descriptionIT,
          qty: 1,
          unitPriceInvoice: unitPrice,
          totalLineAmount: unitPrice, // qty=1 → total = unit
          orderNumberAssigned: null,
          orderAssignmentReason: 'pending',
          serialNumber: null,
          serialSource: 'none',
          falmecArticleNo: null,
          descriptionDE: null,
          storageLocation: null,
          unitPriceSage: null,
          unitPriceFinal: null,
          activeFlag: true,
          priceCheckStatus: 'pending',
          matchStatus: 'pending',
          serialRequired: false,
          orderYear: null,
          orderCode: null,
          orderVorgang: null,
          orderOpenQty: null,
          supplierId: null,
          serialNumbers: [],
          allocatedOrders: [],
        });
      }
    } catch (error) {
      console.error(`[expandInvoiceLines] CRITICAL: Error expanding position ${idx}:`, error, parsed);
      // Skip this position but continue with the rest
    }
  }

  console.log(`[expandInvoiceLines] Expanded ${parsedLines.length} positions → ${expanded.length} lines`);
  return expanded;
}

/**
 * Convert parsed header to application InvoiceHeader format
 */
export function convertToInvoiceHeader(
  parsedResult: ParsedInvoiceResult
): InvoiceHeader {
  let invoiceDate = parsedResult.header.fatturaDate;

  // Convert DD.MM.YYYY to YYYY-MM-DD
  if (invoiceDate && /^\d{2}\.\d{2}\.\d{4}$/.test(invoiceDate)) {
    const [day, month, year] = invoiceDate.split('.');
    invoiceDate = `${year}-${month}-${day}`;
  } else if (invoiceDate && /^\d{2}\.\d{2}\.\d{2}$/.test(invoiceDate)) {
    const [day, month, year] = invoiceDate.split('.');
    const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    invoiceDate = `${fullYear}-${month}-${day}`;
  }

  return {
    fattura: parsedResult.header.fatturaNumber,
    invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
    deliveryDate: null,
    invoiceTotal: parsedResult.header.invoiceTotal ?? null,
  };
}

/**
 * Generate Run ID based on Fattura number
 * Schema: Fattura-[FatturaNumber]-[YYYYMMDD]-[HHMMSS]
 */
export function generateRunId(fatturaNumber: string): string {
  const now = new Date();
  const datePart = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');
  const timePart = now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  return `Fattura-${fatturaNumber.trim()}-${datePart}-${timePart}`;
}

/**
 * PROJ-20: Expand aggregated invoice lines into flat view lines for UI display and XML export.
 *
 * Each aggregated position with qty=N becomes N individual ExpandedViewLine objects.
 * Serial numbers and allocated orders are distributed across the expansion.
 *
 * This is a PURE VIEW TRANSFORMATION — it does NOT modify the store.
 */
export function expandForDisplay(aggregatedLines: InvoiceLine[]): ExpandedViewLine[] {
  const result: ExpandedViewLine[] = [];

  for (const line of aggregatedLines) {
    const qty = Math.max(1, line.qty);

    for (let i = 0; i < qty; i++) {
      // Find the allocated order covering this expansion index
      const allocatedOrder = findOrderForIndex(line.allocatedOrders, i);

      // Destructure to omit serialNumbers and allocatedOrders from spread
      const { serialNumbers: _sn, allocatedOrders: _ao, ...rest } = line;

      result.push({
        ...rest,
        expansionIndex: i,
        serialNumber: line.serialNumbers[i] ?? null,
        allocatedOrder,
        lineId: `${line.lineId}-exp-${i}`,
        qty: 1,
        unitPriceInvoice: line.unitPriceInvoice,
        totalLineAmount: line.unitPriceInvoice, // qty=1 → total = unit
      });
    }
  }

  return result;
}

/**
 * Find the AllocatedOrder covering a specific expansion index.
 *
 * allocatedOrders are sequential: if orders = [{qty:7}, {qty:3}],
 * then indices 0-6 → order[0], indices 7-9 → order[1].
 */
function findOrderForIndex(
  allocatedOrders: AllocatedOrder[],
  index: number,
): AllocatedOrder | null {
  let offset = 0;
  for (const order of allocatedOrders) {
    if (index < offset + order.qty) return order;
    offset += order.qty;
  }
  return null;
}

// Export types for convenience
export type { ParsedInvoiceResult, ParsedInvoiceLine } from './parsers';
