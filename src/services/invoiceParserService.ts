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
import type { InvoiceLine, InvoiceHeader } from '@/types';
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

    const result = await parser.parseInvoice(pdfFile);

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
 * Convert parsed invoice lines to application InvoiceLine format
 */
export function convertToInvoiceLines(
  parsedLines: ParsedInvoiceLine[],
  runId: string
): InvoiceLine[] {
  return parsedLines.map((parsed) => ({
    lineId: `${runId}-line-${parsed.positionIndex}`,
    manufacturerArticleNo: parsed.manufacturerArticleNo,
    ean: parsed.ean,
    descriptionIT: parsed.descriptionIT,
    qty: parsed.quantityDelivered,
    unitPriceInvoice: parsed.unitPrice,
    totalLineAmount: parsed.totalPrice,
    orderNumberAssigned: parsed.orderCandidates.length === 1 ? parsed.orderCandidates[0] : null,
    orderAssignmentReason: parsed.orderStatus === 'YES' ? 'direct-match' : 'pending',
    serialNumber: null,
    serialSource: 'none',
    falmecArticleNo: null,
    descriptionDE: null,
    storageLocation: null,
    unitPriceSage: null,
    activeFlag: true,
    priceCheckStatus: 'pending',
  }));
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

// Export types for convenience
export type { ParsedInvoiceResult, ParsedInvoiceLine } from './parsers';
