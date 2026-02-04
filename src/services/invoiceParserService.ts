/**
 * Invoice Parser Service
 *
 * High-level service for parsing invoice PDFs.
 * Coordinates parser selection and result handling.
 *
 * @module services/invoiceParserService
 */

import {
  findParserForFile,
  invoiceParserFattura,
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
    // Find appropriate parser
    const parser = await findParserForFile(pdfFile);

    if (!parser) {
      logService.warn('Kein passender Parser gefunden, verwende Standard-Parser', {
        runId,
        step: 'Rechnung auslesen',
      });
    }

    const selectedParser = parser || invoiceParserFattura;

    logService.info(`Parser ausgewählt: ${selectedParser.moduleName} v${selectedParser.version}`, {
      runId,
      step: 'Rechnung auslesen',
    });

    // Parse the invoice
    const result = await selectedParser.parseInvoice(pdfFile);

    // Log results
    if (result.success) {
      logService.info(
        `PDF erfolgreich geparst: ${result.lines.length} Positionen, Fattura: ${result.header.fatturaNumber}`,
        {
          runId,
          step: 'Rechnung auslesen',
          details: `Gesamtmenge: ${result.header.totalQty}, Pakete: ${result.header.packagesCount ?? 'n/a'}`,
        }
      );
    } else {
      logService.warn(
        `PDF-Parsing mit Fehlern: ${result.warnings.filter(w => w.severity === 'error').length} Fehler`,
        {
          runId,
          step: 'Rechnung auslesen',
        }
      );
    }

    // Log warnings
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

    // Return error result
    return {
      success: false,
      header: {
        fatturaNumber: '',
        fatturaDate: '',
        packagesCount: null,
        totalQty: 0,
      },
      lines: [],
      warnings: [
        {
          code: 'PARSE_EXCEPTION',
          message: errorMessage,
          severity: 'error',
        },
      ],
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
    // Initial values for fields to be populated in later workflow steps
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
  // Parse date string to ISO format
  let invoiceDate = parsedResult.header.fatturaDate;

  // Convert DD.MM.YYYY to YYYY-MM-DD
  if (invoiceDate && /^\d{2}\.\d{2}\.\d{4}$/.test(invoiceDate)) {
    const [day, month, year] = invoiceDate.split('.');
    invoiceDate = `${year}-${month}-${day}`;
  } else if (invoiceDate && /^\d{2}\.\d{2}\.\d{2}$/.test(invoiceDate)) {
    // Handle DD.MM.YY format
    const [day, month, year] = invoiceDate.split('.');
    const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    invoiceDate = `${fullYear}-${month}-${day}`;
  }

  return {
    fattura: parsedResult.header.fatturaNumber,
    invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
    deliveryDate: null, // To be extracted from other sources if available
  };
}

/**
 * Generate Run ID based on Fattura number
 *
 * Schema: Fattura-[FatturaNumber]-[YYYYMMDD]-[HHMMSS]
 * Example: Fattura-20.007-20260204-130456
 */
export function generateRunId(fatturaNumber: string): string {
  const now = new Date();

  // Format: YYYYMMDD
  const datePart = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0');

  // Format: HHMMSS
  const timePart = now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');

  // Keep fattura number as-is (preserve dots, etc.)
  const sanitizedFattura = fatturaNumber.trim();

  return `Fattura-${sanitizedFattura}-${datePart}-${timePart}`;
}

// Export types for convenience
export type { ParsedInvoiceResult, ParsedInvoiceLine } from './parsers';
