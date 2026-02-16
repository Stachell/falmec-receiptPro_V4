/**
 * Pattern constants for Fattura PDF parsing
 * Ported from Python parser (logicdev_PDF-Parser_V1/logicdev_Pars-Units/fattura_falmec_v1.py)
 *
 * All patterns are ordered by specificity (most specific first) to avoid over-matching.
 */

export interface Pattern {
  name: string;
  regex: RegExp;
}

// ============================================================
// INVOICE NUMBER PATTERNS (5 fallbacks, ordered by specificity)
// ============================================================

export const INVOICE_NUMBER_PATTERNS: Pattern[] = [
  {
    name: 'FATTURA_NUMBER_ALT',
    regex: /NUMERO\s*DOC[^0-9]*(\d{2}\.\d{3})/i,
  },
  {
    name: 'FATTURA_NUMBER',
    regex: /\b(\d{2}\.\d{3})\b/,
  },
  {
    name: 'FATTURA_NUMBER_FALLBACK',
    regex: /N[°o]?\s*(\d{2}\.\d{3})/i,
  },
  {
    name: 'FATTURA_NUMBER_FLEXIBLE',
    // Special: Has 2 capture groups that need to be combined
    regex: /(\d{2})\s*\.\s*(\d{3})/,
  },
  {
    name: 'FATTURA_NUMBER_NO_DOT',
    regex: /NUMERO\s*DOC[^0-9]*(\d{8,10})(?!\d)/i,
  },
];

// ============================================================
// ARTICLE NUMBER PATTERNS (8 types, ordered by specificity)
// ============================================================

export const ARTICLE_PATTERNS: Pattern[] = [
  {
    name: 'combined',
    // Combined article + EAN: "KACL.457#NF 8034122713656"
    regex: /([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)\s*(803\d{10})/i,
  },
  {
    name: 'standard_hash',
    // Standard Falmec format: KACL.457#NF, CAEI20.E0P2#ZZZB461F
    regex: /^([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)$/i,
  },
  {
    name: 'k_prefix_hash',
    // K-prefix with hash: KCVJN.00#3
    regex: /^(K[A-Z]{3,4}\.\d+#\d*)$/i,
  },
  {
    name: 'k_prefix_simple',
    // K-prefix without hash: KACL.936
    regex: /^(K[A-Z]{3,4}\.\d+)$/i,
  },
  {
    name: 'c_prefix',
    // C-prefix complex: CAEI20.E0P2#ZZZB461F
    regex: /^(C[A-Z]{2,3}\d{2}\.[A-Z0-9]+#[A-Z0-9]+)$/i,
  },
  {
    name: 'numeric_9',
    // 9-digit numeric: 105080365
    regex: /^(\d{9})$/,
  },
  {
    name: 'numeric_f_suffix',
    // 8-digit with F#xx suffix: 30506073F#49
    regex: /^(\d{8}F#\d{2})$/i,
  },
  {
    name: 'general_hash',
    // General alphanumeric with hash (must contain hash or dot, at least 6 chars)
    regex: /^([A-Z][A-Z0-9.#\-]{4,}[A-Z0-9])$/i,
  },
];

// ============================================================
// EAN PATTERN
// ============================================================

export const EAN_PATTERN = /^(803\d{10})$/;

// ============================================================
// PRICE LINE PATTERNS
// ============================================================

// Full price line: "description PZ [qty] [unit_price] [total_price]"
export const PRICE_LINE_PATTERN = /PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)/;

// Partial PZ pattern (quantity only, prices may be on next line)
export const PARTIAL_PZ_PATTERN = /PZ\s+(\d+)(?:\s|$)/;

// Price value pattern (European format: 894,45 or 1.234,56)
export const PRICE_VALUE_PATTERN = /([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})/;

// ============================================================
// DATE PATTERN
// ============================================================

// Date pattern: DD/MM/YYYY
export const FATTURA_DATE = /(\d{2}\/\d{2}\/\d{4})/;

// ============================================================
// PACKAGES COUNT PATTERNS
// ============================================================

// Primary pattern
export const PACKAGES_COUNT = /Number\s+of\s+packages\s*[\n\s]*(\d+)/i;

// Fallback pattern (wider match)
export const PACKAGES_COUNT_ALT = /Number\s+of\s+packages[\s\S]{0,50}?(\d{2,3})/i;

// ============================================================
// INVOICE TOTAL MARKERS
// ============================================================

// Invoice total marker (line above "CONTRIBUTO AMBIENTALE" on last page)
export const CONTRIBUTO_MARKER = /CONTRIBUTO\s+AMBIENTALE/i;

// Alternative marker for invoice total
export const AMOUNT_TO_PAY_MARKER = /AMOUNT\s+.*TO\s+PAY/i;

// ============================================================
// SKIP PATTERNS (header/footer content to ignore)
// ============================================================

export const SKIP_PATTERNS = [
  /^INVOICE/i,
  /^Falmec/i,
  /^NUMERO/i,
  /^DATA/i,
  /^DESCRIPTION/i,
  /^Continues/i,
  /^EUR$/i,
  /^TOTAL/i,
  /^Number of packages/i,
  /^EXPIRY/i,
  /^Informativa/i,
  /^CUSTOMER/i,
  /^DESTINATARIO/i,
  /^Net weight/i,
  /^Gross weight/i,
];

/**
 * Check if text matches any skip pattern (header/footer)
 * @param text - Line text to check
 * @returns true if line should be skipped
 */
export function shouldSkipLine(text: string): boolean {
  return SKIP_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Check if text contains "Vs. ORDINE" order reference
 * @param text - Line text to check
 * @returns true if line contains order reference
 */
export function isOrderReferenceLine(text: string): boolean {
  return /Vs\.\s*ORDINE/i.test(text);
}
