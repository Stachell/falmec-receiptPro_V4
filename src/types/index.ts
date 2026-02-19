export type StepStatus = 'not-started' | 'running' | 'ok' | 'soft-fail' | 'failed';

export type IssueSeverity = 'blocking' | 'soft-fail';

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
  | 'conflict';

export type MatchStatus =
  | 'pending'
  | 'full-match'
  | 'code-it-only'
  | 'ean-only'
  | 'no-match';

export type PriceCheckStatus = 'pending' | 'ok' | 'mismatch' | 'missing' | 'custom';

export type SerialSource = 'serialList' | 'openWE' | 'manual' | 'none';

export type OrderAssignmentReason =
  | 'direct-match'
  | 'exact-qty-match'
  | 'oldest-first'
  | 'manual'
  | 'manual-ok'
  | 'not-ordered'
  | 'pending';

export interface RunConfig {
  priceBasis: 'Net' | 'Gross';
  priceType: 'EK' | 'VK';
  tolerance: number;
  eingangsart: string;
  clickLockSeconds: number;
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
  /** Total quantity sum from all positions */
  totalQty?: number;
  /** Number of parsed positions */
  parsedPositionsCount?: number;
  /** Physical PZ entries counted in UM column (= parsedPositionsCount) */
  pzCount?: number;
  /** Validation status: positions count vs totalQty */
  qtyValidationStatus?: 'ok' | 'mismatch' | 'unknown';
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
  unitPriceSage: number | null;
  activeFlag: boolean;
  priceCheckStatus: PriceCheckStatus;

  // --- PROJ-11: Position tracking ---
  positionIndex: number;
  expansionIndex: number;

  // --- PROJ-11: Match status ---
  matchStatus: MatchStatus;

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
}

export interface Issue {
  id: string;
  runId?: string;
  severity: IssueSeverity;
  stepNo: number;
  type: IssueType;
  message: string;
  details: string;
  relatedLineIds: string[];
  status: 'open' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
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
  };
}
