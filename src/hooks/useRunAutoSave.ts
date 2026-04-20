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
      if (!state.currentRun) return;

      const currentRunId = state.currentRun.id;

      // PROJ-46 M4 AP10: Run-Wechsel im Debounce-Fenster → Flush pending für old run
      if (timerRef.current && lastRunIdRef.current && lastRunIdRef.current !== currentRunId) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const staleRunId = lastRunIdRef.current;
        const stalePayload = buildAutoSavePayload(staleRunId);
        if (stalePayload) {
          runPersistenceService.saveRun(stalePayload).catch(err => {
            console.error('[AutoSave] Run-switch flush failed:', err);
          });
        }
      }

      lastRunIdRef.current = currentRunId;

      // Skip if nothing relevant changed
      // PROJ-46 M3.5 Leak-Patch: 4 neue Felder — 2 echte Lecks (currentParsedRunId,
      // parsedPositions) + 2 Sicherheitsnetze (parserWarnings, preFilteredSerials).
      // Payload-Kongruenz-Regel (I.md B-XX): jedes Payload-Feld muss direkt
      // beobachtet oder verlässlich aus beobachtetem Feld abgeleitet sein.
      if (
        state.currentRun === prev.currentRun &&
        state.invoiceLines === prev.invoiceLines &&
        state.issues === prev.issues &&
        state.auditLog === prev.auditLog &&
        state.parsedInvoiceResult === prev.parsedInvoiceResult &&
        state.serialDocument === prev.serialDocument &&
        state.currentParsedRunId === prev.currentParsedRunId &&
        state.parsedPositions === prev.parsedPositions &&
        state.parserWarnings === prev.parserWarnings &&
        state.preFilteredSerials === prev.preFilteredSerials
      ) {
        return;
      }

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        // Captured currentRunId aus Closure (nicht live state)
        const payload = buildAutoSavePayload(currentRunId);
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
        // PROJ-46 M4 AP10 V5: Consume-Guard gegen Doppel-Flush beim Tab-Close.
        const runId = lastRunIdRef.current;
        if (runId) {
          lastRunIdRef.current = null;
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

  // PROJ-46 M4 AP10 — Tab-Close-Flush via pagehide (modern, iOS-safe).
  // V4: Consume-Pattern — Ref wird nach Capture genullt, damit der
  // nachfolgende React-Unmount-Cleanup bei Tab-Close nicht denselben Payload
  // ein zweites Mal in IDB schreibt.
  useEffect(() => {
    const flushOnHide = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const runId = lastRunIdRef.current;
      if (!runId) return;
      lastRunIdRef.current = null;
      const payload = buildAutoSavePayload(runId);
      if (payload) {
        runPersistenceService.saveRun(payload).catch(err => {
          console.error('[AutoSave] pagehide flush failed:', err);
        });
      }
    };
    window.addEventListener('pagehide', flushOnHide);
    return () => {
      window.removeEventListener('pagehide', flushOnHide);
    };
  }, []);
}
