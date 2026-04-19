/**
 * buildAutoSavePayload — PROJ-40 ADD-ON-3
 *
 * Shared helper: baut die Save-Payload für runPersistenceService.saveRun()
 * aus dem aktuellen Zustand des runStore auf.
 *
 * Wird von drei Stellen genutzt:
 *  - useRunAutoSave Debounce-Callback
 *  - useRunAutoSave Unmount-Flush
 *  - executeMatcherSerialExtract Hard Checkpoint
 *
 * Gibt null zurück, wenn weder currentRun noch ein Run im runs-Array
 * für die gegebene runId gefunden wird.
 */

import { useRunStore } from '@/store/runStore';
import { logService } from '@/services/logService';

export function buildAutoSavePayload(runId: string) {
  const current = useRunStore.getState();

  // Fallback: wenn currentRun bereits null (Unmount-Race), Run aus runs-Array holen
  const run = current.currentRun?.id === runId
    ? current.currentRun
    : current.runs.find(r => r.id === runId);
  if (!run) return null;

  const linePrefix = `${runId}-line-`;
  const runLines = current.invoiceLines
    .filter(l => l.lineId.startsWith(linePrefix))
    .map(l => ({
      ...l,
      descriptionIT: l.descriptionIT,
    }));

  // PROJ-49 SSOT: Ownership-Guard — null-Fallback entfernt.
  // owned ist nur true wenn currentParsedRunId exakt dieser runId entspricht.
  // Verhindert, dass parsedPositions/parserWarnings eines fremden Runs
  // unter dieser runId in IDB geschrieben werden.
  const owned = current.currentParsedRunId === runId;

  return {
    id: runId,
    currentParsedRunId: current.currentParsedRunId,  // PROJ-49: Ownership-Signal fuer saveRun() Overwrite-Schutz
    run,
    invoiceLines: runLines,
    issues: current.issues.filter(i => i.runId === runId),
    auditLog: current.auditLog.filter(a => a.runId === runId),
    parsedPositions: owned ? current.parsedPositions : [],
    parserWarnings: owned ? current.parserWarnings : [],
    parsedInvoiceResult: owned ? (current.parsedInvoiceResult ?? null) : null,
    serialDocument: current.serialDocument ?? null,
    preFilteredSerials: current.preFilteredSerials.length > 0
      ? current.preFilteredSerials : undefined,
    // PROJ-49 SSOT: uploadMetadata nur bauen wenn owned UND uploadedFiles nicht leer.
    // SSOT-Runs haben uploadMetadata bereits via ingestAndPersistRunData() in IDB persistiert.
    // Nach resetRunSensitiveState() ist uploadedFiles leer — leere Überschreibung würde
    // die korrekt persistierten Phase-1-Daten zerstören. Der saveRun()-Merge-Schutz
    // fängt das zusätzlich ab, aber dieser Guard verhindert es primär.
    uploadMetadata: (owned && current.uploadedFiles.length > 0)
      ? current.uploadedFiles.map(f => ({ type: f.type, name: f.name, size: f.size, uploadedAt: f.uploadedAt }))
      : undefined,
    runLog: logService.getRunBuffer(runId),
  };
}
