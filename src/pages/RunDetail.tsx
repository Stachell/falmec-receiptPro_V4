import { useEffect, useMemo, useRef, useState } from 'react';
import { useClickLock } from '@/hooks/useClickLock';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Download, FileWarning, RefreshCw, Play, Pause, CheckCircle, CheckCircle2, AlertCircle, Loader2, Fingerprint } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AppLayout } from '@/components/AppLayout';
import { WorkflowStepper } from '@/components/WorkflowStepper';
import { KPITile, KPIGrid } from '@/components/KPITile';
import { StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRunStore } from '@/store/runStore';
import { mockRuns } from '@/data/mockData';
import { ItemsTable } from '@/components/run-detail/ItemsTable';
import { IssuesCenter } from '@/components/run-detail/IssuesCenter';
import { WarehouseLocations } from '@/components/run-detail/WarehouseLocations';
import { ExportPanel } from '@/components/run-detail/ExportPanel';
import { generateXML, generateCSV, buildExportFileName, type RunExportMeta } from '@/services/exportService';
import { useExportConfigStore } from '@/store/exportConfigStore';
import { logService } from '@/services/logService';
import { archiveService } from '@/services/archiveService';
import { OverviewPanel } from '@/components/run-detail/OverviewPanel';
import { InvoicePreview } from '@/components/run-detail/InvoicePreview';
import { RunLogTab } from '@/components/run-detail/RunLogTab';

// ─── PROJ-29 Add-On 2: Checkpoint-Meldungen ──────────────────────────────────
const CHECKPOINT_MESSAGES: { id: number; label: string; description: string }[] = [
  { id: 1, label: 'PDF-Parsing', description: 'Rechnungspositionen und Rechnungssumme erfolgreich geparst.' },
  { id: 2, label: 'Positionen extrahiert', description: 'Artikelmenge, Artikelzuordnung erfolgreich durchgeführt.' },
  { id: 3, label: 'Preise geprüft', description: 'Alle Einzel- und Gesamtpreise erfolgreich zugeordnet.' },
  { id: 4, label: 'Serials geparst', description: 'Alle seriennummernpflichtigen Artikel erfolgreich zugeordnet.' },
  { id: 5, label: 'Beleg zugeteilt', description: 'Alle Artikel konnten offene Bestellungen erfolgreich zugeteilt werden.' },
  { id: 6, label: 'Export', description: 'Alle Daten erfolgreich zusammen gestellt, der Download ist verfügbar.' },
];

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const decodedRunId = (() => {
    if (!runId) return undefined;
    try {
      return decodeURIComponent(runId);
    } catch {
      return runId;
    }
  })();
  const {
    runs,
    currentRun,
    invoiceLines,           // PROJ-29: für Double-Check-Berechnungen
    issues,
    setCurrentRun,
    activeTab,
    setActiveTab,
    setIssuesStepFilter,
    parsedInvoiceResult,
    parsedPositions,
    parserWarnings,
    advanceToNextStep,
    retryStep,              // HOTFIX-2
    createNewRunWithParsing,
    executeMatcherCrossMatch,
    isProcessing,
    isPaused,
    pauseRun,
    resumeRun,
    addAuditEntry,
    setBookingDate,
  } = useRunStore();
  // Make getState available for fire-and-forget pattern
  const getStoreState = useRunStore.getState;
  const navigate = useNavigate();
  const { wrap, isLocked } = useClickLock();
  const { columnOrder, csvDelimiter, csvIncludeHeader, setLastDiagnostics } = useExportConfigStore();

  // ─── PROJ-29: Double-Check-Logik ─────────────────────────────────────────────
  // Alle useMemo-Hooks müssen VOR dem ersten useEffect stehen (React Hook-Regeln)

  // 1. InvoiceLines des aktuellen Runs (gefiltert nach Run-ID)
  const currentRunLines = useMemo(
    () => (currentRun ? invoiceLines.filter(l => l.lineId.startsWith(currentRun.id)) : []),
    [invoiceLines, currentRun?.id]
  );

  // 2. Qty-Summen für Kachel 4 (qty-basiert, nicht line-count-basiert!)
  //    Hinweis: RunStats.serialRequiredCount zählt ZEILEN — für den Check brauchen wir Qty-Summen
  const serialRequiredQtySum = useMemo(
    () => currentRunLines.filter(l => l.serialRequired === true).reduce((s, l) => s + l.qty, 0),
    [currentRunLines]
  );
  const serialNotRequiredArticleCount = useMemo(
    () => currentRunLines.filter(l => l.serialRequired === false).reduce((s, l) => s + l.qty, 0),
    [currentRunLines]
  );

  // 3. Eindeutige Bestellnummern-Anzahl für Kachel 5
  const allocatedOrderCount = useMemo(() => {
    const seen = new Set<string>();
    for (const line of currentRunLines) {
      for (const ao of line.allocatedOrders) {
        if (ao.orderNumber) seen.add(ao.orderNumber);
      }
    }
    return seen.size;
  }, [currentRunLines]);

  // PROJ-29 Korrektur Rev. 2: qty-basierte Zähler für Kacheln 3, 4, 5
  // runStore.stats.*Count-Felder zählen Invoice-Lines (Zeilen), nicht qty — daher eigene Memos.
  const priceOkQtySum = useMemo(
    () => currentRunLines
      .filter(l => l.priceCheckStatus === 'ok' || l.priceCheckStatus === 'custom')
      .reduce((s, l) => s + l.qty, 0),
    [currentRunLines]
  );
  const serialMatchedQtySum = useMemo(
    () => currentRunLines
      .filter(l => l.serialRequired === true && l.serialNumbers.length >= l.qty)
      .reduce((s, l) => s + l.qty, 0),
    [currentRunLines]
  );
  const matchedOrdersQtySum = useMemo(
    () => currentRunLines.reduce(
      (s, l) => s + l.allocatedOrders.reduce((a, o) => a + o.qty, 0),
      0
    ),
    [currentRunLines]
  );

  // ─── PROJ-29 Add-On 1: First-Check (Single Source of Truth für variant-Prop + Double-Check-Guard) ───
  // Exakte Kopie der bisherigen Inline-variant-Expressions. Werden im JSX als variant={kachelXVariant} verwendet.
  const kachel1Variant = (
    currentRun?.invoice.invoiceTotal != null
      ? 'success' as const
      : 'default' as const
  );
  const isKachel1FirstCheck = kachel1Variant === 'success';

  const kachel2Variant = (
    (currentRun?.stats.noMatchCount ?? 0) > 0
      ? 'error' as const
      : (currentRun?.stats.articleMatchedCount ?? 0) > 0
        ? 'success' as const
        : 'default' as const
  );
  const isKachel2FirstCheck = kachel2Variant === 'success';

  const kachel3Variant = (
    ((currentRun?.stats.priceMismatchCount ?? 0) > 0 || (currentRun?.stats.priceMissingCount ?? 0) > 0)
      ? 'warning' as const
      : (currentRun?.stats.priceOkCount ?? 0) > 0
        ? 'success' as const
        : 'default' as const
  );
  const isKachel3FirstCheck = kachel3Variant === 'success';

  const kachel4Variant = (
    currentRun && currentRun.stats.serialMatchedCount >= currentRun.stats.serialRequiredCount
      && currentRun.stats.serialRequiredCount > 0
      ? 'success' as const
      : 'default' as const
  );
  const isKachel4FirstCheck = kachel4Variant === 'success';

  const kachel5Variant = (
    (currentRun?.stats.notOrderedCount ?? 0) > 0
      ? 'warning' as const
      : (currentRun?.stats.matchedOrders ?? 0) > 0
        ? 'success' as const
        : 'default' as const
  );
  const isKachel5FirstCheck = kachel5Variant === 'success';

  // 4. isKachel1Verified — First-Check + Σ(qty*unitPriceInvoice) vs. invoiceTotal (Toleranz < 0,10 €)
  const isKachel1Verified = useMemo(() => {
    if (!isKachel1FirstCheck) return false;
    const invoiceTotal = currentRun?.invoice.invoiceTotal;
    if (invoiceTotal == null || currentRunLines.length === 0) return false;
    const lineSum = currentRunLines.reduce((s, l) => s + l.qty * l.unitPriceInvoice, 0);
    return Math.abs(lineSum - invoiceTotal) < 0.10;
  }, [isKachel1FirstCheck, currentRunLines, currentRun?.invoice.invoiceTotal]);

  // 5. isKachel2Verified — First-Check + Qty-Summe == packagesCount + alle Zeilen full-match
  const isKachel2Verified = useMemo(() => {
    if (!isKachel2FirstCheck) return false;
    const pkg = currentRun?.invoice.packagesCount;
    if (pkg == null || pkg === 0 || currentRunLines.length === 0) return false;
    const qtyMatch = currentRunLines.reduce((s, l) => s + l.qty, 0) === pkg;
    const allFullMatch = currentRunLines.every(l => l.matchStatus === 'full-match');
    return qtyMatch && allFullMatch;
  }, [isKachel2FirstCheck, currentRunLines, currentRun?.invoice.packagesCount]);

  // 6. isKachel3Verified — First-Check + 0 Preisabweichungen UND mind. 1 OK-Preis
  const isKachel3Verified = useMemo(() => {
    if (!isKachel3FirstCheck) return false;
    if (!currentRun) return false;
    return currentRun.stats.priceMismatchCount === 0 && currentRun.stats.priceOkCount > 0;
  }, [isKachel3FirstCheck, currentRun?.stats.priceMismatchCount, currentRun?.stats.priceOkCount]);

  // 7. isKachel4Verified — First-Check + serialNotRequired + serialRequired == totalQty
  const isKachel4Verified = useMemo(() => {
    if (!isKachel4FirstCheck) return false;
    if (currentRunLines.length === 0) return false;
    const totalQty = currentRunLines.reduce((s, l) => s + l.qty, 0);
    return (serialNotRequiredArticleCount + serialRequiredQtySum) === totalQty;
  }, [isKachel4FirstCheck, currentRunLines, serialNotRequiredArticleCount, serialRequiredQtySum]);

  // 8. isKachel5Verified — First-Check + alle zugeteilt + Format YYYY-XXXXX (auf einzigartigen Nummern)
  const isKachel5Verified = useMemo(() => {
    if (!isKachel5FirstCheck) return false;
    if (!currentRun) return false;
    const totalLines = currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines;
    if (currentRun.stats.matchedOrders !== totalLines) return false;
    if (allocatedOrderCount === 0) return false;

    // Einzigartige Bestellnummern sammeln (eine Nr. darf mehrere Artikel abdecken — kein Fehler)
    const uniqueOrderNumbers = new Set<string>();
    for (const line of currentRunLines) {
      for (const ao of line.allocatedOrders) {
        if (ao.orderNumber) uniqueOrderNumbers.add(ao.orderNumber);
      }
    }

    // Format-Prüfung NUR auf einzigartigen Nummern
    const currentYear = new Date().getFullYear();
    const validPrefixes = ['10', '11', '12', '20', '97', '98', '99'];
    for (const on of uniqueOrderNumbers) {
      const m = /^(\d{4})-(\d{5})$/.exec(on);
      if (!m) return false;
      const year = parseInt(m[1], 10);
      const suffix = m[2];
      const yearOk = year === 0 || (year >= currentYear - 20 && year <= currentYear + 100);
      if (!yearOk) return false;
      if (!validPrefixes.some(p => suffix.startsWith(p))) return false;
    }
    return true;
  }, [isKachel5FirstCheck, currentRun, currentRunLines, allocatedOrderCount]);

  // PROJ-29 Add-On 2: allTilesVerified — Checkpoint 6 (Export-Meldung) feuert wenn alle 5 bestanden
  const allTilesVerified = isKachel1Verified && isKachel2Verified && isKachel3Verified
                          && isKachel4Verified && isKachel5Verified;

  // PROJ-42: isExportReady — Toolbar-Button-Bedingung
  const isExportReady = useMemo(() => {
    if (!currentRun) return false;
    const runIssues = issues.filter(i => !i.runId || i.runId === currentRun.id);
    const blocking = runIssues.filter(i => i.status === 'open' && i.severity === 'error');
    const missingLoc = currentRunLines.filter(l => !l.storageLocation);
    return blocking.length === 0 && missingLoc.length === 0 && currentRunLines.length > 0;
  }, [currentRun, issues, currentRunLines]);

  // 9. SubValue-Strings (Zeile 3) für Kacheln 1, 2, 4, 5
  const kachel1SubValue = useMemo(() => {
    const invoiceTotal = currentRun?.invoice.invoiceTotal;
    if (invoiceTotal != null) {
      return `${invoiceTotal.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € Rechnungssumme`;
    }
    return currentRun?.invoice.qtyValidationStatus === 'mismatch'
      ? 'Fehler: Anzahl stimmt nicht'
      : (currentRun?.invoice.fattura ?? 'n/a');
  }, [currentRun?.invoice.invoiceTotal, currentRun?.invoice.qtyValidationStatus, currentRun?.invoice.fattura]);

  const kachel2SubValue = useMemo(() => {
    const pkg = parsedInvoiceResult?.header.packagesCount ?? currentRun?.invoice.packagesCount;
    if (pkg != null) return `${pkg} Artikel gelistet`;
    if (!currentRun) return undefined;
    const { expandedLineCount, noMatchCount } = currentRun.stats;
    return noMatchCount > 0
      ? `${expandedLineCount} Artikel (${noMatchCount} ohne Match)`
      : expandedLineCount > 0 ? `${expandedLineCount} Artikel` : undefined;
  }, [parsedInvoiceResult?.header.packagesCount, currentRun?.invoice.packagesCount,
      currentRun?.stats.expandedLineCount, currentRun?.stats.noMatchCount]);

  const kachel3SubValue = useMemo(() => {
    if (!currentRun) return undefined;
    if (
      isKachel3Verified &&
      currentRun.stats.priceMismatchCount === 0 &&
      currentRun.stats.priceMissingCount === 0
    ) {
      return '0 Abweichungen';
    }
    return currentRun.stats.priceMismatchCount > 0
      ? `${currentRun.stats.priceMismatchCount} Abweichungen`
      : currentRun.stats.priceMissingCount > 0
        ? `${currentRun.stats.priceMissingCount} fehlen`
        : undefined;
  }, [isKachel3Verified, currentRun?.stats.priceMismatchCount, currentRun?.stats.priceMissingCount]);

  const kachel4SubValue = useMemo(() => {
    if (currentRun?.stats.serialRequiredCount === 0) return 'Keine SN-Pflicht';
    return `${serialNotRequiredArticleCount} ohne S/N-Pflicht`;
  }, [currentRun?.stats.serialRequiredCount, serialNotRequiredArticleCount]);

  const kachel5SubValue = useMemo(() => {
    if (allocatedOrderCount > 0) return `${allocatedOrderCount} Beleg-Nr. zugeteilt`;
    if (currentRun && currentRun.stats.notOrderedCount > 0) return `${currentRun.stats.notOrderedCount} nicht bestellt`;
    return undefined;
  }, [allocatedOrderCount, currentRun?.stats.notOrderedCount]);
  // ─── Ende PROJ-29 ─────────────────────────────────────────────────────────────

  // PROJ-42-ADD-ON: Kachel-Export-Handler (CSV, Race-Condition-sicher)
  const handleTileExport = () => {
    if (!currentRun || !isExportReady) return;

    // 1. Buchungsdatum: setBookingDate gibt frischen Run zurueck (sync!)
    const freshRun = setBookingDate(currentRun.id, new Date().toLocaleDateString('de-DE'));
    if (!freshRun) return;

    // 2. RunMeta mit frischem bookingDate aufbauen
    const runMeta: RunExportMeta = {
      fattura: freshRun.invoice.fattura,
      invoiceDate: freshRun.invoice.invoiceDate,
      deliveryDate: freshRun.invoice.deliveryDate ?? null,
      eingangsart: freshRun.config.eingangsart,
      runId: freshRun.id,
      bookingDate: freshRun.stats.bookingDate ?? new Date().toLocaleDateString('de-DE'),
    };

    // 3. CSV generieren + Download
    const csvContent = generateCSV(currentRunLines, columnOrder, runMeta, csvDelimiter, csvIncludeHeader);
    const csvFileName = buildExportFileName(freshRun.id, 'csv');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName;
    a.click();
    URL.revokeObjectURL(url);

    // 4. Archive mit frischem Run
    archiveService.writeArchivePackage(freshRun, currentRunLines, { exportCsv: csvContent }).catch(() => {});

    // 5. Log + Audit + Diagnostics
    logService.info(`Export durchgefuehrt: ${csvFileName}`, {
      runId: freshRun.id,
      step: 'Export',
      details: `Format: CSV, Positionen: ${currentRunLines.length}, Spalten: ${columnOrder.length}`,
    });
    addAuditEntry({ runId: freshRun.id, action: 'export-download', details: `CSV: ${csvFileName}`, userId: 'system' });
    setLastDiagnostics({ timestamp: new Date().toISOString(), fileName: csvFileName, lineCount: currentRunLines.length, status: 'success' });
  };

  useEffect(() => {
    // Find run by ID - first search in store runs (real runs), then fallback to mock data
    const run = runs.find(r => r.id === decodedRunId) || mockRuns.find(r => r.id === decodedRunId);
    if (run) {
      setCurrentRun(run);
    }
    return () => setCurrentRun(null);
  }, [decodedRunId, runs, setCurrentRun]);

  // ─── PROJ-40 6B: URL-Fallback — IndexedDB-Nachladen wenn Run nicht im Memory ─
  const [loadingPersisted, setLoadingPersisted] = useState(false);
  useEffect(() => {
    if (!decodedRunId) return;
    const inMemory = runs.find(r => r.id === decodedRunId) || mockRuns.find(r => r.id === decodedRunId);
    if (inMemory) return; // Guard: Run already in memory, no IndexedDB lookup needed

    setLoadingPersisted(true);
    useRunStore.getState().loadPersistedRun(decodedRunId)
      .then((found) => {
        if (!found) console.warn(`[RunDetail] Run ${decodedRunId} weder in Memory noch IndexedDB`);
      })
      .finally(() => setLoadingPersisted(false));
  }, [decodedRunId, runs]);

  // ─── PROJ-29 Add-On 2: Parse-Error Toast (nur noch für Fehlerfälle) ─────────
  const [showParseError, setShowParseError] = useState(false);
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    if (!parsedInvoiceResult) return;
    const hasErrors = !parsedInvoiceResult.success ||
      parsedInvoiceResult.warnings.filter(w => w.severity === 'error').length > 0;
    if (!hasErrors) return; // Erfolgsfall wird durch Checkpoint-Queue abgedeckt
    const age = Date.now() - mountedAtRef.current;
    const delay = age < 2000 ? 2000 - age : 0;
    const showTimer = setTimeout(() => setShowParseError(true), delay);
    const hideTimer = setTimeout(() => setShowParseError(false), delay + 4000);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [parsedInvoiceResult]);

  // ─── PROJ-29 Add-On 2: Checkpoint-Meldungs-Queue ──────────────────────────
  const [checkpointQueue, setCheckpointQueue] = useState<number[]>([]);
  const [activeCheckpoint, setActiveCheckpoint] = useState<number | null>(null);
  const [checkpointFade, setCheckpointFade] = useState<'in' | 'out' | 'hidden'>('hidden');
  const shownCheckpointsRef = useRef<Set<number>>(new Set());

  // Reset bei Run-Wechsel
  useEffect(() => {
    shownCheckpointsRef.current = new Set();
    setCheckpointQueue([]);
    setActiveCheckpoint(null);
    setCheckpointFade('hidden');
  }, [currentRun?.id]);

  // Watcher-Effects: enqueuen wenn isKachelXVerified true wird
  useEffect(() => {
    if (isKachel1Verified && !shownCheckpointsRef.current.has(1)) {
      shownCheckpointsRef.current.add(1);
      setCheckpointQueue(prev => [...prev, 1]);
    }
  }, [isKachel1Verified]);

  useEffect(() => {
    if (isKachel2Verified && !shownCheckpointsRef.current.has(2)) {
      shownCheckpointsRef.current.add(2);
      setCheckpointQueue(prev => [...prev, 2]);
    }
  }, [isKachel2Verified]);

  useEffect(() => {
    if (isKachel3Verified && !shownCheckpointsRef.current.has(3)) {
      shownCheckpointsRef.current.add(3);
      setCheckpointQueue(prev => [...prev, 3]);
    }
  }, [isKachel3Verified]);

  useEffect(() => {
    if (isKachel4Verified && !shownCheckpointsRef.current.has(4)) {
      shownCheckpointsRef.current.add(4);
      setCheckpointQueue(prev => [...prev, 4]);
    }
  }, [isKachel4Verified]);

  useEffect(() => {
    if (isKachel5Verified && !shownCheckpointsRef.current.has(5)) {
      shownCheckpointsRef.current.add(5);
      setCheckpointQueue(prev => [...prev, 5]);
    }
  }, [isKachel5Verified]);

  useEffect(() => {
    if (allTilesVerified && !shownCheckpointsRef.current.has(6)) {
      shownCheckpointsRef.current.add(6);
      setCheckpointQueue(prev => [...prev, 6]);
    }
  }, [allTilesVerified]);

  // Effect A — Dequeuer: dequeued nächste Nachricht wenn kein aktiver Checkpoint
  useEffect(() => {
    if (activeCheckpoint !== null || checkpointQueue.length === 0) return;
    const nextId = checkpointQueue[0];
    setCheckpointQueue(prev => prev.slice(1));
    setActiveCheckpoint(nextId);
    setCheckpointFade('in');
  }, [checkpointQueue, activeCheckpoint]);

  // Effect B — Timer: startet Fade-Out + Clear, reagiert NUR auf activeCheckpoint
  useEffect(() => {
    if (activeCheckpoint === null) return;
    const fadeOutTimer = setTimeout(() => setCheckpointFade('out'), 2000);
    const clearTimer = setTimeout(() => {
      setActiveCheckpoint(null);
      setCheckpointFade('hidden');
    }, 2300);
    return () => { clearTimeout(fadeOutTimer); clearTimeout(clearTimer); };
  }, [activeCheckpoint]);

  // Auto-switch tab based on current workflow step
  useEffect(() => {
    if (!currentRun) return;
    const currentStep = currentRun.steps.find(s => s.status === 'running');
    if (!currentStep) {
      // All done? Switch to export
      if (currentRun.steps.every(s => s.status === 'ok' || s.status === 'soft-fail')) {
        setActiveTab('export');
      }
      return;
    }
    if (currentStep.stepNo === 1) {
      setActiveTab('invoice-preview');
    } else if (currentStep.stepNo >= 2 && currentStep.stepNo <= 4) {
      setActiveTab('items');
    } else if (currentStep.stepNo === 5) {
      setActiveTab('export');
    }
  }, [currentRun?.steps, setActiveTab]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!currentRun) {
    if (isProcessing) {
      // Brief transition: run ID was renamed, URL update pending
      return (
        <AppLayout>
          <div className="py-8 flex items-center justify-center min-h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="py-8 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <FileWarning className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">
              Lauf nicht gefunden
            </h2>
            <p className="text-muted-foreground mt-1 mb-4">
              Der angeforderte Verarbeitungslauf existiert nicht.
            </p>
            <Link to="/">
              <Button
                variant="outline"
                className="border"
                style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
              >
                Zurueck zur Uebersicht
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const totalIssues = currentRun.steps.reduce((acc, step) => acc + step.issuesCount, 0);

  // Determine next workflow step (includes failed steps for manual retry)
  const getNextStep = () => {
    if (!currentRun) return null;

    // First: any failed step that needs manual retry
    const failedStep = currentRun.steps.find(step => step.status === 'failed');
    if (failedStep) return failedStep;

    // Then: first step still in progress or not started
    return currentRun.steps.find(
      step => step.status === 'not-started' || step.status === 'running'
    ) || null;
  };

  const nextStep = getNextStep();
  const hasFailedStep = currentRun.steps.some(step => step.status === 'failed');
  const allStepsComplete = currentRun.steps.every(
    step => step.status === 'ok' || step.status === 'soft-fail'
  );
  const parseErrorCount = parsedInvoiceResult
    ? parsedInvoiceResult.warnings.filter(w => w.severity === 'error').length
    : 0;
  const canPause = currentRun.status === 'running' || currentRun.status === 'paused';

  return (
    <AppLayout>
      <div className="pt-[18px] pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-start gap-3">
            <Link to="/">
              <Button
                variant="outline"
                size="icon"
                className="bg-[#c9c3b6] text-[#666666] border-[#666666] hover:bg-[#008C99] hover:text-[#E3E0CF] hover:border-[#008C99] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="pt-0.5">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold" style={{ color: '#D8E6E7' }}>
                  {currentRun.id}
                </h1>
                <span
                  className="status-chip"
                  style={{
                    backgroundColor: '#D8E6E7',
                    color: '#333333',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: currentRun.status === 'running' ? '#3b82f6' :
                        currentRun.status === 'paused' ? '#FD7C6E' :
                        currentRun.status === 'ok' ? '#22c55e' :
                        currentRun.status === 'failed' ? '#ef4444' :
                        currentRun.status === 'soft-fail' ? '#f59e0b' : '#6b7280'
                    }}
                  />
                  {currentRun.status === 'running' ? 'In Bearbeitung' :
                   currentRun.status === 'paused' ? 'Pausiert' :
                   currentRun.status === 'ok' ? 'Erfolgreich' :
                   currentRun.status === 'failed' ? 'Fehlgeschlagen' :
                   currentRun.status === 'soft-fail' ? 'Warnung' : 'Nicht gestartet'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* PROJ-25: Pause/Fortfahren-Button — immer sichtbar, disabled wenn Run nicht läuft */}
            <Button
              variant="outline"
              size="sm"
              disabled={!canPause}
              className={
                !canPause
                  ? 'gap-2 border opacity-40 cursor-not-allowed bg-[#c9c3b6] text-[#666666] border-[#666666]'
                  : isPaused
                    ? 'gap-2 border'
                    : 'gap-2 border bg-[#c9c3b6] text-[#666666] border-[#666666] hover:bg-[#008C99] hover:text-[#E3E0CF] hover:border-[#008C99] transition-colors'
              }
              style={
                isPaused && canPause
                  ? { backgroundColor: '#FD7C6E', borderColor: '#FD7C6E', color: 'white' }
                  : undefined
              }
              onClick={() => isPaused ? resumeRun(currentRun.id) : pauseRun(currentRun.id)}
            >
              {isPaused && canPause ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused && canPause ? 'Fortfahren' : 'Pause'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border bg-[#c9c3b6] text-[#666666] border-[#666666] hover:bg-[#008C99] hover:text-[#E3E0CF] hover:border-[#008C99] transition-colors"
              disabled={isProcessing || isLocked('reprocess')}
              onClick={wrap('reprocess', () => {
                const parsingPromise = createNewRunWithParsing();
                const initialRun = getStoreState().currentRun;
                if (initialRun) {
                  navigate(`/run/${encodeURIComponent(initialRun.id)}`);
                  parsingPromise.then(finalRun => {
                    if (finalRun && finalRun.id !== initialRun.id) {
                      navigate(`/run/${encodeURIComponent(finalRun.id)}`, { replace: true });
                    }
                  });
                }
              })}
            >
              <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
              {isProcessing ? 'Verarbeite...' : 'Neu verarbeiten'}
            </Button>
          </div>
        </div>

        {/* Workflow Stepper */}
        <div className="mb-6">
          <WorkflowStepper steps={currentRun.steps} isPaused={isPaused} />
        </div>

        {/* KPI Tiles */}
        <KPIGrid className="mb-6">
          {/* Kachel 1: Positionen erhalten — PROJ-20 / PROJ-29 */}
          <KPITile
            value={`${currentRun.stats.parsedInvoiceLines} / ${currentRun.invoice.targetPositionsCount ?? '?'}`}
            label="Positionen eingelesen"
            subValue={kachel1SubValue}
            variant={kachel1Variant}
            isVerified={isKachel1Verified}
          />
          {/* Kachel 2: Artikel extrahiert — PROJ-20 / PROJ-29 */}
          <KPITile
            value={`${currentRun.stats.articleMatchedCount}/${currentRun.invoice.targetPositionsCount ?? (currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines)}`}
            label="Positionen extrahiert"
            subValue={kachel2SubValue}
            variant={kachel2Variant}
            onClick={currentRun.stats.noMatchCount > 0 ? () => {
              setIssuesStepFilter('2');
              setActiveTab('issues');
            } : undefined}
            isVerified={isKachel2Verified}
          />
          {/* Kachel 3: Preise checken — PROJ-29 */}
          <KPITile
            value={`${priceOkQtySum}/${currentRun.invoice.targetArticleCount ?? (currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines)}`}
            label="Preise geprüft"
            subValue={kachel3SubValue}
            variant={kachel3Variant}
            isVerified={isKachel3Verified}
          />
          {/* Kachel 4: Serials geparst — PROJ-20 / PROJ-29 */}
          <KPITile
            value={`${serialMatchedQtySum}/${serialRequiredQtySum || '?'}`}
            label="Serials geparst"
            icon={<Fingerprint className="w-4 h-4" />}
            subValue={kachel4SubValue}
            variant={kachel4Variant}
            onClick={currentRun.steps.find(s => s.stepNo === 3)?.issuesCount ? () => {
              setIssuesStepFilter('3');
              setActiveTab('issues');
            } : undefined}
            isVerified={isKachel4Verified}
          />
          {/* Kachel 5: Bestellungen mappen — PROJ-29 */}
          <KPITile
            value={`${matchedOrdersQtySum}/${currentRun.invoice.targetArticleCount ?? (currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines)}`}
            label="Beleg zugeteilt"
            subValue={kachel5SubValue}
            variant={kachel5Variant}
            isVerified={isKachel5Verified}
          />
          {/* Dynamic Next Step Button — PROJ-25: hover unified + pause badge */}
          {/* PROJ-42-ADD-ON: teal + CSV-Download wenn allStepsComplete && isExportReady */}
          <div
            className={
              isPaused
                ? 'kpi-tile flex flex-col justify-center items-center cursor-not-allowed bg-[#FD7C6E] text-white transition-colors'
                : (allStepsComplete && isExportReady)
                  ? 'kpi-tile group flex flex-col justify-center items-center cursor-pointer bg-[#008C99] hover:bg-[#007080] transition-colors'
                  : 'kpi-tile group flex flex-col justify-center items-center cursor-pointer bg-[#c9c3b6] hover:bg-[#008C99] transition-colors'
            }
            onClick={wrap('next-step', () => {
              if (isPaused) return;
              if (allStepsComplete && isExportReady) {
                handleTileExport();
              } else if (allStepsComplete) {
                setActiveTab('export');
              } else if (currentRun && hasFailedStep && nextStep) {
                // HOTFIX-2: Dedicated retry action for failed steps
                retryStep(currentRun.id, nextStep.stepNo);
              } else if (currentRun) {
                advanceToNextStep(currentRun.id);
              }
            })}
          >
            <div className="grid grid-rows-[2fr_1fr] h-full w-full items-stretch">
              {isPaused ? (
                <div className="row-span-2 flex items-center justify-center gap-2">
                  <Pause className="w-[42px] h-[42px] text-white" />
                  <span className="text-base font-semibold leading-none translate-y-[1px] text-white">
                    pausiert
                  </span>
                </div>
              ) : (allStepsComplete && isExportReady) ? (
                <>
                  <div className="flex items-center justify-center gap-2">
                    <Download className="w-[42px] h-[42px] text-white transition-colors" />
                    <span className="text-base font-semibold leading-none translate-y-[1px] text-white transition-colors">
                      Export
                    </span>
                  </div>
                  <span className="text-xs text-center mt-0.5 text-white opacity-80 transition-colors">
                    CSV herunterladen
                  </span>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-2">
                    {allStepsComplete ? (
                      <Download className="w-[42px] h-[42px] text-[#666666] group-hover:text-[#E3E0CF] transition-colors" />
                    ) : (
                      <Play className="w-[42px] h-[42px] text-[#666666] group-hover:text-[#E3E0CF] transition-colors" />
                    )}
                    <span className="text-base font-semibold leading-none translate-y-[1px] text-[#666666] group-hover:text-[#E3E0CF] transition-colors">
                      {allStepsComplete ? 'Export' : hasFailedStep ? 'Retry' : 'Start'}
                    </span>
                  </div>
                  <span className="text-xs text-center mt-0.5 text-[#666666] group-hover:text-[#E3E0CF] transition-colors opacity-80">
                    {allStepsComplete
                      ? (totalIssues > 0 ? `${totalIssues} Probleme offen` : 'Keine offenen Probleme')
                      : (nextStep?.name ?? '')}
                  </span>
                </>
              )}
            </div>
          </div>
        </KPIGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Tab-Leiste + Ereignisfeld nebeneinander */}
          <div className="flex items-center gap-4">
            {/* PROJ-22 B1: TabsList bg-[#c9c3b6] */}
            <TabsList className="bg-[#c9c3b6] border border-border tab-bar-raised">
              <TabsTrigger
                value="invoice-preview"
                className="tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                RE-Positionen
                {parsedInvoiceResult && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded ${
                    parsedInvoiceResult.success
                      ? 'bg-green-100 text-[#14532d]'
                      : 'bg-status-soft-fail/20 text-status-soft-fail'
                  }`}>
                    {parsedInvoiceResult.lines.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="items"
                className="tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Artikelliste
                {/* PROJ-22 B1: Artikelliste-Badge bg-[#008c99] white text */}
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#008c99', color: '#ffffff' }}>
                  {parsedInvoiceResult?.header.packagesCount ?? currentRun.invoice.packagesCount ?? currentRun.stats.parsedInvoiceLines}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="issues"
                className="tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Fehler
                {totalIssues > 0 && (
                  <span className="ml-1.5 text-xs bg-[#d6b8ab] text-[#7a1f12] px-1.5 py-0.5 rounded">
                    {totalIssues}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="warehouse"
                className="tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Lagerorte
              </TabsTrigger>
              <TabsTrigger
                value="overview"
                className="tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Details
              </TabsTrigger>
              <TabsTrigger
                value="export"
                className="tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Export
              </TabsTrigger>
              <TabsTrigger
                value="log"
                className="tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Log
              </TabsTrigger>
            </TabsList>

            {/* PROJ-29 Add-On 2: Ereignisfeld — Parse-Error-Toast (nur bei Fehler) */}
            {parsedInvoiceResult && showParseError && (
              <div className="flex-none w-1/3 ml-auto">
                <Alert
                  variant="destructive"
                  className="py-2"
                  style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
                >
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-sm font-semibold leading-tight">
                    Parsing fehlgeschlagen
                  </AlertTitle>
                  <AlertDescription className="text-xs leading-tight">
                    Bitte Warnungen pruefen
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* PROJ-29 Add-On 2: Checkpoint-Meldungen (Queue, einzeilig, Fade-In/Out) */}
            {!showParseError && activeCheckpoint !== null && (() => {
              const msg = CHECKPOINT_MESSAGES.find(m => m.id === activeCheckpoint);
              if (!msg) return null;
              return (
                <div
                  className="ml-auto min-w-0 transition-opacity duration-300"
                  style={{ opacity: checkpointFade === 'in' ? 1 : 0 }}
                >
                  <div
                    className="flex items-center gap-2 rounded-lg border border-green-500 text-green-800 h-10 px-4"
                    style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
                  >
                    <CheckCircle2 className="h-4 w-4 text-slate-900 flex-shrink-0" />
                    <span className="text-sm leading-tight truncate">
                      <span className="font-semibold">CHECKFELD &ldquo;{msg.label}&rdquo; erf&uuml;llt:</span>
                      {' '}{msg.description}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>

          <TabsContent value="overview">
            <OverviewPanel run={currentRun} />
          </TabsContent>

          <TabsContent value="invoice-preview">
            {parsedInvoiceResult ? (
              <InvoicePreview
                header={{
                  fattura: parsedInvoiceResult.header.fatturaNumber,
                  invoiceDate: parsedInvoiceResult.header.fatturaDate,
                  deliveryDate: null,
                  packagesCount: parsedInvoiceResult.header.packagesCount,
                  invoiceTotal: parsedInvoiceResult.header.invoiceTotal ?? null,
                  totalQty: parsedInvoiceResult.header.totalQty,
                }}
                positions={parsedPositions}
                warnings={parserWarnings}
                isSuccess={parsedInvoiceResult.success}
                sourceFileName={parsedInvoiceResult.sourceFileName}
              />
            ) : (
              <div className="enterprise-card p-8 text-center">
                <FileWarning className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-foreground mb-2">
                  Keine Parsing-Daten verfuegbar
                </h3>
                <p className="text-muted-foreground">
                  Die Rechnungsdaten wurden noch nicht geparst oder sind nicht mehr verfuegbar.
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="items">
            <ItemsTable />
          </TabsContent>

          <TabsContent value="issues">
            {/* PROJ-29 ADD-ON 13: Soft-Fail Warnung — Derived State, kein useEffect/Store-Write */}
            {isKachel1FirstCheck && !isKachel1Verified && (
              <div className="flex items-start gap-3 rounded-md border border-amber-400/50 bg-amber-50/10 px-4 py-3 text-sm mb-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
                <div>
                  <span className="font-semibold text-amber-300">Rechnungssummen-Konflikt (Soft-Fail):</span>{' '}
                  <span className="text-muted-foreground">
                    Zeilensumme stimmt nicht mit Rechnungsbetrag überein — mögliche Rundungsdifferenz
                    oder versteckter Rabatt im Fremd-ERP. Bitte Positionen und Gesamtsumme manuell prüfen.
                  </span>
                </div>
              </div>
            )}
            <IssuesCenter />
          </TabsContent>

          <TabsContent value="warehouse">
            <WarehouseLocations />
          </TabsContent>

          <TabsContent value="export">
            <ExportPanel run={currentRun} />
          </TabsContent>

          <TabsContent value="log">
            <RunLogTab runId={currentRun.id} mode="live" />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}


