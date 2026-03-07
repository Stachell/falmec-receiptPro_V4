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
      descriptionIT: l.descriptionIT ? l.descriptionIT.substring(0, 10) : l.descriptionIT,
    }));

  return {
    id: runId,
    run,
    invoiceLines: runLines,
    issues: current.issues.filter(i => i.runId === runId),
    auditLog: current.auditLog.filter(a => a.runId === runId),
    parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : [],
    parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : [],
    parsedInvoiceResult: current.parsedInvoiceResult ?? null,
    serialDocument: current.serialDocument ?? null,
    uploadMetadata: current.uploadedFiles.map(f => ({
      type: f.type, name: f.name, size: f.size, uploadedAt: f.uploadedAt,
    })),
    runLog: logService.getRunBuffer(runId),
  };
}
