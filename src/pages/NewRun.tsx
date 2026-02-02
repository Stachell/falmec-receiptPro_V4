import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { FileUploadZone } from '@/components/FileUploadZone';
import { Button } from '@/components/ui/button';
import { useRunStore } from '@/store/runStore';
import { Link } from 'react-router-dom';

export default function NewRun() {
  const navigate = useNavigate();
  const { uploadedFiles, addUploadedFile, removeUploadedFile, createNewRun } = useRunStore();

  const invoiceFile = uploadedFiles.find(f => f.type === 'invoice');
  const openWEFile = uploadedFiles.find(f => f.type === 'openWE');
  const serialListFile = uploadedFiles.find(f => f.type === 'serialList');
  const articleListFile = uploadedFiles.find(f => f.type === 'articleList');

  const canStartProcessing = invoiceFile && openWEFile && serialListFile && articleListFile;

  const handleStartProcessing = () => {
    const newRun = createNewRun();
    navigate(`/run/${newRun.id}`);
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
            {!canStartProcessing ? (
              <p className="text-sm text-muted-foreground">
                Bitte laden Sie alle erforderlichen Dateien hoch
              </p>
            ) : (
              <div></div>
            )}
            <Button
              size="lg"
              className="gap-2"
              disabled={!canStartProcessing}
              onClick={handleStartProcessing}
            >
              <Play className="w-4 h-4" />
              Verarbeitung starten
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
