import { useEffect, useState } from 'react';
import { useClickLock } from '@/hooks/useClickLock';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileWarning, RefreshCw, Play, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
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
    parsedInvoiceResult,
    parsedPositions,
    parserWarnings,
    advanceToNextStep,
    createNewRunWithParsing,
    isProcessing,
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
  useEffect(() => {
    if (!parsedInvoiceResult) return;
    setShowEvent(true);
    const timer = setTimeout(() => setShowEvent(false), 4000);
    return () => clearTimeout(timer);
  }, [parsedInvoiceResult]);

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
                ZurÃ¼ck zur Ãœbersicht
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const totalIssues = currentRun.steps.reduce((acc, step) => acc + step.issuesCount, 0);

  // Determine next workflow step
  const getNextStep = () => {
    if (!currentRun) return null;

    // Find first step that is 'not-started' or 'running'
    const nextStep = currentRun.steps.find(
      step => step.status === 'not-started' || step.status === 'running'
    );

    return nextStep || null;
  };

  const nextStep = getNextStep();
  const allStepsComplete = currentRun.steps.every(
    step => step.status === 'ok' || step.status === 'soft-fail'
  );
  const parseErrorCount = parsedInvoiceResult
    ? parsedInvoiceResult.warnings.filter(w => w.severity === 'error').length
    : 0;

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
                className="hover:bg-accent hover:text-accent-foreground hover:border-accent"
                style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <p className="mb-1" style={{ color: '#D8E6E7' }}>
                {format(new Date(currentRun.createdAt), "dd. MMMM yyyy, HH:mm 'Uhr'", { locale: de })}
                {currentRun.invoice.deliveryDate && (
                  <span> â€¢ Lieferung: {format(new Date(currentRun.invoice.deliveryDate), 'dd.MM.yyyy', { locale: de })}</span>
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
                        currentRun.status === 'ok' ? '#22c55e' :
                        currentRun.status === 'failed' ? '#ef4444' :
                        currentRun.status === 'soft-fail' ? '#f59e0b' : '#6b7280'
                    }}
                  />
                  {currentRun.status === 'running' ? 'In Bearbeitung' :
                   currentRun.status === 'ok' ? 'Erfolgreich' :
                   currentRun.status === 'failed' ? 'Fehlgeschlagen' :
                   currentRun.status === 'soft-fail' ? 'Warnung' : 'Nicht gestartet'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border hover:bg-accent hover:text-accent-foreground hover:border-accent"
              style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
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
          <WorkflowStepper steps={currentRun.steps} />
        </div>

        {/* KPI Tiles */}
        <KPIGrid className="mb-6">
          <KPITile
            value={`${currentRun.stats.parsedInvoiceLines}/${parsedInvoiceResult?.header.totalQty ?? '?'}`}
            label="Rechnungspositionen"
            subValue={
              parsedInvoiceResult?.header.qtyValidationStatus === 'mismatch'
                ? 'Fehler: Anzahl stimmt nicht'
                : `${parsedInvoiceResult?.header.parsedPositionsCount ?? 0} Positionen`
            }
            variant={
              parsedInvoiceResult?.header.qtyValidationStatus === 'mismatch' ? 'warning' : 'default'
            }
          />
          <KPITile
            value={`${currentRun.stats.matchedOrders}/${currentRun.stats.parsedInvoiceLines - currentRun.stats.notOrderedCount}`}
            label="Bestellungen zugeordnet"
            variant={currentRun.stats.matchedOrders === currentRun.stats.parsedInvoiceLines - currentRun.stats.notOrderedCount ? 'success' : 'warning'}
          />
          <KPITile
            value={currentRun.stats.serialMatchedCount}
            label="Seriennummern"
            subValue={currentRun.stats.mismatchedGroupsCount > 0 ? `${currentRun.stats.mismatchedGroupsCount} Gruppen fehlerhaft` : undefined}
            variant={currentRun.stats.mismatchedGroupsCount > 0 ? 'warning' : 'success'}
          />
          <KPITile
            value={currentRun.stats.articleMatchedCount}
            label="Artikel zugeordnet"
            subValue={currentRun.stats.inactiveArticlesCount > 0 ? `${currentRun.stats.inactiveArticlesCount} inaktiv` : undefined}
            variant={currentRun.stats.inactiveArticlesCount > 0 ? 'warning' : 'success'}
          />
          <KPITile
            value={currentRun.stats.priceOkCount}
            label="Preise OK"
            subValue={currentRun.stats.priceMismatchCount > 0 ? `${currentRun.stats.priceMismatchCount} Abweichungen` : undefined}
            variant={currentRun.stats.priceMismatchCount > 0 ? 'warning' : 'success'}
          />
          {/* Dynamic Next Step Button */}
          <div
            className="kpi-tile flex flex-col justify-center items-center cursor-pointer hover:opacity-90 transition-opacity"
            style={{ backgroundColor: '#c9c3b6' }}
            onClick={wrap('next-step', () => {
              if (allStepsComplete) {
                setActiveTab('export');
              } else if (currentRun) {
                advanceToNextStep(currentRun.id);
              }
            })}
          >
            <div className="flex flex-col items-center">
              {allStepsComplete ? (
                <Download style={{ width: '42px', height: '42px', color: '#666666' }} />
              ) : (
                <Play style={{ width: '42px', height: '42px', color: '#666666' }} />
              )}
              <span className="text-base font-semibold mt-1" style={{ color: '#666666' }}>
                {allStepsComplete ? 'Exportdatei herunterladen' : 'nÃ¤chster Schritt'}
              </span>
            </div>
            {!allStepsComplete && nextStep && (
              <span className="text-xs mt-1" style={{ color: '#666666', opacity: 0.8 }}>
                {nextStep.name}
              </span>
            )}
          </div>
        </KPIGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          {/* Tab-Leiste + Ereignisfeld nebeneinander */}
          <div className="flex items-center gap-4">
            <TabsList className="bg-card border border-border">
              <TabsTrigger value="overview">Details</TabsTrigger>
              <TabsTrigger value="invoice-preview">
                Rechnung
                {parsedInvoiceResult && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded ${
                    parsedInvoiceResult.success
                      ? 'bg-green-100 text-green-700'
                      : 'bg-status-soft-fail/20 text-status-soft-fail'
                  }`}>
                    {parsedInvoiceResult.lines.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="items">
                Positionen
                <span className="ml-1.5 text-xs bg-muted px-1.5 py-0.5 rounded">
                  {currentRun.stats.parsedInvoiceLines}
                </span>
              </TabsTrigger>
              <TabsTrigger value="issues">
                Issues
                {totalIssues > 0 && (
                  <span className="ml-1.5 text-xs bg-status-soft-fail/20 text-status-soft-fail px-1.5 py-0.5 rounded">
                    {totalIssues}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="warehouse">Lagerorte</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>

            {/* Ereignisfeld â€“ rechtsbÃ¼ndig, auto-dismiss nach 4 s */}
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
                      Bitte Warnungen prÃ¼fen
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
                  Keine Parsing-Daten verfÃ¼gbar
                </h3>
                <p className="text-muted-foreground">
                  Die Rechnungsdaten wurden noch nicht geparst oder sind nicht mehr verfÃ¼gbar.
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
        </Tabs>
      </div>
    </AppLayout>
  );
}


