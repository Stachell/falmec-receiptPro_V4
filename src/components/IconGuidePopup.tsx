/**
 * IconGuidePopup — PROJ-34
 *
 * Visual legend for all icons and colour codes used in the Run-Detail tables.
 * Every icon is rendered via its real SSOT component/helper — no duplication.
 */

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { StatusCheckbox } from './run-detail/StatusCheckbox';
import { PendingHourglassIcon } from './run-detail/PendingHourglassIcon';
import { SerialStatusDot } from './run-detail/SerialStatusDot';
import { BADGE_CONFIG } from './run-detail/PriceCell';
import { getOrderReasonStyle } from './run-detail/orderReasonStyle';
import { cn } from '@/lib/utils';
import type { MatchStatus, PriceCheckStatus, OrderAssignmentReason } from '@/types';

interface IconGuidePopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ── Sektion 2: MATCH legend rows ── */
const MATCH_LEGEND: Array<{ status: MatchStatus; text: string }> = [
  { status: 'pending', text: 'Check folgt' },
  { status: 'full-match', text: 'Match gefunden' },
  { status: 'code-it-only', text: 'Nur per Code-IT gematcht' },
  { status: 'ean-only', text: 'Nur per EAN gematcht' },
  { status: 'no-match', text: 'Kein Match' },
];

/* ── Sektion 2: PREIS / CHECK legend rows ── */
const PRICE_LEGEND: Array<{ status: PriceCheckStatus; text: string }> = [
  { status: 'pending', text: 'Preis-Check folgt' },
  { status: 'ok', text: 'Preis stimmt ueberein' },
  { status: 'mismatch', text: 'Preisabweichung' },
  { status: 'missing', text: 'Preis fehlt' },
  { status: 'custom', text: 'Preis manuell angepasst' },
];

/* ── Sektion 3: Serial legend rows ── */
const SERIAL_LEGEND: Array<{
  serialRequired: boolean;
  serialAssigned: boolean;
  isManual?: boolean;       // PROJ-44-R9
  text: string;
}> = [
  { serialRequired: true, serialAssigned: false, text: 'S/N-pflichtig, noch nicht zugeteilt' },
  { serialRequired: false, serialAssigned: false, text: 'Nicht S/N-pflichtig' },
  { serialRequired: true, serialAssigned: true, text: 'S/N erfolgreich zugeteilt' },
  { serialRequired: true, serialAssigned: true, isManual: true, text: 'S/N manuell zugewiesen' },
];

/* ── Sektion 4: Bestell-Pill legend rows (1 per colour group) ── */
const ORDER_LEGEND: Array<{
  reason: OrderAssignmentReason;
  label: string;
  text: string;
}> = [
  { reason: 'perfect-match', label: 'OK', text: 'Perfekter / Direkter / Exakter Match, Manuell bestaetigt' },
  { reason: 'reference-match', label: 'REF', text: 'Referenz-Match, Smart-Qty-Match' },
  { reason: 'oldest-first', label: 'FIFO', text: 'Aelteste zuerst (Fallback), FIFO-Fallback' },
  { reason: 'manual', label: 'MAN', text: 'Manuell zugewiesen' },
  { reason: 'pending', label: '--', text: 'Ausstehend' },
  { reason: 'not-ordered', label: 'N/A', text: 'Nicht bestellt' },
];

/* ── Price badge visual helper (SSOT from BADGE_CONFIG) ── */
function PriceBadgeVisual({ status }: { status: PriceCheckStatus }) {
  const badge = BADGE_CONFIG[status];

  if (status === 'pending') {
    return <PendingHourglassIcon sizeClass="w-5 h-5 text-[14px]" withCircle={false} />;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-medium leading-none',
        badge.className,
      )}
    >
      {badge.display ?? badge.label}
    </span>
  );
}

export function IconGuidePopup({ open, onOpenChange }: IconGuidePopupProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] w-full bg-[#D8E6E7]">
        <DialogHeader>
          <DialogTitle>Legende:</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto space-y-4 mt-2 pr-1">

          {/* ── Sektion 1: PDF-Parser ── */}
          <section>
            <h4 className="text-sm font-semibold mb-1">1 — PDF-Parser</h4>
            <p className="text-xs text-muted-foreground">
              Liest und parst die Rechnungs-PDF und extrahiert Kopfdaten sowie alle Rechnungspositionen.
            </p>
            <p className="text-xs text-muted-foreground italic mt-1">
              Einstiegspunkt — keine Status-Icons in den Tabellen.
            </p>
          </section>

          <Separator />

          {/* ── Sektion 2: Artikel extrahieren ── */}
          <section>
            <h4 className="text-sm font-semibold mb-1">2 — Artikel extrahieren</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Der Artikel-Matcher gleicht die Rechnungspositionen automatisch gegen die Stammdaten ab (Code-IT, EAN) und identifiziert passende Falmec-Artikelnummern.
            </p>

            {/* Sub: -MATCH */}
            <p className="text-xs font-medium mb-1.5">- MATCH</p>
            <div className="space-y-1.5 ml-2 mb-3">
              {MATCH_LEGEND.map((row) => (
                <div key={row.status} className="flex items-center gap-3">
                  <StatusCheckbox status={row.status} />
                  <span className="text-xs">{row.text}</span>
                </div>
              ))}
              {/* PROJ-46: Manuell Entwurf (nur blaues Icon) */}
              <div className="flex items-center gap-3">
                <div className="w-8 flex items-center justify-center">
                  <span className="inline-flex items-center justify-center rounded px-1 py-0.5 bg-blue-100 text-blue-700">
                    <span className="text-[11px] leading-none">{'\u{1F6B9}'}</span>
                  </span>
                </div>
                <span className="text-xs">Manuell zugeordnet (Entwurf)</span>
              </div>
              {/* PROJ-46: Manuell bestätigt (nur grünes Icon) */}
              <div className="flex items-center gap-3">
                <div className="w-8 flex items-center justify-center">
                  <img src="/src/assets/icons/Manuell_check_ICON.ico" alt="bestätigt" className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs">Manuell zugeordnet (bestätigt)</span>
              </div>
            </div>

            {/* Sub: PREIS / CHECK */}
            <p className="text-xs font-medium mb-1.5">PREIS / CHECK</p>
            <div className="space-y-1.5 ml-2">
              {PRICE_LEGEND.map((row) => (
                <div key={row.status} className="flex items-center gap-3">
                  <div className="w-8 flex items-center justify-center">
                    <PriceBadgeVisual status={row.status} />
                  </div>
                  <span className="text-xs">{row.text}</span>
                </div>
              ))}
              {/* PROJ-46: Preis manuell bestätigt Icon */}
              <div className="flex items-center gap-3">
                <div className="w-8 flex items-center justify-center">
                  <img src="/src/assets/icons/Manuell_check_ICON.ico" alt="bestätigt" className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs">Preis manuell bestätigt</span>
              </div>
            </div>
          </section>

          <Separator />

          {/* ── Sektion 3: Serial parsen ── */}
          <section>
            <h4 className="text-sm font-semibold mb-1">3 — Serial parsen</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Der Serial-Finder holt sich jede Seriennummer mit den entsprechenden Artikelnummern und teilt sie logisch den offenen Positionen zu.
            </p>
            <p className="text-xs text-muted-foreground italic mb-3">
              Das Icon zeigt anhand der Faerbung ob ein Artikel seriennummernpflichtig ist und somit mit Seriennummer eingebucht werden muss.
            </p>

            <div className="space-y-1.5 ml-2">
              {SERIAL_LEGEND.map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 flex items-center justify-center">
                    <SerialStatusDot
                      serialRequired={row.serialRequired}
                      serialAssigned={row.serialAssigned}
                      isManual={row.isManual}
                    />
                  </div>
                  <span className="text-xs">{row.text}</span>
                </div>
              ))}
            </div>
          </section>

          <Separator />

          {/* ── Sektion 4: Bestellung mappen ── */}
          <section>
            <h4 className="text-sm font-semibold mb-1">4 — Bestellung mappen</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Der Order-Mapper ordnet offene Bestellpositionen automatisch den Rechnungspositionen zu und zeigt den Zuweisungsgrund farblich an.
            </p>

            <div className="space-y-1.5 ml-2">
              {ORDER_LEGEND.map((row) => {
                const style = getOrderReasonStyle(row.reason);
                return (
                  <div key={row.reason} className="flex items-center gap-3">
                    <span
                      className={cn(
                        style.pillClass,
                        'inline-flex items-center justify-center text-[10px] leading-none min-w-[38px] py-0.5',
                      )}
                    >
                      {row.label}
                    </span>
                    <span className="text-xs">{row.text}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Schliessen link — matches SettingsPopup pattern */}
        <div className="flex justify-end pt-3 border-t border-border mt-2">
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
            onClick={() => onOpenChange(false)}
          >
            Schliessen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
