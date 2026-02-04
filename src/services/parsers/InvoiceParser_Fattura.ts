/**
 * InvoiceParser_Fattura
 *
 * Parser module for Falmec Spa invoices (Fattura layout)
 * Implements rule-based text extraction without OCR/AI
 *
 * @module parsers/InvoiceParser_Fattura
 * @version 2.0.0
 */

import * as pdfjsLib from 'pdfjs-dist';
import type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParsedInvoiceHeader,
  ParsedInvoiceLine,
  ParserWarning,
  ParserConfig,
  OrderStatus,
} from './types';

// Configure PDF.js worker - use CDN with matching version
// This is required for PDF.js to work properly
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * Default configuration for Falmec Fattura invoice parsing
 */
const DEFAULT_CONFIG: ParserConfig = {
  patterns: {
    // Match invoice number "20.007" - appears after NUMERO DOC or in header
    fatturaNumber: /\b(\d{2}\.\d{3})\b/,
    fatturaNumberAlt: /NUMERO\s*DOC[^0-9]*(\d{2}\.\d{3})/i,
    fatturaNumberFallback: /N[°o]?\s*(\d{2}\.\d{3})/i,
    // Match date DD/MM/YYYY or DD.MM.YYYY
    fatturaDate: /(\d{2}\/\d{2}\/\d{4})/,
    // Match "Number of packages" followed by number (on last page)
    packagesCount: /Number\s+of\s+packages\s*[\n\s]*(\d+)/i,
    // Position line with PZ quantity and prices
    // Format: PZ [qty] [price] [amount] at end of descriptive text
    positionLineA: /PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)\s*$/,
    positionLineB: /(\d+)\s+PZ\s+([\d.,]+)\s+([\d.,]+)\s*$/,
    // Manufacturer article number patterns
    // Examples: KACL.457#NF, CAEI20.E0P2#ZZZB461F, KCVJN.00#3
    articleCode: /^([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)$/i,
    articleCodeAlt: /^([A-Z][A-Z0-9.#\-]+[A-Z0-9])$/i,
    // 13-digit EAN starting with 803
    ean: /^(803\d{10})$/,
    // Order reference line
    orderReference: /Vs\.\s*ORDINE/i,
    // 5-digit order number
    orderNumber: /\b(10\d{3})\b/g,
  },
  locale: {
    decimalSeparator: ',',
    thousandsSeparator: '.',
  },
};

/**
 * Normalize text: trim, reduce multiple spaces
 */
function normalizeText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ');
}

/**
 * Parse European price format (1.234,56 -> 1234.56)
 */
function parsePrice(value: string): number {
  if (!value) return 0;
  let normalized = value.trim();
  // Remove thousands separator (.)
  normalized = normalized.replace(/\./g, '');
  // Replace decimal separator (,) with (.)
  normalized = normalized.replace(/,/g, '.');
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Parse integer
 */
function parseInteger(value: string): number {
  if (!value) return 0;
  const parsed = parseInt(value.trim(), 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract order candidates from order reference lines
 */
function extractOrderCandidates(text: string): string[] {
  const candidates: string[] = [];

  // Look for underscore-separated format: 0_10170_173_172
  const underscoreMatch = text.match(/(\d+(?:_\d+)+)/);
  if (underscoreMatch) {
    const parts = underscoreMatch[1].split('_');
    let basePrefix = '';
    for (const part of parts) {
      if (part.length === 5 && part.startsWith('10')) {
        candidates.push(part);
        basePrefix = part.substring(0, 2);
      } else if (part.length === 3 && basePrefix) {
        candidates.push(basePrefix + part);
      }
    }
  }

  // Also extract standalone 10xxx numbers
  const directMatches = text.matchAll(/\b(10\d{3})\b/g);
  for (const match of directMatches) {
    if (!candidates.includes(match[1])) {
      candidates.push(match[1]);
    }
  }

  return candidates;
}

/**
 * Get order status based on candidates
 */
function getOrderStatus(candidates: string[]): OrderStatus {
  if (candidates.length === 0) return 'NO';
  if (candidates.length === 1) return 'YES';
  return 'check';
}

/**
 * Extract text content from PDF with better text reconstruction
 */
async function extractTextFromPDF(pdfFile: File): Promise<{ pages: string[], rawItems: Array<{ page: number, text: string, x: number, y: number }> }> {
  const arrayBuffer = await pdfFile.arrayBuffer();

  // Load PDF without worker (runs in main thread)
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages: string[] = [];
  const rawItems: Array<{ page: number, text: string, x: number, y: number }> = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items = textContent.items as Array<{
      str: string;
      transform: number[];
      width: number;
      height: number;
    }>;

    // Collect raw items for debugging
    for (const item of items) {
      if (item.str.trim()) {
        rawItems.push({
          page: pageNum,
          text: item.str,
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
        });
      }
    }

    // Sort items by Y position (descending) then X position (ascending)
    const sortedItems = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 3) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    // Reconstruct text with line breaks
    let lastY: number | null = null;
    let pageText = '';

    for (const item of sortedItems) {
      const y = item.transform[5];

      if (lastY !== null && Math.abs(y - lastY) > 5) {
        pageText += '\n';
      } else if (pageText.length > 0 && !pageText.endsWith(' ') && !pageText.endsWith('\n')) {
        pageText += ' ';
      }

      pageText += item.str;
      lastY = y;
    }

    pages.push(pageText);
  }

  return { pages, rawItems };
}

/**
 * InvoiceParser_Fattura - Main parser class
 */
class InvoiceParserFattura implements InvoiceParser {
  readonly moduleId = 'InvoiceParser_Fattura';
  readonly moduleName = 'Falmec Fattura Parser';
  readonly version = '2.0.0';

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

  async canHandle(pdfFile: File): Promise<boolean> {
    try {
      const { pages } = await extractTextFromPDF(pdfFile);
      const fullText = pages.join('\n');
      return /Falmec\s+S\.?p\.?A/i.test(fullText) || /NUMERO\s*DOC/i.test(fullText);
    } catch {
      return false;
    }
  }

  async parseInvoice(pdfFile: File): Promise<ParsedInvoiceResult> {
    const warnings: ParserWarning[] = [];
    const lines: ParsedInvoiceLine[] = [];

    const header: ParsedInvoiceHeader = {
      fatturaNumber: '',
      fatturaDate: '',
      packagesCount: null,
      totalQty: 0,
      parsedPositionsCount: 0,
      qtyValidationStatus: 'unknown',
    };

    try {
      console.debug('[InvoiceParser] Starting PDF parsing...');

      const { pages, rawItems } = await extractTextFromPDF(pdfFile);

      if (pages.length === 0) {
        warnings.push({
          code: 'PDF_EMPTY',
          message: 'PDF enthält keinen extrahierbaren Text',
          severity: 'error',
        });
        return this.createResult(false, header, lines, warnings, pdfFile.name);
      }

      console.debug('[InvoiceParser] Extracted', pages.length, 'pages');
      console.debug('[InvoiceParser] Page 1 text (first 2000 chars):', pages[0].substring(0, 2000));

      // Parse header from first page
      this.parseHeader(pages[0], header, warnings);

      // Parse packages count from last page
      this.parsePackagesCount(pages[pages.length - 1], header, warnings);

      // Parse positions from all pages using raw items
      this.parsePositionsFromItems(rawItems, lines, warnings);

      // Calculate total quantity and completeness validation
      const sumQty = lines.reduce((sum, line) => sum + line.quantityDelivered, 0);
      header.totalQty = sumQty;
      header.parsedPositionsCount = lines.length;

      // Validation: parsedPositionsCount should be <= totalQty
      // (one position can have quantity > 1)
      if (lines.length > 0 && sumQty > 0) {
        // If number of positions > sum of Q.TY = error
        if (lines.length > sumQty) {
          header.qtyValidationStatus = 'mismatch';
          warnings.push({
            code: 'POSITIONS_EXCEED_QTY',
            message: `Positionen (${lines.length}) > Summe Q.TY (${sumQty})`,
            severity: 'warning',
          });
        } else {
          header.qtyValidationStatus = 'ok';
        }
      } else {
        header.qtyValidationStatus = 'unknown';
      }

      // Validate
      const success = this.validateResults(header, lines, warnings);

      console.debug('[InvoiceParser] Parsing complete:', {
        success,
        fattura: header.fatturaNumber,
        date: header.fatturaDate,
        positions: lines.length,
        totalQty: header.totalQty,
        packages: header.packagesCount,
      });

      return this.createResult(success, header, lines, warnings, pdfFile.name);

    } catch (error) {
      console.error('[InvoiceParser] Parse error:', error);
      warnings.push({
        code: 'PARSE_ERROR',
        message: `Fehler beim Parsen: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`,
        severity: 'error',
      });
      return this.createResult(false, header, lines, warnings, pdfFile.name);
    }
  }

  private parseHeader(pageText: string, header: ParsedInvoiceHeader, warnings: ParserWarning[]): void {
    // Extract Fattura number (20.007)
    let fatturaMatch = pageText.match(this.config.patterns.fatturaNumberAlt);
    if (!fatturaMatch) {
      fatturaMatch = pageText.match(this.config.patterns.fatturaNumber);
    }
    if (!fatturaMatch) {
      fatturaMatch = pageText.match(this.config.patterns.fatturaNumberFallback);
    }

    if (fatturaMatch) {
      header.fatturaNumber = fatturaMatch[1];
      console.debug('[InvoiceParser] Found Fattura number:', header.fatturaNumber);
    } else {
      warnings.push({
        code: 'MISSING_FATTURA_NUMBER',
        message: 'Rechnungsnummer konnte nicht extrahiert werden',
        severity: 'error',
      });
    }

    // Extract date (31/01/2026)
    const dateMatch = pageText.match(this.config.patterns.fatturaDate);
    if (dateMatch) {
      // Convert DD/MM/YYYY to DD.MM.YYYY
      header.fatturaDate = dateMatch[1].replace(/\//g, '.');
      console.debug('[InvoiceParser] Found date:', header.fatturaDate);
    } else {
      warnings.push({
        code: 'MISSING_FATTURA_DATE',
        message: 'Rechnungsdatum konnte nicht extrahiert werden',
        severity: 'warning',
      });
    }
  }

  private parsePackagesCount(pageText: string, header: ParsedInvoiceHeader, warnings: ParserWarning[]): void {
    const packagesMatch = pageText.match(this.config.patterns.packagesCount);
    if (packagesMatch) {
      header.packagesCount = parseInteger(packagesMatch[1]);
      console.debug('[InvoiceParser] Found packages count:', header.packagesCount);
    } else {
      // Try alternative: look for standalone number after "Number of packages"
      const altMatch = pageText.match(/Number\s+of\s+packages[\s\S]{0,50}?(\d{2,3})/i);
      if (altMatch) {
        header.packagesCount = parseInteger(altMatch[1]);
        console.debug('[InvoiceParser] Found packages count (alt):', header.packagesCount);
      } else {
        warnings.push({
          code: 'MISSING_PACKAGES_COUNT',
          message: 'Paketanzahl konnte nicht extrahiert werden',
          severity: 'info',
        });
      }
    }
  }

  /**
   * Parse positions by analyzing the raw text items from PDF
   * This approach is more reliable as it preserves the original layout
   */
  private parsePositionsFromItems(
    rawItems: Array<{ page: number, text: string, x: number, y: number }>,
    lines: ParsedInvoiceLine[],
    warnings: ParserWarning[]
  ): void {
    console.debug('[InvoiceParser] Parsing positions from', rawItems.length, 'text items');

    // Group items by approximate Y position (same line)
    const lineGroups = new Map<number, Array<{ text: string, x: number, page: number }>>();

    for (const item of rawItems) {
      // Round Y to group items on same line (within 3px tolerance)
      const roundedY = Math.round(item.y / 3) * 3;
      const key = item.page * 10000 + roundedY;

      if (!lineGroups.has(key)) {
        lineGroups.set(key, []);
      }
      lineGroups.get(key)!.push({ text: item.text, x: item.x, page: item.page });
    }

    // Sort line groups by page and Y position
    const sortedKeys = [...lineGroups.keys()].sort((a, b) => {
      const pageA = Math.floor(a / 10000);
      const pageB = Math.floor(b / 10000);
      if (pageA !== pageB) return pageA - pageB;
      // Y is inverted in PDF (higher Y = higher on page)
      return (b % 10000) - (a % 10000);
    });

    // Find article codes and EANs
    const articlePattern = /^[A-Z]{2,}[A-Z0-9.#\-]+$/i;
    const eanPattern = /^803\d{10}$/;
    const priceLinePattern = /PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)/;

    let positionIndex = 0;
    let currentArticle = '';
    let currentEan = '';
    let currentDescription = '';
    let orderCandidates: string[] = [];

    for (const key of sortedKeys) {
      const items = lineGroups.get(key)!;
      // Sort by X position
      items.sort((a, b) => a.x - b.x);

      const lineText = items.map(i => i.text).join(' ');
      const trimmedLine = normalizeText(lineText);

      // Skip header/footer content
      if (/^(INVOICE|Falmec|NUMERO|DATA|DESCRIPTION|Continues|EUR|TOTAL|Number of packages|EXPIRY|Informativa)/i.test(trimmedLine)) {
        continue;
      }

      // Check for order reference
      if (/Vs\.\s*ORDINE/i.test(trimmedLine)) {
        const candidates = extractOrderCandidates(trimmedLine);
        orderCandidates.push(...candidates);
        continue;
      }

      // Also check if line contains article code and EAN together
      // Format: "KACL.457#NF 8034122713656"
      const combinedMatch = trimmedLine.match(/([A-Z]{2,}[A-Z0-9.#\-]+)\s+(803\d{10})/i);
      if (combinedMatch) {
        // New combined article+EAN found - reset both
        currentArticle = combinedMatch[1];
        currentEan = combinedMatch[2];
      }

      // Check for article code (left column items at x < 100)
      const leftItems = items.filter(i => i.x < 100);
      for (const item of leftItems) {
        const text = item.text.trim();
        if (articlePattern.test(text) && text.includes('#')) {
          // NEW: Reset EAN when a new article number is found
          if (currentArticle && currentArticle !== text) {
            // New position begins - reset EAN
            currentEan = '';
          }
          currentArticle = text;
        } else if (eanPattern.test(text)) {
          currentEan = text;
        }
      }

      // Check for price line with PZ
      const priceMatch = trimmedLine.match(priceLinePattern);
      if (priceMatch) {
        const qty = parseInteger(priceMatch[1]);
        const unitPrice = parsePrice(priceMatch[2]);
        const totalPrice = parsePrice(priceMatch[3]);

        // Extract description (text before PZ)
        const descMatch = trimmedLine.match(/^(.+?)\s+PZ\s+\d+/);
        if (descMatch) {
          currentDescription = descMatch[1];
        }

        // If we have an article code, create position
        if (currentArticle || currentEan) {
          positionIndex++;

          lines.push({
            positionIndex,
            manufacturerArticleNo: currentArticle,
            ean: currentEan,
            descriptionIT: currentDescription,
            quantityDelivered: qty,
            unitPrice,
            totalPrice,
            orderCandidates: [...orderCandidates],
            orderCandidatesText: orderCandidates.join('|'),
            orderStatus: getOrderStatus(orderCandidates),
            rawPositionText: trimmedLine,
          });

          console.debug('[InvoiceParser] Position', positionIndex, ':', {
            article: currentArticle,
            ean: currentEan,
            qty,
            unitPrice,
            totalPrice,
          });

          // Reset for next position
          currentArticle = '';
          currentEan = '';
          currentDescription = '';
          orderCandidates = [];
        }
      }

    }

    // Alternative parsing: scan full text for patterns
    if (lines.length === 0) {
      console.debug('[InvoiceParser] No positions found with item analysis, trying full text scan...');
      this.parsePositionsFullTextScan(rawItems, lines, warnings);
    }

    if (lines.length === 0) {
      warnings.push({
        code: 'NO_POSITIONS_FOUND',
        message: 'Keine Rechnungspositionen gefunden',
        severity: 'error',
      });
    } else {
      console.debug('[InvoiceParser] Found', lines.length, 'positions');
    }
  }

  /**
   * Fallback: Parse positions by scanning full text
   */
  private parsePositionsFullTextScan(
    rawItems: Array<{ page: number, text: string, x: number, y: number }>,
    lines: ParsedInvoiceLine[],
    warnings: ParserWarning[]
  ): void {
    // Combine all text
    const fullText = rawItems.map(i => i.text).join(' ');

    // Pattern to find article blocks
    // Article code followed by EAN followed by price info
    const blockPattern = /([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)\s+(803\d{10})[^P]*PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)/gi;

    let match;
    let positionIndex = 0;

    while ((match = blockPattern.exec(fullText)) !== null) {
      positionIndex++;

      lines.push({
        positionIndex,
        manufacturerArticleNo: match[1],
        ean: match[2],
        descriptionIT: '',
        quantityDelivered: parseInteger(match[3]),
        unitPrice: parsePrice(match[4]),
        totalPrice: parsePrice(match[5]),
        orderCandidates: [],
        orderCandidatesText: '',
        orderStatus: 'NO',
        rawPositionText: match[0],
      });
    }
  }

  private validateResults(
    header: ParsedInvoiceHeader,
    lines: ParsedInvoiceLine[],
    warnings: ParserWarning[]
  ): boolean {
    let hasBlockingErrors = false;

    if (!header.fatturaNumber) {
      hasBlockingErrors = true;
    }

    if (lines.length === 0) {
      hasBlockingErrors = true;
    }

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

export const invoiceParserFattura = new InvoiceParserFattura();
export { InvoiceParserFattura };
export default invoiceParserFattura;
