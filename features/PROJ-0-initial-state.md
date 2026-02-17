# PROJ-0: Initial Project State & Architecture

## 1. Project Overview
- **Name:** `vite_react_shadcn_ts` (from `package.json`)
- **Core Purpose:** Browser-based inbound-goods processing cockpit for Fattura invoices: upload source files, parse invoice PDF, validate and review positions/issues, assign storage locations, and produce export files (incl. Sage100-style XML import payloads).
- **Target Audience:** Internal operations users in inbound logistics/warehouse, purchasing/backoffice, and ERP operators handling receipt booking and reconciliation.

## 2. Technical Stack (Detected)
- **Framework:** React 18.3.1 + Vite 5.4.19 + TypeScript 5.8.3; routing via React Router 6.30.1.
- **UI Library:** shadcn/ui component set (Radix primitives), Tailwind CSS 3.4.17, lucide-react icons.
- **State Management:** Zustand (`src/store/runStore.ts`) as central app state; React Query provider exists in `src/App.tsx` but no active query usage was detected in feature code.
- **Current Data Source:**
  - In-browser persistence via `localStorage` (runs/archive/logs/config fragments).
  - File binary persistence via `IndexedDB` (`falmec-receiptpro-files` DB, `uploadedFiles` store).
  - Local filesystem integration via File System Access API (`showDirectoryPicker`) for `.Archiv`, `.logs`, and `Temp/.del` output.
  - Optional local parser backend call via `fetch()` to `http://localhost:8090` (devlogic parser mode).
  - **No Supabase client usage or remote database integration detected in `src/`.**

## 3. Feature Inventory (Reverse Engineered)
Routing is defined in `src/App.tsx` (no active `src/app` directory; pages live in `src/pages`).

- **`/` (Index / Dashboard Wareneingang):** User can review processing runs, inspect status and issue counts, open archive details, open run logs, download XML/CSV/JSON exports, delete runs (with recycle-bin backup), and jump into run detail.
- **`/new-run` (Neuer Verarbeitungslauf):** User can upload all required files, reuse previously persisted uploads, ensure/select local data directory, and start a new parsing workflow.
- **`/run/:runId` (Run Detail):** User can monitor workflow progress, read parser alerts, inspect parsed invoice positions, manage issues, assign warehouse locations, trigger reprocessing, and export XML.
- **`*` (NotFound):** User receives a 404 page and can navigate back to start.

## 4. Component Architecture
- **Important Smart Components (logic heavy):**
  - `src/pages/Index.tsx`: run dashboard actions, download generation, archive/log integration, delete flow.
  - `src/pages/NewRun.tsx`: run bootstrap flow, prerequisite checks, async parsing start + navigation.
  - `src/pages/RunDetail.tsx`: workflow orchestration, KPI calculations, tab state, rerun behavior.
  - `src/store/runStore.ts`: central domain state/actions, parsing pipeline, run/issue mutation logic.
  - `src/components/AppSidebar.tsx`: global quick-upload status modules and navigation controls.
  - `src/components/AppFooter.tsx`: global runtime config, directory selection, log snapshot trigger.
  - `src/components/FileUploadZone.tsx`: upload validation and dropzone handling.
  - `src/components/ArchiveDetailDialog.tsx`: archive tree rendering + file download and run log display.
  - `src/components/run-detail/ItemsTable.tsx`: search/filter rendering for invoice line dataset.
  - `src/components/run-detail/IssuesCenter.tsx`: issue filtering, resolution workflow, CSV export.
  - `src/components/run-detail/WarehouseLocations.tsx`: grouped/global location assignment logic.
  - `src/components/run-detail/ExportPanel.tsx`: export readiness checks + XML generation/download.
  - `src/services/parsers/FatturaParserService.ts`: local PDF parse engine (pdfjs text extraction and rule matching).
  - `src/services/parsers/DevlogicParserService.ts`: optional HTTP parser adapter for local FastAPI service.

- **Important Reusable UI Components (from `components/ui`, actively used):**
  - `button`, `table`, `tabs`, `select`, `input`, `label`
  - `dialog`, `alert-dialog`, `alert`, `textarea`
  - `card`, `badge`, `scroll-area`, `dropdown-menu`
  - `toaster`, `sonner`, `tooltip`

## 5. Data Model & Interfaces
Key domain contracts are in `src/types/index.ts` and parser contracts in `src/services/parsers/types.ts`.

```typescript
export type StepStatus = 'not-started' | 'running' | 'ok' | 'soft-fail' | 'failed';

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
  packagesCount?: number | null;
  totalQty?: number;
  parsedPositionsCount?: number;
  qtyValidationStatus?: 'ok' | 'mismatch' | 'unknown';
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
  orderStatus: 'YES' | 'NO' | 'check';
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
  orderAssignmentReason: 'direct-match' | 'exact-qty-match' | 'oldest-first' | 'manual' | 'not-ordered' | 'pending';
  serialNumber: string | null;
  serialSource: 'serialList' | 'openWE' | 'manual' | 'none';
  falmecArticleNo: string | null;
  descriptionDE: string | null;
  storageLocation: string | null;
  unitPriceSage: number | null;
  activeFlag: boolean;
  priceCheckStatus: 'ok' | 'mismatch' | 'pending';
}

export interface Issue {
  id: string;
  runId?: string;
  severity: 'blocking' | 'soft-fail';
  stepNo: number;
  type: 'order-assignment' | 'serial-mismatch' | 'price-mismatch' | 'inactive-article' | 'missing-storage-location' | 'missing-ean' | 'parser-error';
  message: string;
  details: string;
  relatedLineIds: string[];
  status: 'open' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface UploadedFile {
  name: string;
  size: number;
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList';
  rowCount?: number;
  file: File;
  uploadedAt: string;
}

export interface ParsedInvoiceResult {
  success: boolean;
  header: {
    fatturaNumber: string;
    fatturaDate: string;
    packagesCount: number | null;
    invoiceTotal?: number;
    totalQty: number;
    parsedPositionsCount: number;
    qtyValidationStatus: 'ok' | 'mismatch' | 'unknown';
  };
  lines: Array<{
    positionIndex: number;
    manufacturerArticleNo: string;
    ean: string;
    descriptionIT: string;
    quantityDelivered: number;
    unitPrice: number;
    totalPrice: number;
    orderCandidates: string[];
    orderCandidatesText: string;
    orderStatus: 'YES' | 'NO' | 'check';
  }>;
  warnings: Array<{
    code: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    positionIndex?: number;
  }>;
  parserModule: string;
  parsedAt: string;
  sourceFileName?: string;
}

export interface ArchiveRun {
  id: string;
  runId: string;
  fattura: string;
  status: string;
  createdAt: string;
  folders: Array<{
    id: string;
    name: string;
    createdAt: string;
    files: Array<{
      id: string;
      name: string;
      type: string;
      size: number;
      createdAt: string;
      data?: string;
    }>;
  }>;
  metadata: {
    config: any;
    stats: any;
  };
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  runId?: string;
  step?: string;
  message: string;
  details?: string;
}
```

Persistence keys and stores used by current implementation:
- `localStorage`: `falmec-uploaded-files`, `falmec-parsed-invoice`, `falmec-archive-runs`, `falmec-system-log`, `falmec-log-snapshots`, `falmec-run-log-<runId>`, `falmec-data-path`.
- `IndexedDB`: DB `falmec-receiptpro-files`, object store `uploadedFiles`.
