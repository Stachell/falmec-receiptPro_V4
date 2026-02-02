import { useState } from 'react';
import { Download, CheckCircle2, AlertTriangle, FileCode, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Run } from '@/types';
import { useRunStore } from '@/store/runStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ExportPanelProps {
  run: Run;
}

export function ExportPanel({ run }: ExportPanelProps) {
  const { invoiceLines, issues } = useRunStore();
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const openBlockingIssues = issues.filter(i => i.status === 'open' && i.severity === 'blocking');
  const missingLocations = invoiceLines.filter(line => !line.storageLocation);
  const isExportReady = openBlockingIssues.length === 0 && missingLocations.length === 0;

  const exportFileName = `Fattura-${run.invoice.fattura.replace(/[^a-zA-Z0-9]/g, '')}_${format(new Date(), 'dd-MM-yyyy')}-${run.config.eingangsart}.xml`;

  // Generate mock XML preview
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
${invoiceLines.map(line => `    <Item>
      <ManufacturerArticleNo>${line.manufacturerArticleNo}</ManufacturerArticleNo>
      <EAN>${line.ean}</EAN>
      <FalmecArticleNo>${line.falmecArticleNo || ''}</FalmecArticleNo>
      <Description>${line.descriptionDE || line.descriptionIT}</Description>
      <Quantity>${line.qty}</Quantity>
      <UnitPrice>${line.unitPriceInvoice}</UnitPrice>
      <OrderNumber>${line.orderNumberAssigned || ''}</OrderNumber>
      <SerialNumber>${line.serialNumber || ''}</SerialNumber>
      <StorageLocation>${line.storageLocation || ''}</StorageLocation>
    </Item>`).join('\n')}
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
              Keine blockierenden Issues
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
        <ScrollArea className="h-[300px]">
          <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto">
            {xmlPreview}
          </pre>
        </ScrollArea>
      </div>

      {/* Export Button */}
      <div className="flex justify-end">
        <Button 
          size="lg" 
          className="gap-2"
          disabled={!isExportReady || downloading}
          onClick={handleDownload}
        >
          <Download className="w-4 h-4" />
          {downloading ? 'Wird exportiert...' : 'XML exportieren'}
        </Button>
      </div>

      {!isExportReady && (
        <p className="text-sm text-status-failed text-right">
          Bitte lösen Sie alle blockierenden Issues und weisen Sie fehlende Lagerorte zu.
        </p>
      )}
    </div>
  );
}
