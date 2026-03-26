import { useState } from 'react';
import { InvoiceLine, PriceCheckStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { badgeVariants } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { PendingHourglassIcon } from './PendingHourglassIcon';

interface PriceCellProps {
  line: InvoiceLine;
  onSetPrice: (lineId: string, price: number, source: 'invoice' | 'sage' | 'custom') => void;
  /** PROJ-22 B2: When true, badge is shown but popover is disabled (Artikelliste READ-ONLY rule) */
  readOnly?: boolean;
  /**
   * ADD-ON PriceCheck (post-Step-4 mode): When provided, clicking the badge in RE-Positionen
   * navigates to the first expanded article in Artikelliste instead of opening the popover.
   * Used exclusively when currentRun.isExpanded === true.
   */
  onJumpToArticleList?: () => void;
}

export const BADGE_CONFIG: Record<PriceCheckStatus, { label: string; className: string; display?: string }> = {
  pending:  { label: 'folgt', className: 'bg-[#968C8C] text-white' },
  ok:       { label: 'OK', className: 'bg-green-100 text-green-700', display: 'OK' },
  mismatch: { label: 'check', className: 'bg-yellow-100 text-yellow-700', display: '\u26A0\uFE0F' },
  missing:  { label: 'fehlt', className: 'bg-red-100 text-red-700', display: '\u274C' },
  custom:   { label: 'angepasst', className: 'bg-blue-100 text-blue-700', display: '\u{1F6B9}' },
};

const formatPrice = (price: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(price);

export function PriceCell({ line, onSetPrice, readOnly = false, onJumpToArticleList }: PriceCellProps) {
  const [customPrice, setCustomPrice] = useState('');
  const [open, setOpen] = useState(false);

  // PROJ-46: custom+confirmed → grüner Badge mit Icon, custom+draft → blauer Badge (default)
  const baseBadge = BADGE_CONFIG[line.priceCheckStatus];
  const isConfirmedCustom = line.priceCheckStatus === 'custom' && line.manualStatus === 'confirmed';
  const badge = isConfirmedCustom
    ? { label: 'bestätigt', className: 'bg-green-100 text-green-700', display: 'icon' }
    : baseBadge;
  const displayPrice = line.unitPriceFinal ?? line.unitPriceInvoice;
  const okCompactSizeClass = 'w-[25px] h-5 text-[11.25px] leading-none justify-center';

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

  const renderStatusVisual = (status: PriceCheckStatus, sizeClass: string) => {
    if (status === 'pending') {
      return <PendingHourglassIcon sizeClass={sizeClass} withCircle={false} />;
    }
    // PROJ-46: confirmed custom → Manuell_check_ICON
    if (isConfirmedCustom) {
      return <img src="/src/assets/icons/Manuell_check_ICON.ico" alt="bestätigt" className="w-3.5 h-3.5" />;
    }
    return (
      <span aria-hidden="true" className={`${sizeClass} leading-none`}>
        {BADGE_CONFIG[status].display ?? BADGE_CONFIG[status].label}
      </span>
    );
  };

  // PROJ-22 B2: readOnly mode — show badge without popover trigger
  if (readOnly) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <span className="font-mono text-xs">{formatPrice(displayPrice)}</span>
        {line.priceCheckStatus === 'ok' ? (
          <span
            className={cn(
              badgeVariants({ variant: 'default' }),
              `px-0 py-0 cursor-default opacity-70 ${okCompactSizeClass}`
            )}
            title="Preis kann nur in RE-Positionen bearbeitet werden"
          >
            OK
          </span>
        ) : (
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-px text-[12.5px] leading-4 font-medium cursor-default opacity-70 ${badge.className}`}
            title="Preis kann nur in RE-Positionen bearbeitet werden"
          >
            {renderStatusVisual(line.priceCheckStatus, 'text-[12.5px]')}
            <span className="sr-only">{badge.label}</span>
          </span>
        )}
      </div>
    );
  }

  // ADD-ON PriceCheck: post-Step-4 jump mode — badge becomes a navigation button instead of popover trigger
  if (onJumpToArticleList) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <span className="font-mono text-xs">{formatPrice(displayPrice)}</span>
        {line.priceCheckStatus === 'ok' ? (
          <button
            type="button"
            className={cn(
              badgeVariants({ variant: 'default' }),
              `px-0 py-0 cursor-pointer hover:opacity-80 transition-opacity ${okCompactSizeClass} text-[8.4375px]`
            )}
            aria-label="Preisstatus: OK. Zur Artikelliste springen"
            onClick={onJumpToArticleList}
          >
            OK
          </button>
        ) : (
          <button
            type="button"
            className={`inline-flex items-center rounded-md px-1.5 py-px text-[10px] leading-4 font-medium cursor-pointer hover:opacity-80 transition-opacity ${badge.className}`}
            aria-label={`Preisstatus: ${badge.label}. Zur Artikelliste springen`}
            onClick={onJumpToArticleList}
          >
            {renderStatusVisual(line.priceCheckStatus, 'text-[12.5px]')}
            <span className="sr-only">{badge.label}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <span className="font-mono text-xs">{formatPrice(displayPrice)}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {line.priceCheckStatus === 'ok' ? (
            <button
              type="button"
              className={cn(
                badgeVariants({ variant: 'default' }),
                `px-0 py-0 cursor-pointer hover:opacity-80 transition-opacity ${okCompactSizeClass} text-[8.4375px]`
              )}
              aria-label="Preisstatus: OK. Preisoptionen oeffnen"
            >
              OK
            </button>
          ) : (
            <button
              type="button"
              className={`inline-flex items-center rounded-md px-1.5 py-px text-[10px] leading-4 font-medium cursor-pointer hover:opacity-80 transition-opacity ${badge.className}`}
            >
              {renderStatusVisual(line.priceCheckStatus, 'text-[12.5px]')}
              <span className="sr-only">{badge.label}</span>
            </button>
          )}
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
                  className="flex-1 text-sm text-foreground"
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
