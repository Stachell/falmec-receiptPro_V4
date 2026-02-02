export type StepStatus = 'not-started' | 'running' | 'ok' | 'soft-fail' | 'failed';

export type IssueSeverity = 'blocking' | 'soft-fail';

export type IssueType = 
  | 'order-assignment' 
  | 'serial-mismatch' 
  | 'price-mismatch' 
  | 'inactive-article' 
  | 'missing-storage-location' 
  | 'missing-ean';

export type PriceCheckStatus = 'ok' | 'mismatch' | 'pending';

export type SerialSource = 'serialList' | 'openWE' | 'manual' | 'none';

export type OrderAssignmentReason = 
  | 'direct-match' 
  | 'exact-qty-match' 
  | 'oldest-first' 
  | 'manual' 
  | 'not-ordered' 
  | 'pending';

export interface RunConfig {
  priceBasis: 'Net' | 'Gross';
  priceType: 'EK' | 'VK';
  tolerance: number;
  eingangsart: string;
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
}

export interface Run {
  id: string;
  createdAt: string;
  status: StepStatus;
  config: RunConfig;
  invoice: InvoiceHeader;
  stats: RunStats;
  steps: WorkflowStep[];
}

export interface InvoiceLine {
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
