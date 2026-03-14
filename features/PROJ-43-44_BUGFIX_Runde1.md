# PROJ-43/44 Bugfix Runde 1 — Architekturplan

## Context
Bugfix-Paket fuer die kuerzlich implementierten Features PROJ-43 (IssueCenter Overhaul) und PROJ-44 (Step 4 Waiting Point). Zusaetzlich wird eine fundamentale Logik-Absicherung fuer das Lagerort-Management eingebaut ("Lagerort-Amnesie"), als Vorbereitung fuer die spaetere Dynamisierung in Runde 2 (PROJ-45).

**Oberste Regel:** Bestehende Workflows (Parsen, Splitten, Issue-Management) duerfen NICHT beschaedigt werden.

---

## Bug #1: PROJ-44 Fernbedienung (Schieberegler-Amnesie)

**Problem:** Switch in RunDetail.tsx (Zeile 644-655) nutzt direktes `useRunStore.setState()` statt `setGlobalConfig`. Nach "Neu verarbeiten" ist der Wert weg, weil nur der Run-Config geschrieben wird, nicht der globale Default.

**Datei:** `src/pages/RunDetail.tsx` (Zeilen 644-655)

**Loesung:** Den gesamten `onCheckedChange`-Handler ersetzen durch:
```tsx
onCheckedChange={(checked) => {
  setGlobalConfig({ autoStartStep4: checked });
}}
```
`setGlobalConfig` (runStore.ts:607-620) synct bereits automatisch zum aktiven Run — der bisherige manuelle setState-Code ist komplett redundant.

**Voraussetzung:** `setGlobalConfig` muss aus dem `useRunStore()`-Destructuring importiert werden (pruefen ob bereits vorhanden in Zeile ~82-87).

---

## Bug #2: E-Mail-Settings Toast unsichtbar (z-index)

**Problem:** `handleSaveEmails` (SettingsPopup.tsx:347) ruft `toast.success(...)` auf — der Toast existiert, wird aber hinter dem SettingsPopup-Dialog gerendert (z-index Konflikt: shadcn Dialog = z-50, Sonner default = niedriger).

**Datei:** `src/components/ui/sonner.tsx`

**Loesung (2-gleisig):**
1. **z-index Fix:** In `sonner.tsx` dem `<Sonner>`-Element `style={{ zIndex: 9999 }}` hinzufuegen, damit Toasts IMMER ueber allen Dialogen schweben.
2. **Inline-Feedback als Backup:** Im SettingsPopup den Speichern-Button nach Erfolg kurz auf "Gespeichert!" + Haekchen-Icon wechseln (2s Timeout), damit auch ohne Toast visuelles Feedback existiert. Pattern: `useState<boolean>` + `setTimeout`.

**Dateien:**
- `src/components/ui/sonner.tsx` (Zeile 10: `<Sonner>` Prop ergaenzen)
- `src/components/SettingsPopup.tsx` (Zeile ~1012: Button-Feedback)

---

## Bug #3: IssueDialog Tab 4 Overflow

**Problem:** Tab 4 ("E-Mail erzeugen") in IssueDialog.tsx hat `className="flex-1 overflow-y-auto mt-0 space-y-3"` — es fehlt ein Flex-Container, weshalb der "E-Mail erzeugen"-Button aus dem Popup herauslaeuft.

**Datei:** `src/components/run-detail/IssueDialog.tsx` (Zeile 396 + 446-453)

**Loesung:**
1. Tab 4 `TabsContent` (Zeile 396): className aendern zu `flex-1 flex flex-col overflow-y-auto mt-0 space-y-3 h-full`
2. Button-Wrapper (Zeile 446): `mt-auto` hinzufuegen, damit der Button immer am unteren Rand klebt.
3. Vorschau-Box + Textfeld bekommen `flex-1` wo noetig, damit sie den verfuegbaren Platz fuellen.

**ACHTUNG:** Nur Tab 4 aendern! Die anderen Tabs (besonders Tab 3 "Loesung erzwingen" und Tab 5 "Anfragen") NICHT anfassen.

---

## Bug #4: "Loesung erzwingen" Button-Design

**Problem:** Button in Tab 1 ("Uebersicht", Zeile 288-296) hat `border-orange-400 text-orange-600 hover:bg-orange-50/20` — schlecht lesbar.

**Datei:** `src/components/run-detail/IssueDialog.tsx` (Zeile 291)

**Loesung:** className exakt ersetzen:
```
// ALT (Zeile 291):
className="gap-1 text-xs border-orange-400 text-orange-600 hover:bg-orange-50/20"

// NEU:
className="gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white"
```

---

## Bug #5: Lagerort-Amnesie (KRITISCHER LOGIK-FIX)

**Problem:** `WarehouseLocations.tsx` (Zeilen 33-45) filtert Artikel nach dem TEXT von `storageLocation` (z.B. `startsWith('WE Lager')`). Aendert der User den Lagerort via Dropdown, matcht der String nicht mehr und der Artikel verschwindet aus seiner Gruppe.

**Dateien & Aenderungen:**

### 5a) Neues Feld `logicalStorageGroup` in Types
**Datei:** `src/types/index.ts`
- `InvoiceLine` Interface (Zeile ~291): Neues Feld hinzufuegen:
  ```typescript
  /** Unveraenderliche Lagerort-Gruppe, gesetzt beim Matching. Nur fuer UI-Filtering. */
  logicalStorageGroup: 'WE' | 'KDD' | null;
  ```
- Das Feld ist `null` wenn kein Match stattfand (wie storageLocation).

### 5b) Feld beim Matching setzen
**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts`
- In `matchSingleLine()` (Zeile ~483, Erfolgs-Pfad): `logicalStorageGroup` ableiten aus dem gematchten `storageLocation`:
  ```typescript
  logicalStorageGroup: matchedArticle.storageLocation?.includes('KDD') ? 'KDD' : 'WE'
  ```
- In den Fehler-Pfaden (Zeile ~349 no-match, ~459 conflict): `logicalStorageGroup: null`

**Datei:** `src/services/matching/ArticleMatcher.ts` (Legacy-Matcher, Zeile ~124):
- Gleiche Logik: `logicalStorageGroup` aus `matchedArticle.storageLocation` ableiten.

**Datei:** `src/services/invoiceParserService.ts` (Zeile ~170, ~266):
- Initial-Parse: `logicalStorageGroup: null` (noch kein Match passiert).

### 5c) WarehouseLocations.tsx umstellen
**Datei:** `src/components/run-detail/WarehouseLocations.tsx` (Zeilen 33-45)
- Grouping-Logik komplett auf `logicalStorageGroup` umstellen:
  ```typescript
  const weLager = invoiceLines.filter(line => line.logicalStorageGroup === 'WE');
  const kdd = invoiceLines.filter(line => line.logicalStorageGroup === 'KDD');
  const other = invoiceLines.filter(line => !line.logicalStorageGroup);
  ```
- `handleGlobalWEChange` und `handleGlobalKDDChange` bleiben unveraendert (sie schreiben nur `storageLocation`, nicht die Gruppe).

### 5d) NICHT anfassen
- Export-Logik (`exportService.ts`) — bleibt auf `storageLocation` (das tatsaechliche Label)
- CSV/XML-Generierung — unveraendert
- Kein neues Settings-UI (kommt erst in Runde 2 / PROJ-45)

---

## Bug #6: Lagerort-Tabelle Sortierung + POS-NR

**Problem:** Detail-Tabelle in WarehouseLocations.tsx zeigt Artikel unsortiert und ohne Positionsnummer.

**Datei:** `src/components/run-detail/WarehouseLocations.tsx` (Zeilen ~159-221)

**Loesung:**

### 6a) Neue Spalte "POS-NR"
- Ganz links in der Tabelle eine neue Spalte "Pos" einfuegen.
- Wert: `line.positionIndex` (existiert bereits auf `InvoiceLine`, Zeile 297 in types/index.ts).

### 6b) Default-Sortierung
- Neuer State: `const [sortKey, setSortKey] = useState<'positionIndex' | 'storageLocation'>('positionIndex');`
- Neuer State: `const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');`
- **DRY-Regel (WICHTIG):** Da 3 Arrays (`weLager`, `kdd`, `other`) gerendert werden, darf die Sortierlogik NICHT dreimal geschrieben werden! Erstelle eine Helper-Funktion `const sortLines = (lines: InvoiceLine[]) => { ... }` und jage die Arrays vor dem Rendern dort hindurch (`weLager = sortLines(weLager)` etc.).

### 6c) Klickbare Header
- `TableHead`-Elemente fuer "Pos" und "Aktueller Lagerort" klickbar machen.
- Bei Klick: `sortKey` setzen, bei erneutem Klick auf gleichen Key: `sortDir` togglen.
- Visuelles Feedback: kleiner Pfeil (ChevronUp/ChevronDown aus lucide) neben dem aktiven Sort-Header.
- KISS: Kein Filter-Menue, nur simples sort-toggle.

---

## Stolpersteine & Regeln

1. **Lagerort-Logik:** `logicalStorageGroup` ist ein reines Frontend-UI-Flag. Export/CSV/XML bleibt auf `storageLocation`. KEIN neues Settings-UI.
2. **Tabellen-Sortierung:** Einfacher `useState` fuer `sortKey` + `sortDir`. Kein Over-Engineering.
3. **Fehlermanagement:** UI-Aenderungen an IssueDialog.tsx duerfen `pending`-Status und Issue-Splitting NICHT beeintraechtigen.
4. **Eiserne Ausfuehrungs-Regeln:**
   - VOR Implementierung: `/plan` Modus nutzen
   - NACH Implementierung: `MEMORY.md` aktualisieren
   - AM ENDE: `npx tsc --noEmit` ausfuehren und alle Typ-Fehler fixen
   - `features/INDEX.md` aktualisieren

---

## Betroffene Dateien (Zusammenfassung)

| # | Datei | Bugs |
|---|-------|------|
| 1 | `src/pages/RunDetail.tsx` | #1 |
| 2 | `src/components/ui/sonner.tsx` | #2 |
| 3 | `src/components/SettingsPopup.tsx` | #2 |
| 4 | `src/components/run-detail/IssueDialog.tsx` | #3, #4 |
| 5 | `src/types/index.ts` | #5 |
| 6 | `src/services/matchers/modules/FalmecMatcher_Master.ts` | #5 |
| 7 | `src/services/matching/ArticleMatcher.ts` | #5 |
| 8 | `src/services/invoiceParserService.ts` | #5 |
| 9 | `src/components/run-detail/WarehouseLocations.tsx` | #5, #6 |
| 10 | `features/INDEX.md` | Doku |

---

## Verification / Test-Plan

1. **Bug #1:** Settings oeffnen → autoStartStep4 toggle → Settings schliessen → "Neu verarbeiten" → Pruefen ob Switch-Zustand erhalten bleibt.
2. **Bug #2:** Settings oeffnen → Fehlerhandling Tab → E-Mail eintragen → Speichern → Toast MUSS sichtbar sein UND Button-Text kurz wechseln.
3. **Bug #3:** IssueDialog oeffnen → Tab 4 → Pruefen ob "E-Mail erzeugen"-Button buendig am unteren Rand sitzt, kein Overflow.
4. **Bug #4:** IssueDialog Tab 1 → "Loesung erzwingen" Button: weiss mit oranger Schrift, bei Hover gruen mit weisser Schrift.
5. **Bug #5:** Artikel matchen → Lagerort-Tab → Globale Zuweisung aendern → Artikel darf NICHT aus seiner Gruppe verschwinden. Export pruefen: storageLocation-Werte korrekt.
6. **Bug #6:** Lagerort-Details aufklappen → POS-NR Spalte sichtbar → Default aufsteigend sortiert → Header klickbar → Sortierung wechselt.
7. **TypeCheck:** `npx tsc --noEmit` muss fehlerfrei durchlaufen.
