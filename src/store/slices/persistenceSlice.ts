// slices/persistenceSlice.ts — PROJ-46 AP4c (Slice-Split)
// 1:1-Umzug aus runStore.ts — Mechaniker-Kontrakt, keine Logik-Änderungen.
// Ownership: archive + IDB-persistence Actions.

import type { StateCreator } from 'zustand';
import type { RunState } from '@/store/types';
import type { Run } from '@/types';
// Bring in every value-import the moved action bodies use.
import { archiveService } from '@/services/archiveService';
import { logService } from '@/services/logService';
import { runPersistenceService, isTombstoneRecord } from '@/services/runPersistenceService';

export type PersistenceSlice = Pick<
  RunState,
  | 'archiveRun'
  | 'abortRun'
  | 'loadPersistedRun'
  | 'loadPersistedRunList'
  | 'getStorageStats'
  | 'exportRunsToDirectory'
  | 'deletePersistedRun'
  | 'clearPersistedRuns'
>;

export const createPersistenceSlice: StateCreator<RunState, [], [], PersistenceSlice> = (set, get) => ({
  archiveRun: async (runId) => {
    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) {
      logService.warn('archiveRun: Run nicht gefunden', { runId, step: 'Archiv' });
      return { success: false, folderName: '' };
    }

    const lines = state.invoiceLines.filter(l => l.lineId.startsWith(runId));

    // PROJ-49 SSOT 13: preFilteredSerials aus IDB für SSOT-Runs
    const idbArchiveData = await runPersistenceService.loadRun(runId);
    const isSSoTArchiveRun = !!idbArchiveData?.ingestStatus;
    let serialsForArchive: typeof state.preFilteredSerials;
    if (isSSoTArchiveRun) {
      const serialStatus = idbArchiveData!.ingestStatus!.serialList;
      if (serialStatus === 'not_provided') {
        serialsForArchive = [];
      } else if (serialStatus === 'ready') {
        if (!idbArchiveData!.preFilteredSerials) {
          logService.error('[archiveRun] SSOT-Run: serialList=ready aber kein preFilteredSerials — Abbruch', { runId });
          return { success: false, folderName: '' };
        }
        serialsForArchive = idbArchiveData!.preFilteredSerials;
      } else {
        logService.error(`[archiveRun] SSOT-Run: serialList-Status '${serialStatus}' — Abbruch`, { runId });
        return { success: false, folderName: '' };
      }
    } else {
      // Legacy-Run: Fallback auf globalen State
      serialsForArchive = idbArchiveData?.preFilteredSerials ?? state.preFilteredSerials;
    }

    if (run.archivePath) {
      // PROJ-27-ADDON-2: Early Archive existiert → nur finale Daten anhängen
      const result = await archiveService.appendToArchive(run.archivePath, run, lines, {
        preFilteredSerials: serialsForArchive,
        issues: state.issues,
      });
      if (result.success) {
        logService.exportRunLog(runId).catch(() => {});
      }
      return { success: result.success, folderName: run.archivePath };
    } else {
      // Legacy-Fallback: Kein Early Archive → volles Paket schreiben
      const result = await archiveService.writeArchivePackage(run, lines, {
        preFilteredSerials: serialsForArchive,
        issues: state.issues,
      });

      if (result.success && result.folderName) {
        set((s) => ({
          runs: s.runs.map(r =>
            r.id === runId ? { ...r, archivePath: result.folderName } : r
          ),
          currentRun: s.currentRun?.id === runId
            ? { ...s.currentRun, archivePath: result.folderName }
            : s.currentRun,
        }));
      }

      if (result.cleanedUp) {
        logService.exportRunLog(runId).catch(err =>
          console.warn('[RunStore] archiveRun: exportRunLog failed', err)
        );
      }

      return { success: result.success, folderName: result.folderName };
    }
  },

  // PROJ-12: Abort run and create partial archive
  abortRun: (runId) => {
    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;

    // Mark run + running step as failed
    set((state) => ({
      runs: state.runs.map(r => {
        if (r.id !== runId) return r;
        return {
          ...r,
          status: 'failed' as const,
          steps: r.steps.map(s =>
            s.status === 'running' ? { ...s, status: 'failed' as const } : s
          ),
        };
      }),
      currentRun: state.currentRun?.id === runId
        ? {
            ...state.currentRun,
            status: 'failed' as const,
            steps: state.currentRun.steps.map(s =>
              s.status === 'running' ? { ...s, status: 'failed' as const } : s
            ),
          }
        : state.currentRun,
    }));

    logService.info('Run abgebrochen', { runId, step: 'System' });

    // Fire-and-forget partial archive
    get().archiveRun(runId).catch(err =>
      logService.error(`Teilarchivierung fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId, step: 'Archiv' })
    );
  },

  loadPersistedRun: async (runId: string) => {
    try {
      const data = await runPersistenceService.loadRun(runId);
      if (!data) {
        // PROJ-49: Änderung 14 — !data-Pfad: Ownership setzen (frischer Run ohne IDB-Eintrag)
        set({ currentParsedRunId: runId });
        console.warn(`[RunStore] No persisted run found for: ${runId}`);
        return false;
      }

      // PROJ-50 FINAL-FIX: Tombstone-Erkennung via Record-SSOT-Helper.
      //   Löst die alte 2-Feld-Heuristik (pdf/articleList) durch die zentrale
      //   6-fach-konjunktive Logik ab — kein Drift mehr zwischen Call-Sites.
      if (isTombstoneRecord(data)) {
        logService.error(`[loadPersistedRun] Tombstone-Run ${runId} erkannt — auto-delete`);
        const deleted = await get().deletePersistedRun(runId);
        if (!deleted) {
          logService.error(`[loadPersistedRun] Auto-Delete Tombstone ${runId} fehlgeschlagen — IDB-Infrastrukturproblem`);
        }
        return false;
      }
      // PROJ-49: Änderung 14b-Legacy — Ghost-Run-Erkennung für halb-gelungene Ingests,
      //   die NICHT als Tombstone markiert sind (pdf/articleList müssen 'ready' sein,
      //   sonst ist der Record nicht produktiv nutzbar).
      if (data.ingestStatus) {
        const { pdf, articleList } = data.ingestStatus;
        if (pdf !== 'ready' || articleList !== 'ready') {
          logService.error(`[loadPersistedRun] SSOT-Run ${runId} mit unvollständigem Ingest erkannt — auto-delete`);
          const deleted = await get().deletePersistedRun(runId);
          if (!deleted) {
            logService.error(`[loadPersistedRun] Auto-Delete Ghost-Run ${runId} fehlgeschlagen — IDB-Infrastrukturproblem`);
          }
          return false;
        }
      }

      // PROJ-44-R6: Backward-Compat — alte Runs ohne orphanSerials normalisieren
      const normalizedRun: Run = { ...data.run, orphanSerials: data.run.orphanSerials ?? [] };

      set((state) => {
        // Merge persisted run into runs array (replace if exists, add if not)
        const existingIndex = state.runs.findIndex(r => r.id === runId);
        const updatedRuns = existingIndex >= 0
          ? state.runs.map(r => r.id === runId ? normalizedRun : r)
          : [normalizedRun, ...state.runs];

        // Merge invoice lines: remove old lines for this run, add persisted
        const linePrefix = `${runId}-line-`;
        const otherLines = state.invoiceLines.filter(l => !l.lineId.startsWith(linePrefix));

        // Merge issues: remove old issues for this run, add persisted
        const otherIssues = state.issues.filter(i => i.runId !== runId);

        // Merge audit log: remove old entries for this run, add persisted
        const otherAudit = state.auditLog.filter(a => a.runId !== runId);

        return {
          runs: updatedRuns,
          currentRun: normalizedRun,
          invoiceLines: [...data.invoiceLines, ...otherLines],
          issues: [...data.issues, ...otherIssues],
          auditLog: [...data.auditLog, ...otherAudit],
          // BUGFIX: parsedPositions may have been saved as [] due to run-switch timing.
          // Reconstruct from parsedInvoiceResult if available.
          parsedPositions: (data.parsedPositions.length > 0)
            ? data.parsedPositions
            : (data.parsedInvoiceResult?.lines ?? []).map(line => ({
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
              })),
          parserWarnings: data.parserWarnings,
          parsedInvoiceResult: data.parsedInvoiceResult ?? null,   // PROJ-40 5C: PDF-Preview
          serialDocument: data.serialDocument ?? null,              // PROJ-40 5C: S/N-Excel
          preFilteredSerials: data.preFilteredSerials ?? [],        // PROJ-40: S/N-Rehydrierung
          currentParsedRunId: runId,                                // PROJ-40 5C: Run-Isolierung
        };
      });

      // PROJ-41: Run-Log aus IndexedDB wiederherstellen
      if (data.runLog && data.runLog.length > 0) {
        logService.restoreRunBuffer(runId, data.runLog);
      }

      console.log(`[RunStore] Persisted run loaded: ${runId}`);
      return true;
    } catch (error) {
      // PROJ-49: Änderung 14 — catch-Pfad: kein Eigentümer bei Fehler
      set({ currentParsedRunId: null });
      console.error('[RunStore] Failed to load persisted run:', error);
      return false;
    }
  },

  loadPersistedRunList: async () => {
    try {
      // PROJ-50 FINAL-FIX: Tombstones werden bereits im Service
      //   (runPersistenceService.loadRunList) via Record-basiertem SSOT-Filter
      //   isTombstoneRecord unterdrückt — hier nur noch übernehmen.
      const summaries = await runPersistenceService.loadRunList();
      set({ persistedRunSummaries: summaries });
      console.log(`[RunStore] Loaded ${summaries.length} persisted run summaries`);
    } catch (error) {
      console.error('[RunStore] Failed to load persisted run list:', error);
    }
  },

  getStorageStats: async () => {
    return runPersistenceService.getStorageStats();
  },

  exportRunsToDirectory: async (purgeOlderThanMonths?: number) => {
    const result = await runPersistenceService.exportToDirectory(purgeOlderThanMonths);
    // Refresh summaries after potential purge
    if (result > 0 && purgeOlderThanMonths) {
      await get().loadPersistedRunList();
    }
    return result;
  },

  deletePersistedRun: async (runId: string) => {
    const success = await runPersistenceService.deleteRun(runId);
    if (success) {
      set((state) => ({
        persistedRunSummaries: state.persistedRunSummaries.filter(s => s.id !== runId),
      }));
    }
    return success;
  },

  clearPersistedRuns: async () => {
    const success = await runPersistenceService.clearAll();
    if (success) {
      set({ persistedRunSummaries: [] });
    }
    return success;
  },
});
