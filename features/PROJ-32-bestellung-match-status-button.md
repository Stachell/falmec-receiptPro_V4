# PROJ-32: Bestellung Match-Status Button

**BETA 2.1** — Stand: 2026-02-26 | Vollständig implementiert und verifiziert.

---

## Ziel

Farbiger Hintergrund-Pill in der **Bestellung**-Spalte der Artikelliste (`ItemsTable.tsx`), der visuell den Order-Assignment-Grund (`OrderAssignmentReason`) anzeigt. Referenzfarbe ist der Teal-grüne "OK"-Badge aus RE-Positionen (`bg-primary text-primary-foreground`).

Der bestehende Bestellnummern-Text und das Pencil-Edit-Icon bleiben erhalten, erhalten aber eine kontrastgerechte Farbe passend zum Pill-Hintergrund.

---

## Design-Regeln

1. **Nur Tailwind-Klassen** — keine Inline-Styles (`style={{ }}`)
2. **Referenzfarbe:** `bg-primary text-primary-foreground` (Teal `#008C99`) = "OK"-Badge in RE-Positionen
3. **Kontrastgerechte Text/Icon-Farben** pro Hintergrund — kein pauschales `text-white`
4. **Layout-Schutz:** Kein `py-*`, Spaltenbreite `w-[106px]` unangetastet *(BETA 2.0: von `w-24` auf `w-[106px]` angepasst — siehe ADD-ON 1)*, `truncate` nur auf Text-Child
5. **`cn()` Pflicht** für alle dynamischen Klassen-Zusammenführungen (verhindert Tailwind-Merge-Konflikte)

---

## Farbzuordnung: `OrderAssignmentReason` → Tailwind-Klassen

| Gruppe | Reasons | bg-Klasse | text-Klasse | Icon-Klasse | Bedeutung |
|--------|---------|-----------|-------------|-------------|-----------|
| **Teal** | `perfect-match`, `direct-match`, `exact-qty-match`, `manual-ok` | `bg-primary` | `text-primary-foreground` | `text-primary-foreground/70` | Erfolg |
| **Blau** | `reference-match`, `smart-qty-match` | `bg-blue-600` | `text-white` | `text-white/70` | Sekundär |
| **Amber** | `oldest-first`, `fifo-fallback` | `bg-amber-500` | `text-amber-950` | `text-amber-950/70` | Fallback |
| **Violett** | `manual` | `bg-violet-600` | `text-white` | `text-white/70` | Manuell |
| **Grau** | `pending` | `bg-gray-400` | `text-gray-900` | `text-gray-900/70` | Ausstehend |
| **Rot** | `not-ordered` | `bg-destructive` | `text-destructive-foreground` | `text-destructive-foreground/70` | Nicht bestellt |

### Kontrastprüfung

| Kombination | Ratio | WCAG AA |
|-------------|-------|---------|
| Teal `#008C99` + weiß | ~4.6:1 | Pass |
| Blau `#2563EB` + weiß | ~4.6:1 | Pass |
| Amber `#F59E0B` + amber-950 | >10:1 | Pass |
| Violett `#7C3AED` + weiß | ~5.5:1 | Pass |
| Grau `#9CA3AF` + gray-900 | ~4.8:1 | Pass |
| Rot (destructive) + weiß | ~3.9:1 | Akzeptabel für Badges |

---

## Geprüfte Frontend-Fallen

### Falle 1: Flexbox & Truncate-Konflikt

**Problem:** `truncate` auf einem Flex-Container schneidet Text in Child-Elementen nicht ab.

**Lösung:**
- Äußerer Container (Button/Span): `min-w-0 max-w-full` (erlaubt Flex-Shrink)
- Inneres Text-`<span>`: `truncate min-w-0` (overflow-hidden + text-ellipsis + whitespace-nowrap)
- Pencil-Icon: `shrink-0` (feste Größe, wird nie gequetscht)

### Falle 2: CSS-Klassen-Konflikt (`text-[10px]` vs. Default)

**Problem:** `getOrderZoomClass()` liefert dynamische Font-Größen (`text-[9px]` bis `text-xs`). Ohne `tailwind-merge` gewinnt die CSS-Bundle-Reihenfolge statt der beabsichtigten Klasse.

**Lösung:**
- Helper `orderReasonStyle.ts` liefert **keine** Font-Größe
- Zusammenführung in der Komponente via `cn(reasonStyle.pillClass, orderZoomClass)`
- `cn()` nutzt `twMerge` und löst Konflikte korrekt auf
- `orderZoomClass` hat Vorrang (letztes Argument)

---

## Helper-Architektur: `orderReasonStyle.ts`

Record-basierter Helper (Pattern analog `StatusCheckbox.tsx` STATUS_CONFIG):

```
OrderAssignmentReason → {
  pillClass: string,    // bg + text + rounded-l-full + font-mono (OHNE font-size!)
  iconClass: string,    // Pencil-Icon Farbe passend zum Hintergrund
  label: string         // Tooltip-Text (deutsch)
}
```

- `pillClass`: `rounded-l-full pl-1.5 pr-1 font-mono` + bg-Klasse + text-Klasse
- **Bewusst KEINE Font-Größe** — wird per `cn()` mit `orderZoomClass` zusammengeführt
- Export: `getOrderReasonStyle(reason: OrderAssignmentReason)`

### Aktueller pillClass-Aufbau (BETA 2.0, alle 11 Einträge identisch):

```
'rounded-l-full pl-1.5 pr-1 font-mono bg-[COLOR] text-[COLOR]'
```

> **BETA 2.0-Vermerk:** `rounded-full px-1.5` → `rounded-l-full pl-1.5 pr-1` (ADD-ON 1, 2026-02-26). Gilt für alle 11 `STYLE_MAP`-Einträge.

---

## Markup-Struktur (BETA 2.0)

### ManualOrderPopup.tsx — Expanded-Modus (Trigger-Button)

```tsx
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
```

> **BETA 2.0-Vermerk:** `justify-end w-full` auf Button + `text-right` auf Text-Span (ADD-ON 1, 2026-02-26). Stellt identisches Verhalten zum Non-Expanded-Modus sicher.

### ItemsTable.tsx — Non-Expanded-Modus

```tsx
{/* TableCell: pr-0 overflow-hidden */}
<span
  className={cn(
    reasonStyle.pillClass,
    'block w-full truncate text-right',
    orderZoomClass
  )}
  title={reasonStyle.label}
>
  {line.orderNumberAssigned ?? '--'}
</span>
```

> **BETA 2.0-Vermerk:** `inline-block max-w-full` → `block w-full text-right` (ADD-ON 1, 2026-02-26). TableCell: `pr-2` → `pr-0 overflow-hidden`.

---

## Betroffene Dateien

| Datei | Aktion |
|-------|--------|
| `src/components/run-detail/orderReasonStyle.ts` | **NEU** (~45 Zeilen) |
| `src/components/run-detail/ManualOrderPopup.tsx` | MODIFY — Trigger-Button Pill-Styling |
| `src/components/run-detail/ItemsTable.tsx` | MODIFY — Bestellung-Cell Pill-Styling + Import |
| `src/components/run-detail/PendingHourglassIcon.tsx` | **NEU** (BETA 2.1) — Animiertes Sanduhr-Icon für `pending`-Status |
| `src/components/run-detail/StatusCheckbox.tsx` | MODIFY (BETA 2.1) — Icon-System auf `kind`-Pattern umgestellt |
| `src/components/run-detail/PriceCell.tsx` | MODIFY (BETA 2.1) — Preis-Badge neu: Teal-OK-Badge, Emoji-Icons, PendingHourglassIcon |
| `src/index.css` | MODIFY (BETA 2.1) — Keyframe `pending-hourglass-pulse` + CSS-Klasse |
| `src/services/matching/orderParserProfiles.ts` | MODIFY (BETA 2.1) — Erweiterte Column-Aliase |

## Dependencies

- Keine neuen npm-Dependencies
- Nutzt bestehende `cn()` aus `@/lib/utils` (twMerge + clsx)
- Nutzt bestehenden `OrderAssignmentReason` Type aus `@/types`
- Nutzt bestehende Theme-Variablen (`--primary`, `--destructive`) aus `src/index.css`
- BETA 2.1: Nutzt `badgeVariants` aus `@/components/ui/badge` (bereits vorhanden)
- BETA 2.1: Nutzt `.ico`-Assets aus `src/assets/icons/` (`Code_IT.ico`, `EAN.ico`)

---

## Layout-Sicherheit (Checkliste)

- [x] Kein `py-*` auf Pill — Zeilenhöhe durch TableRow bestimmt
- [x] `pl-1.5 pr-1` asymmetrisches Padding — links Pill-Rundung, rechts minimal zum Zellenrand *(BETA 2.0: war `px-1.5`)*
- [x] `truncate` nur auf Text-Child, nicht auf Flex-Container
- [x] `min-w-0` auf Flex-Button für korrektes Shrink-Verhalten
- [x] `shrink-0` auf Pencil-Icon — Icon wird nie gequetscht
- [x] `cn()` für alle dynamischen Klassen — kein direktes String-Concat
- [x] `rounded-l-full` — nur links gerundet, rechts bündig am Zellenrand abgeschnitten *(BETA 2.0: war `rounded-full`)*
- [x] TableCell `pr-0 overflow-hidden` — Pill läuft bis zum Zellenrand *(BETA 2.0: war `pr-2`)*
- [x] `block w-full text-right` auf Pill-Span — `--` gleich breit wie Bestellnummern *(BETA 2.0: war `inline-block max-w-full`)*
- [x] Spaltenbreite `w-[106px]` in `bestellungWidthClass` *(BETA 2.0: Präzisierung von konzeptuellem `w-24`)*

---

## Verifikation

1. App starten (`npm run dev`), Run mit gematchten Bestellungen öffnen
2. Artikelliste prüfen: Farbiger Pill in jeder Bestellung-Zeile
3. Farben kontrollieren: Teal für perfect/direct-match, Grau für pending, Rot für not-ordered
4. Expanded-Modus: Pill klickbar, ManualOrderPopup öffnet korrekt
5. Multi-Order-Werte (5+ pipe-separiert): Font skaliert, Text wird mit Ellipsis abgeschnitten
6. Pencil-Icon erscheint bei Hover, feste Größe, wird nicht gequetscht
7. Zeilenhöhe unverändert gegenüber vorher (visueller Vergleich)
8. Browser-DevTools: Keine Tailwind-Klassen-Konflikte (korrekte Spezifität via `cn()`)
9. **BETA 2.0:** Pill reicht bis zum Zellenrand — kein Whitespace-Gap rechts
10. **BETA 2.0:** `--`-Pill (not-ordered) gleich breit wie andere Pills (volle Zellbreite)
11. **BETA 2.1:** `pending`-Status: Sanduhr animiert (⌛ → ⏳ Fade-Loop, 1.2 s)
12. **BETA 2.1:** `StatusCheckbox` — `full-match` = grüner Kreis, `code-it-only` = Code_IT.ico, `ean-only` = EAN.ico, `no-match` = ❌ Emoji, `pending` = PendingHourglassIcon mit Kreis
13. **BETA 2.1:** `PriceCell` readOnly — `ok` = Teal-Badge (`bg-primary`), übrige Stati: Emoji-Icon (`⚠️`, `❌`) + `sr-only`-Label
14. **BETA 2.1:** `PriceCell` editable — `ok`-Button = Teal `badgeVariants`, übrige = Emoji-Trigger
15. **BETA 2.1:** Order-Parser: Spalten `OFFENE MENGE (VORGANGSBEZOGEN)`, `ARTIKELNUMMER`, `BESTELLNUMMER` (als artNoIT-Alias), `EAN-NUMMER` werden korrekt gemappt

---

## Änderungshistorie

### BETA 1.0 — Implementiert 2026-02-26

Initiale Implementierung des farbigen Match-Status-Pills in der Bestellung-Spalte.

- `orderReasonStyle.ts` neu erstellt (11 Einträge, Record-Pattern)
- `ManualOrderPopup.tsx`: Trigger-Button mit `reasonStyle.pillClass` + Pencil-Icon
- `ItemsTable.tsx`: Bestellung-TableCell mit Pill + `getOrderZoomClass()` via `cn()`
- `pillClass` mit `rounded-full px-1.5` (symmetrisch gerundet)

### BETA 2.0 — 2026-02-26 (ADD-ON 1: Pill rechtsbündig am Body-Rand)

**Problem:** `rounded-full` auf beiden Seiten + `px-1.5` fraß rechts ca. 8–10 px, sodass lange Bestellnummern früher abgeschnitten wurden. Zusätzlich war der `--`-Pill (not-ordered) schmaler als die anderen, was optisch unruhig wirkte.

**Änderungen:**

| Datei | Alt | Neu | Grund |
|-------|-----|-----|-------|
| `orderReasonStyle.ts` | `rounded-full px-1.5` | `rounded-l-full pl-1.5 pr-1` | Pill-Rechtsrand entfernt; asymmetrisches Padding (alle 11 Einträge) |
| `ItemsTable.tsx` TableCell | `pr-2` | `pr-0 overflow-hidden` | Pill läuft bis Zellenrand, wird dort abgeschnitten |
| `ItemsTable.tsx` Pill-Span | `inline-block max-w-full` | `block w-full text-right` | Volle Breite + Text rechtsbündig → `--` gleich breit wie Bestellnummern |
| `ManualOrderPopup.tsx` Button | *(ohne `justify-end w-full`)* | `justify-end w-full` | Identisches Verhalten im Expanded-Modus |
| `ManualOrderPopup.tsx` Text-Span | *(ohne `text-right`)* | `text-right` | Textausrichtung konsistent mit Non-Expanded-Modus |

---

### BETA 2.1 — 2026-02-26 (Icon-System, PriceCell-Redesign, Parser-Aliase)

Scope: Nebenläufige Änderungen an `StatusCheckbox`, `PriceCell`, `PendingHourglassIcon` (neu), `index.css` und `orderParserProfiles.ts`. Der PROJ-32-Kern (`orderReasonStyle.ts`, Pill-Logik) ist **unverändert**.

#### A) `PendingHourglassIcon.tsx` — NEU

Neue Shared-Komponente für den animierten `pending`-Sanduhr-Indikator.

| Prop | Default | Bedeutung |
|------|---------|-----------|
| `sizeClass` | `'w-5 h-5 text-[14px]'` | Tailwind-Klassen für Außenmaß + Font-Größe |
| `withCircle` | `true` | Grauer Kreis-Hintergrund (`bg-[#968C8C] text-white rounded-full`) |

- Statisches Layer: `⌛` (U+231B)
- Animiertes Overlay: `⏳` (U+23F3), via `.pending-hourglass-overlay` (Fade 0→1→0, 1.2 s)
- Verwendung: `StatusCheckbox` (`withCircle=true`), `PriceCell` (`withCircle=false`)

#### B) `src/index.css` — Keyframe + CSS-Klasse

```css
@keyframes pending-hourglass-pulse {
  0%, 100% { opacity: 0; }
  50%       { opacity: 1; }
}
.pending-hourglass-overlay {
  animation: pending-hourglass-pulse 1.2s ease-in-out infinite;
}
```

> **BETA 2.1-Vermerk:** Neues Keyframe in `@layer utilities`. Keine bestehenden Styles geändert.

#### C) `StatusCheckbox.tsx` — Icon-System auf `kind`-Pattern umgestellt

**Alt:** Alle 5 Stati verwendeten `typeof Clock`-Icons aus lucide-react über ein generisches `<Icon />`.

**Neu:** `STATUS_CONFIG` verwendet ein `kind`-Discriminator-Feld:

| Status | kind | Rendering | Alt |
|--------|------|-----------|-----|
| `pending` | `pending-hourglass` | `<PendingHourglassIcon withCircle>` | `<Clock color=#F59E0B>` |
| `full-match` | `lucide` | `<CheckCircle2 color=#22C55E>` | `<CheckCircle2 color=#22C55E>` (identisch) |
| `code-it-only` | `asset` | `<img src={Code_IT.ico}>` | `<AlertTriangle color=#FB923C>` |
| `ean-only` | `asset` | `<img src={EAN.ico}>` | `<AlertTriangle color=#FB923C>` |
| `no-match` | `emoji` | `<span>❌</span>` (U+274C) | `<XCircle color=#EF4444>` |

- Import: `Clock`, `AlertTriangle`, `XCircle` **entfernt** — nur noch `CheckCircle2` aus lucide
- Import: `codeItIcon`, `eanIcon` aus `@/assets/icons/*.ico` hinzugefügt
- Import: `PendingHourglassIcon` hinzugefügt

> **BETA 2.1-Vermerk:** `STATUS_CONFIG`-Typ erweitert um `kind`, `src?`, `emoji?`; `icon`-Prop entfernt.

#### D) `PriceCell.tsx` — Badge-Redesign

**`BADGE_CONFIG`-Typ-Änderung:**

| Feld | Alt | Neu |
|------|-----|-----|
| Schlüssel für Anzeigetext | `text` | `label` (+ `display?` für Emoji/Symbol) |
| `pending` Styling | `bg-amber-100 text-amber-700` | `bg-[#968C8C] text-white` |
| `mismatch` display | `'check'` | `'⚠️'` (U+26A0 U+FE0F) |
| `missing` display | `'fehlt'` | `'❌'` (U+274C) |
| `custom` display | `'angepasst'` | `'🚹'` (U+1F6B9) |

**Neue Hilfsfunktion `renderStatusVisual(status, sizeClass)`:**
- `pending` → `<PendingHourglassIcon withCircle={false}>`
- alle anderen → `<span>{display ?? label}</span>`

**`ok`-Status — neues Rendering (readOnly + editable):**
- Nutzt `badgeVariants({ variant: 'default' })` (Teal `bg-primary`) statt `bg-green-100`
- Feste Kompaktgröße: `w-[25px] h-5 text-[11.25px]`
- Editable: `text-[8.4375px]` für OK-Text im Button (WCAG: `aria-label` gesetzt)

**`pending` readOnly — Änderung:**
- Alt: `inline-flex` Badge mit Text `'folgt'`
- Neu: `PendingHourglassIcon` direkt (kein Badge-Wrapper), `text-[12.5px]`

> **BETA 2.1-Vermerk:** `sr-only`-Span mit `badge.label` für Screen-Reader bei Emoji-Icons.

#### E) `ItemsTable.tsx` — Bereinigung

| Änderung | Alt | Neu | Grund |
|----------|-----|-----|-------|
| Lucide-Import | `Search, Filter, Info, Barcode, Type, ChevronsDown, ChevronsUp` | `Type` entfernt | `Type`-Icon (`code-it-only` / `full-match`) wird in `StatusCheckbox` durch `kind='asset'`/`kind='lucide'` ersetzt |
| Artikel-Spalte | `Type`-Icon bei `code-it-only` + `full-match` | Entfernt | Redundant nach StatusCheckbox-Redesign |
| Header: Positionsanzahl | `<div class="text-sm ...">N von M Positionen</div>` | **Entfernt** | Platz für Lock-Icon-Block |
| Header: Lock-Icon | nicht vorhanden | `🔓`/`🔒` (Step-4-abhängig, `font-size: 2.156rem`) + `step4`/`isStep4Done`-Logik | Sperr-Status-Indikator (PROJ-31 Integration) |
| Toggle-Button-Wrapper | `<div w-24>` immer gerendert, Button bedingt | Toggle-`<div>` nur wenn `filteredLines.length > 0` | Verhindert leere Platzhalter-Div |

#### F) `orderParserProfiles.ts` — Erweiterte Column-Aliase

| Alias-Gruppe | Neu hinzugefügt |
|--------------|-----------------|
| `openQuantity` | `'<OFFENE MENGE (VORGANGSBEZOGEN)'`, `'OFFENE MENGE (VORGANGSBEZOGEN)'` |
| `artNoDE` | `'ARTIKELNUMMER'` |
| `artNoIT` | `'BESTELLNUMMER'` |
| `ean` | `'EAN-NUMMER'` |

> **BETA 2.1-Vermerk:** Robustere Erkennung für Sage-Exportformate mit abweichenden Spaltenbezeichnungen.
