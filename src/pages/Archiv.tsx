import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FolderOpen, FileText, Trash2, CheckCircle, AlertTriangle, Clock, XCircle, RefreshCw } from 'lucide-react';

// Hover style constants
const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';
const HOVER_BORDER = '#D8E6E7';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArchiveDetailDialog } from '@/components/ArchiveDetailDialog';
import { archiveService, ArchiveRun } from '@/services/archiveService';
import { logService } from '@/services/logService';
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

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'ok':
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'soft-fail':
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case 'running':
      return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function Archiv() {
  const [archivedRuns, setArchivedRuns] = useState<ArchiveRun[]>(() => archiveService.getArchivedRuns());
  const [selectedRun, setSelectedRun] = useState<ArchiveRun | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [runToDelete, setRunToDelete] = useState<ArchiveRun | null>(null);
  const [isRefreshHovered, setIsRefreshHovered] = useState(false);

  const handleOpenDetails = (run: ArchiveRun) => {
    setSelectedRun(run);
    setDetailDialogOpen(true);
  };

  const handleViewRunLog = (run: ArchiveRun) => {
    const logs = logService.getRunLog(run.runId);
    if (logs.length > 0) {
      logService.openLogInNewTab(logs, `falmec ReceiptPro - Run Log: ${run.fattura}`);
    } else {
      const tempLogs = [{
        id: 'temp',
        timestamp: new Date().toISOString(),
        level: 'INFO' as const,
        message: 'Keine Log-Einträge für diesen Durchlauf vorhanden.',
      }];
      logService.openLogInNewTab(tempLogs, `falmec ReceiptPro - Run Log: ${run.fattura}`);
    }
  };

  const handleDeleteClick = (run: ArchiveRun) => {
    setRunToDelete(run);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (runToDelete) {
      archiveService.deleteArchivedRun(runToDelete.runId);
      setArchivedRuns(archiveService.getArchivedRuns());
      setRunToDelete(null);
    }
    setDeleteDialogOpen(false);
  };

  const refreshData = () => {
    setArchivedRuns(archiveService.getArchivedRuns());
  };

  return (
    <AppLayout>
      <div className="pt-3 pb-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-1" style={{ color: '#D9D4C7' }}>
            Übersicht aller archivierten Verarbeitungsläufe
          </p>
          <h1 className="text-2xl font-bold" style={{ color: '#D8E6E7' }}>
            Archiv
          </h1>
        </div>

        {/* Content */}
        <div className="enterprise-card">
          {/* Box Header */}
          <div className="p-4 border-b border-border flex items-center">
            <Link to="/">
              <Button size="icon" variant="ghost">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h2 className="text-lg font-semibold text-foreground flex-1 text-center">
              Archivierte Läufe
            </h2>
            <button
              onClick={refreshData}
              onMouseEnter={() => setIsRefreshHovered(true)}
              onMouseLeave={() => setIsRefreshHovered(false)}
              className="h-8 px-3 text-xs rounded-md flex items-center gap-1.5 transition-all duration-200 border"
              style={{
                backgroundColor: isRefreshHovered ? HOVER_BG : '#c9c3b6',
                color: isRefreshHovered ? HOVER_TEXT : '#666666',
                borderColor: isRefreshHovered ? HOVER_BORDER : '#666666',
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Aktualisieren
            </button>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow className="data-table-header">
                <TableHead>Zeitstempel</TableHead>
                <TableHead>Fattura</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ordner</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archivedRuns.map((run) => (
                <TableRow key={run.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">
                    {formatDate(run.createdAt)}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{run.fattura}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <StatusIcon status={run.status} />
                      <span className="text-sm capitalize">{run.status}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {run.folders.length} {run.folders.length === 1 ? 'Ordner' : 'Ordner'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDetails(run)}
                        title="Daten öffnen"
                        className="h-8 w-8"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewRunLog(run)}
                        title="Logfile öffnen"
                        className="h-8 w-8"
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(run)}
                        title="Löschen"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {archivedRuns.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    Keine archivierten Verarbeitungsläufe vorhanden.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Detail Dialog */}
      <ArchiveDetailDialog
        run={selectedRun}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiv-Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie den Archiv-Eintrag für "{runToDelete?.fattura}" wirklich löschen?
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbruch</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
