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
  ParsedOrderPosition,
  OrderParserSelectionDiagnostics,
  StepDiagnostics,
} from '@/types';
import {
  mockRuns,
  mockIssues,
  mockAuditLog,
} from '@/data/mockData';
import { useMasterDataStore } from '@/store/masterDataStore';
import { parseMasterDataFile } from '@/services/masterDataParser';
import { logService } from '@/services/logService';
import { archiveService } from '@/services/archiveService';
import { fileStorageService } from '@/services/fileStorageService';
import {
  parseInvoicePDF,
  convertToInvoiceLines,
  expandInvoiceLines,
  createAggregatedInvoiceLines,
  convertToInvoiceHeader,
  generateRunId,
  type ParsedInvoiceResult,
} from '@/services/invoiceParserService';
import { getParsingTimeoutMs } from '@/services/parsers/config';
import type { ParserWarning } from '@/services/parsers/types';
import { matchAllArticles } from '@/services/matching/ArticleMatcher';
import { matchAllOrders } from '@/services/matching/OrderMatcher';
import { mapAllOrders as mapAllOrdersWaterfall } from '@/services/matching/orderMapper';
import { getMatcher } from '@/services/matchers';
import { matcherRegistryService } from '@/services/matcherRegistryService';
import type { SerialDocument, SerialDocumentRow } from '@/services/matchers/types';
import type { PreFilteredSerialRow } from '@/types';
import { validateAgainstInvoice } from '@/services/serialFinder';
import {
  runPersistenceService,
  type PersistedRunSummary,
  type StorageStats,
} from '@/services/runPersistenceService';
import type { OrderPool } from '@/services/matching/orderPool';
import {
  buildOrderPool,
  consumeFromPool,
  returnToPool,
} from '@/services/matching/orderPool';
import { executeMatchingEngine } from '@/services/matching/matchingEngine';
import { DEFAULT_ORDER_PARSER_PROFILE_ID } from '@/services/matching/orderParserProfiles';
import { buildAutoSavePayload } from '@/hooks/buildAutoSavePayload';

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

// Max size (bytes) for full parsed-invoice payload in localStorage (~400 KB)
const PARSED_INVOICE_MAX_BYTES = 400 * 1024;

// Persist parsed invoice result (without File objects).
// If the serialized payload exceeds PARSED_INVOICE_MAX_BYTES, only the
// header + warnings are stored (no lines) to avoid QuotaExceededError.
function saveParsedInvoice(result: ParsedInvoiceResult | null): void {
  try {
    if (!result) {
      localStorage.removeItem(PARSED_INVOICE_KEY);
      return;
    }
    const full = JSON.stringify(result);
    if (full.length <= PARSED_INVOICE_MAX_BYTES) {
      localStorage.setItem(PARSED_INVOICE_KEY, full);
    } else {
      // Store header + warnings only; lines are already in invoiceLines state
      const slim = JSON.stringify({ ...result, lines: [] });
      localStorage.setItem(PARSED_INVOICE_KEY, slim);
      console.warn(`[RunStore] parsedInvoice too large (${(full.length / 1024).toFixed(0)} KB) — stored header only`);
    }
  } catch (error) {
    console.warn('[RunStore] Failed to persist parsed invoice result:', error);
    // Last resort: clear the key so we don't block future writes
    try { localStorage.removeItem(PARSED_INVOICE_KEY); } catch { /* ignore */ }
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
    severity: 'error' as const,
    stepNo: 1,
    type: mapParserWarningToIssueType(warning.code),
    message: warning.message || 'Parserfehler ohne Meldung',
    details: `Code: ${warning.code || 'unknown'}${
      warning.positionIndex ? `, Position: ${warning.positionIndex}` : ''
    }`,
    relatedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    affectedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
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
    severity: 'warning' as const,
    stepNo: 1,
    type: mapParserWarningToIssueType(warning.code),
    message: warning.message || 'Sonderbuchungs-Bestellnummer erkannt',
    details: `Code: ${warning.code}${
      warning.positionIndex ? `, Position: ${warning.positionIndex}` : ''
    }`,
    relatedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    affectedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
  }));

  return [...blockingIssues, ...softFailIssues];
}

// ── PROJ-21 Phase 4: Auto-Resolve ────────────────────────────────────
/**
 * Check if an issue's error condition is still active based on current line data.
 * Returns `true` if the issue should remain open, `false` if it can be auto-resolved.
 */
function checkIssueStillActive(issue: Issue, lines: InvoiceLine[]): boolean {
  // Only auto-resolve issues that reference specific lines
  if (issue.relatedLineIds.length === 0) return true;

  const related = lines.filter(l => issue.relatedLineIds.includes(l.lineId));
  // If none of the referenced lines exist (deleted?), keep open
  if (related.length === 0) return true;

  switch (issue.type) {
    case 'price-mismatch':
      return related.some(l => l.priceCheckStatus === 'mismatch');

    case 'no-article-match':
    case 'match-artno-not-found':
    case 'match-ean-not-found':
      return related.some(l => l.matchStatus === 'no-match');

    case 'match-conflict-id':
      // Conflict resolves when all related lines have a definitive match
      return related.some(l => l.matchStatus === 'no-match' || l.matchStatus === 'pending');

    case 'serial-mismatch':
    case 'sn-insufficient-count':
      return related.some(l => l.serialRequired && l.serialNumbers.length < l.qty);

    case 'order-no-match':
      return related.some(l => l.orderAssignmentReason === 'not-ordered' || l.orderAssignmentReason === 'pending');

    case 'order-incomplete': {
      return related.some(l => {
        const allocated = l.allocatedOrders.reduce((s, a) => s + a.qty, 0);
        return allocated > 0 && allocated < l.qty;
      });
    }

    case 'inactive-article':
      return related.some(l => l.activeFlag === false);

    // These types are not auto-resolvable (parser errors, info hints, etc.)
    default:
      return true;
  }
}

/**
 * Scan all open issues and auto-resolve those whose error condition is no longer active.
 * Returns the original array reference if nothing changed (avoids unnecessary re-renders).
 */
function autoResolveIssues(issues: Issue[], lines: InvoiceLine[], runId: string): Issue[] {
  let changed = false;
  const result = issues.map(issue => {
    if (issue.status !== 'open' || issue.runId !== runId) return issue;

    const stillActive = checkIssueStillActive(issue, lines);
    if (!stillActive) {
      changed = true;
      return {
        ...issue,
        status: 'resolved' as const,
        resolvedAt: new Date().toISOString(),
        resolutionNote: 'Automatisch gelöst durch manuelle Korrektur',
      };
    }
    return issue;
  });
  return changed ? result : issues;
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
    severity: 'error',
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

function formatOrderParserDiagnostics(diagnostics?: OrderParserSelectionDiagnostics): string {
  if (!diagnostics) return 'Keine Diagnosedaten vorhanden';
  const topCandidates = diagnostics.candidates
    .slice(0, 3)
    .map((candidate) => {
      const ratioPercent = (candidate.validRatio * 100).toFixed(1);
      return `${candidate.header} [valid=${candidate.validCount}, ratio=${ratioPercent}%, nonEmpty=${candidate.nonEmptyCount}]`;
    });

  return [
    `Profil: ${diagnostics.profileId}`,
    `Gewaehlt: ${diagnostics.selectedHeader || 'n/a'} (Spalte ${diagnostics.selectedColumnIndex})`,
    `Confidence: ${diagnostics.confidence}`,
    `Kandidaten: ${topCandidates.join(' | ') || 'n/a'}`,
  ].join(' | ');
}

function buildOrderParserFailureIssue(
  runId: string,
  diagnostics: OrderParserSelectionDiagnostics | undefined,
  detailsPrefix: string,
): Issue {
  return {
    id: `issue-${runId}-step4-order-parser-${Date.now()}`,
    runId,
    severity: 'error',
    stepNo: 4,
    type: 'parser-error',
    message: 'Order-Parser Qualitaetsgate blockiert Step 4',
    details: `${detailsPrefix}. ${formatOrderParserDiagnostics(diagnostics)}`,
    relatedLineIds: [],
    status: 'open',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
  };
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
  /** @deprecated Use latestDiagnostics[4] instead (PROJ-28 migration) */
  lastOrderParserDiagnostics: OrderParserSelectionDiagnostics | null;
  // PROJ-28: Unified step diagnostics — one entry per step (1..4), set after each step completes
  latestDiagnostics: Partial<Record<1 | 2 | 3 | 4, StepDiagnostics>>;

  // Serial document (from Step 3, PROJ-16)
  serialDocument: SerialDocument | null;

  // PROJ-20: Pre-filtered serial rows — persisted to IndexedDB since PROJ-40
  preFilteredSerials: PreFilteredSerialRow[];

  // PROJ-23: OrderPool for manual resolution (Phase A3)
  orderPool: OrderPool | null;

  // PROJ-23: Persisted run summaries from IndexedDB (Phase A2)
  persistedRunSummaries: PersistedRunSummary[];

  // PROJ-40: Run-Isolierung Guard — tracks which run's parsedPositions/parserWarnings are loaded
  currentParsedRunId: string | null;

  // Global Config
  globalConfig: RunConfig;

  // UI State
  activeTab: string;
  isProcessing: boolean;
  parsingProgress: string;
  /** PROJ-17: step filter preset from KPI-Tile click navigation (null = no preset) */
  issuesStepFilter: string | null;
  /** PROJ-37: Issue-filter — array of lineIds to isolate in ItemsTable/InvoicePreview (null = off) */
  activeIssueFilterIds: string[] | null;
  /** PROJ-21: Jump-link highlighting — lineIds to visually highlight in ItemsTable */
  highlightedLineIds: string[];
  /** PROJ-21: Jump-link scroll target — first lineId to scroll into view */
  scrollToLineId: string | null;
  /** PROJ-25: Pause-Flag — true while run is paused by user */
  isPaused: boolean;
  /** PROJ-25: Handle for the active auto-advance timer — cleared on pause to prevent deadlock */
  autoAdvanceTimer: ReturnType<typeof setTimeout> | null;

  // Actions
  setCurrentRun: (run: Run | null) => void;
  setActiveTab: (tab: string) => void;
  setIssuesStepFilter: (filter: string | null) => void;
  /** PROJ-37: Set/clear the issue-isolation filter for ItemsTable + InvoicePreview */
  setActiveIssueFilterIds: (ids: string[] | null) => void;
  /** PROJ-21: Navigate from issue to affected row(s) in ItemsTable */
  navigateToLine: (lineIds: string[]) => void;
  clearHighlightedLines: () => void;
  setGlobalConfig: (config: Partial<RunConfig>) => void;
  /** PROJ-28: Write step diagnostics after a step completes (replaces lastOrderParserDiagnostics for Step 4) */
  setStepDiagnostics: (stepNo: 1 | 2 | 3 | 4, diag: StepDiagnostics) => void;
  addUploadedFile: (file: UploadedFile) => void;
  removeUploadedFile: (type: UploadedFile['type']) => void;
  clearUploadedFiles: () => void;
  loadStoredFiles: () => Promise<void>;
  createNewRun: () => Run;
  createNewRunWithParsing: () => Promise<Run>;
  updateRunStatus: (runId: string, status: StepStatus) => void;
  updateStepStatus: (runId: string, stepNo: number, status: StepStatus) => void;
  updateInvoiceLine: (lineId: string, updates: Partial<InvoiceLine>) => void;
  /** PROJ-20: Update ALL lines with a given positionIndex (cascading from aggregated view) */
  updatePositionLines: (positionIndex: number, updates: Partial<InvoiceLine>) => void;
  resolveIssue: (issueId: string, resolutionNote: string) => void;
  /** PROJ-39: Mark issue as escalated (status stays 'open') */
  escalateIssue: (issueId: string, recipientEmail: string) => void;
  addAuditEntry: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;

  // Parsing actions
  parseInvoice: (runId: string) => Promise<boolean>;
  setParsedInvoiceResult: (result: ParsedInvoiceResult | null) => void;
  clearParsedInvoice: () => void;
  setParsingProgress: (progress: string) => void;

  // Workflow actions
  advanceToNextStep: (runId: string) => void;
  retryStep: (runId: string, stepNo: number) => void;  // HOTFIX-2
  deleteRun: (runId: string) => void;
  /** PROJ-25: Pause a running run — clears auto-advance timer to prevent deadlock */
  pauseRun: (runId: string) => void;
  /** PROJ-25: Resume a paused run — resets isPaused and re-triggers advanceToNextStep */
  resumeRun: (runId: string) => void;

  // PROJ-12: Archive & abort actions
  archiveRun: (runId: string) => Promise<{ success: boolean; folderName: string }>;
  abortRun: (runId: string) => void;

  // Run update with parsed data
  updateRunWithParsedData: (runId: string, result: ParsedInvoiceResult) => void;

  // PROJ-11 Phase B: Article matching (Step 2) — legacy, kept for backwards compat
  executeArticleMatching: (articles: ArticleMaster[]) => void;
  setManualPrice: (lineId: string, price: number) => void;
  /** PROJ-42-ADD-ON: Set bookingDate on first export only. Returns updated Run or null. */
  setBookingDate: (runId: string, date: string) => Run | null;
  /** PROJ-42-ADD-ON-V: Export-Version inkrementieren. Returns updated Run or null. */
  incrementExportVersion: (runId: string) => Run | null;

  // PROJ-16/19: Matcher-based actions (replace executeArticleMatching)
  // Articles are now sourced from masterDataStore — no parameter needed
  executeMatcherCrossMatch: () => void;
  executeMatcherSerialExtract: () => Promise<void>;

  // PROJ-11 Phase C: Order matching (Step 4) — legacy
  executeOrderMatching: (openPositions: OpenWEPosition[]) => void;
  // PROJ-20: 4-stage waterfall order mapping (Step 4)
  executeOrderMapping: (parsedOrders: ParsedOrderPosition[]) => void;
  setManualOrder: (lineId: string, orderYear: number, orderCode: string) => void;
  confirmNoOrder: (lineId: string) => void;
  /** PROJ-23 Phase A5: Bidirectional manual reassignment with pool bookkeeping */
  reassignOrder: (lineId: string, newOrderPositionId: string | 'NEW', freeText?: string) => void;

  // PROJ-23: Persistence actions (Phase A2)
  loadPersistedRun: (runId: string) => Promise<boolean>;
  loadPersistedRunList: () => Promise<void>;
  getStorageStats: () => Promise<StorageStats>;
  exportRunsToDirectory: (purgeOlderThanMonths?: number) => Promise<number>;
  deletePersistedRun: (runId: string) => Promise<boolean>;
  clearPersistedRuns: () => Promise<boolean>;
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
  lastOrderParserDiagnostics: null,
  latestDiagnostics: {},

  // Serial document (PROJ-16)
  serialDocument: null,

  // PROJ-20: Pre-filtered serial rows — persisted to IndexedDB since PROJ-40
  preFilteredSerials: [],

  // PROJ-23: OrderPool for manual resolution (Phase A3)
  orderPool: null,

  // PROJ-23: Persisted run summaries from IndexedDB (Phase A2)
  persistedRunSummaries: [],

  // PROJ-40: Run-Isolierung Guard
  currentParsedRunId: null,

  // Global Config
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
    // PROJ-28: Block-Step toggles (default: off)
    blockStep2OnPriceMismatch: false,
    blockStep4OnMissingOrder: false,
    matcherProfileOverrides: undefined,
  },

  // UI State
  activeTab: 'overview',
  isProcessing: false,
  parsingProgress: '',
  issuesStepFilter: null,
  activeIssueFilterIds: null,
  highlightedLineIds: [],
  scrollToLineId: null,
  isPaused: false,
  autoAdvanceTimer: null,

  // Actions
  setCurrentRun: (run) => set({ currentRun: run }),

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

  setGlobalConfig: (config) => set((state) => ({
    globalConfig: { ...state.globalConfig, ...config }
  })),

  setStepDiagnostics: (stepNo, diag) => set((state) => ({
    latestDiagnostics: { ...state.latestDiagnostics, [stepNo]: diag },
  })),

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
      parseMasterDataFile(fileWithTimestamp.file)
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

  // Legacy createNewRun (without parsing)
  createNewRun: () => {
    const { globalConfig, uploadedFiles } = get();
    const newRun: Run = {
      id: `run-${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'running',
      isExpanded: false,
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
        currentParsedRunId: get().currentRun?.id ?? null,  // PROJ-40 6A: Run-Isolierung
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

  advanceToNextStep: (runId: string) => {
    // PROJ-25: Pause-Guard — do not advance if run is paused
    if (get().isPaused) return;

    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;

    // Find current running step
    const runningStep = run.steps.find(s => s.status === 'running');

    // PROJ-28: Block-Step Guard — checked at completion of the running step
    if (runningStep) {
      const { globalConfig, issues } = get();

      // Block leaving Step 2 when price-mismatch errors are unresolved
      if (runningStep.stepNo === 2 && globalConfig.blockStep2OnPriceMismatch) {
        const openPriceErrors = issues.filter(
          i => i.type === 'price-mismatch' && i.status === 'open' && i.severity === 'error' && i.runId === runId,
        );
        if (openPriceErrors.length > 0) {
          logService.warn(
            `Block-Guard: Step 2 → Step 3 blockiert (${openPriceErrors.length} offene Preisabweichungen)`,
            { runId, step: 'Artikel extrahieren' },
          );
          return;
        }
      }

      // Set current step to 'ok'
      get().updateStepStatus(runId, runningStep.stepNo, 'ok');
    }

    // Find next 'not-started' step
    const nextStep = run.steps.find(s => s.status === 'not-started');
    if (nextStep) {
      // Set next step to 'running'
      get().updateStepStatus(runId, nextStep.stepNo, 'running');

      // Auto-execute Step 2 (Cross-Match via Matcher Module) after Step 1 completes
      if (nextStep.stepNo === 2) {
        const t2 = setTimeout(() => {
          if (get().isPaused) return; // PROJ-25: Guard
          const currentState = get();
          if (currentState.currentRun?.id === runId) {
            logService.info('Auto-Start: Matcher Cross-Match (Step 2)', { runId, step: 'Artikel extrahieren' });
            currentState.executeMatcherCrossMatch();
            // Auto-advance to Step 3 after matching completes
            const t2adv = setTimeout(() => {
              if (get().isPaused) return; // PROJ-25: Guard
              const afterMatch = get();
              const updatedRun = afterMatch.runs.find(r => r.id === runId);
              const step2 = updatedRun?.steps.find(s => s.stepNo === 2);
              if (step2 && (step2.status === 'ok' || step2.status === 'soft-fail')) {
                logService.info('Auto-Advance: Step 2 → Step 3', { runId, step: 'System' });
                afterMatch.advanceToNextStep(runId);
              }
            }, 100);
            set({ autoAdvanceTimer: t2adv });
          }
        }, 100);
        set({ autoAdvanceTimer: t2 });
      }

      // Auto-execute Step 3 (Serial Extraction via Matcher Module) after Step 2 completes
      if (nextStep.stepNo === 3) {
        const t3 = setTimeout(() => {
          if (get().isPaused) return; // PROJ-25: Guard
          const currentState = get();
          if (currentState.currentRun?.id === runId) {
            logService.info('Auto-Start: Matcher Serial-Extraktion (Step 3)', { runId, step: 'Seriennummer anfuegen' });
            currentState.executeMatcherSerialExtract();
            // Auto-advance to Step 4 after serial extraction completes
            const t3adv = setTimeout(() => {
              if (get().isPaused) return; // PROJ-25: Guard
              const afterSerial = get();
              const updatedRun = afterSerial.runs.find(r => r.id === runId);
              const step3 = updatedRun?.steps.find(s => s.stepNo === 3);
              if (step3 && (step3.status === 'ok' || step3.status === 'soft-fail')) {
                logService.info('Auto-Advance: Step 3 → Step 4', { runId, step: 'System' });
                afterSerial.advanceToNextStep(runId);
              }
            }, 100);
            set({ autoAdvanceTimer: t3adv });
          }
        }, 100);
        set({ autoAdvanceTimer: t3 });
      }

      // PROJ-20: Auto-execute Step 4 (Order Mapping) after Step 3 completes
      if (nextStep.stepNo === 4) {
        const t4 = setTimeout(() => {
          if (get().isPaused) return; // PROJ-25: Guard
          const currentState = get();
          if (currentState.currentRun?.id === runId) {
            const activeMapper = currentState.globalConfig.activeOrderMapperId;
            logService.info(`Auto-Start: Order-Mapping (Step 4, mapper=${activeMapper})`, { runId, step: 'Bestellungen mappen' });

            if (activeMapper === 'engine-proj-23') {
              // Parse openWE file if available, then run PROJ-23 3-Run Engine
              const openWEFile = currentState.uploadedFiles.find(f => f.type === 'openWE');
              if (openWEFile?.file) {
                import('@/services/matching/orderParser').then(({ parseOrderFile }) => {
                  const runConfig = currentState.currentRun?.config ?? currentState.globalConfig;
                  parseOrderFile(openWEFile.file, {
                    profileId: runConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
                    overrides: runConfig.orderParserProfileOverrides,
                  })
                    .then((parseResult) => {
                      for (const w of parseResult.warnings) {
                        logService.warn(`[OrderParser] ${w}`, { runId, step: 'Bestellungen mappen' });
                      }

                      // PROJ-41: Strukturierte Parser-Issues in State übernehmen
                      if (parseResult.issues && parseResult.issues.length > 0) {
                        set((state) => ({
                          issues: [
                            ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4 && i.type === 'parser-error')),
                            ...parseResult.issues!.map(issue => ({ ...issue, runId })),
                          ],
                        }));
                      }

                      set({ lastOrderParserDiagnostics: parseResult.diagnostics ?? null });
                      // PROJ-28: Step 4 diagnostics
                      if (parseResult.diagnostics) {
                        get().setStepDiagnostics(4, {
                          stepNo: 4,
                          moduleName: parseResult.diagnostics.profileId,
                          confidence: parseResult.diagnostics.confidence,
                          summary: `${parseResult.positions.length} Bestellpositionen, Spalte: ${parseResult.diagnostics.selectedHeader || 'n/a'}`,
                          timestamp: new Date().toISOString(),
                        });
                      }

                      // Pre-Check Validierungsfehler (wissenschaftliche Notation / fehlende IDs)
                      if (parseResult.validationError) {
                        const parserIssue = buildOrderParserFailureIssue(
                          runId,
                          parseResult.diagnostics,
                          `Datei-Validierung fehlgeschlagen: ${parseResult.validationError}`,
                        );
                        set((state) => {
                          const updatedRun = state.runs.find(r => r.id === runId);
                          if (!updatedRun) return state;
                          const newRun: Run = {
                            ...updatedRun,
                            status: 'soft-fail',
                            steps: updatedRun.steps.map((step) =>
                              step.stepNo === 4
                                ? { ...step, status: 'failed', issuesCount: 1 }
                                : step,
                            ),
                          };
                          return {
                            runs: state.runs.map(r => r.id === runId ? newRun : r),
                            currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
                            issues: [
                              ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
                              parserIssue,
                            ],
                          };
                        });
                        logService.error(
                          `[OrderParser] Validierungsfehler blockiert Step 4: ${parseResult.validationError}`,
                          { runId, step: 'Bestellungen mappen' },
                        );
                        return;
                      }

                      const lowConfidence = parseResult.diagnostics?.confidence === 'low';
                      if (parseResult.positions.length === 0 || lowConfidence) {
                        const detailsPrefix = parseResult.positions.length === 0
                          ? 'Keine gueltigen offenen Bestellungen erkannt'
                          : 'Spaltenauswahl mit niedriger Confidence erkannt';
                        const parserIssue = buildOrderParserFailureIssue(
                          runId,
                          parseResult.diagnostics,
                          detailsPrefix,
                        );

                        set((state) => {
                          const updatedRun = state.runs.find(r => r.id === runId);
                          if (!updatedRun) return state;

                          const newRun: Run = {
                            ...updatedRun,
                            status: 'soft-fail',
                            steps: updatedRun.steps.map((step) =>
                              step.stepNo === 4
                                ? { ...step, status: 'failed', issuesCount: 1 }
                                : step,
                            ),
                          };

                          return {
                            runs: state.runs.map(r => r.id === runId ? newRun : r),
                            currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
                            issues: [
                              ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
                              parserIssue,
                            ],
                          };
                        });

                        logService.error(
                          `Order-Parser Gate blockiert Step 4: ${detailsPrefix}`,
                          { runId, step: 'Bestellungen mappen' },
                        );
                        return;
                      }

                      get().executeOrderMapping(parseResult.positions);
                      // Auto-advance to Step 5
                      const t4adv1 = setTimeout(() => {
                        if (get().isPaused) return; // PROJ-25: Guard
                        const afterOrder = get();
                        const updatedRun = afterOrder.runs.find(r => r.id === runId);
                        const step4 = updatedRun?.steps.find(s => s.stepNo === 4);
                        if (step4 && (step4.status === 'ok' || step4.status === 'soft-fail')) {
                          logService.info('Auto-Advance: Step 4 → Step 5', { runId, step: 'System' });
                          afterOrder.advanceToNextStep(runId);
                        }
                      }, 100);
                      set({ autoAdvanceTimer: t4adv1 });
                    })
                    .catch((err) => {
                      logService.error(`OrderParser fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId, step: 'Bestellungen mappen' });
                      get().updateStepStatus(runId, 4, 'failed');
                    });
                });
              } else {
                // No openWE file → skip Step 4 with ok
                logService.info('Keine Bestell-Datei geladen — Step 4 wird uebersprungen', { runId, step: 'Bestellungen mappen' });
                get().updateStepStatus(runId, 4, 'ok');
                // Auto-advance
                const t4adv2 = setTimeout(() => {
                  if (get().isPaused) return; // PROJ-25: Guard
                  const afterOrder = get();
                  const updatedRun = afterOrder.runs.find(r => r.id === runId);
                  const step4 = updatedRun?.steps.find(s => s.stepNo === 4);
                  if (step4 && (step4.status === 'ok' || step4.status === 'soft-fail')) {
                    logService.info('Auto-Advance: Step 4 → Step 5', { runId, step: 'System' });
                    afterOrder.advanceToNextStep(runId);
                  }
                }, 100);
                set({ autoAdvanceTimer: t4adv2 });
              }
            } else {
              // Legacy path: use matchAllOrders (requires OpenWEPosition[] from somewhere)
              logService.info('Legacy OrderMatcher (3 Regeln) — manueller Start erforderlich', { runId, step: 'Bestellungen mappen' });
              get().updateStepStatus(runId, 4, 'ok');
              const t4legacy = setTimeout(() => {
                if (get().isPaused) return; // PROJ-25: Guard
                const afterOrder = get();
                afterOrder.advanceToNextStep(runId);
              }, 100);
              set({ autoAdvanceTimer: t4legacy });
            }
          }
        }, 100);
        set({ autoAdvanceTimer: t4 });
      }

      // PROJ-42-ADD-ON-12: Auto-complete Step 5 (Export) — Export wird via UI ausgeloest, Step auto-abschliessen
      if (nextStep.stepNo === 5) {
        const t5 = setTimeout(() => {
          if (get().isPaused) return; // PROJ-25: Guard
          const afterStep4 = get();
          const updatedRun = afterStep4.runs.find(r => r.id === runId);
          const step5 = updatedRun?.steps.find(s => s.stepNo === 5);
          if (step5 && step5.status === 'running') {
            logService.info('Auto-Complete: Step 5 (Export bereit)', { runId, step: 'Export' });
            afterStep4.advanceToNextStep(runId);
          }
        }, 100);
        set({ autoAdvanceTimer: t5 });
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

    // Re-execute step logic
    switch (stepNo) {
      case 2:
        setTimeout(() => get().executeMatcherCrossMatch(), 50);
        break;
      case 3:
        setTimeout(() => get().executeMatcherSerialExtract(), 50);
        break;
      case 4:
        setTimeout(() => {
          const cs = get();
          const activeMapper = cs.globalConfig.activeOrderMapperId;
          if (activeMapper === 'engine-proj-23') {
            const openWEFile = cs.uploadedFiles.find(f => f.type === 'openWE');
            if (openWEFile?.file) {
              import('@/services/matching/orderParser').then(({ parseOrderFile }) => {
                const runConfig = cs.currentRun?.config ?? cs.globalConfig;
                parseOrderFile(openWEFile.file, {
                  profileId: runConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
                  overrides: runConfig.orderParserProfileOverrides,
                })
                  .then((parseResult) => {
                    for (const w of parseResult.warnings) {
                      logService.warn(`[OrderParser] ${w}`, { runId, step: 'Bestellungen mappen' });
                    }

                    // PROJ-41: Strukturierte Parser-Issues in State übernehmen
                    if (parseResult.issues && parseResult.issues.length > 0) {
                      set((state) => ({
                        issues: [
                          ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4 && i.type === 'parser-error')),
                          ...parseResult.issues!.map(issue => ({ ...issue, runId })),
                        ],
                      }));
                    }

                    set({ lastOrderParserDiagnostics: parseResult.diagnostics ?? null });
                    // PROJ-28: Step 4 diagnostics
                    if (parseResult.diagnostics) {
                      get().setStepDiagnostics(4, {
                        stepNo: 4,
                        moduleName: parseResult.diagnostics.profileId,
                        confidence: parseResult.diagnostics.confidence,
                        summary: `${parseResult.positions.length} Bestellpositionen, Spalte: ${parseResult.diagnostics.selectedHeader || 'n/a'}`,
                        timestamp: new Date().toISOString(),
                      });
                    }

                    // Pre-Check Validierungsfehler (wissenschaftliche Notation / fehlende IDs)
                    if (parseResult.validationError) {
                      const parserIssue = buildOrderParserFailureIssue(
                        runId,
                        parseResult.diagnostics,
                        `Datei-Validierung fehlgeschlagen: ${parseResult.validationError}`,
                      );
                      set((state) => {
                        const updatedRun = state.runs.find(r => r.id === runId);
                        if (!updatedRun) return state;
                        const newRun: Run = {
                          ...updatedRun,
                          status: 'soft-fail',
                          steps: updatedRun.steps.map((step) =>
                            step.stepNo === 4
                              ? { ...step, status: 'failed', issuesCount: 1 }
                              : step,
                          ),
                        };
                        return {
                          runs: state.runs.map(r => r.id === runId ? newRun : r),
                          currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
                          issues: [
                            ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
                            parserIssue,
                          ],
                        };
                      });
                      logService.error(
                        `[OrderParser] Validierungsfehler blockiert Step 4: ${parseResult.validationError}`,
                        { runId, step: 'Bestellungen mappen' },
                      );
                      return;
                    }

                    const lowConfidence = parseResult.diagnostics?.confidence === 'low';
                    if (parseResult.positions.length === 0 || lowConfidence) {
                      const detailsPrefix = parseResult.positions.length === 0
                        ? 'Keine gueltigen offenen Bestellungen erkannt'
                        : 'Spaltenauswahl mit niedriger Confidence erkannt';
                      const parserIssue = buildOrderParserFailureIssue(
                        runId,
                        parseResult.diagnostics,
                        detailsPrefix,
                      );
                      set((state) => {
                        const updatedRun = state.runs.find(r => r.id === runId);
                        if (!updatedRun) return state;

                        const newRun: Run = {
                          ...updatedRun,
                          status: 'soft-fail',
                          steps: updatedRun.steps.map((s) =>
                            s.stepNo === 4
                              ? { ...s, status: 'failed', issuesCount: 1 }
                              : s,
                          ),
                        };
                        return {
                          runs: state.runs.map(r => r.id === runId ? newRun : r),
                          currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
                          issues: [
                            ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
                            parserIssue,
                          ],
                        };
                      });
                      logService.error(
                        `Order-Parser Gate blockiert Step 4: ${detailsPrefix}`,
                        { runId, step: 'Bestellungen mappen' },
                      );
                      return;
                    }
                    get().executeOrderMapping(parseResult.positions);
                  })
                  .catch((err) => {
                    logService.error(`OrderParser fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId, step: 'Bestellungen mappen' });
                    get().updateStepStatus(runId, 4, 'failed');
                  });
              });
            } else {
              get().updateStepStatus(runId, 4, 'ok');
            }
          } else {
            get().updateStepStatus(runId, 4, 'ok');
          }
        }, 50);
        break;
      default:
        // Step 1 (Parsing) + Step 5 (Export) sind nicht retryable
        logService.warn(`Step ${stepNo} kann nicht wiederholt werden`, { runId, step: step.name });
        get().updateStepStatus(runId, stepNo, 'failed');
        break;
    }
  },

  updateInvoiceLine: (lineId, updates) => {
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId === lineId ? { ...line, ...updates } : line
      ),
    }));
    // PROJ-21: Auto-resolve issues after manual line update
    const { currentRun, invoiceLines, issues } = get();
    if (currentRun) {
      const resolved = autoResolveIssues(issues, invoiceLines, currentRun.id);
      if (resolved !== issues) set({ issues: resolved });
    }
  },

  // PROJ-20: Cascade updates from aggregated position to all expanded lines
  updatePositionLines: (positionIndex, updates) => {
    const { currentRun } = get();
    if (!currentRun) return;
    const runPrefix = `${currentRun.id}-line-`;
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.positionIndex === positionIndex && line.lineId.startsWith(runPrefix)
          ? { ...line, ...updates }
          : line
      ),
    }));
    // Recompute stats after bulk update
    const { invoiceLines, issues } = get();
    const runLines = invoiceLines.filter(l => l.lineId.startsWith(runPrefix));
    const matchStats = computeMatchStats(runLines);
    const orderStats = computeOrderStats(runLines);
    set((state) => ({
      runs: state.runs.map(r =>
        r.id === currentRun.id ? { ...r, stats: { ...r.stats, ...matchStats, ...orderStats } } : r
      ),
      currentRun: state.currentRun?.id === currentRun.id
        ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...matchStats, ...orderStats } }
        : state.currentRun,
    }));
    // PROJ-21: Auto-resolve issues after position update
    const resolved = autoResolveIssues(issues, invoiceLines, currentRun.id);
    if (resolved !== issues) set({ issues: resolved });
  },

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

  // PROJ-39: Escalate issue — status stays 'open', only sets escalatedAt + escalatedTo
  escalateIssue: (issueId, recipientEmail) => {
    set((state) => ({
      issues: state.issues.map(issue =>
        issue.id === issueId
          ? { ...issue, escalatedAt: new Date().toISOString(), escalatedTo: recipientEmail }
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

  // PROJ-25: Pause — cancel active timer, set paused state
  pauseRun: (runId) => {
    const { autoAdvanceTimer } = get();
    if (autoAdvanceTimer !== null) {
      clearTimeout(autoAdvanceTimer);
      set({ autoAdvanceTimer: null });
    }
    set({ isPaused: true });
    get().updateRunStatus(runId, 'paused');
    logService.info('Run pausiert', { runId, step: 'System' });
  },

  // PROJ-25: Resume — clear pause, restore run status, re-trigger the currently running step's logic
  // BUGFIX: do NOT call advanceToNextStep() — that would mark the current step as 'ok' and skip it.
  // Instead, re-fire the auto-execution block for whichever step is currently 'running'.
  resumeRun: (runId) => {
    set({ isPaused: false });
    get().updateRunStatus(runId, 'running');
    logService.info('Run fortgesetzt', { runId, step: 'System' });

    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) return;
    const runningStep = run.steps.find(s => s.status === 'running');
    if (!runningStep) return;

    // Re-trigger Step 2 (Cross-Match)
    if (runningStep.stepNo === 2) {
      const t2 = setTimeout(() => {
        if (get().isPaused) return;
        const cs = get();
        if (cs.currentRun?.id === runId) {
          logService.info('Resume: Matcher Cross-Match (Step 2)', { runId, step: 'Artikel extrahieren' });
          cs.executeMatcherCrossMatch();
          const t2adv = setTimeout(() => {
            if (get().isPaused) return;
            const afterMatch = get();
            const updatedRun = afterMatch.runs.find(r => r.id === runId);
            const step2 = updatedRun?.steps.find(s => s.stepNo === 2);
            if (step2 && (step2.status === 'ok' || step2.status === 'soft-fail')) {
              logService.info('Resume Auto-Advance: Step 2 → Step 3', { runId, step: 'System' });
              afterMatch.advanceToNextStep(runId);
            }
          }, 100);
          set({ autoAdvanceTimer: t2adv });
        }
      }, 100);
      set({ autoAdvanceTimer: t2 });
    }

    // Re-trigger Step 3 (Serial Extraction)
    if (runningStep.stepNo === 3) {
      const t3 = setTimeout(() => {
        if (get().isPaused) return;
        const cs = get();
        if (cs.currentRun?.id === runId) {
          logService.info('Resume: Matcher Serial-Extraktion (Step 3)', { runId, step: 'Seriennummer anfuegen' });
          cs.executeMatcherSerialExtract();
          const t3adv = setTimeout(() => {
            if (get().isPaused) return;
            const afterSerial = get();
            const updatedRun = afterSerial.runs.find(r => r.id === runId);
            const step3 = updatedRun?.steps.find(s => s.stepNo === 3);
            if (step3 && (step3.status === 'ok' || step3.status === 'soft-fail')) {
              logService.info('Resume Auto-Advance: Step 3 → Step 4', { runId, step: 'System' });
              afterSerial.advanceToNextStep(runId);
            }
          }, 100);
          set({ autoAdvanceTimer: t3adv });
        }
      }, 100);
      set({ autoAdvanceTimer: t3 });
    }

    // Re-trigger Step 4 (Order Mapping)
    if (runningStep.stepNo === 4) {
      const t4 = setTimeout(() => {
        if (get().isPaused) return;
        const cs = get();
        if (cs.currentRun?.id === runId) {
          const activeMapper = cs.globalConfig.activeOrderMapperId;
          logService.info(`Resume: Order-Mapping (Step 4, mapper=${activeMapper})`, { runId, step: 'Bestellungen mappen' });

          if (activeMapper === 'engine-proj-23') {
            const openWEFile = cs.uploadedFiles.find(f => f.type === 'openWE');
            if (openWEFile?.file) {
              import('@/services/matching/orderParser').then(({ parseOrderFile }) => {
                const runConfig = cs.currentRun?.config ?? cs.globalConfig;
                parseOrderFile(openWEFile.file, {
                  profileId: runConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
                  overrides: runConfig.orderParserProfileOverrides,
                })
                  .then((parseResult) => {
                    for (const w of parseResult.warnings) {
                      logService.warn(`[OrderParser] ${w}`, { runId, step: 'Bestellungen mappen' });
                    }

                    // PROJ-41: Strukturierte Parser-Issues in State übernehmen
                    if (parseResult.issues && parseResult.issues.length > 0) {
                      set((state) => ({
                        issues: [
                          ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4 && i.type === 'parser-error')),
                          ...parseResult.issues!.map(issue => ({ ...issue, runId })),
                        ],
                      }));
                    }

                    set({ lastOrderParserDiagnostics: parseResult.diagnostics ?? null });
                    // PROJ-28: Step 4 diagnostics
                    if (parseResult.diagnostics) {
                      get().setStepDiagnostics(4, {
                        stepNo: 4,
                        moduleName: parseResult.diagnostics.profileId,
                        confidence: parseResult.diagnostics.confidence,
                        summary: `${parseResult.positions.length} Bestellpositionen, Spalte: ${parseResult.diagnostics.selectedHeader || 'n/a'}`,
                        timestamp: new Date().toISOString(),
                      });
                    }

                    // Pre-Check Validierungsfehler (wissenschaftliche Notation / fehlende IDs)
                    if (parseResult.validationError) {
                      const parserIssue = buildOrderParserFailureIssue(
                        runId,
                        parseResult.diagnostics,
                        `Datei-Validierung fehlgeschlagen: ${parseResult.validationError}`,
                      );
                      set((state) => {
                        const updatedRun = state.runs.find(r => r.id === runId);
                        if (!updatedRun) return state;
                        const newRun: Run = {
                          ...updatedRun,
                          status: 'soft-fail',
                          steps: updatedRun.steps.map((step) =>
                            step.stepNo === 4
                              ? { ...step, status: 'failed', issuesCount: 1 }
                              : step,
                          ),
                        };
                        return {
                          runs: state.runs.map(r => r.id === runId ? newRun : r),
                          currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
                          issues: [
                            ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
                            parserIssue,
                          ],
                        };
                      });
                      logService.error(
                        `[OrderParser] Validierungsfehler blockiert Step 4: ${parseResult.validationError}`,
                        { runId, step: 'Bestellungen mappen' },
                      );
                      return;
                    }

                    const lowConfidence = parseResult.diagnostics?.confidence === 'low';
                    if (parseResult.positions.length === 0 || lowConfidence) {
                      const detailsPrefix = parseResult.positions.length === 0
                        ? 'Keine gueltigen offenen Bestellungen erkannt'
                        : 'Spaltenauswahl mit niedriger Confidence erkannt';
                      const parserIssue = buildOrderParserFailureIssue(runId, parseResult.diagnostics, detailsPrefix);
                      set((s) => {
                        const ur = s.runs.find(r => r.id === runId);
                        if (!ur) return s;
                        const newRun: Run = {
                          ...ur,
                          status: 'soft-fail',
                          steps: ur.steps.map((step) =>
                            step.stepNo === 4 ? { ...step, status: 'failed', issuesCount: 1 } : step
                          ),
                        };
                        return {
                          runs: s.runs.map(r => r.id === runId ? newRun : r),
                          currentRun: s.currentRun?.id === runId ? newRun : s.currentRun,
                          issues: [...s.issues.filter(i => !(i.runId === runId && i.stepNo === 4)), parserIssue],
                        };
                      });
                      logService.error(`Order-Parser Gate blockiert Step 4: ${detailsPrefix}`, { runId, step: 'Bestellungen mappen' });
                      return;
                    }
                    get().executeOrderMapping(parseResult.positions);
                    const t4adv1 = setTimeout(() => {
                      if (get().isPaused) return;
                      const afterOrder = get();
                      const ur = afterOrder.runs.find(r => r.id === runId);
                      const s4 = ur?.steps.find(s => s.stepNo === 4);
                      if (s4 && (s4.status === 'ok' || s4.status === 'soft-fail')) {
                        logService.info('Resume Auto-Advance: Step 4 → Step 5', { runId, step: 'System' });
                        afterOrder.advanceToNextStep(runId);
                      }
                    }, 100);
                    set({ autoAdvanceTimer: t4adv1 });
                  })
                  .catch((err) => {
                    logService.error(`OrderParser fehlgeschlagen: ${err instanceof Error ? err.message : err}`, { runId, step: 'Bestellungen mappen' });
                    get().updateStepStatus(runId, 4, 'failed');
                  });
              });
            } else {
              logService.info('Keine Bestell-Datei geladen — Step 4 wird uebersprungen', { runId, step: 'Bestellungen mappen' });
              get().updateStepStatus(runId, 4, 'ok');
              const t4adv2 = setTimeout(() => {
                if (get().isPaused) return;
                const afterOrder = get();
                const ur = afterOrder.runs.find(r => r.id === runId);
                const s4 = ur?.steps.find(s => s.stepNo === 4);
                if (s4 && (s4.status === 'ok' || s4.status === 'soft-fail')) {
                  logService.info('Resume Auto-Advance: Step 4 → Step 5', { runId, step: 'System' });
                  afterOrder.advanceToNextStep(runId);
                }
              }, 100);
              set({ autoAdvanceTimer: t4adv2 });
            }
          } else {
            logService.info('Legacy OrderMatcher — manueller Start erforderlich', { runId, step: 'Bestellungen mappen' });
            get().updateStepStatus(runId, 4, 'ok');
            const t4legacy = setTimeout(() => {
              if (get().isPaused) return;
              get().advanceToNextStep(runId);
            }, 100);
            set({ autoAdvanceTimer: t4legacy });
          }
        }
      }, 100);
      set({ autoAdvanceTimer: t4 });
    }
    // Steps 1 and 5 have no auto-execution logic to re-trigger
  },

  // PROJ-12 / PROJ-27-ADDON-2: Write archive package to disk
  archiveRun: async (runId) => {
    const state = get();
    const run = state.runs.find(r => r.id === runId);
    if (!run) {
      logService.warn('archiveRun: Run nicht gefunden', { runId, step: 'Archiv' });
      return { success: false, folderName: '' };
    }

    const lines = state.invoiceLines.filter(l => l.lineId.startsWith(runId));

    if (run.archivePath) {
      // PROJ-27-ADDON-2: Early Archive existiert → nur finale Daten anhängen
      const result = await archiveService.appendToArchive(run.archivePath, run, lines, {
        preFilteredSerials: state.preFilteredSerials,
        issues: state.issues,
      });
      if (result.success) {
        logService.exportRunLog(runId).catch(() => {});
      }
      return { success: result.success, folderName: run.archivePath };
    } else {
      // Legacy-Fallback: Kein Early Archive → volles Paket schreiben
      const result = await archiveService.writeArchivePackage(run, lines, {
        preFilteredSerials: state.preFilteredSerials,
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

    const runId = get().currentRun?.id;
    if (runId) {
      logService.info(`Manueller Preis: ${price}`, { runId, step: 'Artikel extrahieren', details: `lineId=${lineId}` });
      get().addAuditEntry({ runId, action: 'setManualPrice', details: `lineId=${lineId}, price=${price}`, userId: 'system' });
    }

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

  // ─── PROJ-42-ADD-ON: Buchungsdatum (einmalig beim ersten Export) ───

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

  // ─── PROJ-42-ADD-ON-V: Export-Versionierung ───

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
      logService.error(`Bestell-Matching fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Bestellungen mappen',
      });

      // Set step 4 to failed so the UI doesn't hang
      get().updateStepStatus(runId, 4, 'failed');
    }
  },

  // PROJ-23: 3-Run Matching Engine on aggregated positions (replaces PROJ-20 legacy waterfall)
  executeOrderMapping: (parsedOrders) => {
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

      if (runLines.length === 0) {
        console.warn('[RunStore] executeOrderMapping: no invoiceLines found for run');
        get().updateStepStatus(runId, 4, 'ok');
        return;
      }

      // Phase A3: Build Article-First OrderPool (2-of-3 per-article scoring)
      const masterArticles = useMasterDataStore.getState().articles;
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
    } catch (error) {
      logService.error(`MatchingEngine fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Bestellungen mappen',
      });
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

    const runId = currentRun.id;
    logService.info(`Manuelle Bestellung: ${orderYear}-${orderCode}`, { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}` });
    get().addAuditEntry({ runId, action: 'setManualOrder', details: `lineId=${lineId}, order=${orderYear}-${orderCode}`, userId: 'system' });
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

    const runId = currentRun.id;
    logService.info('Keine Bestellung bestätigt', { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}` });
    get().addAuditEntry({ runId, action: 'confirmNoOrder', details: `lineId=${lineId}`, userId: 'system' });
  },

  // ─── PROJ-23 Phase A5: Manual Reassignment ───────────────────────────

  reassignOrder: (lineId, newOrderPositionId, freeText) => {
    const { invoiceLines, issues, orderPool, currentRun } = get();
    if (!currentRun) {
      console.warn('[RunStore] reassignOrder: no currentRun');
      return;
    }
    const runId = currentRun.id;
    const line = invoiceLines.find(l => l.lineId === lineId);
    if (!line) {
      console.warn(`[RunStore] reassignOrder: line ${lineId} not found`);
      return;
    }

    // Step a: Return previous allocation back to pool (if any)
    if (orderPool && line.allocatedOrders.length > 0) {
      const oldOrderNumber = line.allocatedOrders[0].orderNumber;
      for (const [posId, entry] of orderPool.byId) {
        const compositeKey = `${entry.position.orderYear}-${entry.position.orderNumber}`;
        if (compositeKey === oldOrderNumber) {
          returnToPool(orderPool, posId, 1);
          break;
        }
      }
    }

    // Step b: Consume new order from pool (if not "NEW")
    let newAllocatedOrders: import('@/types').AllocatedOrder[] = [];
    let newOrderNumber: string | null = null;

    if (newOrderPositionId !== 'NEW' && orderPool) {
      const consumed = consumeFromPool(orderPool, newOrderPositionId, 1);
      if (consumed) {
        const entry = orderPool.byId.get(newOrderPositionId);
        if (entry) {
          newOrderNumber = `${entry.position.orderYear}-${entry.position.orderNumber}`;
          newAllocatedOrders = [{
            orderNumber: newOrderNumber,
            orderYear: entry.position.orderYear,
            qty: 1,
            reason: 'manual-ok' as const,
          }];
        }
      }
    } else if (newOrderPositionId === 'NEW' && freeText?.trim()) {
      newOrderNumber = freeText.trim();
      const yearPart = parseInt(newOrderNumber.split('-')[0]) || 0;
      newAllocatedOrders = [{
        orderNumber: newOrderNumber,
        orderYear: yearPart,
        qty: 1,
        reason: 'manual-ok' as const,
      }];
    }

    // Step c: Update the line
    const updatedLines = invoiceLines.map(l =>
      l.lineId === lineId
        ? {
            ...l,
            allocatedOrders: newAllocatedOrders,
            orderNumberAssigned: newOrderNumber,
            orderAssignmentReason: 'manual-ok' as const,
          }
        : l
    );

    // Step d: Auto-resolve issues that are no longer active
    const resolvedIssues = autoResolveIssues(issues, updatedLines, runId);

    // Update order stats
    const runLines = updatedLines.filter(l => l.lineId.startsWith(runId));
    const orderStats = computeOrderStats(runLines);

    set((state) => ({
      invoiceLines: updatedLines,
      issues: resolvedIssues,
      // Spread pool to trigger Zustand reactivity after in-place mutations
      orderPool: orderPool ? { ...orderPool } : null,
      runs: state.runs.map(r =>
        r.id === runId ? { ...r, stats: { ...r.stats, ...orderStats } } : r
      ),
      currentRun: state.currentRun?.id === runId
        ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...orderStats } }
        : state.currentRun,
    }));

    logService.info(`Bestellung umgewiesen`, { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}, target=${newOrderPositionId ?? freeText ?? 'none'}` });
    get().addAuditEntry({ runId, action: 'reassignOrder', details: `lineId=${lineId}, target=${newOrderPositionId ?? freeText ?? 'none'}`, userId: 'system' });
  },

  // ─── PROJ-16/19: Matcher-based Cross-Match (Step 2) ──────────────────

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

    // PROJ-19: Source articles from global masterDataStore, NOT from caller
    const articles = useMasterDataStore.getState().articles;
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
          priceCheckStatus: matched.priceCheckStatus,
          unitPriceFinal: matched.unitPriceFinal,
        };
      });

      // Determine step 2 status
      const noMatchCount = result.stats.noMatchCount ?? 0;
      const step2Status: StepStatus = noMatchCount > 0 ? 'soft-fail' : 'ok';

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

      // New: price-mismatch issue (warning)
      const priceMismatchLines = enrichedLines.filter(l => l.priceCheckStatus === 'mismatch');
      if (priceMismatchLines.length > 0) {
        // Deduplicate by positionIndex (enrichedLines may have multiple expansion rows per position)
        const seenPositions = new Set<number>();
        const uniquePriceMismatch = priceMismatchLines.filter(l => {
          if (seenPositions.has(l.positionIndex)) return false;
          seenPositions.add(l.positionIndex);
          return true;
        });
        step2Issues.push({
          id: `issue-${runId}-step2-price-mismatch-${Date.now()}`,
          runId,
          severity: 'warning',
          stepNo: 2,
          type: 'price-mismatch',
          message: `${uniquePriceMismatch.length} Positionen mit Preisabweichung`,
          details: uniquePriceMismatch.slice(0, 15).map(l =>
            `Pos ${l.positionIndex}: ${l.unitPriceInvoice.toFixed(2)}€ vs ${(l.unitPriceSage ?? 0).toFixed(2)}€`
          ).join(', ') + (uniquePriceMismatch.length > 15 ? ` ... (+${uniquePriceMismatch.length - 15} weitere)` : ''),
          relatedLineIds: priceMismatchLines.map(l => l.lineId),
          status: 'open',
          createdAt: now21,
          resolvedAt: null,
          resolutionNote: null,
          context: { field: 'priceCheckStatus', expectedValue: 'ok', actualValue: 'mismatch' },
        });
      }

      // New: inactive-article issue (info)
      const inactiveLines = enrichedLines.filter(l => l.activeFlag === false && l.matchStatus !== 'no-match');
      if (inactiveLines.length > 0) {
        const seenPositions = new Set<number>();
        const uniqueInactive = inactiveLines.filter(l => {
          if (seenPositions.has(l.positionIndex)) return false;
          seenPositions.add(l.positionIndex);
          return true;
        });
        step2Issues.push({
          id: `issue-${runId}-step2-inactive-${Date.now()}`,
          runId,
          severity: 'info',
          stepNo: 2,
          type: 'inactive-article',
          message: `${uniqueInactive.length} inaktive Artikel im Stamm`,
          details: uniqueInactive.slice(0, 15).map(l =>
            `Pos ${l.positionIndex}: ${l.falmecArticleNo ?? l.manufacturerArticleNo}`
          ).join(', ') + (uniqueInactive.length > 15 ? ` ... (+${uniqueInactive.length - 15} weitere)` : ''),
          relatedLineIds: inactiveLines.map(l => l.lineId),
          status: 'open',
          createdAt: now21,
          resolvedAt: null,
          resolutionNote: null,
          context: { field: 'activeFlag', expectedValue: 'true', actualValue: 'false' },
        });
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
    } catch (error) {
      logService.error(`Matcher Cross-Match fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Artikel extrahieren',
      });
      get().updateStepStatus(runId, 2, 'failed');
    }
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

        const strictSerialRequiredFailure = currentRun.config.strictSerialRequiredFailure ?? true;
        const checksumMatch = assignedCount === requiredCount;
        const shouldHardFail = strictSerialRequiredFailure && !checksumMatch;
        const step3Status: StepStatus = checksumMatch ? 'ok' : (shouldHardFail ? 'failed' : 'soft-fail');

        // PROJ-21: Enriched serial-mismatch issue with per-position details + context
        const step3Issues: Issue[] = [];
        if (!checksumMatch) {
          const underServedLines = updatedRunLines.filter(l => l.serialRequired && l.serialNumbers.length < l.qty);
          step3Issues.push({
            id: `issue-${runId}-step3-sn-mismatch-${Date.now()}`,
            runId,
            severity: shouldHardFail ? 'error' : 'warning',
            stepNo: 3,
            type: 'serial-mismatch',
            message: shouldHardFail
              ? `Pflicht-S/N fehlen: ${assignedCount}/${requiredCount} zugewiesen`
              : `S/N Zuordnung unvollständig: ${assignedCount}/${requiredCount} zugewiesen`,
            details: underServedLines.slice(0, 20).map(l =>
              `Pos ${l.positionIndex}: ${l.serialNumbers.length}/${l.qty} S/N`
            ).join(', ') + (underServedLines.length > 20 ? ` ... (+${underServedLines.length - 20} weitere)` : ''),
            relatedLineIds: underServedLines.map(l => l.lineId),
            affectedLineIds: underServedLines.map(l => l.lineId),  // PROJ-41: Fehlercenter-Rendering
            status: 'open',
            createdAt: new Date().toISOString(),
            resolvedAt: null,
            resolutionNote: null,
            context: { field: 'serialNumbers', expectedValue: 'qty', actualValue: `${assignedCount}/${requiredCount}` },
          });

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
    } catch (error) {
      console.error('[RunStore] executeMatcherSerialExtract error:', error);
      logService.error(`Matcher Serial-Extraktion fehlgeschlagen: ${error instanceof Error ? error.message : error}`, {
        runId,
        step: 'Seriennummer anfuegen',
      });
      get().updateStepStatus(runId, 3, 'failed');
    }
  },

  // ── PROJ-23 Phase A2: Persistence actions ──────────────────────────

  loadPersistedRun: async (runId: string) => {
    try {
      const data = await runPersistenceService.loadRun(runId);
      if (!data) {
        console.warn(`[RunStore] No persisted run found for: ${runId}`);
        return false;
      }

      set((state) => {
        // Merge persisted run into runs array (replace if exists, add if not)
        const existingIndex = state.runs.findIndex(r => r.id === runId);
        const updatedRuns = existingIndex >= 0
          ? state.runs.map(r => r.id === runId ? data.run : r)
          : [data.run, ...state.runs];

        // Merge invoice lines: remove old lines for this run, add persisted
        const linePrefix = `${runId}-line-`;
        const otherLines = state.invoiceLines.filter(l => !l.lineId.startsWith(linePrefix));

        // Merge issues: remove old issues for this run, add persisted
        const otherIssues = state.issues.filter(i => i.runId !== runId);

        // Merge audit log: remove old entries for this run, add persisted
        const otherAudit = state.auditLog.filter(a => a.runId !== runId);

        return {
          runs: updatedRuns,
          currentRun: data.run,
          invoiceLines: [...data.invoiceLines, ...otherLines],
          issues: [...data.issues, ...otherIssues],
          auditLog: [...data.auditLog, ...otherAudit],
          parsedPositions: data.parsedPositions,
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
      console.error('[RunStore] Failed to load persisted run:', error);
      return false;
    }
  },

  loadPersistedRunList: async () => {
    try {
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
}));
