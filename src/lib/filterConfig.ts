import type { InvoiceLine, ParsedInvoiceLineExtended } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  groupLabel: string;
  options: FilterOption[];
}

// ─── Shared ─────────────────────────────────────────────────────────

/** "Alle anzeigen" — shared by both filters */
export const FILTER_ALL: FilterOption = { value: 'all', label: 'Alle anzeigen' };

// ─── Artikelliste: Grouped filters (16 options in 5 groups) ─────────

export const ITEMS_FILTER_GROUPS: FilterGroup[] = [
  {
    groupLabel: 'ARTIKEL',
    options: [
      { value: 'full-match',    label: 'ARTIKEL: Match' },
      { value: 'partial-match', label: 'ARTIKEL: Teilmatch' },
      { value: 'no-match',      label: 'ARTIKEL: Kein Match' },
      { value: 'pending',       label: 'ARTIKEL: Ausstehend' },
      { value: 'inactive',      label: 'ARTIKEL: Inaktiv' },
    ],
  },
  {
    groupLabel: 'PREIS',
    options: [
      { value: 'price-ok',       label: 'PREIS: OK' },
      { value: 'price-mismatch', label: 'PREIS: Abweichung' },
      { value: 'price-missing',  label: 'PREIS: Fehlt' },
      { value: 'price-custom',   label: 'PREIS: Angepasst' },
    ],
  },
  {
    groupLabel: 'SERIAL',
    options: [
      { value: 'sn-assigned',     label: 'SERIAL: Zugewiesen' },
      { value: 'sn-missing',      label: 'SERIAL: Ausstehend' },
      { value: 'sn-not-required', label: 'SERIAL: Nicht erforderlich' },
    ],
  },
  {
    groupLabel: 'BESTELLUNG',
    options: [
      { value: 'not-ordered',    label: 'BESTELLUNG: Nicht bestellt' },
      { value: 'order-assigned', label: 'BESTELLUNG: Zugewiesen' },
      { value: 'order-perfect',  label: 'BESTELLUNG: Perfekt-Match' },
      { value: 'order-manual',   label: 'BESTELLUNG: Manuell' },
    ],
  },
];

// ─── RE-Positionen: Flat action filters (4 options) ─────────────────

export const INVOICE_ACTION_FILTERS: FilterOption[] = [
  { value: 'action-price',    label: 'Preisabweichungen' },
  { value: 'action-match',    label: 'Matchstatus pruefen' },
  { value: 'action-order',    label: 'Bestellung fehlt' },
  { value: 'action-conflict', label: 'Konflikte' },
];

// ─── Artikelliste filter logic ──────────────────────────────────────

/**
 * Checks whether an InvoiceLine matches the selected Artikelliste filter.
 * Works exclusively on enriched InvoiceLine data (available from Step 2).
 */
export function matchesItemsStatusFilter(line: InvoiceLine, statusFilter: string): boolean {
  if (statusFilter === 'all') return true;

  switch (statusFilter) {
    // ARTIKEL
    case 'full-match':     return line.matchStatus === 'full-match';
    case 'partial-match':  return line.matchStatus === 'code-it-only' || line.matchStatus === 'ean-only';
    case 'no-match':       return line.matchStatus === 'no-match';
    case 'pending':        return line.matchStatus === 'pending';
    case 'inactive':       return !line.activeFlag;
    // PREIS
    case 'price-ok':       return line.priceCheckStatus === 'ok';
    case 'price-mismatch': return line.priceCheckStatus === 'mismatch';
    case 'price-missing':  return line.priceCheckStatus === 'missing';
    case 'price-custom':   return line.priceCheckStatus === 'custom';
    // SERIAL (PROJ-20: serialNumbers[] instead of serialNumber)
    case 'sn-assigned':     return line.serialRequired && line.serialNumbers.length > 0;
    case 'sn-missing':      return line.serialRequired && line.serialNumbers.length === 0;
    case 'sn-not-required': return !line.serialRequired;
    // BESTELLUNG
    case 'not-ordered':    return !line.orderNumberAssigned;
    case 'order-assigned': return !!line.orderNumberAssigned;
    case 'order-perfect':  return line.orderAssignmentReason === 'perfect-match';
    case 'order-manual':   return line.orderAssignmentReason === 'manual' || line.orderAssignmentReason === 'manual-ok';
    default:               return true;
  }
}

// ─── RE-Positionen action filter logic ──────────────────────────────

/**
 * Checks whether an RE-Position matches the selected action filter.
 *
 * Hybrid logic — works on TWO data sources:
 *   - `pos`:  Raw PDF parse data (ParsedInvoiceLineExtended) — always available
 *   - `line`: Enriched store data (InvoiceLine) — only available after Step 2 (nullable)
 *
 * @param pos    Step-1 parse position (always present)
 * @param line   Enriched InvoiceLine from positionStatusMap (null before Step 2)
 * @param filter Selected action filter value
 */
export function matchesInvoiceActionFilter(
  pos: ParsedInvoiceLineExtended,
  line: InvoiceLine | null,
  filter: string,
): boolean {
  if (filter === 'all') return true;

  switch (filter) {
    case 'action-price':
      if (!line) return false;
      return line.priceCheckStatus === 'mismatch';

    case 'action-match':
      if (!line) return true;
      return line.matchStatus !== 'full-match';

    case 'action-order':
      return pos.orderStatus === 'NO';

    case 'action-conflict':
      // L3: Null-safe EAN check
      if (!pos.ean?.trim()) return true;
      if (!line) return false;
      return (
        line.priceCheckStatus === 'missing' ||
        line.matchStatus === 'no-match' ||
        !line.activeFlag
      );

    default:
      return true;
  }
}
