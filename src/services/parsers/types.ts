/**
 * Types for Invoice Parser Module
 * falmec receiptPro - Invoice Parsing System
 */

/** Order assignment status based on candidates count */
export type OrderStatus = 'YES' | 'NO' | 'check';

/** Parser state for state machine */
export type ParserState =
  | 'EXPECT_POSITION'
  | 'EXPECT_ARTICLE_CODE'
  | 'EXPECT_EAN'
  | 'COMMIT';

/** Warning severity level */
export type WarningSeverity = 'info' | 'warning' | 'error';

/**
 * Parsed invoice line item (position)
 */
export interface ParsedInvoiceLine {
  /** Position index (1-based) */
  positionIndex: number;
  /** Manufacturer article number (e.g., KACL.457#NF) */
  manufacturerArticleNo: string;
  /** 13-digit EAN code (string to preserve leading zeros) */
  ean: string;
  /** Italian description */
  descriptionIT: string;
  /** Quantity delivered (Q.TY) */
  quantityDelivered: number;
  /** Unit price in EUR (PRICE EUR) */
  unitPrice: number;
  /** Total price in EUR (AMOUNT EUR) */
  totalPrice: number;
  /** List of possible 5-digit order numbers (format 10xxx) */
  orderCandidates: string[];
  /** Order candidates as pipe-separated string */
  orderCandidatesText: string;
  /** Order status: YES (1 candidate), NO (0), check (>=2) */
  orderStatus: OrderStatus;
  /** Raw text of the position line for debugging */
  rawPositionText?: string;
}

/**
 * Parsed invoice header (global fields)
 */
export interface ParsedInvoiceHeader {
  /** Invoice number (NUMERO DOC./ N°) */
  fatturaNumber: string;
  /** Invoice date (DATA DOC./DATE) */
  fatturaDate: string;
  /** Number of packages (from last page) */
  packagesCount: number | null;
  /** Invoice total amount in EUR (TOTAL EUR, from last page) */
  invoiceTotal?: number;
  /** Total quantity sum of all Q.TY values */
  totalQty: number;
  /** Number of parsed positions */
  parsedPositionsCount: number;
  /** Physical PZ entries counted in UM column (= parsedPositionsCount) */
  pzCount: number;
  /** Validation status: positions count vs totalQty */
  qtyValidationStatus: 'ok' | 'mismatch' | 'unknown';
}

/**
 * Parser warning/error message
 */
export interface ParserWarning {
  /** Warning code for categorization */
  code: string;
  /** Human-readable message */
  message: string;
  /** Severity level */
  severity: WarningSeverity;
  /** Related position index (if applicable) */
  positionIndex?: number;
  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * Post-parse validation rule result
 */
export interface ValidationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  message: string;
  severity: WarningSeverity;
  details?: Record<string, unknown>;
}

/**
 * Complete parsed invoice result
 */
export interface ParsedInvoiceResult {
  /** Whether parsing was successful (no blocking errors) */
  success: boolean;
  /** Parsed header data */
  header: ParsedInvoiceHeader;
  /** Parsed line items */
  lines: ParsedInvoiceLine[];
  /** Warnings and errors encountered during parsing */
  warnings: ParserWarning[];
  /** Validation rule results (post-parse checks) */
  validationResults?: ValidationResult[];
  /** Parser module identifier */
  parserModule: string;
  /** Parsing timestamp */
  parsedAt: string;
  /** Source file name */
  sourceFileName?: string;
}

/**
 * Parser configuration (can be externalized)
 */
export interface ParserConfig {
  /** Regex patterns for field extraction */
  patterns: {
    /** Pattern for invoice number extraction */
    fatturaNumber: RegExp;
    /** Alternative pattern for invoice number (fallback) */
    fatturaNumberAlt?: RegExp;
    /** Third fallback pattern for invoice number */
    fatturaNumberFallback?: RegExp;
    /** Pattern for invoice date extraction */
    fatturaDate: RegExp;
    /** Pattern for packages count extraction */
    packagesCount: RegExp;
    /** Pattern for position line Format A: "PZ [qty] [price] [amount]" (Falmec standard) */
    positionLineA: RegExp;
    /** Pattern for position line Format B: "[qty] PZ [price] [amount]" (alternative) */
    positionLineB: RegExp;
    /** Pattern for manufacturer article number */
    articleCode: RegExp;
    /** Alternative pattern for manufacturer article number */
    articleCodeAlt?: RegExp;
    /** Pattern for 13-digit EAN */
    ean: RegExp;
    /** Pattern for order reference line (Vs. ORDINE) */
    orderReference: RegExp;
    /** Pattern for extracting 5-digit order numbers (10xxx format) */
    orderNumber: RegExp;
  };
  /** Locale settings */
  locale: {
    /** Decimal separator in source document */
    decimalSeparator: string;
    /** Thousands separator in source document */
    thousandsSeparator: string;
  };
}

/**
 * Interface for invoice parser plugins
 * All parser modules must implement this interface
 */
export interface InvoiceParser {
  /** Unique identifier for this parser module */
  readonly moduleId: string;
  /** Human-readable name */
  readonly moduleName: string;
  /** Version string */
  readonly version: string;

  /**
   * Parse invoice PDF and extract structured data
   * @param pdfFile - PDF file to parse
   * @param runId - Optional run ID for log correlation (passed from RunStore)
   * @returns Parsed invoice result
   */
  parseInvoice(pdfFile: File, runId?: string): Promise<ParsedInvoiceResult>;

  /**
   * Check if this parser can handle the given PDF
   * @param pdfFile - PDF file to check
   * @returns true if this parser can handle the file
   */
  canHandle?(pdfFile: File): Promise<boolean>;
}
