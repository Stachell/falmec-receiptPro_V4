/**
 * stepGuard — PROJ-49
 *
 * Central prerequisite validation for workflow steps.
 * Two functions with clear responsibilities:
 *   - validateStepPrerequisites(): pure, sync, read-only — diagnoses missing data
 *   - applyStepRepairs(): async, with side effects — rehydrates from IDB/MasterDataStore
 *
 * Rehydration sources (by priority):
 *   1. Run-specific IDB snapshot (runPersistenceService.loadRun)
 *   2. MasterData IDB (useMasterDataStore.load)
 *   3. NEVER from global uploadedFiles (not run-bound)
 */

import type {
  ParsedInvoiceLineExtended,
  PreFilteredSerialRow,
  InvoiceLine,
  Run,
} from '@/types';
import type { ParsedInvoiceResult } from '@/services/parsers';
import type { SerialDocument } from '@/services/matchers/types';
import { runPersistenceService } from '@/services/runPersistenceService';
import { useMasterDataStore } from '@/store/masterDataStore';
import { logService } from '@/services/logService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MissingField {
  field: string;
  available: 'store' | 'idb' | 'masterDataStore' | 'none';
}

export interface StepGuardResult {
  canProceed: boolean;
  missingFields: MissingField[];
  skipReason?: string;
  blockReason?: string;
}

/** Minimal slice of RunState needed by the guard (avoids circular import of full RunState). */
export interface StepGuardInput {
  parsedInvoiceResult: ParsedInvoiceResult | null;
  parsedPositions: ParsedInvoiceLineExtended[];
  invoiceLines: InvoiceLine[];
  preFilteredSerials: PreFilteredSerialRow[];
  serialDocument: SerialDocument | null;
  uploadedFiles: { type: string }[];
  runs: Run[];
}

/** Setter function for writing repairs into the store. */
export type GuardStoreSetter = (partial: {
  parsedPositions?: ParsedInvoiceLineExtended[];
  parsedInvoiceResult?: ParsedInvoiceResult | null;
  preFilteredSerials?: PreFilteredSerialRow[];
  serialDocument?: SerialDocument | null;
  currentParsedRunId?: string | null;
}) => void;

// ── validateStepPrerequisites — pure, sync ───────────────────────────────────

export function validateStepPrerequisites(
  stepNo: number,
  runId: string,
  state: StepGuardInput,
): StepGuardResult {
  switch (stepNo) {
    case 2: return validateStep2(runId, state);
    case 3: return validateStep3(runId, state);
    case 4: return validateStep4(runId, state);
    case 5: return validateStep5(runId, state);
    default: return { canProceed: true, missingFields: [] };
  }
}

// ── Step 2: Artikel extrahieren ──────────────────────────────────────────────

function validateStep2(runId: string, state: StepGuardInput): StepGuardResult {
  const missingFields: MissingField[] = [];

  // 1. parsedInvoiceResult present with lines?
  if (!state.parsedInvoiceResult || state.parsedInvoiceResult.lines.length === 0) {
    missingFields.push({ field: 'parsedInvoiceResult', available: 'none' });
  }

  // 2. invoiceLines for this run present?
  const linePrefix = `${runId}-line-`;
  const hasRunLines = state.invoiceLines.some(l => l.lineId.startsWith(linePrefix));
  if (!hasRunLines) {
    missingFields.push({ field: 'invoiceLines', available: 'none' });
  }

  // 3. Artikelstammdaten verfuegbar?
  // Feldname 'parsedArticlePool' signalisiert: SSOT-Runs nutzen IDB, nicht den globalen Store.
  // Sync-Pfad kann nicht zwischen SSOT/Legacy unterscheiden — IDB-Read ist async.
  // Deshalb: immer als 'idb' markieren, damit applyStepRepairs den SSOT-aware Pfad nutzt.
  const masterArticles = useMasterDataStore.getState().articles;
  if (masterArticles.length === 0) {
    missingFields.push({ field: 'parsedArticlePool', available: 'idb' });
  }

  // parsedInvoiceResult/invoiceLines missing = Step 1 never ran → hard block
  const hasHardBlockers = missingFields.some(
    f => f.field !== 'parsedArticlePool' && f.available === 'none',
  );

  return {
    canProceed: missingFields.length === 0,
    missingFields,
    blockReason: hasHardBlockers
      ? 'Step 1 muss zuerst laufen (parsedInvoiceResult/invoiceLines fehlen)'
      : undefined,
  };
}

// ── Step 3: Seriennummer anfuegen ────────────────────────────────────────────

export async function validateStep3Async(runId: string, state: StepGuardInput): Promise<StepGuardResult> {
  const missingFields: MissingField[] = [];

  // 1. serialRequired on at least one line?
  const linePrefix = `${runId}-line-`;
  const runLines = state.invoiceLines.filter(l => l.lineId.startsWith(linePrefix));
  const hasSerialRequired = runLines.some(l => l.serialRequired);

  if (!hasSerialRequired) {
    return {
      canProceed: true,
      missingFields: [],
      skipReason: 'Keine S/N-Pflicht auf Rechnungspositionen',
    };
  }

  // PROJ-49 SSOT: F3 Scope-Differenzierung — drei Ebenen klar getrennt

  // Ebene 1: Kein IDB-Eintrag.
  // Annahme: SSOT-Runs schreiben Phase 1 immer in IDB → kein IDB = Legacy-Run.
  // Technisch kann !idbData auch ein Defekt sein (IDB gelöscht). Deshalb:
  // ERROR statt WARN loggen, damit Defekte in Monitoring sichtbar sind.
  // canProceed: true für Rückwärtskompatibilität mit Legacy-Runs.
  const idbData = await runPersistenceService.loadRun(runId);
  if (!idbData) {
    logService.error(
      '[StepGuard] Step 3: Kein IDB-Snapshot. ' +
      'Entweder Legacy-Run oder Datenverlust. Serial-Status unbekannt.',
      { runId, step: 'System' },
    );
    return {
      canProceed: true,
      missingFields: [],
      skipReason: 'Kein IDB-Snapshot — Legacy oder Defekt, Serial-Status unbekannt',
    };
  }

  // Ebene 2: IDB vorhanden, kein ingestStatus → Legacy-Run in IDB (altes Format) → Warn-Skip
  if (!idbData.ingestStatus) {
    logService.warn(
      '[StepGuard] Step 3: IDB ohne ingestStatus (Legacy-Run). Serial-Status unbekannt.',
      { runId, step: 'System' },
    );
    return {
      canProceed: true,
      missingFields: [],
      skipReason: 'IDB ohne ingestStatus (Legacy-Run) — Serial-Status unbekannt',
    };
  }

  // Ebene 3: SSOT-Run → ingestStatus.serialList ist autoritativ
  if (idbData.ingestStatus.serialList === 'not_provided') {
    return {
      canProceed: true,
      missingFields: [],
      skipReason: 'serialList nicht bereitgestellt (optional)',
    };
  }
  if (idbData.ingestStatus.serialList !== 'ready') {
    return {
      canProceed: false,
      missingFields: [{ field: 'serialDocument', available: 'none' }],
      blockReason: `serialList-Status '${idbData.ingestStatus.serialList}' — Integritätsfehler`,
    };
  }
  // serialList === 'ready' → normal weiter, In-Memory-Daten prüfen

  // 2. S/N data source present?
  if (state.preFilteredSerials.length === 0 && state.serialDocument === null) {
    // Mark as potentially repairable from IDB
    missingFields.push({ field: 'serialData', available: 'idb' });
  }

  return {
    canProceed: missingFields.length === 0,
    missingFields,
  };
}

// Synchroner Wrapper für validateStep3 — wird intern async gemacht, aber
// das Interface validateStepPrerequisites muss sync bleiben für bestehende Aufrufer.
// Intern wird die async-Variante verwendet.
function validateStep3(runId: string, state: StepGuardInput): StepGuardResult {
  // Legacy-Fallback für synchronen Aufruf (ohne IDB-Check)
  const missingFields: MissingField[] = [];

  const linePrefix = `${runId}-line-`;
  const runLines = state.invoiceLines.filter(l => l.lineId.startsWith(linePrefix));
  const hasSerialRequired = runLines.some(l => l.serialRequired);

  if (!hasSerialRequired) {
    return {
      canProceed: true,
      missingFields: [],
      skipReason: 'Keine S/N-Pflicht auf Rechnungspositionen',
    };
  }

  // 2. S/N data source present?
  if (state.preFilteredSerials.length === 0 && state.serialDocument === null) {
    missingFields.push({ field: 'serialData', available: 'idb' });
  }

  return {
    canProceed: missingFields.length === 0,
    missingFields,
  };
}

// ── Step 4: Bestellungen mappen ──────────────────────────────────────────────

function validateStep4(runId: string, state: StepGuardInput): StepGuardResult {
  const missingFields: MissingField[] = [];

  // 1. parsedPositions present?
  if (state.parsedPositions.length === 0) {
    if (state.parsedInvoiceResult && state.parsedInvoiceResult.lines.length > 0) {
      // Reconstructable from parsedInvoiceResult in store
      missingFields.push({ field: 'parsedPositions', available: 'store' });
    } else {
      // Need IDB
      missingFields.push({ field: 'parsedPositions', available: 'idb' });
    }
  }

  // 2. Lines have falmecArticleNo set? (Step 2 must have run)
  const linePrefix = `${runId}-line-`;
  const runLines = state.invoiceLines.filter(l => l.lineId.startsWith(linePrefix));
  if (runLines.length > 0) {
    const hasArticleNo = runLines.some(l => l.falmecArticleNo !== null && l.falmecArticleNo !== '');
    if (!hasArticleNo) {
      missingFields.push({ field: 'falmecArticleNo', available: 'none' });
    }
  }

  const hasHardBlockers = missingFields.some(f => f.available === 'none');

  return {
    canProceed: missingFields.length === 0,
    missingFields,
    blockReason: hasHardBlockers
      ? 'Step 2 muss zuerst laufen (falmecArticleNo fehlt)'
      : undefined,
  };
}

// ── Step 5: Export ───────────────────────────────────────────────────────────

function validateStep5(runId: string, state: StepGuardInput): StepGuardResult {
  const run = state.runs.find(r => r.id === runId);
  if (!run) {
    return { canProceed: false, missingFields: [], blockReason: 'Run nicht gefunden' };
  }

  // 1. isExpanded?
  if (!run.isExpanded) {
    return {
      canProceed: false,
      missingFields: [{ field: 'isExpanded', available: 'none' }],
      blockReason: 'Step 4 muss zuerst laufen (Run nicht expandiert)',
    };
  }

  // 2. Step 4 status ok or soft-fail?
  const step4 = run.steps.find(s => s.stepNo === 4);
  if (!step4 || (step4.status !== 'ok' && step4.status !== 'soft-fail')) {
    return {
      canProceed: false,
      missingFields: [],
      blockReason: 'Step 4 ist nicht abgeschlossen',
    };
  }

  return { canProceed: true, missingFields: [] };
}

// ── applyStepRepairs — async, side effects ───────────────────────────────────

export async function applyStepRepairs(
  result: StepGuardResult,
  stepNo: number,
  runId: string,
  state: StepGuardInput,
  set: GuardStoreSetter,
): Promise<StepGuardResult> {
  // Nothing to repair if already good or hard-blocked with no repairable fields
  if (result.canProceed) return result;

  const repairableFields = result.missingFields.filter(f => f.available !== 'none');
  if (repairableFields.length === 0) return result;

  logService.info(
    `[StepGuard] Step ${stepNo}: Reparatur gestartet (${repairableFields.map(f => f.field).join(', ')})`,
    { runId, step: 'System' },
  );

  const repairedFields: string[] = [];

  for (const field of repairableFields) {
    switch (field.field) {
      case 'parsedArticlePool': {
        // SSOT-Runs: parsedArticlePool aus run-spezifischer IDB ist autoritativ.
        // Legacy-Runs: Fallback auf globalen masterDataStore.
        const idbData = await runPersistenceService.loadRun(runId);
        if (idbData?.ingestStatus) {
          // SSOT-Run: AUSSCHLIESSLICH parsedArticlePool aus IDB
          if (idbData.parsedArticlePool && idbData.parsedArticlePool.length > 0) {
            repairedFields.push('parsedArticlePool');
          } else {
            field.available = 'none';
          }
        } else {
          // Legacy-Run: masterDataStore laden (bestehende Logik)
          await useMasterDataStore.getState().load();
          if (useMasterDataStore.getState().articles.length > 0) {
            repairedFields.push('parsedArticlePool');
          } else {
            field.available = 'none';
          }
        }
        break;
      }

      case 'serialData': {
        const idbData = await runPersistenceService.loadRun(runId);
        if (idbData) {
          const repairs: Parameters<GuardStoreSetter>[0] = {};
          if (idbData.preFilteredSerials && idbData.preFilteredSerials.length > 0) {
            repairs.preFilteredSerials = idbData.preFilteredSerials;
          }
          if (idbData.serialDocument) {
            repairs.serialDocument = idbData.serialDocument;
          }

          if (repairs.preFilteredSerials || repairs.serialDocument) {
            set(repairs);
            repairedFields.push('serialData');
          } else {
            // IDB also empty — check uploadMetadata for serialList
            const hasSerialUpload = idbData.uploadMetadata?.some(
              m => m.type === 'serialList',
            );
            if (hasSerialUpload) {
              logService.error(
                '[StepGuard] Serial-Datenverlust: uploadMetadata hat serialList aber Store+IDB leer',
                { runId, step: 'System' },
              );
              return {
                canProceed: false,
                missingFields: result.missingFields,
                blockReason:
                  'Serial-Datei war vorhanden aber Daten fehlen in Store und IDB. Bitte Serial-Liste erneut hochladen.',
              };
            } else {
              // No serial upload for this run → skip
              return {
                canProceed: true,
                missingFields: [],
                skipReason: 'Keine Serial-Datei fuer diesen Run hochgeladen',
              };
            }
          }
        } else {
          // No IDB data at all — skip gracefully
          return {
            canProceed: true,
            missingFields: [],
            skipReason: 'Kein IDB-Snapshot vorhanden — Serial-Step wird uebersprungen',
          };
        }
        break;
      }

      case 'parsedPositions': {
        // Priority 1: Reconstruct from parsedInvoiceResult in store
        if (field.available === 'store' && state.parsedInvoiceResult) {
          const positions = reconstructPositions(state.parsedInvoiceResult);
          set({ parsedPositions: positions, currentParsedRunId: runId });
          repairedFields.push('parsedPositions');
          break;
        }

        // Priority 2: Load from IDB
        const idbData = await runPersistenceService.loadRun(runId);
        if (idbData) {
          let positions = idbData.parsedPositions;
          if ((!positions || positions.length === 0) && idbData.parsedInvoiceResult) {
            positions = reconstructPositions(idbData.parsedInvoiceResult);
          }

          if (positions && positions.length > 0) {
            set({ parsedPositions: positions, currentParsedRunId: runId });
            // Also restore parsedInvoiceResult if it was missing in store
            if (!state.parsedInvoiceResult && idbData.parsedInvoiceResult) {
              set({ parsedInvoiceResult: idbData.parsedInvoiceResult });
            }
            repairedFields.push('parsedPositions');
          } else {
            field.available = 'none';
          }
        } else {
          field.available = 'none';
        }
        break;
      }
    }
  }

  // Re-evaluate after repairs
  const stillMissing = result.missingFields.filter(
    f => !repairedFields.includes(f.field),
  );
  const hasBlockers = stillMissing.some(f => f.available === 'none');

  if (repairedFields.length > 0) {
    logService.info(
      `[StepGuard] Step ${stepNo}: Repariert: ${repairedFields.join(', ')}`,
      { runId, step: 'System' },
    );
  }

  if (hasBlockers) {
    const unrepairable = stillMissing
      .filter(f => f.available === 'none')
      .map(f => f.field)
      .join(', ');
    return {
      canProceed: false,
      missingFields: stillMissing,
      blockReason: result.blockReason ?? `Felder nicht reparierbar: ${unrepairable}`,
    };
  }

  return {
    canProceed: stillMissing.length === 0,
    missingFields: stillMissing,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function reconstructPositions(
  result: ParsedInvoiceResult,
): ParsedInvoiceLineExtended[] {
  return result.lines.map(line => ({
    positionIndex: line.positionIndex,
    manufacturerArticleNo: line.manufacturerArticleNo,
    ean: line.ean,
    descriptionIT: line.descriptionIT,
    quantityDelivered: line.quantityDelivered,
    unitPrice: line.unitPrice,
    totalPrice: line.totalPrice,
    orderCandidates: line.orderCandidates,
    orderCandidatesText: line.orderCandidatesText,
    orderStatus: line.orderStatus,
  }));
}
