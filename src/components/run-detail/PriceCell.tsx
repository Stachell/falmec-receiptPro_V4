import { useState } from 'react';
import { InvoiceLine, PriceCheckStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface PriceCellProps {
  line: InvoiceLine;
  onSetPrice: (lineId: string, price: number, source: 'invoice' | 'sage' | 'custom') => void;
}

const BADGE_CONFIG: Record<PriceCheckStatus, { text: string; className: string }> = {
  pending:  { text: 'Preis-Check folgt', className: 'bg-gray-100 text-gray-600' },
  ok:       { text: 'OK',               className: 'bg-green-100 text-green-700' },
  mismatch: { text: 'PRUEFEN',          className: 'bg-yellow-100 text-yellow-700' },
  missing:  { text: 'fehlt',            className: 'bg-red-100 text-red-700' },
  custom:   { text: 'angepasst',        className: 'bg-blue-100 text-blue-700' },
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);

export function PriceCell({ line, onSetPrice }: PriceCellProps) {
  const [customPrice, setCustomPrice] = useState('');
  const [open, setOpen] = useState(false);

  const badge = BADGE_CONFIG[line.priceCheckStatus];
  const displayPrice = line.unitPriceFinal ?? line.unitPriceInvoice;

  const handleInvoicePrice = () => {
    onSetPrice(line.lineId, line.unitPriceInvoice, 'invoice');
    setOpen(false);
  };

  const handleSagePrice = () => {
    if (line.unitPriceSage != null) {
      onSetPrice(line.lineId, line.unitPriceSage, 'sage');
      setOpen(false);
    }
  };

  const handleCustomPrice = () => {
    const parsed = parseFloat(customPrice.replace(',', '.'));
    if (!isNaN(parsed)) {
      onSetPrice(line.lineId, parsed, 'custom');
      setCustomPrice('');
      setOpen(false);
    }
  };

  return (
    <div className="flex items-center gap-1 justify-end">
      <span className="font-mono text-xs">{formatPrice(displayPrice)}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${badge.className}`}
          >
            {badge.text}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-4" align="end">
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Preis festlegen</h4>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              onClick={handleInvoicePrice}
            >
              <span>Rechnungspreis</span>
              <span className="font-mono">{formatPrice(line.unitPriceInvoice)}</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between"
              disabled={line.unitPriceSage == null}
              onClick={handleSagePrice}
            >
              <span>Sage-Preis (ERP)</span>
              <span className="font-mono">
                {line.unitPriceSage != null ? formatPrice(line.unitPriceSage) : '--'}
              </span>
            </Button>

            <div className="border-t pt-3 space-y-2">
              <label className="text-xs text-muted-foreground">Manuell eintragen</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="0,00"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="flex-1 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomPrice()}
                />
                <Button size="sm" onClick={handleCustomPrice}>
                  OK
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
