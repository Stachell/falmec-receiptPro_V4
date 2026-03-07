# PROJ-42: Export Overhaul

> **Status**: Architektur abgeschlossen — bereit fuer Phase 2 (Implementierung)
> **Erstellt**: 2026-03-06
> **Abhaengigkeiten**: PROJ-35 (Export-Konfiguration), PROJ-40 (supplierId/orderVorgang), PROJ-41 (Logging-Wiring)
> **Diagnose-Grundlage**: `features/Export_diagnostic.md` (2026-03-02)

---

## 1. Kontext & Motivation

Das aktuelle Export-System hat folgende Defizite:
- **Nur XML** — kein CSV-Export trotz vorbereiteter Stubs in `archiveService`
- **Kein XML-Escaping** — Sonderzeichen (`&`, `<`, `>`) brechen das generierte XML
- **Toter Toolbar-Button** — `currentRun.stats.exportReady` ist immer `false`, der Button wird nie gerendert
- **Kein CSV-Trennzeichen-Setting** — User koennen den Separator nicht konfigurieren
- **Falsches Dateinamen-Muster** — aktuell `Fattura-{nr}_{date}-{eingangsart}.xml`, Soll: `[Run-ID]-Wareneingang.{ext}`
- **Keine duale Speicherung** — Export nur als Blob-Download, keine IndexedDB-Archivkopie
- **Kein Logging** — Export-Download wird weder in Run-Log noch Audit-Log vermerkt
- **Index.tsx Stub** — Landing-Page nutzt eine Dummy-`generateRunExport()` Funktion (Zeile 45)
- **Datenfluss-Abriss** — `orderVorgang` geht in Run 3 Expansion teilweise verloren (siehe Abschnitt 4)

**Ziel**: Zentraler `exportService` mit `generateXML`/`generateCSV`, Toolbar-Button-Fix, CSV-Delimiter-Setting, duale Speicherung (Download + IndexedDB), Logging, und chirurgischer Datenfluss-Fix in den Matching-Runs.

---

## 2. Architektur-Uebersicht

### 2.1 Neuer Service: `src/services/exportService.ts`

Reine Funktionen, keine React-Abhaengigkeiten, voll testbar.

```
exportService.ts
  +-- escapeXml(value) ................. & → &amp;, < → &lt;, > → &gt;, " → &quot;, ' → &apos;
  +-- csvQuote(value, delimiter) ....... Wrapping bei Delimiter/Quotes/Newlines im Wert
  +-- resolveColumnValue(key, line, meta) ... Extrahiert aus ExportPanel.tsx:44-61
  +-- generateXML(lines, columnOrder, meta)  ... Sage100Import-XML mit escapeXml()
  +-- generateCSV(lines, columnOrder, meta, delimiter) ... Header + Datenzeilen, \r\n
  +-- buildExportFileName(runId, ext) ...... "{runId}-Wareneingang.{ext}"
```

**RunExportMeta-Interface:**
```typescript
interface RunExportMeta {
  fattura: string;
  invoiceDate: string;
  deliveryDate: string | null;
  eingangsart: string;
  runId: string;
}
```

### 2.2 Store-Erweiterung: `exportConfigStore.ts`

| Feld | Typ | Default | localStorage-Key |
|------|-----|---------|-----------------|
| `csvDelimiter` | `string` | `','` | `exportCsvDelimiter` |
| `setCsvDelimiter` | `(d: string) => void` | — | — |

Validierung: nur `','`, `';'`, `'\t'` zulaessig. Persistierung via `loadPersistedDelimiter()`.

### 2.3 Dateiname-Muster

```
{run.id}-Wareneingang.xml
{run.id}-Wareneingang.csv
```

Beispiel: `Fattura-20.008-20260213-140509-Wareneingang.xml`

### 2.4 Datenfluss Export

```
[1] User klickt "Export" (Toolbar ODER ExportPanel)
     |
[2] columnOrder ← exportConfigStore
    csvDelimiter ← exportConfigStore
    invoiceLines ← runStore (gefiltert nach run.id)
    runMeta ← currentRun (fattura, invoiceDate, deliveryDate, eingangsart, runId)
     |
[3] generateXML(lines, columnOrder, meta)     → xmlContent
    generateCSV(lines, columnOrder, meta, del) → csvContent
     |
[4] buildExportFileName(run.id, 'xml')  → filename
     |
[5] DOWNLOAD: Blob + anchor-Element (immer, universeller Fallback)
     |
[6] ARCHIV:  archiveService.writeArchivePackage(run, lines, { exportXml, exportCsv })
             → IndexedDB + .Archiv-Ordner via File System Access API
     |
[7] LOGGING: logService.info('Export durchgefuehrt: {filename}', { runId, step: 'Export' })
             addAuditEntry({ runId, action: 'export-download', details, userId: 'system' })
             setLastDiagnostics({ timestamp, fileName, lineCount, status: 'success' })
```

---

## 3. Aenderungen pro Datei

### 3.1 NEU: `src/services/exportService.ts`

Siehe Abschnitt 2.1. Alle Funktionen als Named Exports. Keine Side-Effects.

### 3.2 AENDERN: `src/store/exportConfigStore.ts`

- `csvDelimiter: string` + `setCsvDelimiter` Action hinzufuegen
- `loadPersistedDelimiter()` Helper (Pattern analog `loadPersistedOrder`)
- ~10 Zeilen hinzu, 0 entfernt

### 3.3 AENDERN: `src/components/SettingsPopup.tsx`

In der `ExportConfigTab`-Funktion (ab Zeile ~167):
- Neuer Block zwischen Diagnose (~Zeile 211) und Aktionsleiste (~Zeile 240)
- `<Label>` "CSV-Trennzeichen" + `<Select>` mit 3 Optionen:
  - Komma (,)
  - Semikolon (;)
  - Tab
- ~20 Zeilen hinzu

### 3.4 AENDERN: `src/components/run-detail/ExportPanel.tsx` — Hauptrefaktor

**Entfernen:**
- Inline `resolveColumn` Funktion (Zeilen 44-61) → ersetzt durch `resolveColumnValue` aus exportService
- Inline `xmlPreview` Template-Literal (Zeilen 65-83) → ersetzt durch `generateXML()`
- Aktuelles `exportFileName` Pattern (Zeile 38) → ersetzt durch `buildExportFileName()`

**Hinzufuegen:**
- Import `{ generateXML, generateCSV, buildExportFileName }` aus exportService
- Import `logService`, `archiveService`
- `csvDelimiter` aus exportConfigStore
- `runMeta`-Objekt aus `run` Prop zusammenbauen
- `csvContent = generateCSV(invoiceLines, columnOrder, runMeta, csvDelimiter)`
- `handleDownload(format: 'xml' | 'csv')` Refaktor:
  1. Blob+anchor Download
  2. `archiveService.writeArchivePackage()` mit `{ exportXml, exportCsv }` — IndexedDB-Archivkopie
  3. `logService.info(...)` — Run-Log
  4. `addAuditEntry(...)` — Audit-Log
  5. `setLastDiagnostics(...)` — Export-Diagnostik
- Zweiter Button fuer CSV-Download neben dem XML-Button

~80 Zeilen geaendert.

### 3.5 AENDERN: `src/pages/RunDetail.tsx` — Toolbar-Button-Fix

**Ersetzen** des toten Blocks (Zeilen 579-584):

**Hinzufuegen:**
- `isExportReady` via `useMemo`:
  ```typescript
  const isExportReady = useMemo(() => {
    if (!currentRun) return false;
    const runIssues = issues.filter(i => !i.runId || i.runId === currentRun.id);
    const blocking = runIssues.filter(i => i.status === 'open' && i.severity === 'error');
    const missingLoc = currentRunLines.filter(l => !l.storageLocation);
    return blocking.length === 0 && missingLoc.length === 0 && currentRunLines.length > 0;
  }, [currentRun, issues, currentRunLines]);
  ```
- `issues` zum destrukturierten runStore-State hinzufuegen
- `handleToolbarExport`: XML+CSV generieren via exportService, Blob-Download, Log, Audit
- Button-Styling: `bg-[#008C99] text-white hover:bg-[#007080]` wenn ready, hidden wenn nicht
- ClickLock-Wrapping (`wrap('toolbar-export', handleToolbarExport)`)

~40 Zeilen geaendert.

### 3.6 AENDERN: `src/pages/Index.tsx` — Landing-Page Export-Fix

- `generateRunExport()` Stub (Zeile 45-68) ersetzen durch `generateXML`/`generateCSV` aus exportService
- `exportReady` Berechnung (Zeile 75/98/114) → Step-Completion-Proxy:
  ```typescript
  exportReady: run.steps.every(s => s.status === 'ok' || s.status === 'soft-fail')
  ```
- `handleDownloadFormat` (Zeile 160) → exportService mit runMeta + columnOrder aufrufen
- ~25 Zeilen geaendert

### 3.7 AENDERN: `features/INDEX.md`

Neue Zeile fuer PROJ-42.

---

## 4. Datenfluss-Reparatur: supplierId & orderVorgang (KRITISCH)

### 4.1 Diagnose-Befund

Der Bericht `features/Export_diagnostic.md` (Zeile 66) dokumentiert:

> *"In Run-3 werden `orderVorgang` und `orderOpenQty` explizit auf `null` gesetzt (`src/services/matching/runs/run3ExpandFifo.ts:115-116`)."*

Die vertiefte Code-Analyse bestaetigt den Datenfluss-Abriss und praezisiert die Ursachen:

### 4.2 Datenfluss-Tabelle (IST-Zustand mit Bugs)

| Step | Feld | Quelle | InvoiceLine-Wert | allocatedOrders[].vorgang |
|------|------|--------|-----------------|--------------------------|
| 1 (Parse) | `supplierId` | Init `null` | `null` | — |
| 1 (Parse) | `orderVorgang` | Init `null` | `null` | — |
| 2 (Match) | `supplierId` | ArticleMaster | **GESETZT** | — |
| 2 (Match) | `orderVorgang` | Unveraendert | `null` | — |
| 3 Run 1 | `orderVorgang` | `allocation.vorgang` (run1:100) | **GESETZT** | GESETZT (run1:90) |
| 3 Run 2 | `orderVorgang` | `firstAlloc.vorgang` (run2:131) | **GESETZT** (nur 1. Alloc) | GESETZT (run2:93) |
| 3 Run 3 Expand | `orderVorgang` | `allocOrder?.vorgang` (run3:115) | **GESETZT** (korrekt) | **BUG: `undefined`** (run3:75-82 kopiert `vorgang` NICHT) |
| 3 Run 3 FIFO | `orderVorgang` | `entry.position.vorgang` (run3:165) | **GESETZT** | GESETZT (run3:155) |
| Export | `orderVorgang` | `line.orderVorgang` | Korrekt | Aber `allocatedOrders[0].vorgang` = `undefined` |

### 4.3 Bug A — Run 3: `vorgang` fehlt in `singleAllocatedOrders` (SCHWERE: HOCH)

**Datei:** `src/services/matching/runs/run3ExpandFifo.ts`, Zeilen 75-82

```typescript
// AKTUELL (BUG): vorgang wird NICHT in die Kopie uebernommen
const singleAllocatedOrders: AllocatedOrder[] = allocOrder
  ? [{
      orderNumber: allocOrder.orderNumber,
      orderYear: allocOrder.orderYear,
      qty: 1,
      reason: allocOrder.reason,
      // ← vorgang FEHLT HIER!
    }]
  : [];
```

**Auswirkung:**
- `InvoiceLine.orderVorgang` ist korrekt gesetzt (Zeile 115 liest vom Original-`allocOrder`)
- ABER `line.allocatedOrders[0].vorgang` ist `undefined` auf ALLEN expandierten Zeilen
- Jeder Code, der `allocatedOrders[0]?.vorgang` liest (ManualOrderPopup, UI-Anzeigen, kuenftige Exporte), erhaelt `undefined`
- Der aktuelle Export-Resolver (`resolveColumnValue`) liest `line.orderVorgang` direkt → funktioniert heute, aber die Inkonsistenz ist eine tickende Zeitbombe

**Fix (1 Zeile hinzufuegen):**
```typescript
const singleAllocatedOrders: AllocatedOrder[] = allocOrder
  ? [{
      orderNumber: allocOrder.orderNumber,
      orderYear: allocOrder.orderYear,
      qty: 1,
      reason: allocOrder.reason,
      vorgang: allocOrder.vorgang,       // ← FIX: vorgang durchreichen
    }]
  : [];
```

### 4.4 Bug B — Run 2: Nur `firstAlloc.vorgang` bei Multi-Allocation (SCHWERE: MITTEL)

**Datei:** `src/services/matching/runs/run2PartialFillup.ts`, Zeile 131

```typescript
orderVorgang: firstAlloc.vorgang ?? null,
```

**Auswirkung:** Bei partieller Zuweisung aus mehreren Bestellungen (z.B. 4 aus Best. A + 3 aus Best. B) wird nur der Vorgang der ersten Bestellung auf der aggregierten Zeile gespeichert. Nach Expansion in Run 3 erhaelt jede Einzelzeile den korrekten Vorgang (via `findOrderForIndex`).

**Bewertung:** Fuer aggregierte Zeilen ist dieses Verhalten akzeptabel — eine aggregierte InvoiceLine kann nur einen `orderVorgang` tragen. Der wahre Fix liegt in Run 3 (Bug A), wo die Expansion den richtigen Vorgang pro Einzelzeile setzt. **Kein Code-Fix noetig**, nur Dokumentation.

### 4.5 supplierId — Kein Bug

`supplierId` wird in Step 2 (FalmecMatcher_Master) gesetzt und in keinem Run ueberschrieben. Der Spread-Operator (`...line`) in Run 1 (Zeile 93), Run 2 (Zeile 124), Run 3 (Zeile 99) erhaelt den Wert intakt. **Kein Fix noetig.**

### 4.6 Zusammenfassung der Fixes

| Bug | Datei | Zeile | Fix | Schwere | Aktion |
|-----|-------|-------|-----|---------|--------|
| A | `run3ExpandFifo.ts` | 75-82 | `vorgang: allocOrder.vorgang` hinzufuegen | HOCH | **PFLICHT-FIX** |
| B | `run2PartialFillup.ts` | 131 | Nur erster Vorgang bei Multi-Alloc | MITTEL | Dokumentiert, kein Code-Fix |
| — | Alle Runs | — | `supplierId` via Spread erhalten | OK | Kein Bug |

### 4.7 Erlaubter Eingriffs-Scope in Matching-Code

Der ausfuehrende Agent hat die **explizite Erlaubnis und den strikten Auftrag**, folgenden punktuellen Fix durchzufuehren:

**ERLAUBT:**
- `src/services/matching/runs/run3ExpandFifo.ts` Zeilen 75-82: `vorgang: allocOrder.vorgang` in das `singleAllocatedOrders`-Objekt einfuegen. **Nur diese eine Zeile.** Kein anderer Code in der Funktion darf geaendert werden.

**VERBOTEN (Sperrgebiet):**
- `src/services/matching/runs/run1PerfectMatch.ts` — keine Aenderungen
- `src/services/matching/runs/run2PartialFillup.ts` — keine Aenderungen
- `src/services/matching/matchingEngine.ts` — keine Aenderungen
- `src/services/matching/orderPool.ts` — keine Aenderungen
- `src/services/matching/orderParser.ts` — keine Aenderungen
- `src/services/matchers/modules/FalmecMatcher_Master.ts` — keine Aenderungen

---

## 5. Logging-Format

### 5.1 Run-Log (via `logService.info`)

```json
{
  "level": "INFO",
  "runId": "Fattura-20.008-20260213-140509",
  "step": "Export",
  "message": "Export durchgefuehrt: Fattura-20.008-20260213-140509-Wareneingang.xml",
  "details": "Format: XML, Positionen: 15, Spalten: 15"
}
```

Fuer CSV:
```json
{
  "message": "Export durchgefuehrt: Fattura-20.008-20260213-140509-Wareneingang.csv",
  "details": "Format: CSV, Positionen: 15, Spalten: 15, Delimiter: ;"
}
```

### 5.2 Audit-Log (via `addAuditEntry`)

```json
{
  "runId": "Fattura-20.008-20260213-140509",
  "action": "export-download",
  "details": "XML: Fattura-20.008-20260213-140509-Wareneingang.xml (15 Zeilen)",
  "userId": "system"
}
```

---

## 6. Risiko-Bewertung

| Risiko | Schwere | Massnahme |
|--------|---------|-----------|
| XML-Injection (unescaped Values) | HOCH | `escapeXml()` auf jeden Wert. Test mit `&`, `<`, `>` in Artikelbeschreibungen. |
| CSV-Delimiter in Werten | MITTEL | `csvQuote()` mit Double-Quote-Wrapping. Test mit Semikolon in Beschreibungen. |
| State-Bleed zwischen Runs | HOCH | Export-Funktionen sind pure. Lines immer gefiltert nach `lineId.startsWith(run.id)`. |
| Run-3 vorgang-Fix bricht Matching | HOCH | Fix ist rein additiv (1 Property in bestehendes Objekt-Literal). Kein Feld wird geaendert, kein Kontrollfluss betroffen. AllocatedOrder.vorgang ist optional (`vorgang?: string`), der Typ muss nicht angepasst werden. |
| File System Access API nicht verfuegbar | NIEDRIG | Blob+anchor als universeller Fallback (immer zuerst). `saveToArchive()` fire-and-forget. |
| IndexedDB-Quota ueberschritten | NIEDRIG | `archiveService.writeArchivePackage()` hat Fehlerbehandlung. Download funktioniert trotzdem. |
| Steps 1-4 Workflow-Beschaedigung | HOCH | Einziger Matching-Eingriff ist Bug-A-Fix (1 Zeile in run3ExpandFifo.ts). Kein anderer Step-Code wird angefasst. |

---

## 7. Implementierungs-Reihenfolge

| Nr | Aufgabe | Dateien |
|----|---------|---------|
| 1 | **Datenfluss-Fix**: `vorgang` in Run 3 `singleAllocatedOrders` | `src/services/matching/runs/run3ExpandFifo.ts` |
| 2 | `exportService.ts` erstellen | `src/services/exportService.ts` (NEU) |
| 3 | `exportConfigStore.ts` erweitern (csvDelimiter) | `src/store/exportConfigStore.ts` |
| 4 | CSV-Delimiter-Dropdown in Settings | `src/components/SettingsPopup.tsx` |
| 5 | ExportPanel refaktorieren | `src/components/run-detail/ExportPanel.tsx` |
| 6 | Toolbar-Button fixen | `src/pages/RunDetail.tsx` |
| 7 | Index.tsx Export-Stubs ersetzen | `src/pages/Index.tsx` |
| 8 | INDEX.md aktualisieren | `features/INDEX.md` |
| 9 | `npx tsc --noEmit` + Verifizierung | — |

---

## 8. Uebergabe-Protokoll an Phase 2 (Implementierung)

### Ausfuehrender Agent

Die Implementierung wird von **Sonnet 4.6 im "thinking"-Modus** durchgefuehrt.

### Pflicht-Workflow fuer den Implementierungs-Agenten

1. **Plan-Modus zuerst**: Sonnet wird IMMER vorher in den Plan-Modus geschickt (`/plan`), um den Architekturplan zu lesen und einen Implementierungs-Fahrplan zu erstellen.

2. **Memory-Pflicht**: Sonnet MUSS in die Projektdaten schreiben (`C:\Users\d.langgut\.claude\projects\c--0WERKBANK0-falmec-reicptpro-v3\memory\`).

3. **Skills laden**: Sonnet soll je nach Bedarf die Skills `frontend`, `react-dev` und ggf. `backend-local` laden.

4. **Typ-Pruefung**: Nach der Code-Implementierung ist der Agent verpflichtet, selbststaendig `npx tsc --noEmit` ueber sein Bash-Terminal auszufuehren, eventuelle Fehler sofort zu beheben und abschliessend `features/INDEX.md` zu aktualisieren.

### Hinweise fuer Sonnet zur Fehlervermeidung

**H1 — Datenfluss-Fix zuerst (Abschnitt 4, Bug A) — ERSTE AKTION:**
Der allererste Schritt ist der Fix in `src/services/matching/runs/run3ExpandFifo.ts` Zeilen 75-82. NUR die Zeile `vorgang: allocOrder.vorgang` zum Objekt-Literal hinzufuegen. Sonnet darf KEINEN anderen Code in dieser Datei aendern. Der Fix ist chirurgisch — eine Property, ein Objekt.

Mentale Verifikation nach dem Fix:
- `allocOrder` kommt von `findOrderForIndex(line.allocatedOrders, i)`
- `line.allocatedOrders` wurde in Run 1 (Zeile 90: `vorgang: matchEntry.position.vorgang || undefined`) und Run 2 (Zeile 93: `vorgang: entry.position.vorgang || undefined`) mit `vorgang` befuellt
- Der Fix stellt sicher, dass die KOPIE in `singleAllocatedOrders` den Wert beibehalt
- `AllocatedOrder.vorgang` ist optional (`vorgang?: string`, definiert in `src/types/index.ts:66`) — kein Typ-Aenderung noetig

**H2 — Import-Pfade:**
Alle Imports nutzen `@/`-Alias (z.B. `import { generateXML } from '@/services/exportService'`). Keine relativen Pfade.

**H3 — Bestehende Patterns wiederverwenden:**
- `useClickLock()` Hook fuer Button-Debouncing (bereits in ExportPanel + RunDetail genutzt)
- `addAuditEntry()` im runStore (Zeile 2203) — nimmt `Omit<AuditLogEntry, 'id' | 'timestamp'>`
- `logService.info()` als Singleton (`import { logService } from '@/services/logService'`)
- `archiveService.writeArchivePackage()` akzeptiert bereits `exportXml` und `exportCsv` Optionen

**H4 — ExportPanel-Refaktor:**
Die `resolveColumn`-Funktion (ExportPanel:44-61) wird 1:1 nach `exportService.ts` als `resolveColumnValue` extrahiert. Die Switch-Cases bleiben identisch, nur der `fattura`-Case nutzt `meta.fattura` statt `run.invoice.fattura`.

**H5 — Kein State-Bleed:**
`invoiceLines` MUSS immer nach `run.id` gefiltert werden (`lineId.startsWith(run.id + '-line-')`). Dieses Pattern existiert bereits in ExportPanel:18.

**H6 — ArchiveService-Aufruf:**
`writeArchivePackage` ist async und kann fehlschlagen. Immer als fire-and-forget mit `.catch()` aufrufen — der Blob-Download MUSS unabhaengig davon funktionieren.

**H7 — Index.tsx Besonderheit:**
Die Landing-Page hat KEINE `invoiceLines` fuer nicht-aktive Runs. `exportReady` muss daher ueber Step-Completion approximiert werden: `run.steps.every(s => s.status === 'ok' || s.status === 'soft-fail')`. Der tatsaechliche Download in `handleDownloadFormat` funktioniert nur fuer `row.run` (In-Memory-Runs), nicht fuer `isPersistedOnly`-Runs.

**H8 — CSV-Encoding:**
`\r\n` als Zeilenende (Windows/Excel-Kompatibilitaet). UTF-8 BOM (`\uFEFF`) als erstes Zeichen, damit Excel Umlaute korrekt anzeigt.

**H9 — Select-Komponente in Settings:**
shadcn/ui `<Select>` verwenden (bereits im Projekt vorhanden), NICHT natives `<select>`. Import: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'`.

**H10 — Toolbar-Button in RunDetail:**
`issues` muss zum Store-Destrukturing hinzugefuegt werden (aktuell NICHT in der Destrukturierung in RunDetail.tsx). Pruefen ob dort bereits eine Variable `issues` gibt, um Naming-Konflikte zu vermeiden.

**H11 — Matching-Code ist Sperrgebiet (ausser Bug-A-Fix):**
Ausser dem expliziten Bug-A-Fix (Abschnitt 4.3, 1 Zeile in `run3ExpandFifo.ts`) darf KEIN Code in folgenden Dateien geaendert werden:
- `src/services/matching/matchingEngine.ts`
- `src/services/matching/runs/run1PerfectMatch.ts`
- `src/services/matching/runs/run2PartialFillup.ts`
- `src/services/matching/orderPool.ts`
- `src/services/matching/orderParser.ts`
- `src/services/matchers/modules/FalmecMatcher_Master.ts`

**H12 — AllocatedOrder-Typ pruefen:**
`AllocatedOrder.vorgang` ist optional (`vorgang?: string`) — definiert in `src/types/index.ts:66`. Der Bug-A-Fix muss diesen Typ NICHT aendern, da `allocOrder.vorgang` bereits den optionalen Typ hat und direkt zugewiesen werden kann.

---

## 9. Verifizierungs-Checkliste

- [ ] `npx tsc --noEmit` — 0 Errors
- [ ] **Datenfluss-Fix**: `allocatedOrders[0].vorgang` auf expandierten Zeilen ist NICHT mehr `undefined`
- [ ] Voller Workflow: PDF Upload → Step 1-4 → Export-Tab → XML + CSV Download
- [ ] XML-Escaping: Artikelbeschreibung mit `&`, `<`, `>` testen
- [ ] CSV-Quoting: Werte mit Semikolon bei Semikolon-Delimiter testen
- [ ] Toolbar-Button erscheint wenn alle Steps complete + keine Blocker
- [ ] Toolbar-Button loest direkten Download aus (kein Tab-Wechsel)
- [ ] CSV-Delimiter-Dropdown in Settings → ExportConfigTab funktioniert
- [ ] IndexedDB-Archiv enthaelt export.xml und export.csv nach Download
- [ ] Run-Log und Audit-Log Eintraege nach Export vorhanden
- [ ] Dateiname-Muster: `[Run-ID]-Wareneingang.csv` / `.xml`
- [ ] Index.tsx Export-Buttons funktionieren fuer abgeschlossene Runs
- [x] `features/INDEX.md` aktualisiert

---

## 10. Implementierungs-Protokoll (Phase 2)

Durchgefuehrt am 2026-03-07 durch Sonnet 4.6 (claude-sonnet-4-6) im Plan-Modus.
Ergebnis: alle 9 Schritte erfolgreich umgesetzt, `npx tsc --noEmit` → **0 Errors**.

### Umgesetzte Schritte

| Nr | Datei | Aktion | Status |
|----|-------|--------|--------|
| 1 | `src/services/matching/runs/run3ExpandFifo.ts` | Bug-A-Fix: `vorgang: allocOrder.vorgang` in `singleAllocatedOrders` hinzugefuegt (1 Zeile, chirurgisch) | Done |
| 2 | `src/services/exportService.ts` | NEU erstellt: `escapeXml`, `csvQuote`, `resolveColumnValue`, `generateXML`, `generateCSV`, `buildExportFileName`, `RunExportMeta` Interface | Done |
| 3 | `src/store/exportConfigStore.ts` | `csvDelimiter: string` + `setCsvDelimiter` Action + `loadPersistedDelimiter()` Helper ergaenzt | Done |
| 4 | `src/components/SettingsPopup.tsx` | shadcn `<Select>` fuer CSV-Trennzeichen (Komma/Semikolon/Tab) in `ExportConfigTab` eingefuegt | Done |
| 5 | `src/components/run-detail/ExportPanel.tsx` | Vollrefaktor: inline `resolveColumn`/`xmlPreview` entfernt, importiert aus exportService; `handleDownload(format)` mit Blob-Download + Archive + logService + addAuditEntry + setLastDiagnostics; zweiter CSV-Button | Done |
| 6 | `src/pages/RunDetail.tsx` | `issues` + `addAuditEntry` in Store-Destructuring; `isExportReady` useMemo; `handleToolbarExport` (XML+CSV); Toolbar-Button-Fix `bg-[#008C99]`; Imports fuer exportService + exportConfigStore + logService | Done |
| 7 | `src/pages/Index.tsx` | `generateRunExport`-Stub entfernt; importiert exportService + exportConfigStore + sonner toast; `exportReady` via Step-Completion-Proxy; `handleDownloadFormat` auf exportService umgestellt; Toast bei leerem Run | Done |
| 8 | `features/INDEX.md` | PROJ-42 als Done eingetragen | Done |
| 9 | Terminal | `npx tsc --noEmit` → 0 Errors | Done |

### TypeScript-Ergebnis

```
$ npx tsc --noEmit
(keine Ausgabe — 0 Errors, 0 Warnings)
```

### Ergaenzende Hinweise fuer zukuenftige Agenten (H13–H17)

**H13 — ExportPanel xmlPreview on-render:**
`xmlPreview` wird bei jedem Render neu generiert via `generateXML(invoiceLines, columnOrder, runMeta)`. Der Kopier-Button nutzt denselben Wert — kein separater State noetig.

**H14 — invoiceLines-Filter in Index.tsx:**
Index.tsx hat `allInvoiceLines` aus dem Store und filtert per `allInvoiceLines.filter(l => l.lineId.startsWith(run.id + '-line-'))`. Dieser Pattern ist konsistent mit ExportPanel und RunDetail.

**H15 — Toast bei persisted-only Rows:**
`handleDownloadFormat` in Index.tsx prueft `runLines.length === 0` und zeigt `toast.info('Bitte laden Sie diesen Run zuerst...')`. Da `exportReady` fuer persisted-only Rows via Step-Proxy berechnet wird, werden die Download-Buttons in der Regel nicht gerendert — der Toast ist ein Sicherheitsnetz.

**H16 — FORMAT_TYPES ohne json:**
`FORMAT_TYPES` in Index.tsx ist `Array<'xml' | 'csv'>` = `['xml', 'csv']`. Das JSON-Format wurde entfernt, da `handleDownloadFormat` nur `'xml' | 'csv'` akzeptiert. Kein `'json'`-Case in exportService vorhanden.

**H17 — Toolbar-Button loest BEIDE Downloads aus:**
`handleToolbarExport` in RunDetail.tsx generiert und laedt XML + CSV in einem Click (sequenziell). Der Button ist nur sichtbar wenn `isExportReady === true` (0 Blocker + alle Lagerorte + Lines > 0).
