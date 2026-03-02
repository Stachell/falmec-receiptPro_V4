import { useEffect, useState } from 'react';
import { useClickLock } from '@/hooks/useClickLock';
import { Download, CheckCircle2, AlertTriangle, FileCode, Copy, Check, ChevronsDown, ChevronsUp } from 'lucide-react';
import { format } from 'date-fns';
import { Run } from '@/types';
import type { ExportColumnKey } from '@/types';
import { useRunStore } from '@/store/runStore';
import { useExportConfigStore } from '@/store/exportConfigStore';
import { Button } from '@/components/ui/button';

interface ExportPanelProps {
  run: Run;
}

export function ExportPanel({ run }: ExportPanelProps) {
  const { invoiceLines: allInvoiceLines, issues } = useRunStore();
  // HOTFIX-1: Filter lines to current run only (uses run prop — always available)
  const invoiceLines = allInvoiceLines.filter(l => l.lineId.startsWith(`${run.id}-line-`));
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [expandedXml, setExpandedXml] = useState(false);
  const { wrap, isLocked } = useClickLock();

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
  const isExportReady = openBlockingIssues.length === 0 && missingLocations.length === 0;

  const exportFileName = `Fattura-${run.invoice.fattura.replace(/[^a-zA-Z0-9]/g, '')}_${format(new Date(), 'dd-MM-yyyy')}-${run.config.eingangsart}.xml`;

  // PROJ-35: Read configured column order
  const columnOrder = useExportConfigStore((s) => s.columnOrder);

  /** Map a columnKey to its XML tag name + value for a given line */
  const resolveColumn = (key: ExportColumnKey, line: typeof invoiceLines[number]): { tag: string; value: string } => {
    switch (key) {
      case 'manufacturerArticleNo': return { tag: 'ManufacturerArticleNo', value: line.manufacturerArticleNo };
      case 'ean':                   return { tag: 'EAN', value: line.ean };
      case 'falmecArticleNo':       return { tag: 'FalmecArticleNo', value: line.falmecArticleNo || '' };
      case 'descriptionDE':         return { tag: 'DescriptionDE', value: line.descriptionDE || '' };
      case 'descriptionIT':         return { tag: 'DescriptionIT', value: line.descriptionIT };
      case 'supplierId':            return { tag: 'Lieferant', value: line.supplierId || '' };
      case 'unitPriceInvoice':      return { tag: 'UnitPrice', value: String(line.unitPriceInvoice) };
      case 'unitPriceOrder':        return { tag: 'UnitPriceOrder', value: String(line.unitPriceSage ?? '') };
      case 'totalPrice':            return { tag: 'TotalPrice', value: String(line.totalLineAmount) };
      case 'orderNumberAssigned':   return { tag: 'OrderNumber', value: line.orderNumberAssigned || '' };
      case 'orderDate':             return { tag: 'OrderDate', value: line.orderYear ? String(line.orderYear) : '' };
      case 'serialNumber':          return { tag: 'SerialNumber', value: line.serialNumber || '' };
      case 'storageLocation':       return { tag: 'StorageLocation', value: line.storageLocation || '' };
      case 'orderVorgang':          return { tag: 'Vorgang', value: line.orderVorgang || '' };
      case 'fattura':               return { tag: 'Fattura', value: run.invoice.fattura };
    }
  };

  // Generate XML preview with configured column order
  const xmlPreview = `<?xml version="1.0" encoding="UTF-8"?>
<Sage100Import>
  <Header>
    <Fattura>${run.invoice.fattura}</Fattura>
    <InvoiceDate>${run.invoice.invoiceDate}</InvoiceDate>
    <DeliveryDate>${run.invoice.deliveryDate || ''}</DeliveryDate>
    <Eingangsart>${run.config.eingangsart}</Eingangsart>
    <CreatedAt>${new Date().toISOString()}</CreatedAt>
  </Header>
  <Items>
${invoiceLines.map(line => {
    const fields = columnOrder.map(col => {
      const { tag, value } = resolveColumn(col.columnKey, line);
      return `      <${tag}>${value}</${tag}>`;
    }).join('\n');
    return `    <Item>\n${fields}\n    </Item>`;
  }).join('\n')}
  </Items>
</Sage100Import>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(xmlPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    setDownloading(true);
    const blob = new Blob([xmlPreview], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName;
    a.click();
    URL.revokeObjectURL(url);

    // PROJ-35: Write export diagnostics
    useExportConfigStore.getState().setLastDiagnostics({
      timestamp: new Date().toISOString(),
      fileName: exportFileName,
      lineCount: invoiceLines.length,
      status: 'success',
    });

    setTimeout(() => setDownloading(false), 1000);
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
          <h3 className="font-semibold text-foreground">Export-Datei</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Dateiname</label>
            <p className="font-mono text-sm bg-surface-sunken px-3 py-2 rounded mt-1">
              {exportFileName}
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

      {/* Export Button */}
      <div className="flex justify-end">
        <Button 
          size="lg" 
          className="gap-2"
          disabled={!isExportReady || downloading || isLocked('xml-export')}
          onClick={wrap('xml-export', handleDownload)}
        >
          <Download className="w-4 h-4" />
          {downloading ? 'Wird exportiert...' : 'XML exportieren'}
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
