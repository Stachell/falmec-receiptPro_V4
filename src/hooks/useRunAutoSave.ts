/**
 * useRunAutoSave — PROJ-23 Phase A2 / PROJ-40 Phase 5
 *
 * Zustand .subscribe() hook with 2s debounce auto-save.
 * Persists the active run's data to IndexedDB whenever relevant state changes.
 *
 * PROJ-40 additions:
 *   - Saves parsedInvoiceResult + serialDocument + uploadMetadata
 *   - descriptionIT is truncated to 10 chars for storage (Memory stays full)
 *
 * Call once in App.tsx: useRunAutoSave();
 *
 * @module hooks/useRunAutoSave
 */

import { useEffect, useRef } from 'react';
import { useRunStore } from '@/store/runStore';
import { runPersistenceService } from '@/services/runPersistenceService';
import { logService } from '@/services/logService';

const DEBOUNCE_MS = 2000;

export function useRunAutoSave(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!runPersistenceService.isAvailable()) {
      console.warn('[AutoSave] IndexedDB not available, auto-save disabled');
      return;
    }

    const unsubscribe = useRunStore.subscribe((state, prev) => {
      // Only save if there's an active run
      if (!state.currentRun) return;

      // Skip if nothing relevant changed
      if (
        state.currentRun === prev.currentRun &&
        state.invoiceLines === prev.invoiceLines &&
        state.issues === prev.issues &&
        state.auditLog === prev.auditLog &&
        state.parsedInvoiceResult === prev.parsedInvoiceResult &&
        state.serialDocument === prev.serialDocument
      ) {
        return;
      }

      // Clear previous debounce timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Debounce the save
      timerRef.current = setTimeout(() => {
        const current = useRunStore.getState();
        if (!current.currentRun) return;

        const runId = current.currentRun.id;

        // Filter data to only this run's items
        const linePrefix = `${runId}-line-`;

        // 5B: descriptionIT truncation — ONLY for persistence payload, Memory stays full
        const runLines = current.invoiceLines
          .filter(l => l.lineId.startsWith(linePrefix))
          .map(l => ({
            ...l,
            descriptionIT: l.descriptionIT ? l.descriptionIT.substring(0, 10) : l.descriptionIT,
          }));

        const runIssues = current.issues.filter(i => i.runId === runId);
        const runAudit = current.auditLog.filter(a => a.runId === runId);

        runPersistenceService.saveRun({
          id: runId,
          run: current.currentRun!,
          invoiceLines: runLines,
          issues: runIssues,
          auditLog: runAudit,
          // 6A Guard: only save parsedPositions/parserWarnings if they belong to THIS run
          parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : [],
          parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : [],
          parsedInvoiceResult: current.parsedInvoiceResult ?? null,   // 5A: PDF-Preview
          serialDocument: current.serialDocument ?? null,              // 5A: S/N-Excel
          uploadMetadata: current.uploadedFiles.map(f => ({           // 5A: Upload-Metadaten
            type: f.type,
            name: f.name,
            size: f.size,
            uploadedAt: f.uploadedAt,
          })),
          runLog: logService.getRunBuffer(runId),
        }).catch(err => {
          console.error('[AutoSave] Failed to save run:', err);
        });
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
}
