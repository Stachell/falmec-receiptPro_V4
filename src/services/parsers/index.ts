/**
 * Invoice Parser Module Registry
 *
 * Modular setup: New parsers can simply be added to the LOCAL_PARSERS array.
 * FatturaParser_Master is the sole production parser (Phase E cleanup, PROJ-14).
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
export { FatturaParser_Master } from './modules/FatturaParser_Master';

import { FatturaParser_Master } from './modules/FatturaParser_Master';
import type { InvoiceParser } from './types';
import { logService } from '../logService';

// Singleton-Instanz
const fatturaMaster = new FatturaParser_Master();

// MODULARE REGISTRIERUNG: Alle lokalen TypeScript-Parser hier eintragen
const LOCAL_PARSERS: InvoiceParser[] = [
  fatturaMaster,
];

/** Registry for direct ID lookups */
export const parserRegistry: Map<string, InvoiceParser> = new Map([
  [fatturaMaster.moduleId, fatturaMaster],
  ['typescript', fatturaMaster],
  ['auto', fatturaMaster],
]);

export function getParser(moduleId: string): InvoiceParser | undefined {
  return parserRegistry.get(moduleId);
}

export function getAllParsers(): InvoiceParser[] {
  return [...LOCAL_PARSERS];
}

/**
 * THE ROUTER: Findet den passenden Parser modular und transparent.
 */
export async function findParserForFile(pdfFile: File): Promise<InvoiceParser> {
  logService.info(`[Router] Suche passenden lokalen Parser fuer: ${pdfFile.name}`);

  for (const parser of LOCAL_PARSERS) {
    if (parser.canHandle) {
      const canHandle = await parser.canHandle(pdfFile);
      if (canHandle) {
        logService.info(`[Router] Zuschlag: Lokaler Parser '${parser.moduleName}' hat das PDF akzeptiert.`);
        return parser;
      }
    } else {
      logService.info(`[Router] Zuschlag: Lokaler Parser '${parser.moduleName}' uebernimmt (Standard).`);
      return parser;
    }
  }

  // ABSOLUTER NOTFALL-FALLBACK
  logService.error('[Router] Keine spezifische Zuordnung gefunden! Erzwinge Master-Parser als Notloesung.');
  return fatturaMaster;
}
