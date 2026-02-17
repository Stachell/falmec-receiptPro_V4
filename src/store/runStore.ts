import { create } from 'zustand';
import {
  Run,
  InvoiceLine,
  Issue,
  UploadedFile,
  RunConfig,
  AuditLogEntry,
  StepStatus,
  ParsedInvoiceLineExtended,
  InvoiceParserWarning,
  ArticleMaster,
  OpenWEPosition,
  RunStats,
} from '@/types';
import {
  mockRuns,
  mockIssues,
  mockAuditLog
} from '@/data/mockData';
import { logService } from '@/services/logService';
import { archiveService } from '@/services/archiveService';
import { fileStorageService } from '@/services/fileStorageService';
import {
  parseInvoicePDF,
  convertToInvoiceLines,
  expandInvoiceLines,
  convertToInvoiceHeader,
  generateRunId,
  type ParsedInvoiceResult,
} from '@/services/invoiceParserService';
import { getParsingTimeoutMs } from '@/services/parsers/config';
import type { ParserWarning } from '@/services/parsers/types';
import { matchAllArticles } from '@/services/matching/ArticleMatcher';
import { matchAllOrders } from '@/services/matching/OrderMatcher';

// LocalStorage key for persisting uploaded files metadata
const UPLOADED_FILES_KEY = 'falmec-uploaded-files';

// LocalStorage key for persisting parsed invoice data
const PARSED_INVOICE_KEY = 'falmec-parsed-invoice';

// Interface for persisted file metadata (without actual File object)
interface PersistedFileInfo {
  name: string;
  size: number;
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList';
  uploadedAt: string;
}

// Load persisted files from localStorage
function loadPersistedFiles(): PersistedFileInfo[] {
  try {
    const data = localStorage.getItem(UPLOADED_FILES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Save files metadata to localStorage
function savePersistedFiles(files: UploadedFile[]): void {
  const persistedFiles: PersistedFileInfo[] = files.map(f => ({
    name: f.name,
    size: f.size,
    type: f.type,
    uploadedAt: f.uploadedAt,
  }));
  try {
    localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(persistedFiles));
  } catch (error) {
    console.warn('[RunStore] Failed to persist uploaded files metadata:', error);
  }
}

// Persist parsed invoice result (without File objects)
function saveParsedInvoice(result: ParsedInvoiceResult | null): void {
  try {
    if (result) {
      localStorage.setItem(PARSED_INVOICE_KEY, JSON.stringify(result));
    } else {
      localStorage.removeItem(PARSED_INVOICE_KEY);
    }
  } catch (error) {
    console.warn('[RunStore] Failed to persist parsed invoice result:', error);
  }
}

// Load persisted parsed invoice
function loadParsedInvoice(): ParsedInvoiceResult | null {
  try {
    const data = localStorage.getItem(PARSED_INVOICE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function mapParserWarningToIssueType(code: string): Issue['type'] {
  const normalized = code.toUpperCase();
  if (normalized.includes('ORDER_TYPE_B')) return 'order-assignment';
  if (normalized.includes('EAN')) return 'missing-ean';
  if (normalized.includes('IDENTIFIER')) return 'missing-ean';
  if (normalized.includes('PRICE')) return 'price-mismatch';
  return 'parser-error';
}

function buildStep1ParserIssues(runId: string, warnings: ParserWarning[]): Issue[] {
  // ── Blocking issues from parser errors ──
  const parserErrors = warnings.filter((warning) => warning.severity === 'error');
  const blockingIssues: Issue[] = parserErrors.map((warning, index) => ({
    id: `issue-${runId}-step1-${warning.code || 'unknown'}-${index}-${Date.now()}`,
    runId,
    severity: 'blocking' as const,
    stepNo: 1,
    type: mapParserWarningToIssueType(warning.code),
    message: warning.message || 'Parserfehler ohne Meldung',
    details: `Code: ${warning.code || 'unknown'}${
      warning.positionIndex ? `, Position: ${warning.positionIndex}` : ''
    }`,
    relatedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
  }));

  // ── Soft-fail issues from Typ-B order warnings ──
  const typeBWarnings = warnings.filter(
    (w) => w.severity === 'warning' && w.code === 'ORDER_TYPE_B_DETECTED',
  );
  const softFailIssues: Issue[] = typeBWarnings.map((warning, index) => ({
    id: `issue-${runId}-step1-${warning.code}-${index}-${Date.now()}`,
    runId,
    severity: 'soft-fail' as const,
    stepNo: 1,
    type: mapParserWarningToIssueType(warning.code),
    message: warning.message || 'Sonderbuchungs-Bestellnummer erkannt',
    details: `Code: ${warning.code}${
      warning.positionIndex ? `, Position: ${warning.positionIndex}` : ''
    }`,
    relatedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
  }));

  return [...blockingIssues, ...softFailIssues];
}

/**
 * Compute match/price stats from invoice lines (after Step 2 article matching).
 */
function computeMatchStats(lines: InvoiceLine[]): Partial<RunStats> {
  return {
    expandedLineCount: lines.length,
    fullMatchCount: lines.filter(l => l.matchStatus === 'full-match').length,
    codeItOnlyCount: lines.filter(l => l.matchStatus === 'code-it-only').length,
    eanOnlyCount: lines.filter(l => l.matchStatus === 'ean-only').length,
    noMatchCount: lines.filter(l => l.matchStatus === 'no-match').length,
    articleMatchedCount: lines.filter(
      l => l.matchStatus !== 'pending' && l.matchStatus !== 'no-match'
    ).length,
    serialRequiredCount: lines.filter(l => l.serialRequired).length,
    inactiveArticlesCount: lines.filter(l => !l.activeFlag).length,
    priceOkCount: lines.filter(l => l.priceCheckStatus === 'ok').length,
    priceMismatchCount: lines.filter(l => l.priceCheckStatus === 'mismatch').length,
    priceMissingCount: lines.filter(l => l.priceCheckStatus === 'missing').length,
    priceCustomCount: lines.filter(l => l.priceCheckStatus === 'custom').length,
  };
}

/**
 * Compute order stats from invoice lines (after Step 4 order matching).
 */
function computeOrderStats(lines: InvoiceLine[]): Partial<RunStats> {
  return {
    matchedOrders: lines.filter(
      l => l.orderAssignmentReason !== 'pending' && l.orderAssignmentReason !== 'not-ordered'
    ).length,
    notOrderedCount: lines.filter(l => l.orderAssignmentReason === 'not-ordered').length,
    manualOkOrderCount: lines.filter(l => l.orderAssignmentReason === 'manual-ok').length,
  };
}

/**
 * Build blocking issues for no-match articles (Step 2).
 */
function buildArticleMatchIssues(runId: string, lines: InvoiceLine[]): Issue[] {
  const noMatchLines = lines.filter(l => l.matchStatus === 'no-match');
  if (noMatchLines.length === 0) return [];

  return [{
    id: `issue-${runId}-step2-no-match-${Date.now()}`,
    runId,
    severity: 'blocking',
    stepNo: 2,
    type: 'no-article-match',
    message: `${noMatchLines.length} Artikel ohne Match in Stammdaten`,
    details: noMatchLines.map(l => l.manufacturerArticleNo || l.ean || l.lineId).join(', '),
    relatedLineIds: noMatchLines.map(l => l.lineId),
    status: 'open',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
  }];
}

interface RunState {
  // Data
  runs: Run[];
  currentRun: Run | null;
  invoiceLines: InvoiceLine[];
  issues: Issue[];
  auditLog: AuditLogEntry[];
  uploadedFiles: UploadedFile[];

  // Parsed invoice data (from Step 1)
  parsedInvoiceResult: ParsedInvoiceResult | null;
  parsedPositions: ParsedInvoiceLineExtended[];
  parserWarnings: InvoiceParserWarning[];

  // Global Config
  globalConfig: RunConfig;

  // UI State
  activeTab: string;
  isProcessing: boolean;
  parsingProgress: string;

  // Actions
  setCurrentRun: (run: Run | null) => void;
  setActiveTab: (tab: string) => void;
  setGlobalConfig: (config: Partial<RunConfig>) => void;
  addUploadedFile: (file: UploadedFile) => void;
  removeUploadedFile: (type: UploadedFile['type']) => void;
  clearUploadedFiles: () => void;
  loadStoredFiles: () => Promise<void>;
  createNewRun: () => Run;
  createNewRunWithParsing: () => Promise<Run>;
  updateRunStatus: (runId: string, status: StepStatus) => void;
  updateStepStatus: (runId: string, stepNo: number, status: StepStatus) => void;
  updateInvoiceLine: (lineId: string, updates: Partial<InvoiceLine>) => void;
  resolveIssue: (issueId: string, resolutionNote: string) => void;
  addAuditEntry: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;

  // Parsing actions
  parseInvoice: (runId: string) => Promise<boolean>;
  setParsedInvoiceResult: (result: ParsedInvoiceResult | null) => void;
  clearParsedInvoice: () => void;
  setParsingProgress: (progress: string) => void;

  // Workflow actions
  advanceToNextStep: (runId: string) => void;
  deleteRun: (runId: string) => void;

  // Run update with parsed data
  updateRunWithParsedData: (runId: string, result: ParsedInvoiceResult) => void;

  // PROJ-11 Phase B: Article matching (Step 2)
  executeArticleMatching: (articles: ArticleMaster[]) => void;
  setManualPrice: (lineId: string, price: number) => void;

  // PROJ-11 Phase C: Order matching (Step 4)
  executeOrderMatching: (openPositions: OpenWEPosition[]) => void;
  setManualOrder: (lineId: string, orderYear: number, orderCode: string) => void;
  confirmNoOrder: (lineId: string) => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  // Initial Data (no mock data - start clean)
  runs: [],
  currentRun: null,
  invoiceLines: [],  // Start empty - only use real parsed data
  issues: [], // Start empty - no mock issues
  auditLog: [], // Start empty - no mock audit logs
  uploadedFiles: [],

  // Parsed invoice data
  parsedInvoiceResult: loadParsedInvoice(),
  parsedPositions: [],
  parserWarnings: [],

  // Global Config
  globalConfig: {
    priceBasis: 'Net',
    priceType: 'EK',
    tolerance: 0.01,
    eingangsart: 'Standard',
    clickLockSeconds: 0,
  },

  // UI State
  activeTab: 'overview',
  isProcessing: false,
  parsingProgress: '',

  // Actions
  setCurrentRun: (run) => set({ currentRun: run }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setGlobalConfig: (config) => set((state) => ({
    globalConfig: { ...state.globalConfig, ...config }
  })),

  addUploadedFile: (file) => {
    // Add uploadedAt timestamp if not present
    const fileWithTimestamp: UploadedFile = {
      ...file,
      uploadedAt: file.uploadedAt || new Date().toISOString(),
    };

    // Clear old parsed invoice data when a new invoice is uploaded
    // This ensures fresh parsing with the new file
    if (file.type === 'invoice') {
      console.log('[RunStore] New invoice uploaded, clearing cached parse results');
      get().clearParsedInvoice();
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

  // Legacy createNewRun (without parsing)
  createNewRun: () => {
    const { globalConfig, uploadedFiles } = get();
    const newRun: Run = {
      id: `run-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'running',
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
      },
      steps: [
        { stepNo: 1, name: 'Rechnung auslesen', status: 'running', issuesCount: 0 },
        { stepNo: 2, name: 'Artikel extrahieren', status: 'not-started', issuesCount: 0 },
        { stepNo: 3, name: 'Seriennummer anfügen', status: 'not-started', issuesCount: 0 },
        { stepNo: 4, name: 'Bestellungen mappen', status: 'not-started', issuesCount: 0 },
        { stepNo: 5, name: 'Export', status: 'not-started', issuesCount: 0 },
      ],
    };

    set((state) => ({
      runs: [newRun, ...state.runs],
      currentRun: newRun,
      isProcessing: true,
      parsingProgress: 'Initialisiere...',
    }));

    // Log workflow start
    logService.info('Neuer Verarbeitungslauf mit PDF-Parsing gestartet', {
      runId,
      step: 'System',
      details: `Config: ${JSON.stringify(globalConfig)}`,
    });

    // ── try/finally guarantees isProcessing is ALWAYS reset ──
    try {
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

          runId = newRunId;
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
            runId = newRunId;
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

      // Create archive entry
      const finalRun = get().currentRun;
      if (finalRun) {
        try {
          archiveService.createArchiveEntry(
            finalRun.id,
            finalRun.invoice.fattura,
            globalConfig,
            uploadedFiles
          );
        } catch (error) {
          console.warn('[RunStore] Failed to create archive entry:', error);
          logService.warn('Archiv-Eintrag konnte nicht erstellt werden', {
            runId: finalRun.id,
            step: 'Archiv',
          });
        }
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
        setParsingProgress('Parsing abgeschlossen');
        return true;
      } else {
        logService.warn('PDF-Parsing mit Fehlern abgeschlossen', {
          runId,
          step: 'Rechnung auslesen',
          details: `${result.warnings.filter(w => w.severity === 'error').length} Fehler`,
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

  // Update run with parsed data (uses expansion: qty>1 → N individual lines)
  updateRunWithParsedData: (runId, result) => {
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
      const invoiceLines = expandInvoiceLines(result.lines, runId);

      console.log(`[RunStore] Expansion complete: ${result.lines.length} positions → ${invoiceLines.length} lines`);

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
            totalQty: result.header.totalQty,
          },
          stats: {
            ...updatedRun.stats,
            parsedInvoiceLines: result.lines.length,
            expandedLineCount: invoiceLines.length,
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
      // NOTE: Use currentRun.id (not the closure's runId) because
      // createNewRunWithParsing may rename the run before this timer fires.
      if (stepStatus === 'ok' || stepStatus === 'soft-fail') {
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

    return {
      runs: state.runs.map(run =>
        run.id === runId ? { ...run, steps: updateSteps(run.steps) } : run
      ),
      currentRun: state.currentRun?.id === runId
        ? { ...state.currentRun, steps: updateSteps(state.currentRun.steps) }
        : state.currentRun,
    };
  }),

  advanceToNextStep: (runId: string) => {
    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;

    // Find current running step
    const runningStep = run.steps.find(s => s.status === 'running');
    if (runningStep) {
      // Set current step to 'ok'
      get().updateStepStatus(runId, runningStep.stepNo, 'ok');
    }

    // Find next 'not-started' step
    const nextStep = run.steps.find(s => s.status === 'not-started');
    if (nextStep) {
      // Set next step to 'running'
      get().updateStepStatus(runId, nextStep.stepNo, 'running');
    }
  },

  updateInvoiceLine: (lineId, updates) => set((state) => ({
    invoiceLines: state.invoiceLines.map(line =>
      line.lineId === lineId ? { ...line, ...updates } : line
    ),
  })),

  resolveIssue: (issueId, resolutionNote) => set((state) => ({
    issues: state.issues.map(issue =>
      issue.id === issueId
        ? {
            ...issue,
            status: 'resolved' as const,
            resolvedAt: new Date().toISOString(),
            resolutionNote,
          }
        : issue
    ),
  })),

  deleteRun: (runId) => set((state) => ({
    runs: state.runs.filter((r) => r.id !== runId),
    currentRun: state.currentRun?.id === runId ? null : state.currentRun,
  })),

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

  // ─── PROJ-11 Phase B: Article Matching (Step 2) ───────────────────

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

      // Determine step 2 status
      const noMatchCount = matchStats.noMatchCount ?? 0;
      const step2Status: StepStatus = noMatchCount > 0 ? 'soft-fail' : 'ok';

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
      console.error('[RunStore] executeArticleMatching error:', error);
      logService.error(`Artikel-Matching fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Artikel extrahieren',
      });

      // Set step 2 to failed so the UI doesn't hang
      get().updateStepStatus(runId, 2, 'failed');
    }
  },

  setManualPrice: (lineId, price) => {
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId === lineId
          ? {
              ...line,
              unitPriceFinal: price,
              priceCheckStatus: 'custom' as const,
            }
          : line
      ),
    }));

    // Update price stats for the current run
    const { invoiceLines, currentRun, runs } = get();
    if (!currentRun) return;
    const runLines = invoiceLines.filter(l => l.lineId.startsWith(currentRun.id));
    const priceStats = {
      priceOkCount: runLines.filter(l => l.priceCheckStatus === 'ok').length,
      priceMismatchCount: runLines.filter(l => l.priceCheckStatus === 'mismatch').length,
      priceMissingCount: runLines.filter(l => l.priceCheckStatus === 'missing').length,
      priceCustomCount: runLines.filter(l => l.priceCheckStatus === 'custom').length,
    };
    set((state) => ({
      runs: state.runs.map(r =>
        r.id === currentRun.id ? { ...r, stats: { ...r.stats, ...priceStats } } : r
      ),
      currentRun: state.currentRun?.id === currentRun.id
        ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...priceStats } }
        : state.currentRun,
    }));
  },

  // ─── PROJ-11 Phase C: Order Matching (Step 4) ─────────────────────

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
      console.error('[RunStore] executeOrderMatching error:', error);
      logService.error(`Bestell-Matching fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Bestellungen mappen',
      });

      // Set step 4 to failed so the UI doesn't hang
      get().updateStepStatus(runId, 4, 'failed');
    }
  },

  setManualOrder: (lineId, orderYear, orderCode) => {
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId === lineId
          ? {
              ...line,
              orderNumberAssigned: `${orderYear}-${orderCode}`,
              orderYear,
              orderCode,
              orderAssignmentReason: 'manual' as const,
            }
          : line
      ),
    }));

    // Update order stats
    const { invoiceLines, currentRun } = get();
    if (!currentRun) return;
    const runLines = invoiceLines.filter(l => l.lineId.startsWith(currentRun.id));
    const orderStats = computeOrderStats(runLines);
    set((state) => ({
      runs: state.runs.map(r =>
        r.id === currentRun.id ? { ...r, stats: { ...r.stats, ...orderStats } } : r
      ),
      currentRun: state.currentRun?.id === currentRun.id
        ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...orderStats } }
        : state.currentRun,
    }));
  },

  confirmNoOrder: (lineId) => {
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId === lineId
          ? {
              ...line,
              orderAssignmentReason: 'manual-ok' as const,
            }
          : line
      ),
    }));

    // Update order stats
    const { invoiceLines, currentRun } = get();
    if (!currentRun) return;
    const runLines = invoiceLines.filter(l => l.lineId.startsWith(currentRun.id));
    const orderStats = computeOrderStats(runLines);
    set((state) => ({
      runs: state.runs.map(r =>
        r.id === currentRun.id ? { ...r, stats: { ...r.stats, ...orderStats } } : r
      ),
      currentRun: state.currentRun?.id === currentRun.id
        ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...orderStats } }
        : state.currentRun,
    }));
  },
}));
