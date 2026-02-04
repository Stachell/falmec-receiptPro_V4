import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, AlertTriangle, FolderOpen } from 'lucide-react';
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
  const { uploadedFiles, addUploadedFile, removeUploadedFile, createNewRunWithParsing } = useRunStore();
  const [showFolderDialog, setShowFolderDialog] = useState(false);
  const [isDirectoryConfigured, setIsDirectoryConfigured] = useState(false);

  const invoiceFile = uploadedFiles.find(f => f.type === 'invoice');
  const openWEFile = uploadedFiles.find(f => f.type === 'openWE');
  const serialListFile = uploadedFiles.find(f => f.type === 'serialList');
  const articleListFile = uploadedFiles.find(f => f.type === 'articleList');

  const allFilesUploaded = invoiceFile && openWEFile && serialListFile && articleListFile;
  const canStartProcessing = allFilesUploaded && isDirectoryConfigured;

  // Check if directory is configured on mount
  useEffect(() => {
    const path = fileSystemService.getDataPath();
    setIsDirectoryConfigured(!!path);
  }, []);

  const handleStartProcessing = async () => {
    // Check if folder structure is configured
    if (!isDirectoryConfigured) {
      setShowFolderDialog(true);
      return;
    }

    // Ensure folder structure exists
    const structureReady = await fileSystemService.ensureFolderStructure();
    if (!structureReady) {
      logService.warn('Ordnerstruktur konnte nicht verifiziert werden', { step: 'System' });
    }

    // Use parsing-enabled run creation
    const newRun = await createNewRunWithParsing();
    navigate(`/run/${newRun.id}`);
  };

  const handleSelectDirectory = async () => {
    const result = await fileSystemService.selectDirectory();
    if (result.success) {
      setIsDirectoryConfigured(true);
      setShowFolderDialog(false);
      // Now start processing with PDF parsing
      const newRun = await createNewRunWithParsing();
      navigate(`/run/${newRun.id}`);
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
              label="offene Bestellungen / offene Wareneingänge (CSV)"
              description="Exportdatei aus Modul *offene Wareneingänge*"
              accept={{ 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'] }}
              fileType="openWE"
              onFileAccepted={(file) => addUploadedFile(file)}
              onFileRemoved={() => removeUploadedFile('openWE')}
              currentFile={openWEFile}
              required
            />
            <FileUploadZone
              label="Warenbegleitschein / Seriennummernliste (XLS)"
              description="Datenauszug zur Rechnung aus Italien (ndmatricolek...)"
              accept={{
                'application/vnd.ms-excel': ['.xls'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
              }}
              fileType="serialList"
              onFileAccepted={(file) => addUploadedFile(file)}
              onFileRemoved={() => removeUploadedFile('serialList')}
              currentFile={serialListFile}
              required
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
              {!allFilesUploaded && (
                <p className="text-sm text-muted-foreground">
                  Bitte laden Sie alle erforderlichen Dateien hoch
                </p>
              )}
              {allFilesUploaded && !isDirectoryConfigured && (
                <p className="text-sm text-yellow-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Bitte wählen Sie ein Datenverzeichnis im Footer
                </p>
              )}
            </div>
            <Button
              size="lg"
              className="gap-2"
              disabled={!allFilesUploaded}
              onClick={handleStartProcessing}
            >
              <Play className="w-4 h-4" />
              Verarbeitung starten
            </Button>
          </div>
        </div>
      </div>

      {/* Folder Selection Dialog */}
      <AlertDialog open={showFolderDialog} onOpenChange={setShowFolderDialog}>
        <AlertDialogContent style={{ backgroundColor: '#D8E6E7' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Datenverzeichnis erforderlich
            </AlertDialogTitle>
            <AlertDialogDescription>
              Bevor die Verarbeitung gestartet werden kann, muss ein Datenverzeichnis ausgewählt werden.
              Dort werden die Archiv-Dateien und Logs gespeichert.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbruch</AlertDialogCancel>
            <AlertDialogAction onClick={handleSelectDirectory}>
              Ordner auswählen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
