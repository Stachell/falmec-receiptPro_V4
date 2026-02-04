/**
 * InvoiceParser_Fattura
 *
 * Parser module for Falmec Spa invoices (Fattura layout)
 * Implements rule-based text extraction without OCR/AI
 *
 * @module parsers/InvoiceParser_Fattura
 * @version 1.0.0
 */

import * as pdfjsLib from 'pdfjs-dist';
import type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParsedInvoiceHeader,
  ParsedInvoiceLine,
  ParserWarning,
  ParserConfig,
  ParserState,
  OrderStatus,
} from './types';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Default configuration for Falmec Fattura invoice parsing
 * Patterns can be adjusted if layout changes
 */
const DEFAULT_CONFIG: ParserConfig = {
  patterns: {
    // Match "NUMERO DOC./ N°" followed by invoice number
    fatturaNumber: /NUMERO\s+DOC\.?\s*\/?\s*N[°o]?\s*[:\s]*([A-Z0-9\-]+)/i,
    // Match "DATA DOC./DATE" followed by date (DD.MM.YYYY or DD/MM/YYYY)
    fatturaDate: /DATA\s+DOC\.?\s*\/?\s*DATE\s*[:\s]*(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/i,
    // Match "Number of packages" followed by number
    packagesCount: /Number\s+of\s+packages\s*[:\s]*(\d+)/i,
    // Position line: contains numeric qty, "PZ", and price values
    // Format: [description] [qty] PZ [price] [amount]
    positionLine: /(\d+)\s+PZ\s+([\d.,]+)\s+([\d.,]+)\s*$/,
    // Manufacturer article number: alphanumeric with dots and optional hash
    // Examples: KACL.457#NF, CAEI20.E0P2#ZZZB461F, 112.0698.431
    articleCode: /^([A-Z0-9][A-Z0-9.#\-_]+[A-Z0-9])$/i,
    // 13-digit EAN (pure numeric string)
    ean: /^(\d{13})$/,
    // Order reference line starting with "Vs. ORDINE"
    orderReference: /Vs\.\s*ORDINE/i,
    // 5-digit order number in format 10xxx
    orderNumber: /\b(10\d{3})\b/g,
  },
  locale: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
  },
};

/**
 * Normalize text: trim, reduce multiple spaces, clean up
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' '); // Replace non-breaking spaces
}

/**
 * Parse price value from string (handles European number format)
 * Converts "1.234,56" to 1234.56
 */
function parsePrice(value: string, config: ParserConfig): number {
  if (!value) return 0;

  let normalized = value.trim();

  // Remove thousands separator (.)
  normalized = normalized.replace(/\./g, '');
  // Replace decimal separator (,) with standard (.)
  normalized = normalized.replace(/,/g, '.');

  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse integer value from string
 */
function parseInteger(value: string): number {
  if (!value) return 0;
  const parsed = parseInt(value.trim(), 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract order candidates from "Vs. ORDINE" line
 * Handles formats like:
 * - "Vs. ORDINE WEB (NET-PORTAL) Nr. 10153"
 * - "Vs. ORDINE ESTERO Nr. 0_10170_173_172" -> [10170, 10173, 10172]
 */
function extractOrderCandidates(text: string): string[] {
  const candidates: string[] = [];

  // Check for underscore-separated format (e.g., 0_10170_173_172)
  const underscoreMatch = text.match(/(\d+(?:_\d+)+)/);
  if (underscoreMatch) {
    const parts = underscoreMatch[1].split('_');
    // First number might be a prefix (like 0), rest are order parts
    // Look for 10xxx pattern or partial numbers to complete
    let basePrefix = '';

    for (const part of parts) {
      if (part.length === 5 && part.startsWith('10')) {
        // Full 5-digit order number
        candidates.push(part);
        basePrefix = part.substring(0, 2); // "10"
      } else if (part.length === 3 && basePrefix) {
        // Partial number like "173" -> "10173"
        candidates.push(basePrefix + part);
      } else if (part.length === 4 && part.startsWith('0')) {
        // Could be leading zero prefix, skip
        continue;
      }
    }
  }

  // Also extract any standalone 10xxx numbers
  const directMatches = text.matchAll(/\b(10\d{3})\b/g);
  for (const match of directMatches) {
    if (!candidates.includes(match[1])) {
      candidates.push(match[1]);
    }
  }

  return candidates;
}

/**
 * Determine order status based on candidates count
 */
function getOrderStatus(candidates: string[]): OrderStatus {
  if (candidates.length === 0) return 'NO';
  if (candidates.length === 1) return 'YES';
  return 'check';
}

/**
 * Check if a line looks like a manufacturer article code
 */
function isArticleCodeLine(line: string, config: ParserConfig): boolean {
  const trimmed = normalizeText(line);
  // Must not be purely numeric (that would be EAN)
  if (/^\d+$/.test(trimmed)) return false;
  // Must contain at least one letter
  if (!/[A-Za-z]/.test(trimmed)) return false;
  // Must match article code pattern
  return config.patterns.articleCode.test(trimmed);
}

/**
 * Check if a line is a 13-digit EAN
 */
function isEANLine(line: string, config: ParserConfig): boolean {
  const trimmed = normalizeText(line);
  return config.patterns.ean.test(trimmed);
}

/**
 * Check if a line is an order reference (Vs. ORDINE)
 */
function isOrderReferenceLine(line: string, config: ParserConfig): boolean {
  return config.patterns.orderReference.test(line);
}

/**
 * Parse a position line and extract qty, price, amount
 * Returns null if line doesn't match position format
 */
function parsePositionLine(
  line: string,
  config: ParserConfig
): { qty: number; unitPrice: number; totalPrice: number; description: string } | null {
  const match = line.match(config.patterns.positionLine);
  if (!match) return null;

  const qty = parseInteger(match[1]);
  const unitPrice = parsePrice(match[2], config);
  const totalPrice = parsePrice(match[3], config);

  // Extract description (everything before the qty PZ pattern)
  const descMatch = line.match(/^(.+?)\s+\d+\s+PZ/);
  const description = descMatch ? normalizeText(descMatch[1]) : '';

  return { qty, unitPrice, totalPrice, description };
}

/**
 * Extract text from all pages of a PDF
 */
async function extractTextFromPDF(pdfFile: File): Promise<string[]> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Reconstruct text with line breaks based on y-position
    const items = textContent.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>;

    let lastY: number | null = null;
    let pageText = '';

    for (const item of items) {
      const y = item.transform[5];

      // If y position changed significantly, add newline
      if (lastY !== null && Math.abs(y - lastY) > 5) {
        pageText += '\n';
      } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
        pageText += ' ';
      }

      pageText += item.str;
      lastY = y;
    }

    pageTexts.push(pageText);
  }

  return pageTexts;
}

/**
 * InvoiceParser_Fattura - Main parser class for Falmec invoices
 */
class InvoiceParserFattura implements InvoiceParser {
  readonly moduleId = 'InvoiceParser_Fattura';
  readonly moduleName = 'Falmec Fattura Parser';
  readonly version = '1.0.0';

  private config: ParserConfig;

  constructor(config?: Partial<ParserConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      patterns: {
        ...DEFAULT_CONFIG.patterns,
        ...config?.patterns,
      },
      locale: {
        ...DEFAULT_CONFIG.locale,
        ...config?.locale,
      },
    };
  }

  /**
   * Check if this parser can handle the given PDF
   * Looks for Falmec-specific markers in the document
   */
  async canHandle(pdfFile: File): Promise<boolean> {
    try {
      const pageTexts = await extractTextFromPDF(pdfFile);
      const fullText = pageTexts.join('\n');

      // Check for Falmec-specific markers
      const hasFalmecMarker = /Falmec\s+S\.?p\.?A/i.test(fullText);
      const hasFatturaMarker = this.config.patterns.fatturaNumber.test(fullText);

      return hasFalmecMarker || hasFatturaMarker;
    } catch {
      return false;
    }
  }

  /**
   * Main parsing function
   */
  async parseInvoice(pdfFile: File): Promise<ParsedInvoiceResult> {
    const warnings: ParserWarning[] = [];
    const lines: ParsedInvoiceLine[] = [];

    // Initialize header with defaults
    const header: ParsedInvoiceHeader = {
      fatturaNumber: '',
      fatturaDate: '',
      packagesCount: null,
      totalQty: 0,
    };

    try {
      // Extract text from PDF
      const pageTexts = await extractTextFromPDF(pdfFile);

      if (pageTexts.length === 0) {
        warnings.push({
          code: 'PDF_EMPTY',
          message: 'PDF enthält keinen extrahierbaren Text',
          severity: 'error',
        });
        return this.createResult(false, header, lines, warnings, pdfFile.name);
      }

      // Parse header from first page
      this.parseHeader(pageTexts[0], header, warnings);

      // Parse packages count from last page
      this.parsePackagesCount(pageTexts[pageTexts.length - 1], header, warnings);

      // Parse positions from all pages
      this.parsePositions(pageTexts, lines, warnings);

      // Calculate total quantity
      header.totalQty = lines.reduce((sum, line) => sum + line.quantityDelivered, 0);

      // Validate results
      const success = this.validateResults(header, lines, warnings);

      return this.createResult(success, header, lines, warnings, pdfFile.name);

    } catch (error) {
      warnings.push({
        code: 'PARSE_ERROR',
        message: `Fehler beim Parsen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        severity: 'error',
      });
      return this.createResult(false, header, lines, warnings, pdfFile.name);
    }
  }

  /**
   * Parse header fields from first page
   */
  private parseHeader(
    pageText: string,
    header: ParsedInvoiceHeader,
    warnings: ParserWarning[]
  ): void {
    // Extract Fattura number
    const fatturaMatch = pageText.match(this.config.patterns.fatturaNumber);
    if (fatturaMatch) {
      header.fatturaNumber = normalizeText(fatturaMatch[1]);
    } else {
      warnings.push({
        code: 'MISSING_FATTURA_NUMBER',
        message: 'Rechnungsnummer (Fattura) konnte nicht extrahiert werden',
        severity: 'error',
      });
    }

    // Extract Fattura date
    const dateMatch = pageText.match(this.config.patterns.fatturaDate);
    if (dateMatch) {
      // Normalize date format to DD.MM.YYYY
      let dateStr = dateMatch[1];
      dateStr = dateStr.replace(/\//g, '.');
      header.fatturaDate = dateStr;
    } else {
      warnings.push({
        code: 'MISSING_FATTURA_DATE',
        message: 'Rechnungsdatum konnte nicht extrahiert werden',
        severity: 'warning',
      });
    }
  }

  /**
   * Parse packages count from last page
   */
  private parsePackagesCount(
    pageText: string,
    header: ParsedInvoiceHeader,
    warnings: ParserWarning[]
  ): void {
    const packagesMatch = pageText.match(this.config.patterns.packagesCount);
    if (packagesMatch) {
      header.packagesCount = parseInteger(packagesMatch[1]);
    } else {
      warnings.push({
        code: 'MISSING_PACKAGES_COUNT',
        message: 'Paketanzahl (Number of packages) konnte nicht extrahiert werden',
        severity: 'info',
      });
    }
  }

  /**
   * Parse all positions using state machine approach
   */
  private parsePositions(
    pageTexts: string[],
    lines: ParsedInvoiceLine[],
    warnings: ParserWarning[]
  ): void {
    let state: ParserState = 'EXPECT_POSITION';
    let currentPosition: Partial<ParsedInvoiceLine> = {};
    let orderCandidates: string[] = [];
    let positionIndex = 0;

    // Combine all pages for sequential processing
    const allLines: string[] = [];
    for (const pageText of pageTexts) {
      const pageLines = pageText.split('\n').map(line => normalizeText(line));
      allLines.push(...pageLines);
    }

    for (const line of allLines) {
      if (!line) continue;

      switch (state) {
        case 'EXPECT_POSITION': {
          // Check for order reference before position
          if (isOrderReferenceLine(line, this.config)) {
            const candidates = extractOrderCandidates(line);
            orderCandidates.push(...candidates);
            continue;
          }

          // Try to parse as position line
          const positionData = parsePositionLine(line, this.config);
          if (positionData) {
            positionIndex++;
            currentPosition = {
              positionIndex,
              quantityDelivered: positionData.qty,
              unitPrice: positionData.unitPrice,
              totalPrice: positionData.totalPrice,
              descriptionIT: positionData.description,
              orderCandidates: [...orderCandidates],
              orderCandidatesText: orderCandidates.join('|'),
              orderStatus: getOrderStatus(orderCandidates),
              rawPositionText: line,
            };
            // Reset order candidates after binding to position
            orderCandidates = [];
            state = 'EXPECT_ARTICLE_CODE';
          }
          break;
        }

        case 'EXPECT_ARTICLE_CODE': {
          // Check if line is a manufacturer article code
          if (isArticleCodeLine(line, this.config)) {
            currentPosition.manufacturerArticleNo = normalizeText(line);
            state = 'EXPECT_EAN';
          } else if (isEANLine(line, this.config)) {
            // Skipped article code, got EAN directly
            warnings.push({
              code: 'MISSING_ARTICLE_CODE',
              message: `Position ${positionIndex}: Herstellerartikelnummer fehlt`,
              severity: 'warning',
              positionIndex,
            });
            currentPosition.manufacturerArticleNo = '';
            currentPosition.ean = normalizeText(line);
            state = 'COMMIT';
          } else if (parsePositionLine(line, this.config)) {
            // New position started without completing previous
            warnings.push({
              code: 'INCOMPLETE_POSITION',
              message: `Position ${positionIndex}: Position unvollständig (Artikel/EAN fehlt)`,
              severity: 'warning',
              positionIndex,
            });
            // Save incomplete position
            currentPosition.manufacturerArticleNo = currentPosition.manufacturerArticleNo || '';
            currentPosition.ean = currentPosition.ean || '';
            lines.push(currentPosition as ParsedInvoiceLine);

            // Start new position
            state = 'EXPECT_POSITION';
            // Re-process this line
            const positionData = parsePositionLine(line, this.config);
            if (positionData) {
              positionIndex++;
              currentPosition = {
                positionIndex,
                quantityDelivered: positionData.qty,
                unitPrice: positionData.unitPrice,
                totalPrice: positionData.totalPrice,
                descriptionIT: positionData.description,
                orderCandidates: [...orderCandidates],
                orderCandidatesText: orderCandidates.join('|'),
                orderStatus: getOrderStatus(orderCandidates),
                rawPositionText: line,
              };
              orderCandidates = [];
              state = 'EXPECT_ARTICLE_CODE';
            }
          }
          break;
        }

        case 'EXPECT_EAN': {
          if (isEANLine(line, this.config)) {
            currentPosition.ean = normalizeText(line);
            state = 'COMMIT';
          } else if (isArticleCodeLine(line, this.config)) {
            // Another article code? Might be additional info, skip
            continue;
          } else if (parsePositionLine(line, this.config)) {
            // New position started without EAN
            warnings.push({
              code: 'MISSING_EAN',
              message: `Position ${positionIndex}: EAN fehlt`,
              severity: 'warning',
              positionIndex,
            });
            currentPosition.ean = '';
            state = 'COMMIT';
            // Don't break - we need to reprocess this line
          }

          // Fall through to commit if state changed
          if (state === 'COMMIT') {
            lines.push(currentPosition as ParsedInvoiceLine);
            currentPosition = {};
            state = 'EXPECT_POSITION';

            // Re-check if current line is a new position
            const positionData = parsePositionLine(line, this.config);
            if (positionData) {
              positionIndex++;
              currentPosition = {
                positionIndex,
                quantityDelivered: positionData.qty,
                unitPrice: positionData.unitPrice,
                totalPrice: positionData.totalPrice,
                descriptionIT: positionData.description,
                orderCandidates: [...orderCandidates],
                orderCandidatesText: orderCandidates.join('|'),
                orderStatus: getOrderStatus(orderCandidates),
                rawPositionText: line,
              };
              orderCandidates = [];
              state = 'EXPECT_ARTICLE_CODE';
            }
          }
          break;
        }

        case 'COMMIT': {
          // Commit the current position
          lines.push(currentPosition as ParsedInvoiceLine);
          currentPosition = {};
          state = 'EXPECT_POSITION';

          // Re-check current line
          if (isOrderReferenceLine(line, this.config)) {
            const candidates = extractOrderCandidates(line);
            orderCandidates.push(...candidates);
          } else {
            const positionData = parsePositionLine(line, this.config);
            if (positionData) {
              positionIndex++;
              currentPosition = {
                positionIndex,
                quantityDelivered: positionData.qty,
                unitPrice: positionData.unitPrice,
                totalPrice: positionData.totalPrice,
                descriptionIT: positionData.description,
                orderCandidates: [...orderCandidates],
                orderCandidatesText: orderCandidates.join('|'),
                orderStatus: getOrderStatus(orderCandidates),
                rawPositionText: line,
              };
              orderCandidates = [];
              state = 'EXPECT_ARTICLE_CODE';
            }
          }
          break;
        }
      }
    }

    // Handle any remaining position in progress
    if (state !== 'EXPECT_POSITION' && currentPosition.positionIndex) {
      warnings.push({
        code: 'INCOMPLETE_LAST_POSITION',
        message: `Letzte Position (${positionIndex}) wurde nicht vollständig abgeschlossen`,
        severity: 'warning',
        positionIndex,
      });
      currentPosition.manufacturerArticleNo = currentPosition.manufacturerArticleNo || '';
      currentPosition.ean = currentPosition.ean || '';
      lines.push(currentPosition as ParsedInvoiceLine);
    }

    // Log warning if no positions found
    if (lines.length === 0) {
      warnings.push({
        code: 'NO_POSITIONS_FOUND',
        message: 'Keine Rechnungspositionen gefunden',
        severity: 'error',
      });
    }
  }

  /**
   * Validate parsing results
   */
  private validateResults(
    header: ParsedInvoiceHeader,
    lines: ParsedInvoiceLine[],
    warnings: ParserWarning[]
  ): boolean {
    let hasBlockingErrors = false;

    // Check for blocking errors
    if (!header.fatturaNumber) {
      hasBlockingErrors = true;
    }

    if (lines.length === 0) {
      hasBlockingErrors = true;
    }

    // Check for positions with missing critical data
    for (const line of lines) {
      if (!line.ean && !line.manufacturerArticleNo) {
        warnings.push({
          code: 'POSITION_NO_IDENTIFIER',
          message: `Position ${line.positionIndex}: Weder EAN noch Artikelnummer vorhanden`,
          severity: 'error',
          positionIndex: line.positionIndex,
        });
      }
    }

    return !hasBlockingErrors;
  }

  /**
   * Create the final result object
   */
  private createResult(
    success: boolean,
    header: ParsedInvoiceHeader,
    lines: ParsedInvoiceLine[],
    warnings: ParserWarning[],
    sourceFileName?: string
  ): ParsedInvoiceResult {
    return {
      success,
      header,
      lines,
      warnings,
      parserModule: this.moduleId,
      parsedAt: new Date().toISOString(),
      sourceFileName,
    };
  }
}

// Export singleton instance
export const invoiceParserFattura = new InvoiceParserFattura();

// Export class for custom configuration
export { InvoiceParserFattura };

// Default export
export default invoiceParserFattura;
