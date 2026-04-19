// store/internal/helpers.ts — PROJ-46 AP4c (Slice-Split)
// Wohnsitz für alle Store-externen Hilfsfunktionen, die die Slices und der
// Aggregator (runStore.ts) gemeinsam nutzen. EXAKTER 1:1-Umzug aus dem
// Monolithen — KEINE Logik-Änderungen. Ein kleines Set wird auch nach außen
// exportiert, weil externe Consumer (stepRunner, UI) es bereits erwarten
// (`resolveIssueLines`, `runStepGuard`); runStore.ts re-exportiert diese
// Symbole weiter, damit bestehende Import-Pfade nicht brechen.

import type {
  Run,
  InvoiceLine,
  Issue,
  UploadedFile,
  RunConfig,
  RunStats,
  OrderParserSelectionDiagnostics,
} from '@/types';
import type { ParserWarning } from '@/services/parsers/types';
import type { ParsedInvoiceResult } from '@/services/invoiceParserService';
import {
  runPersistenceService,
} from '@/services/runPersistenceService';
import { DEFAULT_ORDER_PARSER_PROFILE_ID } from '@/services/matching/orderParserProfiles';
import {
  validateStepPrerequisites,
  applyStepRepairs,
  validateStep3Async,
  type StepGuardResult,
  type StepGuardInput,
} from '@/services/stepGuard';
import { logService } from '@/services/logService';
import type { RunState } from '@/store/types';

// ── LocalStorage-Keys (Ingest) ─────────────────────────────────────────────
export const UPLOADED_FILES_KEY = 'falmec-uploaded-files';
export const PARSED_INVOICE_KEY = 'falmec-parsed-invoice';
export const PARSED_INVOICE_MAX_BYTES = 400 * 1024;

// Interface for persisted file metadata (without actual File object)
interface PersistedFileInfo {
  name: string;
  size: number;
  type: 'invoice' | 'openWE' | 'serialList' | 'articleList';
  uploadedAt: string;
}

// Load persisted files from localStorage
export function loadPersistedFiles(): PersistedFileInfo[] {
  try {
    const data = localStorage.getItem(UPLOADED_FILES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// Save files metadata to localStorage
export function savePersistedFiles(files: UploadedFile[]): void {
  const persistedFiles: PersistedFileInfo[] = files.map(f => ({
    name: f.name,
    size: f.size,
    type: f.type,
    uploadedAt: f.uploadedAt,
  }));
  try {
    localStorage.setItem(UPLOADED_FILES_KEY, JSON.stringify(persistedFiles));
  } catch (error) {
    console.warn('[RunStore] Failed to persist uploaded files metadata:', error);
  }
}

// Persist parsed invoice result (without File objects).
// If the serialized payload exceeds PARSED_INVOICE_MAX_BYTES, only the
// header + warnings are stored (no lines) to avoid QuotaExceededError.
export function saveParsedInvoice(result: ParsedInvoiceResult | null): void {
  try {
    if (!result) {
      localStorage.removeItem(PARSED_INVOICE_KEY);
      return;
    }
    const full = JSON.stringify(result);
    if (full.length <= PARSED_INVOICE_MAX_BYTES) {
      localStorage.setItem(PARSED_INVOICE_KEY, full);
    } else {
      // Store header + warnings only; lines are already in invoiceLines state
      const slim = JSON.stringify({ ...result, lines: [] });
      localStorage.setItem(PARSED_INVOICE_KEY, slim);
      console.warn(`[RunStore] parsedInvoice too large (${(full.length / 1024).toFixed(0)} KB) — stored header only`);
    }
  } catch (error) {
    console.warn('[RunStore] Failed to persist parsed invoice result:', error);
    // Last resort: clear the key so we don't block future writes
    try { localStorage.removeItem(PARSED_INVOICE_KEY); } catch { /* ignore */ }
  }
}

// Load persisted parsed invoice
export function loadParsedInvoice(): ParsedInvoiceResult | null {
  try {
    const data = localStorage.getItem(PARSED_INVOICE_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function mapParserWarningToIssueType(code: string): Issue['type'] {
  const normalized = code.toUpperCase();
  if (normalized.includes('ORDER_TYPE_B')) return 'order-assignment';
  if (normalized.includes('EAN')) return 'missing-ean';
  if (normalized.includes('IDENTIFIER')) return 'missing-ean';
  if (normalized.includes('PRICE')) return 'price-mismatch';
  return 'parser-error';
}

export function buildStep1ParserIssues(runId: string, warnings: ParserWarning[]): Issue[] {
  // ── Blocking issues from parser errors ──
  const parserErrors = warnings.filter((warning) => warning.severity === 'error');
  const blockingIssues: Issue[] = parserErrors.map((warning, index) => ({
    id: `issue-${runId}-step1-${warning.code || 'unknown'}-${index}-${Date.now()}`,
    runId,
    severity: 'error' as const,
    stepNo: 1,
    type: mapParserWarningToIssueType(warning.code),
    message: warning.message || 'Parserfehler ohne Meldung',
    details: `Code: ${warning.code || 'unknown'}${
      warning.positionIndex ? `, Position: ${warning.positionIndex}` : ''
    }`,
    relatedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    affectedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
  }));

  // ── Soft-fail issues from Typ-B order warnings ──
  const typeBWarnings = warnings.filter(
    (w) => w.severity === 'warning' && w.code === 'ORDER_TYPE_B_DETECTED',
  );
  const softFailIssues: Issue[] = typeBWarnings.map((warning, index) => ({
    id: `issue-${runId}-step1-${warning.code}-${index}-${Date.now()}`,
    runId,
    severity: 'warning' as const,
    stepNo: 1,
    type: mapParserWarningToIssueType(warning.code),
    message: warning.message || 'Sonderbuchungs-Bestellnummer erkannt',
    details: `Code: ${warning.code}${
      warning.positionIndex ? `, Position: ${warning.positionIndex}` : ''
    }`,
    relatedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    affectedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
  }));

  return [...blockingIssues, ...softFailIssues];
}

// ── PROJ-45: Zentraler ID-Resolver ───────────────────────────────────────
/**
 * PROJ-45: Zentraler Resolver — mappt alte Pre-Expansion-IDs auf aktuelle Zeilen.
 * Arbeitet in 2 Stufen:
 *   1. Direkte lineId-Matches (vor Expansion / IDs stimmen noch)
 *   2. Position-basierter Fallback per positionIndex (nach Expansion)
 *
 * @param ids         - relatedLineIds ODER affectedLineIds aus einem Issue
 * @param lines       - aktuelle InvoiceLine[] (evtl. bereits expandiert)
 * @param deduplicate - true: nur 1 Repräsentant pro positionIndex (UI-Anzeige)
 *                      false: alle expandierten Zeilen (Auto-Resolve, Isolier-Filter)
 */
export function resolveIssueLines(
  ids: string[],
  lines: InvoiceLine[],
  deduplicate: boolean = true,
): InvoiceLine[] {
  if (!ids || ids.length === 0) return [];

  // Stufe 1: Direkte ID-Matches (vor Expansion — IDs stimmen noch)
  const lineMap = new Map(lines.map(l => [l.lineId, l]));
  const direct = ids.map(id => lineMap.get(id)).filter((l): l is InvoiceLine => l != null);
  if (direct.length > 0) return direct;

  // Stufe 2: Position-basierter Fallback (nach Expansion)
  const positionSet = new Set<number>();
  for (const id of ids) {
    const m = id.match(/^.+-line-(\d+)$/);  // matcht NUR aggregierte IDs, NICHT expandierte
    if (m) positionSet.add(parseInt(m[1], 10));
  }
  if (positionSet.size === 0) return [];

  if (!deduplicate) {
    return lines.filter(l => positionSet.has(l.positionIndex));
  }

  // Deduplizierung: 1 Repräsentant pro positionIndex
  const seen = new Set<number>();
  return lines.filter(l => {
    if (!positionSet.has(l.positionIndex)) return false;
    if (seen.has(l.positionIndex)) return false;
    seen.add(l.positionIndex);
    return true;
  });
}

// ── PROJ-21 Phase 4: Auto-Resolve ────────────────────────────────────
/**
 * Check if an issue's error condition is still active based on current line data.
 * Returns `true` if the issue should remain open, `false` if it can be auto-resolved.
 */
export function checkIssueStillActive(issue: Issue, lines: InvoiceLine[]): boolean {
  // Only auto-resolve issues that reference specific lines
  if (issue.relatedLineIds.length === 0) return true;

  // PROJ-45: Zentraler Resolver — mappt alte Pre-Expansion-IDs auf aktuelle Zeilen
  const related = resolveIssueLines(issue.relatedLineIds, lines, false);
  // If none of the referenced lines exist (deleted?), keep open
  if (related.length === 0) return true;

  switch (issue.type) {
    case 'price-mismatch':
      // PROJ-46: Draft-Guard — Entwürfe (custom+draft) halten den Fehler offen
      return related.some(l => l.priceCheckStatus === 'mismatch' || (l.priceCheckStatus === 'custom' && l.manualStatus === 'draft'));

    case 'no-article-match':
    case 'match-artno-not-found':
    case 'match-ean-not-found':
      // PROJ-46: Draft-Guard — manuell zugeordnet aber noch nicht bestätigt
      return related.some(l => l.matchStatus === 'no-match' || l.manualStatus === 'draft');

    case 'match-conflict-id':
    case 'match-ambiguous':   // PROJ-48-ADD-ON
      // Conflict/ambiguity resolves when all related lines have a definitive match
      // PROJ-46: Draft-Guard
      return related.some(l => l.matchStatus === 'no-match' || l.matchStatus === 'pending' || l.manualStatus === 'draft');

    case 'supplier-missing':
      // Resolves when all related lines have a valid 5-digit supplierId
      return related.some(l => !l.supplierId || !/^\d{5}$/.test(l.supplierId));

    case 'serial-mismatch':
    case 'sn-insufficient-count':
      // PROJ-46: Draft-Guard
      return related.some(l => (l.serialRequired && l.serialNumbers.length < l.qty) || l.manualStatus === 'draft');

    case 'order-no-match':
      return related.some(l => l.orderAssignmentReason === 'not-ordered' || l.orderAssignmentReason === 'pending');

    case 'order-incomplete': {
      return related.some(l => {
        const allocated = l.allocatedOrders.reduce((s, a) => s + a.qty, 0);
        return allocated > 0 && allocated < l.qty;
      });
    }

    case 'inactive-article':
      return related.some(l => l.activeFlag === false);

    // These types are not auto-resolvable (parser errors, info hints, etc.)
    default:
      return true;
  }
}

/**
 * PROJ-44-R11: Zentrale Blocker-Matrix — SSOT für Workflow-Guards.
 * Entscheidet typbasiert (NICHT severity-basiert), ob ein Issue den Step blockiert.
 */
export function isIssueBlockingStep(issue: Issue, stepNo: number, config: RunConfig): boolean {
  // Nur offene/pending Issues können blockieren
  if (issue.status !== 'open' && issue.status !== 'pending') return false;
  // Issue muss zum aktuellen Step gehören
  if (issue.stepNo !== stepNo) return false;

  switch (stepNo) {
    case 1:
      // Parser-Fehler blockieren immer
      return issue.type === 'parser-error';

    case 2:
      // Artikel-Fehler blockieren IMMER
      if (
        issue.type === 'no-article-match' ||
        issue.type === 'match-artno-not-found' ||
        issue.type === 'match-ean-not-found' ||
        issue.type === 'match-conflict-id' ||
        issue.type === 'match-ambiguous'    // PROJ-48-ADD-ON
      ) {
        return true;
      }
      // Preisabweichung blockiert NUR wenn Config-Toggle aktiv
      if (issue.type === 'price-mismatch') {
        return config.blockStep2OnPriceMismatch === true;
      }
      return false;

    case 4:
      // Order-Fehler blockieren NUR wenn Config-Toggle aktiv
      if (
        issue.type === 'order-no-match' ||
        issue.type === 'order-incomplete' ||
        issue.type === 'order-assignment'
      ) {
        return config.blockStep4OnMissingOrder === true;
      }
      return false;

    case 5:
      // Export-Fehler blockieren IMMER
      return issue.type === 'missing-storage-location' || issue.type === 'export-no-lines';

    default:
      return false;
  }
}

/**
 * Scan all open issues and auto-resolve those whose error condition is no longer active.
 * Returns the original array reference if nothing changed (avoids unnecessary re-renders).
 */
export function autoResolveIssues(issues: Issue[], lines: InvoiceLine[], runId: string): Issue[] {
  let changed = false;
  const result = issues.map(issue => {
    if (issue.status !== 'open' || issue.runId !== runId) return issue;

    const stillActive = checkIssueStillActive(issue, lines);
    if (!stillActive) {
      changed = true;
      return {
        ...issue,
        status: 'resolved' as const,
        resolvedAt: new Date().toISOString(),
        resolutionNote: 'Automatisch gelöst durch manuelle Korrektur',
      };
    }
    return issue;
  });
  return changed ? result : issues;
}

/**
 * Compute match/price stats from invoice lines (after Step 2 article matching).
 */
export function computeMatchStats(lines: InvoiceLine[]): Partial<RunStats> {
  return {
    expandedLineCount: lines.length,
    fullMatchCount: lines.filter(l => l.matchStatus === 'full-match').length,
    codeItOnlyCount: lines.filter(l => l.matchStatus === 'code-it-only').length,
    eanOnlyCount: lines.filter(l => l.matchStatus === 'ean-only').length,
    noMatchCount: lines.filter(l => l.matchStatus === 'no-match').length,
    articleMatchedCount: lines.filter(
      l => l.matchStatus !== 'pending' && l.matchStatus !== 'no-match'
    ).length,
    serialRequiredCount: lines.filter(l => l.serialRequired).length,
    inactiveArticlesCount: lines.filter(l => !l.activeFlag).length,
    priceOkCount: lines.filter(l => l.priceCheckStatus === 'ok').length,
    priceMismatchCount: lines.filter(l => l.priceCheckStatus === 'mismatch').length,
    priceMissingCount: lines.filter(l => l.priceCheckStatus === 'missing').length,
    priceCustomCount: lines.filter(l => l.priceCheckStatus === 'custom').length,
  };
}

/**
 * Compute order stats from invoice lines (after Step 4 order matching).
 */
export function computeOrderStats(lines: InvoiceLine[]): Partial<RunStats> {
  return {
    matchedOrders: lines.filter(
      l => l.orderAssignmentReason !== 'pending' && l.orderAssignmentReason !== 'not-ordered'
    ).length,
    notOrderedCount: lines.filter(l => l.orderAssignmentReason === 'not-ordered').length,
    manualOkOrderCount: lines.filter(l => l.orderAssignmentReason === 'manual-ok').length,
  };
}

/**
 * Build blocking issues for no-match articles (Step 2).
 */
export function buildArticleMatchIssues(runId: string, lines: InvoiceLine[]): Issue[] {
  const noMatchLines = lines.filter(l => l.matchStatus === 'no-match');
  if (noMatchLines.length === 0) return [];

  return noMatchLines.map(l => ({
    id: `issue-${runId}-step2-no-match-pos${l.positionIndex}`,
    runId,
    severity: 'error' as const,
    stepNo: 2,
    type: 'no-article-match' as const,
    message: `Pos ${l.positionIndex}: Artikel ohne Match in Stammdaten`,
    details: `${l.manufacturerArticleNo || l.ean || l.lineId}`,
    relatedLineIds: [l.lineId],
    affectedLineIds: [l.lineId],
    status: 'open' as const,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
    context: { positionIndex: l.positionIndex, field: 'matchStatus', expectedValue: 'full-match' },
  }));
}

export function formatOrderParserDiagnostics(diagnostics?: OrderParserSelectionDiagnostics): string {
  if (!diagnostics) return 'Keine Diagnosedaten vorhanden';
  const topCandidates = diagnostics.candidates
    .slice(0, 3)
    .map((candidate) => {
      const ratioPercent = (candidate.validRatio * 100).toFixed(1);
      return `${candidate.header} [valid=${candidate.validCount}, ratio=${ratioPercent}%, nonEmpty=${candidate.nonEmptyCount}]`;
    });

  return [
    `Profil: ${diagnostics.profileId}`,
    `Gewaehlt: ${diagnostics.selectedHeader || 'n/a'} (Spalte ${diagnostics.selectedColumnIndex})`,
    `Confidence: ${diagnostics.confidence}`,
    `Kandidaten: ${topCandidates.join(' | ') || 'n/a'}`,
  ].join(' | ');
}

export function buildOrderParserFailureIssue(
  runId: string,
  diagnostics: OrderParserSelectionDiagnostics | undefined,
  detailsPrefix: string,
): Issue {
  return {
    id: `issue-${runId}-step4-order-parser-${Date.now()}`,
    runId,
    severity: 'error',
    stepNo: 4,
    type: 'parser-error',
    message: 'Order-Parser Qualitaetsgate blockiert Step 4',
    details: `${detailsPrefix}. ${formatOrderParserDiagnostics(diagnostics)}`,
    relatedLineIds: [],
    status: 'open',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolutionNote: null,
  };
}

// ── PROJ-49 SSOT: resetRunSensitiveState — gemeinsamer Helper ──────────────
// Wird von setCurrentRun(), createRunSkeleton() und cleanupFailedIngest() aufgerufen.
// Leert alle run-sensitiven globalen Felder.
export function resetRunSensitiveState(
  _get: () => RunState,
  set: (partial: Partial<RunState> | ((s: RunState) => Partial<RunState>)) => void,
): void {
  set({
    currentParsedRunId: null,
    parsedInvoiceResult: null,
    parsedPositions: [],
    parserWarnings: [],
    serialDocument: null,
    preFilteredSerials: [],
    uploadedFiles: [],
    orderPool: null,
    isPaused: false,
    isWaitingBeforeStep4: false,
    waitingStep4RunId: null,
    showStep4WaitingDialog: false,
    latestDiagnostics: {},
  });
}

// ── PROJ-49: Step-Guard helpers ─────────────────────────────────────────────

// PROJ-46 AP3 / R4 (B.5): stepGuard darf AUSSCHLIESSLICH aus IDB
// (falmec-receiptpro-runs) und masterDataStore lesen. Keine uploadedFiles,
// kein Live-Parsing. Das Feld `uploadedFiles` bleibt hier vorerst als
// Typ-Kontrakt (StepGuardInput in @/services/stepGuard), ist aber aus
// R4-Sicht ein Code-Gap — siehe ShadowAudit_M3 §2.1 für Dom-Entscheidung.
export function buildGuardInput(state: RunState): StepGuardInput {
  return {
    parsedInvoiceResult: state.parsedInvoiceResult,
    parsedPositions: state.parsedPositions,
    invoiceLines: state.invoiceLines,
    preFilteredSerials: state.preFilteredSerials,
    serialDocument: state.serialDocument,
    uploadedFiles: state.uploadedFiles, // PROJ-46 R4: Kandidat für Entfernung (Shadow-Audit M3 §2.1)
    runs: state.runs,
  };
}

/**
 * Runs the full guard cycle: validate → repair if needed → return result.
 * Used in advanceToNextStep, retryStep, and reprocessCurrentRun.
 *
 * PROJ-46 R4 (B.5): stepGuard liest NUR aus IDB + masterDataStore.
 * Keine uploadedFiles, kein Live-Parsing. Repair-Pfade laufen über
 * applyStepRepairs → rehydriert aus IDB (`runPersistenceService.loadRun`).
 */
// PROJ-46 AP2: Exportiert für stepRunner.ts — ermöglicht Guard-Execute-Kern-Reuse.
export async function runStepGuard(
  stepNo: number,
  runId: string,
  get: () => RunState,
  set: (partial: Partial<RunState>) => void,
): Promise<StepGuardResult> {
  const state = get();
  const guardInput = buildGuardInput(state);

  // Phase 2 (PROJ-44-R12): Step 3 uses async variant for IDB-Check (SSOT)
  const result = stepNo === 3
    ? await validateStep3Async(runId, guardInput)
    : validateStepPrerequisites(stepNo, runId, guardInput);

  if (result.canProceed || result.skipReason) return result;

  // Attempt repairs
  const repaired = await applyStepRepairs(
    result,
    stepNo,
    runId,
    guardInput,
    (partial) => set(partial as unknown as Partial<RunState>),
  );
  return repaired;
}

// ── PROJ-44-R12: Step-4-Orchestrierung als DRY-Helper (Phase 7) ───────────────
// Einzige kanonische Stelle für SSOT/Legacy/OpenWE-Branching (INVARIANTS A6).
// Aufgerufen von advanceToNextStep, retryStep und resumeRun.
// Skip-Pfade rufen advanceToNextStep(runId, 4) direkt auf (Targeted Mode + isPaused-Check).
// executeOrderMapping trägt Self-Advance selbst (Phase 3) — hier kein Advance-Aufruf.
//
// PROJ-46 AP3 — Step 4 IDB-First final (R4/R5):
//   SSOT-Pfad liest konsequent aus IDB via runPersistenceService.loadRun.
//   Legacy-Pfad nutzt weiterhin `cs.uploadedFiles.find(f => f.type === 'openWE')`
//   und live-Parsing via `parseOrderFile`. Dieser Pfad widerspricht R4/R5 (IDB-First) und
//   sollte in Iteration 2 entfernt werden, sobald alle aktiven Runs SSOT sind.
//   Entfernung in dieser Iteration bewusst NICHT durchgeführt (KISS/Mechaniker-Kontrakt: kein
//   eigenmächtiges Rausschneiden von Legacy-Fallback). Dokumentation siehe ShadowAudit_M3 §2.2.

export async function executeStep4Orchestration(
  runId: string,
  get: () => RunState,
  set: (partial: Partial<RunState> | ((s: RunState) => Partial<RunState>)) => void,
): Promise<void> {
  const cs = get();
  const activeMapper = cs.globalConfig.activeOrderMapperId;
  logService.info(`Auto-Start: Order-Mapping (Step 4, mapper=${activeMapper})`, { runId, step: 'Bestellungen mappen' });

  if (activeMapper === 'engine-proj-23') {
    // PROJ-49 SSOT 12a: parsedOrders aus IDB für SSOT-Runs
    const idbData = await runPersistenceService.loadRun(runId);
    const isSSoTRun = !!idbData?.ingestStatus;

    if (isSSoTRun) {
      const openWEStatus = idbData!.ingestStatus!.openWE;
      if (openWEStatus === 'not_provided') {
        logService.info('SSOT: Keine Bestell-Datei (not_provided) — Step 4 uebersprungen', { runId, step: 'Bestellungen mappen' });
        get().updateStepStatus(runId, 4, 'ok');
        if (!get().isPaused) {
          get().advanceToNextStep(runId, 4);
        }
        return;
      } else if (openWEStatus === 'ready') {
        if (!idbData!.parsedOrderPool?.length) {
          logService.error('[Step4] SSOT-Run: ingestStatus.openWE=ready aber kein parsedOrderPool — Integritätsfehler', { runId, step: 'Bestellungen mappen' });
          get().updateStepStatus(runId, 4, 'failed');
          return;
        }
        get().executeOrderMapping(idbData!.parsedOrderPool, idbData);
        return;
      } else {
        logService.error(`[Step4] SSOT-Run: openWE-Status '${openWEStatus}' — Blocker`, { runId, step: 'Bestellungen mappen' });
        get().updateStepStatus(runId, 4, 'failed');
        return;
      }
    }

    // Legacy path: Parse openWE file if available, then run PROJ-23 3-Run Engine
    const openWEFile = cs.uploadedFiles.find(f => f.type === 'openWE');
    if (openWEFile?.file) {
      const { parseOrderFile } = await import('@/services/matching/orderParser');
      const runConfig = cs.currentRun?.config ?? cs.globalConfig;
      const parseResult = await parseOrderFile(openWEFile.file, {
        profileId: runConfig.activeOrderParserProfileId ?? DEFAULT_ORDER_PARSER_PROFILE_ID,
        overrides: runConfig.orderParserProfileOverrides,
      });

      for (const w of parseResult.warnings) {
        logService.warn(`[OrderParser] ${w}`, { runId, step: 'Bestellungen mappen' });
      }

      // PROJ-41: Strukturierte Parser-Issues in State übernehmen
      if (parseResult.issues && parseResult.issues.length > 0) {
        set((state) => ({
          issues: [
            ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4 && i.type === 'parser-error')),
            ...parseResult.issues!.map(issue => ({ ...issue, runId })),
          ],
        }));
      }

      if (parseResult.diagnostics) {
        get().setStepDiagnostics(4, {
          stepNo: 4,
          moduleName: parseResult.diagnostics.profileId,
          confidence: parseResult.diagnostics.confidence,
          summary: `${parseResult.positions.length} Bestellpositionen, Spalte: ${parseResult.diagnostics.selectedHeader || 'n/a'}`,
          timestamp: new Date().toISOString(),
        });
      }

      // Pre-Check Validierungsfehler (wissenschaftliche Notation / fehlende IDs)
      if (parseResult.validationError) {
        const parserIssue = buildOrderParserFailureIssue(
          runId,
          parseResult.diagnostics,
          `Datei-Validierung fehlgeschlagen: ${parseResult.validationError}`,
        );
        set((state) => {
          const updatedRun = state.runs.find(r => r.id === runId);
          if (!updatedRun) return state;
          const newRun: Run = {
            ...updatedRun,
            status: 'soft-fail',
            steps: updatedRun.steps.map((step) =>
              step.stepNo === 4
                ? { ...step, status: 'failed', issuesCount: 1 }
                : step,
            ),
          };
          return {
            runs: state.runs.map(r => r.id === runId ? newRun : r),
            currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
            issues: [
              ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
              parserIssue,
            ],
          };
        });
        logService.error(
          `[OrderParser] Validierungsfehler blockiert Step 4: ${parseResult.validationError}`,
          { runId, step: 'Bestellungen mappen' },
        );
        return;
      }

      const lowConfidence = parseResult.diagnostics?.confidence === 'low';
      if (parseResult.positions.length === 0 || lowConfidence) {
        const detailsPrefix = parseResult.positions.length === 0
          ? 'Keine gueltigen offenen Bestellungen erkannt'
          : 'Spaltenauswahl mit niedriger Confidence erkannt';
        const parserIssue = buildOrderParserFailureIssue(runId, parseResult.diagnostics, detailsPrefix);
        set((state) => {
          const updatedRun = state.runs.find(r => r.id === runId);
          if (!updatedRun) return state;
          const newRun: Run = {
            ...updatedRun,
            status: 'soft-fail',
            steps: updatedRun.steps.map((step) =>
              step.stepNo === 4
                ? { ...step, status: 'failed', issuesCount: 1 }
                : step,
            ),
          };
          return {
            runs: state.runs.map(r => r.id === runId ? newRun : r),
            currentRun: state.currentRun?.id === runId ? newRun : state.currentRun,
            issues: [
              ...state.issues.filter(i => !(i.runId === runId && i.stepNo === 4)),
              parserIssue,
            ],
          };
        });
        logService.error(
          `Order-Parser Gate blockiert Step 4: ${detailsPrefix}`,
          { runId, step: 'Bestellungen mappen' },
        );
        return;
      }

      get().executeOrderMapping(parseResult.positions);
    } else {
      // No openWE file → skip Step 4 with ok
      logService.info('Keine Bestell-Datei geladen — Step 4 wird uebersprungen', { runId, step: 'Bestellungen mappen' });
      get().updateStepStatus(runId, 4, 'ok');
      if (!get().isPaused) {
        get().advanceToNextStep(runId, 4);
      }
    }
  } else {
    // Legacy path: use matchAllOrders (requires OpenWEPosition[] from somewhere)
    logService.info('Legacy OrderMatcher (3 Regeln) — manueller Start erforderlich', { runId, step: 'Bestellungen mappen' });
    get().updateStepStatus(runId, 4, 'ok');
    if (!get().isPaused) {
      get().advanceToNextStep(runId, 4);
    }
  }
}
