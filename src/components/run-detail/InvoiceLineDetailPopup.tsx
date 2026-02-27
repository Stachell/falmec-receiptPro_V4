import { InvoiceLine, ParsedInvoiceLineExtended, PriceCheckStatus } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusCheckbox } from './StatusCheckbox';
import { PendingHourglassIcon } from './PendingHourglassIcon';

interface InvoiceLineDetailPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: ParsedInvoiceLineExtended | null;
  linesForPosition: InvoiceLine[];
}

const PRICE_STATUS_LABELS: Record<PriceCheckStatus, string> = {
  pending: 'Preis-Check folgt',
  ok: 'OK',
  mismatch: 'check',
  missing: 'fehlt',
  custom: 'angepasst',
};

const formatCurrency = (value: number | null | undefined): string | null => {
  if (value == null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
};

const joinOrDash = (values: string[]): string => (
  values.length > 0 ? values.join(' | ') : ''
);

const renderPendingIfEmpty = (value: string | number | null | undefined) => {
  if (value == null || value === '') {
    return <PendingHourglassIcon sizeClass="w-5 h-5 text-[14px]" withCircle />;
  }
  return value;
};

export function InvoiceLineDetailPopup({
  open,
  onOpenChange,
  position,
  linesForPosition,
}: InvoiceLineDetailPopupProps) {
  const representative = linesForPosition[0];
  const qtySum = linesForPosition.length > 0
    ? linesForPosition.reduce((sum, line) => sum + line.qty, 0)
    : (position?.quantityDelivered ?? 0);

  const articleNoList = Array.from(new Set(
    linesForPosition
      .map((line) => line.falmecArticleNo)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  ));
  const orderList = Array.from(new Set(
    linesForPosition
      .map((line) => line.orderNumberAssigned)
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  ));
  const serialList = Array.from(new Set(
    linesForPosition
      .flatMap((line) => {
        if (line.serialNumbers.length > 0) return line.serialNumbers;
        return line.serialNumber ? [line.serialNumber] : [];
      })
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  ));

  const matchStatus = representative?.matchStatus ?? 'pending';
  const priceStatus = representative?.priceCheckStatus ?? 'pending';
  const priceFinal = representative?.unitPriceFinal ?? null;
  const priceSage = representative?.unitPriceSage ?? null;
  const storageLocation = representative?.storageLocation ?? null;
  const descriptionDE = representative?.descriptionDE ?? null;
  const articleListLabel = articleNoList.length > 0
    ? `${articleNoList.join(' | ')} [_sum=${qtySum}]`
    : `[_sum=${qtySum}]`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        style={{ backgroundColor: '#2a3f45', color: '#D8E6E7' }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: '#D8E6E7' }}>
            Artikeldetails Rechnungszeile
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-2">
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Position</dt>
            <dd className="text-sm font-medium font-mono">{renderPendingIfEmpty(position?.positionIndex)}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Artikelliste [_sum]</dt>
            <dd className="text-sm font-medium font-mono">{articleListLabel}</dd>
          </div>

          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Art.-Nr.</dt>
            <dd className="text-sm font-medium font-mono">{renderPendingIfEmpty(joinOrDash(articleNoList))}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Herstellerartikelnr.</dt>
            <dd className="text-sm font-medium font-mono">{renderPendingIfEmpty(position?.manufacturerArticleNo || null)}</dd>
          </div>

          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>EAN</dt>
            <dd className="text-sm font-medium font-mono">{renderPendingIfEmpty(position?.ean || null)}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Menge (RE-Position)</dt>
            <dd className="text-sm font-medium">{position?.quantityDelivered ?? qtySum}</dd>
          </div>

          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Bezeichnung (DE)</dt>
            <dd className="text-sm font-medium">{renderPendingIfEmpty(descriptionDE)}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Bezeichnung (IT)</dt>
            <dd className="text-sm font-medium">{renderPendingIfEmpty(position?.descriptionIT || null)}</dd>
          </div>

          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Preis (Rechnung)</dt>
            <dd className="text-sm font-medium">{renderPendingIfEmpty(formatCurrency(position?.unitPrice ?? representative?.unitPriceInvoice))}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Preis (Sage)</dt>
            <dd className="text-sm font-medium">{renderPendingIfEmpty(formatCurrency(priceSage))}</dd>
          </div>

          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Preis (Final)</dt>
            <dd className="text-sm font-medium">{renderPendingIfEmpty(formatCurrency(priceFinal))}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Preis-Status</dt>
            <dd className="text-sm font-medium">{PRICE_STATUS_LABELS[priceStatus]}</dd>
          </div>

          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Match-Status</dt>
            <dd className="text-sm font-medium"><StatusCheckbox status={matchStatus} /></dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Lagerort</dt>
            <dd className="text-sm font-medium font-mono">{renderPendingIfEmpty(storageLocation || null)}</dd>
          </div>

          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Bestellnummer(n)</dt>
            <dd className="text-sm font-medium font-mono">{renderPendingIfEmpty(joinOrDash(orderList))}</dd>
          </div>
          <div>
            <dt className="text-xs" style={{ color: '#93b5bc' }}>Seriennummer(n)</dt>
            <dd className="text-sm font-medium font-mono">{renderPendingIfEmpty(joinOrDash(serialList))}</dd>
          </div>
        </div>

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
