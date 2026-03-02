const SEARCH_NORMALIZE_PATTERN = /[\s.\-/#]+/g;

/**
 * Normalizes user search input and searchable values to make matching
 * resilient against common visual separators in article identifiers.
 */
export function normalizeSearchTerm(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(SEARCH_NORMALIZE_PATTERN, '');
}

