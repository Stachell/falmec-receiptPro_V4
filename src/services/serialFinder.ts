/**
 * SerialFinder — PROJ-20 Phase 2
 *
 * Pre-filtering service for S/N Excel uploads.
 *
 * Lifecycle:
 *   1. On S/N XLSX upload:  preFilterSerialExcel() extracts only regex-matching rows
 *   2. On Step 3 start:     validateAgainstInvoice() checks invoice reference
 *   3. For archive:         buildLeanArchive() strips invoiceReference field
 *
 * The S/N regex is: /K[0-2][0-9]{10}K/
 *   - literal K
 *   - Baujahr digit 0–2
 *   - exactly 10 more digits
 *   - literal K
 *   e.g. "K25645407008K"
 */

import * as XLSX from 'xlsx';
import type { PreFilteredSerialRow, LeanSerialArchiveEntry } from '@/types';

const SN_REGEX = /K[0-2][0-9]{10}K/;

// ── Result Types ─────────────────────────────────────────────────────

export interface SerialFinderResult {
  filteredRows: PreFilteredSerialRow[];
  totalRowsScanned: number;
  regexMatchCount: number;
  warnings: string[];
}

// ── Column-detection aliases ─────────────────────────────────────────

const SERIAL_ALIASES = ['MATRICOLA', 'SERIAL', 'SERIENNUMMER', 'S/N', 'SN'];
const EAN_ALIASES    = ['BARCODE', 'EAN', 'EAN-CODE', 'GTIN', 'EAN13'];
const ART_IT_ALIASES = ['CODICE', 'CODE-IT', 'ART-IT', 'HERSTELLERARTIKELNR', 'ART-# (IT)'];
const INV_REF_ALIASES = ['FATTURA', 'N° FATTURA', 'RECHNUNG', 'INVOICE', 'NR FATTURA'];

function norm(s: unknown): string {
  return String(s ?? '').trim().toUpperCase();
}

function matchesAny(header: string, aliases: string[]): boolean {
  const h = norm(header);
  return aliases.some(a => h.includes(a));
}

interface ColumnMapping {
  serialCol: number;
  eanCol: number;
  artNoITCol: number;
  invoiceRefCol: number;
}

/**
 * Auto-detect column indices from the first non-empty header row.
 * Crystal-Reports XLS files may have merged cells and multi-line headers,
 * so we scan multiple candidate rows (0–9) and pick the best match.
 */
function detectColumnMapping(rows: unknown[][]): ColumnMapping {
  let serialCol = -1;
  let eanCol = -1;
  let artNoITCol = -1;
  let invoiceRefCol = -1;

  // Scan the first 10 rows for header candidates
  for (let ri = 0; ri < Math.min(10, rows.length); ri++) {
    const row = rows[ri];
    if (!row) continue;
    for (let ci = 0; ci < row.length; ci++) {
      const val = norm(row[ci]);
      if (!val) continue;
      if (serialCol === -1 && matchesAny(val, SERIAL_ALIASES)) serialCol = ci;
      if (eanCol === -1 && matchesAny(val, EAN_ALIASES)) eanCol = ci;
      if (artNoITCol === -1 && matchesAny(val, ART_IT_ALIASES)) artNoITCol = ci;
      if (invoiceRefCol === -1 && matchesAny(val, INV_REF_ALIASES)) invoiceRefCol = ci;
    }
  }

  return { serialCol, eanCol, artNoITCol, invoiceRefCol };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Pre-filter: Read S/N Excel, iterate all rows, keep only rows whose
 * serial column matches `/K[0-2][0-9]{10}K/`.
 *
 * Returns a slim array of PreFilteredSerialRow objects.
 * This runs immediately on file upload — BEFORE Step 3 starts.
 */
export async function preFilterSerialExcel(file: File): Promise<SerialFinderResult> {
  const warnings: string[] = [];

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { filteredRows: [], totalRowsScanned: 0, regexMatchCount: 0, warnings: ['Keine Sheets im Workbook'] };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const colMap = detectColumnMapping(rows);

  if (colMap.serialCol === -1) {
    warnings.push('Serial-Spalte nicht erkannt — suche in allen Spalten');
  }
  if (colMap.invoiceRefCol === -1) {
    warnings.push('Fattura/Rechnungs-Spalte nicht erkannt');
  }

  const filteredRows: PreFilteredSerialRow[] = [];
  let totalRowsScanned = 0;

  // Start scanning from row 1 (skip header row(s)); Crystal-Reports data starts ~row 10
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    totalRowsScanned++;

    // Try the mapped serial column first; if unmapped, scan all columns
    let serialRaw = '';
    if (colMap.serialCol >= 0) {
      serialRaw = String(row[colMap.serialCol] ?? '');
    } else {
      // Fallback: scan every cell in this row for a serial match
      for (let ci = 0; ci < row.length; ci++) {
        const cellVal = String(row[ci] ?? '');
        if (SN_REGEX.test(cellVal)) {
          serialRaw = cellVal;
          break;
        }
      }
    }

    const match = SN_REGEX.exec(serialRaw);
    if (!match) continue;

    filteredRows.push({
      serialNumber: match[0],
      ean: colMap.eanCol >= 0 ? String(row[colMap.eanCol] ?? '').trim() : '',
      artNoIT: colMap.artNoITCol >= 0 ? String(row[colMap.artNoITCol] ?? '').trim() : '',
      invoiceReference: colMap.invoiceRefCol >= 0 ? String(row[colMap.invoiceRefCol] ?? '').trim() : '',
      sourceRowIndex: i,
    });
  }

  return {
    filteredRows,
    totalRowsScanned,
    regexMatchCount: filteredRows.length,
    warnings,
  };
}

/**
 * Smart Validation: When Step 3 starts and the invoice number is known,
 * filter pre-filtered rows against the 5-digit invoice reference.
 *
 * Returns only rows whose invoiceReference matches.
 * After validation the invoiceReference field is semantically redundant
 * (it will be stripped by buildLeanArchive).
 */
export function validateAgainstInvoice(
  rows: PreFilteredSerialRow[],
  invoiceNumber: string,
): { validRows: PreFilteredSerialRow[]; rejectedCount: number } {
  // Extract 5-digit reference: e.g. "24.007" → "24007", then take last 5
  const digits = invoiceNumber.replace(/\D/g, '');
  const invoiceRef5 = digits.slice(-5);

  const validRows = rows.filter(r => {
    const rowRef = r.invoiceReference.replace(/\D/g, '').slice(-5);
    return rowRef === invoiceRef5;
  });

  return {
    validRows,
    rejectedCount: rows.length - validRows.length,
  };
}

/**
 * Build lean archive JSON — strips the invoiceReference field.
 * This is the ONLY data that goes into the run archive for serials.
 * Raw Excel files are NEVER archived.
 */
export function buildLeanArchive(rows: PreFilteredSerialRow[]): LeanSerialArchiveEntry[] {
  return rows.map(r => ({
    ean: r.ean,
    artNoIT: r.artNoIT,
    serialNumber: r.serialNumber,
    sourceRowIndex: r.sourceRowIndex,
  }));
}
