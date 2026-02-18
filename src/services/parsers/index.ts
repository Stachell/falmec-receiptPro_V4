/**
 * Invoice Parser Module Registry
 *
 * Modular setup: New parsers can simply be added to the LOCAL_PARSERS array.
 * V2 is registered BEFORE V1 for higher priority (per PROJ-14 Spec C.4).
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
export { FatturaParserService_V1 } from './modules/FatturaParserService_V1';
export { FatturaParserService_V2 } from './modules/FatturaParserService_V2';

import { FatturaParserService_V1 } from './modules/FatturaParserService_V1';
import { FatturaParserService_V2 } from './modules/FatturaParserService_V2';
import type { InvoiceParser } from './types';
import { logService } from '../logService';

// 1. Initialisierung der Singleton-Instanzen
const fatturaParserV2 = new FatturaParserService_V2();
const fatturaParserV1 = new FatturaParserService_V1();

// 2. MODULARE REGISTRIERUNG: Alle lokalen TypeScript-Parser hier eintragen
//    V2 VOR V1 = hoehere Prioritaet (PROJ-14 Spec C.4)
const LOCAL_PARSERS: InvoiceParser[] = [
  fatturaParserV2,
  fatturaParserV1,
];

/** Registry for direct ID lookups */
export const parserRegistry: Map<string, InvoiceParser> = new Map([
  [fatturaParserV2.moduleId, fatturaParserV2],
  [fatturaParserV1.moduleId, fatturaParserV1],
  ['typescript', fatturaParserV2],
  ['auto', fatturaParserV2],
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
  logService.error('[Router] Keine spezifische Zuordnung gefunden! Erzwinge V2-Parser als Notlösung.');
  return fatturaParserV2;
}
