import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { AlertTriangle, ChevronsRight, PackageOpen, FolderOpen, FileText, Trash2, Search, Database } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusChip } from '@/components/StatusChip';
import { useRunStore } from '@/store/runStore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArchiveDetailDialog } from '@/components/ArchiveDetailDialog';
import { archiveService } from '@/services/archiveService';
import type { ArchiveRun } from '@/services/archiveService';
import { logService } from '@/services/logService';
import { fileSystemService } from '@/services/fileSystemService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Run } from '@/types';
import type { PersistedRunSummary } from '@/services/runPersistenceService';
import { generateXML, generateCSV, buildExportFileName, type RunExportMeta } from '@/services/exportService';
import { useExportConfigStore } from '@/store/exportConfigStore';
import { toast } from 'sonner';

const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';

const FORMAT_TYPES: Array<'xml' | 'csv'> = ['xml', 'csv'];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

/** Unified row shape for both session runs and persisted-only runs */
interface TableRow_ {
  id: string;
  fattura: string;
  createdAt: string;
  status: Run['status'];
  totalIssues: number;
  /** Aggregierte RE-Positionen */
  parsedInvoiceLines: number;
  /** Expandierte Einzelartikel */
  expandedLineCount: number;
  /** Rechnungssumme — aus stats falls verfügbar */
  invoiceTotal: number | null;
  /** Summen-Check bestanden (true), fehlgeschlagen (false), oder ungeprüft (null) */
  step1AmountCheckPassed: boolean | null;
  exportReady: boolean;
  /** Full run object — only present for session runs */
  run?: Run;
  /** True for persisted-only rows (not loaded in memory) */
  isPersistedOnly?: boolean;
}

function toTableRow(run: Run): TableRow_ {
  const totalIssues = run.steps.reduce((acc, step) => acc + step.issuesCount, 0);
  return {
    id: run.id,
    fattura: run.invoice.fattura,
    createdAt: run.createdAt,
    status: run.status,
    totalIssues,
    parsedInvoiceLines: run.stats.parsedInvoiceLines,
    expandedLineCount: run.stats.expandedLineCount,
    invoiceTotal: run.invoice.invoiceTotal ?? null,
    step1AmountCheckPassed: run.invoice.qtyValidationStatus === 'ok'
      ? true
      : run.invoice.qtyValidationStatus === 'mismatch'
        ? false
        : null,
    exportReady: run.steps.every(s => s.status === 'ok' || s.status === 'soft-fail'),
    run,
  };
}

function persistedToTableRow(s: PersistedRunSummary): TableRow_ {
  return {
    id: s.id,
    fattura: s.fattura,
    createdAt: s.createdAt,
    status: s.status,
    totalIssues: 0, // not stored in summary
    parsedInvoiceLines: s.stats.parsedInvoiceLines,
    expandedLineCount: s.stats.expandedLineCount,
    invoiceTotal: s.invoiceTotal,
    step1AmountCheckPassed: s.step1AmountCheckPassed,
    exportReady: s.stats.exportReady,
    isPersistedOnly: true,
  };
}

type StatusFilterValue = 'all' | Run['status'];

const Index = () => {
  const { runs, deleteRun, persistedRunSummaries, loadPersistedRunList, loadPersistedRun, invoiceLines: allInvoiceLines, setBookingDate, incrementExportVersion } = useRunStore();
  const { columnOrder, csvDelimiter, csvIncludeHeader } = useExportConfigStore();
  const navigate = useNavigate();

  const [selectedArchiveRun, setSelectedArchiveRun] = useState<ArchiveRun | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<Run | null>(null);
  const [hoveredFormat, setHoveredFormat] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('all');

  // Load persisted run list on mount
  useEffect(() => {
    loadPersistedRunList();
  }, [loadPersistedRunList]);

  // Merge: session runs take priority over persisted-only runs (deduplicate by id)
  const sessionRunIds = new Set(runs.map(r => r.id));
  const persistedOnly = persistedRunSummaries.filter(s => !sessionRunIds.has(s.id));

  const sessionRows: TableRow_[] = runs.map(toTableRow);
  const persistedRows: TableRow_[] = persistedOnly.map(persistedToTableRow);
  const allRows: TableRow_[] = [...sessionRows, ...persistedRows];

  // Sort by createdAt desc
  allRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Filter
  const filteredRows = allRows.filter(row => {
    const matchesSearch =
      !searchTerm ||
      row.fattura.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || row.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDownloadFormat = (run: Run, type: 'xml' | 'csv') => {
    const runLines = allInvoiceLines.filter(l => l.lineId.startsWith(`${run.id}-line-`));
    if (runLines.length === 0) {
      toast.info('Bitte laden Sie diesen Run zuerst, um den Export zu starten.');
      return;
    }
    // PROJ-42-ADD-ON-V: Buchungsdatum setzen + Version hochzählen
    const freshRun = setBookingDate(run.id, new Date().toLocaleDateString('de-DE'));
    const latestRun = incrementExportVersion(run.id);
    const effectiveRun = latestRun ?? freshRun ?? run;

    const meta: RunExportMeta = {
      fattura: effectiveRun.invoice.fattura,
      invoiceDate: effectiveRun.invoice.invoiceDate,
      deliveryDate: effectiveRun.invoice.deliveryDate ?? null,
      eingangsart: effectiveRun.config.eingangsart,
      runId: effectiveRun.id,
      bookingDate: effectiveRun.stats.bookingDate ?? '',
    };
    const content = type === 'xml'
      ? generateXML(runLines, columnOrder, meta)
      : generateCSV(runLines, columnOrder, meta, csvDelimiter, csvIncludeHeader);
    const mimeType = type === 'xml' ? 'application/xml' : 'text/csv';
    const version = effectiveRun.stats.exportVersion ?? 0;
    const fileName = buildExportFileName(effectiveRun.id, type, version);
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleOpenDetails = (run: Run) => {
    const archiveRun = archiveService.getArchivedRun(run.id);
    setSelectedArchiveRun(archiveRun);
    setDetailDialogOpen(true);
  };

  const handleViewRunLog = (run: Run) => {
    const logs = logService.getRunLog(run.id);
    if (logs.length > 0) {
      logService.openLogInNewTab(logs, `falmec ReceiptPro - Run Log: ${run.invoice.fattura}`);
    } else {
      logService.openLogInNewTab(
        [{
          id: 'temp',
          timestamp: new Date().toISOString(),
          level: 'INFO' as const,
          message: 'Keine Log-Eintraege fuer diesen Durchlauf vorhanden.',
        }],
        `falmec ReceiptPro - Run Log: ${run.invoice.fattura}`
      );
    }
  };

  const handleDeleteClick = (run: Run) => {
    setRunToDelete(run);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (runToDelete) {
      const archiveRun = archiveService.getArchivedRun(runToDelete.id);
      const payload = JSON.stringify({ run: runToDelete, archiveRun }, null, 2);
      const fileName = `del_${runToDelete.id}_${Date.now()}.json`;
      await fileSystemService.saveToBin(fileName, payload);
      deleteRun(runToDelete.id);
      setRunToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const handleOpenPersistedRun = async (runId: string) => {
    const success = await loadPersistedRun(runId);
    if (success) {
      navigate(`/run/${encodeURIComponent(runId)}`);
    }
  };

  return (
    <AppLayout>
      <div className="pt-3 pb-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-6 text-xs" style={{ color: '#D9D4C7' }}>
            Konsolidierung | Eingangskontrolle | Bestellnummer Routing | Serienummern Parsing | Lagerplatzzuordnung | Rechnungspruefung | Exporterstellung fuer Sage100 Belegimport | Archiv | Logs | Datenanpassung
          </p>
          <h1 className="text-2xl font-bold flex items-center justify-center gap-3" style={{ color: '#D8E6E7' }}>
            <PackageOpen className="w-7 h-7" />
            Dashboard Wareneingang
          </h1>
        </div>

        {/* Runs Table */}
        <div className="enterprise-card">
          {/* PROJ-22 B5: Kopfzeile mit Suchleiste + Statusfilter rechtsbündig */}
          <div className="p-4 border-b border-border flex items-center gap-4">
            <h2 className="text-lg font-semibold text-foreground shrink-0">
              Archiv
            </h2>
            {persistedOnly.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Database className="w-3.5 h-3.5" />
                {persistedOnly.length} aus IndexedDB
              </span>
            )}
            {/* Suchleiste + Filter rechtsbündig */}
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Fattura-Nr. oder Lauf-ID suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-8 w-64 text-sm bg-surface-elevated"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilterValue)}>
                <SelectTrigger className="h-8 w-40 text-sm bg-surface-elevated">
                  <SelectValue placeholder="Status filtern" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">Alle Status</SelectItem>
                  <SelectItem value="ok">Erfolgreich</SelectItem>
                  <SelectItem value="soft-fail">Warnung</SelectItem>
                  <SelectItem value="failed">Fehlgeschlagen</SelectItem>
                  <SelectItem value="running">In Bearbeitung</SelectItem>
                  <SelectItem value="paused">Pausiert</SelectItem>
                  <SelectItem value="not-started">Nicht gestartet</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="data-table-header">
                <TableHead>Zeitstempel</TableHead>
                {/* PROJ-22 B5: Neue Spalten */}
                <TableHead>DOKUMENT</TableHead>
                <TableHead className="text-right">Rechnungssumme</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">RE-Pos.</TableHead>
                <TableHead className="text-right">Artikel</TableHead>
                <TableHead>FEHLER</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead>Aktionen</TableHead>
                <TableHead>oeffnen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map(row => (
                <TableRow
                  key={row.id}
                  className={`hover:bg-muted/30 ${row.isPersistedOnly ? 'opacity-80' : ''}`}
                >
                  <TableCell className="font-medium text-sm">
                    {format(new Date(row.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                  </TableCell>

                  {/* DOKUMENT */}
                  <TableCell>
                    <span className="font-mono text-sm">{row.fattura}</span>
                  </TableCell>

                  {/* PROJ-22 B5: Rechnungssumme */}
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {row.invoiceTotal == null
                      ? '–'
                      : row.step1AmountCheckPassed === false
                        ? <AlertTriangle className="w-4 h-4 text-red-500 inline" title="Summen-Konflikt" />
                        : formatCurrency(row.invoiceTotal)
                    }
                  </TableCell>

                  {/* Status */}
                  <TableCell>
                    <StatusChip status={row.status} />
                  </TableCell>

                  {/* PROJ-22 B5: Rechnungspositionen (aggregiert) */}
                  <TableCell className="text-right font-mono text-xs">
                    {row.parsedInvoiceLines > 0 ? row.parsedInvoiceLines : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>

                  {/* PROJ-22 B5: Gesamtartikel (expandiert) */}
                  <TableCell className="text-right font-mono text-xs">
                    {row.expandedLineCount > 0 ? row.expandedLineCount : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>

                  {/* FEHLER */}
                  <TableCell>
                    {row.totalIssues > 0 ? (
                      <span className="flex items-center gap-1.5 text-status-soft-fail">
                        <AlertTriangle className="w-4 h-4" />
                        {row.totalIssues}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>

                  {/* Downloads */}
                  <TableCell>
                    {row.run ? (
                      <div className="flex items-center gap-1">
                        {FORMAT_TYPES.map(type => {
                          const hoverKey = `${row.id}-${type}`;
                          const isHovered = hoveredFormat === hoverKey;
                          if (row.exportReady) {
                            return (
                              <button
                                key={type}
                                onClick={() => handleDownloadFormat(row.run!, type)}
                                onMouseEnter={() => setHoveredFormat(hoverKey)}
                                onMouseLeave={() => setHoveredFormat(null)}
                                className="font-mono text-xs px-2 py-0.5 rounded transition-colors duration-150"
                                style={{
                                  backgroundColor: isHovered ? HOVER_BG : undefined,
                                  color: isHovered ? HOVER_TEXT : undefined,
                                }}
                                title={`${type.toUpperCase()} herunterladen`}
                              >
                                <span className={isHovered ? '' : 'bg-muted rounded px-1'}>
                                  .{type.toUpperCase()}
                                </span>
                              </button>
                            );
                          }
                          return (
                            <span key={type} className="font-mono text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground opacity-40">
                              .{type.toUpperCase()}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">–</span>
                    )}
                  </TableCell>

                  {/* Aktionen */}
                  <TableCell>
                    {row.run ? (
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDetails(row.run!)}
                          title="Dateien oeffnen"
                          className="h-8 w-8"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewRunLog(row.run!)}
                          title="Logfile oeffnen"
                          className="h-8 w-8"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(row.run!)}
                          title="Aus Dashboard entfernen"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground px-2">IndexedDB</span>
                    )}
                  </TableCell>

                  {/* Öffnen */}
                  <TableCell>
                    {row.run ? (
                      <Link to={`/run/${encodeURIComponent(row.id)}`}>
                        <Button variant="ghost" size="icon">
                          <ChevronsRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenPersistedRun(row.id)}
                        title="Aus IndexedDB laden"
                      >
                        <ChevronsRight className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                    {searchTerm || statusFilter !== 'all'
                      ? 'Keine Eintraege entsprechen dem Filter.'
                      : 'Keine Verarbeitungslaeufe vorhanden. Starten Sie einen neuen Lauf.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Archive Detail Dialog */}
      <ArchiveDetailDialog
        run={selectedArchiveRun}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Aus Dashboard entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Soll der Lauf „{runToDelete?.invoice.fattura}" aus dem Dashboard entfernt werden?
              Die Daten werden im Ordner Temp/.del gesichert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbruch</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Index;
