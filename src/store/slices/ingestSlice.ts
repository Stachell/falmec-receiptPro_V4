// slices/ingestSlice.ts — PROJ-46 AP4c (Slice-Split)
// 1:1-Umzug aus runStore.ts — Mechaniker-Kontrakt, keine Logik-Änderungen.
// Ownership: Phase 1 — uploadedFiles, parsedInvoiceResult, parsedPositions,
// parserWarnings, serialDocument, preFilteredSerials, orderPool.
// Primärwriter (ownership.md): parseInvoiceForIngest, ingestAndPersistRunData.
//
// ── INVARIANTE: FileSnapshot-Kopier-Semantik (PROJ-46 AP4c Schritt 3 Härtung) ──
// Die drei Phase-1-Bridge-Actions
//   parseInvoiceForIngest(runId, fileSnapshot)
//   ingestAndPersistRunData(runId, fileSnapshot)
//   startWorkflowPhase2(runId)   ← lädt aus IDB, braucht kein Snapshot
// dürfen AUSSCHLIESSLICH ihren fileSnapshot-Parameter (bzw. im Fall von
// startWorkflowPhase2: die persistierte IDB-Kopie) lesen — NIEMALS
// `state.uploadedFiles` / `get().uploadedFiles`. Grund: `createRunSkeleton()`
// ruft `resetRunSensitiveState(get, set)` → `uploadedFiles` ist danach LEER.
// Der Aufrufer (pages/NewRun.tsx) erstellt den Snapshot deshalb VOR
// `createRunSkeleton()`. Dieses Kontrakt ist aus runStore.ts unverändert
// übernommen und wird durch die Dokumentation an jeder Action-Signatur
// geschützt. Grep-Check: außerhalb von `addUploadedFile`/`removeUploadedFile`
// existieren in dieser Datei keine `state.uploadedFiles`-Zugriffe.

import type { StateCreator } from 'zustand';
import type {
  Run,
  ParsedInvoiceLineExtended,
  InvoiceParserWarning,
  ArticleMaster,
  ParsedOrderPosition,
} from '@/types';
import type { RunState, FileSnapshot, IngestResult } from '@/store/types';
import { useMasterDataStore } from '@/store/masterDataStore';
import { parseMasterDataFile } from '@/services/masterDataParser';
import { logService } from '@/services/logService';
import { fileStorageService } from '@/services/fileStorageService';
import {
  parseInvoicePDF,
  generateRunId,
} from '@/services/invoiceParserService';
import { getParsingTimeoutMs } from '@/services/parsers/config';
import {
  runPersistenceService,
  type PersistedRunData,
} from '@/services/runPersistenceService';
import { DEFAULT_ORDER_PARSER_PROFILE_ID } from '@/services/matching/orderParserProfiles';
import type { SerialDocument, SerialDocumentRow } from '@/services/matchers/types';
import { buildAutoSavePayload } from '@/hooks/buildAutoSavePayload';
import type { UploadedFile } from '@/types';
import {
  loadParsedInvoice,
  saveParsedInvoice,
  savePersistedFiles,
  resetRunSensitiveState,
  UPLOADED_FILES_KEY,
} from '@/store/internal/helpers';

export type IngestSlice = Pick<
  RunState,
  | 'uploadedFiles'
  | 'parsedInvoiceResult'
  | 'parsedPositions'
  | 'parserWarnings'
  | 'serialDocument'
  | 'preFilteredSerials'
  | 'orderPool'
  | 'addUploadedFile'
  | 'removeUploadedFile'
  | 'clearUploadedFiles'
  | 'loadStoredFiles'
  | 'parseInvoice'
  | 'setParsedInvoiceResult'
  | 'clearParsedInvoice'
  | 'setParsingProgress'
  | 'createRunSkeleton'
  | 'parseInvoiceForIngest'
  | 'ingestAndPersistRunData'
  | 'startWorkflowPhase2'
  | 'cleanupFailedIngest'
>;

export const createIngestSlice: StateCreator<RunState, [], [], IngestSlice> = (set, get) => ({
  uploadedFiles: [],
  parsedInvoiceResult: loadParsedInvoice(),
  parsedPositions: [],
  parserWarnings: [],
  serialDocument: null,
  preFilteredSerials: [],
  orderPool: null,

  addUploadedFile: (file) => {
    // Add uploadedAt timestamp if not present
    const fileWithTimestamp: UploadedFile = {
      ...file,
      uploadedAt: file.uploadedAt || new Date().toISOString(),
    };

    // Clear old parsed invoice data when a new invoice is uploaded
    if (file.type === 'invoice') {
      console.log('[RunStore] New invoice uploaded, clearing cached parse results');
      get().clearParsedInvoice();
    }

    // Parse articleList immediately on upload → persist to masterDataStore
    if (file.type === 'articleList' && fileWithTimestamp.file) {
      const artNoDeRegexStr1 = get().globalConfig?.matcherProfileOverrides?.artNoDeRegex;
      const artNoDeRegexParsed1 = artNoDeRegexStr1
        ? (() => { try { return new RegExp(artNoDeRegexStr1); } catch { return undefined; } })()
        : undefined;
      parseMasterDataFile(fileWithTimestamp.file, { artNoDeRegex: artNoDeRegexParsed1 })
        .then((result) => {
          useMasterDataStore.getState().save(result.articles, fileWithTimestamp.name);
          logService.info(
            `Stammdaten importiert: ${result.rowCount} Artikel aus '${fileWithTimestamp.name}'`,
            { step: 'Stammdaten' },
          );
          if (result.warnings.length > 0) {
            for (const w of result.warnings) {
              logService.warn(`[Stammdaten] ${w}`, { step: 'Stammdaten' });
            }
          }
        })
        .catch((err) => {
          console.error('[RunStore] masterDataParser failed:', err);
          logService.error(
            `Stammdaten-Import fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
            { step: 'Stammdaten' },
          );
        });
    }

    // PROJ-20: Pre-filter serial Excel immediately on upload (Memory only, no localStorage)
    if (file.type === 'serialList' && fileWithTimestamp.file) {
      import('@/services/serialFinder').then(({ preFilterSerialExcel }) => {
        preFilterSerialExcel(fileWithTimestamp.file!)
          .then((result) => {
            const serialDocRows: SerialDocumentRow[] = result.filteredRows.map(row => ({
              rowIndex: row.sourceRowIndex,
              invoiceRef: row.invoiceReference.replace(/\D/g, '').slice(-5),
              serialRaw: row.serialNumber,
              serialCandidate: row.serialNumber,
              consumed: false,
            }));
            const serialDoc: SerialDocument = {
              rows: serialDocRows,
              fileName: fileWithTimestamp.name,
              columnMapping: {},
            };
            set({ preFilteredSerials: result.filteredRows, serialDocument: serialDoc });
            logService.info(
              `S/N Pre-Filter: ${result.regexMatchCount}/${result.totalRowsScanned} Zeilen mit gültigem S/N`,
              { runId: get().currentRun?.id, step: 'Seriennummer anfuegen' },
            );
            for (const w of result.warnings) {
              logService.warn(`[SerialFinder] ${w}`, { runId: get().currentRun?.id, step: 'Seriennummer anfuegen' });
            }
          })
          .catch((err) => {
            console.error('[RunStore] serialFinder preFilter failed:', err);
            logService.error(
              `S/N Pre-Filter fehlgeschlagen: ${err instanceof Error ? err.message : err}`,
              { runId: get().currentRun?.id, step: 'Seriennummer anfuegen' },
            );
          });
      });
    }

    // Save to IndexedDB (async, fire and forget)
    if (fileStorageService.isAvailable()) {
      fileStorageService.saveFile(fileWithTimestamp).catch((error) => {
        console.error('[RunStore] Failed to save file to IndexedDB:', error);
      });
    }

    set((state) => {
      const newFiles = [
        ...state.uploadedFiles.filter(f => f.type !== file.type),
        fileWithTimestamp
      ];
      // Persist metadata to localStorage
      savePersistedFiles(newFiles);
      return { uploadedFiles: newFiles };
    });
  },

  removeUploadedFile: (type) => {
    // Remove from IndexedDB (async, fire and forget)
    if (fileStorageService.isAvailable()) {
      fileStorageService.removeFile(type).catch((error) => {
        console.error('[RunStore] Failed to remove file from IndexedDB:', error);
      });
    }

    set((state) => {
      const newFiles = state.uploadedFiles.filter(f => f.type !== type);
      savePersistedFiles(newFiles);
      return { uploadedFiles: newFiles };
    });
  },

  clearUploadedFiles: () => {
    // Clear IndexedDB (async, fire and forget)
    if (fileStorageService.isAvailable()) {
      fileStorageService.clearAllFiles().catch((error) => {
        console.error('[RunStore] Failed to clear files from IndexedDB:', error);
      });
    }

    localStorage.removeItem(UPLOADED_FILES_KEY);
    set({ uploadedFiles: [] });
  },

  loadStoredFiles: async () => {
    if (!fileStorageService.isAvailable()) {
      console.warn('[RunStore] IndexedDB not available, cannot load stored files');
      return;
    }

    try {
      const storedFiles = await fileStorageService.loadAllFiles();
      if (storedFiles.length > 0) {
        console.debug('[RunStore] Loaded', storedFiles.length, 'files from IndexedDB');
        set({ uploadedFiles: storedFiles });
        // Also update localStorage metadata
        savePersistedFiles(storedFiles);
      }
    } catch (error) {
      console.error('[RunStore] Failed to load stored files:', error);
    }
  },

  createRunSkeleton: async () => {
    // Tabula Rasa: alle run-sensitiven Felder leeren, Timer killen
    resetRunSensitiveState(get, set);

    const { globalConfig } = get();
    const tempRunId = `run-${Date.now()}`;

    const newRun: Run = {
      id: tempRunId,
      createdAt: new Date().toISOString(),
      status: 'running',
      config: globalConfig,
      invoice: {
        fattura: 'PARSING...',
        invoiceDate: new Date().toISOString().split('T')[0],
        deliveryDate: null,
      },
      stats: {
        parsedInvoiceLines: 0, matchedOrders: 0, notOrderedCount: 0, serialMatchedCount: 0,
        mismatchedGroupsCount: 0, articleMatchedCount: 0, inactiveArticlesCount: 0,
        priceOkCount: 0, priceMismatchCount: 0, exportReady: false, expandedLineCount: 0,
        fullMatchCount: 0, codeItOnlyCount: 0, eanOnlyCount: 0, noMatchCount: 0,
        serialRequiredCount: 0, priceMissingCount: 0, priceCustomCount: 0,
        manualOkOrderCount: 0, perfectMatchCount: 0, referenceMatchCount: 0,
        smartQtyMatchCount: 0, fifoFallbackCount: 0,
      },
      steps: [
        { stepNo: 1, name: 'Rechnung auslesen', status: 'running', issuesCount: 0 },
        { stepNo: 2, name: 'Artikel extrahieren', status: 'not-started', issuesCount: 0 },
        { stepNo: 3, name: 'Seriennummer anfügen', status: 'not-started', issuesCount: 0 },
        { stepNo: 4, name: 'Bestellungen mappen', status: 'not-started', issuesCount: 0 },
        { stepNo: 5, name: 'Export', status: 'not-started', issuesCount: 0 },
      ],
      isExpanded: false,
      orphanSerials: [],
    };

    set((state) => ({
      runs: [newRun, ...state.runs],
      currentRun: newRun,
      isProcessing: true,
      parsingProgress: 'Initialisiere...',
    }));

    logService.startRunLogging(tempRunId);
    logService.info('SSOT-Ingest gestartet', {
      runId: tempRunId,
      step: 'System',
      details: `Config: ${JSON.stringify(globalConfig)}`,
    });

    return tempRunId;
  },

  /**
   * Schritt 1: PDF parsen, Run-ID finalisieren.
   * Input: fileSnapshot — NICHT aus state.uploadedFiles lesen (leer nach resetRunSensitiveState)!
   * autoAdvance=false unterdrückt den 500ms-Timer in updateRunWithParsedData.
   * Gibt finalRunId zurück (nach Rename aus Rechnungsnummer).
   */
  parseInvoiceForIngest: async (runId, fileSnapshot) => {
    if (!fileSnapshot.invoice?.file) {
      throw new Error('Keine Rechnung hochgeladen (PDF fehlt)');
    }

    set({ parsingProgress: 'Lese PDF...' });

    const result = await parseInvoicePDF(fileSnapshot.invoice.file, runId);

    // setParsedInvoiceResult setzt parsedPositions, parserWarnings UND currentParsedRunId
    get().setParsedInvoiceResult(result);

    // updateRunWithParsedData: autoAdvance=false — kein 500ms-Timer für Phase 2!
    get().updateRunWithParsedData(runId, result, false);

    // ID-Rename: temp-ID → Rechnungsnummer-ID
    let finalRunId = runId;
    if (result.header.fatturaNumber) {
      const newRunId = generateRunId(result.header.fatturaNumber);
      // PROJ-46 M4 AP6: Atomarer Rename via runCrudSlice.renameRun — ID-Migration
      // (runs, currentRun, invoiceLines, issues, auditLog, currentParsedRunId,
      // log-buffer) in EINEM set() + IDB-Ghost-Cleanup. R8 gewahrt.
      get().renameRun(runId, newRunId);
      finalRunId = newRunId;
    }

    logService.info(`[Phase1] PDF geparst: ${result.lines.length} Positionen, finalRunId=${finalRunId}`, {
      runId: finalRunId,
      step: 'Rechnung auslesen',
    });
    return finalRunId;
  },

  /**
   * Schritt 2-4: Alle Quellen parsen, validieren, in IDB persistieren.
   * Input: fileSnapshot — NICHT aus state.uploadedFiles lesen!
   * Schreibt ingestStatus, parsedArticlePool, parsedOrderPool direkt in IDB via saveRun().
   * Bei allReady=false: cleanupFailedIngest() aufrufen!
   */
  ingestAndPersistRunData: async (runId, fileSnapshot) => {
    const failedSources: string[] = [];

    // Step 0: uploadMetadata aus fileSnapshot aufbauen (run-spezifisch, nicht aus Store)
    const uploadMetadata = (Object.values(fileSnapshot) as (typeof fileSnapshot[keyof typeof fileSnapshot])[])
      .filter((f): f is NonNullable<typeof f> => f !== undefined)
      .map(f => ({ type: f.type as PersistedRunData['uploadMetadata'][0]['type'], name: f.name, size: f.size, uploadedAt: f.uploadedAt }));

    // Hilfsfunktion: Snapshot inkl. SSOT-Felder direkt in IDB schreiben
    const saveIngestSnapshot = async (
      ingestStatus: NonNullable<PersistedRunData['ingestStatus']>,
      parsedArticlePool?: ArticleMaster[],
      parsedOrderPool?: ParsedOrderPosition[],
    ): Promise<void> => {
      const payload = buildAutoSavePayload(runId);
      if (!payload) return;
      await runPersistenceService.saveRun({
        ...payload,
        uploadMetadata,
        ingestStatus,
        ...(parsedArticlePool !== undefined ? { parsedArticlePool } : {}),
        ...(parsedOrderPool !== undefined ? { parsedOrderPool } : {}),
      }).catch(err => logService.error(`[Phase1] saveRun fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId: payload.id, step: 'System' }));
    };

    // Step 1: PDF validieren (bereits durch parseInvoiceForIngest in State)
    const { parsedInvoiceResult } = get();
    let pdfStatus: 'ready' | 'invalid' = 'invalid';

    if (parsedInvoiceResult && parsedInvoiceResult.header.fatturaNumber && parsedInvoiceResult.header.packagesCount != null) {
      pdfStatus = 'ready';
      logService.info('[Phase1] PDF ready', { runId, step: 'Rechnung auslesen' });
    } else {
      failedSources.push('PDF-Rechnung (fehlende Pflichtfelder: Rechnungsnummer / Anzahl Pakete)');
      logService.error('[Phase1] PDF invalid: Pflichtfelder fehlen', { runId, step: 'Rechnung auslesen' });
    }

    await saveIngestSnapshot({ pdf: pdfStatus, articleList: 'pending', serialList: 'pending', openWE: 'pending' });

    if (pdfStatus === 'invalid') {
      set({ isProcessing: false, parsingProgress: '' });
      return { allReady: false, failedSources };
    }

    // Step 2: Artikelliste parsen + validieren (Pflicht)
    set({ parsingProgress: 'Stammdaten validieren...' });
    let articleStatus: 'ready' | 'invalid' = 'invalid';
    let parsedArticlePool: ArticleMaster[] | undefined;

    if (!fileSnapshot.articleList?.file) {
      failedSources.push('Artikelliste (Pflichtfeld — nicht hochgeladen)');
      logService.error('[Phase1] Artikelliste fehlt (Pflichtfeld)', { runId, step: 'System' });
    } else {
      try {
        const artNoDeRegexStr = get().globalConfig?.matcherProfileOverrides?.artNoDeRegex;
        const artNoDeRegex = artNoDeRegexStr
          ? (() => { try { return new RegExp(artNoDeRegexStr); } catch { return undefined; } })()
          : undefined;
        const result = await parseMasterDataFile(fileSnapshot.articleList.file, { artNoDeRegex });
        // Hard-Fail bei fehlenden Pflichtspalten (Parser liefert missingRequiredFields)
        if (result.missingRequiredFields.length > 0) {
          const missing = result.missingRequiredFields.map(fid => {
            const labels: Record<string, string> = { artNoDE: 'Artikelnummer', storageLocation: 'Lagerort/Hauptlager', supplierId: 'Lieferant' };
            return labels[fid] ?? fid;
          }).join(', ');
          failedSources.push(
            `Artikelliste ungueltig: Pflichtspalten fehlen (${missing}) in '${fileSnapshot.articleList.name}'. Pruefe Spaltennamen oder Aliase in den Einstellungen.`
          );
          logService.error(`[Phase1] Artikelliste invalid: Pflichtspalten fehlen (${result.missingRequiredFields.join(', ')})`, { runId, step: 'System' });
        } else {
          const validRows = result.articles.filter(a => a.falmecArticleNo && a.storageLocation && a.supplierId != null);
          if (validRows.length > 0) {
            articleStatus = 'ready';
            parsedArticlePool = result.articles;
            await useMasterDataStore.getState().save(result.articles, fileSnapshot.articleList.name);
            logService.info(
              `[Phase1] Artikelliste ready: ${result.rowCount} Artikel, ${validRows.length} valide`,
              { runId, step: 'System' },
            );
          } else {
            failedSources.push(
              `Artikelliste ungueltig: Keine Zeile mit gueltigem Wert fuer Artikelnummer, Hauptlager und Lieferant in '${fileSnapshot.articleList.name}'. Pruefe Spaltennamen oder Aliase in den Einstellungen.`
            );
            logService.error('[Phase1] Artikelliste invalid: keine valide Zeile (falmecArticleNo + storageLocation + supplierId)', { runId, step: 'System' });
          }
        }
      } catch (err) {
        failedSources.push(`Artikelliste (Parse-Fehler: ${err instanceof Error ? err.message : err})`);
        logService.error(`[Phase1] Artikelliste Parse-Fehler: ${err instanceof Error ? err.message : err}`, { runId, step: 'System' });
      }
    }

    await saveIngestSnapshot({ pdf: pdfStatus, articleList: articleStatus, serialList: 'pending', openWE: 'pending' }, parsedArticlePool);

    if (articleStatus === 'invalid') {
      set({ isProcessing: false, parsingProgress: '' });
      return { allReady: false, failedSources };
    }

    // Step 3: Serialliste parsen (optional)
    set({ parsingProgress: 'Seriennummernliste validieren...' });
    let serialStatus: 'ready' | 'not_provided' | 'invalid' = 'not_provided';

    if (!fileSnapshot.serialList?.file) {
      serialStatus = 'not_provided';
      logService.info('[Phase1] Serialliste not_provided (optional)', { runId, step: 'System' });
    } else {
      try {
        const { preFilterSerialExcel } = await import('@/services/serialFinder');
        const serialResult = await preFilterSerialExcel(fileSnapshot.serialList.file);
        // 0 Zeilen ist valid (leere Serialliste) — kein Hard-Fail
        serialStatus = 'ready';
        const serialDocRows: SerialDocumentRow[] = serialResult.filteredRows.map(row => ({
          rowIndex: row.sourceRowIndex,
          invoiceRef: row.invoiceReference.replace(/\D/g, '').slice(-5),
          serialRaw: row.serialNumber,
          serialCandidate: row.serialNumber,
          consumed: false,
        }));
        const serialDoc: SerialDocument = serialResult.filteredRows.length > 0
          ? { rows: serialDocRows, fileName: fileSnapshot.serialList.name, columnMapping: {} }
          : null;
        set({ preFilteredSerials: serialResult.filteredRows, serialDocument: serialDoc });
        logService.info(
          `[Phase1] Serialliste ready: ${serialResult.filteredRows.length} Zeilen nach Pre-Filter`,
          { runId, step: 'System' },
        );
      } catch (err) {
        serialStatus = 'invalid';
        failedSources.push(`Serialliste (Parse-Fehler: ${err instanceof Error ? err.message : err})`);
        logService.error(`[Phase1] Serialliste Parse-Fehler: ${err instanceof Error ? err.message : err}`, { runId, step: 'System' });
      }
    }

    await saveIngestSnapshot({ pdf: pdfStatus, articleList: articleStatus, serialList: serialStatus, openWE: 'pending' }, parsedArticlePool);

    if (serialStatus === 'invalid') {
      set({ isProcessing: false, parsingProgress: '' });
      return { allReady: false, failedSources };
    }

    // Step 4: openWE parsen (PFLICHT — ERP-Vorbeleg)
    set({ parsingProgress: 'Bestelldaten validieren...' });
    let openWEStatus: 'ready' | 'invalid' = 'invalid';
    let parsedOrderPool: ParsedOrderPosition[] | undefined;

    if (!fileSnapshot.openWE?.file) {
      failedSources.push('Offene Wareneingaenge (Pflichtfeld — nicht hochgeladen)');
      logService.error('[Phase1] openWE fehlt (Pflichtfeld)', { runId, step: 'System' });
    } else {
      try {
        const { parseOrderFile } = await import('@/services/matching/orderParser');
        const runConfig = get().currentRun?.config ?? get().globalConfig;
        const parseResult = await parseOrderFile(fileSnapshot.openWE.file, {
          profileId: runConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
          overrides: runConfig.orderParserProfileOverrides,
        });
        if (parseResult.validationError) {
          openWEStatus = 'invalid';
          failedSources.push(`openWE-Bestellliste (Validierungsfehler: ${parseResult.validationError})`);
          logService.error(`[Phase1] openWE invalid: ${parseResult.validationError}`, { runId, step: 'System' });
        } else {
          openWEStatus = 'ready';
          parsedOrderPool = parseResult.positions;
          logService.info(
            `[Phase1] openWE ready: ${parseResult.positions.length} Positionen`,
            { runId, step: 'System' },
          );
        }
      } catch (err) {
        openWEStatus = 'invalid';
        failedSources.push(`openWE-Bestellliste (Parse-Fehler: ${err instanceof Error ? err.message : err})`);
        logService.error(`[Phase1] openWE Parse-Fehler: ${err instanceof Error ? err.message : err}`, { runId, step: 'System' });
      }
    }

    const finalIngestStatus = { pdf: pdfStatus, articleList: articleStatus, serialList: serialStatus, openWE: openWEStatus };
    await saveIngestSnapshot(finalIngestStatus, parsedArticlePool, parsedOrderPool);

    if (openWEStatus === 'invalid') {
      set({ isProcessing: false, parsingProgress: '' });
      return { allReady: false, failedSources };
    }

    set({ isProcessing: false, parsingProgress: '' });
    logService.info(
      `[Phase1] Ingest vollständig: ${JSON.stringify(finalIngestStatus)}`,
      { runId, step: 'System' },
    );

    return { allReady: true, failedSources };
  },

  /**
   * Schritt 5: Phase 2 starten (NUR nach erfolgreichem Phase-1-Ingest).
   * Lädt den vollständigen Run-Snapshot aus IDB, prüft defensiv, startet Engine.
   * WIRD NICHT von reprocessCurrentRun() verwendet — eigener Pfad.
   */
  startWorkflowPhase2: async (runId) => {
    // Phase 8 (PROJ-44-R12): autoAdvanceTimer entfernt
    // Transiente Waiting-States räumen
    set({
      isWaitingBeforeStep4: false,
      waitingStep4RunId: null,
      showStep4WaitingDialog: false,
      isPaused: false,
      latestDiagnostics: {},
    });

    // 3. Aus IDB laden — Phase 1 hat korrekten Zustand persistiert
    const loaded = await get().loadPersistedRun(runId);
    if (!loaded) {
      logService.error(`[startWorkflowPhase2] loadPersistedRun fehlgeschlagen für ${runId}`, { step: 'System' });
      throw new Error(`[startWorkflowPhase2] Run ${runId} konnte nicht aus IDB geladen werden`);
    }

    // 4. Defensiv-Prüfung: Step 1 muss ok/soft-fail sein, Steps 2-5 nicht-started
    const currentRun = get().runs.find(r => r.id === runId);
    if (!currentRun) {
      throw new Error(`[startWorkflowPhase2] Run ${runId} nach loadPersistedRun nicht im Store`);
    }
    const step1 = currentRun.steps.find(s => s.stepNo === 1);
    if (!step1 || (step1.status !== 'ok' && step1.status !== 'soft-fail')) {
      logService.error(
        `[startWorkflowPhase2] Integritätsfehler: Step 1 Status='${step1?.status ?? 'unbekannt'}' — erwartet ok/soft-fail`,
        { runId, step: 'System' },
      );
      throw new Error(`[startWorkflowPhase2] Integritätsfehler: Step 1 hat Status '${step1?.status}'`);
    }

    // 5. Engine starten — findet Step 2 als nächsten not-started Step
    logService.info('[startWorkflowPhase2] Phase 2 gestartet', { runId, step: 'System' });
    get().advanceToNextStep(runId);
  },

  /**
   * Hard-Fail-Cleanup: Run restlos aus Store + IDB entfernen.
   * NICHT deleteRun() verwenden — das würde Archiv mit gleicher Rechnungsnummer löschen!
   * Bei IDB-Fehler: Ghost-Run bleibt in IDB, aber loadPersistedRun() (Änderung 14b) blockiert ihn.
   */
  cleanupFailedIngest: async (runId) => {
    // 1. Run-sensitive globale Felder leeren (inkl. Timer)
    resetRunSensitiveState(get, set);

    // 2. auditLog + Run + invoiceLines + issues aus In-Memory-Store entfernen
    //    NICHT deleteRun() — das würde archiveService.deleteArchivedRun(runId) aufrufen!
    const linePrefix = `${runId}-line-`;
    set(state => ({
      auditLog:     state.auditLog.filter(a => a.runId !== runId),
      runs:         state.runs.filter(r => r.id !== runId),
      currentRun:   state.currentRun?.id === runId ? null : state.currentRun,
      invoiceLines: state.invoiceLines.filter(l => !l.lineId.startsWith(linePrefix)),
      issues:       state.issues.filter(i => i.runId !== runId),
    }));

    // 3. Run-Log-Buffer + localStorage löschen
    //    NACH set() — set() selbst könnte noch Einträge erzeugen
    //    WICHTIG: runId NICHT als options.runId übergeben — erzeugt sonst neuen Log-Rest
    logService.clearRunLog(runId);

    // 4. IDB-Löschung mit Retry (IDB-Fehler sind oft transient)
    set({ isProcessing: false, parsingProgress: '' });
    let idbDeleted = await get().deletePersistedRun(runId);

    if (!idbDeleted) {
      await new Promise(r => setTimeout(r, 500));
      idbDeleted = await get().deletePersistedRun(runId);
    }

    if (!idbDeleted) {
      // Endgültiger Fehlschlag — Ghost-Run-Verteidigung (Änderung 14b blockt Laden)
      // KEIN { runId } in den Options — sonst wird localStorage falmec-run-log-{runId} neu angelegt!
      logService.error(`[cleanupFailedIngest] IDB-Löschung nach Retry fehlgeschlagen für Run ${runId} — Ghost-Run möglich`);
      // persistedRunSummaries defensiv bereinigen (damit Ghost-Run nicht in Session-Liste erscheint)
      set(state => ({
        persistedRunSummaries: state.persistedRunSummaries.filter(s => s.id !== runId),
      }));
    }
  },

  // Parse invoice from uploaded file with timeout
  parseInvoice: async (runId: string) => {
    const { uploadedFiles, setParsedInvoiceResult, setParsingProgress } = get();

    const invoiceFile = uploadedFiles.find(f => f.type === 'invoice');
    if (!invoiceFile?.file) {
      logService.error('Keine Invoice-PDF-Datei gefunden', {
        runId,
        step: 'Rechnung auslesen',
      });
      setParsedInvoiceResult({
        success: false,
        header: {
          fatturaNumber: '',
          fatturaDate: '',
          packagesCount: null,
          totalQty: 0,
          parsedPositionsCount: 0,
          qtyValidationStatus: 'unknown',
        },
        lines: [],
        warnings: [{
          code: 'NO_INVOICE_FILE',
          message: 'Keine Invoice-PDF-Datei gefunden',
          severity: 'error',
        }],
        parserModule: 'workflow',
        parsedAt: new Date().toISOString(),
        sourceFileName: '',
      });
      return false;
    }

    const PARSING_TIMEOUT_MS = getParsingTimeoutMs();
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    try {
      setParsingProgress('Extrahiere Text aus PDF...');

      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`PDF-Parsing Timeout nach ${PARSING_TIMEOUT_MS / 1000} Sekunden`));
        }, PARSING_TIMEOUT_MS);
      });

      // Race between parsing and timeout
      const result = await Promise.race([
        parseInvoicePDF(invoiceFile.file, runId),
        timeoutPromise,
      ]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      setParsingProgress('Verarbeite Daten...');

      setParsedInvoiceResult(result);

      if (result.success) {
        logService.info(`PDF erfolgreich geparst: ${result.lines.length} Positionen`, {
          runId,
          step: 'Rechnung auslesen',
          details: `Fattura: ${result.header.fatturaNumber}`,
        });
        // PROJ-28: Step 1 diagnostics
        get().setStepDiagnostics(1, {
          stepNo: 1,
          moduleName: result.parserModule ?? 'FatturaParser',
          confidence: 'high',
          summary: `${result.lines.length} Positionen aus ${result.header.fatturaNumber || 'n/a'}`,
          timestamp: new Date().toISOString(),
        });
        setParsingProgress('Parsing abgeschlossen');
        return true;
      } else {
        logService.warn('PDF-Parsing mit Fehlern abgeschlossen', {
          runId,
          step: 'Rechnung auslesen',
          details: `${result.warnings.filter(w => w.severity === 'error').length} Fehler`,
        });
        // PROJ-28: Step 1 diagnostics (partial success)
        get().setStepDiagnostics(1, {
          stepNo: 1,
          moduleName: result.parserModule ?? 'FatturaParser',
          confidence: 'low',
          summary: `${result.lines.length} Positionen (mit Fehlern)`,
          detailLines: result.warnings.filter(w => w.severity === 'error').map(w => w.message),
          timestamp: new Date().toISOString(),
        });
        setParsingProgress('Parsing mit Warnungen abgeschlossen');
        // Return true if we at least got partial data (fattura number)
        return result.header.fatturaNumber !== '';
      }
    } catch (error) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      logService.error(`PDF-Parsing fehlgeschlagen: ${errorMessage}`, {
        runId,
        step: 'Rechnung auslesen',
      });
      setParsedInvoiceResult({
        success: false,
        header: {
          fatturaNumber: '',
          fatturaDate: '',
          packagesCount: null,
          totalQty: 0,
          parsedPositionsCount: 0,
          qtyValidationStatus: 'unknown',
        },
        lines: [],
        warnings: [{
          code: 'PARSE_EXCEPTION',
          message: errorMessage,
          severity: 'error',
        }],
        parserModule: 'workflow',
        parsedAt: new Date().toISOString(),
        sourceFileName: invoiceFile.file.name,
      });
      setParsingProgress(`Parsing fehlgeschlagen: ${errorMessage}`);
      return false;
    }
  },

  // Set parsed invoice result
  setParsedInvoiceResult: (result) => {
    saveParsedInvoice(result);

    if (result) {
      // Convert to extended positions for preview
      const positions: ParsedInvoiceLineExtended[] = result.lines.map(line => ({
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

      // Convert warnings
      const warnings: InvoiceParserWarning[] = result.warnings.map(w => ({
        code: w.code,
        message: w.message,
        severity: w.severity,
        positionIndex: w.positionIndex,
      }));

      set({
        parsedInvoiceResult: result,
        parsedPositions: positions,
        parserWarnings: warnings,
      });
      // PROJ-46 AP4c / R8: Cross-Slice-Channel für currentParsedRunId
      // (Primärwriter = runCrudSlice). PROJ-40 6A: Run-Isolierung.
      get().assignParsedRunId(get().currentRun?.id ?? null);
    } else {
      set({
        parsedInvoiceResult: null,
        parsedPositions: [],
        parserWarnings: [],
      });
    }
  },

  // Clear parsed invoice data
  clearParsedInvoice: () => {
    saveParsedInvoice(null);
    set({
      parsedInvoiceResult: null,
      parsedPositions: [],
      parserWarnings: [],
    });
  },

  // Set parsing progress message
  setParsingProgress: (progress) => set({ parsingProgress: progress }),
});

// NOTE: FileSnapshot-Kopier-Semantik (startWorkflowPhase2 / parseInvoiceForIngest /
// ingestAndPersistRunData): Der fileSnapshot wird 1:1 aus dem Aufrufer-Kontext
// übernommen und NICHT aus state.uploadedFiles neu ermittelt — nach
// resetRunSensitiveState() ist state.uploadedFiles leer. Diese Semantik ist
// unverändert aus runStore.ts übernommen und MUSS erhalten bleiben.

// Unused import guard — type `IngestResult` + `FileSnapshot` sind im öffentlichen
// Signatur-Kontrakt des Aggregators `runStore.ts` (via RunState.Pick) bereits
// verwurzelt. Reines Re-Deklarieren hier nicht nötig.
export type { FileSnapshot, IngestResult };
