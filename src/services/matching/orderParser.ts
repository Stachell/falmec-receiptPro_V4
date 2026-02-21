/**
 * orderParser — PROJ-20
 *
 * Parses uploaded order files (CSV semicolon-delimited or XLSX) into ParsedOrderPosition[].
 *
 * Column detection uses alias matching (case-insensitive).
 * Regex validation:
 *   - orderNumber: /^1\d{4}$/  (5-digit, starts with 1)
 *   - orderYear:   /^\d{4}$/   (4-digit year)
 *
 * CSV encoding: ISO-8859-1 (Latin-1), semicolon-separated.
 */

import * as XLSX from 'xlsx';
import type { ParsedOrderPosition, OrderParseResult } from '@/types';

// ── Regex validators ─────────────────────────────────────────────────
const ORDER_NUMBER_REGEX = /^1\d{4}$/;
const ORDER_YEAR_REGEX = /^\d{4}$/;

// ── Column aliases ───────────────────────────────────────────────────
const ALIASES: Record<string, string[]> = {
  artNoDE:      ['ART-# (DE)', 'ART-DE', 'FALMEC-ART', 'ARTIKELNR', 'ARTIKEL-NR'],
  artNoIT:      ['ART-# (IT)', 'ART-IT', 'CODICE', 'HERSTELLERARTIKELNR'],
  ean:          ['EAN', 'BARCODE', 'EAN-CODE', 'GTIN', 'EAN13'],
  supplierId:   ['LIEFERANT', 'SUPPLIER', 'KREDITORNR', 'KREDITOR'],
  openQuantity: ['OFFENE MENGE', 'OPEN QTY', 'RESTMENGE', 'OFFEN'],
  orderNumber:  ['BELEGNUMMER', 'BELEG-NR', 'BESTELLNUMMER', 'ORDER-NO', 'BESTELLUNG'],
  orderYear:    ['BESTELLJAHR', 'ORDER-YEAR', 'JAHR'],
  belegnummer:  ['BELEGNUMMER', 'BELEG-NR', 'BESTELLNUMMER', 'ORDER-NO', 'BESTELLUNG'],
};

function norm(s: unknown): string {
  return String(s ?? '').trim().toUpperCase();
}

function matchesAny(header: string, aliases: string[]): boolean {
  const h = norm(header);
  return aliases.some(a => h.includes(a));
}

interface ColumnMapping {
  artNoDE: number;
  artNoIT: number;
  ean: number;
  supplierId: number;
  openQuantity: number;
  orderNumber: number;
  orderYear: number;
}

function detectColumns(headers: string[]): { mapping: ColumnMapping; warnings: string[] } {
  const warnings: string[] = [];
  const mapping: ColumnMapping = {
    artNoDE: -1,
    artNoIT: -1,
    ean: -1,
    supplierId: -1,
    openQuantity: -1,
    orderNumber: -1,
    orderYear: -1,
  };

  for (let ci = 0; ci < headers.length; ci++) {
    const h = headers[ci];
    for (const [field, fieldAliases] of Object.entries(ALIASES)) {
      // belegnummer shares aliases with orderNumber — skip it as a separate field
      if (field === 'belegnummer') continue;
      const key = field as keyof ColumnMapping;
      if (mapping[key] === -1 && matchesAny(h, fieldAliases)) {
        mapping[key] = ci;
      }
    }
  }

  // Warn about missing critical columns
  if (mapping.orderNumber === -1) warnings.push('Spalte "Belegnummer/Bestellnummer" nicht erkannt');
  if (mapping.openQuantity === -1) warnings.push('Spalte "Offene Menge" nicht erkannt');
  if (mapping.artNoDE === -1 && mapping.ean === -1 && mapping.artNoIT === -1) {
    warnings.push('Keine Artikel-Identifikations-Spalte erkannt (Art-DE, Art-IT, EAN)');
  }

  return { mapping, warnings };
}

// ── Cell helpers ──────────────────────────────────────────────────────
function cellStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

function cellNum(v: unknown): number {
  const s = String(v ?? '').replace(',', '.').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// ── Main parser ──────────────────────────────────────────────────────

export async function parseOrderFile(file: File): Promise<OrderParseResult> {
  const warnings: string[] = [];

  const buffer = await file.arrayBuffer();

  // Detect CSV vs XLSX by extension
  const isCSV = file.name.toLowerCase().endsWith('.csv');
  let workbook: XLSX.WorkBook;

  if (isCSV) {
    // CSV: decode as ISO-8859-1, then parse
    const decoder = new TextDecoder('iso-8859-1');
    const csvText = decoder.decode(buffer);
    workbook = XLSX.read(csvText, { type: 'string', FS: ';' });
  } else {
    workbook = XLSX.read(buffer, { type: 'array' });
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { positions: [], rowCount: 0, warnings: ['Keine Sheets im Workbook'] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });

  if (rows.length < 2) {
    return { positions: [], rowCount: 0, warnings: ['Keine Datenzeilen gefunden'] };
  }

  // First row = headers
  const headers = (rows[0] as unknown[]).map(h => cellStr(h));
  const dataRows = rows.slice(1);

  const { mapping, warnings: colWarnings } = detectColumns(headers);
  warnings.push(...colWarnings);

  const positions: ParsedOrderPosition[] = [];
  let skippedRegex = 0;

  for (let ri = 0; ri < dataRows.length; ri++) {
    const row = dataRows[ri] as unknown[];
    if (!row) continue;

    const orderNumberRaw = mapping.orderNumber >= 0 ? cellStr(row[mapping.orderNumber]) : '';
    const orderYearRaw = mapping.orderYear >= 0 ? cellStr(row[mapping.orderYear]) : '';
    const openQty = mapping.openQuantity >= 0 ? cellNum(row[mapping.openQuantity]) : 0;

    // Extract 5-digit order number: take last 5 digits if longer
    const orderNumber = orderNumberRaw.length > 5
      ? orderNumberRaw.slice(-5)
      : orderNumberRaw;

    // Validate orderNumber with regex
    if (!ORDER_NUMBER_REGEX.test(orderNumber)) {
      skippedRegex++;
      continue;
    }

    // Parse orderYear: try raw value, fallback to extracting from belegnummer prefix
    let orderYear = 0;
    if (ORDER_YEAR_REGEX.test(orderYearRaw)) {
      orderYear = parseInt(orderYearRaw, 10);
    } else {
      // Try extracting year from the first 4 digits of belegnummer (e.g. "202510153" → 2025)
      const fullBeleg = orderNumberRaw.length > 5 ? orderNumberRaw : '';
      const yearCandidate = fullBeleg.slice(0, 4);
      if (ORDER_YEAR_REGEX.test(yearCandidate)) {
        orderYear = parseInt(yearCandidate, 10);
      }
    }

    // Skip rows with 0 open quantity
    if (openQty <= 0) continue;

    const artNoDE = mapping.artNoDE >= 0 ? cellStr(row[mapping.artNoDE]) : '';
    const artNoIT = mapping.artNoIT >= 0 ? cellStr(row[mapping.artNoIT]) : '';
    const ean = mapping.ean >= 0 ? cellStr(row[mapping.ean]) : '';
    const supplierId = mapping.supplierId >= 0 ? cellStr(row[mapping.supplierId]) : '';

    positions.push({
      id: `op-${ri}-${orderNumber}`,
      artNoDE,
      artNoIT,
      ean,
      supplierId,
      openQuantity: Math.round(openQty),
      orderNumber,
      orderYear,
      belegnummer: orderNumberRaw,
    });
  }

  if (skippedRegex > 0) {
    warnings.push(`${skippedRegex} Zeilen mit ungültiger Belegnummer übersprungen`);
  }

  console.info(
    `[orderParser] Parsed ${positions.length} offene Bestellungen aus '${file.name}' (${skippedRegex} ungültig übersprungen)`,
  );

  return { positions, rowCount: positions.length, warnings };
}
