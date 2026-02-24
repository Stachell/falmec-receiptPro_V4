import { useEffect, useRef, useState } from 'react';
import { useClickLock } from '@/hooks/useClickLock';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileWarning, RefreshCw, Play, Pause, CheckCircle, AlertCircle, Loader2, Fingerprint } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
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
import { OverviewPanel } from '@/components/run-detail/OverviewPanel';
import { InvoicePreview } from '@/components/run-detail/InvoicePreview';
import { RunLogTab } from '@/components/run-detail/RunLogTab';

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
  } = useRunStore();
  // Make getState available for fire-and-forget pattern
  const getStoreState = useRunStore.getState;
  const navigate = useNavigate();
  const { wrap, isLocked } = useClickLock();

  useEffect(() => {
    // Find run by ID - first search in store runs (real runs), then fallback to mock data
    const run = runs.find(r => r.id === decodedRunId) || mockRuns.find(r => r.id === decodedRunId);
    if (run) {
      setCurrentRun(run);
    }
    return () => setCurrentRun(null);
  }, [decodedRunId, runs, setCurrentRun]);

  const [showEvent, setShowEvent] = useState(false);
  const mountedAtRef = useRef(Date.now());
  useEffect(() => {
    if (!parsedInvoiceResult) return;
    // KISS Race-Condition Fix: delay the initial toast by 2s so the real parse
    // success state has time to settle before we show any error toast.
    const age = Date.now() - mountedAtRef.current;
    const delay = age < 2000 ? 2000 - age : 0;
    const showTimer = setTimeout(() => setShowEvent(true), delay);
    const hideTimer = setTimeout(() => setShowEvent(false), delay + 4000);
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [parsedInvoiceResult]);

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
      <div className="py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button
                variant="outline"
                size="icon"
                className="bg-[#c9c3b6] text-[#666666] border-[#666666] hover:bg-[#008C99] hover:text-[#E3E0CF] hover:border-[#008C99] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <p className="mb-1" style={{ color: '#D8E6E7' }}>
                {format(new Date(currentRun.createdAt), "dd. MMMM yyyy, HH:mm 'Uhr'", { locale: de })}
                {currentRun.invoice.deliveryDate && (
                  <span> • Lieferung: {format(new Date(currentRun.invoice.deliveryDate), 'dd.MM.yyyy', { locale: de })}</span>
                )}
              </p>
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
            {currentRun.stats.exportReady && (
              <Button size="sm" className="gap-2">
                <Download className="w-4 h-4" />
                XML Export
              </Button>
            )}
          </div>
        </div>

        {/* Workflow Stepper */}
        <div className="mb-6">
          <WorkflowStepper steps={currentRun.steps} isPaused={isPaused} />
        </div>

        {/* KPI Tiles */}
        <KPIGrid className="mb-6">
          {/* Kachel 1: Positionen erhalten — PROJ-20 */}
          <KPITile
            value={`${currentRun.stats.parsedInvoiceLines} / ${parsedInvoiceResult?.header.pzCount ?? parsedInvoiceResult?.header.parsedPositionsCount ?? '?'}`}
            label="Positionen erhalten"
            subValue={
              parsedInvoiceResult?.header.qtyValidationStatus === 'mismatch'
                ? 'Fehler: Anzahl stimmt nicht'
                : parsedInvoiceResult?.header.fatturaNumber ?? 'n/a'
            }
            variant={
              parsedInvoiceResult?.header.qtyValidationStatus === 'mismatch'
                ? 'warning'
                : parsedInvoiceResult?.header.qtyValidationStatus === 'ok'
                  ? 'success'
                  : 'default'
            }
          />
          {/* Kachel 2: Artikel extrahiert — PROJ-20 */}
          <KPITile
            value={`${currentRun.stats.articleMatchedCount}/${currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines}`}
            label="Artikel extrahiert"
            subValue={
              currentRun.stats.noMatchCount > 0
                ? `${currentRun.stats.expandedLineCount} Artikel (${currentRun.stats.noMatchCount} ohne Match)`
                : currentRun.stats.expandedLineCount > 0
                  ? `${currentRun.stats.expandedLineCount} Artikel`
                  : undefined
            }
            variant={currentRun.stats.noMatchCount > 0 ? 'error' : currentRun.stats.articleMatchedCount > 0 ? 'success' : 'default'}
            onClick={currentRun.stats.noMatchCount > 0 ? () => {
              setIssuesStepFilter('2');
              setActiveTab('issues');
            } : undefined}
          />
          {/* Kachel 3: Preise checken */}
          <KPITile
            value={`${currentRun.stats.priceOkCount}/${currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines}`}
            label="Preise checken"
            subValue={
              currentRun.stats.priceMismatchCount > 0
                ? `${currentRun.stats.priceMismatchCount} Abweichungen`
                : currentRun.stats.priceMissingCount > 0
                  ? `${currentRun.stats.priceMissingCount} fehlen`
                  : undefined
            }
            variant={currentRun.stats.priceMismatchCount > 0 || currentRun.stats.priceMissingCount > 0 ? 'warning' : currentRun.stats.priceOkCount > 0 ? 'success' : 'default'}
          />
          {/* Kachel 4: Serials geparst — PROJ-20 */}
          <KPITile
            value={`${currentRun.stats.serialMatchedCount}/${currentRun.stats.serialRequiredCount || '?'}`}
            label="Serials geparst"
            icon={<Fingerprint className="w-4 h-4" />}
            subValue={currentRun.stats.serialRequiredCount === 0 ? 'Keine SN-Pflicht' : undefined}
            variant={currentRun.stats.serialMatchedCount >= currentRun.stats.serialRequiredCount && currentRun.stats.serialRequiredCount > 0 ? 'success' : 'default'}
            onClick={currentRun.steps.find(s => s.stepNo === 3)?.issuesCount ? () => {
              setIssuesStepFilter('3');
              setActiveTab('issues');
            } : undefined}
          />
          {/* Kachel 5: Bestellungen mappen */}
          <KPITile
            value={`${currentRun.stats.matchedOrders}/${currentRun.stats.expandedLineCount || currentRun.stats.parsedInvoiceLines}`}
            label="Beleg zugeteilt"
            subValue={currentRun.stats.notOrderedCount > 0 ? `${currentRun.stats.notOrderedCount} nicht bestellt` : undefined}
            variant={currentRun.stats.notOrderedCount > 0 ? 'warning' : currentRun.stats.matchedOrders > 0 ? 'success' : 'default'}
          />
          {/* Dynamic Next Step Button — PROJ-25: hover unified + pause badge */}
          <div
            className={
              isPaused
                ? 'kpi-tile flex flex-col justify-center items-center cursor-not-allowed bg-[#FD7C6E] text-white transition-colors'
                : 'kpi-tile group flex flex-col justify-center items-center cursor-pointer bg-[#c9c3b6] hover:bg-[#008C99] transition-colors'
            }
            onClick={wrap('next-step', () => {
              if (isPaused) return;
              if (allStepsComplete) {
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
                      ? (totalIssues > 0 ? `${totalIssues} Issues offen` : 'Keine offenen Issues')
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
            <TabsList className="bg-[#c9c3b6] border border-border">
              <TabsTrigger
                value="invoice-preview"
                className="data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
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
                className="data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Artikelliste
                {/* PROJ-22 B1: Artikelliste-Badge bg-[#008c99] white text */}
                <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#008c99', color: '#ffffff' }}>
                  {parsedInvoiceResult?.header.packagesCount ?? currentRun.invoice.packagesCount ?? currentRun.stats.parsedInvoiceLines}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="issues"
                className="data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
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
                className="data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Lagerorte
              </TabsTrigger>
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Details
              </TabsTrigger>
              <TabsTrigger
                value="export"
                className="data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Export
              </TabsTrigger>
              <TabsTrigger
                value="log"
                className="data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors"
              >
                Log
              </TabsTrigger>
            </TabsList>

            {/* Ereignisfeld – rechtsbuendig, auto-dismiss nach 4 s */}
            {parsedInvoiceResult && showEvent && (
              <div className="flex-none w-1/3 ml-auto">
                {parsedInvoiceResult.success && parseErrorCount === 0 ? (
                  <Alert
                    className="py-2 border-green-500 text-green-800"
                    style={{ backgroundColor: 'rgba(255,255,255,0.5)' }}
                  >
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-sm font-semibold leading-tight">
                      Rechnung erfolgreich ausgelesen
                    </AlertTitle>
                    <AlertDescription className="text-xs leading-tight">
                      {parsedInvoiceResult.lines.length} Positionen ausgelesen
                    </AlertDescription>
                  </Alert>
                ) : (
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
                )}
              </div>
            )}
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


