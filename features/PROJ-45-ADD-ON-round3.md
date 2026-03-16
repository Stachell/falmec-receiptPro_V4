# PROJ-45-ADD-ON-round3 — PriceCell Button-Optik im IssueDialog

**Status:** Done
**Datum:** 2026-03-16
**Scope:** Rein visuell + 1 Event-Delegator — keine Fachlogik-Aenderungen
**Dateien:** 1 (IssueDialog.tsx)

## Context

Im IssueDialog Tab "Uebersicht" zeigt die PriceCell den Preis als "275,00 EUR ⚠️" an.
Das kleine Badge-Icon ist der einzige Popover-Trigger — fuer unerfahrene User nicht intuitiv erkennbar.
Der Preis soll in einem button-aehnlichen Container dargestellt werden, damit User sofort erkennen,
dass hier geklickt werden muss.

## Kritische Dateien

- `src/components/run-detail/IssueDialog.tsx` — **einzige Datei die geaendert wird** (Zeilen 289-298)
- `src/components/run-detail/PriceCell.tsx` — **READ-ONLY**, wird NICHT geaendert

## Implementierungsplan

### Aenderung: Wrapper-Div um PriceCell (Zeile 289-298 in IssueDialog.tsx)

**VORHER** (Zeile 289-298):
```tsx
<div className="flex items-center gap-2">
  <PriceCell
    line={mismatchLine}
    onSetPrice={(_lineId, price) => {
      if (currentRun) {
        setManualPriceByPosition(mismatchLine.positionIndex, price, currentRun.id);
      }
    }}
  />
</div>
```

**NACHHER:**
```tsx
<div
  role="button"
  tabIndex={0}
  className="inline-flex items-center gap-2 rounded border border-black/60 bg-green-50/40 px-3 py-1.5 cursor-pointer shadow-sm hover:bg-green-100/50 transition-colors"
  onClick={(e) => {
    const btn = e.currentTarget.querySelector('button');
    if (btn && !btn.contains(e.target as Node)) {
      btn.click();
    }
  }}
>
  <PriceCell
    line={mismatchLine}
    onSetPrice={(_lineId, price) => {
      if (currentRun) {
        setManualPriceByPosition(mismatchLine.positionIndex, price, currentRun.id);
      }
    }}
  />
</div>
```

### Styling-Erklaerung
| Klasse / Attribut | Zweck |
|--------|-------|
| `role="button" tabIndex={0}` | Semantik + Barrierefreiheit (Tastatur-Navigation, Screenreader) |
| `inline-flex items-center gap-2` | Layout wie vorher, aber inline-flex statt flex (Button-Breite = Inhalt) |
| `rounded border border-black/60` | Schwarzer Rahmen wie gewuenscht |
| `bg-green-50/40` | Leicht transparent-gruener Hintergrund |
| `px-3 py-1.5` | Button-typisches Padding |
| `cursor-pointer` | Zeigt Klickbarkeit an |
| `shadow-sm` | Dezenter Schatten wie "Loesung erzwingen" Button |
| `hover:bg-green-100/50 transition-colors` | Hover-Feedback |

### Event-Delegation (Bubbling-sicher)
```tsx
onClick={(e) => {
  const btn = e.currentTarget.querySelector('button');
  // Nur simulieren wenn Klick AUSSERHALB des Buttons + seiner Children (SVG etc.)
  if (btn && !btn.contains(e.target as Node)) {
    btn.click();
  }
}}
```
- `btn.contains(e.target)` prueft ob der Klick auf den Button ODER ein Child-Element (z.B. SVG-Icon) war
- Wenn ja: PriceCell handled den Klick selbst → kein Doppel-Fire
- Wenn nein (Klick auf Preis-Text oder leeren Bereich): `btn.click()` oeffnet Popover

## Was sich NICHT aendert
- PriceCell.tsx — komplett unberuehrt
- PriceCell Props — identisch
- Popover-State — bleibt in PriceCell
- Alle anderen Bloecke im Uebersicht-Tab — unberuehrt
- Keine neuen Imports noetig

## Verifizierung
1. `npx tsc --noEmit` — 0 Errors
2. Visuell: Dialog oeffnen fuer price-mismatch Issue → Preiszeile sieht aus wie ein Button (gruener Hintergrund, schwarzer Rahmen)
3. Klick auf Preis-Text (z.B. "275,00 EUR") → Popover oeffnet sich
4. Klick auf Badge-Icon (⚠️) → Popover oeffnet sich (einmal, kein Double-Fire)
5. Klick auf SVG innerhalb des Badge → Popover oeffnet sich (einmal, kein Double-Fire)
6. Hover-Effekt sichtbar (bg wird etwas gruener)
7. Popover-Funktionalitaet (Rechnungspreis/Sage/Manuell) weiterhin korrekt

## Nützliche Hinweise fuer Sonnet bei der Durchfuehrung
1. **Nur Zeilen 289-298 aendern:** Der Rest des Uebersicht-Tabs bleibt komplett unberuehrt.
2. **PriceCell Props exakt beibehalten:** `line={mismatchLine}` und `onSetPrice` Callback 1:1 uebernehmen.
3. **Kein neuer Import noetig:** Alle verwendeten Typen (Node, HTMLElement) sind globale DOM-Typen.
4. **TabsList NICHT anfassen:** Wurde in PROJ-44-ADD-ON-Layout-R2 finalisiert.
5. **`e.target as Node`:** TypeScript braucht den Cast, da `e.target` als `EventTarget` typisiert ist.

## Feature-Datei
- `features/INDEX.md` aktualisieren mit Eintrag fuer PROJ-45-ADD-ON-round3
