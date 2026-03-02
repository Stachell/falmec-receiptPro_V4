/**
 * masterDataParser — PROJ-19
 *
 * Parses an uploaded Excel file (articleList) into ArticleMaster[].
 *
 * COLUMN FILTERING: Only columns whose header matches an alias defined in
 * FALMEC_SCHEMA are extracted. Unknown columns are silently ignored.
 *
 * COLLISION RESOLVER: If two Excel columns both match the same schema alias,
 * the column with MORE non-empty cells wins. Ties go to the left-most column.
 *
 * FIELD MAPPING (fieldId → ArticleMaster property):
 *   artNoDE          → falmecArticleNo
 *   artNoIT          → manufacturerArticleNo
 *   ean              → ean
 *   price            → unitPriceNet
 *   serialRequired   → serialRequirement
 *   storageLocation  → storageLocation
 *   supplierId       → supplierId (5-stellige Lieferantennummer, PROJ-40)
 *   descriptionDE    → descriptionDE (Artikelmatchcode aus Sage, PROJ-40)
 */

import * as XLSX from 'xlsx';
import type { ArticleMaster } from '@/types';
import { FALMEC_SCHEMA } from '@/services/matchers/modules/FalmecMatcher_Master';

export interface MasterDataParseResult {
  articles: ArticleMaster[];
  rowCount: number;
  columnMap: Record<string, string>; // fieldId → winning Excel column header
  collisions: Array<{ fieldId: string; winner: string; loser: string }>;
  warnings: string[];
}

// ── Alias lookup ──────────────────────────────────────────────────────────────
/**
 * Build a flat map: normalizedAlias → fieldId
 * Includes the label itself as an alias.
 */
function buildAliasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of FALMEC_SCHEMA.fields) {
    const add = (s: string) => map.set(s.trim().toUpperCase(), field.fieldId);
    add(field.label);
    for (const alias of field.aliases ?? []) add(alias);
  }
  return map;
}

// ── Column election ───────────────────────────────────────────────────────────
interface ColCandidate {
  header: string;
  colIndex: number;
  nonEmptyCount: number;
}

/**
 * Elect one winning column per fieldId.
 * Collision resolver: highest nonEmptyCount wins; ties → leftmost column.
 */
function electColumns(
  headers: string[],
  rows: unknown[][],
  aliasMap: Map<string, string>,
): {
  elected: Map<string, ColCandidate>; // fieldId → winning candidate
  collisions: Array<{ fieldId: string; winner: string; loser: string }>;
} {
  // Count non-empty cells per column index
  const nonEmptyCounts: number[] = headers.map((_, ci) =>
    rows.filter(row => {
      const v = row[ci];
      return v !== null && v !== undefined && String(v).trim() !== '';
    }).length,
  );

  const candidates = new Map<string, ColCandidate[]>();

  for (let ci = 0; ci < headers.length; ci++) {
    const normHeader = headers[ci].trim().toUpperCase();
    const fieldId = aliasMap.get(normHeader);
    if (!fieldId) continue;

    const existing = candidates.get(fieldId) ?? [];
    existing.push({ header: headers[ci], colIndex: ci, nonEmptyCount: nonEmptyCounts[ci] });
    candidates.set(fieldId, existing);
  }

  const elected = new Map<string, ColCandidate>();
  const collisions: Array<{ fieldId: string; winner: string; loser: string }> = [];

  for (const [fieldId, cols] of candidates) {
    if (cols.length === 1) {
      elected.set(fieldId, cols[0]);
      continue;
    }
    // Sort: highest nonEmptyCount first; ties → lowest colIndex (leftmost)
    cols.sort((a, b) =>
      b.nonEmptyCount - a.nonEmptyCount || a.colIndex - b.colIndex,
    );
    elected.set(fieldId, cols[0]);
    for (let k = 1; k < cols.length; k++) {
      collisions.push({
        fieldId,
        winner: cols[0].header,
        loser: cols[k].header,
      });
    }
  }

  return { elected, collisions };
}

// ── Cell coercion helpers ─────────────────────────────────────────────────────
function cellStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

function cellNum(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const TRUE_CELL_VALUES = new Set([
  '1',
  'TRUE',
  'JA',
  'YES',
  'X',
  'LAGERFUEHRUNG UND VERKAUF',
  'NUR VERKAUF',
  'NUR LAGERFUEHRUNG',
  'VORHANDEN',
]);

function normalizeBoolCell(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/Ü/g, 'UE')
    .replace(/Ö/g, 'OE')
    .replace(/Ä/g, 'AE')
    .replace(/ß/g, 'SS')
    .replace(/[/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellBool(v: unknown): boolean {
  return TRUE_CELL_VALUES.has(normalizeBoolCell(v));
}

// ── Main parser ───────────────────────────────────────────────────────────────

/**
 * Parse an Excel File object into ArticleMaster[].
 * Throws if the file cannot be read or contains no header row.
 */
export async function parseMasterDataFile(
  file: File,
): Promise<MasterDataParseResult> {
  const warnings: string[] = [];

  // Read file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

  // Use first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Excel-Datei enthält kein Arbeitsblatt.');

  const sheet = workbook.Sheets[sheetName];

  // Convert to 2-D array (raw values)
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawRows.length < 2) {
    throw new Error('Excel-Datei enthält keine Datenzeilen (mindestens Kopfzeile + 1 Datenzeile erwartet).');
  }

  // First row = headers
  const headerRow = (rawRows[0] as unknown[]).map(h => cellStr(h));
  const dataRows = rawRows.slice(1) as unknown[][];

  // Build alias map from FALMEC_SCHEMA
  const aliasMap = buildAliasMap();

  // Elect winning columns (with collision resolution)
  const { elected, collisions } = electColumns(headerRow, dataRows, aliasMap);

  if (collisions.length > 0) {
    for (const c of collisions) {
      warnings.push(
        `Spalten-Kollision [${c.fieldId}]: '${c.winner}' gewinnt gegen '${c.loser}'`,
      );
    }
  }

  // Warn about missing required fields
  const requiredFields = FALMEC_SCHEMA.fields.filter(f => f.required).map(f => f.fieldId);
  for (const fid of requiredFields) {
    if (!elected.has(fid)) {
      warnings.push(`Pflichtfeld '${fid}' (${FALMEC_SCHEMA.fields.find(f => f.fieldId === fid)?.label}) nicht in der Excel-Datei gefunden.`);
    }
  }

  // Build columnMap for diagnostics
  const columnMap: Record<string, string> = {};
  for (const [fieldId, col] of elected) {
    columnMap[fieldId] = col.header;
  }

  // Helper: get column index for a fieldId
  const idx = (fieldId: string): number => elected.get(fieldId)?.colIndex ?? -1;

  // Parse rows → ArticleMaster[]
  const articles: ArticleMaster[] = [];
  let skipped = 0;

  for (let ri = 0; ri < dataRows.length; ri++) {
    const row = dataRows[ri];

    const falmecArticleNo = idx('artNoDE') >= 0 ? cellStr(row[idx('artNoDE')]) : '';
    const manufacturerArticleNo = idx('artNoIT') >= 0 ? cellStr(row[idx('artNoIT')]) : '';
    const ean = idx('ean') >= 0 ? cellStr(row[idx('ean')]) : '';

    // Skip rows where all key identifiers are empty
    if (!falmecArticleNo && !manufacturerArticleNo && !ean) {
      skipped++;
      continue;
    }

    const article: ArticleMaster = {
      id: `md-${ri}-${falmecArticleNo || manufacturerArticleNo || ean}`,
      falmecArticleNo,
      manufacturerArticleNo,
      ean,
      unitPriceNet: idx('price') >= 0 ? cellNum(row[idx('price')]) : 0,
      serialRequirement: idx('serialRequired') >= 0 ? cellBool(row[idx('serialRequired')]) : false,
      storageLocation: idx('storageLocation') >= 0 ? cellStr(row[idx('storageLocation')]) : '',
      activeFlag: true, // Excel does not carry this; assume active
      supplierId: idx('supplierId') >= 0 ? (cellStr(row[idx('supplierId')]) || null) : null,
      descriptionDE: idx('descriptionDE') >= 0 ? (cellStr(row[idx('descriptionDE')]) || null) : null,
    };

    articles.push(article);
  }

  if (skipped > 0) {
    warnings.push(`${skipped} leere Zeilen übersprungen.`);
  }

  console.info(
    `[masterDataParser] Parsed ${articles.length} Artikel aus '${sheetName}' (${skipped} leer übersprungen)`,
    { columnMap, collisions },
  );

  return {
    articles,
    rowCount: articles.length,
    columnMap,
    collisions,
    warnings,
  };
}
