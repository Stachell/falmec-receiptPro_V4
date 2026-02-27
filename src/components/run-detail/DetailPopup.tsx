/**
 * DetailPopup — PROJ-22 Phase B3
 *
 * Redesigned with:
 * - Inverted color scheme (dark background, light text)
 * - New field order per spec
 * - S/N Dropdown when serialNumbers.length > 1
 * - "Schliessen" link at bottom right
 */

import { useState } from 'react';
import { InvoiceLine } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusCheckbox } from './StatusCheckbox';
import { PendingHourglassIcon } from './PendingHourglassIcon';

interface DetailPopupProps {
  line: InvoiceLine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formatPrice = (price: number | null | undefined): string | null => {
  if (price == null) return null;
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);
};

const PRICE_STATUS_LABELS: Record<string, string> = {
  pending: 'Preis-Check folgt',
  ok: 'OK',
  mismatch: 'check',
  missing: 'fehlt',
  custom: 'angepasst',
};

interface FieldRow {
  label: string;
  value: (line: InvoiceLine, selectedSN?: string) => React.ReactNode;
  mono?: boolean;
  /** If true, this is a special S/N row rendered differently */
  isSnRow?: boolean;
}

/** PROJ-22 B3: New field order per spec */
const FIELDS: FieldRow[] = [
  { label: 'Art.-Nr.',               value: l => l.falmecArticleNo,        mono: true },
  { label: 'Herstellerartikelnr.',   value: l => l.manufacturerArticleNo,  mono: true },
  { label: 'EAN',                    value: l => l.ean,                    mono: true },
  { label: 'Menge',                  value: l => l.qty },
  { label: 'Bezeichnung (DE)',       value: l => l.descriptionDE },
  { label: 'Bezeichnung (IT)',       value: l => l.descriptionIT },
  { label: 'Preis (Sage)',           value: l => formatPrice(l.unitPriceSage) },
  { label: 'Preis (Rechnung)',       value: l => formatPrice(l.unitPriceInvoice) },
  { label: 'Bestellmenge (offen)',   value: l => l.orderOpenQty },
  { label: 'Preis (Final)',          value: l => formatPrice(l.unitPriceFinal) },
  { label: 'Bestellnummer',         value: l => l.orderNumberAssigned,    mono: true },
  // S/N row is rendered separately below (dropdown when >1)
  { label: 'Seriennummer',          value: (_l, selectedSN) => selectedSN ?? null, mono: true, isSnRow: true },
  { label: 'Lagerort',              value: l => l.storageLocation,        mono: true },
  {
    label: 'Match-Status',
    value: l => <StatusCheckbox status={l.matchStatus} />,
  },
  {
    label: 'Preis-Status',
    value: l => (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        l.priceCheckStatus === 'ok' ? 'bg-green-700/30 text-green-300' :
        l.priceCheckStatus === 'mismatch' ? 'bg-yellow-700/30 text-yellow-300' :
        l.priceCheckStatus === 'missing' ? 'bg-red-700/30 text-red-300' :
        l.priceCheckStatus === 'custom' ? 'bg-blue-700/30 text-blue-300' :
        'bg-gray-700/30 text-gray-400'
      }`}>
        {PRICE_STATUS_LABELS[l.priceCheckStatus] ?? l.priceCheckStatus}
      </span>
    ),
  },
];

export function DetailPopup({ line, open, onOpenChange }: DetailPopupProps) {
  // PROJ-22 B3: S/N Dropdown state — only shown when serialNumbers.length > 1
  const hasMultipleSN = (line.serialNumbers?.length ?? 0) > 1;
  const defaultSN = line.serialNumbers?.[0] ?? line.serialNumber ?? '';
  const [selectedSN, setSelectedSN] = useState<string>(defaultSN);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        /* PROJ-22 B3: Invertierte Farben — dunkler Hintergrund, heller Text */
        style={{ backgroundColor: '#2a3f45', color: '#D8E6E7' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: '#D8E6E7' }}>Artikeldetails</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-2">
          {FIELDS.map(({ label, value, mono, isSnRow }) => {
            // Special handling for S/N row
            if (isSnRow && hasMultipleSN) {
              return (
                <div key={label}>
                  <dt className="text-xs mb-1" style={{ color: '#93b5bc' }}>{label}</dt>
                  <Select value={selectedSN} onValueChange={setSelectedSN}>
                    <SelectTrigger
                      className="h-7 text-xs font-mono"
                      style={{ backgroundColor: '#1e2e33', borderColor: '#4a6570', color: '#D8E6E7' }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      {line.serialNumbers.map((sn, i) => (
                        <SelectItem key={i} value={sn} className="font-mono text-xs">
                          {sn}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            }

            const rendered = value(line, selectedSN);
            const display = rendered == null || rendered === ''
              ? <PendingHourglassIcon sizeClass="w-5 h-5 text-[14px]" withCircle />
              : rendered;
            return (
              <div key={label}>
                <dt className="text-xs" style={{ color: '#93b5bc' }}>{label}</dt>
                <dd className={`text-sm font-medium ${mono ? 'font-mono' : ''}`} style={{ color: '#D8E6E7' }}>
                  {display}
                </dd>
              </div>
            );
          })}
        </div>

        {/* PROJ-22 B3: "Schliessen" link at bottom right */}
        <div className="flex justify-end pt-3 border-t mt-3" style={{ borderColor: '#4a6570' }}>
          <button
            type="button"
            className="text-xs underline underline-offset-2 transition-colors"
            style={{ color: '#93b5bc' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#D8E6E7'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#93b5bc'; }}
            onClick={() => onOpenChange(false)}
          >
            Schliessen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
