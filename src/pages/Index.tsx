import { useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { AlertTriangle, ChevronsRight, PackageOpen, FolderOpen, FileText, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
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
import type { Run } from '@/types';

const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';

const FORMAT_TYPES: Array<'xml' | 'csv'> = ['xml', 'csv'];

function generateRunExport(run: Run, type: 'xml' | 'csv' | 'json'): string {
  const ts = new Date().toISOString();
  if (type === 'xml') {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<BelegImport>\n  <Fattura>${run.invoice.fattura}</Fattura>\n  <InvoiceDate>${run.invoice.invoiceDate}</InvoiceDate>\n  <Eingangsart>${run.config.eingangsart}</Eingangsart>\n  <ExportedAt>${ts}</ExportedAt>\n</BelegImport>`;
  }
  if (type === 'csv') {
    return `"Fattura";"Datum";"Eingangsart";"Exportiert"\n"${run.invoice.fattura}";"${run.invoice.invoiceDate}";"${run.config.eingangsart}";"${ts}"`;
  }
  return JSON.stringify(
    { fattura: run.invoice.fattura, invoiceDate: run.invoice.invoiceDate, eingangsart: run.config.eingangsart, exportedAt: ts },
    null,
    2
  );
}

const Index = () => {
  const { runs, deleteRun } = useRunStore();

  const [selectedArchiveRun, setSelectedArchiveRun] = useState<ArchiveRun | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<Run | null>(null);
  const [hoveredFormat, setHoveredFormat] = useState<string | null>(null);

  const handleDownloadFormat = (run: Run, type: 'xml' | 'csv' | 'json') => {
    const content = generateRunExport(run, type);
    const mimeType = type === 'xml' ? 'text/xml' : type === 'json' ? 'application/json' : 'text/csv';
    const fileName = `Fattura-${run.invoice.fattura.replace(/[^a-zA-Z0-9]/g, '')}_${type}.${type}`;
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
          message: 'Keine Log-EintrÃ¤ge fÃ¼r diesen Durchlauf vorhanden.',
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

  return (
    <AppLayout>
      <div className="pt-3 pb-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-6 text-xs" style={{ color: '#D9D4C7' }}>
            Konsolidierung | Eingangskontrolle | Bestellnummer Routing | Serienummern Parsing | Lagerplatzzuordnung | RechnungsprÃ¼fung | Exporterstellung fÃ¼r Sage100 Belegimport | Archiv | Logs | Datenanpassung
          </p>
          <h1 className="text-2xl font-bold flex items-center justify-center gap-3" style={{ color: '#D8E6E7' }}>
            <PackageOpen className="w-7 h-7" />
            Dashboard Wareneingang
          </h1>
        </div>

        {/* Runs Table */}
        <div className="enterprise-card">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">
              Dasboard Archiv
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="data-table-header">
                <TableHead>Zeitstempel</TableHead>
                <TableHead>DOKUMENT</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>FEHLER</TableHead>
                <TableHead>Downloads</TableHead>
                <TableHead>Aktionen</TableHead>
                <TableHead>Ã¶ffnen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map(run => {
                const totalIssues = run.steps.reduce((acc, step) => acc + step.issuesCount, 0);
                return (
                  <TableRow key={run.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">
                      {format(new Date(run.createdAt), 'dd.MM.yyyy HH:mm', { locale: de })}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{run.invoice.fattura}</span>
                    </TableCell>
                    <TableCell>
                      <StatusChip status={run.status} />
                    </TableCell>
                    <TableCell>
                      {totalIssues > 0 ? (
                        <span className="flex items-center gap-1.5 text-status-soft-fail">
                          <AlertTriangle className="w-4 h-4" />
                          {totalIssues}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">â€”</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {FORMAT_TYPES.map(type => {
                          const hoverKey = `${run.id}-${type}`;
                          const isHovered = hoveredFormat === hoverKey;
                          if (run.stats.exportReady) {
                            return (
                              <button
                                key={type}
                                onClick={() => handleDownloadFormat(run, type)}
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
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDetails(run)}
                          title="Dateien Ã¶ffnen"
                          className="h-8 w-8"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewRunLog(run)}
                          title="Logfile Ã¶ffnen"
                          className="h-8 w-8"
                        >
                          <FileText className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(run)}
                          title="Aus Dashboard entfernen"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link to={`/run/${encodeURIComponent(run.id)}`}>
                        <Button variant="ghost" size="icon">
                          <ChevronsRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
              {runs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Keine VerarbeitungslÃ¤ufe vorhanden. Starten Sie einen neuen Lauf.
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
              Soll der Lauf â€ž{runToDelete?.invoice.fattura}" aus dem Dashboard entfernt werden?
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

