import { useState } from 'react';
import { Folder, File, Download, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArchiveRun, ArchiveFolder, ArchiveFile, archiveService } from '@/services/archiveService';
import { logService } from '@/services/logService';

interface ArchiveDetailDialogProps {
  run: ArchiveRun | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ArchiveDetailDialog({ run, open, onOpenChange }: ArchiveDetailDialogProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['00_Uploads']));

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleDownloadFile = (file: ArchiveFile) => {
    archiveService.downloadFile(file);
  };

  const handleViewRunLog = () => {
    if (!run) return;
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" style={{ backgroundColor: '#D8E6E7' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="w-5 h-5" style={{ color: '#666666' }} />
            {run ? `Archiv: ${run.fattura}` : 'Archiv'}
          </DialogTitle>
        </DialogHeader>

        {!run ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Kein Archiv-Eintrag für diesen Lauf vorhanden.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Erstellt:</span>{' '}
                <span className="font-medium">{formatDate(run.createdAt)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span className="font-medium">{run.status}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Run ID:</span>{' '}
                <span className="font-mono text-xs">{run.runId}</span>
              </div>
              <div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleViewRunLog}
                  className="gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  Run-Logfile anzeigen
                </Button>
              </div>
            </div>

            {/* Folder Structure */}
            <div className="border rounded-lg bg-background/50">
              <div className="p-3 border-b bg-muted/30">
                <h3 className="font-medium text-sm">Ordnerstruktur</h3>
              </div>
              <ScrollArea className="h-[300px]">
                <div className="p-2">
                  {run.folders.map((folder) => (
                    <FolderItem
                      key={folder.id}
                      folder={folder}
                      isExpanded={expandedFolders.has(folder.name)}
                      onToggle={() => toggleFolder(folder.name)}
                      onDownloadFile={handleDownloadFile}
                    />
                  ))}
                  {run.folders.length === 0 && (
                    <p className="text-sm text-muted-foreground p-4 text-center">
                      Keine Ordner vorhanden
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface FolderItemProps {
  folder: ArchiveFolder;
  isExpanded: boolean;
  onToggle: () => void;
  onDownloadFile: (file: ArchiveFile) => void;
}

function FolderItem({ folder, isExpanded, onToggle, onDownloadFile }: FolderItemProps) {
  return (
    <div className="mb-1">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Folder className="w-4 h-4" style={{ color: '#c9c3b6' }} />
        <span className="text-sm font-medium flex-1">{folder.name}</span>
        <span className="text-xs text-muted-foreground">
          {folder.files.length} {folder.files.length === 1 ? 'Datei' : 'Dateien'}
        </span>
      </button>

      {isExpanded && folder.files.length > 0 && (
        <div className="ml-6 pl-4 border-l border-border">
          {folder.files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/30 group"
            >
              <File className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm flex-1 truncate" title={file.name}>
                {file.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDownloadFile(file)}
                title="Herunterladen"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {isExpanded && folder.files.length === 0 && (
        <div className="ml-6 pl-4 border-l border-border">
          <p className="text-xs text-muted-foreground py-1 px-2">Keine Dateien</p>
        </div>
      )}
    </div>
  );
}
