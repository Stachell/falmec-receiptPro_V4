/**
 * exportConfigStore — PROJ-35
 *
 * Zustand store for export column order configuration & diagnostics.
 * Persisted to localStorage (key: exportColumnConfig).
 */

import { create } from 'zustand';
import type { ExportColumnMapping, ExportDiagnostics, ExportColumnKey } from '@/types';

const STORAGE_KEY = 'exportColumnConfig';
const DIAGNOSTICS_KEY = 'exportDiagnostics';
const DELIMITER_KEY = 'exportCsvDelimiter';
const HEADER_KEY = 'exportCsvIncludeHeader';
const VALID_DELIMITERS = [',', ';', '\t'];

/** Default column order (position 1–15) */
export const DEFAULT_COLUMN_ORDER: ExportColumnMapping[] = [
  { position: 1,  columnKey: 'manufacturerArticleNo', label: 'Hersteller-Art.-Nr.' },
  { position: 2,  columnKey: 'ean',                   label: 'EAN' },
  { position: 3,  columnKey: 'falmecArticleNo',       label: 'Falmec-Art.-Nr.' },
  { position: 4,  columnKey: 'descriptionDE',         label: 'Bezeichnung (DE)' },
  { position: 5,  columnKey: 'descriptionIT',         label: 'Bezeichnung (IT)' },
  { position: 6,  columnKey: 'supplierId',             label: 'Lieferant' },
  { position: 7,  columnKey: 'unitPrice',              label: 'Einzelpreis' },
  { position: 8,  columnKey: 'bookingDate',            label: 'Datum der Buchung' },
  { position: 9,  columnKey: 'totalPrice',            label: 'Gesamtpreis' },
  { position: 10, columnKey: 'orderNumberAssigned',   label: 'Bestellnummer' },
  { position: 11, columnKey: 'orderDate',             label: 'Bestelldatum' },
  { position: 12, columnKey: 'serialNumber',          label: 'Seriennummer' },
  { position: 13, columnKey: 'storageLocation',       label: 'Lagerort' },
  { position: 14, columnKey: 'orderVorgang',           label: 'Vorgang' },
  { position: 15, columnKey: 'fattura',               label: 'Rechnungsnummer' },
];

interface ExportConfigState {
  columnOrder: ExportColumnMapping[];
  lastDiagnostics: ExportDiagnostics | null;
  isDirty: boolean;
  csvDelimiter: string;
  csvIncludeHeader: boolean;

  setColumnOrder: (order: ExportColumnMapping[]) => void;
  moveColumn: (fromIndex: number, toIndex: number) => void;
  saveConfig: () => void;
  resetToDefault: () => void;
  setLastDiagnostics: (d: ExportDiagnostics) => void;
  setCsvDelimiter: (d: string) => void;
  setCsvIncludeHeader: (v: boolean) => void;
}

/** Load persisted column order from localStorage, fallback to default */
function loadPersistedOrder(): ExportColumnMapping[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMN_ORDER;
    const parsed = JSON.parse(raw) as ExportColumnMapping[];
    if (!Array.isArray(parsed) || parsed.length !== 15) return DEFAULT_COLUMN_ORDER;
    // Validate all expected keys exist
    const expectedKeys = new Set<ExportColumnKey>(DEFAULT_COLUMN_ORDER.map(c => c.columnKey));
    const parsedKeys = new Set(parsed.map(c => c.columnKey));
    if (expectedKeys.size !== parsedKeys.size) return DEFAULT_COLUMN_ORDER;
    for (const k of expectedKeys) {
      if (!parsedKeys.has(k)) return DEFAULT_COLUMN_ORDER;
    }
    return parsed;
  } catch {
    return DEFAULT_COLUMN_ORDER;
  }
}

function loadPersistedDelimiter(): string {
  try {
    const raw = localStorage.getItem(DELIMITER_KEY);
    return VALID_DELIMITERS.includes(raw ?? '') ? raw! : ',';
  } catch {
    return ',';
  }
}

function loadPersistedHeaderFlag(): boolean {
  try {
    const raw = localStorage.getItem(HEADER_KEY);
    return raw === 'true';
  } catch {
    return false;
  }
}

function loadPersistedDiagnostics(): ExportDiagnostics | null {
  try {
    const raw = localStorage.getItem(DIAGNOSTICS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ExportDiagnostics;
  } catch {
    return null;
  }
}

/** Re-number positions after a reorder */
function reindex(order: ExportColumnMapping[]): ExportColumnMapping[] {
  return order.map((col, i) => ({ ...col, position: i + 1 }));
}

export const useExportConfigStore = create<ExportConfigState>((set, get) => ({
  columnOrder: loadPersistedOrder(),
  lastDiagnostics: loadPersistedDiagnostics(),
  isDirty: false,
  csvDelimiter: loadPersistedDelimiter(),
  csvIncludeHeader: loadPersistedHeaderFlag(),

  setColumnOrder: (order) => set({ columnOrder: reindex(order), isDirty: true }),

  moveColumn: (fromIndex, toIndex) => {
    const { columnOrder } = get();
    if (fromIndex < 0 || fromIndex >= columnOrder.length) return;
    if (toIndex < 0 || toIndex >= columnOrder.length) return;
    if (fromIndex === toIndex) return;
    const next = [...columnOrder];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    set({ columnOrder: reindex(next), isDirty: true });
  },

  saveConfig: () => {
    const { columnOrder } = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columnOrder));
    set({ isDirty: false });
  },

  resetToDefault: () => {
    set({ columnOrder: [...DEFAULT_COLUMN_ORDER], isDirty: true });
  },

  setLastDiagnostics: (d) => {
    localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(d));
    set({ lastDiagnostics: d });
  },

  setCsvDelimiter: (d) => {
    if (!VALID_DELIMITERS.includes(d)) return;
    localStorage.setItem(DELIMITER_KEY, d);
    set({ csvDelimiter: d });
  },

  setCsvIncludeHeader: (v) => {
    localStorage.setItem(HEADER_KEY, String(v));
    set({ csvIncludeHeader: v });
  },
}));
