// slices/mutationSlice.ts — PROJ-46 AP4c (Slice-Split)
// 1:1-Umzug aus runStore.ts — Mechaniker-Kontrakt, keine Logik-Änderungen.
// Ownership: updateInvoiceLine, updatePositionLines, setManual*, reassignOrder,
// confirmNoOrder, confirmManualFix, bulkConfirmDraftIssues, refreshIssues, reopenIssue.

import type { StateCreator } from 'zustand';
import type { RunState } from '@/store/types';
import type { Run, InvoiceLine, StepStatus } from '@/types';
import { logService } from '@/services/logService';
import { runPersistenceService } from '@/services/runPersistenceService';
import { consumeFromPool, returnToPool } from '@/services/matching/orderPool';
import { buildAutoSavePayload } from '@/hooks/buildAutoSavePayload';
import { useMasterDataStore } from '@/store/masterDataStore';
import {
  autoResolveIssues,
  computeMatchStats,
  computeOrderStats,
  recalculateRunStats,
  recalculateRunAfterMutation,
} from '@/store/internal/helpers';

export type MutationSlice = Pick<
  RunState,
  | 'updateInvoiceLine'
  | 'updatePositionLines'
  | 'refreshIssues'
  | 'reopenIssue'
  | 'confirmManualFix'
  | 'bulkConfirmDraftIssues'
  | 'setManualPrice'
  | 'setManualPriceByPosition'
  | 'setManualArticleByPosition'
  | 'setManualArticleByLine'
  | 'updateLineSerialData'
  | 'setManualOrder'
  | 'confirmNoOrder'
  | 'reassignOrder'
>;

export const createMutationSlice: StateCreator<RunState, [], [], MutationSlice> = (set, get) => ({
  updateInvoiceLine: (lineId, updates) => {
    const cr = get().currentRun; if (!cr || !lineId.startsWith(`${cr.id}-line-`)) return;
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId === lineId ? { ...line, ...updates } : line
      ),
    }));
    recalculateRunAfterMutation(cr.id, get, set);
  },

  // PROJ-20: Cascade updates from aggregated position to all expanded lines
  updatePositionLines: (positionIndex, updates) => {
    const { currentRun } = get();
    if (!currentRun) return;
    const runPrefix = `${currentRun.id}-line-`;
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.positionIndex === positionIndex && line.lineId.startsWith(runPrefix)
          ? { ...line, ...updates }
          : line
      ),
    }));
    recalculateRunAfterMutation(currentRun.id, get, set);
  },

  // PROJ-43: Refresh issues — auto-resolve and re-generate Step-5 issues
  refreshIssues: (runId) => {
    const cr = get().currentRun; if (!cr || runId !== cr.id) return;
    recalculateRunAfterMutation(runId, get, set);
    logService.info('Issues aktualisiert', { runId, step: 'Issues' });
  },

  // PROJ-43: Reopen a pending issue (pending → open)
  reopenIssue: (issueId) => {
    const issueToReopen = get().issues.find(i => i.id === issueId);
    if (!issueToReopen) return;
    const cr = get().currentRun; if (!cr || issueToReopen.runId !== cr.id) return;

    set((state) => {
      let updatedLines = state.invoiceLines;

      // PROJ-44-R10: Bei price-mismatch die betroffenen Zeilen zurücksetzen
      if (issueToReopen.type === 'price-mismatch' && issueToReopen.affectedLineIds?.length) {
        const affectedSet = new Set(issueToReopen.affectedLineIds);
        // Auch expandierte Zeilen der betroffenen Positionen zurücksetzen
        const affectedPositions = new Set(
          state.invoiceLines
            .filter(l => affectedSet.has(l.lineId))
            .map(l => l.positionIndex),
        );
        const runPrefix = issueToReopen.runId + '-';
        updatedLines = state.invoiceLines.map(line =>
          line.lineId.startsWith(runPrefix)
            && affectedPositions.has(line.positionIndex)
            && line.priceCheckStatus === 'custom'
            ? { ...line, priceCheckStatus: 'mismatch' as const, unitPriceFinal: null, manualStatus: undefined } // PROJ-46: manualStatus zurücksetzen
            : line
        );
      }

      // PROJ-46: Bei Artikel-Issues confirmed→draft zurückstufen (kein Full-Reset)
      const articleIssueTypes = ['no-article-match', 'match-artno-not-found', 'match-ean-not-found'];
      if (articleIssueTypes.includes(issueToReopen.type)) {
        const affIds = new Set(issueToReopen.affectedLineIds ?? issueToReopen.relatedLineIds ?? []);
        const affPos = new Set(
          state.invoiceLines.filter(l => affIds.has(l.lineId)).map(l => l.positionIndex),
        );
        const runPfx = issueToReopen.runId + '-';
        updatedLines = updatedLines.map(line =>
          line.lineId.startsWith(runPfx)
            && affPos.has(line.positionIndex)
            && line.manualStatus === 'confirmed'
            ? { ...line, manualStatus: 'draft' as const }
            : line
        );
      }

      return {
        invoiceLines: updatedLines,
        issues: state.issues.map(issue =>
          issue.id === issueId
            ? {
                ...issue,
                status: 'open' as const,
                resolvedAt: null,
                resolutionNote: null,
                escalatedAt: undefined,
                escalatedTo: undefined,
              }
            : issue
        ),
      };
    });

    const runId = get().issues.find(i => i.id === issueId)?.runId ?? get().currentRun?.id;
    if (runId) {
      logService.info(`Issue reaktiviert: ${issueId}`, { runId, step: 'Issues' });
      get().addAuditEntry({ runId, action: 'reopenIssue', details: `issueId=${issueId}`, userId: 'system' });

      // PROJ-46 M4 AP8 Row 4: Stats-Only Recalc — Full-Hub würde das re-opened
      // Issue via autoResolveIssues sofort wieder schließen (siehe Phase V.2.e).
      recalculateRunStats(runId, get, set);
    }
  },

  // ─── PROJ-46: Einzelbestätigung — draft→confirmed + resolve + refresh ───
  confirmManualFix: (issueId, resolutionNote) => {
    const issue = get().issues.find(i => i.id === issueId);
    if (!issue) return;
    const runId = issue.runId ?? get().currentRun?.id;
    if (!runId) return;
    const cr = get().currentRun; if (runId !== cr?.id) return;

    // 1. Alle betroffenen Positionen ermitteln (relatedLineIds → positionIndex)
    const allLines = get().invoiceLines;
    const affectedSet = new Set(issue.relatedLineIds ?? []);
    const affectedPositions = new Set(
      allLines.filter(l => affectedSet.has(l.lineId)).map(l => l.positionIndex),
    );

    // 2. Alle Draft-Lines dieser Positionen auf confirmed upgraden
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId.startsWith(runId + '-line-')
          && affectedPositions.has(line.positionIndex)
          && line.manualStatus === 'draft'
          ? { ...line, manualStatus: 'confirmed' as const }
          : line
      ),
    }));

    // 3. Issue resolven
    get().resolveIssue(issueId, resolutionNote || 'Manuell bestätigt');

    // 4. Kaskade (Step-5 etc.)
    get().refreshIssues(runId);

    get().addAuditEntry({
      runId,
      action: 'confirmManualFix',
      details: `issueId=${issueId}, positions=[${[...affectedPositions].join(',')}]`,
      userId: 'system',
    });
  },

  // ─── PROJ-46: Bulk-Bestätigung mit 3-stufiger Validierung ───
  bulkConfirmDraftIssues: (runId) => {
    const cr = get().currentRun; if (!cr || runId !== cr.id) return { success: false, message: 'Run nicht aktiv.' };
    const { issues, invoiceLines, globalConfig } = get();
    const runIssues = issues.filter(i => i.runId === runId && i.status === 'open');
    const runLines = invoiceLines.filter(l => l.lineId.startsWith(runId + '-line-'));
    const draftLines = runLines.filter(l => l.manualStatus === 'draft');

    // Stufe 1: Preisabweichung offen?
    const priceMismatchOpen = runIssues.some(i => i.type === 'price-mismatch');
    if (priceMismatchOpen) {
      return { success: false, message: 'Bitte erst Preisabweichungen in Einzelbearbeitung loesen (Mail an Buchhaltung empfohlen).' };
    }

    // Keine Entwürfe vorhanden?
    if (draftLines.length === 0) {
      return { success: false, message: 'Keine Entwuerfe zum Bestaetigen vorhanden.' };
    }

    // Stufe 2: Strikte Feld-Checkliste pro Draft-Line
    const artNoRegexStr = globalConfig?.matcherProfileOverrides?.artNoDeRegex;
    let artNoRegex: RegExp;
    try {
      artNoRegex = artNoRegexStr ? new RegExp(artNoRegexStr) : /^1\d{5}$/;
    } catch {
      artNoRegex = /^1\d{5}$/;
    }

    for (const line of draftLines) {
      const pos = line.positionIndex + 1;
      if (line.articleSource === 'manual') {
        if (!line.falmecArticleNo || !artNoRegex.test(line.falmecArticleNo)) {
          return { success: false, message: `Position ${pos}: Artikelnummer ungueltig oder fehlt.` };
        }
        if (!line.storageLocation) {
          return { success: false, message: `Position ${pos}: Lagerort fehlt.` };
        }
        if (!line.ean) {
          return { success: false, message: `Position ${pos}: EAN fehlt.` };
        }
      }
      if (line.serialRequired && line.serialNumbers.length < line.qty) {
        return { success: false, message: `Position ${pos}: Seriennummern unvollstaendig (${line.serialNumbers.length}/${line.qty}).` };
      }
    }

    // Stufe 3: Alle valide → draft→confirmed
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId.startsWith(runId + '-line-') && line.manualStatus === 'draft'
          ? { ...line, manualStatus: 'confirmed' as const }
          : line
      ),
    }));

    // Zugehörige Issues resolven
    const draftPositions = new Set(draftLines.map(l => l.positionIndex));
    const issuesToResolve = runIssues.filter(i =>
      (i.relatedLineIds ?? []).some(lid => {
        const line = runLines.find(l => l.lineId === lid);
        return line && draftPositions.has(line.positionIndex);
      })
    );
    for (const issue of issuesToResolve) {
      get().resolveIssue(issue.id, 'Bulk-Bestaetigung via Aktualisieren');
    }

    get().refreshIssues(runId);
    get().addAuditEntry({
      runId,
      action: 'bulkConfirmDraftIssues',
      details: `${draftLines.length} Entwuerfe bestaetigt, ${issuesToResolve.length} Issues resolved`,
      userId: 'system',
    });
    return { success: true };
  },

  setManualPrice: (lineId, price) => {
    const cr = get().currentRun; if (!cr || !lineId.startsWith(`${cr.id}-line-`)) return;
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId === lineId
          ? {
              ...line,
              unitPriceFinal: price,
              priceCheckStatus: 'custom' as const,
              manualStatus: 'draft' as const, // PROJ-46: Entwurf (blau)
            }
          : line
      ),
    }));

    const runId = cr.id;
    logService.info(`Manueller Preis: ${price}`, { runId, step: 'Artikel extrahieren', details: `lineId=${lineId}` });
    get().addAuditEntry({ runId, action: 'setManualPrice', details: `lineId=${lineId}, price=${price}`, userId: 'system' });

    recalculateRunAfterMutation(cr.id, get, set);
  },

  // ─── PROJ-45: Bulk-Preis auf alle expandierten Zeilen einer Position ──
  setManualPriceByPosition: (positionIndex, price, runId) => {
    const cr = get().currentRun; if (!cr || runId !== cr.id) return;
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.positionIndex === positionIndex && line.lineId.startsWith(runId + '-line-')
          ? {
              ...line,
              unitPriceFinal: price,
              priceCheckStatus: 'custom' as const,
              manualStatus: 'draft' as const, // PROJ-46: Entwurf (blau)
            }
          : line
      ),
    }));

    logService.info(
      `Manueller Bulk-Preis: ${price} für Position ${positionIndex}`,
      { runId, step: 'Artikel extrahieren', details: `positionIndex=${positionIndex}` },
    );
    get().addAuditEntry({
      runId,
      action: 'setManualPrice',
      details: `positionIndex=${positionIndex}, price=${price} (bulk)`,
      userId: 'system',
    });

    recalculateRunAfterMutation(runId, get, set);
  },

  // ─── PROJ-45-ADD-ON-round4: Manuellen Artikel-Fix auf alle expandierten Zeilen einer Position ───
  setManualArticleByPosition: (positionIndex, data, runId) => {
    const cr = get().currentRun; if (!cr || runId !== cr.id) return;
    // 0. Stammdaten-Lookup — prüfen ob falmecArticleNo im Stamm vorhanden
    const masterArticles = useMasterDataStore.getState().articles;
    const matched = masterArticles.find(a => a.falmecArticleNo === data.falmecArticleNo);

    const { globalConfig } = get();
    const tolerance = globalConfig?.tolerance ?? 0.01;

    set((state) => ({
      invoiceLines: state.invoiceLines.map(line => {
        if (!(line.positionIndex === positionIndex && line.lineId.startsWith(runId + '-line-'))) {
          return line;
        }

        const storageLocation = matched?.storageLocation || data.storageLocation || line.storageLocation || null;
        // EXAKT wie der Matcher: KDD case-sensitive, Default 'WE' für alle anderen Locations
        const logicalStorageGroup: 'WE' | 'KDD' | null = storageLocation
          ? (storageLocation.includes('KDD') ? 'KDD' : 'WE')
          : null;

        const finalPrice = data.unitPriceSage ?? matched?.unitPriceNet ?? null;  // PROJ-45-R5: manueller Preis hat Vorrang
        const priceCheckStatus = (!finalPrice
          ? 'missing'
          : Math.abs(finalPrice - line.unitPriceInvoice) <= tolerance
            ? 'ok'
            : 'mismatch') as InvoiceLine['priceCheckStatus'];
        const unitPriceFinal = priceCheckStatus === 'ok' ? finalPrice : line.unitPriceFinal;

        if (matched) {
          return {
            ...line,
            falmecArticleNo: data.falmecArticleNo,
            matchStatus: 'full-match' as const,
            unitPriceSage: data.unitPriceSage ?? matched.unitPriceNet,           // PROJ-45-R5
            descriptionDE: matched.descriptionDE ?? data.descriptionDE ?? line.descriptionDE,
            storageLocation,
            logicalStorageGroup,
            serialRequired: data.serialRequired ?? matched.serialRequirement,    // PROJ-45-R5: Formular gewinnt
            manufacturerArticleNo: matched.manufacturerArticleNo || data.manufacturerArticleNo || line.manufacturerArticleNo,
            ean: matched.ean || data.ean || line.ean,
            supplierId: matched.supplierId ?? data.supplierId ?? line.supplierId,
            activeFlag: matched.activeFlag,
            priceCheckStatus,
            unitPriceFinal,
            orderNumberAssigned: data.orderNumberAssigned || line.orderNumberAssigned,  // Hotfix: nicht vergessen
            qty: data.quantity ?? line.qty,                                            // PROJ-45-R5
            serialNumbers: data.serialNumbers?.length ? data.serialNumbers : line.serialNumbers,  // PROJ-45-R5
            serialNumber: data.serialNumbers?.length ? data.serialNumbers[0] : line.serialNumber, // PROJ-45-R5
            serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,     // PROJ-45-R5
            articleSource: 'manual' as const,  // PROJ-44-R9: Manuell-Marker
            manualStatus: 'draft' as const,    // PROJ-46: Entwurf (blau)
          };
        } else {
          return {
            ...line,
            falmecArticleNo: data.falmecArticleNo,
            matchStatus: 'full-match' as const,
            unitPriceSage: data.unitPriceSage ?? null,                            // PROJ-45-R5
            descriptionDE: data.descriptionDE ?? line.descriptionDE,
            storageLocation,
            logicalStorageGroup,
            serialRequired: data.serialRequired ?? line.serialRequired,
            manufacturerArticleNo: data.manufacturerArticleNo ?? line.manufacturerArticleNo,
            ean: data.ean ?? line.ean,
            supplierId: data.supplierId ?? line.supplierId,
            priceCheckStatus,
            unitPriceFinal,
            orderNumberAssigned: data.orderNumberAssigned || line.orderNumberAssigned,  // Hotfix: nicht vergessen
            qty: data.quantity ?? line.qty,                                            // PROJ-45-R5
            serialNumbers: data.serialNumbers?.length ? data.serialNumbers : line.serialNumbers,  // PROJ-45-R5
            serialNumber: data.serialNumbers?.length ? data.serialNumbers[0] : line.serialNumber, // PROJ-45-R5
            serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,     // PROJ-45-R5
            articleSource: 'manual' as const,  // PROJ-44-R9: Manuell-Marker
            manualStatus: 'draft' as const,    // PROJ-46: Entwurf (blau)
          };
        }
      }),
    }));

    logService.info(
      `Manueller Artikel-Fix: ${data.falmecArticleNo} für Position ${positionIndex}`,
      { runId, step: 'Artikel extrahieren', details: matched ? 'Stammdaten-Treffer' : 'Nur Formulardaten' },
    );
    get().addAuditEntry({
      runId,
      action: 'setManualArticle',
      details: `positionIndex=${positionIndex}, falmecArticleNo=${data.falmecArticleNo}, source=${matched ? 'master' : 'form'}`,
      userId: 'system',
    });

    // Match-Stats + Step2-Status re-evaluieren
    const runLines = get().invoiceLines.filter(l => l.lineId.startsWith(`${runId}-line-`));
    const matchStats = computeMatchStats(runLines);
    const noMatchCount = matchStats.noMatchCount ?? 0;
    const newStep2Status: StepStatus = noMatchCount > 0 ? 'failed' : 'ok';

    set((state) => ({
      runs: state.runs.map(r =>
        r.id === runId
          ? {
              ...r,
              stats: { ...r.stats, ...matchStats },
              steps: r.steps.map(s => s.stepNo === 2 ? { ...s, status: newStep2Status } : s),
            }
          : r
      ),
      currentRun: state.currentRun?.id === runId
        ? {
            ...state.currentRun,
            stats: { ...state.currentRun.stats, ...matchStats },
            steps: state.currentRun.steps.map(s => s.stepNo === 2 ? { ...s, status: newStep2Status } : s),
          }
        : state.currentRun,
    }));

    recalculateRunAfterMutation(runId, get, set);
  },

  // ─── PROJ-44-R11: Chirurgischer Artikel-Fix für einzelne ausgerollte Zeile ───
  setManualArticleByLine: (lineId, data, runId) => {
    const cr = get().currentRun; if (!cr || runId !== cr.id || !lineId.startsWith(`${runId}-line-`)) return;
    const masterArticles = useMasterDataStore.getState().articles;
    const matched = masterArticles.find(a => a.falmecArticleNo === data.falmecArticleNo);

    const { globalConfig } = get();
    const tolerance = globalConfig?.tolerance ?? 0.01;

    set((state) => ({
      invoiceLines: state.invoiceLines.map(line => {
        if (line.lineId !== lineId) return line;

        const storageLocation = matched?.storageLocation || data.storageLocation || line.storageLocation || null;
        const logicalStorageGroup: 'WE' | 'KDD' | null = storageLocation
          ? (storageLocation.includes('KDD') ? 'KDD' : 'WE')
          : null;

        const finalPrice = data.unitPriceSage ?? matched?.unitPriceNet ?? null;
        const priceCheckStatus = (!finalPrice
          ? 'missing'
          : Math.abs(finalPrice - line.unitPriceInvoice) <= tolerance
            ? 'ok'
            : 'mismatch') as InvoiceLine['priceCheckStatus'];
        const unitPriceFinal = priceCheckStatus === 'ok' ? finalPrice : line.unitPriceFinal;

        if (matched) {
          return {
            ...line,
            falmecArticleNo: data.falmecArticleNo,
            matchStatus: 'full-match' as const,
            unitPriceSage: data.unitPriceSage ?? matched.unitPriceNet,
            descriptionDE: matched.descriptionDE ?? data.descriptionDE ?? line.descriptionDE,
            storageLocation,
            logicalStorageGroup,
            serialRequired: data.serialRequired ?? matched.serialRequirement,
            manufacturerArticleNo: matched.manufacturerArticleNo || data.manufacturerArticleNo || line.manufacturerArticleNo,
            ean: matched.ean || data.ean || line.ean,
            supplierId: matched.supplierId ?? data.supplierId ?? line.supplierId,
            activeFlag: matched.activeFlag,
            priceCheckStatus,
            unitPriceFinal,
            orderNumberAssigned: data.orderNumberAssigned || line.orderNumberAssigned,
            qty: data.quantity ?? line.qty,
            serialNumbers: data.serialNumbers?.length ? data.serialNumbers : line.serialNumbers,
            serialNumber: data.serialNumbers?.length ? data.serialNumbers[0] : line.serialNumber,
            serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,
            articleSource: 'manual' as const,
            manualStatus: 'draft' as const,    // PROJ-46: Entwurf (blau)
          };
        } else {
          return {
            ...line,
            falmecArticleNo: data.falmecArticleNo,
            matchStatus: 'full-match' as const,
            unitPriceSage: data.unitPriceSage ?? null,
            descriptionDE: data.descriptionDE ?? line.descriptionDE,
            storageLocation,
            logicalStorageGroup,
            serialRequired: data.serialRequired ?? line.serialRequired,
            manufacturerArticleNo: data.manufacturerArticleNo ?? line.manufacturerArticleNo,
            ean: data.ean ?? line.ean,
            supplierId: data.supplierId ?? line.supplierId,
            priceCheckStatus,
            unitPriceFinal,
            orderNumberAssigned: data.orderNumberAssigned || line.orderNumberAssigned,
            qty: data.quantity ?? line.qty,
            serialNumbers: data.serialNumbers?.length ? data.serialNumbers : line.serialNumbers,
            serialNumber: data.serialNumbers?.length ? data.serialNumbers[0] : line.serialNumber,
            serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,
            articleSource: 'manual' as const,
            manualStatus: 'draft' as const,    // PROJ-46: Entwurf (blau)
          };
        }
      }),
    }));

    logService.info(
      `Manueller Artikel-Fix (line-scoped): ${data.falmecArticleNo} für lineId=${lineId}`,
      { runId, step: 'Artikel extrahieren', details: matched ? 'Stammdaten-Treffer' : 'Nur Formulardaten' },
    );
    get().addAuditEntry({
      runId,
      action: 'setManualArticleByLine',
      details: `lineId=${lineId}, falmecArticleNo=${data.falmecArticleNo}, source=${matched ? 'master' : 'form'}`,
      userId: 'system',
    });

    recalculateRunAfterMutation(runId, get, set);
  },

  updateLineSerialData: (positionIndex, serialRequired, serialNumbers, runId?) => {
    const { currentRun, invoiceLines } = get();
    const targetRunId = runId ?? currentRun?.id;
    if (!targetRunId) return;
    const cr = get().currentRun; if (!cr || targetRunId !== cr.id) return;

    const linePrefix = `${targetRunId}-line-`;
    const updatedLines = invoiceLines.map(line => {
      if (!line.lineId.startsWith(linePrefix)) return line;
      if (line.positionIndex !== positionIndex) return line;

      return {
        ...line,
        serialRequired,
        serialNumbers,
        serialNumber: serialNumbers[0] ?? null,
        serialSource: serialNumbers.length > 0 ? 'manual' as const : line.serialSource,
      };
    });

    // Stats aktualisieren (serialMatchedCount / serialRequiredCount)
    const runLines = updatedLines.filter(l => l.lineId.startsWith(linePrefix));
    const serialRequiredCount = runLines
      .filter(l => l.serialRequired)
      .reduce((sum, l) => sum + l.qty, 0);
    const serialMatchedCount = runLines
      .filter(l => l.serialRequired)
      .reduce((sum, l) => sum + l.serialNumbers.length, 0);

    set(state => {
      const updatedRun = state.runs.find(r => r.id === targetRunId);
      if (!updatedRun) return { invoiceLines: updatedLines };

      const newRun: Run = {
        ...updatedRun,
        stats: {
          ...updatedRun.stats,
          serialRequiredCount,
          serialMatchedCount,
        },
      };

      return {
        runs: state.runs.map(r => r.id === targetRunId ? newRun : r),
        currentRun: state.currentRun?.id === targetRunId ? newRun : state.currentRun,
        invoiceLines: updatedLines,
      };
    });

    logService.info(
      `Manuelle S/N-Korrektur: Pos ${positionIndex + 1} — serialRequired=${serialRequired}, ${serialNumbers.length} S/N`,
      { runId: targetRunId, step: 'Seriennummer anfuegen' },
    );
    get().addAuditEntry({
      runId: targetRunId,
      action: 'manual-serial-update',
      details: `Pos ${positionIndex + 1}: serialRequired=${serialRequired}, serialNumbers=[${serialNumbers.join(', ')}]`,
      userId: 'system',
    });

    // Hard-Persist in IndexedDB
    if (runPersistenceService.isAvailable()) {
      const payload = buildAutoSavePayload(targetRunId);
      if (payload) {
        runPersistenceService.saveRun(payload).catch(err =>
          console.error('[RunStore] updateLineSerialData persist failed:', err)
        );
      }
    }

    // PROJ-44-ADD-ON: Auto-resolve serial issues after manual S/N update
    get().refreshIssues(targetRunId);
  },

  setManualOrder: (lineId, orderYear, orderCode) => {
    const cr = get().currentRun; if (!cr || !lineId.startsWith(`${cr.id}-line-`)) return;
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId === lineId
          ? {
              ...line,
              orderNumberAssigned: `${orderYear}-${orderCode}`,
              orderYear,
              orderCode,
              orderAssignmentReason: 'manual' as const,
            }
          : line
      ),
    }));

    recalculateRunAfterMutation(cr.id, get, set);

    const runId = cr.id;
    logService.info(`Manuelle Bestellung: ${orderYear}-${orderCode}`, { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}` });
    get().addAuditEntry({ runId, action: 'setManualOrder', details: `lineId=${lineId}, order=${orderYear}-${orderCode}`, userId: 'system' });
  },

  confirmNoOrder: (lineId) => {
    const cr = get().currentRun; if (!cr || !lineId.startsWith(`${cr.id}-line-`)) return;
    set((state) => ({
      invoiceLines: state.invoiceLines.map(line =>
        line.lineId === lineId
          ? {
              ...line,
              orderAssignmentReason: 'manual-ok' as const,
            }
          : line
      ),
    }));

    recalculateRunAfterMutation(cr.id, get, set);

    const runId = cr.id;
    logService.info('Keine Bestellung bestätigt', { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}` });
    get().addAuditEntry({ runId, action: 'confirmNoOrder', details: `lineId=${lineId}`, userId: 'system' });
  },

  reassignOrder: (lineId, newOrderPositionId, freeText) => {
    const { invoiceLines, issues, orderPool, currentRun } = get();
    if (!currentRun) {
      console.warn('[RunStore] reassignOrder: no currentRun');
      return;
    }
    const runId = currentRun.id;
    if (!lineId.startsWith(`${runId}-line-`)) {
      console.warn('[RunStore] reassignOrder: lineId prefix mismatch');
      return;
    }
    const line = invoiceLines.find(l => l.lineId === lineId);
    if (!line) {
      console.warn(`[RunStore] reassignOrder: line ${lineId} not found`);
      return;
    }

    // Step a: Return previous allocation back to pool (if any)
    if (orderPool && line.allocatedOrders.length > 0) {
      const oldOrderNumber = line.allocatedOrders[0].orderNumber;
      for (const [posId, entry] of orderPool.byId) {
        const compositeKey = `${entry.position.orderYear}-${entry.position.orderNumber}`;
        if (compositeKey === oldOrderNumber) {
          returnToPool(orderPool, posId, 1);
          break;
        }
      }
    }

    // Step b: Consume new order from pool (if not "NEW")
    let newAllocatedOrders: import('@/types').AllocatedOrder[] = [];
    let newOrderNumber: string | null = null;

    if (newOrderPositionId !== 'NEW' && orderPool) {
      const consumed = consumeFromPool(orderPool, newOrderPositionId, 1);
      if (consumed) {
        const entry = orderPool.byId.get(newOrderPositionId);
        if (entry) {
          newOrderNumber = `${entry.position.orderYear}-${entry.position.orderNumber}`;
          newAllocatedOrders = [{
            orderNumber: newOrderNumber,
            orderYear: entry.position.orderYear,
            qty: 1,
            reason: 'manual-ok' as const,
          }];
        }
      }
    } else if (newOrderPositionId === 'NEW' && freeText?.trim()) {
      newOrderNumber = freeText.trim();
      const yearPart = parseInt(newOrderNumber.split('-')[0]) || 0;
      newAllocatedOrders = [{
        orderNumber: newOrderNumber,
        orderYear: yearPart,
        qty: 1,
        reason: 'manual-ok' as const,
      }];
    }

    // Step c: Update the line
    const updatedLines = invoiceLines.map(l =>
      l.lineId === lineId
        ? {
            ...l,
            allocatedOrders: newAllocatedOrders,
            orderNumberAssigned: newOrderNumber,
            orderAssignmentReason: 'manual-ok' as const,
          }
        : l
    );

    // Step d: Auto-resolve issues that are no longer active
    const resolvedIssues = autoResolveIssues(issues, updatedLines, runId);

    set(() => ({
      invoiceLines: updatedLines,
      issues: resolvedIssues,
      // Spread pool to trigger Zustand reactivity after in-place mutations
      orderPool: orderPool ? { ...orderPool } : null,
    }));

    recalculateRunAfterMutation(runId, get, set);

    logService.info(`Bestellung umgewiesen`, { runId, step: 'Bestellungen mappen', details: `lineId=${lineId}, target=${newOrderPositionId ?? freeText ?? 'none'}` });
    get().addAuditEntry({ runId, action: 'reassignOrder', details: `lineId=${lineId}, target=${newOrderPositionId ?? freeText ?? 'none'}`, userId: 'system' });
  },
});
