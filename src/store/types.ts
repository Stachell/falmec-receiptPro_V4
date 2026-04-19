// ── PROJ-46 AP4c — Store-Typen (Mechaniker-Extraktion aus runStore.ts) ──────
// Dieser Modul-Split löst Zirkelbezüge zwischen den Slice-Dateien und dem
// Aggregator (runStore.ts). Jede Slice-Datei importiert `RunState` (und ggf.
// `FileSnapshot`/`IngestResult`/`ManualArticleData`) AUSSCHLIESSLICH aus
// `@/store/types`. runStore.ts re-exportiert diese Typen für externe Consumer,
// damit bestehende `import { ... } from '@/store/runStore'`-Pfade nicht brechen.

import type {
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
  ParsedOrderPosition,
  OrderParserSelectionDiagnostics,
  StepDiagnostics,
  PreFilteredSerialRow,
} from '@/types';
import type { ParsedInvoiceResult } from '@/services/invoiceParserService';
import type { SerialDocument } from '@/services/matchers/types';
import type {
  PersistedRunSummary,
  StorageStats,
  PersistedRunData,
} from '@/services/runPersistenceService';
import type { OrderPool } from '@/services/matching/orderPool';

// PROJ-45-ADD-ON-round4: Formulardaten für manuellen Artikel-Fix im IssueDialog
export interface ManualArticleData {
  falmecArticleNo: string;
  manufacturerArticleNo?: string;
  ean?: string;
  serialRequired?: boolean;
  storageLocation?: string;
  descriptionDE?: string;
  supplierId?: string;
  orderNumberAssigned?: string;
  unitPriceSage?: number;       // PROJ-45-R5: Manueller Sage ERP Netto-Preis
  quantity?: number;            // PROJ-45-R5: Manuelle Rechnungsmenge
  serialNumbers?: string[];     // PROJ-45-R5: Manuell eingegebene Seriennummern
}

// ── PROJ-49 SSOT: Phase-1 Interfaces ───────────────────────────────────────

/** Snapshot der Upload-Dateien VOR resetRunSensitiveState — run-isoliert für Phase 1 */
export interface FileSnapshot {
  invoice:     UploadedFile | undefined;
  articleList: UploadedFile | undefined;
  serialList:  UploadedFile | undefined;
  openWE:      UploadedFile | undefined;
}

/** Ergebnis von ingestAndPersistRunData() */
export interface IngestResult {
  allReady: boolean;
  failedSources: string[];
}

// ── PROJ-46 AP4b — Leitplanke R8 (Primärwriter-Regel) ─────────────────────────
// Run-sensitive Felder haben genau EINEN Primärwriter-Slice (siehe
// src/store/internal/ownership.md, AP4a). Sekundäre Writer MÜSSEN durch
// Actions des Primär-Slices gehen. Direkte `set({ feld: ... })`-Aufrufe auf
// fremde Felder sind ab AP4c verboten.
// Physische Verankerung erfolgt ab AP4c (mechanischer Slice-Move).
export interface RunState {
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
  /** PROJ-44: Step 4 Waiting Point — true solange Workflow vor Step 4 auf User wartet */
  isWaitingBeforeStep4: boolean;
  /** PROJ-44: Step 4 Waiting Point — RunId des wartenden Runs */
  waitingStep4RunId: string | null;
  /** PROJ-44: Step 4 Waiting Point — Steuert AlertDialog-Sichtbarkeit */
  showStep4WaitingDialog: boolean;

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
  /** PROJ-28: Write step diagnostics after a step completes */
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
  /** PROJ-39/43: Mark issue as escalated (status transitions to 'pending') */
  escalateIssue: (issueId: string, recipientEmail: string) => void;
  addAuditEntry: (entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) => void;

  // Parsing actions
  parseInvoice: (runId: string) => Promise<boolean>;
  setParsedInvoiceResult: (result: ParsedInvoiceResult | null) => void;
  clearParsedInvoice: () => void;
  setParsingProgress: (progress: string) => void;

  // Workflow actions
  advanceToNextStep: (runId: string, completedStepNo?: number) => void;
  retryStep: (runId: string, stepNo: number) => void;  // HOTFIX-2
  /** PROJ-44-R9: Re-Process — Steps 2-5 neu starten, Step 1 + invoiceLines bleiben */
  reprocessCurrentRun: (runId: string) => void;
  deleteRun: (runId: string) => void;
  /** PROJ-25: Pause a running run — clears auto-advance timer to prevent deadlock */
  pauseRun: (runId: string) => void;
  /** PROJ-25: Resume a paused run — resets isPaused and re-triggers advanceToNextStep */
  resumeRun: (runId: string) => void;
  /** PROJ-44: Step 4 Waiting Point — User waehlt STOP */
  dismissStep4WaitingDialog: () => void;
  /** PROJ-44: Step 4 Waiting Point — User waehlt DURCHFUEHREN */
  proceedStep4FromWaiting: () => void;
  /** PROJ-43: Generate / auto-resolve Step-5 issues (missing storage locations + no lines) */
  generateStep5Issues: (runId: string) => void;
  /** PROJ-43: Re-evaluate all open issues and generate fresh Step-5 issues */
  refreshIssues: (runId: string) => void;
  /** PROJ-43: Reopen a pending issue (pending → open) */
  reopenIssue: (issueId: string) => void;
  /** PROJ-46: Bestätigt einen Entwurf (draft→confirmed), resolved Issue, refresht Kaskade */
  confirmManualFix: (issueId: string, resolutionNote?: string) => void;
  /** PROJ-46: Bulk-Bestätigung aller Entwürfe mit 3-stufiger Validierung */
  bulkConfirmDraftIssues: (runId: string) => { success: boolean; message?: string };

  // PROJ-12: Archive & abort actions
  archiveRun: (runId: string) => Promise<{ success: boolean; folderName: string }>;
  abortRun: (runId: string) => void;

  // Run update with parsed data
  updateRunWithParsedData: (runId: string, result: ParsedInvoiceResult, autoAdvance?: boolean) => void;

  // PROJ-11 Phase B: Article matching (Step 2) — legacy, kept for backwards compat
  executeArticleMatching: (articles: ArticleMaster[]) => void;
  setManualPrice: (lineId: string, price: number) => void;
  /** PROJ-45: Bulk-Preis auf alle expandierten Zeilen einer Position setzen */
  setManualPriceByPosition: (positionIndex: number, price: number, runId: string) => void;
  /** PROJ-45-ADD-ON-round4: Manuellen Artikel-Fix auf alle expandierten Zeilen einer Position */
  setManualArticleByPosition: (positionIndex: number, data: ManualArticleData, runId: string) => void;
  /** PROJ-44-R11: Chirurgischer Artikel-Fix — nur einzelne ausgerollte Zeile, keine Geschwister */
  setManualArticleByLine: (lineId: string, data: ManualArticleData, runId: string) => void;
  /** PROJ-44-R6: Chirurgischer S/N-Update — ändert NUR serial-relevante Felder, keine Artikel/Preis/Match-Daten */
  updateLineSerialData: (positionIndex: number, serialRequired: boolean, serialNumbers: string[], runId?: string) => void;
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
  executeOrderMapping: (parsedOrders: ParsedOrderPosition[], idbData?: PersistedRunData | null) => void;
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

  // PROJ-49 SSOT: Phase-1-Ingest-Funktionen
  createRunSkeleton: () => Promise<string>;
  parseInvoiceForIngest: (runId: string, fileSnapshot: FileSnapshot) => Promise<string>;
  ingestAndPersistRunData: (runId: string, fileSnapshot: FileSnapshot) => Promise<IngestResult>;
  startWorkflowPhase2: (runId: string) => Promise<void>;
  cleanupFailedIngest: (runId: string) => Promise<void>;

  // PROJ-46 AP4c — Cross-Slice-Channel (R8/Leitplanke):
  // `currentParsedRunId` wohnt im runCrudSlice (Identitäts-Feld, ownership.md §1).
  // Sekundäre Writer (z. B. `ingestSlice.parseInvoiceForIngest` beim Rename,
  // `ingestSlice.setParsedInvoiceResult` beim Parse-Commit) schreiben das Feld
  // NICHT direkt per `set({ currentParsedRunId })`, sondern rufen diese Action.
  // Implementierung: runCrudSlice.assignParsedRunId → `set({ currentParsedRunId })`.
  assignParsedRunId: (runId: string | null) => void;
}
