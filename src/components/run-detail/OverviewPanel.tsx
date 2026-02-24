import { Run } from '@/types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { FileText, Calendar, Settings2, Package, Layers, FolderOpen } from 'lucide-react';
import { useRunStore } from '@/store/runStore';
import { Button } from '@/components/ui/button';

interface OverviewPanelProps {
  run: Run;
}

export function OverviewPanel({ run }: OverviewPanelProps) {
  const { parsedInvoiceResult } = useRunStore();
  const invoiceTotal = run.invoice.invoiceTotal ?? parsedInvoiceResult?.header.invoiceTotal ?? null;

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

      {/* LINK — Archiv-Ordner öffnen */}
      <div className="enterprise-card p-6 lg:col-span-3">
        <h3 className="font-semibold text-foreground mb-3">LINK</h3>
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
          Öffnet die Original-Rechnung
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Öffnet den Archiv-Ordner im Windows Explorer
          {run.archivePath ? ` (${run.archivePath})` : ''}
        </p>
      </div>
    </div>
  );
}
