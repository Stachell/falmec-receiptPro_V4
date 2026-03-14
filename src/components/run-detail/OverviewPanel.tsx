import { Run } from '@/types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar, Eye, FileText, FolderOpen, Layers, Package, Settings2 } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { Button } from '@/components/ui/button';

interface OverviewPanelProps {
  run: Run;
}

export function OverviewPanel({ run }: OverviewPanelProps) {
  const { parsedInvoiceResult, uploadedFiles } = useRunStore();
  const invoiceTotal = run.invoice.invoiceTotal ?? parsedInvoiceResult?.header.invoiceTotal ?? null;

  const invoiceFile = uploadedFiles.find(f => f.type === 'invoice');
  const openWEFile  = uploadedFiles.find(f => f.type === 'openWE');
  const openFileInNewTab = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Invoice Details */}
      <div className="enterprise-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Rechnungsdetails</h3>
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Rechnungsnummer</dt>
            <dd className="text-sm font-medium font-mono">{run.invoice.fattura}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Rechnungsdatum</dt>
            <dd className="text-sm font-medium">
              {format(new Date(run.invoice.invoiceDate), 'dd.MM.yyyy', { locale: de })}
            </dd>
          </div>
          {run.invoice.deliveryDate && (
            <div>
              <dt className="text-sm text-muted-foreground">Lieferdatum</dt>
              <dd className="text-sm font-medium">
                {format(new Date(run.invoice.deliveryDate), 'dd.MM.yyyy', { locale: de })}
              </dd>
            </div>
          )}
          <div className="flex gap-4 pt-2 border-t border-border mt-2">
            <div>
              <dt className="text-sm text-muted-foreground flex items-center gap-1">
                <Package className="w-3 h-3" />
                Pakete
              </dt>
              <dd className="text-sm font-medium">
                {run.invoice.packagesCount ??
                 parsedInvoiceResult?.header.packagesCount ??
                 <span className="text-muted-foreground">n/a</span>}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Gesamtmenge
              </dt>
              <dd className="text-sm font-medium">
                {run.invoice.totalQty ??
                 parsedInvoiceResult?.header.totalQty ??
                 run.stats.parsedInvoiceLines}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Rechnungssumme</dt>
              <dd className="text-sm font-medium">
                {typeof invoiceTotal === 'number'
                  ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(invoiceTotal)
                  : <span className="text-muted-foreground">n/a</span>}
              </dd>
            </div>
          </div>
        </dl>
      </div>

      {/* Configuration */}
      <div className="enterprise-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Konfiguration</h3>
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Preisbasis</dt>
            <dd className="text-sm font-medium">
              {run.config.priceBasis === 'Net' ? 'Netto' : 'Brutto'} / {run.config.priceType}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Preistoleranz</dt>
            <dd className="text-sm font-medium">±{run.config.tolerance.toFixed(2)} EUR</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Eingangsart</dt>
            <dd className="text-sm font-medium">{run.config.eingangsart}</dd>
          </div>
        </dl>
      </div>

      {/* Processing Info */}
      <div className="enterprise-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Verarbeitung</h3>
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-sm text-muted-foreground">Lauf-ID</dt>
            <dd className="text-sm font-medium font-mono">{run.id}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Gestartet</dt>
            <dd className="text-sm font-medium">
              {format(new Date(run.createdAt), "dd.MM.yyyy HH:mm 'Uhr'", { locale: de })}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Aktuelle Phase</dt>
            <dd className="text-sm font-medium">
              {run.steps.find(s => s.status === 'running')?.name || 
               run.steps.find(s => s.status !== 'ok' && s.status !== 'not-started')?.name ||
               'Abgeschlossen'}
            </dd>
          </div>
        </dl>
      </div>

      {/* LINK — Dokumente & Archiv */}
      <div className="enterprise-card p-6 lg:col-span-3">
        <h3 className="font-semibold text-foreground mb-3">LINK</h3>

        {/* --- Button 1: Original-Rechnung --- */}
        <div>
          <Button
            variant="outline"
            style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
            disabled={!invoiceFile}
            onClick={() => invoiceFile && openFileInNewTab(invoiceFile.file)}
          >
            <Eye className="w-4 h-4 mr-2" />
            Original-Rechnung öffnen
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Öffnet die Original-Rechnung im Browser
          </p>
        </div>

        {/* --- Button 2: Warenbegleitschein --- */}
        <div className="mt-3">
          <Button
            variant="outline"
            style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
            disabled={!openWEFile}
            onClick={() => openWEFile && openFileInNewTab(openWEFile.file)}
          >
            <Eye className="w-4 h-4 mr-2" />
            Warenbegleitschein öffnen
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Öffnet den Lieferschein im Browser
          </p>
        </div>

        {/* --- Button 3: Archiv im Explorer --- */}
        <div className="mt-3">
          <Button
            variant="outline"
            style={{ backgroundColor: '#c9c3b6', borderColor: '#666666', color: '#666666' }}
            onClick={() => {
              const subfolder = run.archivePath;
              const url = subfolder
                ? `/api/dev/open-folder?subfolder=${encodeURIComponent(subfolder)}`
                : '/api/dev/open-folder';
              fetch(url);
            }}
          >
            <FolderOpen className="w-4 h-4 mr-2" />
            Archiv im Explorer öffnen
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            Öffnet den Archiv-Ordner im Windows Explorer
            {run.archivePath ? ` (${run.archivePath})` : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
