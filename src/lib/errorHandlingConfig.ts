/**
 * PROJ-39 / PROJ-39-ADDON - Error Handling Config
 * localStorage-based persistence for error-handling email addresses.
 * Key: falmec-error-handling-emails
 */

const STORAGE_KEY = 'falmec-error-handling-emails';
export const ERROR_HANDLING_EMAIL_SLOT_COUNT = 10;

interface ErrorHandlingEmails {
  addresses: string[]; // Fixed slots (10)
  savedAt: string; // ISO timestamp
}

export type SaveEmailAddressesResult =
  | {
      ok: true;
      addresses: string[];
    }
  | {
      ok: false;
      code: 'invalid_email' | 'duplicate_email';
      message: string;
      indices: number[];
    };

/** Simple email format check - not exhaustive, matches existing pattern */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function createEmptySlots(): string[] {
  return Array.from({ length: ERROR_HANDLING_EMAIL_SLOT_COUNT }, () => '');
}

/** Normalize arbitrary input into fixed slot structure */
function normalizeSlots(addresses: string[]): string[] {
  const slots = createEmptySlots();
  for (let i = 0; i < ERROR_HANDLING_EMAIL_SLOT_COUNT; i += 1) {
    slots[i] = (addresses[i] ?? '').trim();
  }
  return slots;
}

/** Load stored email slots. Legacy 5-entry payloads are auto-migrated into slot 1..n. */
export function getStoredEmailSlots(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptySlots();
    const parsed: ErrorHandlingEmails = JSON.parse(raw);
    if (!Array.isArray(parsed?.addresses)) return createEmptySlots();
    const rawAddresses = parsed.addresses
      .map((entry) => (typeof entry === 'string' ? entry : ''))
      .slice(0, ERROR_HANDLING_EMAIL_SLOT_COUNT);
    return normalizeSlots(rawAddresses);
  } catch {
    return createEmptySlots();
  }
}

/** Load addresses for recipient dropdown (non-empty, slot-order). */
export function getStoredEmailAddresses(): string[] {
  return getStoredEmailSlots().filter((entry) => entry.length > 0);
}

/**
 * Save email addresses with strict validation.
 * - Invalid non-empty entries block save
 * - Duplicate non-empty entries block save (case-insensitive)
 * - On validation error: nothing is persisted
 */
export function saveEmailAddresses(addresses: string[]): SaveEmailAddressesResult {
  const slots = normalizeSlots(addresses);

  const invalidIndices = slots
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.length > 0 && !isValidEmail(entry))
    .map(({ index }) => index);
  if (invalidIndices.length > 0) {
    return {
      ok: false,
      code: 'invalid_email',
      message: `Ungueltige E-Mail in Adresse ${invalidIndices[0] + 1}.`,
      indices: invalidIndices,
    };
  }

  const duplicates = new Map<string, number[]>();
  slots.forEach((entry, index) => {
    if (!entry) return;
    const normalized = entry.toLowerCase();
    const list = duplicates.get(normalized) ?? [];
    list.push(index);
    duplicates.set(normalized, list);
  });
  const duplicateIndices = [...duplicates.values()]
    .filter((indices) => indices.length > 1)
    .flat()
    .sort((a, b) => a - b);
  if (duplicateIndices.length > 0) {
    return {
      ok: false,
      code: 'duplicate_email',
      message: `Doppelte E-Mail in Adresse ${duplicateIndices[0] + 1}.`,
      indices: duplicateIndices,
    };
  }

  const payload: ErrorHandlingEmails = {
    addresses: slots,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  return { ok: true, addresses: slots };
}

/** Validate a single email string (used in Settings UI) */
export { isValidEmail };
