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
  convertToInvoiceHeader,
  generateRunId,
  type ParsedInvoiceResult,
} from '@/services/invoiceParserService';

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
  localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(persistedFiles));
}

// Persist parsed invoice result (without File objects)
function saveParsedInvoice(result: ParsedInvoiceResult | null): void {
  if (result) {
    localStorage.setItem(PARSED_INVOICE_KEY, JSON.stringify(result));
  } else {
    localStorage.removeItem(PARSED_INVOICE_KEY);
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

  // Run update with parsed data
  updateRunWithParsedData: (runId: string, result: ParsedInvoiceResult) => void;
}

export const useRunStore = create<RunState>((set, get) => ({
  // Initial Data
  runs: mockRuns,
  currentRun: null,
  invoiceLines: [],  // Start empty - only use real parsed data, not mock data
  issues: mockIssues,
  auditLog: mockAuditLog,
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
      },
      steps: [
        { stepNo: 1, name: 'Rechnung auslesen', status: 'running', issuesCount: 0 },
        { stepNo: 2, name: 'Order Assignment', status: 'not-started', issuesCount: 0 },
        { stepNo: 3, name: 'Serial Matching', status: 'not-started', issuesCount: 0 },
        { stepNo: 4, name: 'Article Master', status: 'not-started', issuesCount: 0 },
        { stepNo: 5, name: 'Warehouse Location', status: 'not-started', issuesCount: 0 },
        { stepNo: 6, name: 'XML Export', status: 'not-started', issuesCount: 0 },
      ],
    };

    // Log workflow start
    logService.info('Neuer Verarbeitungslauf gestartet', {
      runId: newRun.id,
      step: 'System',
      details: `Fattura: ${newRun.invoice.fattura}, Config: ${JSON.stringify(globalConfig)}`,
    });

    // Create archive entry with uploaded files
    archiveService.createArchiveEntry(
      newRun.id,
      newRun.invoice.fattura,
      globalConfig,
      uploadedFiles
    );

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
    const { globalConfig, uploadedFiles, parseInvoice, updateRunWithParsedData } = get();

    // Find invoice file
    const invoiceFile = uploadedFiles.find(f => f.type === 'invoice');

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
      },
      steps: [
        { stepNo: 1, name: 'Rechnung auslesen', status: 'running', issuesCount: 0 },
        { stepNo: 2, name: 'Order Assignment', status: 'not-started', issuesCount: 0 },
        { stepNo: 3, name: 'Serial Matching', status: 'not-started', issuesCount: 0 },
        { stepNo: 4, name: 'Article Master', status: 'not-started', issuesCount: 0 },
        { stepNo: 5, name: 'Warehouse Location', status: 'not-started', issuesCount: 0 },
        { stepNo: 6, name: 'XML Export', status: 'not-started', issuesCount: 0 },
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

        // Update run ID
        set((state) => {
          const updatedRun = state.runs.find(r => r.id === runId);
          if (updatedRun) {
            const finalRun = { ...updatedRun, id: newRunId };
            return {
              runs: state.runs.map(r => r.id === runId ? finalRun : r),
              currentRun: finalRun,
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
              return {
                runs: state.runs.map(r => r.id === runId ? finalRun : r),
                currentRun: finalRun,
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
      archiveService.createArchiveEntry(
        finalRun.id,
        finalRun.invoice.fattura,
        globalConfig,
        uploadedFiles
      );
    }

    set({ isProcessing: false, parsingProgress: '' });

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
      return false;
    }

    // Timeout configuration: 30 seconds for PDF parsing
    const PARSING_TIMEOUT_MS = 30000;

    try {
      setParsingProgress('Extrahiere Text aus PDF...');

      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`PDF-Parsing Timeout nach ${PARSING_TIMEOUT_MS / 1000} Sekunden`));
        }, PARSING_TIMEOUT_MS);
      });

      // Race between parsing and timeout
      const result = await Promise.race([
        parseInvoicePDF(invoiceFile.file, runId),
        timeoutPromise,
      ]);

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
      const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
      logService.error(`PDF-Parsing fehlgeschlagen: ${errorMessage}`, {
        runId,
        step: 'Rechnung auslesen',
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

  // Update run with parsed data
  updateRunWithParsedData: (runId, result) => {
    const invoiceHeader = convertToInvoiceHeader(result);
    const invoiceLines = convertToInvoiceLines(result.lines, runId);

    // Determine step status based on parse result
    const hasErrors = result.warnings.some(w => w.severity === 'error');
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
        },
        steps: updatedRun.steps.map(step =>
          step.stepNo === 1
            ? {
                ...step,
                status: stepStatus,
                issuesCount: result.warnings.filter(w => w.severity === 'error').length,
              }
            : step
        ),
        status: stepStatus === 'failed' ? 'soft-fail' : 'running',
      };

      return {
        runs: state.runs.map(r => r.id === runId ? newRun : r),
        currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
        invoiceLines: [...invoiceLines, ...state.invoiceLines.filter(l => !l.lineId.startsWith(runId))],
      };
    });

    // Log completion
    logService.info(`Schritt 1 abgeschlossen: ${result.lines.length} Positionen extrahiert`, {
      runId,
      step: 'Rechnung auslesen',
      details: `Status: ${stepStatus}, Fattura: ${result.header.fatturaNumber}`,
    });
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
}));
