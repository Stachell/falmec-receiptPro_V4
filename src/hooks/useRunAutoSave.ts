/**
 * useRunAutoSave — PROJ-23 Phase A2
 *
 * Zustand .subscribe() hook with 2s debounce auto-save.
 * Persists the active run's data to IndexedDB whenever relevant state changes.
 *
 * Call once in App.tsx: useRunAutoSave();
 *
 * @module hooks/useRunAutoSave
 */

import { useEffect, useRef } from 'react';
import { useRunStore } from '@/store/runStore';
import { runPersistenceService } from '@/services/runPersistenceService';

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
        state.auditLog === prev.auditLog
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
        const runLines = current.invoiceLines.filter(l => l.lineId.startsWith(linePrefix));
        const runIssues = current.issues.filter(i => i.runId === runId);
        const runAudit = current.auditLog.filter(a => a.runId === runId);

        runPersistenceService.saveRun({
          id: runId,
          run: current.currentRun!,
          invoiceLines: runLines,
          issues: runIssues,
          auditLog: runAudit,
          parsedPositions: current.parsedPositions,
          parserWarnings: current.parserWarnings,
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
