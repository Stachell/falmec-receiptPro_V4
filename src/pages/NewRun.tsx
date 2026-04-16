import { useState, useEffect } from 'react';
import { useClickLock } from '@/hooks/useClickLock';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, AlertTriangle, FolderOpen, Loader2, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { FileUploadZone } from '@/components/FileUploadZone';
import { Button } from '@/components/ui/button';
import { useRunStore } from '@/store/runStore';
import { Link } from 'react-router-dom';
import { fileSystemService } from '@/services/fileSystemService';
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

export default function NewRun() {
  const navigate = useNavigate();
  const {
    uploadedFiles,
    addUploadedFile,
    removeUploadedFile,
    loadStoredFiles,
    clearUploadedFiles,
    createRunSkeleton,
    parseInvoiceForIngest,
    ingestAndPersistRunData,
    startWorkflowPhase2,
    cleanupFailedIngest,
  } = useRunStore();
  const { wrap, isLocked } = useClickLock();
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [isDirectoryConfigured, setIsDirectoryConfigured] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [ingestErrors, setIngestErrors] = useState<string[] | null>(null);

  const invoiceFile = uploadedFiles.find(f => f.type === 'invoice');
  const openWEFile = uploadedFiles.find(f => f.type === 'openWE');
  const serialListFile = uploadedFiles.find(f => f.type === 'serialList');
  const articleListFile = uploadedFiles.find(f => f.type === 'articleList');

  // Pflicht: invoice + articleList + openWE. Optional: serialList (UX: Ersatzteilbestellungen)
  const requiredFilesUploaded = invoiceFile && articleListFile && openWEFile;
  // Also check fileSystemService directly – the folder might have been
  // configured via the AppFooter after this page mounted.
  const canStartProcessing = requiredFilesUploaded && (isDirectoryConfigured || !!fileSystemService.getDataPath());

  // Load stored files and check directory configuration on mount
  useEffect(() => {
    const initialize = async () => {
      // Check directory configuration
      const path = fileSystemService.getDataPath();
      setIsDirectoryConfigured(!!path);

      // Load previously stored files from IndexedDB
      await loadStoredFiles();
      setIsLoadingFiles(false);
    };

    initialize();
  }, [loadStoredFiles]);

  // PROJ-49 SSOT: 4-Phasen-Ablauf — fileSnapshot VOR createRunSkeleton() erstellen
  const startNewRun = async () => {
    const fileSnapshot = {
      invoice:     uploadedFiles.find(f => f.type === 'invoice'),
      articleList: uploadedFiles.find(f => f.type === 'articleList'),
      serialList:  uploadedFiles.find(f => f.type === 'serialList'),
      openWE:      uploadedFiles.find(f => f.type === 'openWE'),
    };

    let currentRunId: string | null = null;
    try {
      currentRunId = await createRunSkeleton();
      const finalRunId = await parseInvoiceForIngest(currentRunId, fileSnapshot);
      currentRunId = finalRunId;
      const ingestResult = await ingestAndPersistRunData(finalRunId, fileSnapshot);
      if (!ingestResult.allReady) {
        await cleanupFailedIngest(finalRunId);
        setIngestErrors(ingestResult.failedSources);
        return;
      }
      await startWorkflowPhase2(finalRunId);
      navigate(`/run/${encodeURIComponent(finalRunId)}`);
    } catch (error) {
      if (currentRunId) await cleanupFailedIngest(currentRunId);
      setIngestErrors([`Unerwarteter Fehler: ${error instanceof Error ? error.message : String(error)}`]);
    }
  };

  const handleStartProcessing = async () => {
    // Re-check directory configuration from service (not stale React state).
    // The user may have configured the folder via the AppFooter since mount.
    const dirConfigured = isDirectoryConfigured || !!fileSystemService.getDataPath();
    if (!dirConfigured) {
      setShowFolderDialog(true);
      return;
    }
    // Sync local state so the button stays enabled
    if (!isDirectoryConfigured) setIsDirectoryConfigured(true);

    // Ensure folder structure (fire-and-forget, non-blocking)
    fileSystemService.ensureFolderStructure()
      .then(structureReady => {
        if (!structureReady) {
          logService.warn('Ordnerstruktur konnte nicht verifiziert werden', { step: 'System' });
        }
      })
      .catch(err => {
        logService.info(
          `Ordnerstruktur-Prüfung übersprungen: ${err instanceof Error ? err.message : 'Keine Berechtigung'}`,
          { step: 'System' }
        );
      });

    await startNewRun();
  };

  const handleSelectDirectory = async () => {
    const result = await fileSystemService.selectDirectory();
    if (result.success) {
      setIsDirectoryConfigured(true);
      setShowFolderDialog(false);
      await startNewRun();
    }
  };

  return (
    <AppLayout>
      <div className="pt-3 pb-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="mb-1" style={{ color: '#D9D4C7' }}>
            Laden Sie die erforderlichen Dateien hoch und konfigurieren Sie den Import
          </p>
          <h1 className="text-2xl font-bold" style={{ color: '#D8E6E7' }}>
            Neuer Verarbeitungslauf
          </h1>
        </div>

        {/* File Upload Section */}
        <div className="enterprise-card p-6">
          {/* Box Header with Back Button and Title */}
          <div className="flex items-center mb-4">
            <Link to="/">
              <Button size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h2 className="text-lg font-semibold text-foreground flex-1 text-center">
              Datei-Upload
            </h2>
          </div>

          {/* Loading State */}
          {isLoadingFiles && (
            <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground mb-4">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Lade gespeicherte Dateien...</span>
            </div>
          )}

          {/* Upload Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <FileUploadZone
              label="Fattura / Eingangsrechnung (PDF)"
              description="Lieferanten-Rechnung im PDF-Format"
              accept={{ 'application/pdf': ['.pdf'] }}
              fileType="invoice"
              onFileAccepted={(file) => addUploadedFile(file)}
              onFileRemoved={() => removeUploadedFile('invoice')}
              currentFile={invoiceFile}
              required
            />
            <FileUploadZone
              label="offene Bestellungen / offene Wareneingaenge (CSV / XLSX / XML)"
              description="Exportdatei aus Modul *offene Wareneingaenge* — CSV, XLSX, XLS oder XML"
              accept={{
                'text/csv': ['.csv'],
                'application/vnd.ms-excel': ['.xls', '.csv'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                'application/xml': ['.xml'],
                'text/xml': ['.xml'],
              }}
              fileType="openWE"
              onFileAccepted={(file) => addUploadedFile(file)}
              onFileRemoved={() => removeUploadedFile('openWE')}
              currentFile={openWEFile}
              required
            />
            <FileUploadZone
              label="Warenbegleitschein / Seriennummernliste (XLS) — optional"
              description="Datenauszug zur Rechnung aus Italien (ndmatricolek...) — kann spaeter ueber Fehler-Management ergaenzt werden"
              accept={{
                'application/vnd.ms-excel': ['.xls'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
              }}
              fileType="serialList"
              onFileAccepted={(file) => addUploadedFile(file)}
              onFileRemoved={() => removeUploadedFile('serialList')}
              currentFile={serialListFile}
            />
            <FileUploadZone
              label="aktuelle Artikelliste - Sage (XLSX/XML)"
              description="Auszug aus den Artikelstammdaten / aktuell!"
              accept={{
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
                'application/xml': ['.xml'],
                'text/xml': ['.xml']
              }}
              fileType="articleList"
              onFileAccepted={(file) => addUploadedFile(file)}
              onFileRemoved={() => removeUploadedFile('articleList')}
              currentFile={articleListFile}
              required
            />
          </div>

          {/* Box Footer with Hint and Action Button */}
          <div className="flex items-center justify-between pt-4 border-t border-border">
            <div className="flex flex-col gap-1">
              {!requiredFilesUploaded && (
                <p className="text-sm text-muted-foreground">
                  Bitte laden Sie die 3 Pflichtdateien hoch (Rechnung, Artikelliste, offene WE)
                </p>
              )}
              {requiredFilesUploaded && !canStartProcessing && (
                <p className="text-sm text-yellow-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Bitte waehlen Sie ein Datenverzeichnis im Footer
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {uploadedFiles.length > 0 && (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={clearUploadedFiles}
                  className="bg-white text-black border-border hover:bg-[#008C99] hover:text-[#FFFFFF] transition-colors duration-200"
                >
                  <Trash2 className="w-4 h-4" />
                  Uploads leeren
                </Button>
              )}
              <Button
                type="button"
                size="lg"
                className="gap-2"
                disabled={!requiredFilesUploaded || isLocked('start')}
                onClick={wrap('start', handleStartProcessing)}
              >
                <Play className="w-4 h-4" />
                Verarbeitung starten
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Ingest Error Dialog */}
      <AlertDialog open={!!ingestErrors} onOpenChange={(open) => { if (!open) setIngestErrors(null); }}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              Fehler beim Einlesen der Dateien
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">Die Verarbeitung konnte nicht gestartet werden:</p>
                <ul className="list-disc list-inside space-y-1">
                  {ingestErrors?.map((err, i) => (
                    <li key={i} className="text-sm text-red-700">{err}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setIngestErrors(null)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Folder Selection Dialog */}
      <AlertDialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Datenverzeichnis erforderlich
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bevor die Verarbeitung gestartet werden kann, muss ein Datenverzeichnis ausgewaehlt werden.
              Dort werden die Archiv-Dateien und Logs gespeichert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbruch</AlertDialogCancel>
            <AlertDialogAction onClick={handleSelectDirectory}>
              Ordner auswaehlen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

