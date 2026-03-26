export type StepStatus = 'not-started' | 'running' | 'ok' | 'soft-fail' | 'failed' | 'paused';

// PROJ-21: 3-tier severity (migrated from 'blocking'|'soft-fail')
export type IssueSeverity = 'error' | 'warning' | 'info';

export type IssueType =
  | 'order-assignment'
  | 'serial-mismatch'
  | 'price-mismatch'
  | 'inactive-article'
  | 'missing-storage-location'
  | 'missing-ean'
  | 'parser-error'
  | 'no-article-match'
  | 'price-missing'
  | 'order-no-match'
  | 'conflict'
  // PROJ-17: Step 2 deep-logging subtypes
  | 'match-artno-not-found'
  | 'match-ean-not-found'
  | 'match-conflict-id'
  // PROJ-17: Step 3 deep-logging subtypes
  | 'sn-invoice-ref-missing'
  | 'sn-regex-failed'
  | 'sn-insufficient-count'
  // PROJ-21: Step 4 deep-logging subtypes
  | 'order-incomplete'
  | 'order-multi-split'
  | 'order-fifo-only'
  // PROJ-23 ADDON: Pool-empty guard
  | 'pool-empty-mismatch'
  // PROJ-40 ADD-ON: Per-line supplier validation
  | 'supplier-missing'
  // PROJ-43: Step 5 export issues
  | 'export-no-lines';

export type MatchStatus =
  | 'pending'
  | 'full-match'
  | 'code-it-only'
  | 'ean-only'
  | 'no-match';

export type PriceCheckStatus = 'pending' | 'ok' | 'mismatch' | 'missing' | 'custom';

export type SerialSource = 'serialList' | 'openWE' | 'manual' | 'none';

export type ArticleSource = 'matcher' | 'manual' | 'none';

// PROJ-46: Redaktionelle Phase manueller Korrekturen (orthogonal zu ArticleSource/PriceCheckStatus)
// undefined/'none' = Parser-Daten, 'draft' = Entwurf (blau), 'confirmed' = bestätigt (grün, gesperrt)
export type ManualStatus = 'none' | 'draft' | 'confirmed';

export type OrderAssignmentReason =
  | 'direct-match'
  | 'exact-qty-match'
  | 'oldest-first'
  | 'manual'
  | 'manual-ok'
  | 'not-ordered'
  | 'pending'
  // PROJ-20: 4-stage waterfall mapper reasons
  | 'perfect-match'
  | 'reference-match'
  | 'smart-qty-match'
  | 'fifo-fallback';

// PROJ-20: Partial order allocation on aggregated positions
export interface AllocatedOrder {
  orderNumber: string;    // e.g. "2025-10153"
  orderYear: number;
  qty: number;            // Partial quantity from this order
  reason: OrderAssignmentReason;
  vorgang?: string;       // 4-stellige Vorgangs-Nr. aus OpenWE (PROJ-40)
}

export type OrderParserConfidence = 'high' | 'medium' | 'low';

export interface OrderParserFieldAliases {
  orderNumberCandidates: string[];
  orderYear: string[];
  openQuantity: string[];
  artNoDE: string[];
  artNoIT: string[];
  ean: string[];
  supplierId: string[];
  belegnummer: string[];
  vorgang: string[];    // 4-stellige Vorgangs-Nr. (PROJ-40)
}

export interface OrderParserProfile {
  id: string;
  label: string;
  description?: string;
  aliases: OrderParserFieldAliases;
  orderNumberRegex: string;
  orderYearRegex: string;
  orderNumberTieBreakPriority?: string[];
}

export interface OrderParserProfileOverrides extends Partial<Omit<OrderParserProfile, 'aliases'>> {
  aliases?: Partial<OrderParserFieldAliases>;
}

export interface OrderParserCandidateScore {
  columnIndex: number;
  header: string;
  validCount: number;
  validRatio: number;
  nonEmptyCount: number;
  tieBreakRank: number;
}

export interface OrderParserSelectionDiagnostics {
  profileId: string;
  selectedColumnIndex: number;
  selectedHeader: string;
  confidence: OrderParserConfidence;
  candidates: OrderParserCandidateScore[];
}

// PROJ-28: Unified step diagnostics (all 4 steps, stored in RunState.latestDiagnostics)
export interface StepDiagnostics {
  stepNo: 1 | 2 | 3 | 4;
  moduleName: string;
  confidence: 'high' | 'medium' | 'low';
  /** Free-text summary, e.g. "14/15 Positionen gematcht" */
  summary: string;
  /** Optional detail lines for expandable display */
  detailLines?: string[];
  timestamp: string; // ISO
}

// PROJ-28: Field aliases for the Matcher (Step 2), analogous to OrderParserFieldAliases
export interface MatcherFieldAliases {
  artNoDE: string[];
  artNoIT: string[];
  ean: string[];
  falmecArticleNo: string[];
}

// PROJ-28: Runtime overrides for the Matcher module (Step 2)
export interface MatcherProfileOverrides {
  enabled: boolean;
  aliases?: Partial<MatcherFieldAliases>;
  /** Regex to match Falmec Art-Nr (DE) values */
  artNoDeRegex?: string;
  /** Regex to match EAN values */
  eanRegex?: string;
  /** Regex to match manufacturer/supplier article numbers */
  manufacturerNoRegex?: string;
}

export interface RunConfig {
  priceBasis: 'Net' | 'Gross';
  priceType: 'EK' | 'VK';
  tolerance: number;
  eingangsart: string;
  clickLockSeconds: number;
  // PROJ-20: Active module selection
  activeSerialFinderId: string;   // Default: 'default'
  activeOrderMapperId: string;    // Default: 'engine-proj-23'
  activeOrderParserProfileId: string; // Default: 'sage-openwe-v1'
  orderParserProfileOverrides?: OrderParserProfileOverrides;
  strictSerialRequiredFailure: boolean; // Default: true
  // PROJ-28: Block-Step toggles
  /** If true, completing Step 2 is blocked while open price-mismatch errors exist */
  blockStep2OnPriceMismatch: boolean; // Default: false
  /** If true, completing Step 4 is blocked while open order-assignment errors exist */
  blockStep4OnMissingOrder: boolean;  // Default: false
  // PROJ-28: Matcher override config (Step 2)
  matcherProfileOverrides?: MatcherProfileOverrides;
  // PROJ-44: Step 4 Waiting Point — true = Auto-Start (Default), false = Stopp vor Step 4
  autoStartStep4: boolean;
}

export interface RunStats {
  parsedInvoiceLines: number;
  matchedOrders: number;
  notOrderedCount: number;
  serialMatchedCount: number;
  mismatchedGroupsCount: number;
  articleMatchedCount: number;
  inactiveArticlesCount: number;
  priceOkCount: number;
  priceMismatchCount: number;
  exportReady: boolean;

  // PROJ-11 additions
  expandedLineCount: number;
  fullMatchCount: number;
  codeItOnlyCount: number;
  eanOnlyCount: number;
  noMatchCount: number;
  serialRequiredCount: number;
  priceMissingCount: number;
  priceCustomCount: number;
  manualOkOrderCount: number;

  // PROJ-20: 4-stage waterfall mapper stats
  perfectMatchCount: number;
  referenceMatchCount: number;
  smartQtyMatchCount: number;
  fifoFallbackCount: number;

  /** PROJ-42-ADD-ON: Buchungsdatum DD.MM.YYYY, einmalig beim ersten Export gesetzt. */
  bookingDate?: string;

  /** PROJ-42-ADD-ON-V: Export-Version Counter (1=erster Export kein Suffix, 2=_v1, 3=_v2, etc.) */
  exportVersion?: number;
}

export interface WorkflowStep {
  stepNo: number;
  name: string;
  status: StepStatus;
  issuesCount: number;
}

export interface InvoiceHeader {
  fattura: string;
  invoiceDate: string;
  deliveryDate: string | null;
  /** Number of packages (from invoice) */
  packagesCount?: number | null;
  /** Invoice total amount in EUR (from parser footer) */
  invoiceTotal?: number | null;
  /** Total quantity sum from all positions */
  totalQty?: number;
  /** Number of parsed positions */
  parsedPositionsCount?: number;
  /** Physical PZ entries counted in UM column (= parsedPositionsCount) */
  pzCount?: number;
  /** Validation status: positions count vs totalQty */
  qtyValidationStatus?: 'ok' | 'mismatch' | 'unknown';
  /** Frozen snapshot: Σ(qty) of all invoice lines at parse time. Never overwritten by later steps. */
  targetArticleCount?: number;
  /** Frozen snapshot: number of distinct invoice positions at parse time. Never overwritten by later steps. */
  targetPositionsCount?: number;
}

/** Order status from invoice parsing */
export type InvoiceOrderStatus = 'YES' | 'NO' | 'check';

/** Extended invoice line with order candidates (from parsing) */
export interface ParsedInvoiceLineExtended {
  positionIndex: number;
  manufacturerArticleNo: string;
  ean: string;
  descriptionIT: string;
  quantityDelivered: number;
  unitPrice: number;
  totalPrice: number;
  orderCandidates: string[];
  orderCandidatesText: string;
  orderStatus: InvoiceOrderStatus;
}

/** Parser warning from invoice parsing */
export interface InvoiceParserWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  positionIndex?: number;
}

export interface Run {
  id: string;
  createdAt: string;
  status: StepStatus;
  config: RunConfig;
  invoice: InvoiceHeader;
  stats: RunStats;
  steps: WorkflowStep[];
  /** Folder name of the archive package (set after successful export/archiving) */
  archivePath?: string | null;
  /** PROJ-23: Whether invoiceLines have been expanded from aggregated (qty>1) to individual (qty=1) lines.
   *  Set to true after Run 3 of the MatchingEngine. Before that, lines are aggregated. */
  isExpanded: boolean;
  /** PROJ-44-R6: Unzugeordnete Seriennummern aus Step 3 (EAN ohne passende Rechnungsposition) */
  orphanSerials: string[];
}

export interface InvoiceLine {
  // --- existing fields ---
  lineId: string;
  manufacturerArticleNo: string;
  ean: string;
  descriptionIT: string;
  qty: number;
  unitPriceInvoice: number;
  totalLineAmount: number;
  orderNumberAssigned: string | null;
  orderAssignmentReason: OrderAssignmentReason;
  serialNumber: string | null;
  serialSource: SerialSource;
  falmecArticleNo: string | null;
  descriptionDE: string | null;
  storageLocation: string | null;
  /** Unveraenderliche Lagerort-Gruppe, gesetzt beim Matching. Nur fuer UI-Filtering. */
  logicalStorageGroup: 'WE' | 'KDD' | null;
  unitPriceSage: number | null;
  activeFlag: boolean;
  priceCheckStatus: PriceCheckStatus;

  // --- PROJ-11: Position tracking ---
  positionIndex: number;
  expansionIndex: number;

  // --- PROJ-11: Match status ---
  matchStatus: MatchStatus;

  // --- PROJ-44-R9: Article source tracking ---
  articleSource?: ArticleSource;

  // --- PROJ-46: Entwurf/Bestätigt-Phase manueller Korrekturen ---
  manualStatus?: ManualStatus;

  // --- PROJ-11: Serial requirement ---
  serialRequired: boolean;

  // --- PROJ-11: Final price ---
  unitPriceFinal: number | null;

  // --- PROJ-11: Order data (from openWE) ---
  orderYear: number | null;
  orderCode: string | null;
  orderVorgang: string | null;
  orderOpenQty: number | null;

  // --- PROJ-11: Supplier ---
  supplierId: string | null;

  // --- PROJ-20: Aggregated S/N data (array per position instead of expansion) ---
  serialNumbers: string[];

  // --- PROJ-20: Aggregated order allocations (partial quantities per order) ---
  allocatedOrders: AllocatedOrder[];
}

export interface OpenWEPosition {
  id: string;
  belegnummer: string;
  vorgang: string;
  orderYear: number;
  supplierId: string;
  manufacturerArticleNo: string;
  ean: string;
  openQty: number;
  orderedQty: number;
  serial?: string;
}

export interface SerialListItem {
  id: string;
  deliveryDate: string;
  fattura: string;
  manufacturerArticleNo: string;
  descriptionIT: string;
  serialNumber: string;
  ean: string;
  groupQty: number | null;
}

export interface ArticleMaster {
  id: string;
  falmecArticleNo: string;
  manufacturerArticleNo: string;
  ean: string;
  storageLocation: string;
  unitPriceNet: number;
  activeFlag: boolean;
  serialRequirement: boolean;
  descriptionDE: string | null;   // "Artikelmatchcode" aus Sage-Artikelliste (PROJ-40)
  supplierId: string | null;      // 5-stellige Lieferantennummer aus Sage (PROJ-40)
}

export interface Issue {
  id: string;
  runId?: string;
  severity: IssueSeverity;
  stepNo: number;
  type: IssueType;
  message: string;
  details: string;
  relatedLineIds: string[];          // PROJ-21: for jump-link navigation + auto-resolve — DO NOT CHANGE
  affectedLineIds: string[];         // PROJ-37: descriptive list for UI rendering only
  // PROJ-43: 'pending' added — escalated issues awaiting external response
  status: 'open' | 'pending' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  // PROJ-21: Optional context for jump-links and auto-resolve
  context?: {
    positionIndex?: number;        // Aggregated position (1-based)
    field?: string;                // Affected field (e.g. 'priceCheckStatus', 'serialNumber')
    expectedValue?: string;        // Expected value (for auto-resolve check)
    actualValue?: string;          // Current value
  };
  // PROJ-39: Escalation fields (PROJ-43: escalateIssue now sets status to 'pending')
  escalatedAt?: string;            // ISO timestamp when issue was escalated (optional)
  escalatedTo?: string;            // Recipient email address (optional)
}

export interface AuditLogEntry {
  id: string;
  runId: string;
  timestamp: string;
  action: string;
  details: string;
  userId: string;
}

export interface UploadedFile {
  name: string;
  size: number;
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList';
  rowCount?: number;
  file: File;
  uploadedAt: string; // ISO timestamp [DD.MM.YY-HH:mm:ss]
}

// Upload status for traffic light indicator
export type UploadStatus = 'ready' | 'missing' | 'warning' | 'critical';

export const STORAGE_LOCATIONS = [
  'WE Lager;0;0;0',
  'WE KDD;0;0;0',
  'LKW 5 Weber',
  'LKW 6 Weber',
  'LKW 7 Weber',
] as const;

export type StorageLocation = typeof STORAGE_LOCATIONS[number];

export const EINGANGSART_OPTIONS = [
  'Standard',
  'Retoure',
  'Reklamation',
  'Muster',
  'Sondereingang',
] as const;

// PROJ-20: Expanded view line for UI display and XML export (derived from aggregated InvoiceLine)
export interface ExpandedViewLine extends Omit<InvoiceLine, 'serialNumbers' | 'allocatedOrders'> {
  /** Index within the expansion (0..qty-1) */
  expansionIndex: number;
  /** Single serial number for this expanded line (from serialNumbers[i]) */
  serialNumber: string | null;
  /** Single allocated order for this expanded line */
  allocatedOrder: AllocatedOrder | null;
  /** Unique line ID for the expanded view */
  lineId: string;
}

// PROJ-20: Parsed order position (from orderParser)
export interface ParsedOrderPosition {
  id: string;
  artNoDE: string;
  ean: string;
  artNoIT: string;
  supplierId: string;
  openQuantity: number;
  orderNumber: string;    // Regex /^1\d{4}$/
  orderYear: number;      // Regex /^\d{4}$/
  belegnummer: string;
  vorgang: string;        // 4-stellige Vorgangs-Nr. (PROJ-40)
}

export interface OrderParseResult {
  positions: ParsedOrderPosition[];
  rowCount: number;
  warnings: string[];
  issues?: Issue[];       // PROJ-40: strukturierte Issues (z.B. Vorgang-Validierung)
  diagnostics?: OrderParserSelectionDiagnostics;
  /** Set wenn der Pre-Check einen harten Validierungsfehler erkannt hat. Trigger für Step-4-Abort im runStore. */
  validationError?: string;
}

// PROJ-20: Pre-filtered serial row (from serialFinder pre-filter step)
export interface PreFilteredSerialRow {
  serialNumber: string;
  ean: string;
  artNoIT: string;
  invoiceReference: string;
  sourceRowIndex: number;
}

// PROJ-20: Lean archive entry for S/N data (no raw files, no invoiceReference)
export interface LeanSerialArchiveEntry {
  ean: string;
  artNoIT: string;
  serialNumber: string;
  sourceRowIndex: number;
}

// PROJ-35: Export column configuration types
// PROJ-40: 'qty' → 'supplierId', 'eingangsart' → 'orderVorgang'
// PROJ-42-ADD-ON: 'unitPriceInvoice'+'unitPriceOrder' → 'unitPrice', added 'bookingDate'
export type ExportColumnKey =
  | 'manufacturerArticleNo'
  | 'ean'
  | 'falmecArticleNo'
  | 'descriptionDE'
  | 'descriptionIT'
  | 'supplierId'
  | 'unitPrice'
  | 'bookingDate'
  | 'totalPrice'
  | 'orderNumberAssigned'
  | 'orderDate'
  | 'serialNumber'
  | 'storageLocation'
  | 'orderVorgang'
  | 'fattura';

export interface ExportColumnMapping {
  position: number;           // 1–15
  columnKey: ExportColumnKey;
  label: string;              // Anzeigename (deutsch)
}

export interface ExportDiagnostics {
  timestamp: string;
  fileName: string;
  lineCount: number;
  status: 'success' | 'error';
  message?: string;
}

// PROJ-12: Archive package metadata written to metadata.json on disk
export interface ArchiveMetadata {
  version: 1;
  runId: string;
  fattura: string;
  invoiceDate: string;
  createdAt: string;
  archivedAt: string;
  status: 'completed' | 'aborted' | 'failed';

  config: {
    eingangsart: string;
    tolerance: number;
    currency: string;
    preisbasis: string;
  };

  stats: {
    parsedPositions: number;
    expandedLines: number;
    fullMatchCount: number;
    noMatchCount: number;
    exportedLines: number;
  };

  files: {
    invoice: { name: string; size: number } | null;
    warenbegleitschein: { name: string; size: number } | null;
    exportXml: { name: string; size: number } | null;
    exportCsv: { name: string; size: number } | null;
    artikelstamm: { name: string; size: number } | null;
    offeneBestellungen: { name: string; size: number } | null;
    // PROJ-20: Lean serial archive (JSON, not raw Excel)
    serialData: { name: string; size: number } | null;
    // PROJ-21: Run report with issues summary
    runReport: { name: string; size: number } | null;
  };
}
