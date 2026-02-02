import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, FileText, RefreshCw, CheckCircle, Clock } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { logService } from '@/services/logService';

// Hover style constants
const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';
const HOVER_BORDER = '#D8E6E7';

// Interface for export entry
interface ExportEntry {
  id: string;
  name: string;
  type: 'xml' | 'csv' | 'json';
  description: string;
  savedAt: string | null;
  savedLocation: string | null;
}

// LocalStorage key for export history
const EXPORT_HISTORY_KEY = 'falmec-export-history';

// Format date for display
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Default export types
const DEFAULT_EXPORTS: ExportEntry[] = [
  {
    id: 'sage-import',
    name: 'Sage100 Belegimport',
    type: 'xml',
    description: 'XML-Export für Sage100 Belegimport',
    savedAt: null,
    savedLocation: null,
  },
  {
    id: 'invoice-data',
    name: 'Rechnungsdaten',
    type: 'csv',
    description: 'CSV-Export aller Rechnungspositionen',
    savedAt: null,
    savedLocation: null,
  },
  {
    id: 'serial-numbers',
    name: 'Seriennummern',
    type: 'csv',
    description: 'CSV-Export aller zugeordneten Seriennummern',
    savedAt: null,
    savedLocation: null,
  },
  {
    id: 'warehouse-assignments',
    name: 'Lagerplatzzuordnungen',
    type: 'csv',
    description: 'CSV-Export der Lagerplatzzuordnungen',
    savedAt: null,
    savedLocation: null,
  },
  {
    id: 'full-report',
    name: 'Vollständiger Bericht',
    type: 'json',
    description: 'JSON-Export aller Verarbeitungsdaten',
    savedAt: null,
    savedLocation: null,
  },
];

// Load export history from localStorage
function loadExportHistory(): ExportEntry[] {
  try {
    const data = localStorage.getItem(EXPORT_HISTORY_KEY);
    if (data) {
      const saved = JSON.parse(data);
      // Merge with defaults to ensure all export types exist
      return DEFAULT_EXPORTS.map(def => {
        const savedEntry = saved.find((s: ExportEntry) => s.id === def.id);
        return savedEntry ? { ...def, savedAt: savedEntry.savedAt, savedLocation: savedEntry.savedLocation } : def;
      });
    }
  } catch {
    // Ignore errors
  }
  return DEFAULT_EXPORTS;
}

// Save export history to localStorage
function saveExportHistory(exports: ExportEntry[]): void {
  localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(exports));
}

// Generate mock export content
function generateExportContent(exportEntry: ExportEntry): string {
  const timestamp = new Date().toISOString();

  switch (exportEntry.type) {
    case 'xml':
      return `<?xml version="1.0" encoding="UTF-8"?>
<BelegImport>
  <Kopfdaten>
    <Erstellungsdatum>${timestamp}</Erstellungsdatum>
    <ExportTyp>${exportEntry.name}</ExportTyp>
  </Kopfdaten>
  <Positionen>
    <!-- Hier werden die Positionen eingefügt -->
  </Positionen>
</BelegImport>`;
    case 'csv':
      return `"Spalte1";"Spalte2";"Spalte3";"Zeitstempel"
"Wert1";"Wert2";"Wert3";"${timestamp}"`;
    case 'json':
      return JSON.stringify({
        exportType: exportEntry.name,
        createdAt: timestamp,
        data: {
          message: 'Export-Daten werden hier eingefügt'
        }
      }, null, 2);
    default:
      return '';
  }
}

export default function Export() {
  const [exports, setExports] = useState<ExportEntry[]>(() => loadExportHistory());
  const [isSaveHovered, setIsSaveHovered] = useState<string | null>(null);
  const [isRefreshHovered, setIsRefreshHovered] = useState(false);

  // Save a specific export
  const handleSaveExport = (exportEntry: ExportEntry) => {
    const content = generateExportContent(exportEntry);
    const mimeType = exportEntry.type === 'xml' ? 'text/xml' :
                     exportEntry.type === 'json' ? 'application/json' : 'text/csv';
    const extension = exportEntry.type;
    const fileName = `${exportEntry.id}_${Date.now()}.${extension}`;

    // Create download
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Update export history
    const now = new Date().toISOString();
    const updatedExports = exports.map(e =>
      e.id === exportEntry.id
        ? { ...e, savedAt: now, savedLocation: `Downloads/${fileName}` }
        : e
    );
    setExports(updatedExports);
    saveExportHistory(updatedExports);

    // Log the export
    logService.info(`Export gespeichert: ${exportEntry.name}`, {
      step: 'Export',
      details: `Datei: ${fileName}`,
    });
  };

  // Refresh data
  const refreshData = () => {
    setExports(loadExportHistory());
  };

  return (
    <AppLayout>
      <div className="pt-3 pb-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="mb-1" style={{ color: '#D9D4C7' }}>
            Übersicht aller verfügbaren Exporte
          </p>
          <h1 className="text-2xl font-bold flex items-center justify-center gap-3" style={{ color: '#D8E6E7' }}>
            <Download className="w-7 h-7" />
            Export
          </h1>
        </div>

        {/* Content */}
        <div className="enterprise-card">
          {/* Box Header */}
          <div className="p-4 border-b border-border flex items-center">
            <Link to="/">
              <Button size="icon" variant="ghost" title="Zurück zum Dashboard Wareneingang">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h2 className="text-lg font-semibold text-foreground flex-1 text-center">
              Verfügbare Exporte
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
                <TableHead>Export-Typ</TableHead>
                <TableHead>Beschreibung</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Zuletzt gespeichert</TableHead>
                <TableHead>Speicherort</TableHead>
                <TableHead className="text-right">Aktion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exports.map((exportEntry) => (
                <TableRow key={exportEntry.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      {exportEntry.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {exportEntry.description}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted">
                      .{exportEntry.type.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell>
                    {exportEntry.savedAt ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        <span className="text-sm">{formatDate(exportEntry.savedAt)}</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="text-sm">Noch nicht gespeichert</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground truncate max-w-[150px] block">
                      {exportEntry.savedLocation || '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => handleSaveExport(exportEntry)}
                        onMouseEnter={() => setIsSaveHovered(exportEntry.id)}
                        onMouseLeave={() => setIsSaveHovered(null)}
                        className="h-7 px-3 text-xs rounded-md flex items-center gap-1.5 transition-all duration-200 border"
                        style={{
                          backgroundColor: isSaveHovered === exportEntry.id ? HOVER_BG : '#c9c3b6',
                          color: isSaveHovered === exportEntry.id ? HOVER_TEXT : '#666666',
                          borderColor: isSaveHovered === exportEntry.id ? HOVER_BORDER : '#666666',
                        }}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {exportEntry.savedAt ? 'Erneut speichern' : 'Speichern'}
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AppLayout>
  );
}
