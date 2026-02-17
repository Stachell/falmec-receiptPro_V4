/**
 * Invoice Parser Module Registry
 *
 * Modular setup: New parsers can simply be added to the LOCAL_PARSERS array.
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

// Parser Imports
export { FatturaParserService } from './FatturaParserService';

import { FatturaParserService } from './FatturaParserService';
import type { InvoiceParser } from './types';
import { logService } from '../logService';

// 1. Initialisierung der Singleton-Instanzen
const fatturaParser = new FatturaParserService();
// HIER können später weitere Parser (z.B. DeliveryNoteParser) instanziiert werden.

// 2. MODULARE REGISTRIERUNG: Alle lokalen TypeScript-Parser hier eintragen
const LOCAL_PARSERS: InvoiceParser[] = [
  fatturaParser,
];

/** Registry for direct ID lookups */
export const parserRegistry: Map<string, InvoiceParser> = new Map([
  [fatturaParser.moduleId, fatturaParser],
  ['typescript', fatturaParser], 
  ['auto', fatturaParser], 
]);

export function getParser(moduleId: string): InvoiceParser | undefined {
  return parserRegistry.get(moduleId);
}

export function getAllParsers(): InvoiceParser[] {
  return [...LOCAL_PARSERS];
}

/** * THE ROUTER: Findet den passenden Parser modular und transparent.
 */
export async function findParserForFile(pdfFile: File): Promise<InvoiceParser> {
  logService.info(`[Router] Suche passenden lokalen Parser für: ${pdfFile.name}`);

  // Wir iterieren durch alle angemeldeten lokalen Parser
  for (const parser of LOCAL_PARSERS) {
    if (parser.canHandle) {
      const canHandle = await parser.canHandle(pdfFile);
      if (canHandle) {
        logService.info(`[Router] Zuschlag: Lokaler Parser '${parser.moduleName}' hat das PDF akzeptiert.`);
        return parser;
      }
    } else {
      // Wenn der Parser keine canHandle-Prüfung hat, nimmt er die Datei standardmäßig
      logService.info(`[Router] Zuschlag: Lokaler Parser '${parser.moduleName}' übernimmt (Standard).`);
      return parser;
    }
  }

  // ABSOLUTER NOTFALL-FALLBACK
  logService.error('[Router] Keine spezifische Zuordnung gefunden! Erzwinge Fattura-Parser als Notlösung.');
  return fatturaParser;
}