/**
 * Matcher Module Types — PROJ-16
 *
 * All interfaces for the modular Matcher system (Step 2: Cross-Match, Step 3: S/N-Extraktion).
 * Mirrors the InvoiceParser pattern from src/services/parsers/types.ts.
 */

import type {
  InvoiceLine,
  ArticleMaster,
  Issue,
  RunStats,
} from '@/types';

// ── Schema Definition ─────────────────────────────────────────────────

/** Single field definition with alias mapping for ArticleMaster column matching */
export interface SchemaFieldDef {
  /** Internal field ID, e.g. 'artNoDE', 'artNoIT', 'ean', 'price' */
  fieldId: string;
  /** UI-Label, e.g. "Art-# (DE)" or "Art-# (IT)" */
  label: string;
  /** Column name aliases for fuzzy header matching */
  aliases: string[];
  /** Optional transform applied to raw cell value */
  transform?: (raw: string) => string;
  /** Whether this field is required for matching */
  required: boolean;
  /**
   * PROJ-17: Regex pattern string for UI display in Settings (e.g. "^1\\d{5}$").
   * Not enforced at runtime — use `validate` for enforcement.
   */
  validationPattern?: string;
  /**
   * PROJ-17: Runtime validation function.
   * Returns true if the cell value is structurally valid for this field.
   */
  validate?: (value: string) => boolean;
}

/** Schema definition for an ArticleMaster file */
export interface SchemaDefinition {
  /**
   * The schema fields.
   * Mandatory: artNoDE, artNoIT, ean, price, serialRequired, storageLocation, supplierId
   */
  fields: SchemaFieldDef[];
  /** Human-readable schema name, e.g. "Falmec Artikelstamm" */
  name: string;
}

// ── Matcher Config ────────────────────────────────────────────────────

export interface MatcherConfig {
  /** Price tolerance from RunConfig */
  tolerance: number;
  /** Case-sensitive matching (default: false → case-insensitive) */
  caseSensitive: boolean;
  /** Settings-UI alias overrides (field → aliases) */
  aliasOverrides?: Record<string, string[]>;
}

// ── Matcher Warning ───────────────────────────────────────────────────

export interface MatcherWarning {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  lineId?: string;
}

// ── Cross-Match Result (Step 2) ───────────────────────────────────────

export interface CrossMatchResult {
  /** Updated lines with matchStatus, falmecArticleNo, prices, etc. */
  lines: InvoiceLine[];
  /** Partial stats update */
  stats: Partial<RunStats>;
  /** Blocking issues (e.g. no-match articles) */
  issues: Issue[];
  /** Warnings (e.g. CONFLICT) */
  warnings: MatcherWarning[];
}

// ── Serial Document (Step 3 Input) ────────────────────────────────────

export interface SerialDocumentRow {
  /** Original row index in the XLSX */
  rowIndex: number;
  /** Invoice reference (5-digit, e.g. "20007") from mapped column */
  invoiceRef: string;
  /** Raw value of the S/N column */
  serialRaw: string;
  /** Extracted via regex /K[0-2][0-9]{10}K/ — null if no match */
  serialCandidate: string | null;
  /** Whether this row has been assigned to a line */
  consumed: boolean;
}

export interface SerialDocument {
  /** Parsed rows from S/N-XLSX */
  rows: SerialDocumentRow[];
  /** Source file name */
  fileName: string;
  /** Mapped column indices */
  columnMapping: Record<string, number>;
}

// ── Serial Extraction Result (Step 3 Output) ──────────────────────────

export interface SerialExtractionResult {
  /** Lines with serialNumber + serialSource updated */
  lines: InvoiceLine[];
  /** Assignment statistics */
  stats: { assignedCount: number; requiredCount: number; mismatchCount: number };
  /** Warnings (e.g. invoice ref not found, checksum mismatch) */
  warnings: MatcherWarning[];
  /** Blocking/soft-fail issues for the Issues-Center (PROJ-17) */
  issues: Issue[];
  /** Checksum: regexHits vs assignedSNs */
  checksum: { regexHits: number; assignedSNs: number; match: boolean };
}

// ── Matcher Module Interface (Core Contract) ──────────────────────────

export interface MatcherModule {
  /** Unique module ID, e.g. 'FalmecMatcher_Master' */
  readonly moduleId: string;
  /** Human-readable name, e.g. 'Falmec Matcher' */
  readonly moduleName: string;
  /** Semver version string */
  readonly version: string;

  /** Schema: How are the 6 fields extracted from the ArticleMaster file? */
  readonly schemaDefinition: SchemaDefinition;

  /** Step 2: Cross-Match Invoice-Lines against ArticleMaster */
  crossMatch(
    lines: InvoiceLine[],
    articles: ArticleMaster[],
    config: MatcherConfig,
    runId: string,
  ): CrossMatchResult;

  /** Step 3: S/N-Extraction + Assignment */
  serialExtract(
    lines: InvoiceLine[],
    serialDocument: SerialDocument,
    invoiceNumber: string,
  ): SerialExtractionResult;

  /** Optional: Can this module handle the current dataset? */
  canHandle?(articles: ArticleMaster[]): boolean;
}
