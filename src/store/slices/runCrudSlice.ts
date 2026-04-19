// slices/runCrudSlice.ts — PROJ-46 AP4c (Slice-Split)
// 1:1-Umzug aus runStore.ts — Mechaniker-Kontrakt, keine Logik-Änderungen.
// Ownership: runs[], currentRun, Identitäts-Writes (setCurrentRun, createNewRun,
// createNewRunWithParsing, deleteRun, setBookingDate, incrementExportVersion),
// Audit-Log, globale Config, Tab-/UI-State, Issue-Resolution-Metadaten.

import type { StateCreator } from 'zustand';
import type { RunState } from '@/store/types';
import type { Run, StepStatus } from '@/types';
import { logService } from '@/services/logService';
import { archiveService } from '@/services/archiveService';
import { useMasterDataStore } from '@/store/masterDataStore';
import { parseMasterDataFile } from '@/services/masterDataParser';
import {
  createAggregatedInvoiceLines,
  convertToInvoiceHeader,
  generateRunId,
} from '@/services/invoiceParserService';
import { DEFAULT_ORDER_PARSER_PROFILE_ID } from '@/services/matching/orderParserProfiles';
import type { SerialDocument, SerialDocumentRow } from '@/services/matchers/types';
import {
  resetRunSensitiveState,
  buildStep1ParserIssues,
} from '@/store/internal/helpers';

export type RunCrudSlice = Pick<
  RunState,
  | 'runs'
  | 'currentRun'
  | 'invoiceLines'
  | 'issues'
  | 'auditLog'
  | 'persistedRunSummaries'
  | 'currentParsedRunId'
  | 'globalConfig'
  | 'activeTab'
  | 'isProcessing'
  | 'parsingProgress'
  | 'issuesStepFilter'
  | 'activeIssueFilterIds'
  | 'highlightedLineIds'
  | 'scrollToLineId'
  | 'setCurrentRun'
  | 'setActiveTab'
  | 'setIssuesStepFilter'
  | 'setActiveIssueFilterIds'
  | 'navigateToLine'
  | 'clearHighlightedLines'
  | 'setGlobalConfig'
  | 'createNewRun'
  | 'createNewRunWithParsing'
  | 'updateRunWithParsedData'
  | 'updateRunStatus'
  | 'updateStepStatus'
  | 'resolveIssue'
  | 'escalateIssue'
  | 'deleteRun'
  | 'setBookingDate'
  | 'incrementExportVersion'
  | 'addAuditEntry'
  | 'assignParsedRunId'
>;

export const createRunCrudSlice: StateCreator<RunState, [], [], RunCrudSlice> = (set, get) => ({
  // ── state (initial) ────────────────────────────────────────────────────────
  runs: [],
  currentRun: null,
  invoiceLines: [],
  issues: [],
  auditLog: [],
  persistedRunSummaries: [],
  currentParsedRunId: null,
  globalConfig: {
    priceBasis: 'Net',
    priceType: 'EK',
    tolerance: 0.01,
    eingangsart: 'Standard',
    clickLockSeconds: 0,
    activeSerialFinderId: 'default',
    activeOrderMapperId: 'engine-proj-23',
    activeOrderParserProfileId: DEFAULT_ORDER_PARSER_PROFILE_ID,
    orderParserProfileOverrides: undefined,
    strictSerialRequiredFailure: true,
    blockStep2OnPriceMismatch: false,
    blockStep4OnMissingOrder: false,
    matcherProfileOverrides: undefined,
    autoStartStep4: true,
  },
  activeTab: 'overview',
  isProcessing: false,
  parsingProgress: '',
  issuesStepFilter: null,
  activeIssueFilterIds: null,
  highlightedLineIds: [],
  scrollToLineId: null,

  // ── actions (verbatim bodies) ──────────────────────────────────────────────

  setCurrentRun: (run) => {
    const prevId = get().currentRun?.id ?? null;
    const nextId = run?.id ?? null;
    // PROJ-46 R1 / INVARIANTS A13: Reset NUR bei echtem Identitätswechsel.
    if (prevId === nextId) return; // Idempotenter Skip (verhindert Re-Renders)

    // PROJ-49 SSOT: resetRunSensitiveState leert alle run-sensitiven Felder inkl. Timer
    resetRunSensitiveState(get, set);
    // Danach currentRun setzen — loadPersistedRun() wird durch Aufrufer nachgezogen
    set({ currentRun: run });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  setIssuesStepFilter: (filter) => set({ issuesStepFilter: filter }),

  // PROJ-37: Issue-isolation filter
  setActiveIssueFilterIds: (ids) => set({ activeIssueFilterIds: ids }),

  // PROJ-21: Jump-link navigation — highlight + scroll + tab switch
  navigateToLine: (lineIds) => {
    set({
      highlightedLineIds: lineIds,
      scrollToLineId: lineIds[0] ?? null,
      activeTab: 'items',
    });
    // Auto-clear highlight after 5 seconds
    setTimeout(() => {
      set({ highlightedLineIds: [], scrollToLineId: null });
    }, 5000);
  },

  clearHighlightedLines: () => set({ highlightedLineIds: [], scrollToLineId: null }),

  setGlobalConfig: (config) => set((state) => {
    const newGlobalConfig = { ...state.globalConfig, ...config };
    // PROJ-44: Sync autoStartStep4 to the currently active run so Settings changes take effect immediately
    let newCurrentRun = state.currentRun;
    let newRuns = state.runs;
    if ('autoStartStep4' in config && state.currentRun) {
      const updatedRunConfig = { ...state.currentRun.config, autoStartStep4: config.autoStartStep4 };
      newCurrentRun = { ...state.currentRun, config: updatedRunConfig };
      newRuns = state.runs.map(r =>
        r.id === state.currentRun!.id ? { ...r, config: updatedRunConfig } : r
      );
    }
    return { globalConfig: newGlobalConfig, currentRun: newCurrentRun, runs: newRuns };
  }),

  createNewRun: () => {
    const { globalConfig, uploadedFiles } = get();
    const newRun: Run = {
      id: `run-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'running',
      isExpanded: false,
      orphanSerials: [],  // PROJ-44-R6
      config: globalConfig,
      invoice: {
        fattura: 'FA-2025-NEW',
        invoiceDate: new Date().toISOString().split('T')[0],
        deliveryDate: null,
      },
      stats: {
        parsedInvoiceLines: 0,
        matchedOrders: 0,
        notOrderedCount: 0,
        serialMatchedCount: 0,
        mismatchedGroupsCount: 0,
        articleMatchedCount: 0,
        inactiveArticlesCount: 0,
        priceOkCount: 0,
        priceMismatchCount: 0,
        exportReady: false,
        expandedLineCount: 0, fullMatchCount: 0, codeItOnlyCount: 0, eanOnlyCount: 0, noMatchCount: 0,
        serialRequiredCount: 0, priceMissingCount: 0, priceCustomCount: 0, manualOkOrderCount: 0,
        perfectMatchCount: 0, referenceMatchCount: 0, smartQtyMatchCount: 0, fifoFallbackCount: 0,
      },
      steps: [
        { stepNo: 1, name: 'Rechnung auslesen', status: 'running', issuesCount: 0 },
        { stepNo: 2, name: 'Artikel extrahieren', status: 'not-started', issuesCount: 0 },
        { stepNo: 3, name: 'Seriennummer anfügen', status: 'not-started', issuesCount: 0 },
        { stepNo: 4, name: 'Bestellungen mappen', status: 'not-started', issuesCount: 0 },
        { stepNo: 5, name: 'Export', status: 'not-started', issuesCount: 0 },
      ],
    };

    // Log workflow start
    logService.info('Neuer Verarbeitungslauf gestartet', {
      runId: newRun.id,
      step: 'System',
      details: `Fattura: ${newRun.invoice.fattura}, Config: ${JSON.stringify(globalConfig)}`,
    });

    // Create archive entry with uploaded files (non-blocking if storage fails)
    try {
      archiveService.createArchiveEntry(
        newRun.id,
        newRun.invoice.fattura,
        globalConfig,
        uploadedFiles
      );
    } catch (error) {
      console.warn('[RunStore] Failed to create archive entry:', error);
      logService.warn('Archiv-Eintrag konnte nicht erstellt werden', {
        runId: newRun.id,
        step: 'Archiv',
      });
    }

    // Log step start
    logService.info('Schritt gestartet: Rechnung auslesen', {
      runId: newRun.id,
      step: 'Rechnung auslesen',
    });

    set((state) => ({
      runs: [newRun, ...state.runs],
      currentRun: newRun,
      // PROJ-28: Reset diagnostics for new run
      latestDiagnostics: {},
    }));

    return newRun;
  },

  // New createNewRun with PDF parsing
  createNewRunWithParsing: async () => {
    console.log('[RunStore] createNewRunWithParsing() called');
    const { globalConfig, uploadedFiles, parseInvoice, updateRunWithParsedData } = get();

    // Find invoice file
    const invoiceFile = uploadedFiles.find(f => f.type === 'invoice');
    console.log('[RunStore] Invoice file found:', invoiceFile ? { name: invoiceFile.name, hasFile: !!invoiceFile.file } : 'null');

    // Create initial run with placeholder data
    let runId = `run-${Date.now()}`;
    let fatturaNumber = 'PARSING...';

    // Start with initial run
    const newRun: Run = {
      id: runId,
      createdAt: new Date().toISOString(),
      status: 'running',
      config: globalConfig,
      invoice: {
        fattura: fatturaNumber,
        invoiceDate: new Date().toISOString().split('T')[0],
        deliveryDate: null,
      },
      stats: {
        parsedInvoiceLines: 0,
        matchedOrders: 0,
        notOrderedCount: 0,
        serialMatchedCount: 0,
        mismatchedGroupsCount: 0,
        articleMatchedCount: 0,
        inactiveArticlesCount: 0,
        priceOkCount: 0,
        priceMismatchCount: 0,
        exportReady: false,
        expandedLineCount: 0, fullMatchCount: 0, codeItOnlyCount: 0, eanOnlyCount: 0, noMatchCount: 0,
        serialRequiredCount: 0, priceMissingCount: 0, priceCustomCount: 0, manualOkOrderCount: 0,
        perfectMatchCount: 0, referenceMatchCount: 0, smartQtyMatchCount: 0, fifoFallbackCount: 0,
      },
      steps: [
        { stepNo: 1, name: 'Rechnung auslesen', status: 'running', issuesCount: 0 },
        { stepNo: 2, name: 'Artikel extrahieren', status: 'not-started', issuesCount: 0 },
        { stepNo: 3, name: 'Seriennummer anfügen', status: 'not-started', issuesCount: 0 },
        { stepNo: 4, name: 'Bestellungen mappen', status: 'not-started', issuesCount: 0 },
        { stepNo: 5, name: 'Export', status: 'not-started', issuesCount: 0 },
      ],
      isExpanded: false,
      orphanSerials: [],  // PROJ-44-R6
    };

    set((state) => ({
      runs: [newRun, ...state.runs],
      currentRun: newRun,
      isProcessing: true,
      parsingProgress: 'Initialisiere...',
    }));

    // Log workflow start + initialize run buffer
    logService.startRunLogging(runId);
    logService.info('Neuer Verarbeitungslauf mit PDF-Parsing gestartet', {
      runId,
      step: 'System',
      details: `Config: ${JSON.stringify(globalConfig)}`,
    });

    // ── try/finally guarantees isProcessing is ALWAYS reset ──
    try {
      // ── Fix A: Lazy Hydration Guard — rehydrate masterDataStore when starting from memory ──
      const articleListFile = uploadedFiles.find(f => f.type === 'articleList');
      if (articleListFile?.file && useMasterDataStore.getState().articles.length === 0) {
        try {
          set({ parsingProgress: 'Stammdaten laden...' });
          const artNoDeRegexStr2 = get().globalConfig?.matcherProfileOverrides?.artNoDeRegex;
          const artNoDeRegexParsed2 = artNoDeRegexStr2
            ? (() => { try { return new RegExp(artNoDeRegexStr2); } catch { return undefined; } })()
            : undefined;
          const result = await parseMasterDataFile(articleListFile.file, { artNoDeRegex: artNoDeRegexParsed2 });
          await useMasterDataStore.getState().save(result.articles, articleListFile.name);
          logService.info(
            `Stammdaten rehydriert: ${result.rowCount} Artikel aus '${articleListFile.name}'`,
            { step: 'Stammdaten' }
          );
        } catch (err) {
          logService.error(
            `Stammdaten-Rehydrierung fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
            { step: 'Stammdaten' }
          );
        }
      }

      // ── Fix B: Lazy Hydration Guard — rehydrate preFilteredSerials when starting from memory ──
      const serialListFile = uploadedFiles.find(f => f.type === 'serialList');
      if (serialListFile?.file && get().preFilteredSerials.length === 0) {
        try {
          set({ parsingProgress: 'Seriennummernliste laden...' });
          const { preFilterSerialExcel } = await import('@/services/serialFinder');
          const serialResult = await preFilterSerialExcel(serialListFile.file);
          const serialDocRows: SerialDocumentRow[] = serialResult.filteredRows.map(row => ({
            rowIndex: row.sourceRowIndex,
            invoiceRef: row.invoiceReference.replace(/\D/g, '').slice(-5),
            serialRaw: row.serialNumber,
            serialCandidate: row.serialNumber,
            consumed: false,
          }));
          const serialDoc: SerialDocument = {
            rows: serialDocRows,
            fileName: serialListFile.name,
            columnMapping: {},
          };
          set({ preFilteredSerials: serialResult.filteredRows, serialDocument: serialDoc });
          logService.info(
            `S/N Pre-Filter rehydriert: ${serialResult.regexMatchCount}/${serialResult.totalRowsScanned} Zeilen`,
            { step: 'Seriennummer anfuegen' }
          );
        } catch (err) {
          logService.error(
            `S/N Pre-Filter Rehydrierung fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
            { step: 'Seriennummer anfuegen' }
          );
        }
      }

      // Parse invoice if file is available
      if (invoiceFile?.file) {
        set({ parsingProgress: 'Lese PDF...' });

        const parseSuccess = await parseInvoice(runId);
        const { parsedInvoiceResult } = get();

        if (parseSuccess && parsedInvoiceResult) {
          // Update run with parsed data
          updateRunWithParsedData(runId, parsedInvoiceResult);

          // Generate proper run ID with fattura number
          const newRunId = generateRunId(parsedInvoiceResult.header.fatturaNumber);

          // Update run ID + rename invoiceLine lineIds to match new runId
          set((state) => {
            const updatedRun = state.runs.find(r => r.id === runId);
            if (updatedRun) {
              const finalRun = { ...updatedRun, id: newRunId };
              const oldPrefix = `${runId}-line-`;
              const newPrefix = `${newRunId}-line-`;
              return {
                runs: state.runs.map(r => r.id === runId ? finalRun : r),
                currentRun: finalRun,
                invoiceLines: state.invoiceLines.map(l =>
                  l.lineId.startsWith(oldPrefix)
                    ? { ...l, lineId: l.lineId.replace(oldPrefix, newPrefix) }
                    : l
                ),
                issues: state.issues.map(issue =>
                  issue.runId === runId ? { ...issue, runId: newRunId } : issue
                ),
              };
            }
            return state;
          });

          // Rename log buffer to match new runId
          logService.renameRunBuffer(runId, newRunId);
          runId = newRunId;

          // PROJ-27-ADDON-2 BUGFIX: fire-and-forget — kein await verhindert Race-Condition
          // (await blockierte createNewRunWithParsing(), was den 500ms-Timer mit currentRun=null
          //  erwischen lies → advanceToNextStep wurde nie aufgerufen → Steps 2-5 starteten nie)
          const earlyRun = get().runs.find(r => r.id === runId);
          if (earlyRun) {
            const capturedRunId = runId; // let-Variable einfangen (hat bereits newRunId-Wert)
            archiveService.writeEarlyArchive(earlyRun, uploadedFiles, globalConfig)
              .then(earlyResult => {
                if (earlyResult.success) {
                  set((state) => ({
                    runs: state.runs.map(r =>
                      r.id === capturedRunId ? { ...r, archivePath: earlyResult.folderName } : r
                    ),
                    currentRun: state.currentRun?.id === capturedRunId
                      ? { ...state.currentRun, archivePath: earlyResult.folderName }
                      : state.currentRun,
                  }));
                  logService.info(`Early Archive erstellt: ${earlyResult.folderName}`, {
                    runId: capturedRunId, step: 'Archiv',
                  });
                }
              })
              .catch(err => {
                logService.warn(
                  `Early Archive fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
                  { runId: capturedRunId, step: 'Archiv' }
                );
              });
          }
        } else if (parsedInvoiceResult) {
          // Parsing had errors but we got some data - update run with partial data
          updateRunWithParsedData(runId, parsedInvoiceResult);

          // If we have a fattura number, use it for the run ID
          if (parsedInvoiceResult.header.fatturaNumber) {
            const newRunId = generateRunId(parsedInvoiceResult.header.fatturaNumber);
            set((state) => {
              const updatedRun = state.runs.find(r => r.id === runId);
              if (updatedRun) {
                const finalRun = { ...updatedRun, id: newRunId };
                const oldPrefix = `${runId}-line-`;
                const newPrefix = `${newRunId}-line-`;
                return {
                  runs: state.runs.map(r => r.id === runId ? finalRun : r),
                  currentRun: finalRun,
                  invoiceLines: state.invoiceLines.map(l =>
                    l.lineId.startsWith(oldPrefix)
                      ? { ...l, lineId: l.lineId.replace(oldPrefix, newPrefix) }
                      : l
                  ),
                  issues: state.issues.map(issue =>
                    issue.runId === runId ? { ...issue, runId: newRunId } : issue
                  ),
                };
              }
              return state;
            });
            // Rename log buffer to match new runId
            logService.renameRunBuffer(runId, newRunId);
            runId = newRunId;

            // PROJ-27-ADDON-2 BUGFIX: fire-and-forget — kein await verhindert Race-Condition
            const earlyRun = get().runs.find(r => r.id === runId);
            if (earlyRun) {
              const capturedRunId = runId;
              archiveService.writeEarlyArchive(earlyRun, uploadedFiles, globalConfig)
                .then(earlyResult => {
                  if (earlyResult.success) {
                    set((state) => ({
                      runs: state.runs.map(r =>
                        r.id === capturedRunId ? { ...r, archivePath: earlyResult.folderName } : r
                      ),
                      currentRun: state.currentRun?.id === capturedRunId
                        ? { ...state.currentRun, archivePath: earlyResult.folderName }
                        : state.currentRun,
                    }));
                    logService.info(`Early Archive erstellt: ${earlyResult.folderName}`, {
                      runId: capturedRunId, step: 'Archiv',
                    });
                  }
                })
                .catch(err => {
                  logService.warn(
                    `Early Archive fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
                    { runId: capturedRunId, step: 'Archiv' }
                  );
                });
            }
          }
        } else {
          // Complete failure - update run with error status
          set((state) => {
            const updatedRun = state.runs.find(r => r.id === runId);
            if (updatedRun) {
              const failedRun: Run = {
                ...updatedRun,
                status: 'failed',
                invoice: {
                  ...updatedRun.invoice,
                  fattura: 'FEHLER: Parsing fehlgeschlagen',
                },
                steps: updatedRun.steps.map(step =>
                  step.stepNo === 1 ? { ...step, status: 'failed' as const, issuesCount: 1 } : step
                ),
              };
              return {
                runs: state.runs.map(r => r.id === runId ? failedRun : r),
                currentRun: failedRun,
              };
            }
            return state;
          });

          logService.error('PDF-Parsing vollständig fehlgeschlagen', {
            runId,
            step: 'Rechnung auslesen',
          });
        }
      } else {
        // No invoice file - update run with error status
        set((state) => {
          const updatedRun = state.runs.find(r => r.id === runId);
          if (updatedRun) {
            const failedRun: Run = {
              ...updatedRun,
              status: 'failed',
              invoice: {
                ...updatedRun.invoice,
                fattura: 'FEHLER: Keine PDF-Datei',
              },
              steps: updatedRun.steps.map(step =>
                step.stepNo === 1 ? { ...step, status: 'failed' as const, issuesCount: 1 } : step
              ),
            };
            return {
              runs: state.runs.map(r => r.id === runId ? failedRun : r),
              currentRun: failedRun,
            };
          }
          return state;
        });

        logService.warn('Keine Invoice-Datei für Parsing verfügbar', {
          runId,
          step: 'Rechnung auslesen',
        });
      }

    } catch (error) {
      // Catch-all: any uncaught error in the entire parsing workflow
      console.error('CRITICAL PARSER ERROR in createNewRunWithParsing:', error);
      logService.error(`CRITICAL: createNewRunWithParsing crashed: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'System',
      });

      // Mark run as failed so the UI shows the error
      set((state) => {
        const updatedRun = state.runs.find(r => r.id === runId);
        if (updatedRun) {
          const failedRun: Run = {
            ...updatedRun,
            status: 'failed',
            steps: updatedRun.steps.map(step =>
              step.stepNo === 1 && step.status === 'running'
                ? { ...step, status: 'failed' as const, issuesCount: 1 }
                : step
            ),
          };
          return {
            runs: state.runs.map(r => r.id === runId ? failedRun : r),
            currentRun: state.currentRun?.id === runId ? failedRun : state.currentRun,
          };
        }
        return state;
      });
    } finally {
      // GUARANTEED: Always reset isProcessing, even on crash
      set({ isProcessing: false, parsingProgress: '' });
    }

    return get().currentRun || newRun;
  },

  updateRunWithParsedData: (runId, result, autoAdvance = true) => {
    try {
      // ── DEBUG: Raw parser output BEFORE expansion ──
      console.log('[RunStore] Raw Parser Output:', JSON.stringify({
        linesCount: result.lines.length,
        header: result.header,
        warningsCount: result.warnings.length,
        lines: result.lines.map((l, i) => ({
          idx: i,
          pos: l.positionIndex,
          art: l.manufacturerArticleNo,
          ean: l.ean,
          qty: l.quantityDelivered,
          unit: l.unitPrice,
          total: l.totalPrice,
        })),
      }, null, 2));

      const invoiceHeader = convertToInvoiceHeader(result);
      // PROJ-23: Use aggregated lines (qty preserved) instead of expanded (qty=1) lines.
      // Expansion to qty=1 happens later in Run 3 of the MatchingEngine.
      const invoiceLines = createAggregatedInvoiceLines(result.lines, runId);

      console.log(`[RunStore] Aggregated lines created: ${result.lines.length} positions → ${invoiceLines.length} aggregated lines`);

      const step1Issues = buildStep1ParserIssues(runId, result.warnings);

      // Determine step status based on parse result
      const hasErrors = step1Issues.length > 0;
      const stepStatus: StepStatus = result.success
        ? (hasErrors ? 'soft-fail' : 'ok')
        : 'failed';

      set((state) => {
        const updatedRun = state.runs.find(r => r.id === runId);
        if (!updatedRun) return state;

        const newRun: Run = {
          ...updatedRun,
          invoice: {
            ...invoiceHeader,
            packagesCount: result.header.packagesCount,
            invoiceTotal: result.header.invoiceTotal ?? null,
            totalQty: result.header.totalQty,
            qtyValidationStatus: result.header.qtyValidationStatus,
            targetArticleCount: invoiceLines.reduce((sum, l) => sum + l.qty, 0),
            targetPositionsCount: result.lines.length,
          },
          // PROJ-23: invoiceLines are now aggregated (qty>1), so expandedLineCount
          // represents the total individual articles (sum of all qty values).
          isExpanded: false,
          orphanSerials: updatedRun.orphanSerials ?? [],  // PROJ-44-R6: preserve or init
          stats: {
            ...updatedRun.stats,
            parsedInvoiceLines: result.lines.length,
            expandedLineCount: invoiceLines.reduce((sum, l) => sum + l.qty, 0),
          },
          steps: updatedRun.steps.map(step =>
            step.stepNo === 1
              ? {
                  ...step,
                  status: stepStatus,
                  issuesCount: step1Issues.length,
                }
              : step
          ),
          status: stepStatus === 'failed' ? 'soft-fail' : 'running',
        };

        return {
          runs: state.runs.map(r => r.id === runId ? newRun : r),
          currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
          invoiceLines: [...invoiceLines, ...state.invoiceLines.filter(l => !l.lineId.startsWith(runId))],
          issues: [
            ...state.issues.filter(issue => !(issue.runId === runId && issue.stepNo === 1)),
            ...step1Issues,
          ],
        };
      });

      // Log completion
      logService.info(`Schritt 1 abgeschlossen: ${result.lines.length} Positionen extrahiert`, {
        runId,
        step: 'Rechnung auslesen',
        details: `Status: ${stepStatus}, Fattura: ${result.header.fatturaNumber}`,
      });

      // Auto-advance to next step if parsing was successful
      // PROJ-49: autoAdvance=false unterdrückt diesen Timer — Phase 1 (Ingest) muss
      // erst vollständig abgeschlossen sein, bevor Phase 2 (Workflow) startet.
      // NOTE: Use currentRun.id (not the closure's runId) because
      // createNewRunWithParsing may rename the run before this timer fires.
      if (autoAdvance && (stepStatus === 'ok' || stepStatus === 'soft-fail')) {
        setTimeout(() => {
          const currentState = get();
          const activeRunId = currentState.currentRun?.id;
          if (activeRunId) {
            console.log('[RunStore] advanceToNextStep with activeRunId:', activeRunId);
            currentState.advanceToNextStep(activeRunId);
          } else {
            console.warn('[RunStore] advanceToNextStep: no currentRun found');
          }
        }, 500);
      }
    } catch (error) {
      console.error('CRITICAL PARSER ERROR:', error);
      logService.error(`CRITICAL: updateRunWithParsedData crashed: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Rechnung auslesen',
      });

      // Set step 1 to failed so the UI doesn't hang
      get().updateStepStatus(runId, 1, 'failed');
    }
  },

  updateRunStatus: (runId, status) => set((state) => ({
    runs: state.runs.map(run =>
      run.id === runId ? { ...run, status } : run
    ),
    currentRun: state.currentRun?.id === runId
      ? { ...state.currentRun, status }
      : state.currentRun,
  })),

  updateStepStatus: (runId, stepNo, status) => set((state) => {
    const updateSteps = (steps: Run['steps']) =>
      steps.map(step => step.stepNo === stepNo ? { ...step, status } : step);

    // HOTFIX-3: Step-Failure kaskadiert auf Run-Status
    const runStatusOverride = status === 'failed' ? ('soft-fail' as StepStatus) : undefined;

    return {
      runs: state.runs.map(run =>
        run.id === runId
          ? {
              ...run,
              steps: updateSteps(run.steps),
              ...(runStatusOverride ? { status: runStatusOverride } : {}),
            }
          : run
      ),
      currentRun: state.currentRun?.id === runId
        ? {
            ...state.currentRun,
            steps: updateSteps(state.currentRun.steps),
            ...(runStatusOverride ? { status: runStatusOverride } : {}),
          }
        : state.currentRun,
    };
  }),

  resolveIssue: (issueId, resolutionNote) => {
    set((state) => ({
      issues: state.issues.map(issue =>
        issue.id === issueId
          ? { ...issue, status: 'resolved' as const, resolvedAt: new Date().toISOString(), resolutionNote }
          : issue
      ),
    }));
    const runId = get().issues.find(i => i.id === issueId)?.runId ?? get().currentRun?.id;
    if (runId) {
      logService.info(`Issue gelöst: ${issueId}`, { runId, step: 'Issues', details: resolutionNote ?? '' });
      get().addAuditEntry({ runId, action: 'resolveIssue', details: `issueId=${issueId}, note=${resolutionNote ?? ''}`, userId: 'system' });
    }
  },

  // PROJ-39/43: Escalate issue — status transitions to 'pending', sets escalatedAt + escalatedTo
  escalateIssue: (issueId, recipientEmail) => {
    set((state) => ({
      issues: state.issues.map(issue =>
        issue.id === issueId
          ? {
              ...issue,
              status: 'pending' as const,
              escalatedAt: new Date().toISOString(),
              escalatedTo: recipientEmail,
            }
          : issue
      ),
    }));
    const runId = get().issues.find(i => i.id === issueId)?.runId ?? get().currentRun?.id;
    if (runId) {
      logService.info(`Issue eskaliert an ${recipientEmail}`, { runId, step: 'Issues', details: `issueId=${issueId}` });
      get().addAuditEntry({ runId, action: 'escalateIssue', details: `issueId=${issueId}, to=${recipientEmail}`, userId: 'system' });
    }
  },

  deleteRun: (runId) => {
    logService.info('Run gelöscht', { runId, step: 'System' });
    archiveService.deleteArchivedRun(runId);
    set((state) => ({
      runs: state.runs.filter((r) => r.id !== runId),
      currentRun: state.currentRun?.id === runId ? null : state.currentRun,
      invoiceLines: state.invoiceLines.filter(l => !l.lineId.startsWith(runId)),
      issues: state.issues.filter(i => i.runId !== runId),
    }));
  },

  setBookingDate: (runId, date) => {
    const { runs, currentRun } = get();
    const targetRun = runs.find(r => r.id === runId);
    if (!targetRun) return null;
    // Einmaliges Setzen: nur wenn noch nicht vorhanden
    if (targetRun.stats.bookingDate) return targetRun;

    const updatedStats = { ...targetRun.stats, bookingDate: date };
    const updatedRun = { ...targetRun, stats: updatedStats };

    set({
      runs: runs.map(r => r.id === runId ? updatedRun : r),
      currentRun: currentRun?.id === runId
        ? { ...currentRun, stats: updatedStats }
        : currentRun,
    });

    return updatedRun;
  },

  incrementExportVersion: (runId) => {
    const { runs, currentRun } = get();
    const targetRun = runs.find(r => r.id === runId);
    if (!targetRun) return null;

    const newVersion = (targetRun.stats.exportVersion ?? 0) + 1;
    const updatedStats = { ...targetRun.stats, exportVersion: newVersion };
    const updatedRun = { ...targetRun, stats: updatedStats };

    set({
      runs: runs.map(r => r.id === runId ? updatedRun : r),
      currentRun: currentRun?.id === runId
        ? { ...currentRun, stats: updatedStats }
        : currentRun,
    });

    return updatedRun;
  },

  addAuditEntry: (entry) => set((state) => ({
    auditLog: [
      {
        ...entry,
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
      },
      ...state.auditLog,
    ],
  })),

  // PROJ-46 AP4c / R8 — Cross-Slice-Channel für currentParsedRunId.
  // Primärwriter-Regel: `currentParsedRunId` lebt in runCrudSlice (Identitäts-Feld).
  // ingestSlice (parseInvoiceForIngest / setParsedInvoiceResult) darf das Feld
  // NICHT direkt per set() schreiben, sondern ruft diese Action über get().
  // Kein verdeckter Zusatz-Effekt — 1:1-Ersatz für `set({ currentParsedRunId })`.
  assignParsedRunId: (runId) => set({ currentParsedRunId: runId }),
});
