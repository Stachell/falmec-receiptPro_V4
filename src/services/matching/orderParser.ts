import * as XLSX from 'xlsx';
import type {
  OrderParseResult,
  OrderParserCandidateScore,
  OrderParserConfidence,
  OrderParserProfile,
  OrderParserProfileOverrides,
  OrderParserSelectionDiagnostics,
  ParsedOrderPosition,
} from '@/types';
import {
  DEFAULT_ORDER_PARSER_PROFILE_ID,
  resolveOrderParserProfile,
} from './orderParserProfiles';

const FALLBACK_ORDER_NUMBER_REGEX = /^1\d{4}$/;
const FALLBACK_ORDER_YEAR_REGEX = /^\d{4}$/;

interface ColumnMapping {
  artNoDE: number;
  artNoIT: number;
  ean: number;
  supplierId: number;
  openQuantity: number;
  orderNumber: number;
  orderYear: number;
  belegnummer: number;
}

export interface ParseOrderFileOptions {
  profileId?: string;
  profile?: OrderParserProfile;
  overrides?: OrderParserProfileOverrides;
}

export type ParseOrderFileProfileInput = OrderParserProfile | ParseOrderFileOptions;

function norm(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function cellStr(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function cellNum(value: unknown): number {
  const raw = String(value ?? '').replace(',', '.').trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Wissenschaftliche Notation: z. B. "8,03412E+12" oder "8.03412e+12"
const SCIENTIFIC_EAN_PATTERN = /^-?\d[\d,.]*(E|e)[+\-]\d+$/;
const MISSING_ID_THRESHOLD = 5; // Mindestanzahl Zeilen ohne jede ID für Regel-B-Alarm
const MISSING_ID_RATIO = 0.8;   // Oder: > 80% der Zeilen ohne ID

interface PreCheckResult {
  ok: boolean;
  reason: string;
}

function validateOrderDataRows(dataRows: unknown[][], mapping: ColumnMapping): PreCheckResult {
  let scientificCount = 0;
  let firstScientificRow = -1;
  let firstScientificValue = '';
  let missingIdCount = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const row = dataRows[i] as unknown[];

    // Regel A: Wissenschaftliche Notation in EAN-Spalte
    if (mapping.ean >= 0) {
      const rawEan = cellStr(row[mapping.ean]);
      if (rawEan && SCIENTIFIC_EAN_PATTERN.test(rawEan)) {
        scientificCount += 1;
        if (scientificCount === 1) {
          firstScientificRow = i + 2; // +1 für Header, +1 für 1-basierte Zeilenzählung
          firstScientificValue = rawEan;
        }
      }
    }

    // Regel B: Zeile ohne jegliche Artikel-ID
    const eanVal = mapping.ean >= 0 ? cellStr(row[mapping.ean]) : '';
    const artDE = mapping.artNoDE >= 0 ? cellStr(row[mapping.artNoDE]) : '';
    const artIT = mapping.artNoIT >= 0 ? cellStr(row[mapping.artNoIT]) : '';
    if (!eanVal && !artDE && !artIT) {
      missingIdCount += 1;
    }
  }

  // Regel A auswerten (Priorität: wird als erstes geprüft)
  if (scientificCount > 0) {
    return {
      ok: false,
      reason: `Datenverlust in EAN-Spalte entdeckt: ${scientificCount} Wert(e) in wissenschaftlicher Notation (z. B. "${firstScientificValue}" in Zeile ${firstScientificRow}). Bitte als XLSX oder XLS exportieren statt CSV.`,
    };
  }

  // Regel B auswerten
  const totalRows = dataRows.length;
  const missingIdRatio = totalRows > 0 ? missingIdCount / totalRows : 0;
  if (missingIdCount >= MISSING_ID_THRESHOLD || missingIdRatio > MISSING_ID_RATIO) {
    return {
      ok: false,
      reason: `Pflicht-IDs fehlen in ${missingIdCount} von ${totalRows} Zeilen (EAN, Art-# DE und Art-# IT alle leer). Bitte Datei pruefen und korrigieren.`,
    };
  }

  return { ok: true, reason: '' };
}

function listCandidateColumns(headers: string[], aliases: string[]): number[] {
  const normalizedAliases = aliases.map(norm).filter(Boolean);
  if (normalizedAliases.length === 0) return [];

  const candidates: number[] = [];
  for (let index = 0; index < headers.length; index += 1) {
    const header = norm(headers[index]);
    if (normalizedAliases.some((alias) => header.includes(alias))) {
      candidates.push(index);
    }
  }
  return candidates;
}

function detectSingleColumn(headers: string[], aliases: string[]): number {
  const candidates = listCandidateColumns(headers, aliases);
  return candidates.length > 0 ? candidates[0] : -1;
}

function parseRegex(pattern: string | undefined, fallback: RegExp): RegExp {
  if (!pattern || !pattern.trim()) return fallback;
  try {
    return new RegExp(pattern);
  } catch {
    return fallback;
  }
}

function extractOrderNumber(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 5) return digits.slice(-5);
  return raw;
}

function extractOrderYear(value: string, orderYearRegex: RegExp): number {
  const raw = value.trim();
  if (orderYearRegex.test(raw)) {
    return Number.parseInt(raw, 10);
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 4) {
    const yearCandidate = digits.slice(0, 4);
    if (orderYearRegex.test(yearCandidate)) {
      return Number.parseInt(yearCandidate, 10);
    }
  }
  return 0;
}

function getTieBreakRank(header: string, priorities: string[]): number {
  if (!priorities.length) return Number.MAX_SAFE_INTEGER;
  const normalizedHeader = norm(header);
  for (let index = 0; index < priorities.length; index += 1) {
    if (normalizedHeader.includes(norm(priorities[index]))) {
      return index;
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function scoreOrderNumberCandidates(
  headers: string[],
  dataRows: unknown[][],
  candidateColumns: number[],
  orderNumberRegex: RegExp,
  tieBreakPriorities: string[],
): OrderParserCandidateScore[] {
  return candidateColumns.map((columnIndex) => {
    let nonEmptyCount = 0;
    let validCount = 0;

    for (const rawRow of dataRows) {
      const row = rawRow as unknown[];
      const source = cellStr(row[columnIndex]);
      if (!source) continue;

      nonEmptyCount += 1;
      const normalized = extractOrderNumber(source);
      if (orderNumberRegex.test(normalized)) {
        validCount += 1;
      }
    }

    const validRatio = nonEmptyCount > 0 ? validCount / nonEmptyCount : 0;
    return {
      columnIndex,
      header: headers[columnIndex] ?? `COL-${columnIndex}`,
      validCount,
      validRatio,
      nonEmptyCount,
      tieBreakRank: getTieBreakRank(headers[columnIndex], tieBreakPriorities),
    };
  });
}

function compareCandidateScore(a: OrderParserCandidateScore, b: OrderParserCandidateScore): number {
  if (a.validCount !== b.validCount) return b.validCount - a.validCount;
  if (a.validRatio !== b.validRatio) return b.validRatio - a.validRatio;
  if (a.nonEmptyCount !== b.nonEmptyCount) return b.nonEmptyCount - a.nonEmptyCount;
  if (a.tieBreakRank !== b.tieBreakRank) return a.tieBreakRank - b.tieBreakRank;
  return a.columnIndex - b.columnIndex;
}

function determineConfidence(topCandidate?: OrderParserCandidateScore): OrderParserConfidence {
  if (!topCandidate || topCandidate.validCount === 0) return 'low';
  if (topCandidate.validRatio >= 0.8 && topCandidate.validCount >= 3) return 'high';
  if (topCandidate.validRatio >= 0.35 && topCandidate.validCount >= 1) return 'medium';
  return 'low';
}

function detectColumns(
  headers: string[],
  dataRows: unknown[][],
  profile: OrderParserProfile,
): { mapping: ColumnMapping; warnings: string[]; diagnostics: OrderParserSelectionDiagnostics } {
  const warnings: string[] = [];
  const mapping: ColumnMapping = {
    artNoDE: -1,
    artNoIT: -1,
    ean: -1,
    supplierId: -1,
    openQuantity: -1,
    orderNumber: -1,
    orderYear: -1,
    belegnummer: -1,
  };

  const orderNumberRegex = parseRegex(profile.orderNumberRegex, FALLBACK_ORDER_NUMBER_REGEX);
  const orderNumberCandidates = listCandidateColumns(headers, profile.aliases.orderNumberCandidates);
  const candidateScores = scoreOrderNumberCandidates(
    headers,
    dataRows,
    orderNumberCandidates,
    orderNumberRegex,
    profile.orderNumberTieBreakPriority ?? ['BELEGNUMMER'],
  ).sort(compareCandidateScore);

  const selectedCandidate = candidateScores[0];
  const confidence = determineConfidence(selectedCandidate);

  if (selectedCandidate) {
    mapping.orderNumber = selectedCandidate.columnIndex;
  } else {
    warnings.push('Spalte fuer Belegnummer / Bestellnummer nicht erkannt');
  }

  mapping.orderYear = detectSingleColumn(headers, profile.aliases.orderYear);
  mapping.openQuantity = detectSingleColumn(headers, profile.aliases.openQuantity);
  mapping.artNoDE = detectSingleColumn(headers, profile.aliases.artNoDE);
  mapping.artNoIT = detectSingleColumn(headers, profile.aliases.artNoIT);
  mapping.ean = detectSingleColumn(headers, profile.aliases.ean);
  mapping.supplierId = detectSingleColumn(headers, profile.aliases.supplierId);
  mapping.belegnummer = detectSingleColumn(headers, profile.aliases.belegnummer);

  if (mapping.openQuantity === -1) {
    warnings.push('Spalte "Offene Menge" nicht erkannt');
  }
  if (mapping.artNoDE === -1 && mapping.artNoIT === -1 && mapping.ean === -1) {
    warnings.push('Keine Artikel-ID-Spalte erkannt (Art-DE, Art-IT oder EAN)');
  }
  if (confidence === 'low') {
    warnings.push('Order-Parser Confidence ist niedrig (Spaltenwahl pruefen)');
  }

  const diagnostics: OrderParserSelectionDiagnostics = {
    profileId: profile.id,
    selectedColumnIndex: selectedCandidate?.columnIndex ?? -1,
    selectedHeader: selectedCandidate?.header ?? '',
    confidence,
    candidates: candidateScores,
  };

  return { mapping, warnings, diagnostics };
}

function isProfileObject(input: ParseOrderFileProfileInput): input is OrderParserProfile {
  const maybeProfile = input as OrderParserProfile;
  return !!maybeProfile && typeof maybeProfile === 'object' && typeof maybeProfile.id === 'string'
    && typeof maybeProfile.orderNumberRegex === 'string'
    && typeof maybeProfile.orderYearRegex === 'string'
    && !!maybeProfile.aliases;
}

function resolveProfileInput(profileOrOptions?: ParseOrderFileProfileInput): OrderParserProfile {
  if (!profileOrOptions) {
    return resolveOrderParserProfile(DEFAULT_ORDER_PARSER_PROFILE_ID);
  }

  if (isProfileObject(profileOrOptions)) {
    return resolveOrderParserProfile(profileOrOptions.id, undefined, profileOrOptions);
  }

  return resolveOrderParserProfile(
    profileOrOptions.profileId ?? profileOrOptions.profile?.id ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
    profileOrOptions.overrides,
    profileOrOptions.profile,
  );
}

export async function parseOrderFile(
  file: File,
  profileOrOptions?: ParseOrderFileProfileInput,
): Promise<OrderParseResult> {
  const warnings: string[] = [];
  const profile = resolveProfileInput(profileOrOptions);
  const orderNumberRegex = parseRegex(profile.orderNumberRegex, FALLBACK_ORDER_NUMBER_REGEX);
  const orderYearRegex = parseRegex(profile.orderYearRegex, FALLBACK_ORDER_YEAR_REGEX);

  const buffer = await file.arrayBuffer();
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const workbook = ext === 'csv'
    ? XLSX.read(new TextDecoder('iso-8859-1').decode(buffer), { type: 'string', FS: ';' })
    : XLSX.read(buffer, { type: 'array' });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return {
      positions: [],
      rowCount: 0,
      warnings: ['Keine Sheets im Workbook'],
    };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });
  if (rows.length < 2) {
    return {
      positions: [],
      rowCount: 0,
      warnings: ['Keine Datenzeilen gefunden'],
    };
  }

  const headers = (rows[0] as unknown[]).map(cellStr);
  const dataRows = rows.slice(1);

  const { mapping, warnings: columnWarnings, diagnostics } = detectColumns(headers, dataRows, profile);
  warnings.push(...columnWarnings);

  // Pre-Check: Fail-Fast-Validierung vor der Hauptschleife
  const preCheck = validateOrderDataRows(dataRows, mapping);
  if (!preCheck.ok) {
    console.warn(`[orderParser] Pre-Check fehlgeschlagen: ${preCheck.reason}`);
    return {
      positions: [],
      rowCount: 0,
      warnings: [preCheck.reason],
      diagnostics,
      validationError: preCheck.reason,
    };
  }

  const positions: ParsedOrderPosition[] = [];
  let skippedByRegex = 0;

  for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
    const row = dataRows[rowIndex] as unknown[];

    const orderNumberRaw = mapping.orderNumber >= 0 ? cellStr(row[mapping.orderNumber]) : '';
    const orderNumber = extractOrderNumber(orderNumberRaw);
    if (!orderNumberRegex.test(orderNumber)) {
      skippedByRegex += 1;
      continue;
    }

    const openQuantity = mapping.openQuantity >= 0 ? cellNum(row[mapping.openQuantity]) : 0;
    if (openQuantity <= 0) {
      continue;
    }

    const orderYearRaw = mapping.orderYear >= 0 ? cellStr(row[mapping.orderYear]) : '';
    const orderYear = extractOrderYear(orderYearRaw || orderNumberRaw, orderYearRegex);

    const artNoDE = mapping.artNoDE >= 0 ? cellStr(row[mapping.artNoDE]) : '';
    const artNoIT = mapping.artNoIT >= 0 ? cellStr(row[mapping.artNoIT]) : '';
    const ean = mapping.ean >= 0 ? cellStr(row[mapping.ean]) : '';
    const supplierId = mapping.supplierId >= 0 ? cellStr(row[mapping.supplierId]) : '';
    const belegnummerRaw = mapping.belegnummer >= 0 ? cellStr(row[mapping.belegnummer]) : orderNumberRaw;

    positions.push({
      id: `op-${rowIndex}-${orderNumber}`,
      artNoDE,
      artNoIT,
      ean,
      supplierId,
      openQuantity: Math.round(openQuantity),
      orderNumber,
      orderYear,
      belegnummer: belegnummerRaw,
    });
  }

  if (skippedByRegex > 0) {
    warnings.push(`${skippedByRegex} Zeilen mit ungueltiger Belegnummer uebersprungen`);
  }

  console.info(
    `[orderParser] Parsed ${positions.length} offene Bestellungen aus '${file.name}' (profile=${profile.id}, skipped=${skippedByRegex})`,
  );

  return {
    positions,
    rowCount: positions.length,
    warnings,
    diagnostics,
  };
}
