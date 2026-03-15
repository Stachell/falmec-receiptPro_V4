# PROJ-44-ADD-ON-Layout_round2: IssueDialog Layout-Reparatur Runde 2

## Context

Die erste Layout-Runde (PROJ-44-ADD-ON-Layout) hat das vertikale Sidebar-Layout auf horizontale Tabs umgestellt, aber mehrere Probleme hinterlassen.

## Phase A: Tab-Reiter + erste Fixes (erledigt)

### A1. TabsList — 3D-Relief-Balken wie Run-Detail
```
Alt:  className="flex flex-row h-12 ... bg-transparent border-b border-border ... p-0 gap-6 ..."
Neu:  className="flex flex-row h-10 ... bg-[#c9c3b6] border border-border tab-bar-raised ... p-1 gap-1 ... rounded-md"
```

### A2. Alle 5 TabsTrigger — Active/Hover-Styling
Jeder TabsTrigger bekommt zusaetzlich:
```
tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors
```

### A3. Tab 4 (email) — Side-by-Side + Scroll-Wrapper
- Dropdown + manuelle Eingabe nebeneinander: `<div className="flex gap-3 items-end">`
- Neuer Scroll-Wrapper `<div className="flex-1 overflow-y-auto space-y-3">` um Content
- Label "Oder manuelle Eingabe:" → "Manuelle Eingabe:"
- Button-Div: `mt-auto` → `shrink-0`

## Phase B: Body-Fix — Root Cause `display:flex` vs `[hidden]` (erledigt)

**Root Cause:** Tailwind's `flex` Klasse (`display: flex`) auf TabsContent-Elementen ueberschreibt das HTML `[hidden]`-Attribut, mit dem Radix UI inaktive Tabs versteckt. Alle 4-5 Tabs rendern gleichzeitig und teilen sich den Platz via `flex-1` — jeder Tab bekommt nur ~25% statt 100%.

**Beweis:** RunDetail.tsx und SettingsPopup.tsx verwenden KEIN `flex` auf TabsContent — dort funktioniert alles.

**Loesung:** `flex flex-col` von allen 5 TabsContent-classNames entfernt. Tabs 3+4 (die `flex-col` fuer fixed-bottom-button brauchen) bekommen einen inneren Wrapper-Div mit `flex flex-col h-full overflow-hidden`.

### B1. Tabs 1, 2, 5 — `flex flex-col` entfernt
```
Alt:  "flex flex-col flex-1 min-h-0 w-full overflow-y-auto outline-none mt-0 space-y-3"
Neu:  "flex-1 min-h-0 w-full overflow-y-auto outline-none mt-0 space-y-3"
```

### B2. Tab 3 (resolve) — innerer Wrapper
```
Alt:  TabsContent className="flex flex-col flex-1 min-h-0 overflow-hidden ..."
Neu:  TabsContent className="flex-1 min-h-0 w-full outline-none mt-0"
        └── div className="flex flex-col h-full overflow-hidden"  (NEU)
              └── div className="flex-1 overflow-y-auto space-y-3"  (bestehend)
              └── div className="pt-2 shrink-0"  (bestehend)
```

### B3. Tab 4 (email) — innerer Wrapper
Identisches Pattern wie B2.

## Phase C: Icons + Vorschau-Optimierung (erledigt)

### C1. Icons fuer Tabs "Uebersicht" und "Fehlerbericht"
- `Eye` und `FileText` zu lucide-react Imports hinzugefuegt
- Tab "Uebersicht": `<Eye className="w-3 h-3" />` + `gap-1` im TabsTrigger
- Tab "Fehlerbericht": `<FileText className="w-3 h-3" />` + `gap-1` im TabsTrigger
- Alle 4 sichtbaren Tabs haben jetzt Icons (Eye, FileText, AlertTriangle, Mail) + ggf. Tab 5 (Clock)

### C2. Fehlerbericht pre-Block — max-h entfernt
```
Alt:  "text-xs font-mono bg-white/30 ... max-h-[45vh] overflow-y-auto"
Neu:  "text-xs font-mono bg-white/30 ... whitespace-pre-wrap leading-relaxed"
```
`max-h-[45vh]` und `overflow-y-auto` entfernt — pre-Block waechst natuerlich, Scrollen uebernimmt TabsContent. Keine verschachtelten Scrollbalken.

### C3. E-Mail Vorschau — echten E-Mail-Body anzeigen
```
Alt:  <p className="text-muted-foreground">Body: Fehlertyp, Details, betroffene Positionen (max. 10) ...</p>
Neu:  <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed mt-1">
        {buildIssueClipboardText(issue, invoiceLines)}
      </pre>
```
Platzhalter-Text durch echten `buildIssueClipboardText`-Output ersetzt — zeigt bis zu 30 formatierte Positionen mit Artikel-Nr, EAN, Preis. `buildIssueClipboardText` war bereits importiert.

## Phase D: Fehlerbericht-Inhalt-Bug (erledigt)

### D1. `buildIssueClipboardText` — details verschluckt + dangling "---"
**Root Cause:** `issue.details` wurde nur im `affectedLineIds.length === 0`-Pfad eingefuegt. Wenn `affectedLineIds` IDs enthielt, aber keine in `invoiceLines` aufloesbar waren, entstand `[Fehler] message\n---` ohne Inhalt.

**3 Bugs in einer Funktion (issueLineFormatter.ts Z.158-181):**
1. `issue.details` nur im Frueh-Return-Pfad genutzt — bei vorhandenen affectedLineIds ging details verloren
2. `'---'` Separator immer truthy — erschien auch bei leerem Body
3. Leere Line-Aufloesung erzeugte nacktes `---` statt graceful Fallback

**Fix:** `parts`-Array statt verschachteltem `filter(Boolean).join`:
- `issue.details` wird IMMER nach dem Header eingefuegt
- `'---'` Separator NUR wenn tatsaechlich aufgeloeste Lines vorhanden
- Kein nacktes `---` mehr bei leerer Line-Aufloesung

**Auswirkung:** Fehlerbericht-Tab (Tab 2), E-Mail-Vorschau (Tab 4), Clipboard-Copy und Mailto-Body zeigen jetzt immer die vollen Issue-Details.

## Verifikation
```bash
npx tsc --noEmit
# Phase A+B+C+D: 0 Errors — bestaetigt
```
Visuell: IssueDialog oeffnen — Tab-Reiter als 3D-Relief-Balken mit Icons, alle Tabs mit sichtbarem Content (volle Hoehe), Tab 2 Fehlerbericht zeigt Header + Details + Positionen (kein nacktes "---"), Tab 3+4 Buttons am Boden fixiert, Tab 4 Dropdown+Input nebeneinander mit echtem E-Mail-Body in der Vorschau.
