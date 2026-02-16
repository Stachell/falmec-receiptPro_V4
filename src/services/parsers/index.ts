/**
 * Invoice Parser Module Registry
 *
 * Supports both local TypeScript parsing and the devlogic API parser.
 */

// Types
export type {
  InvoiceParser,
  ParsedInvoiceResult,
  ParsedInvoiceHeader,
  ParsedInvoiceLine,
  ParserWarning,
  ValidationResult,
  OrderStatus,
  WarningSeverity,
} from './types';

// Parser
export { FatturaParserService } from './FatturaParserService';
export { DevlogicParser } from './DevlogicParserService';

import { FatturaParserService } from './FatturaParserService';
import { devlogicParser, isDevlogicServerReachable } from './DevlogicParserService';
import type { InvoiceParser } from './types';
import { getParserModeFromEnv, type ParserMode } from './config';

// Create singleton instance
const fatturaParser = new FatturaParserService();

/** Registry with the active parser. */
export const parserRegistry: Map<string, InvoiceParser> = new Map([
  ['fattura', fatturaParser],
  ['fattura_v1', fatturaParser], // Alias for compatibility
  ['InvoiceParser_Fattura', fatturaParser], // Legacy alias
  [devlogicParser.moduleId, devlogicParser],
  ['devlogic', devlogicParser], // Alias for compatibility
]);

/** Get parser by module ID. */
export function getParser(moduleId: string): InvoiceParser | undefined {
  return parserRegistry.get(moduleId);
}

/** Get all available parsers. */
export function getAllParsers(): InvoiceParser[] {
  return [devlogicParser, fatturaParser];
}

/** Returns configured parser mode from Vite env. */
export function getConfiguredParserMode(): ParserMode {
  return getParserModeFromEnv();
}

/** Find parser for a file based on parser mode and availability. */
export async function findParserForFile(pdfFile: File): Promise<InvoiceParser> {
  const mode = getConfiguredParserMode();

  if (mode === 'devlogic') {
    return devlogicParser;
  }

  if (mode === 'typescript') {
    return fatturaParser;
  }

  // auto: prefer local TypeScript parser, use devlogic as backup
  const tsCanHandle = await fatturaParser.canHandle?.(pdfFile);
  if (tsCanHandle !== false) {
    return fatturaParser;
  }

  const devlogicAvailable = await isDevlogicServerReachable();
  if (devlogicAvailable) {
    const devlogicCanHandle = await devlogicParser.canHandle?.(pdfFile);
    if (devlogicCanHandle !== false) return devlogicParser;
  }

  return fatturaParser;
}
