/**
 * SerialFixPopup — PROJ-44-R6
 *
 * Late-Fix Modal für manuelle S/N-Bearbeitung.
 * Erlaubt das Nachtragen/Korrigieren von Seriennummern und S/N-Pflicht-Toggle.
 *
 * WICHTIG: Verwendet ausschliesslich `updateLineSerialData` (chirurgischer S/N-Bypass).
 * NIEMALS `setManualArticleByPosition` — das würde Artikel/Preis/MatchStatus korrumpieren.
 */

import { useState } from 'react';
import { useRunStore } from '@/store/runStore';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface SerialFixPopupProps {
  /** Ziel-Zeile für die S/N-Bearbeitung */
  target: {
    lineId: string;
    positionIndex: number;
    serialRequired: boolean;
    serialNumbers: string[];
    qty: number;
  };
  /** Schließen-Callback */
  onClose: () => void;
}

export function SerialFixPopup({ target, onClose }: SerialFixPopupProps) {
  const [localSerialRequired, setLocalSerialRequired] = useState(target.serialRequired);
  const [localSerialNumbers, setLocalSerialNumbers] = useState<string[]>(() => {
    const existing = [...target.serialNumbers];
    while (existing.length < target.qty) existing.push('');
    return existing.slice(0, target.qty);
  });

  const handleSerialChange = (index: number, value: string) => {
    setLocalSerialNumbers(prev => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleSave = () => {
    const { updateLineSerialData } = useRunStore.getState();

    // Filtere leere Strings raus wenn S/N-Pflicht aktiv
    const nonEmptySerials = localSerialRequired
      ? localSerialNumbers.filter(s => s.trim() !== '')
      : [];

    updateLineSerialData(target.positionIndex, localSerialRequired, nonEmptySerials);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Seriennummer bearbeiten — Pos. {target.positionIndex + 1}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* S/N-Pflicht Toggle */}
          <div className="flex items-center gap-3">
            <Switch
              id="sn-required-toggle"
              checked={localSerialRequired}
              onCheckedChange={setLocalSerialRequired}
            />
            <Label htmlFor="sn-required-toggle" className="cursor-pointer">
              S/N-Pflicht: <span className="font-semibold">{localSerialRequired ? 'Ja' : 'Nein'}</span>
            </Label>
          </div>

          {/* Seriennummer Eingabefelder */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground font-medium">Seriennummer(n)</p>
            {localSerialNumbers.map((sn, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground w-10 shrink-0">
                  S/N {idx + 1}:
                </Label>
                <Input
                  value={sn}
                  onChange={(e) => handleSerialChange(idx, e.target.value)}
                  disabled={!localSerialRequired}
                  placeholder="z.B. K1234567890K"
                  className="font-mono text-sm"
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleSave}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
