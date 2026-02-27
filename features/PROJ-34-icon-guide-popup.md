# PROJ-34: Icon-Guide Popup

**Status:** Done
**Datum:** 2026-02-26
**Baut auf:** PROJ-22, PROJ-32, PROJ-33

---

## Ziel

Neues "Legende"-Popup als visuelle Referenz fuer alle Icons und Farbcodes in den Run-Detail-Tabellen. Oeffnet ueber einen neuen Button im AppFooter (zwischen "Datenverzeichnis" und "Einstellungen"). Single Source of Truth: Jedes Icon in der Legende wird ueber dieselbe Komponente/denselben Helper gerendert wie in den Tabellen — keine Duplikation von Farben, Klassen oder Assets.

---

## Architektur-Leitsaetze

1. **SSOT (Single Source of Truth):** Legende importiert echte Komponenten (`StatusCheckbox`, `SerialStatusDot`, `PendingHourglassIcon`), echte Helper (`getOrderReasonStyle`, `BADGE_CONFIG`) und echte Assets (`Code_IT.ico`, `EAN.ico`). Keine Duplikation.
2. **KISS Footer-Button:** Uebernimmt exakt das bestehende Hover-Pattern (useState + Inline-Styles mit `HOVER_BG`/`HOVER_TEXT`/`HOVER_BORDER`) — konsistent mit Nachbar-Buttons.
3. **Kein Inline-Style im Dialog:** Background via Tailwind `bg-[#D8E6E7]`, nicht via `style={{ }}`.
4. **Perfekte Flucht:** Button als direkter Geschwister-Knoten im Footer-Flex-Container, automatischer `gap-6` Abstand.

---

## Umgesetzt

### 1) SerialStatusDot extrahieren (SSOT-Refactor)

**Problem:** Der Serial-Ampel-Code (w-3 h-3 Quadrat, 3 Farbzustaende) ist identisch in zwei Dateien inline dupliziert:
- `ItemsTable.tsx` (Zeile 317-331)
- `InvoicePreview.tsx` (Zeile 379-392)

**Loesung:** Neue Komponente `src/components/run-detail/SerialStatusDot.tsx`:

```tsx
interface SerialStatusDotProps {
  serialRequired: boolean;
  serialAssigned: boolean;
}
```

Rendert `<span className="inline-block w-3 h-3 rounded-sm border" style={{...}} />` mit 3 Zustaenden:
- Schwarz: bg `#000000`, border `#000000` (nicht S/N-pflichtig)
- Hellgrau: bg `#E5E7EB`, border `#9CA3AF` (S/N-pflichtig, offen)
- Gruen: bg `#22C55E`, border `#16A34A` (S/N zugeteilt)

Kein Tooltip — der bleibt kontextabhaengig in den Tabellen.

Refactor: Beide Tabellen ersetzen den duplizierten `<span style={{...}}>` durch `<SerialStatusDot>`. Die umschliessenden `<Tooltip>` Wrapper bleiben unveraendert.

### 2) BADGE_CONFIG aus PriceCell exportieren

**Problem:** `BADGE_CONFIG` in `PriceCell.tsx` (Zeile 21) ist `const` — nicht exportiert. Fuer SSOT muss die Legende Zugriff auf die echten Badge-Klassen haben.

**Loesung:** `const BADGE_CONFIG` -> `export const BADGE_CONFIG` (1 Wort hinzufuegen).

### 3) IconGuidePopup-Komponente

Neue Datei: `src/components/IconGuidePopup.tsx`

#### Dialog-Shell
- `Dialog` + `DialogContent` mit `className="max-w-[600px] w-full bg-[#D8E6E7]"`
- `DialogHeader` -> `DialogTitle`: **"Legende:"**
- X-Close: built-in shadcn DialogContent
- Footer: "Schliessen"-Link (exakte Kopie von SettingsPopup Zeile 832-841)

#### Scroll-Container
`<div className="max-h-[70vh] overflow-y-auto space-y-4 mt-2 pr-1">`

#### 4 Sektionen mit `<Separator />` Trennlinien

**Sektion 1 — PDF-Parser:**
- Beschreibung: "Liest und parst die Rechnungs-PDF und extrahiert Kopfdaten sowie alle Rechnungspositionen."
- Hinweis: "Einstiegspunkt — keine Status-Icons in den Tabellen."

**Sektion 2 — Artikel extrahieren:**
- Beschreibung: "Der Artikel-Matcher gleicht die Rechnungspositionen automatisch gegen die Stammdaten ab (Code-IT, EAN) und identifiziert passende Falmec-Artikelnummern."

Untergruppe "- MATCH" — echte `<StatusCheckbox>`:

| Status-Prop | Rendering | Legenden-Text |
|-------------|-----------|---------------|
| `pending` | Animierte Sanduhr im grauen Kreis | Check folgt |
| `full-match` | Gruener CheckCircle2 | Match gefunden |
| `code-it-only` | Code_IT.ico Asset | Nur per Code-IT gematcht |
| `ean-only` | EAN.ico Asset | Nur per EAN gematcht |
| `no-match` | Rotes X Emoji | Kein Match |

Untergruppe "PREIS / CHECK" — echte `BADGE_CONFIG`-Klassen aus PriceCell:

| Status | Visual (SSOT) | Legenden-Text |
|--------|---------------|---------------|
| `pending` | Sanduhr auf `bg-[#968C8C] text-white` | Preis-Check folgt |
| `ok` | "OK" auf `bg-green-100 text-green-700` | Preis stimmt ueberein |
| `mismatch` | Warnung auf `bg-yellow-100 text-yellow-700` | Preisabweichung |
| `missing` | X auf `bg-red-100 text-red-700` | Preis fehlt |
| `custom` | Emoji auf `bg-blue-100 text-blue-700` | Preis manuell angepasst |

**Sektion 3 — Serial parsen:**
- Beschreibung: "Der Serial-Finder holt sich jede Seriennummer mit den entsprechenden Artikelnummern und teilt sie logisch den offenen Positionen zu."
- Vorab-Erklaerung: "Das Icon zeigt anhand der Faerbung ob ein Artikel seriennummernpflichtig ist und somit mit Seriennummer eingebucht werden muss."

Echte `<SerialStatusDot>`:

| Props | Visual | Legenden-Text |
|-------|--------|---------------|
| `serialRequired={true} serialAssigned={false}` | Hellgrau | S/N-pflichtig, noch nicht zugeteilt |
| `serialRequired={false} serialAssigned={false}` | Schwarz | Nicht S/N-pflichtig |
| `serialRequired={true} serialAssigned={true}` | Gruen | S/N erfolgreich zugeteilt |

**Sektion 4 — Bestellung mappen:**
- Beschreibung: "Der Order-Mapper ordnet offene Bestellpositionen automatisch den Rechnungspositionen zu und zeigt den Zuweisungsgrund farblich an."

Echte Pills via `getOrderReasonStyle()` — ein Repraesentant pro Farbgruppe:

| Reason-Key | Farbgruppe | Legenden-Text |
|------------|------------|---------------|
| `perfect-match` | Teal | Perfekter / Direkter / Exakter Match, Manuell bestaetigt |
| `reference-match` | Blau | Referenz-Match, Smart-Qty-Match |
| `oldest-first` | Amber | Aelteste zuerst (Fallback), FIFO-Fallback |
| `manual` | Violett | Manuell zugewiesen |
| `pending` | Grau | Ausstehend |
| `not-ordered` | Rot | Nicht bestellt |

#### Imports (alle SSOT)
```
Dialog, DialogContent, DialogHeader, DialogTitle   <- @/components/ui/dialog
Separator                                           <- @/components/ui/separator
StatusCheckbox                                      <- ./run-detail/StatusCheckbox
PendingHourglassIcon                                <- ./run-detail/PendingHourglassIcon
SerialStatusDot                                     <- ./run-detail/SerialStatusDot
BADGE_CONFIG                                        <- ./run-detail/PriceCell
getOrderReasonStyle                                 <- ./run-detail/orderReasonStyle
cn                                                  <- @/lib/utils
OrderAssignmentReason, PriceCheckStatus, MatchStatus <- @/types
```

### 4) AppFooter-Button

Neuer Button zwischen `[2] Datenverzeichnis` und `[3] Einstellungen` in `src/components/AppFooter.tsx`.

**Imports:**
- `BookOpen` zu lucide-react Import
- `import { IconGuidePopup } from '@/components/IconGuidePopup';`

**State:**
```tsx
const [isGuideHovered, setIsGuideHovered] = useState(false);
const [guideOpen, setGuideOpen] = useState(false);
```

**Button-Markup** (exakte Kopie Einstellungen-Pattern):
```tsx
{/* [2b] Icon-Guide / Legende */}
<div className="flex flex-col gap-0.5">
  <Label className="text-xs text-sidebar-foreground text-left">
    Icon-Guide:
  </Label>
  <button
    onClick={() => setGuideOpen(true)}
    onMouseEnter={() => setIsGuideHovered(true)}
    onMouseLeave={() => setIsGuideHovered(false)}
    className="h-7 px-3 text-xs rounded-md flex items-center gap-1.5 transition-all duration-200 border"
    style={{
      backgroundColor: isGuideHovered ? HOVER_BG : '#c9c3b6',
      color: isGuideHovered ? HOVER_TEXT : '#666666',
      borderColor: isGuideHovered ? HOVER_BORDER : '#666666',
    }}
    title="Icon-Legende anzeigen"
  >
    <BookOpen className="w-3.5 h-3.5" />
    <span>Legende</span>
  </button>
</div>
```

**Flucht-Analyse:** Datenverzeichnis und Einstellungen sind direkte Geschwister im aeusseren Flex-Container (`gap-6`). Der neue Button wird als Geschwister dazwischen eingefuegt — automatisch gleicher Abstand.

**Popup-Render** nach `<SettingsPopup>`:
```tsx
<IconGuidePopup open={guideOpen} onOpenChange={setGuideOpen} />
```

---

## Nicht geaendert

- Keine Aenderung an Store/Types/Services (ausser `BADGE_CONFIG` Export)
- Keine Aenderung an bestehenden Icon-Logiken
- Serial-Refactor: Reines SSOT-Refactoring, kein Verhaltens- oder Optik-Unterschied

---

## Betroffene Dateien (gesamt)

| Datei | Aktion |
|-------|--------|
| `src/components/IconGuidePopup.tsx` | **NEU** — Popup-Komponente |
| `src/components/run-detail/SerialStatusDot.tsx` | **NEU** — Extrahierte Serial-Ampel (SSOT) |
| `src/components/run-detail/PriceCell.tsx` | **MODIFY** — `BADGE_CONFIG` exportieren |
| `src/components/run-detail/ItemsTable.tsx` | **MODIFY** — Serial-Inline -> `<SerialStatusDot>` |
| `src/components/run-detail/InvoicePreview.tsx` | **MODIFY** — Serial-Inline -> `<SerialStatusDot>` |
| `src/components/AppFooter.tsx` | **MODIFY** — Button + State + Import + Popup |

## Dependencies

- Keine neuen npm-Dependencies
- Nutzt bestehende `cn()` aus `@/lib/utils`
- Nutzt bestehende shadcn-Komponenten (`Dialog`, `Separator`)
- Nutzt bestehende Assets (`Code_IT.ico`, `EAN.ico`)
- Nutzt bestehende Helper (`getOrderReasonStyle`, `BADGE_CONFIG`)
- Nutzt bestehende Komponenten (`StatusCheckbox`, `PendingHourglassIcon`)

---

## Verifikation

1. `npm run build` — keine TS-Fehler
2. App starten (`npm run dev`), Footer aufklappen
3. "Icon-Guide"-Button sichtbar zwischen "Datenverzeichnis" und "Einstellungen"
4. Button-Hover: identisch mit Einstellungen-Button (#008C99 bg, weiss, #D8E6E7 border)
5. Klick oeffnet Popup mit Titel "Legende:" auf `bg-[#D8E6E7]`
6. 4 Sektionen mit `<Separator />` Trennlinien sichtbar
7. MATCH-Icons: echte `<StatusCheckbox>` — Sanduhr animiert, .ico Assets geladen
8. PREIS-Badges: echte `BADGE_CONFIG`-Klassen — Farben identisch mit Tabelle
9. Serial-Dots: echte `<SerialStatusDot>` — 3 Farben korrekt
10. Bestell-Pills: echte `getOrderReasonStyle().pillClass` — 6 Farbgruppen korrekt
11. X-Button (oben rechts) schliesst Popup
12. "Schliessen"-Link (unten rechts) schliesst Popup
13. Popup scrollbar bei kleinem Viewport
14. **Regressions-Check:** ItemsTable + InvoicePreview Serial-Spalte unveraendert (identisches Rendering ueber `SerialStatusDot`)

---

## Hotfix: Footer Layout-Bug (2026-02-26)

**Problem:** Nach Einfuehrung des Legende-Buttons verschoben sich RE-Positionen und Artikelliste nach oben (um ca. Button-Hoehe). Ursache: Footer-Flex-Container ohne explizites `flex-nowrap` — bei 7 Kindern + Gaps (>= 1195px Mindestbreite) verursachte der Ueberlauf eine Layout-Verschiebung durch ungewollten Flex-Wrap.

**Was NICHT die Ursache war:** `<IconGuidePopup>` als Ghost-Element — Radix Dialog.Root rendert bei `open={false}` keinen DOM-Node (nur Context Provider, kein `forceMount`). Bestaetigt durch Quellcode-Analyse in `@radix-ui/react-dialog`.

**Fix:**

| Datei | Aenderung | Grund |
|-------|-----------|-------|
| `AppFooter.tsx` Container | `flex-nowrap overflow-x-auto` | Verhindert Zeilenumbruch; bei schmalem Viewport horizontaler Scroll statt Abschneiden |
| `AppFooter.tsx` Legende-Div | `shrink-0` | Button darf nicht auf 0px komprimiert werden |
| `AppFooter.tsx` Einstellungen-Div | `shrink-0` | Button darf nicht auf 0px komprimiert werden |
| `AppFooter.tsx` Datenverzeichnis-Div | `min-w-0` | Erlaubt Shrink bei extremem Platzmangel |

**BEWUSST KEIN `overflow-hidden`:** Wuerde bei schmalen Viewports die rechten Buttons abschneiden — User koennten Einstellungen/Legende nicht mehr erreichen.
