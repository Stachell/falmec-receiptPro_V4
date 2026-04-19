// slices/workflowSlice.ts — PROJ-46 AP4c (Slice-Split)
// 1:1-Umzug aus runStore.ts — Mechaniker-Kontrakt, keine Logik-Änderungen.
// Ownership: Phase 2 Workflow-Actions + workflow-sensitive State
// (isPaused, isWaitingBeforeStep4, latestDiagnostics u. a.).

import type { StateCreator } from 'zustand';
import type { RunState } from '@/store/types';
import type {
  Run,
  Issue,
  RunConfig,
  StepStatus,
  ArticleMaster,
} from '@/types';

// Services / value imports referenced by the moved action bodies.
import { runStepCore } from '@/store/internal/stepRunner';
import { useMasterDataStore } from '@/store/masterDataStore';
import { logService } from '@/services/logService';
import { archiveService } from '@/services/archiveService';
import { matchAllArticles } from '@/services/matching/ArticleMatcher';
import { matchAllOrders } from '@/services/matching/OrderMatcher';
import { getMatcher } from '@/services/matchers';
import { matcherRegistryService } from '@/services/matcherRegistryService';
import { validateAgainstInvoice } from '@/services/serialFinder';
import { runPersistenceService } from '@/services/runPersistenceService';
import { buildOrderPool } from '@/services/matching/orderPool';
import { executeMatchingEngine } from '@/services/matching/matchingEngine';
import { buildAutoSavePayload } from '@/hooks/buildAutoSavePayload';
import { validateStepPrerequisites } from '@/services/stepGuard';
import {
  executeStep4Orchestration,
  isIssueBlockingStep,
  buildArticleMatchIssues,
  computeMatchStats,
  computeOrderStats,
  buildGuardInput,
  runStepGuard,
} from '@/store/internal/helpers';

export type WorkflowSlice = Pick<
  RunState,
  | 'isPaused'
  | 'isWaitingBeforeStep4'
  | 'waitingStep4RunId'
  | 'showStep4WaitingDialog'
  | 'latestDiagnostics'
  | 'setStepDiagnostics'
  | 'advanceToNextStep'
  | 'retryStep'
  | 'reprocessCurrentRun'
  | 'pauseRun'
  | 'resumeRun'
  | 'dismissStep4WaitingDialog'
  | 'proceedStep4FromWaiting'
  | 'generateStep5Issues'
  | 'executeArticleMatching'
  | 'executeMatcherCrossMatch'
  | 'executeMatcherSerialExtract'
  | 'executeOrderMatching'
  | 'executeOrderMapping'
>;

export const createWorkflowSlice: StateCreator<RunState, [], [], WorkflowSlice> = (set, get) => ({
  // ── state ────────────────────────────────────────────────────────────────
  isPaused: false,
  isWaitingBeforeStep4: false,
  waitingStep4RunId: null,
  showStep4WaitingDialog: false,
  latestDiagnostics: {},

  // ── actions (verbatim 1:1 aus runStore.ts) ───────────────────────────────

  setStepDiagnostics: (stepNo, diag) => set((state) => ({
    latestDiagnostics: { ...state.latestDiagnostics, [stepNo]: diag },
  })),

  advanceToNextStep: (runId: string, completedStepNo?: number) => {
    // PROJ-25: Pause-Guard — do not advance if run is paused
    if (get().isPaused) return;

    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;

    if (completedStepNo !== undefined) {
      // ── TARGETED MODE ── (PROJ-44-R12: PFLICHT-ERSTER-CODE-BLOCK — INVARIANTS A11)
      // Aufgerufen von Self-Advance in Execute-Funktionen nach deren set()-Aufruf.
      const completedStep = run.steps.find(s => s.stepNo === completedStepNo);
      if (!completedStep) return;                                    // Guard 0: Step existiert
      if (completedStep.status !== 'ok' && completedStep.status !== 'soft-fail') return; // Guard 1
      const alreadyRunning = run.steps.some(s => s.status === 'running');
      if (alreadyRunning) return;                                    // Guard 2: Idempotenz
      const { globalConfig: cfg, issues: storeIssues } = get();
      const effectiveConfig = run.config ?? cfg;
      const blockingIssues = storeIssues.filter(
        i => i.runId === runId && isIssueBlockingStep(i, completedStepNo + 1, effectiveConfig as RunConfig),
      );
      if (blockingIssues.length > 0) return;                        // Guard 3: Block-Guard

      // PROJ-44: Step 4 Waiting Point Guard — nur im Targeted Mode, nur bei Step-3-Completion.
      // Legacy-Aufrufe (proceedStep4FromWaiting → advanceToNextStep(runId)) umgehen diesen Check,
      // da proceedStep4FromWaiting immer ohne completedStepNo aufgerufen wird.
      if (completedStepNo === 3) {
        const effectiveConfig4 = (run.config ?? state.globalConfig) as RunConfig;
        if (!((effectiveConfig4 as RunConfig).autoStartStep4 ?? true)) {
          logService.info('Step 4 Waiting Point: Workflow angehalten', { runId, step: 'System' });
          set({
            isWaitingBeforeStep4: true,
            waitingStep4RunId: runId,
            showStep4WaitingDialog: true,
          });
          return; // Step 4 bleibt 'not-started' — proceedStep4FromWaiting() startet es
        }
      }
    } else {
      // ── LEGACY MODE ── (Original-Verhalten, unverändert)
      // Aufgerufen von: Step-1-Completion, Step-5-Auto-Complete, proceedStep4FromWaiting, reprocessCurrentRun
      const runningStep = run.steps.find(s => s.status === 'running');

      // PROJ-44-R11: Typbasierter Blocker-Guard (SSOT) — ersetzt severity-basierte Prüfung
      if (runningStep) {
        const { globalConfig, issues } = get();
        const effectiveConfig = run.config ?? globalConfig;
        const blockingIssues = issues.filter(
          i => i.runId === runId && isIssueBlockingStep(i, runningStep.stepNo, effectiveConfig as RunConfig),
        );
        if (blockingIssues.length > 0) {
          logService.warn(
            `Block-Guard: Step ${runningStep.stepNo} blockiert (${blockingIssues.length} blockierende Issues: ${blockingIssues.map(i => i.type).join(', ')})`,
            { runId, step: 'System' },
          );
          return;
        }

        // Set current step to 'ok'
        get().updateStepStatus(runId, runningStep.stepNo, 'ok');
      }
    }

    // Find next 'not-started' step
    const nextStep = run.steps.find(s => s.status === 'not-started');
    if (nextStep) {
      // Set next step to 'running'
      get().updateStepStatus(runId, nextStep.stepNo, 'running');

      // Auto-execute Step 2 (Cross-Match via Matcher Module) after Step 1 completes
      if (nextStep.stepNo === 2) {
        void (async () => {
          try {
            if (get().isPaused) return; // Check 1
            const guard = await runStepGuard(2, runId, get, set);
            if (get().isPaused) return; // Check 2 (KRITISCH nach async Guard!)
            if (guard.blockReason) {
              logService.error(`[StepGuard] Step 2 blockiert: ${guard.blockReason}`, { runId, step: 'Artikel extrahieren' });
              get().updateStepStatus(runId, 2, 'failed');
              return;
            }
            logService.info('Auto-Start: Matcher Cross-Match (Step 2)', { runId, step: 'Artikel extrahieren' });
            get().executeMatcherCrossMatch();
            // Self-Advance liegt IN executeMatcherCrossMatch → hier kein Advance-Aufruf
          } catch (err) {
            console.error('[advanceToNextStep] Step 2 wrapper failed:', err);
            get().updateStepStatus(runId, 2, 'failed');
          }
        })();
      }

      // Auto-execute Step 3 (Serial Extraction via Matcher Module) after Step 2 completes
      // PROJ-46 AP2: Guard-Execute-Kern via runStepCore; Trigger-Postlude (Legacy-Advance bei Skip — A16!) bleibt am Call-Site.
      if (nextStep.stepNo === 3) {
        void (async () => {
          try {
            const r = await runStepCore(
              3, runId, get, set,
              () => get().isPaused,
              () => {
                logService.info('Auto-Start: Matcher Serial-Extraktion (Step 3)', { runId, step: 'Seriennummer anfuegen' });
                get().executeMatcherSerialExtract();
                // Self-Advance liegt IN executeMatcherSerialExtract → hier kein Advance-Aufruf
              },
            );
            if (r.kind === 'blocked' && r.reason === '__paused__') return;
            if (r.kind === 'blocked') {
              logService.error(`[StepGuard] Step 3 blockiert: ${r.reason}`, { runId, step: 'Seriennummer anfuegen' });
              get().updateStepStatus(runId, 3, 'failed');
              return;
            }
            if (r.kind === 'skipped') {
              logService.info(`[StepGuard] Step 3 uebersprungen: ${r.reason}`, { runId, step: 'Seriennummer anfuegen' });
              get().updateStepStatus(runId, 3, 'ok');
              get().advanceToNextStep(runId); // Legacy Mode — kein Waiting-Point-Check für Skip-Pfad
              return;
            }
          } catch (err) {
            console.error('[advanceToNextStep] Step 3 wrapper failed:', err);
            get().updateStepStatus(runId, 3, 'failed');
          }
        })();
      }

      // PROJ-20: Auto-execute Step 4 (Order Mapping) after Step 3 completes
      if (nextStep.stepNo === 4) {
        void (async () => {
          try {
            if (get().isPaused) return; // Check 1
            const guard = await runStepGuard(4, runId, get, set);
            if (get().isPaused) return; // Check 2 (KRITISCH nach async Guard!)
            if (guard.blockReason) {
              logService.error(`[StepGuard] Step 4 blockiert: ${guard.blockReason}`, { runId, step: 'Bestellungen mappen' });
              get().updateStepStatus(runId, 4, 'failed');
              return;
            }
            await executeStep4Orchestration(runId, get, set);
            // Self-Advance liegt IN executeStep4Orchestration (skip-Pfade) und IN executeOrderMapping
          } catch (err) {
            console.error('[advanceToNextStep] Step 4 wrapper failed:', err);
            get().updateStepStatus(runId, 4, 'failed');
          }
        })();
      }

      // PROJ-42-ADD-ON-12: Auto-complete Step 5 (Export) — Export wird via UI ausgeloest, Step auto-abschliessen
      if (nextStep.stepNo === 5) {
        // PROJ-49: Step 5 Guard (sync — no repairs, only block check)
        const guard5 = validateStepPrerequisites(5, runId, buildGuardInput(get()));
        if (guard5.blockReason) {
          logService.error(`[StepGuard] Step 5 blockiert: ${guard5.blockReason}`, { runId, step: 'Export' });
          get().updateStepStatus(runId, 5, 'failed');
          return;
        }
        // PROJ-43: Generate Step-5 issues BEFORE auto-complete so they exist while step is still 'running'
        get().generateStep5Issues(runId);
        // Auto-complete: synchron (kein Timer — Step 5 ist sync, INVARIANTS A4)
        if (!get().isPaused) {
          get().advanceToNextStep(runId); // Legacy Mode → Block-Issues prüfen → Step 5 ok → Run abschliessen
        }
      }
    } else {
      // PROJ-27-ADDON-2: Run abgeschlossen — KEIN Disk-Write!
      // PDFs wurden in Step 1 archiviert, finale Daten erst beim Kachel-6-Klick.
      get().updateRunStatus(runId, 'ok');
      logService.info('Run abgeschlossen – alle Schritte fertig', { runId, step: 'System' });

      // Browser-Cleanup: localStorage + IndexedDB bereinigen (kein Disk-Zugriff nötig)
      archiveService.cleanupBrowserData(runId).catch(err =>
        logService.warn(`Browser-Cleanup fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId, step: 'Archiv' })
      );
    }
  },

  // HOTFIX-2: Dedicated retry action for failed steps
  retryStep: (runId: string, stepNo: number) => {
    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;

    const step = run.steps.find(s => s.stepNo === stepNo);
    if (!step || step.status !== 'failed') return;

    logService.info(`Retry: Step ${stepNo} (${step.name})`, { runId, step: step.name });

    // Reset step + run status
    get().updateStepStatus(runId, stepNo, 'running');
    get().updateRunStatus(runId, 'running');

    // Re-execute step logic (with PROJ-49 Step Guard)
    // Phase 5 (PROJ-44-R12): Timer entfernt — async wrapper + try/catch statt setTimeout
    switch (stepNo) {
      case 2:
        void (async () => {
          try {
            const guard = await runStepGuard(2, runId, get, set);
            if (guard.blockReason) {
              logService.error(`[StepGuard] Retry Step 2 blockiert: ${guard.blockReason}`, { runId, step: 'Artikel extrahieren' });
              get().updateStepStatus(runId, 2, 'failed');
              return;
            }
            get().executeMatcherCrossMatch();
            // Self-Advance liegt IN executeMatcherCrossMatch
          } catch (err) {
            console.error('[retryStep] Step 2 wrapper failed:', err);
            get().updateStepStatus(runId, 2, 'failed');
          }
        })();
        break;
      case 3:
        // PROJ-46 AP2: Guard-Execute-Kern via runStepCore.
        // v1.3 BIT-IDENTISCH: KEIN Pause-Check (pauseCheck = () => false) — entspricht heutigem Verhalten
        // (runStore.ts:2087 historisch). Pause-in-Retry-Härtung ist separater Vorschlag (Sektion B, INVARIANTS), NICHT Iteration 1.
        void (async () => {
          try {
            const r = await runStepCore(
              3, runId, get, set,
              () => false,
              () => get().executeMatcherSerialExtract(),
              // Self-Advance liegt IN executeMatcherSerialExtract
            );
            if (r.kind === 'blocked') {
              logService.error(`[StepGuard] Retry Step 3 blockiert: ${r.reason}`, { runId, step: 'Seriennummer anfuegen' });
              get().updateStepStatus(runId, 3, 'failed');
              return;
            }
            if (r.kind === 'skipped') {
              logService.info(`[StepGuard] Retry Step 3 uebersprungen: ${r.reason}`, { runId, step: 'Seriennummer anfuegen' });
              get().updateStepStatus(runId, 3, 'ok');
              // Phase 5 Bugfix: Skip-Pfad hatte keinen Advance → Workflow blieb hängen
              // TARGETED-Advance — Waiting-Point greift (unverändert).
              if (!get().isPaused) {
                get().advanceToNextStep(runId, 3);
              }
              return;
            }
          } catch (err) {
            console.error('[retryStep] Step 3 wrapper failed:', err);
            get().updateStepStatus(runId, 3, 'failed');
          }
        })();
        break;
      case 4:
        void (async () => {
          try {
            const guard = await runStepGuard(4, runId, get, set);
            if (guard.blockReason) {
              logService.error(`[StepGuard] Retry Step 4 blockiert: ${guard.blockReason}`, { runId, step: 'Bestellungen mappen' });
              get().updateStepStatus(runId, 4, 'failed');
              return;
            }
            await executeStep4Orchestration(runId, get, set);
            // Self-Advance liegt IN executeStep4Orchestration (skip-Pfade) und IN executeOrderMapping
          } catch (err) {
            console.error('[retryStep] Step 4 wrapper failed:', err);
            get().updateStepStatus(runId, 4, 'failed');
          }
        })();
        break;
      default:
        // Step 1 (Parsing) + Step 5 (Export) sind nicht retryable
        logService.warn(`Step ${stepNo} kann nicht wiederholt werden`, { runId, step: step.name });
        get().updateStepStatus(runId, stepNo, 'failed');
        break;
    }
  },

  // PROJ-49 SSOT Änderung 16: Reprocess — load→reset→save→advance (eigener Pfad, NICHT startWorkflowPhase2)
  reprocessCurrentRun: (runId) => {
    const runReprocess = async () => {
      const state = get();
      if (!state.runs.find(r => r.id === runId)) return;

      // 1. Phase 8 (PROJ-44-R12): autoAdvanceTimer entfernt — isPaused rücksetzen
      set({ isPaused: false });

      // 2. LADEN — vollständiger IDB-Snapshot in den In-Memory-Store
      const loaded = await get().loadPersistedRun(runId);
      if (!loaded) {
        logService.error('[reprocessCurrentRun] loadPersistedRun fehlgeschlagen — Abbruch', { runId, step: 'System' });
        return;
      }

      // SSOT-Integritätsprüfung: SSOT-Runs brauchen vollständigen Ingest
      const idbData = await runPersistenceService.loadRun(runId);
      if (idbData?.ingestStatus) {
        const { pdf, articleList } = idbData.ingestStatus;
        if (pdf !== 'ready' || articleList !== 'ready') {
          logService.error('[reprocessCurrentRun] SSOT-Run mit unvollständigem Ingest — Abbruch', { runId, step: 'System' });
          return;
        }
      }

      // 3. REPROCESS-RESET auf dem frisch geladenen In-Memory-Zustand
      const freshState = get();
      const freshRun = freshState.runs.find(r => r.id === runId);
      if (!freshRun) return;

      // 3a. Issues für Steps 2–5 löschen (Step-1-Issues bleiben)
      const keptIssues = freshState.issues.filter(i => !(i.runId === runId && i.stepNo >= 2));

      // 3b. run.stats auf Nullwerte zurücksetzen (parsedInvoiceLines aus Step 1 behalten)
      const resetStats: typeof freshRun.stats = {
        parsedInvoiceLines: freshRun.stats.parsedInvoiceLines,
        matchedOrders: 0, notOrderedCount: 0, serialMatchedCount: 0,
        mismatchedGroupsCount: 0, articleMatchedCount: 0, inactiveArticlesCount: 0,
        priceOkCount: 0, priceMismatchCount: 0, exportReady: false,
        expandedLineCount: 0, fullMatchCount: 0, codeItOnlyCount: 0, eanOnlyCount: 0,
        noMatchCount: 0, serialRequiredCount: 0, priceMissingCount: 0, priceCustomCount: 0,
        manualOkOrderCount: 0, perfectMatchCount: 0, referenceMatchCount: 0,
        smartQtyMatchCount: 0, fifoFallbackCount: 0,
      };

      // 3c+3d. orphanSerials leeren, orderPool null
      const resetRun: Run = {
        ...freshRun,
        steps: freshRun.steps.map(s =>
          s.stepNo >= 2 ? { ...s, status: 'not-started' as const, issuesCount: 0 } : s
        ),
        status: 'running' as const,
        stats: resetStats,
        orphanSerials: [],
      };

      // 3e. invoiceLines: pro Zeile Reset — manualStatus === 'confirmed' bleibt unverändert
      const linePrefix = `${runId}-line-`;
      const resetLines = freshState.invoiceLines.map(l => {
        if (!l.lineId.startsWith(linePrefix)) return l;
        if (l.manualStatus === 'confirmed') return l;
        return {
          ...l,
          matchStatus:           'pending'   as const,
          priceCheckStatus:      'pending'   as const,
          activeFlag:            true,
          serialRequired:        false,
          serialNumbers:         [] as string[],
          allocatedOrders:       [] as typeof l.allocatedOrders,
          falmecArticleNo:       null,
          serialNumber:          null,
          serialSource:          'none'      as const,
          articleSource:         undefined,
          orderNumberAssigned:   null,
          orderAssignmentReason: 'pending'   as const,
          unitPriceSage:         null,
          unitPriceFinal:        null,
          storageLocation:       null,
          logicalStorageGroup:   null,
          supplierId:            null,
          orderYear:             null,
          orderCode:             null,
          orderVorgang:          null,
          orderOpenQty:          null,
          descriptionDE:         null,
        };
      });

      set((s) => ({
        runs:         s.runs.map(r => r.id === runId ? resetRun : r),
        currentRun:   s.currentRun?.id === runId ? resetRun : s.currentRun,
        invoiceLines: resetLines,
        issues:       keptIssues,
        orderPool:    null,
        currentParsedRunId: runId,
      }));

      // 4. PERSISTIEREN — bereinigten Zustand crash-sicher in IDB schreiben
      const payload = buildAutoSavePayload(runId);
      if (payload) {
        await runPersistenceService.saveRun(payload);
      }

      // 5. TRANSIENTE STATES RÄUMEN
      set({
        isWaitingBeforeStep4:    false,
        waitingStep4RunId:       null,
        showStep4WaitingDialog:  false,
        isPaused:                false,
        latestDiagnostics:       {},
      });

      logService.info('Reprocess: Steps 2-5 zurueckgesetzt, IDB-Snapshot aktualisiert', { runId, step: 'System' });
      get().addAuditEntry({ runId, action: 'reprocessCurrentRun', details: 'SSOT Reprocess: load→reset→save→advance', userId: 'system' });

      // 6. STARTEN — Engine findet Step 2 als nächsten not-started Step
      get().advanceToNextStep(runId);
    };

    runReprocess().catch(err =>
      logService.error(`reprocessCurrentRun fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId, step: 'System' })
    );
  },

  // PROJ-25: Pause — set paused state (Phase 8: autoAdvanceTimer entfernt — Self-Advance-Pattern)
  pauseRun: (runId) => {
    // PROJ-44: Close waiting dialog if open when user pauses
    if (get().isWaitingBeforeStep4) {
      set({ isWaitingBeforeStep4: false, waitingStep4RunId: null, showStep4WaitingDialog: false });
    }
    set({ isPaused: true });
    get().updateRunStatus(runId, 'paused');
    logService.info('Run pausiert', { runId, step: 'System' });
  },

  // PROJ-25: Resume — clear pause, restore run status, re-trigger the currently running step's logic
  // Phase 6 (PROJ-44-R12): 10× setTimeout entfernt → single async wrapper + executeStep4Orchestration
  // CRITICAL (CIRCUIT A11): KEIN advanceToNextStep-Direktaufruf — Execute-Funktion trägt Self-Advance
  resumeRun: (runId) => {
    set({ isPaused: false });
    get().updateRunStatus(runId, 'running');
    logService.info('Run fortgesetzt', { runId, step: 'System' });

    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;
    const runningStep = run.steps.find(s => s.status === 'running');
    if (!runningStep) return;

    // PROJ-46 AP2: Guard-Execute-Kern via runStepCore. Trigger-Prelude (isPaused=false, status=running)
    // bleibt oben am Call-Site; Postlude (Skip-Targeted-Advance bei Step 3) bleibt hier explizit.
    const stepNo = runningStep.stepNo as 2 | 3 | 4;
    if (stepNo !== 2 && stepNo !== 3 && stepNo !== 4) return; // Steps 1 und 5 haben keine Re-Trigger-Logik
    const dispatchExecute = () => {
      if (stepNo === 2) {
        logService.info('Resume: Matcher Cross-Match (Step 2)', { runId, step: 'Artikel extrahieren' });
        get().executeMatcherCrossMatch();
        // Self-Advance liegt IN executeMatcherCrossMatch
      } else if (stepNo === 3) {
        logService.info('Resume: Matcher Serial-Extraktion (Step 3)', { runId, step: 'Seriennummer anfuegen' });
        get().executeMatcherSerialExtract();
        // Self-Advance liegt IN executeMatcherSerialExtract
      } else if (stepNo === 4) {
        return executeStep4Orchestration(runId, get, set);
        // Self-Advance liegt IN executeStep4Orchestration (skip-Pfade) und IN executeOrderMapping
      }
    };
    void (async () => {
      try {
        const r = await runStepCore(
          stepNo, runId, get, set,
          () => get().isPaused,
          () => dispatchExecute(),
        );
        if (r.kind === 'blocked' && r.reason === '__paused__') return;
        if (r.kind === 'blocked') {
          logService.error(`[StepGuard] Resume Step ${stepNo} blockiert: ${r.reason}`, { runId, step: runningStep.name });
          get().updateStepStatus(runId, stepNo, 'failed');
          return;
        }
        if (r.kind === 'skipped' && stepNo === 3) {
          logService.info(`Resume Step 3 uebersprungen: ${r.reason}`, { runId, step: 'Seriennummer anfuegen' });
          get().updateStepStatus(runId, 3, 'ok');
          if (!get().isPaused) {
            get().advanceToNextStep(runId, 3);
          }
          return;
        }
      } catch (err) {
        console.error('[resumeRun] wrapper failed:', err);
        get().updateStepStatus(runId, stepNo, 'failed');
      }
    })();
  },

  // PROJ-44: Dismiss Step 4 waiting dialog — user chose STOP
  dismissStep4WaitingDialog: () => {
    const runId = get().waitingStep4RunId;
    set({ isWaitingBeforeStep4: false, waitingStep4RunId: null, showStep4WaitingDialog: false });
    if (runId) {
      logService.info('Step 4 Waiting Point: STOP', { runId, step: 'System' });
    }
  },

  // PROJ-44: Proceed from Step 4 waiting dialog — user chose DURCHFUEHREN
  proceedStep4FromWaiting: () => {
    // CRITICAL: read runId BEFORE resetting state
    const runId = get().waitingStep4RunId;
    set({ isWaitingBeforeStep4: false, waitingStep4RunId: null, showStep4WaitingDialog: false });
    if (runId) {
      logService.info('Step 4 Waiting Point: DURCHFUEHREN', { runId, step: 'System' });
      get().advanceToNextStep(runId);
    }
  },

  // PROJ-43: Generate / auto-resolve Step-5 issues
  generateStep5Issues: (runId) => {
    const state = get();
    const lines = state.invoiceLines.filter(l => l.lineId.startsWith(runId));
    const now = new Date().toISOString();

    // Auto-resolve existing Step-5 issues first
    let updatedIssues = state.issues.map(issue => {
      if (issue.runId !== runId || issue.stepNo !== 5 || issue.status === 'resolved') return issue;

      if (issue.type === 'missing-storage-location') {
        const allResolved = (issue.affectedLineIds ?? []).every(id => {
          const line = lines.find(l => l.lineId === id);
          return line ? !!line.storageLocation : true;
        });
        if (allResolved) {
          return {
            ...issue,
            status: 'resolved' as const,
            resolvedAt: now,
            resolutionNote: 'Automatisch gelöst: Lagerorte nachgetragen',
          };
        }
      }

      if (issue.type === 'export-no-lines' && lines.length > 0) {
        return {
          ...issue,
          status: 'resolved' as const,
          resolvedAt: now,
          resolutionNote: 'Automatisch gelöst: Zeilen vorhanden',
        };
      }

      return issue;
    });

    // Generate new issues for still-failing conditions (no duplicates)
    const newIssues: Issue[] = [];

    // missing-storage-location — 1 Issue pro positionIndex (EXPANDIERT — Dedup zwingend)
    const missingLocLines = lines.filter(l => !l.storageLocation);
    {
      const seenPositions = new Set<number>();
      for (const l of missingLocLines) {
        if (seenPositions.has(l.positionIndex)) continue;
        seenPositions.add(l.positionIndex);
        const existingOpen = updatedIssues.find(
          i => i.runId === runId && i.stepNo === 5 && i.type === 'missing-storage-location'
            && (i.status === 'open' || i.status === 'pending')
            && i.context?.positionIndex === l.positionIndex,
        );
        if (!existingOpen) {
          newIssues.push({
            id: `issue-${runId}-step5-missing-loc-pos${l.positionIndex}`,
            runId,
            severity: 'error',
            stepNo: 5,
            type: 'missing-storage-location',
            message: `Pos ${l.positionIndex}: Lagerort fehlt`,
            details: `${l.falmecArticleNo ?? l.manufacturerArticleNo ?? l.lineId}`,
            relatedLineIds: [l.lineId],
            affectedLineIds: [l.lineId],
            status: 'open',
            createdAt: now,
            resolvedAt: null,
            resolutionNote: null,
            context: { positionIndex: l.positionIndex, field: 'storageLocation' },
          });
        }
      }
    }

    // export-no-lines
    if (lines.length === 0) {
      const existingOpen = updatedIssues.find(
        i => i.runId === runId && i.stepNo === 5 && i.type === 'export-no-lines'
          && (i.status === 'open' || i.status === 'pending'),
      );
      if (!existingOpen) {
        newIssues.push({
          id: `issue-${runId}-step5-no-lines-${Date.now()}`,
          runId,
          severity: 'error',
          stepNo: 5,
          type: 'export-no-lines',
          message: 'Keine Rechnungszeilen vorhanden',
          details: 'Der Export kann nicht durchgeführt werden, da keine Zeilen vorhanden sind.',
          relatedLineIds: [],
          affectedLineIds: [],
          status: 'open',
          createdAt: now,
          resolvedAt: null,
          resolutionNote: null,
        });
      }
    }

    if (newIssues.length > 0 || updatedIssues !== state.issues) {
      set({ issues: [...updatedIssues, ...newIssues] });
    }
  },

  executeArticleMatching: (articles) => {
    const { invoiceLines, runs, currentRun } = get();
    if (!currentRun) {
      console.warn('[RunStore] executeArticleMatching: no currentRun');
      return;
    }

    const runId = currentRun.id;
    const run = runs.find(r => r.id === runId);
    if (!run) {
      console.warn('[RunStore] executeArticleMatching: run not found for id', runId);
      return;
    }

    try {
      // Run article matching on all lines for this run
      const linePrefix = `${runId}-line-`;
      const runLines = invoiceLines.filter(l => l.lineId.startsWith(linePrefix));
      const otherLines = invoiceLines.filter(l => !l.lineId.startsWith(linePrefix));

      console.log(`[RunStore] executeArticleMatching: ${runLines.length} lines for run ${runId}, ${articles.length} articles`);

      if (runLines.length === 0) {
        console.warn('[RunStore] executeArticleMatching: no invoiceLines found for run. LineId prefix:', linePrefix);
        return;
      }

      const updatedLines = matchAllArticles(runLines, articles, run.config.tolerance);

      // Compute stats
      const matchStats = computeMatchStats(updatedLines);

      // Build issues for no-match articles
      const newIssues = buildArticleMatchIssues(runId, updatedLines);

      // Determine step 2 status — PROJ-45-ADD-ON-round4: failed (nicht soft-fail) um Auto-Advance zu blockieren
      const noMatchCount = matchStats.noMatchCount ?? 0;
      const step2Status: StepStatus = noMatchCount > 0 ? 'failed' : 'ok';

      set((state) => {
        const updatedRun = state.runs.find(r => r.id === runId);
        if (!updatedRun) return state;

        const newRun: Run = {
          ...updatedRun,
          stats: { ...updatedRun.stats, ...matchStats },
          steps: updatedRun.steps.map(step =>
            step.stepNo === 2
              ? { ...step, status: step2Status, issuesCount: newIssues.length }
              : step
          ),
        };

        return {
          runs: state.runs.map(r => r.id === runId ? newRun : r),
          currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
          invoiceLines: [...updatedLines, ...otherLines],
          issues: [
            ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 2)),
            ...newIssues,
          ],
        };
      });

      logService.info(
        `Artikel-Matching abgeschlossen: ${matchStats.articleMatchedCount} von ${updatedLines.length} gematcht`,
        { runId, step: 'Artikel extrahieren' }
      );
    } catch (error) {
      logService.error(`Artikel-Matching fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Artikel extrahieren',
      });

      // Set step 2 to failed so the UI doesn't hang
      get().updateStepStatus(runId, 2, 'failed');
    }
  },

  executeMatcherCrossMatch: () => {
    const { invoiceLines, runs, currentRun, globalConfig, parsedInvoiceResult } = get();
    if (!currentRun) {
      console.warn('[RunStore] executeMatcherCrossMatch: no currentRun');
      return;
    }

    const runId = currentRun.id;
    const run = runs.find(r => r.id === runId);
    if (!run) {
      console.warn('[RunStore] executeMatcherCrossMatch: run not found for id', runId);
      return;
    }

    // PROJ-49 SSOT Änderung 11: Artikel aus IDB (parsedArticlePool) für SSOT-Runs,
    // Fallback auf globalen masterDataStore nur für Legacy-Runs.
    // Da executeMatcherCrossMatch sync ist, laden wir IDB-Daten async und rufen uns selbst
    // neu auf — ODER wir nutzen den synchronen masterDataStore, der von ingestAndPersistRunData
    // bereits mit denselben Daten befüllt wurde (save() dort). Für SSOT-Runs enthält
    // masterDataStore die parsedArticlePool-Daten aus Phase 1. Der IDB-Read prüft nur den
    // SSOT-Status und blockt ggf. bei fehlendem Pool.
    //
    // Implementierung: async wrapper, der IDB liest und dann die Kern-Logik ausführt.
    // Die Funktion selbst bleibt sync-signiert (Interface), wir feuern intern async.
    const runAsyncStep2 = async () => {
      const idbData = await runPersistenceService.loadRun(runId);
      const isSSoTRun = !!idbData?.ingestStatus;

      let articles: ArticleMaster[];
      if (isSSoTRun) {
        if (!idbData!.parsedArticlePool?.length) {
          logService.error('[Step2] SSOT-Run ohne parsedArticlePool — Integritätsfehler', { runId, step: 'Artikel extrahieren' });
          get().updateStepStatus(runId, 2, 'failed');
          return;
        }
        articles = idbData!.parsedArticlePool;
      } else {
        // Legacy-Run: Fallback auf masterDataStore erlaubt
        articles = idbData?.parsedArticlePool ?? useMasterDataStore.getState().articles;
      }

      if (articles.length === 0) {
        console.error('[RunStore] executeMatcherCrossMatch: no master data available');
        logService.error('Stammdaten fehlen — bitte Artikelstammdaten hochladen', {
          runId,
          step: 'Artikel extrahieren',
        });
        const blockingIssue: Issue = {
          id: `issue-${runId}-step2-no-master-${Date.now()}`,
          runId,
          severity: 'error',
          stepNo: 2,
          type: 'no-article-match',
          message: 'Keine Stammdaten vorhanden — bitte Artikelstammdaten (Excel) hochladen',
          details: 'masterDataStore ist leer. Upload der Stammdaten-Datei im linken Sidebar-Panel.',
          relatedLineIds: [],
          status: 'open',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          resolutionNote: null,
        };
        set((state) => ({
          issues: [...state.issues.filter(i => !(i.runId === runId && i.stepNo === 2)), blockingIssue],
        }));
        get().updateStepStatus(runId, 2, 'failed');
        return;
      }

      try {
        // Resolve active matcher module
        const matcherId = matcherRegistryService.getSelectedMatcherId();
        const matcher = getMatcher(matcherId);
        if (!matcher) {
          console.error('[RunStore] executeMatcherCrossMatch: matcher not found for id', matcherId);
          get().updateStepStatus(runId, 2, 'failed');
          return;
        }

        const linePrefix = `${runId}-line-`;
        const otherLines = invoiceLines.filter(l => !l.lineId.startsWith(linePrefix));

        // PROJ-19 PRE-EXPLOSION MATCHING:
        // Match on unique positions (one per positionIndex) from the parsed invoice,
        // then spread the matched result back to all expanded lines.
        // This avoids running the matcher N times for qty=N articles.
        const allRunLines = invoiceLines.filter(l => l.lineId.startsWith(linePrefix));

        // Deduplicate: take the first expanded line for each positionIndex
        const positionMap = new Map<number, typeof allRunLines[0]>();
        for (const line of allRunLines) {
          if (!positionMap.has(line.positionIndex)) {
            positionMap.set(line.positionIndex, line);
          }
        }
        const representativeLines = Array.from(positionMap.values());

        console.log(
          `[RunStore] executeMatcherCrossMatch: ${representativeLines.length} positions (of ${allRunLines.length} expanded), ${articles.length} articles, matcher=${matcher.moduleId}`,
        );

        if (representativeLines.length === 0) {
          console.warn('[RunStore] executeMatcherCrossMatch: no invoiceLines found for run.');
          return;
        }

        // Run matcher on representative lines only
        const result = matcher.crossMatch(
          representativeLines,
          articles,
          { tolerance: globalConfig.tolerance, caseSensitive: false },
          runId,
        );

        // Spread matched fields from representative → all expanded lines of same position
        const matchedByPosition = new Map<number, typeof result.lines[0]>();
        for (const matchedLine of result.lines) {
          matchedByPosition.set(matchedLine.positionIndex, matchedLine);
        }

        const enrichedLines = allRunLines.map(line => {
          const matched = matchedByPosition.get(line.positionIndex);
          if (!matched) return line;

          // PROJ-46: Nur BESTÄTIGTE manuelle Artikel schützen; Entwürfe werden vom Parser überschrieben
          if (line.articleSource === 'manual' && line.manualStatus === 'confirmed') return line;

          // PROJ-46: Nur BESTÄTIGTE manuelle Preise schützen; Entwürfe werden vom Parser überschrieben
          const protectPrice = line.priceCheckStatus === 'custom' && line.manualStatus === 'confirmed';

          // Copy all match-result fields but keep this line's own lineId/expansionIndex
          return {
            ...line,
            matchStatus: matched.matchStatus,
            falmecArticleNo: matched.falmecArticleNo,
            descriptionDE: matched.descriptionDE,
            unitPriceSage: matched.unitPriceSage,
            serialRequired: matched.serialRequired,
            activeFlag: matched.activeFlag,
            storageLocation: matched.storageLocation,
            logicalStorageGroup: matched.logicalStorageGroup,
            // Preisfelder: nur ueberschreiben wenn NICHT manuell korrigiert
            priceCheckStatus: protectPrice ? line.priceCheckStatus : matched.priceCheckStatus,
            unitPriceFinal: protectPrice ? line.unitPriceFinal : matched.unitPriceFinal,
            // Artikelquelle: Matcher hat zugeordnet
            articleSource: 'matcher' as const,
            manualStatus: protectPrice ? line.manualStatus : undefined, // PROJ-46: confirmed bleibt gesperrt, Draft wird zurückgesetzt
          };
        });

        // Determine step 2 status — PROJ-45-ADD-ON-round4: failed (nicht soft-fail) um Auto-Advance zu blockieren
        const noMatchCount = result.stats.noMatchCount ?? 0;
        const step2Status: StepStatus = noMatchCount > 0 ? 'failed' : 'ok';

        // ── PROJ-21: Enrich result.issues with context + generate new issue types ──
        const step2Issues: Issue[] = [...result.issues];
        const now21 = new Date().toISOString();

        // Enrich existing no-article-match issues with context
        for (const issue of step2Issues) {
          if (issue.type === 'no-article-match' || issue.type === 'match-artno-not-found' || issue.type === 'match-conflict-id') {
            if (!issue.context) {
              issue.context = { field: 'matchStatus', expectedValue: 'full-match' };
            }
          }
        }

        // New: price-mismatch issue (warning) — 1 Issue pro positionIndex
        const priceMismatchLines = enrichedLines.filter(l => l.priceCheckStatus === 'mismatch');
        if (priceMismatchLines.length > 0) {
          // Deduplicate by positionIndex (enrichedLines may have multiple expansion rows per position)
          const seenPositions = new Set<number>();
          const uniquePriceMismatch = priceMismatchLines.filter(l => {
            if (seenPositions.has(l.positionIndex)) return false;
            seenPositions.add(l.positionIndex);
            return true;
          });
          for (const l of uniquePriceMismatch) {
            step2Issues.push({
              id: `issue-${runId}-step2-price-mismatch-pos${l.positionIndex}`,
              runId,
              severity: 'warning',
              stepNo: 2,
              type: 'price-mismatch',
              message: `Pos ${l.positionIndex}: Preisabweichung PDF-Rechnung ${l.unitPriceInvoice.toFixed(2)}€ vs. Sage ERP ${(l.unitPriceSage ?? 0).toFixed(2)}€`,
              details: `${l.falmecArticleNo ?? l.manufacturerArticleNo} — PDF-Rechnung ${l.unitPriceInvoice.toFixed(2)}€, Sage ERP ${(l.unitPriceSage ?? 0).toFixed(2)}€`,
              relatedLineIds: [l.lineId],
              affectedLineIds: [l.lineId],
              status: 'open',
              createdAt: now21,
              resolvedAt: null,
              resolutionNote: null,
              context: { positionIndex: l.positionIndex, field: 'priceCheckStatus', expectedValue: 'ok', actualValue: 'mismatch' },
            });
          }
        }

        // New: inactive-article issue (info) — 1 Issue pro positionIndex
        const inactiveLines = enrichedLines.filter(l => l.activeFlag === false && l.matchStatus !== 'no-match');
        if (inactiveLines.length > 0) {
          const seenPositions = new Set<number>();
          const uniqueInactive = inactiveLines.filter(l => {
            if (seenPositions.has(l.positionIndex)) return false;
            seenPositions.add(l.positionIndex);
            return true;
          });
          for (const l of uniqueInactive) {
            step2Issues.push({
              id: `issue-${runId}-step2-inactive-pos${l.positionIndex}`,
              runId,
              severity: 'info',
              stepNo: 2,
              type: 'inactive-article',
              message: `Pos ${l.positionIndex}: Inaktiver Artikel im Stamm`,
              details: `${l.falmecArticleNo ?? l.manufacturerArticleNo}`,
              relatedLineIds: [l.lineId],
              affectedLineIds: [l.lineId],
              status: 'open',
              createdAt: now21,
              resolvedAt: null,
              resolutionNote: null,
              context: { positionIndex: l.positionIndex, field: 'activeFlag', expectedValue: 'true', actualValue: 'false' },
            });
          }
        }

        set((state) => {
          const updatedRun = state.runs.find(r => r.id === runId);
          if (!updatedRun) return state;

          const newRun: Run = {
            ...updatedRun,
            stats: { ...updatedRun.stats, ...result.stats },
            steps: updatedRun.steps.map(step =>
              step.stepNo === 2
                ? { ...step, status: step2Status, issuesCount: step2Issues.length }
                : step
            ),
          };

          return {
            runs: state.runs.map(r => r.id === runId ? newRun : r),
            currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
            invoiceLines: [...enrichedLines, ...otherLines],
            issues: [
              ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 2)),
              ...step2Issues,
            ],
          };
        });

        logService.info(
          `Matcher Cross-Match abgeschlossen: ${result.stats.articleMatchedCount} Positionen gematcht, ${enrichedLines.length} Zeilen angereichert (${matcher.moduleId})`,
          { runId, step: 'Artikel extrahieren' },
        );

        // PROJ-28: Step 2 diagnostics
        get().setStepDiagnostics(2, {
          stepNo: 2,
          moduleName: matcher.moduleId,
          confidence: noMatchCount === 0 ? 'high' : noMatchCount < enrichedLines.length / 2 ? 'medium' : 'low',
          summary: `${result.stats.articleMatchedCount}/${enrichedLines.length} Artikel gematcht`,
          detailLines: noMatchCount > 0 ? [`${noMatchCount} Artikel ohne Match`] : undefined,
          timestamp: new Date().toISOString(),
        });

        for (const w of result.warnings) {
          const logFn = w.severity === 'error' ? logService.error.bind(logService) : logService.warn.bind(logService);
          logFn(`[Matcher] ${w.code}: ${w.message}`, { runId, step: 'Artikel extrahieren' });
        }

        // Phase 3 (PROJ-44-R12): Self-Advance nach Step 2
        const step2 = get().runs.find(r => r.id === runId)?.steps?.find(s => s.stepNo === 2);
        if (step2?.status === 'ok' || step2?.status === 'soft-fail') {
          get().advanceToNextStep(runId, 2);
        }
      } catch (error) {
        logService.error(`Matcher Cross-Match fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
          runId,
          step: 'Artikel extrahieren',
        });
        get().updateStepStatus(runId, 2, 'failed');
      }
    };

    runAsyncStep2().catch(err => {
      logService.error(`[Step2] Unerwarteter Fehler: ${err instanceof Error ? err.message : err}`, { runId, step: 'Artikel extrahieren' });
      get().updateStepStatus(runId, 2, 'failed');
    });
  },

  // ─── PROJ-16: Matcher-based Serial Extraction (Step 3) ────────────

  executeMatcherSerialExtract: async () => {
    const { invoiceLines, currentRun, preFilteredSerials, serialDocument } = get();
    if (!currentRun) {
      console.warn('[RunStore] executeMatcherSerialExtract: no currentRun');
      return;
    }

    const runId = currentRun.id;

    try {
      const linePrefix = `${runId}-line-`;
      const runLines = invoiceLines.filter(l => l.lineId.startsWith(linePrefix));
      const otherLines = invoiceLines.filter(l => !l.lineId.startsWith(linePrefix));

      // PROJ-20: Use preFilteredSerials (new SerialFinder path)
      if (preFilteredSerials.length > 0) {
        const invoiceNumber = currentRun.invoice.fattura;

        // Smart Validation: filter by invoice reference
        const { validRows, rejectedCount } = validateAgainstInvoice(preFilteredSerials, invoiceNumber);

        if (rejectedCount > 0) {
          logService.warn(
            `S/N Smart-Validation: ${rejectedCount} Zeilen ohne passende Rechnungsreferenz entfernt`,
            { runId, step: 'Seriennummer anfuegen' },
          );
        }

        // Build EAN → serial numbers map from validated rows
        const eanToSerials = new Map<string, string[]>();
        for (const row of validRows) {
          const ean = row.ean.trim();
          if (!ean) continue;
          const list = eanToSerials.get(ean) ?? [];
          list.push(row.serialNumber);
          eanToSerials.set(ean, list);
        }

        // Assign serialNumbers[] to aggregated positions (by EAN, up to qty)
        let assignedCount = 0;
        let requiredCount = 0;
        const updatedRunLines = runLines.map(line => {
          // PROJ-45-R5: Manuelle S/N sind heilig — Step 3 darf sie nicht überschreiben
          if (line.serialSource === 'manual') return line;
          if (!line.serialRequired) return line;
          requiredCount += line.qty;

          const lineEan = (line.ean ?? '').trim();
          if (!lineEan) return line;

          const available = eanToSerials.get(lineEan);
          if (!available || available.length === 0) return line;

          // Take up to qty serials from the pool
          const take = Math.min(line.qty, available.length);
          const assigned = available.splice(0, take);
          assignedCount += assigned.length;

          return {
            ...line,
            serialNumbers: assigned,
            serialNumber: assigned[0] ?? null,
            serialSource: 'serialList' as const,
          };
        });

        // ── PROJ-44-R6: Orphan-Catcher — nicht zugeordnete Serials sammeln ──
        const orphanSerials: string[] = [];
        for (const remaining of eanToSerials.values()) {
          orphanSerials.push(...remaining);
        }
        if (orphanSerials.length > 0) {
          logService.info(
            `${orphanSerials.length} Seriennummer(n) übersprungen (Positionen ohne S/N-Pflicht)`,
            { runId, step: 'Seriennummer anfuegen' },
          );
        }

        const strictSerialRequiredFailure = currentRun.config.strictSerialRequiredFailure ?? true;
        const checksumMatch = assignedCount === requiredCount;
        const shouldHardFail = strictSerialRequiredFailure && !checksumMatch;
        const step3Status: StepStatus = checksumMatch ? 'ok' : (shouldHardFail ? 'failed' : 'soft-fail');

        // PROJ-21: Enriched serial-mismatch issue with per-position details + context
        const step3Issues: Issue[] = [];
        if (!checksumMatch) {
          const underServedLines = updatedRunLines.filter(l => l.serialRequired && l.serialNumbers.length < l.qty);
          // Dedup: 1 Issue pro positionIndex (defensiv gegen expandierte Zeilen bei Re-Run)
          const seenPositions = new Set<number>();
          for (const l of underServedLines) {
            if (seenPositions.has(l.positionIndex)) continue;
            seenPositions.add(l.positionIndex);
            step3Issues.push({
              id: `issue-${runId}-step3-sn-mismatch-pos${l.positionIndex}`,
              runId,
              severity: shouldHardFail ? 'error' : 'warning',
              stepNo: 3,
              type: 'serial-mismatch',
              message: `Pos ${l.positionIndex}: S/N fehlt (${l.serialNumbers.length}/${l.qty})`,
              details: `${l.falmecArticleNo ?? l.manufacturerArticleNo ?? l.lineId}: ${l.serialNumbers.length}/${l.qty} S/N zugewiesen`,
              relatedLineIds: [l.lineId],
              affectedLineIds: [l.lineId],
              status: 'open',
              createdAt: new Date().toISOString(),
              resolvedAt: null,
              resolutionNote: null,
              context: { positionIndex: l.positionIndex, field: 'serialNumbers', expectedValue: 'qty', actualValue: `${l.serialNumbers.length}/${l.qty}` },
            });
          }

          // PROJ-41: Mismatch als WARN/ERROR loggen
          const logFn = shouldHardFail ? logService.error.bind(logService) : logService.warn.bind(logService);
          logFn(
            `S/N-Mismatch: ${assignedCount}/${requiredCount} zugewiesen (${underServedLines.length} Positionen betroffen)`,
            { runId, step: 'Seriennummer anfuegen' },
          );
        }

        set((state) => {
          const updatedRun = state.runs.find(r => r.id === runId);
          if (!updatedRun) return state;

          const newRun: Run = {
            ...updatedRun,
            orphanSerials,  // PROJ-44-R6: Orphan-Serials auf Run-Level
            stats: {
              ...updatedRun.stats,
              serialMatchedCount: assignedCount,
              serialRequiredCount: requiredCount,
            },
            steps: updatedRun.steps.map(step =>
              step.stepNo === 3
                ? { ...step, status: step3Status, issuesCount: step3Issues.length }
                : step
            ),
          };

          return {
            runs: state.runs.map(r => r.id === runId ? newRun : r),
            currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
            invoiceLines: [...updatedRunLines, ...otherLines],
            issues: [
              ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 3)),
              ...step3Issues,
            ],
          };
        });

        // PROJ-40 ADD-ON-3: Hard Checkpoint — S/N-Daten sofort persistieren
        if (runPersistenceService.isAvailable()) {
          try {
            const payload = buildAutoSavePayload(runId);
            if (payload) {
              await runPersistenceService.saveRun(payload);
              logService.info('Hard-Checkpoint: S/N-Daten nach Step 3 persistiert',
                { runId, step: 'Seriennummer anfuegen' });
            }
          } catch (err) {
            console.error('[RunStore] Step 3 hard checkpoint failed:', err);
          }
        }

        logService.info(
          `SerialFinder: ${assignedCount}/${requiredCount} S/N zugewiesen (Checksum: ${checksumMatch ? 'OK' : 'MISMATCH'}, strict=${strictSerialRequiredFailure})`,
          { runId, step: 'Seriennummer anfuegen' },
        );

        // PROJ-41: Step-3 Diagnostics für Settings "Letzte Diagnose"
        get().setStepDiagnostics(3, {
          stepNo: 3,
          moduleName: 'SerialFinder (preFiltered)',
          confidence: checksumMatch ? 'high' : (assignedCount > 0 ? 'medium' : 'low'),
          summary: requiredCount === 0
            ? 'Keine S/N-Pflicht'
            : `${assignedCount}/${requiredCount} S/N zugewiesen`,
          timestamp: new Date().toISOString(),
        });

        // Phase 3 (PROJ-44-R12): Self-Advance nach Step 3 (preFiltered)
        const step3pre = get().runs.find(r => r.id === runId)?.steps?.find(s => s.stepNo === 3);
        if (step3pre?.status === 'ok' || step3pre?.status === 'soft-fail') {
          get().advanceToNextStep(runId, 3);
        }
        return;
      }

      // ── Legacy path: Matcher-based serialExtract (PROJ-16 compat) ──────
      // Resolve active matcher module
      const matcherId = matcherRegistryService.getSelectedMatcherId();
      const matcher = getMatcher(matcherId);
      if (!matcher) {
        logService.error(`Matcher nicht gefunden: ${matcherId}`, { runId, step: 'Seriennummer anfuegen' });
        get().updateStepStatus(runId, 3, 'failed');
        return;
      }

      // If no serial document is loaded, mark step as ok (no S/N data to process)
      if (!serialDocument) {
        logService.info('Keine S/N-Datei geladen — Step 3 wird uebersprungen', { runId, step: 'Seriennummer anfuegen' });
        get().updateStepStatus(runId, 3, 'ok');
        // Phase 3 (PROJ-44-R12): Self-Advance im Skip-Pfad (kein serialDocument)
        const step3Skip = get().runs.find(r => r.id === runId)?.steps?.find(s => s.stepNo === 3);
        if (step3Skip?.status === 'ok' || step3Skip?.status === 'soft-fail') {
          get().advanceToNextStep(runId, 3);
        }
        return;
      }

      console.log(`[RunStore] executeMatcherSerialExtract (legacy): ${runLines.length} lines, ${serialDocument.rows.length} S/N rows, matcher=${matcher.moduleId}`);

      // Fix C: Reset consumed-flags before each matching run (in-place mutation by serialExtract
      // can persist to IndexedDB via AutoSave, which would mark all rows as consumed on reload)
      serialDocument.rows.forEach(r => { r.consumed = false; });

      const invoiceNumber = currentRun.invoice.fattura;
      const result = matcher.serialExtract(runLines, serialDocument, invoiceNumber);

      const strictSerialRequiredFailure = currentRun.config.strictSerialRequiredFailure ?? true;
      const shouldHardFail = strictSerialRequiredFailure && !result.checksum.match;
      const normalizedIssues = shouldHardFail
        ? result.issues.map((issue) => (
            issue.type === 'serial-mismatch' || issue.type === 'sn-insufficient-count'
              ? { ...issue, severity: 'error' as const }
              : issue
          ))
        : result.issues;
      const step3Status: StepStatus = result.checksum.match ? 'ok' : (shouldHardFail ? 'failed' : 'soft-fail');

      set((state) => {
        const updatedRun = state.runs.find(r => r.id === runId);
        if (!updatedRun) return state;

        const newRun: Run = {
          ...updatedRun,
          orphanSerials: result.orphanSerials,  // PROJ-44-R6: Legacy-Pfad Orphans
          stats: {
            ...updatedRun.stats,
            serialMatchedCount: result.stats.assignedCount,
            serialRequiredCount: result.stats.requiredCount,
          },
          steps: updatedRun.steps.map(step =>
            step.stepNo === 3
              ? { ...step, status: step3Status, issuesCount: normalizedIssues.length }
              : step
          ),
        };

        return {
          runs: state.runs.map(r => r.id === runId ? newRun : r),
          currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
          invoiceLines: [...result.lines, ...otherLines],
          issues: [
            ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 3)),
            ...normalizedIssues.map(issue => ({ ...issue, runId })),
          ],
        };
      });

      // PROJ-40 ADD-ON-3: Hard Checkpoint — S/N-Daten sofort persistieren
      if (runPersistenceService.isAvailable()) {
        try {
          const payload = buildAutoSavePayload(runId);
          if (payload) {
            await runPersistenceService.saveRun(payload);
            logService.info('Hard-Checkpoint: S/N-Daten nach Step 3 persistiert',
              { runId, step: 'Seriennummer anfuegen' });
          }
        } catch (err) {
          console.error('[RunStore] Step 3 hard checkpoint failed:', err);
        }
      }

      logService.info(
        `Matcher Serial-Extraktion abgeschlossen: ${result.stats.assignedCount}/${result.stats.requiredCount} S/N zugewiesen (${matcher.moduleId})`,
        { runId, step: 'Seriennummer anfuegen' },
      );

      // PROJ-28: Step 3 diagnostics
      const assignedCount = result.stats.assignedCount ?? 0;
      const requiredCount = result.stats.requiredCount ?? 0;
      const allAssigned = requiredCount === 0 || assignedCount >= requiredCount;
      get().setStepDiagnostics(3, {
        stepNo: 3,
        moduleName: matcher.moduleId,
        confidence: allAssigned ? 'high' : assignedCount > 0 ? 'medium' : 'low',
        summary: requiredCount === 0
          ? 'Keine S/N-Pflicht'
          : `${assignedCount}/${requiredCount} S/N zugewiesen`,
        timestamp: new Date().toISOString(),
      });

      for (const w of result.warnings) {
        const logFn = w.severity === 'error' ? logService.error.bind(logService) : logService.warn.bind(logService);
        logFn(`[Matcher] ${w.code}: ${w.message}`, { runId, step: 'Seriennummer anfuegen' });
      }

      // Phase 3 (PROJ-44-R12): Self-Advance nach Step 3 (legacy)
      const step3leg = get().runs.find(r => r.id === runId)?.steps?.find(s => s.stepNo === 3);
      if (step3leg?.status === 'ok' || step3leg?.status === 'soft-fail') {
        get().advanceToNextStep(runId, 3);
      }
    } catch (error) {
      console.error('[RunStore] executeMatcherSerialExtract error:', error);
      logService.error(`Matcher Serial-Extraktion fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Seriennummer anfuegen',
      });
      get().updateStepStatus(runId, 3, 'failed');
    }
  },

  executeOrderMatching: (openPositions) => {
    const { invoiceLines, currentRun } = get();
    if (!currentRun) {
      console.warn('[RunStore] executeOrderMatching: no currentRun');
      return;
    }

    const runId = currentRun.id;

    try {
      // Run order matching on all lines for this run
      const linePrefix = `${runId}-line-`;
      const runLines = invoiceLines.filter(l => l.lineId.startsWith(linePrefix));
      const otherLines = invoiceLines.filter(l => !l.lineId.startsWith(linePrefix));

      console.log(`[RunStore] executeOrderMatching: ${runLines.length} lines, ${openPositions.length} positions`);

      if (runLines.length === 0) {
        console.warn('[RunStore] executeOrderMatching: no invoiceLines found for run. LineId prefix:', linePrefix);
        return;
      }

      const updatedLines = matchAllOrders(runLines, openPositions);

      // Compute order stats
      const orderStats = computeOrderStats(updatedLines);

      // Determine step 4 status
      const step4Status: StepStatus = (orderStats.notOrderedCount ?? 0) > 0 ? 'soft-fail' : 'ok';

      set((state) => {
        const updatedRun = state.runs.find(r => r.id === runId);
        if (!updatedRun) return state;

        const newRun: Run = {
          ...updatedRun,
          stats: { ...updatedRun.stats, ...orderStats },
          steps: updatedRun.steps.map(step =>
            step.stepNo === 4
              ? { ...step, status: step4Status }
              : step
          ),
        };

        return {
          runs: state.runs.map(r => r.id === runId ? newRun : r),
          currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
          invoiceLines: [...updatedLines, ...otherLines],
        };
      });

      logService.info(
        `Bestellzuordnung abgeschlossen: ${orderStats.matchedOrders} von ${updatedLines.length} zugeordnet`,
        { runId, step: 'Bestellungen mappen' }
      );
    } catch (error) {
      logService.error(`Bestell-Matching fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Bestellungen mappen',
      });

      // Set step 4 to failed so the UI doesn't hang
      get().updateStepStatus(runId, 4, 'failed');
    }
  },

  // PROJ-23: 3-Run Matching Engine on aggregated positions (replaces PROJ-20 legacy waterfall)
  executeOrderMapping: (parsedOrders, idbData) => {
    const { invoiceLines, currentRun, parsedPositions } = get();
    if (!currentRun) {
      console.warn('[RunStore] executeOrderMapping: no currentRun');
      return;
    }

    const runId = currentRun.id;

    try {
      const linePrefix = `${runId}-line-`;
      const runLines = invoiceLines.filter(l => l.lineId.startsWith(linePrefix));
      const otherLines = invoiceLines.filter(l => !l.lineId.startsWith(linePrefix));

      // PROJ-49: effectivePositions-Fallback entfernt — Step 4 Guard hat parsedPositions
      // bereits vor dem Aufruf von executeOrderMapping repariert/rehydriert.

      if (runLines.length === 0) {
        console.warn('[RunStore] executeOrderMapping: no invoiceLines found for run');
        get().updateStepStatus(runId, 4, 'ok');
        // Phase 3 (PROJ-44-R12 V23): Self-Advance im no-run-lines-Skip
        const step4Skip = get().runs.find(r => r.id === runId)?.steps?.find(s => s.stepNo === 4);
        if (step4Skip?.status === 'ok' || step4Skip?.status === 'soft-fail') {
          get().advanceToNextStep(runId, 4);
        }
        return;
      }

      // PROJ-49 SSOT 12b: masterArticles aus parsedArticlePool für SSOT-Runs
      const isSSoTRun = !!idbData?.ingestStatus;
      let masterArticles: ArticleMaster[];
      if (isSSoTRun) {
        if (!idbData!.parsedArticlePool?.length) {
          logService.error('[Step4] SSOT-Run ohne parsedArticlePool — Integritätsfehler', { runId, step: 'Bestellungen mappen' });
          get().updateStepStatus(runId, 4, 'failed');
          return;
        }
        masterArticles = idbData!.parsedArticlePool;
      } else {
        // Legacy-Run: Fallback auf globalen masterDataStore
        masterArticles = useMasterDataStore.getState().articles;
      }
      // Phase A3: Build Article-First OrderPool (2-of-3 per-article scoring)
      const poolResult = buildOrderPool(parsedOrders, runLines, masterArticles, runId);

      // PROJ-23 ADDON: Telemetry logging
      logService.info(
        `OrderPool: ${parsedOrders.length} Excel-Pos → ${poolResult.filteredInCount} bestehen 2-von-3 ` +
        `(${poolResult.filteredOutCount} gefiltert) → Pool: ${poolResult.pool.totalRemaining} offene Menge`,
        { runId, step: 'Bestellungen mappen' },
      );

      // PROJ-23 ADDON: Anti-silent-failure — empty pool guard
      if (poolResult.pool.totalRemaining === 0 && parsedOrders.length > 0) {
        const emptyPoolIssue: Issue = {
          id: `issue-${runId}-pool-empty-${Date.now()}`,
          runId,
          severity: 'error',
          stepNo: 4,
          type: 'pool-empty-mismatch',
          message: 'Excel gelesen, aber keine Position erreicht den 2-von-3 Match-Score zu den Rechnungsdaten.',
          details: `${parsedOrders.length} Bestellpositionen gelesen, 0 bestanden den Pool-Filter. ` +
            `Pruefe artNoDE, artNoIT und EAN in der Excel-Datei gegen die Rechnungsdaten.`,
          relatedLineIds: [],
          status: 'open',
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          resolutionNote: null,
        };

        set((state) => {
          const updatedRun = state.runs.find(r => r.id === runId);
          if (!updatedRun) return state;

          const newRun: Run = {
            ...updatedRun,
            status: 'soft-fail',
            steps: updatedRun.steps.map((step) =>
              step.stepNo === 4
                ? { ...step, status: 'failed' as StepStatus, issuesCount: 1 }
                : step,
            ),
          };

          return {
            runs: state.runs.map(r => r.id === runId ? newRun : r),
            currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
            issues: [
              ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
              ...poolResult.issues,
              emptyPoolIssue,
            ],
          };
        });

        logService.error(
          `OrderPool LEER: ${parsedOrders.length} Excel-Positionen, 0 bestanden 2-von-3 Filter`,
          { runId, step: 'Bestellungen mappen' },
        );
        return; // STOP — do NOT run MatchingEngine with empty pool
      }

      // Phase A4: Execute 3-Run Matching Engine
      logService.info(
        `MatchingEngine Start: ${runLines.length} aggregierte Rechnungszeilen, Pool: ${poolResult.pool.totalRemaining}`,
        { runId, step: 'Bestellungen mappen' },
      );
      const result = executeMatchingEngine(runLines, poolResult.pool, parsedPositions, runId);

      // Merge pool-build issues with engine issues
      const allIssues = [...poolResult.issues, ...result.issues];

      // Determine step 4 status
      const step4Status: StepStatus = result.stats.notOrderedCount > 0 ? 'soft-fail' : 'ok';

      set((state) => {
        const updatedRun = state.runs.find(r => r.id === runId);
        if (!updatedRun) return state;

        const newRun: Run = {
          ...updatedRun,
          isExpanded: true,  // PROJ-23: Lines are now expanded to qty=1
          orphanSerials: updatedRun.orphanSerials ?? [],  // PROJ-44-R6: preserve
          stats: {
            ...updatedRun.stats,
            ...result.stats,
            expandedLineCount: result.lines.length,
          },
          steps: updatedRun.steps.map(step =>
            step.stepNo === 4
              ? { ...step, status: step4Status, issuesCount: allIssues.length }
              : step
          ),
        };

        return {
          runs: state.runs.map(r => r.id === runId ? newRun : r),
          currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
          invoiceLines: [...result.lines, ...otherLines],
          issues: [
            ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
            ...allIssues,
          ],
          orderPool: result.pool,  // PROJ-23: Persist pool for manual resolution
        };
      });

      logService.info(
        `MatchingEngine (3-Run): ${result.stats.matchedOrders} zugeordnet, ${result.stats.notOrderedCount} ohne Bestellung ` +
        `(P:${result.stats.perfectMatchCount} R:${result.stats.referenceMatchCount} S:${result.stats.smartQtyMatchCount} F:${result.stats.fifoFallbackCount}) ` +
        `| ${result.lines.length} expanded lines`,
        { runId, step: 'Bestellungen mappen' },
      );

      // Phase 3 (PROJ-44-R12): Self-Advance nach Step 4
      const step4 = get().runs.find(r => r.id === runId)?.steps?.find(s => s.stepNo === 4);
      if (step4?.status === 'ok' || step4?.status === 'soft-fail') {
        get().advanceToNextStep(runId, 4);
      }
    } catch (error) {
      logService.error(`MatchingEngine fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Bestellungen mappen',
      });
      get().updateStepStatus(runId, 4, 'failed');
    }
  },
});
