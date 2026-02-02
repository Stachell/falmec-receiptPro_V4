import { Run } from '@/types';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { FileText, Calendar, Hash, Settings2, Clock } from 'lucide-react';
import { mockAuditLog } from '@/data/mockData';

interface OverviewPanelProps {
  run: Run;
}

export function OverviewPanel({ run }: OverviewPanelProps) {
  const auditEntries = mockAuditLog.filter(entry => entry.runId === run.id);

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

      {/* Audit Log - Full Width */}
      <div className="enterprise-card p-6 lg:col-span-3">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">Aktivitätsprotokoll</h3>
        </div>
        {auditEntries.length > 0 ? (
          <div className="space-y-3">
            {auditEntries.map((entry) => (
              <div 
                key={entry.id} 
                className="flex items-start gap-4 p-3 bg-surface-sunken rounded-lg"
              >
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.timestamp), 'HH:mm:ss', { locale: de })}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">
                    {entry.action}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {entry.details}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {entry.userId === 'system' ? 'System' : 'Benutzer'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Keine Aktivitäten protokolliert.
          </p>
        )}
      </div>
    </div>
  );
}
