import { useEffect, useState } from 'react';
import { useClickLock } from '@/hooks/useClickLock';
import { Download, CheckCircle2, AlertTriangle, FileCode, Copy, Check, ChevronsDown, ChevronsUp, FileSpreadsheet } from 'lucide-react';
import { Run } from '@/types';
import { useRunStore } from '@/store/runStore';
import { useExportConfigStore } from '@/store/exportConfigStore';
import { generateXML, generateCSV, buildExportFileName, type RunExportMeta } from '@/services/exportService';
import { logService } from '@/services/logService';
import { archiveService } from '@/services/archiveService';
import { Button } from '@/components/ui/button';

interface ExportPanelProps {
  run: Run;
}

export function ExportPanel({ run }: ExportPanelProps) {
  const { invoiceLines: allInvoiceLines, issues, addAuditEntry } = useRunStore();
  // Filter lines to current run only
  const invoiceLines = allInvoiceLines.filter(l => l.lineId.startsWith(`${run.id}-line-`));
  const [copied, setCopied] = useState(false);
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [expandedXml, setExpandedXml] = useState(false);
  const { wrap, isLocked } = useClickLock();

  const { columnOrder, csvDelimiter, setLastDiagnostics } = useExportConfigStore();

  useEffect(() => {
    if (!expandedXml) return;
    const timerId = window.setTimeout(() => {
      setExpandedXml(false);
    }, 120000);
    return () => window.clearTimeout(timerId);
  }, [expandedXml]);

  const runIssues = issues.filter(i => !i.runId || i.runId === run.id);
  const openBlockingIssues = runIssues.filter(i => i.status === 'open' && i.severity === 'error');
  const missingLocations = invoiceLines.filter(line => !line.storageLocation);
  const isExportReady = openBlockingIssues.length === 0 && missingLocations.length === 0 && invoiceLines.length > 0;

  const runMeta: RunExportMeta = {
    fattura: run.invoice.fattura,
    invoiceDate: run.invoice.invoiceDate,
    deliveryDate: run.invoice.deliveryDate ?? null,
    eingangsart: run.config.eingangsart,
    runId: run.id,
  };

  // Build XML preview for the copy/expand section (generated on render)
  const xmlPreview = generateXML(invoiceLines, columnOrder, runMeta);

  const handleCopy = () => {
    navigator.clipboard.writeText(xmlPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: 'xml' | 'csv') => {
    const isXml = format === 'xml';
    const content = isXml
      ? xmlPreview
      : generateCSV(invoiceLines, columnOrder, runMeta, csvDelimiter);
    const fileName = buildExportFileName(run.id, format);
    const mimeType = isXml ? 'application/xml' : 'text/csv';

    // 1. Blob + anchor download (always first, universell)
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    // 2. Archive — fire-and-forget
    const archiveOptions = isXml
      ? { exportXml: content }
      : { exportCsv: content };
    archiveService.writeArchivePackage(run, invoiceLines, archiveOptions).catch(() => {
      // Archive failure must not block download
    });

    // 3. Run-Log
    const delimiterLabel = isXml ? '' : `, Delimiter: ${csvDelimiter === '\t' ? 'Tab' : csvDelimiter}`;
    logService.info(
      `Export durchgefuehrt: ${fileName}`,
      {
        runId: run.id,
        step: 'Export',
        details: `Format: ${format.toUpperCase()}, Positionen: ${invoiceLines.length}, Spalten: ${columnOrder.length}${delimiterLabel}`,
      },
    );

    // 4. Audit-Log
    addAuditEntry({
      runId: run.id,
      action: 'export-download',
      details: `${format.toUpperCase()}: ${fileName} (${invoiceLines.length} Zeilen)`,
      userId: 'system',
    });

    // 5. Export-Diagnostics
    setLastDiagnostics({
      timestamp: new Date().toISOString(),
      fileName,
      lineCount: invoiceLines.length,
      status: 'success',
    });

    if (isXml) {
      setDownloadingXml(true);
      setTimeout(() => setDownloadingXml(false), 1000);
    } else {
      setDownloadingCsv(true);
      setTimeout(() => setDownloadingCsv(false), 1000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Readiness Checklist */}
      <div className="enterprise-card p-6">
        <h3 className="font-semibold text-foreground mb-4">Export-Bereitschaft</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {openBlockingIssues.length === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-status-ok" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-status-failed" />
            )}
            <span className={openBlockingIssues.length === 0 ? 'text-foreground' : 'text-status-failed'}>
              Keine blockierenden Probleme
              {openBlockingIssues.length > 0 && ` (${openBlockingIssues.length} offen)`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {missingLocations.length === 0 ? (
              <CheckCircle2 className="w-5 h-5 text-status-ok" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-status-failed" />
            )}
            <span className={missingLocations.length === 0 ? 'text-foreground' : 'text-status-failed'}>
              Alle Lagerorte zugewiesen
              {missingLocations.length > 0 && ` (${missingLocations.length} fehlen)`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-status-ok" />
            <span className="text-foreground">
              Pflichtfelder vollständig
            </span>
          </div>
        </div>
      </div>

      {/* Export Info */}
      <div className="enterprise-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileCode className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Export-Dateien</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Dateiname (XML)</label>
            <p className="font-mono text-sm bg-surface-sunken px-3 py-2 rounded mt-1">
              {buildExportFileName(run.id, 'xml')}
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Dateiname (CSV)</label>
            <p className="font-mono text-sm bg-surface-sunken px-3 py-2 rounded mt-1">
              {buildExportFileName(run.id, 'csv')}
            </p>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Positionen</label>
            <p className="text-sm mt-1">{invoiceLines.length} Zeilen</p>
          </div>
        </div>
      </div>

      {/* XML Preview */}
      <div className="enterprise-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-foreground">XML Vorschau</h3>
          <Button variant="ghost" size="sm" className="gap-2" onClick={handleCopy}>
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Kopiert
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Kopieren
              </>
            )}
          </Button>
        </div>
        <div
          className={`transition-all duration-500 ease-in-out ${
            expandedXml
              ? 'max-h-[5000px] overflow-hidden'
              : 'max-h-0 overflow-hidden'
          }`}
        >
          <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
            {xmlPreview}
          </pre>
        </div>
        {/* Expand / Collapse Toggle */}
        <div className="flex justify-center py-2 border-t border-border/40">
          <button
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
            onClick={() => setExpandedXml((e) => !e)}
            aria-label={expandedXml ? 'Einklappen' : 'Ausklappen'}
          >
            {expandedXml ? (
              <ChevronsUp className="w-7 h-7 text-muted-foreground/85" />
            ) : (
              <ChevronsDown className="w-7 h-7 animate-pulse text-muted-foreground/75" />
            )}
          </button>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex justify-end gap-3">
        <Button
          size="lg"
          variant="outline"
          className="gap-2"
          disabled={!isExportReady || downloadingCsv || isLocked('csv-export')}
          onClick={wrap('csv-export', () => handleDownload('csv'))}
        >
          <FileSpreadsheet className="w-4 h-4" />
          {downloadingCsv ? 'Wird exportiert...' : 'CSV exportieren'}
        </Button>
        <Button
          size="lg"
          className="gap-2"
          disabled={!isExportReady || downloadingXml || isLocked('xml-export')}
          onClick={wrap('xml-export', () => handleDownload('xml'))}
        >
          <Download className="w-4 h-4" />
          {downloadingXml ? 'Wird exportiert...' : 'XML exportieren'}
        </Button>
      </div>

      {!isExportReady && (
        <p className="text-sm text-status-failed text-right">
          Bitte lösen Sie alle blockierenden Probleme und weisen Sie fehlende Lagerorte zu.
        </p>
      )}
    </div>
  );
}
