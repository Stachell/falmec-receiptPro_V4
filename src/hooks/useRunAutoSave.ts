/**
 * useRunAutoSave — PROJ-23 Phase A2 / PROJ-40 Phase 5 / PROJ-40 ADD-ON-3
 *
 * Zustand .subscribe() hook with 2s debounce auto-save.
 * Persists the active run's data to IndexedDB whenever relevant state changes.
 *
 * PROJ-40 additions:
 *   - Saves parsedInvoiceResult + serialDocument + uploadMetadata
 *   - descriptionIT is truncated to 10 chars for storage (Memory stays full)
 *
 * PROJ-40 ADD-ON-3 additions:
 *   - lastRunIdRef: tracks last known Run-ID so Unmount-Flush works even after
 *     setCurrentRun(null) has already been called by RunDetail.tsx
 *   - Unmount-Flush: if a pending debounce timer exists on cleanup, execute the
 *     save immediately instead of cancelling it (fire-and-forget, safe because
 *     IDB transactions survive React unmounting)
 *
 * Call once in App.tsx: useRunAutoSave();
 *
 * @module hooks/useRunAutoSave
 */

import { useEffect, useRef } from 'react';
import { useRunStore } from '@/store/runStore';
import { runPersistenceService } from '@/services/runPersistenceService';
import { buildAutoSavePayload } from './buildAutoSavePayload';

const DEBOUNCE_MS = 2000;

export function useRunAutoSave(): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!runPersistenceService.isAvailable()) {
      console.warn('[AutoSave] IndexedDB not available, auto-save disabled');
      return;
    }

    const unsubscribe = useRunStore.subscribe((state, prev) => {
      // Only save if there's an active run
      if (!state.currentRun) return;

      // Track last known Run-ID for Unmount-Flush
      lastRunIdRef.current = state.currentRun.id;

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

        const payload = buildAutoSavePayload(current.currentRun.id);
        if (payload) {
          runPersistenceService.saveRun(payload).catch(err => {
            console.error('[AutoSave] Failed to save run:', err);
          });
        }
      }, DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;

        // PROJ-40 ADD-ON-3: Flush — pending Save sofort ausfuehren
        const runId = lastRunIdRef.current;
        if (runId) {
          const payload = buildAutoSavePayload(runId);
          if (payload) {
            runPersistenceService.saveRun(payload).catch(err => {
              console.error('[AutoSave] Flush on unmount failed:', err);
            });
          }
        }
      }
    };
  }, []);
}
