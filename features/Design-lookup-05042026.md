# Design-Lookup — IST-Zustand Inventarisierung

> **Datum:** 2026-04-05
> **Scope:** Inventarisierung harter Tailwind-Klassen (Farben, Spacing, Radius) in Custom-UI-Komponenten
> **Ausgeschlossen:** `src/components/ui/*` (shadcn-generiert), Test-Dateien
> **Zweck:** Grundlage für Konsolidierung in STANDARDS.md (S5 — Design-System & UI-Konsistenz)
> **Umfang:** 58 Custom-Komponenten gescannt, 127+ Tailwind-Klassen-Instanzen + 40+ Inline-Styles erfasst
>
> **Hinweis:** Dies ist eine reine IST-Bestandsaufnahme. Kein Umsetzungsplan, kein Code-Change.

---

## 1. Kategorie: Pop-Ups / Modals / Dialogs

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `IssueDialog.tsx:182` | `rounded-lg border border-slate-200/60 bg-white/30 p-3 space-y-2` | Generischer Panel-Container |
| `IssueDialog.tsx:464` (style) | `backgroundColor: '#D8E6E7'` | Dialog-Background (Teal-tint) |
| `IssueDialog.tsx:545` | `rounded-lg border-2 border-teal-400/50 bg-white/40 p-3` | Teal-Panel (Kandidat-Auswahl) |
| `IssueDialog.tsx:575` | `rounded-lg border-2 border-teal-400/50 bg-white/40 p-3 space-y-3` | Teal-Panel (Kandidat-Liste) |
| `IssueDialog.tsx:718` | `rounded-lg border-2 border-teal-400/60 bg-teal-50/20 p-3 space-y-1` | Teal-Panel (Lagerort-Zuweisung) |
| `IssueDialog.tsx:737` | `rounded-lg border-2 border-teal-400/60 bg-teal-50/20 p-3 space-y-2` | Teal-Panel (Detail-Anzeige) |
| `IssueDialog.tsx:773` | `rounded-lg border-2 border-teal-400/60 bg-teal-50/20 p-3 space-y-2` | Teal-Panel (Artikelliste) |
| `IssueDialog.tsx:817` | `rounded-lg border-2 border-teal-400/60 bg-teal-50/20 p-3 space-y-1` | Teal-Panel (Betroffene Positionen) |
| `IssueDialog.tsx:645` | `rounded border border-orange-300/40 bg-orange-50/5 py-1.5 px-3 text-xs text-orange-700` | Orange-Warnpanel (dünn) |
| `IssueDialog.tsx:709` | `rounded border border-orange-300/60 bg-orange-50/10 p-2 text-xs text-orange-700` | Orange-Warnpanel (dick) |
| `IssueDialog.tsx:955` | `rounded border border-amber-300/40 bg-amber-50/10 p-3 space-y-2` | Amber-Warnpanel |
| `DetailPopup.tsx:103,119-120` (style) | `#2a3f45`, `#1e2e33`, `#4a6570`, `#93b5bc` | Dark Inverted Dialog |
| `DetailPopup.tsx` (style) | `#D8E6E7` | Dialog-Text (hell auf dunkel) |
| `IconGuidePopup.tsx:96` (style) | `backgroundColor: '#D8E6E7'` | Dialog-Background |
| `OverrideEditorModal.tsx:238` (style) | `backgroundColor: '#D8E6E7'` | Modal-Background |
| `NewRun.tsx:269,296` (style) | `backgroundColor: '#D8E6E7'` | Dialog-Background |
| `RunDetail.tsx:1019` (style) | `backgroundColor: '#D8E6E7'` | AlertDialog-Background |
| `ArchiveDetailDialog.tsx:54` (style) | `backgroundColor: '#D8E6E7'` | Dialog-Background |
| `ManualOrderPopup.tsx`, `SerialFixPopup.tsx` | (shadcn Dialog, Wrapper-Style unklar) | Weitere Popups |

**Beobachtung:** Alle Popups nutzen den Hex-Background `#D8E6E7` via Inline-Style — konsistent, aber außerhalb des Tailwind-Systems. Panel-Container innerhalb der Dialoge variieren zwischen `rounded`, `rounded-lg` und Border-Opacity `/40`, `/50`, `/60`.

---

## 2. Kategorie: Info-/Warn-Panels & Alerts (Banner innerhalb Pages)

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `RunDetail.tsx:986` | `flex items-start gap-3 rounded-md border border-amber-400/50 bg-amber-50/10 px-4 py-3 text-sm mb-4` | Soft-Fail Summen-Konflikt |
| `RunDetail.tsx:987` | `text-amber-400` (Icon), `text-amber-300` (Text) | Alert-Inhalt |
| `IssuesCenter.tsx:575` | `flex items-start gap-3 rounded-md border border-amber-300/50 bg-amber-50/10 px-4 py-3 text-sm` | Empty-State Banner |
| `IssuesCenter.tsx:577,579` | `text-amber-400` (Icon), `text-amber-300` (Text) | Alert-Inhalt |
| `NewRun.tsx:272` | `text-red-600` (Icon), `text-red-700` (Liste) | Fehler-Liste im Dialog |
| `NewRun.tsx:234` | `text-sm text-yellow-600` | Dateiverzeichnis-Warnung |
| `ItemsTable.tsx:317` | `bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5 text-xs` | Filter-Banner |
| `InvoicePreview.tsx:431` | `bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5 text-xs` | Filter-Banner (identisch) |

**Beobachtung:** RunDetail und IssuesCenter nutzen dieselbe Struktur mit **zwei leicht unterschiedlichen Border-Opacities** (`amber-400/50` vs `amber-300/50`). ItemsTable/InvoicePreview sind byte-gleich — bereits konsolidierbar.

---

## 3. Kategorie: Cards / Tiles

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `KPITile.tsx:49,65` | `text-emerald-50` (wenn verified), `text-muted-foreground` (default) | KPI-Tile Text-Farbe |
| `KPITile.tsx` | CSS-Klasse `kpi-tile-label` (extern definiert) | Label-Styling via CSS |
| `ArchiveDetailDialog.tsx:102` | `p-3 border-b bg-muted/30` | Card-Header |
| `ArchiveDetailDialog.tsx:143` | `w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50` | Folder-Toggle |
| `ArchiveDetailDialog.tsx:162` | `flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/30 group` | File-Item |

**Beobachtung:** KPITile nutzt bereits teilweise semantische Tokens. ArchiveDetailDialog ist weitgehend konform zu `bg-muted/*`.

---

## 4. Kategorie: Badges / Chips / Pills

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `StatusChip.tsx:60` | `bg-blue-500/20 text-blue-400` | Info-Severity |
| `PriceCell.tsx:29` | `bg-green-100 text-green-700` | Preis-OK (hell) |
| `PriceCell.tsx:30` | `bg-yellow-100 text-yellow-700` | Preis-Mismatch (hell) |
| `PriceCell.tsx:31` | `bg-red-100 text-red-700` | Preis-Missing (hell) |
| `PriceCell.tsx:32` | `bg-blue-100 text-blue-700` | Preis-Custom (hell) |
| `PriceCell.tsx:28` (style) | `backgroundColor: '#968C8C'` + `text-white` | Preis-Pending |
| `PriceCell.tsx:104,135,166` | `px-1.5 py-px` | Badge-Padding (sehr eng) |
| `DetailPopup.tsx:80` | `bg-green-700/30 text-green-300` | Preis-OK (dunkel gedimmt) |
| `DetailPopup.tsx:81` | `bg-yellow-700/30 text-yellow-300` | Preis-Mismatch (dunkel) |
| `DetailPopup.tsx:82` | `bg-red-700/30 text-red-300` | Preis-Missing (dunkel) |
| `DetailPopup.tsx:83` | `bg-blue-700/30 text-blue-300` | Preis-Custom (dunkel) |
| `DetailPopup.tsx:84` | `bg-gray-700/30 text-gray-400` | Preis-Fallback (dunkel) |
| `DetailPopup.tsx:79` | `px-2 py-0.5 rounded-full` | Badge-Padding |
| `RunDetail.tsx:833` | `ml-1.5 text-xs px-1.5 py-0.5 rounded bg-green-100 text-[#14532d]` | Tab-Count-Badge |
| `RunDetail.tsx:848` (style) | `backgroundColor: '#008c99'`, `color: '#ffffff'` | Tab-Count-Badge (teal) |
| `RunDetail.tsx:858` | `bg-[#d6b8ab] text-[#7a1f12] px-1.5 py-0.5 rounded` | Tab-Count-Badge (braun/rot) |
| `Index.tsx:390,404` | `px-2 py-0.5` | Download-Button Pill |
| `IssuesCenter.tsx:557` | `text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40` | Count-Badge |
| `IssuesCenter.tsx:640` | `ml-2 text-xs font-normal normal-case px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40` | Count-Badge (identisch) |
| `IconGuidePopup.tsx:135` | `inline-flex items-center justify-center rounded px-1 py-0.5 bg-blue-100 text-blue-700` | Legend-Badge |
| `IconGuidePopup.tsx:84,216` | `px-1.5 py-0.5` / `py-0.5` | Legend-Badge-Padding |

**Beobachtung:** **Badge-Padding ist extrem inkonsistent** — `px-1 py-0.5`, `px-1.5 py-0.5`, `px-1.5 py-px`, `px-2 py-0.5` für semantisch identische Elemente.

---

## 5. Kategorie: Order-Reason Pills (orderReasonStyle.ts)

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `orderReasonStyle.ts:47` | `rounded-l-full pl-1.5 pr-1 font-mono bg-blue-600 text-white` | reference-match |
| `orderReasonStyle.ts:52` | `rounded-l-full pl-1.5 pr-1 font-mono bg-blue-600 text-white` | smart-qty-match |
| `orderReasonStyle.ts:59,64` | `rounded-l-full pl-1.5 pr-1 font-mono bg-amber-500 text-amber-950` + `text-amber-950/70` (icon) | oldest-first / fifo-fallback |
| `orderReasonStyle.ts:71` | `rounded-l-full pl-1.5 pr-1 font-mono bg-violet-600 text-white` | manual-assignment |
| `orderReasonStyle.ts:78-79` | `rounded-l-full pl-1.5 pr-1 font-mono bg-gray-400 text-gray-900` + `text-gray-900/70` (icon) | pending |
| `orderReasonStyle.ts:84+` | `bg-destructive text-destructive-foreground` | not-ordered (semantisch korrekt!) |

**Beobachtung:** Strukturell konsistent (gleiches Layout-Grundgerüst), aber 5 verschiedene harte Farb-Paare. "not-ordered" ist bereits semantisch korrekt. Pill-Padding `pl-1.5 pr-1` weicht vom 4er-Raster ab.

---

## 6. Kategorie: Buttons (Custom, außerhalb shadcn Button)

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `IssueDialog.tsx:296` | `h-7 px-3 text-xs rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors` | Amber-Action |
| `IssueDialog.tsx:308` | `bg-green-500 text-white cursor-default` | Success-State |
| `IssueDialog.tsx:309` | `bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40` | Teal-Primary |
| `IssueDialog.tsx:348` | `h-7 px-3 text-xs rounded bg-teal-600 text-white hover:bg-teal-700` | Teal-Primary (kleiner) |
| `IssueDialog.tsx:673` | `gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white` | Convert-Button |
| `IssueDialog.tsx:849,863` | `gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white` | Convert-Button (identisch x2) |
| `IssuesCenter.tsx:264` | `gap-1 text-xs h-7 px-2 border-amber-400 text-amber-600 hover:bg-amber-50/20` | Amber-Outline |
| `OverrideEditorModal.tsx:344` (style) | `backgroundColor: '#008C99'` | Save-Button |
| `RunDetail.tsx:553` (style) | `backgroundColor: '#c9c3b6'`, `color: '#666666'` | Secondary-Button |
| `RunDetail.tsx:895,919` (style) | `rgba(255,255,255,0.5)` | White-Overlay-Button |
| `RunDetail.tsx:918` | `flex items-center gap-2 rounded-lg border border-green-500 text-green-800 h-10 px-4` | Success-Outline |
| `AppSidebar.tsx:249` (style) | `#c9c3b6`, `#666666` | NEU-Button |
| `AppFooter.tsx:246,271,296,321` | `h-7 w-40 text-xs border rounded-md px-2` + Hex-Hover (`#008C99`/`#FFFFFF`) | Module-Buttons |
| `AppFooter.tsx:346,371` | `h-7 w-40 text-xs border rounded-md px-2 flex items-center gap-1.5` | Module-Buttons (mit gap) |

**Beobachtung:** Teal (`#008C99` / `bg-teal-600`) wird als Primary verwendet, existiert aber sowohl als Tailwind-Klasse **als auch** als Inline-Hex. Button-Höhen variieren: `h-7`, `h-10`, `h-11`.

---

## 7. Kategorie: Status-Indikatoren (Icons, Dots, Checks)

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `AppFooter.tsx:238,263,288,313,338,364` | `w-3.5 h-3.5 text-green-500 flex-shrink-0` | Ready-CheckCircle (6x identisch) |
| `OverrideEditorModal.tsx:378,379` | `w-3.5 h-3.5 text-green-500` / `text-red-500` | Regex-Valid/Invalid |
| `OverrideEditorModal.tsx:389` | `text-[10px] text-red-600` | Validation-Error |
| `SettingsPopup.tsx:1091,1113,1203,1284,1331` | `w-3.5 h-3.5 text-green-500 flex-shrink-0` | Ready-CheckCircle (5x identisch) |
| `IssuesCenter.tsx:189` | `text-amber-500` | Warning-Icon |
| `IssuesCenter.tsx:198` | `text-amber-600` | Warning-Text (abweichende Shade!) |
| `IssuesCenter.tsx:242` | `text-green-600` (conditional) | Copy-Success |
| `IssuesCenter.tsx:676` | `text-red-400` | Error-Count |
| `InvoicePreview.tsx:319` | `h-5 w-5 text-amber-500` | Warning-Icon |
| `InvoicePreview.tsx:333` | `text-amber-600` (conditional) | Warning-Label |
| `Index.tsx:332` | `w-4 h-4 text-red-500 inline` | Konflikt-Icon |
| `SerialStatusDot.tsx:48` | `w-3 h-3 rounded-sm border` + Hex-Farbe (inline, über props) | Serial-Status-Dot |
| `PendingHourglassIcon.tsx:17` (style) | `backgroundColor: '#968C8C'` + `text-white` | Pending-Hourglass |
| `RunDetail.tsx:626` | `w-1.5 h-1.5 rounded-full` + Inline-Color | Summary-Dot |
| `RunDetail.tsx:921` | `h-4 w-4 text-slate-900` | Success-Check |
| `ItemsTable.tsx:391` | `w-3 h-3 text-orange-400 flex-shrink-0` | EAN-Match-Icon |

**Beobachtung:** Check-Circle mit `text-green-500` erscheint **11x** in identischer Form — klarer Konsolidierungs-Kandidat. `text-amber-500` und `text-amber-600` werden inkonsistent für Warnungen genutzt.

---

## 8. Kategorie: Tabellen-Zeilen & Highlights

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `ItemsTable.tsx:366` | `bg-slate-50/50` (odd rows) | Zebra-Striping |
| `ItemsTable.tsx:369` | `ring-2 ring-amber-400/60 bg-amber-500/10 transition-all duration-300` | Highlight-Row (animiert) |
| `ItemsTable.tsx:230` | `p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground` | Delete-Button |
| `ItemsTable.tsx:299` | `h-11 w-11 p-px border border-gray-400/70 rounded-md text-muted-foreground/50 hover:text-muted-foreground` | Lock-Icon-Box |
| `InvoicePreview.tsx:375` | `p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground` | Delete-Button (identisch) |
| `InvoicePreview.tsx:414` | `h-11 w-11 p-px border border-gray-400/70 rounded-md text-muted-foreground/50 hover:text-muted-foreground` | Lock-Icon-Box (identisch) |
| `IssuesCenter.tsx:472` | `p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground` | Delete-Button (3. Duplikat) |

**Beobachtung:** Delete-Button-Klassen sind **3x byte-gleich** — sofortiger Konsolidierungs-Kandidat als gemeinsame Komponente.

---

## 9. Kategorie: Selection-States (ausgewählt / hover)

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `IssueDialog.tsx:611` | `border-blue-500 bg-blue-50 ring-2 ring-blue-300` | Selected-Kandidat |
| `IssueDialog.tsx:612` | `border-slate-300/60 bg-white/50 hover:bg-teal-50 hover:border-teal-400` | Unselected-Kandidat |
| `IssueDialog.tsx:617,621` | `text-blue-600 font-medium` | Selected-Text |
| `IssueDialog.tsx:549` | `border border-black/60 bg-green-50/40 hover:bg-green-100/60` | Selectable-Box |
| `IssueDialog.tsx:616` | `text-xs font-semibold text-slate-800` | Box-Label |
| `IssueDialog.tsx:624` | `text-xs text-slate-600 truncate` | Box-Subtext |
| `IssueDialog.tsx:719-801` | `text-teal-800` (mehrfach) + `font-semibold` | Teal-Panel-Labels |
| `IssueDialog.tsx:727` | `text-sm font-bold text-teal-700` | Teal-Panel-Betrag |
| `SerialStatusDot.tsx:48` | `hover:ring-2 hover:ring-offset-1 hover:ring-blue-400` | Dot-Hover |

**Beobachtung:** Selection nutzt mal `ring-blue-300`, mal `ring-blue-400`, Border mal `blue-500`, mal `black/60`. Keine einheitliche Selection-Logik.

---

## 10. Kategorie: Severity-Logik (z.B. SettingsPopup)

### IST-Zustand Mapping

| Location | Verwendete harte Klassen | Zweck |
|---|---|---|
| `SettingsPopup.tsx:144` | `text-green-700` | Severity HIGH |
| `SettingsPopup.tsx:145` | `text-amber-700` | Severity MEDIUM |
| `SettingsPopup.tsx:146` | `text-red-700` | Severity LOW |
| `SettingsPopup.tsx:259` | `text-green-700` / `text-red-700` | Status-Dynamik |
| `SettingsPopup.tsx:1079` | `border-amber-400` (conditional) | Highlighted-Border |
| `RunLogTab.tsx:11` | `text-red-500` | LOG ERROR |
| `RunLogTab.tsx:12` | `text-amber-500` | LOG WARN |
| `RunLogTab.tsx:18` | `bg-red-500/10` | LOG ERROR BG |
| `RunLogTab.tsx:19` | `bg-amber-500/10` | LOG WARN BG |
| `IssueDialog.tsx:193` | `border-red-400` (conditional) | Invalid-Input-Border |
| `IssueDialog.tsx:196` | `text-xs text-red-500 mt-0.5` | Input-Error-Message |

**Beobachtung:** Severity nutzt `-500`, `-600`, `-700` Shades chaotisch gemischt. RunLogTab nutzt `-500` + `/10`, SettingsPopup `-700` ohne Opacity.

---

## 11. Kategorie: Header-/Title-Farben (Inline Hex)

### IST-Zustand Mapping

| Location | Verwendete Farbe | Zweck |
|---|---|---|
| `Index.tsx:246,249` (style) | `#D9D4C7` / `#D8E6E7` | Header-Text |
| `NewRun.tsx:139,142` (style) | `#D9D4C7` / `#D8E6E7` | Page-Header-Text |
| `RunDetail.tsx:608` (style) | `#D8E6E7` | H1-Title |
| `RunDetail.tsx:546` | `text-white mt-1 mb-4` | Subtitle |
| `AppSidebar.tsx:139` (style) | `#DC2626` / `#008C99` | Logo-Hover/Normal |
| `AppSidebar.tsx:190,198,207,216` (style) | `#666666` | Divider/Border |

**Beobachtung:** Page-Titel verwenden **durchgängig** `#D8E6E7` — das ist de-facto die "Title-Color" des Systems, aber nicht als Token definiert.

---

## 12. Spacing-Abweichungen (nicht 4er-Raster)

### IST-Zustand (ungerade Werte)

| Klasse | Verwendungs-Count (ca.) | Typische Locations |
|---|---|---|
| `gap-1.5` | 15+ | Buttons, Pill-Content, AppFooter |
| `gap-3` | 20+ | RunDetail (Header, Actions), IssueDialog, ItemsTable |
| `px-1.5`, `py-0.5`, `py-1.5` | 25+ | Alle Badges/Pills |
| `p-3` | 10+ | IssueDialog Panels |
| `p-1.5` | 5+ | Delete-Buttons (ItemsTable, InvoicePreview, IssuesCenter) |
| `py-px` | 3 | PriceCell Badges |
| `pl-1.5 pr-1` | 6 | orderReasonStyle Pills |
| `space-y-3` | 3 | ItemsTable Filter, IssueDialog |
| `mb-4` | Gebräuchlich | (4er-Raster, OK) |
| `gap-4` | Gebräuchlich | (4er-Raster, OK) |

**Beobachtung:** `gap-3` und `p-3` sind in der Praxis de-facto-Standard für enge Layouts, obwohl sie vom 4er-Raster abweichen. STANDARDS.md S5 fordert `gap-4`/`p-4` — hier besteht realer Konflikt Theorie↔Praxis.

---

## 13. Radius-Verwendung

### IST-Zustand

| Klasse | Verwendungs-Count (ca.) | Kontext |
|---|---|---|
| `rounded` (default = `rounded` ≈ 0.25rem) | 15+ | Badges, Filter-Banner, kleine Boxen |
| `rounded-sm` | 2 | SerialStatusDot |
| `rounded-md` | 20+ | Buttons, AppFooter-Module, Alert-Box, Lock-Icon |
| `rounded-lg` | 15+ | IssueDialog-Panels, Buttons, AppFooter-Container |
| `rounded-xl` | 0 (Custom) | — |
| `rounded-2xl` | 0 (Custom) | — |
| `rounded-full` | 5+ | Price-Status-Badges (DetailPopup), Status-Dots |
| `rounded-l-full` | 6 | orderReasonStyle Pills (gesamt) |
| `rounded-t`, `rounded-b` | 2 | AppSidebar Upload-Buttons |

**Beobachtung:** STANDARDS.md S5 fordert: Buttons/Inputs → `rounded-md`, Cards → `rounded-lg`/`rounded-xl`. **IST:** `rounded-md` für Buttons ist gegeben. Panels/Cards nutzen aber mal `rounded` (ItemsTable Filter), mal `rounded-md` (Alert), mal `rounded-lg` (IssueDialog-Panels) — nicht konsistent.

---

## 14. Cluster-Analyse: Semantisch gleiche Komponenten mit unterschiedlichen Klassen

### Cluster A — Preis-Status-Badges (PriceCell vs. DetailPopup)

| Variante | Klassen | Ort |
|---|---|---|
| Helle Badge (auf hellem BG) | `bg-green-100 text-green-700` | `PriceCell.tsx:29` |
| Dunkle Badge (auf Dark-Dialog) | `bg-green-700/30 text-green-300` | `DetailPopup.tsx:80` |

**Problem:** Gleiche Semantik (Preis-OK), zwei verschiedene Paletten — weil DetailPopup Dark-Mode-Dialog ist. Beide müssten von einer gemeinsamen `.price-status-{ok|mismatch|missing|custom}` Klasse abgeleitet werden, die auf `bg`/`text` Kontext reagiert.

**Vorschlag:** Semantische Tokens einführen:
- `--status-ok-bg`, `--status-ok-fg` (helle + dunkle Variante via `dark:` Prefix)
- `bg-status-ok text-status-ok-fg` statt `bg-green-100 text-green-700`

---

### Cluster B — Info-/Warn-Panels (RunDetail, IssuesCenter, ItemsTable, InvoicePreview)

| Variante | Klassen | Ort |
|---|---|---|
| Soft-Fail Alert | `rounded-md border border-amber-400/50 bg-amber-50/10` | `RunDetail.tsx:986` |
| Empty-State Banner | `rounded-md border border-amber-300/50 bg-amber-50/10` | `IssuesCenter.tsx:575` |
| Filter-Banner (ItemsTable) | `bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5` | `ItemsTable.tsx:317` |
| Filter-Banner (Invoice) | `bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5` | `InvoicePreview.tsx:431` |
| Orange-Warning dünn | `rounded border border-orange-300/40 bg-orange-50/5 py-1.5 px-3` | `IssueDialog.tsx:645` |
| Orange-Warning dick | `rounded border border-orange-300/60 bg-orange-50/10 p-2` | `IssueDialog.tsx:709` |

**Problem:** 3 verschiedene Border-Shades (`amber-300/50`, `amber-400/50`, `amber-500/30`), 3 Background-Opacities (`/5`, `/10`), 2 Border-Radii (`rounded`, `rounded-md`), Orange vs. Amber semantisch unklar unterschieden.

**Vorschlag:** Ein Panel-Typ mit 2–3 Varianten:
- `<WarningPanel tone="soft|firm">`: `border-warning/50 bg-warning/10 rounded-md`
- Alle ins gleiche Schema: `rounded-md`, `border-{tone}/50`, `bg-{tone}/10`

---

### Cluster C — Delete-/Remove-Buttons (3x byte-gleich)

| Variante | Klassen | Ort |
|---|---|---|
| Delete-Button ItemsTable | `p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground` | `ItemsTable.tsx:230` |
| Delete-Button InvoicePreview | (identisch) | `InvoicePreview.tsx:375` |
| Delete-Button IssuesCenter | (identisch) | `IssuesCenter.tsx:472` |

**Problem:** Dreifache Duplikation. Identische Klassen an 3 Orten.

**Vorschlag:** Eigene Komponente `<DeleteIconButton>` mit fester Klasse — oder zumindest als shared className-Konstante exportieren.

---

### Cluster D — Lock-/Locked-Icon-Box (2x byte-gleich)

| Variante | Klassen | Ort |
|---|---|---|
| Lock-Box ItemsTable | `h-11 w-11 p-px border border-gray-400/70 rounded-md text-muted-foreground/50 hover:text-muted-foreground` | `ItemsTable.tsx:299` |
| Lock-Box InvoicePreview | (identisch) | `InvoicePreview.tsx:414` |

**Vorschlag:** `<LockIconBox>` oder als className-Konstante.

---

### Cluster E — Teal-Primary-Button (IssueDialog-interne Duplizierung)

| Variante | Klassen | Ort |
|---|---|---|
| Teal-Primary (mit State) | `bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed` | `IssueDialog.tsx:309` |
| Teal-Primary (klein) | `h-7 px-3 text-xs rounded bg-teal-600 text-white hover:bg-teal-700` | `IssueDialog.tsx:348` |
| Save-Button (Modal) | (style) `#008C99` | `OverrideEditorModal.tsx:344` |
| AppFooter-Module Hover | (style) `#008C99` | `AppFooter.tsx:248-250` |

**Problem:** Primary-Farbe `#008C99` = `teal-600` ungefähr, aber an manchen Orten Tailwind, an manchen Inline-Hex.

**Vorschlag:** `#008C99` als `--primary` in Tailwind-Config definieren → `bg-primary hover:bg-primary/90` überall.

---

### Cluster F — Convert-to-Article-Button (3x byte-gleich)

| Variante | Klassen | Ort |
|---|---|---|
| Convert-Button (Kandidatenliste) | `gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white` | `IssueDialog.tsx:673` |
| Convert-Button (unten) | (identisch) | `IssueDialog.tsx:849` |
| Convert-Button (unten alt.) | (identisch) | `IssueDialog.tsx:863` |

**Vorschlag:** Als Komponente oder shared className.

---

### Cluster G — Ready-CheckCircle (11x identisch)

| Variante | Klassen | Ort |
|---|---|---|
| Green CheckCircle | `w-3.5 h-3.5 text-green-500 flex-shrink-0` | `AppFooter.tsx` 6x, `SettingsPopup.tsx` 5x |

**Vorschlag:** `<ReadyIcon />` als Mini-Komponente.

---

### Cluster H — Count-Badge amber (2x identisch)

| Variante | Klassen | Ort |
|---|---|---|
| Amber Count-Badge | `text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40` | `IssuesCenter.tsx:557` & `640` |

**Vorschlag:** Shared className oder `<CountBadge tone="amber">`.

---

### Cluster I — Tab-Count-Badges (3 Stil-Varianten in RunDetail)

| Variante | Klassen | Ort |
|---|---|---|
| Grün | `bg-green-100 text-[#14532d]` | `RunDetail.tsx:833` |
| Teal | (style) `#008c99` / `#ffffff` | `RunDetail.tsx:848` |
| Braun-Rot | `bg-[#d6b8ab] text-[#7a1f12]` | `RunDetail.tsx:858` |

**Problem:** Gleiche Komponente (Tab-Count-Badge), aber Farbe wird über Status transportiert. 2/3 als Inline-Hex, 1/3 als Tailwind.

**Vorschlag:** Tailwind-Custom-Colors `success`, `info`, `error-subtle` definieren.

---

## 15. Harte Farb-Palette (Extract für Tailwind-Config)

### Brand/Header-Farben (via Inline-Hex)

| Hex | Verwendung | Semantik |
|---|---|---|
| `#008C99` / `#008c99` | Primary-Action (Buttons, Tabs, Hover) | **Primary** |
| `#D8E6E7` | Dialog-/Page-Background, Title-Color | **Background-Soft / Title** |
| `#D9D4C7` | Header-Text (Index/NewRun) | **Header-Text-Alt** |
| `#c9c3b6` | Secondary-Button-BG | **Secondary** |
| `#666666` | Divider, Icon-Color, Muted-Text | **Muted-Foreground** |
| `#DC2626` | Logo-Hover | (entspricht `red-600`) |
| `#d6b8ab` / `#7a1f12` | Tab-Badge Error-Subtle | **Error-Subtle** |
| `#14532d` | Grüner Badge-Text | (entspricht `green-900`) |
| `#968C8C` | Pending-Background | **Pending** |
| `#2a3f45` / `#1e2e33` / `#4a6570` / `#93b5bc` | DetailPopup Dark-Theme | **Dark-Dialog-Family** |

---

## 16. Konsolidierungs-Empfehlungen (Überblick, Input für STANDARDS.md)

### Schnell-Gewinne (1:1 Ersetzungen)

1. **Delete-Button**: 3 identische Vorkommen → eigene Komponente oder `className`-Konstante
2. **Lock-Icon-Box**: 2 identische Vorkommen → eigene Komponente
3. **Ready-CheckCircle**: 11 identische Vorkommen → Mini-Komponente `<ReadyIcon />`
4. **Convert-Button**: 3 identische Vorkommen → eigene Komponente
5. **Amber-Count-Badge**: 2 identische Vorkommen → shared className
6. **Filter-Banner**: 2 identische Vorkommen (ItemsTable + InvoicePreview) → shared className

### Semantische Tokens einführen

| Aktuelle harte Klasse(n) | Vorgeschlagenes Token |
|---|---|
| `#008C99` / `bg-teal-600` / `bg-teal-700` | `bg-primary` / `bg-primary/90` |
| `#D8E6E7` (Dialog-BG/Title) | `bg-background-soft` / `text-title` |
| `#c9c3b6` / `#666666` | `bg-secondary` / `text-muted-foreground` (existiert schon) |
| `bg-green-100 text-green-700` + `bg-green-700/30 text-green-300` | `bg-status-ok text-status-ok-fg` (mit dark-Variante) |
| `bg-yellow-100 text-yellow-700` + `bg-yellow-700/30 text-yellow-300` | `bg-status-warn text-status-warn-fg` |
| `bg-red-100 text-red-700` + `bg-red-700/30 text-red-300` | `bg-status-error text-status-error-fg` |
| `bg-blue-100 text-blue-700` + `bg-blue-700/30 text-blue-300` | `bg-status-info text-status-info-fg` |
| `bg-amber-500/20 text-amber-400 border border-amber-500/40` | `badge-warn` (Preset) |
| `border-amber-*/50 bg-amber-50/10` / `border-orange-*/40 bg-orange-50/5` | `panel-warn` mit `tone="soft|firm"` |

### Spacing-Regeln präzisieren (STANDARDS.md S5)

- **Status-Quo:** `gap-3`/`p-3`/`p-1.5`/`gap-1.5` sind de-facto verbreitet.
- **Option A (strikt):** Alles auf 4er-Raster (`gap-4`, `p-4`, `p-2`) migrieren.
- **Option B (realistisch):** Zusätzlich `gap-3`, `p-3`, `py-1.5` als erlaubte "Mid-Step" dokumentieren — aber **`py-0.5`, `px-1.5`, `py-px` nur für Badges/Pills** zulassen.

### Radius-Regeln präzisieren

- **Badges:** `rounded` (0.25rem) → explizit als Badge-Standard definieren
- **Buttons/Inputs:** `rounded-md` → bereits de-facto Standard ✓
- **Panels/Alerts:** `rounded-md` → IssueDialog nutzt `rounded-lg` abweichend
- **Cards/Dialogs:** `rounded-lg` (IssueDialog-Panels nutzen `rounded-lg` ✓)
- **Pills:** `rounded-l-full` → als Pill-Standard akzeptieren

---

## 17. Nicht untersucht (außerhalb Scope)

- `src/components/ui/*` (shadcn-generiert)
- Test-Dateien (`*.test.ts`)
- Service-/Store-Layer (keine UI)
- `index.css` / globale CSS-Variablen (für Konsolidierung aber relevant!)
- `tailwind.config.*` (für Konsolidierung aber relevant!)

---

**Ende der Inventarisierung. Ausgewertet wird diese Datei von Dom, der die `STANDARDS.md` finalisiert und den anschließenden Code-Check-Task separat startet.**
