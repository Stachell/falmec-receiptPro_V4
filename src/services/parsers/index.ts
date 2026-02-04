/**
 * Invoice Parser Module Registry
 *
 * Exports all available parser modules and types.
 * New parser modules should be registered here.
 *
 * @module parsers
 */

// Types
export type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParsedInvoiceHeader,
  ParsedInvoiceLine,
  ParserWarning,
  ParserConfig,
  ParserState,
  OrderStatus,
  WarningSeverity,
} from './types';

// Parser modules
export {
  invoiceParserFattura,
  InvoiceParserFattura,
} from './InvoiceParser_Fattura';

// Registry of available parsers
import { invoiceParserFattura } from './InvoiceParser_Fattura';
import type { InvoiceParser } from './types';

/**
 * Registry of all available invoice parsers
 * Add new parsers here when implementing additional layouts
 */
export const parserRegistry: Map<string, InvoiceParser> = new Map([
  ['InvoiceParser_Fattura', invoiceParserFattura],
]);

/**
 * Get parser by module ID
 */
export function getParser(moduleId: string): InvoiceParser | undefined {
  return parserRegistry.get(moduleId);
}

/**
 * Get all available parsers
 */
export function getAllParsers(): InvoiceParser[] {
  return Array.from(parserRegistry.values());
}

/**
 * Find the appropriate parser for a given PDF file
 * Tries each parser's canHandle method to find a match
 */
export async function findParserForFile(pdfFile: File): Promise<InvoiceParser | null> {
  for (const parser of parserRegistry.values()) {
    if (parser.canHandle) {
      try {
        const canHandle = await parser.canHandle(pdfFile);
        if (canHandle) {
          return parser;
        }
      } catch {
        // Parser failed to check, continue to next
        continue;
      }
    }
  }

  // Default to Fattura parser if no specific match
  return invoiceParserFattura;
}
