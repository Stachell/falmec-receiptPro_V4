/**
 * ManualOrderPopup — PROJ-23 Phase A5
 *
 * Popover-based UI for manually reassigning an order position to an
 * expanded invoice line (qty=1). Only visible when run.isExpanded === true.
 *
 * Dropdown shows remaining pool entries for the line's article in YYYY-XXXXX
 * format. Last entry is always "NEU" → reveals free-text input (Zwangsauswahl).
 *
 * On confirm, calls reassignOrder() which handles:
 *   - returning the old order to the pool
 *   - consuming the new order from the pool
 *   - updating the line + auto-resolving issues
 */

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRunStore } from '@/store/runStore';
import { getAvailableForArticle } from '@/services/matching/orderPool';
import { cn } from '@/lib/utils';
import { getOrderReasonStyle } from './orderReasonStyle';
import type { InvoiceLine } from '@/types';

interface ManualOrderPopupProps {
  line: InvoiceLine;
  labelClassName?: string;
}

export function ManualOrderPopup({ line, labelClassName }: ManualOrderPopupProps) {
  const { orderPool, reassignOrder } = useRunStore();
  const [open, setOpen] = useState(false);
  const [selectedPositionId, setSelectedPositionId] = useState<string>('');
  const [freeText, setFreeText] = useState('');

  const artNoDE = line.falmecArticleNo ?? '';
  const available =
    orderPool && artNoDE ? getAvailableForArticle(orderPool, artNoDE) : [];

  const isNew = selectedPositionId === 'NEW';
  const canConfirm =
    selectedPositionId !== '' && (!isNew || freeText.trim().length > 0);

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (isNew) {
      reassignOrder(line.lineId, 'NEW', freeText.trim());
    } else {
      reassignOrder(line.lineId, selectedPositionId);
    }
    setOpen(false);
    setSelectedPositionId('');
    setFreeText('');
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelectedPositionId('');
      setFreeText('');
    }
  };

  // Badge label: current order or "--"
  const currentLabel = line.orderNumberAssigned ?? '--';
  const reasonStyle = getOrderReasonStyle(line.orderAssignmentReason);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-end gap-1 w-full min-w-0 group hover:opacity-80 transition-opacity',
            reasonStyle.pillClass
          )}
          title={`Bestellung manuell zuweisen (${reasonStyle.label})`}
        >
          <span className={cn('truncate min-w-0 text-right', labelClassName ?? 'text-xs')}>
            {currentLabel}
          </span>
          <Pencil className={cn(
            'shrink-0 w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity',
            reasonStyle.iconClass
          )} />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4" align="start">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Bestellung zuweisen</h4>

          {/* Current assignment hint */}
          {line.orderNumberAssigned && (
            <div className="text-xs text-muted-foreground">
              Aktuell:{' '}
              <span className="font-mono text-foreground">
                {line.orderNumberAssigned}
              </span>{' '}
              <span className="italic">
                ({line.orderAssignmentReason})
              </span>
            </div>
          )}

          {/* Dropdown */}
          <Select value={selectedPositionId} onValueChange={setSelectedPositionId}>
            <SelectTrigger className="w-full text-sm">
              <SelectValue placeholder="Bestellposition wählen …" />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 && (
                <SelectItem value="__none__" disabled>
                  Keine offenen Positionen verfügbar
                </SelectItem>
              )}
              {available.map((entry) => (
                <SelectItem
                  key={entry.position.id}
                  value={entry.position.id}
                >
                  {entry.position.orderYear}-{entry.position.orderNumber}
                  <span className="ml-2 text-muted-foreground text-xs">
                    (noch {entry.remainingQty} offen)
                  </span>
                </SelectItem>
              ))}
              {/* Always last: free-text entry */}
              <SelectItem value="NEW">NEU / Freitext …</SelectItem>
            </SelectContent>
          </Select>

          {/* Free-text input — only when "NEU" chosen (Zwangsauswahl) */}
          {isNew && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Bestellnummer eingeben (z.B. 2025-10153)
              </label>
              <Input
                autoFocus
                placeholder="YYYY-XXXXX"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                className="font-mono text-sm"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1 border-t">
            <Button
              size="sm"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              Übernehmen
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              onClick={() => handleOpenChange(false)}
            >
              Schließen
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
