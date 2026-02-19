import { InvoiceLine } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusCheckbox } from './StatusCheckbox';

interface DetailPopupProps {
  line: InvoiceLine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatPrice = (price: number | null | undefined): string => {
  if (price == null) return '--';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);
};

const PRICE_STATUS_LABELS: Record<string, string> = {
  pending: 'Preis-Check folgt',
  ok: 'OK',
  mismatch: 'PRUEFEN',
  missing: 'fehlt',
  custom: 'angepasst',
};

interface FieldDef {
  label: string;
  value: (line: InvoiceLine) => React.ReactNode;
  mono?: boolean;
}

const FIELDS: FieldDef[] = [
  { label: 'Artikel-# (DE)',    value: l => l.falmecArticleNo,        mono: true },
  { label: 'Artikel-# (IT)',    value: l => l.manufacturerArticleNo,  mono: true },
  { label: 'EAN',               value: l => l.ean,                    mono: true },
  { label: 'Bezeichnung (DE)',  value: l => l.descriptionDE },
  { label: 'Bezeichnung (IT)',  value: l => l.descriptionIT },
  { label: 'Menge',             value: l => l.qty },
  { label: 'Preis (Rechnung)',  value: l => formatPrice(l.unitPriceInvoice) },
  { label: 'Preis (Sage)',      value: l => formatPrice(l.unitPriceSage) },
  { label: 'Preis (Final)',     value: l => formatPrice(l.unitPriceFinal) },
  { label: 'Lieferant',         value: l => l.supplierId,             mono: true },
  { label: 'EK-Vorgang',        value: l => l.orderVorgang },
  { label: 'Bestellmenge (offen)', value: l => l.orderOpenQty },
  { label: 'Bestellnummer',     value: l => l.orderNumberAssigned },
  { label: 'Seriennummer',      value: l => l.serialNumber },
  { label: 'Lagerort',          value: l => l.storageLocation },
  {
    label: 'Match-Status',
    value: l => <StatusCheckbox status={l.matchStatus} />,
  },
  {
    label: 'Preis-Status',
    value: l => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        l.priceCheckStatus === 'ok' ? 'bg-green-100 text-green-700' :
        l.priceCheckStatus === 'mismatch' ? 'bg-yellow-100 text-yellow-700' :
        l.priceCheckStatus === 'missing' ? 'bg-red-100 text-red-700' :
        l.priceCheckStatus === 'custom' ? 'bg-blue-100 text-blue-700' :
        'bg-gray-100 text-gray-600'
      }`}>
        {PRICE_STATUS_LABELS[l.priceCheckStatus] ?? l.priceCheckStatus}
      </span>
    ),
  },
];

export function DetailPopup({ line, open, onOpenChange }: DetailPopupProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Artikeldetails</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-2">
          {FIELDS.map(({ label, value, mono }) => {
            const rendered = value(line);
            const display = rendered == null || rendered === '' ? '--' : rendered;
            return (
              <div key={label}>
                <dt className="text-xs" style={{ color: '#E3E0CF' }}>{label}</dt>
                <dd className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>
                  {display}
                </dd>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
