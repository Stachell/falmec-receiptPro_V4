/**
 * Utility functions for parsing European number formats used in Fattura PDFs
 */

/**
 * Parse European price format to number
 * @param value - Price string in European format (e.g., "1.234,56" or "894,45")
 * @returns Parsed number (e.g., 1234.56 or 894.45)
 * @example
 * parsePrice("1.234,56") // Returns: 1234.56
 * parsePrice("894,45") // Returns: 894.45
 */
export function parsePrice(value: string): number {
  if (!value || typeof value !== 'string') return 0;

  // Remove thousand separators (dots) and replace decimal comma with dot
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);

  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Safe integer parsing with fallback to 0
 * @param value - String to parse as integer
 * @returns Parsed integer or 0 if invalid
 */
export function parseIntSafe(value: string | number): number {
  if (typeof value === 'number') return Math.floor(value);
  if (!value || typeof value !== 'string') return 0;

  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Extract two prices from a line containing both unit and total prices
 * @param line - Line containing two price values
 * @returns Array of [unitPrice, totalPrice] or null if not found
 * @example
 * extractTwoPrices("894,45 1.788,90") // Returns: [894.45, 1788.90]
 */
export function extractTwoPrices(line: string): [number, number] | null {
  // Match two European-format prices: digits with optional dots and mandatory comma
  const pricePattern = /([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})/g;
  const matches = line.match(pricePattern);

  if (matches && matches.length >= 2) {
    return [parsePrice(matches[0]), parsePrice(matches[1])];
  }

  return null;
}
