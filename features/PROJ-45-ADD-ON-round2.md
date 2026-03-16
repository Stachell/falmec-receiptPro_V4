# PROJ-45-ADD-ON-round2 — IssueDialog UX-Redesign

**Status:** Done
**Datum:** 2026-03-16
**Scope:** Rein visuelles Refactoring — keine Fachlogik-Änderungen
**Dateien:** 1 (IssueDialog.tsx)

## Context
Der IssueDialog (`max-w-[800px] h-[600px]`) wirkt beengt. Die Lösungs-Buttons (PriceCell) sind im Uebersicht-Tab visuell hinter der dominanten orangen Warnung versteckt. Der User muss sofort erkennen, was die primäre Aktion ist. Wir redesignen den Dialog zu einem prominenten "Event-Center".

## Kritische Dateien
- `src/components/run-detail/IssueDialog.tsx` (einzige Datei die geändert wird)
- `src/components/run-detail/PriceCell.tsx` (READ-ONLY — Referenz für Props)

## Implementierungsplan

### Punkt 1: Größeres Dialog-Fenster (Responsive)
**Zeile 204** — DialogContent className ändern:
```
VORHER: max-w-[800px] w-full h-[600px]
NACHHER: max-w-6xl w-full h-[85vh] max-h-[850px]
```
- `max-w-6xl` = 72rem = 1152px (vs. 800px vorher → +44% Breite)
- `h-[85vh] max-h-[850px]` → viewport-relativ, passt sich an kleinere Laptops an, kein Abschneiden
- Innenabstände: `p-6` auf DialogContent prüfen (shadcn default ist `p-6`, sollte reichen)

### Punkt 2: Hierarchie-Umbau im Tab "Uebersicht"
**Zeilen 248-336** — Reihenfolge im TabsContent "overview" neu ordnen:

**AKTUELLE Reihenfolge:**
1. Context-Block (Feld/Erwartet/Aktuell) — Z.250-262
2. Betroffene Positionen (max 5) — Z.265-279
3. Orange Warnung (ACHTUNG) — Z.282-287
4. PriceCell (Preis anpassen) — Z.289-305
5. Escalation Info — Z.308-313
6. Quick Navigation Buttons — Z.316-335

**NEUE Reihenfolge:**
1. Context-Block (Feld/Erwartet/Aktuell) — unverändert
2. Betroffene Positionen (max 5) — unverändert
3. **PriceCell (Preis korrigieren)** — HOCHGEZOGEN, visuell prominent
4. **Orange Warnung (ACHTUNG)** — RUNTERGEZOGEN, kompakter
5. Escalation Info — unverändert
6. Quick Navigation Buttons — unverändert

**PriceCell visuell aufwerten** (Z.289-305 → wird Block 3):
- Wrapper-Div: `rounded-lg border-2 border-teal-400/50 bg-white/40 p-3` (eigene Card)
- Label: `text-sm font-semibold` statt `text-xs text-muted-foreground`
- Label-Text: "Preis korrigieren:" statt "Preis anpassen:"
- Neues Sub-Label darunter: `text-xs text-muted-foreground` → "Waehlen Sie die korrekte Preisquelle"

### Punkt 3: Kompakte Warnung (Lesbarkeit beibehalten)
**Zeilen 282-287** (wird Block 4 nach Reorder):
```
VORHER: p-2 text-xs rounded border border-orange-300/60 bg-orange-50/10 text-orange-700
NACHHER: py-1.5 px-3 text-xs rounded border border-orange-300/40 bg-orange-50/5 text-orange-700
```
- Padding reduziert: `p-2` → `py-1.5 px-3`
- Schriftgröße BEIBEHALTEN: `text-xs` bleibt (Lesbarkeit!)
- Textfarbe BEIBEHALTEN: `text-orange-700` bleibt
- Border dezenter: `border-orange-300/60` → `border-orange-300/40`
- Background dezenter: `bg-orange-50/10` → `bg-orange-50/5`

## Zusammenfassung der Änderungen
| Was | Vorher | Nachher |
|-----|--------|---------|
| Dialog-Breite | 800px | max-w-6xl (1152px) |
| Dialog-Höhe | h-[600px] (hart) | h-[85vh] max-h-[850px] (responsive) |
| PriceCell Position | Nach Warnung (4.) | Vor Warnung (3.) |
| PriceCell Styling | Inline, minimal | Eigene Card, prominent (teal border) |
| Warnung Padding | p-2 | py-1.5 px-3 |
| Warnung Border/BG | 60%/10% opacity | 40%/5% opacity |
| Warnung Schrift | text-xs | text-xs (beibehalten!) |
| Warnung Position | Vor PriceCell (3.) | Nach PriceCell (4.) |

## Verifizierung
1. `npx tsc --noEmit` — 0 Errors
2. Visuell: Dialog öffnen für price-mismatch Issue → PriceCell prominent vor Warnung
3. Visuell: Dialog öffnen für nicht-price-mismatch Issue → kein PriceCell, keine Warnung
4. PriceCell-Popover funktioniert (Rechnungspreis/Sage/Manuell)
5. Tab-Wechsel und alle 5 Tabs weiterhin funktional
6. Responsive: Dialog auf 1366px Laptop und 1920px Desktop prüfen — kein Abschneiden

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden
1. **JSX-Block-Reihenfolge:** Beim Verschieben der PriceCell- und Warning-Blöcke darauf achten, dass die IIFE `(() => { ... })()` für PriceCell komplett verschoben wird (Z.289-305) — nicht nur Teile davon.
2. **Conditional Rendering beibehalten:** Die Bedingung `issue?.type === 'price-mismatch'` muss auf BEIDEN Blöcken (Warning + PriceCell) erhalten bleiben. Optional Chaining `issue?.type` nicht entfernen!
3. **PriceCell-Props unverändert:** `line={mismatchLine}` und `onSetPrice` Callback exakt beibehalten. `setManualPriceByPosition` Import und Aufruf nicht ändern.
4. **TabsList NICHT anfassen:** Die TabsList (Z.220-245) hat aktuell `h-10` + `tab-bar-raised` und KEINE inline styles. Diese Klassen NICHT ändern — sie wurden in PROJ-44-ADD-ON-Layout-R2 finalisiert. Keine `h-fit`, kein `self-start`, keine inline styles hinzufügen.
5. **Radix TabsContent:** KEIN `display:flex` auf `TabsContent` setzen. Das kollidiert mit Radix `[hidden]` Attribut. Wenn Flexbox nötig, inneren Wrapper-Div verwenden.
6. **space-y-3 auf TabsContent:** Die `space-y-3` Klasse auf dem TabsContent bleibt — sie sorgt für konsistente Abstände zwischen den Blöcken.
7. **Tailwind-Klassen-Reihenfolge:** `max-w-6xl` kommt vor `w-full` — Tailwind merged korrekt wenn die Reihenfolge stimmt.
8. **Kein Re-Export nötig:** IssueDialog wird nur von IssuesCenter importiert, keine weiteren Consumer.
9. **Höhe responsive:** `h-[85vh] max-h-[850px]` — NICHT `h-[700px]` oder andere feste Werte. Viewport-relative Höhe ist Pflicht für Laptop-Kompatibilität.

## SONNET-REGELN (Zwingend bei Ausführung einhalten!)
1. IMMER vorher in den Plan-Modus (thinking) gehen.
2. SKILLS VERWENDEN: Lade zwingend die Skills `frontend`, `react-dev`, `qa` und `find-skills`.
3. IMMER in die Projektdaten schreiben (`features/PROJ-45-ADD-ON-round2.md`).
4. Am Ende selbstständig `npx tsc --noEmit` über das Bash-Terminal ausführen und alle TypeScript-Fehler fixen.
5. Die Datei `features/INDEX.md` aktualisieren.
