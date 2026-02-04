import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, FileWarning, RefreshCw } from 'lucide-react';
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
  const {
    currentRun,
    setCurrentRun,
    activeTab,
    setActiveTab,
    parsedInvoiceResult,
    parsedPositions,
    parserWarnings,
  } = useRunStore();

  useEffect(() => {
    // Find run by ID from mock data or store
    const run = mockRuns.find(r => r.id === runId);
    if (run) {
      setCurrentRun(run);
    }
    return () => setCurrentRun(null);
  }, [runId, setCurrentRun]);

  if (!currentRun) {
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
                Zurück zur Übersicht
              </Button>
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  const totalIssues = currentRun.steps.reduce((acc, step) => acc + step.issuesCount, 0);

  return (
    <AppLayout>
      <div className="py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
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
              className="gap-2 border"
              style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
            >
              <RefreshCw className="w-4 h-4" />
              Neu verarbeiten
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
          <KPITile
            value={currentRun.stats.exportReady ? 'Bereit' : 'Ausstehend'}
            label="Export Status"
            variant={currentRun.stats.exportReady ? 'success' : 'warning'}
          />
        </KPIGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="overview">Übersicht</TabsTrigger>
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
                  Keine Parsing-Daten verfügbar
                </h3>
                <p className="text-muted-foreground">
                  Die Rechnungsdaten wurden noch nicht geparst oder sind nicht mehr verfügbar.
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
