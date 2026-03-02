/**
 * PROJ-39 — Error Handling Config
 * localStorage-based persistence for error-handling email addresses.
 * Key: falmec-error-handling-emails
 */

const STORAGE_KEY = 'falmec-error-handling-emails';

interface ErrorHandlingEmails {
  addresses: string[];  // Max 5 entries, empty strings already filtered
  savedAt: string;      // ISO timestamp
}

/** Simple email format check — not exhaustive, matches existing pattern */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Load stored email addresses. Returns up to 5 non-empty strings. */
export function getStoredEmailAddresses(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: ErrorHandlingEmails = JSON.parse(raw);
    return (parsed.addresses ?? []).filter(a => typeof a === 'string' && a.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * Save email addresses.
 * - Filters out empty strings
 * - Deduplicates
 * - Validates format (invalid entries are still saved — validation is done in the UI)
 */
export function saveEmailAddresses(addresses: string[]): void {
  const filtered = [...new Set(addresses.map(a => a.trim()).filter(a => a.length > 0))];
  const payload: ErrorHandlingEmails = {
    addresses: filtered.slice(0, 5),
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** Validate a single email string (used in Settings UI) */
export { isValidEmail };
