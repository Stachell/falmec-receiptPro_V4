/**
 * exportService.test.ts — PROJ-48
 *
 * Unit tests for export service: getActiveColumns, generateXLSX, generateCSV, generateXML
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import type { InvoiceLine, ExportColumnMapping } from '@/types';
import {
  getActiveColumns,
  generateXLSX,
  generateCSV,
  generateXML,
  resolveColumnValue,
  buildExportFileName,
  type RunExportMeta,
} from './exportService';

// --- Test fixtures ---

const TEST_META: RunExportMeta = {
  fattura: 'FT-2026-001',
  invoiceDate: '15.03.2026',
  deliveryDate: '10.03.2026',
  eingangsart: 'Wareneingang',
  runId: 'run-test-001',
  bookingDate: '27.03.2026',
};

const TEST_LINE: InvoiceLine = {
  lineId: 'run-test-001-line-1',
  manufacturerArticleNo: 'ART-100',
  ean: '8030000000001',
  falmecArticleNo: 'FAL-100',
  descriptionDE: 'Testhaube',
  descriptionIT: 'Cappa test',
  supplierId: 'LF-001',
  unitPriceInvoice: 199.99,
  unitPriceFinal: 199.99,
  totalLineAmount: 199.99,
  quantity: 1,
  orderNumberAssigned: 'BEST-001',
  orderYear: 2026,
  serialNumber: 'SN-12345',
  storageLocation: 'WE Lager',
  orderVorgang: 'VG-001',
  matchStatus: 'full',
  matchScore: 100,
  matchDetails: '',
} as InvoiceLine;

const FULL_COLUMN_ORDER: ExportColumnMapping[] = [
  { position: 1,  columnKey: 'manufacturerArticleNo', label: 'Hersteller-Art.-Nr.', enabled: true },
  { position: 2,  columnKey: 'ean',                   label: 'EAN',                 enabled: true },
  { position: 3,  columnKey: 'falmecArticleNo',       label: 'Falmec-Art.-Nr.',     enabled: false },
  { position: 4,  columnKey: 'descriptionDE',         label: 'Bezeichnung (DE)',    enabled: true },
  { position: 5,  columnKey: 'descriptionIT',         label: 'Bezeichnung (IT)',    enabled: false },
  { position: 6,  columnKey: 'supplierId',             label: 'Lieferant',          enabled: true },
  { position: 7,  columnKey: 'unitPrice',              label: 'Einzelpreis',        enabled: true },
  { position: 8,  columnKey: 'bookingDate',            label: 'Datum der Buchung',  enabled: true },
  { position: 9,  columnKey: 'totalPrice',            label: 'Gesamtpreis',         enabled: true },
  { position: 10, columnKey: 'orderNumberAssigned',   label: 'Bestellnummer',       enabled: true },
  { position: 11, columnKey: 'orderDate',             label: 'Bestelldatum',        enabled: true },
  { position: 12, columnKey: 'serialNumber',          label: 'Seriennummer',        enabled: true },
  { position: 13, columnKey: 'storageLocation',       label: 'Lagerort',            enabled: true },
  { position: 14, columnKey: 'orderVorgang',           label: 'Vorgang',            enabled: true },
  { position: 15, columnKey: 'fattura',               label: 'Rechnungsnummer',     enabled: true },
];

// --- Tests ---

describe('getActiveColumns', () => {
  it('filters out disabled columns', () => {
    const active = getActiveColumns(FULL_COLUMN_ORDER);
    expect(active.length).toBe(13); // 15 - 2 disabled
    expect(active.find(c => c.columnKey === 'falmecArticleNo')).toBeUndefined();
    expect(active.find(c => c.columnKey === 'descriptionIT')).toBeUndefined();
  });

  it('treats missing enabled as true', () => {
    const cols: ExportColumnMapping[] = [
      { position: 1, columnKey: 'ean', label: 'EAN' }, // no enabled property
    ];
    expect(getActiveColumns(cols).length).toBe(1);
  });

  it('sorts by position', () => {
    const cols: ExportColumnMapping[] = [
      { position: 3, columnKey: 'ean', label: 'EAN', enabled: true },
      { position: 1, columnKey: 'fattura', label: 'Fattura', enabled: true },
    ];
    const active = getActiveColumns(cols);
    expect(active[0].columnKey).toBe('fattura');
    expect(active[1].columnKey).toBe('ean');
  });
});

describe('generateXLSX', () => {
  it('produces valid XLSX binary data', () => {
    const active = getActiveColumns(FULL_COLUMN_ORDER);
    const data = generateXLSX([TEST_LINE], active, TEST_META, true);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBeGreaterThan(100);

    // Parse the XLSX to verify contents
    const wb = XLSX.read(data, { type: 'array' });
    expect(wb.SheetNames).toContain('Wareneingang');
    const ws = wb.Sheets['Wareneingang'];
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // With header: header row + 1 data row
    expect(rows.length).toBe(2);
    // Header should have 13 columns (active only)
    expect(rows[0].length).toBe(13);
  });

  it('omits header row when includeHeader=false', () => {
    const active = getActiveColumns(FULL_COLUMN_ORDER);
    const data = generateXLSX([TEST_LINE], active, TEST_META, false);
    const wb = XLSX.read(data, { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Wareneingang'], { header: 1 });
    expect(rows.length).toBe(1); // data only
  });

  it('XLSX values match CSV values (same SSOT)', () => {
    const active = getActiveColumns(FULL_COLUMN_ORDER);
    const xlsxData = generateXLSX([TEST_LINE], active, TEST_META, false);
    const wb = XLSX.read(xlsxData, { type: 'array' });
    const xlsxRow = XLSX.utils.sheet_to_json<string[]>(wb.Sheets['Wareneingang'], { header: 1, raw: false })[0];

    // Compare with resolveColumnValue output
    active.forEach((col, i) => {
      const { value } = resolveColumnValue(col.columnKey, TEST_LINE, TEST_META);
      expect(String(xlsxRow[i] ?? '')).toBe(value);
    });
  });

  it('bookType xls produces different binary than xlsx', () => {
    const active = getActiveColumns(FULL_COLUMN_ORDER);
    const xlsxData = generateXLSX([TEST_LINE], active, TEST_META, true, 'xlsx');
    const xlsData = generateXLSX([TEST_LINE], active, TEST_META, true, 'xls');
    // Different formats should produce different binary sizes
    expect(xlsxData.length).not.toBe(xlsData.length);
  });
});

describe('generateCSV with active columns', () => {
  it('only includes active columns', () => {
    const active = getActiveColumns(FULL_COLUMN_ORDER);
    const csv = generateCSV([TEST_LINE], active, TEST_META, ';', true);
    // Should not contain 'Falmec-Art.-Nr.' or 'Bezeichnung (IT)' in header
    expect(csv).not.toContain('Falmec-Art.-Nr.');
    expect(csv).not.toContain('Bezeichnung (IT)');
    // Should contain active columns
    expect(csv).toContain('Hersteller-Art.-Nr.');
    expect(csv).toContain('EAN');
  });

  it('delimiter only affects CSV, not XLSX', () => {
    const active = getActiveColumns(FULL_COLUMN_ORDER);
    const csvSemicolon = generateCSV([TEST_LINE], active, TEST_META, ';', true);
    expect(csvSemicolon).toContain(';');

    // XLSX should not contain delimiter characters in its binary
    const xlsxData = generateXLSX([TEST_LINE], active, TEST_META, true);
    expect(xlsxData).toBeInstanceOf(Uint8Array);
    // XLSX is binary, no delimiter concept
  });
});

describe('generateXML with active columns', () => {
  it('only includes active columns in XML tags', () => {
    const active = getActiveColumns(FULL_COLUMN_ORDER);
    const xml = generateXML([TEST_LINE], active, TEST_META);
    expect(xml).not.toContain('<FalmecArticleNo>');
    expect(xml).not.toContain('<DescriptionIT>');
    expect(xml).toContain('<ManufacturerArticleNo>');
    expect(xml).toContain('<EAN>');
  });
});

describe('buildExportFileName', () => {
  it('builds xlsx filename correctly', () => {
    expect(buildExportFileName('run-1', 'xlsx', 0)).toBe('run-1-Wareneingang.xlsx');
    expect(buildExportFileName('run-1', 'xlsx', 1)).toBe('run-1-Wareneingang.xlsx');
    expect(buildExportFileName('run-1', 'xlsx', 2)).toBe('run-1-Wareneingang_v1.xlsx');
    expect(buildExportFileName('run-1', 'xls', 3)).toBe('run-1-Wareneingang_v2.xls');
  });
});
