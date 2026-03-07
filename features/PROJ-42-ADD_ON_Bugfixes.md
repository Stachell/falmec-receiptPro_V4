# PROJ-42-ADD-ON: Export-Bugfixes & Erweiterungen

## Context
PROJ-42 (Export-Architektur) hat funktionale Maengel: Die Export-Kachel loest keinen Download aus, der Toolbar-Button "XML + CSV Export" ist ueberfluessig, das Feld-Mapping hat zwei Einzelpreise statt einem konsolidierten, das Lieferanten-Feld ist leer, und die CSV-Headerzeile ist nicht konfigurierbar. Dieses ADD-ON behebt 7 Bugs und fuegt 1 Feature hinzu.

## SONNET-AGENT PFLICHT-HINWEIS
> **ZWINGENDE REGELN fuer den ausfuehrenden Sonnet-Agenten:**
> 1. **IMMER** zuerst in den Plan-Modus gehen.
> 2. **IMMER** in die Projektdaten schreiben (`features/PROJ-42-ADD_ON_Bugfixes.md`).
> 3. Am Ende **selbststaendig** `npx tsc --noEmit` ueber das Bash-Terminal ausfuehren und **alle** Fehler fixen.
> 4. Die Datei `features/INDEX.md` aktualisieren.
> 5. **Keine bestehenden Workflows oder Verknuepfungen beschaedigen.** Vor jeder Aenderung die betroffene Datei LESEN.

---

## Aenderungen nach Datei gruppiert

### 1. `src/types/index.ts` — ExportColumnKey + RunStats
**a) ExportColumnKey (Zeile ~472-487):**
- ENTFERNE `'unitPriceInvoice'` und `'unitPriceOrder'`
- FUEGE HINZU: `'unitPrice'` (konsolidierter Einzelpreis)
- FUEGE HINZU: `'bookingDate'` (Datum der Buchung)
- Ergebnis: weiterhin 15 Member (2 entfernt, 2 hinzugefuegt)

**b) RunStats-Interface (Zeile 167-195) — Neues Feld `bookingDate`:**
```ts
export interface RunStats {
  // ... bestehende Felder ...
  /** PROJ-42-ADD-ON: Buchungsdatum DD.MM.YYYY, einmalig beim ersten Export gesetzt. */
  bookingDate?: string;
}
```
- NICHT im Run-Interface, sondern in RunStats, weil RunStats Teil von Run.stats ist
- Wird beim ERSTEN Export-Klick einmalig gesetzt und danach NICHT mehr geaendert
- Persistiert ueber IndexedDB via runPersistenceService (PersistedRunData.run.stats)

### 2. `src/store/exportConfigStore.ts` — Spalten + Header-Toggle
**a) DEFAULT_COLUMN_ORDER (Zeile 17-33):**
- Position 7: `{ columnKey: 'unitPrice', label: 'Einzelpreis' }` (ersetzt `unitPriceInvoice`)
- Position 8: `{ columnKey: 'bookingDate', label: 'Datum der Buchung' }` (ersetzt `unitPriceOrder`)
- Restliche Positionen 9-15 bleiben identisch

**b) Neuer State `csvIncludeHeader`:**
- Neuer localStorage-Key: `exportCsvIncludeHeader`
- Interface `ExportConfigState` erweitern: `csvIncludeHeader: boolean` + `setCsvIncludeHeader: (v: boolean) => void`
- `loadPersistedHeaderFlag()` Funktion: liest aus localStorage, Default = `false`
- Store-Init: `csvIncludeHeader: loadPersistedHeaderFlag()`
- Setter: schreibt in localStorage + `set({ csvIncludeHeader: v })`

**c) Migration:** `loadPersistedOrder` (Zeile 55) validiert Keys gegen `DEFAULT_COLUMN_ORDER` — alte Configs mit `unitPriceInvoice`/`unitPriceOrder` fallen automatisch auf Defaults zurueck. Kein extra Migrationscode noetig.

### 3. `src/services/exportService.ts` — resolveColumnValue + generateCSV
**a) resolveColumnValue (Zeile 42-58):**
- ENTFERNE `case 'unitPriceInvoice'` und `case 'unitPriceOrder'`
- NEU: `case 'unitPrice': return { tag: 'UnitPrice', value: String(line.unitPriceFinal ?? line.unitPriceInvoice) }`
- NEU: `case 'bookingDate': return { tag: 'BookingDate', value: meta.bookingDate ?? '' }`
  - **ACHTUNG:** `bookingDate` kommt aus `RunExportMeta`, NICHT aus `new Date()`!

**b) RunExportMeta erweitern:**
```ts
export interface RunExportMeta {
  fattura: string;
  invoiceDate: string;
  deliveryDate: string | null;
  eingangsart: string;
  runId: string;
  bookingDate: string;  // DD.MM.YYYY, persistent aus Run.stats.bookingDate
}
```

**c) generateCSV Signatur (Zeile 91):**
- Neuer Parameter: `includeHeader: boolean` (nach `delimiter`)
- Header-Zeile nur einfuegen wenn `includeHeader === true`
- Logik: `const parts = includeHeader ? [header, ...rows] : rows; return bom + parts.join('\r\n');`

### 4. `src/services/matching/OrderMatcher.ts` — Lieferant-Fix (Bug 6)
**Zeile 86:** `supplierId: chosen.supplierId` AENDERN zu:
```ts
supplierId: chosen.supplierId || line.supplierId,
```
**Grund:** OpenWE-orderParser setzt `supplierId` auf `''` wenn die Spalte fehlt. Das ueberschreibt den von ArticleMaster (Step 2) gesetzten Wert. Mit Fallback bleibt der ArticleMaster-Wert erhalten.

### 5. `src/store/runStore.ts` — Buchungsdatum-Setter (Race-Condition-sicher)
**a) Neuer Action `setBookingDate` — GIBT aktualisierten Run ZURUECK:**
```ts
setBookingDate: (runId: string, date: string) => Run | null;
```
**Implementierung (KRITISCH — Race-Condition vermeiden):**
```ts
setBookingDate: (runId, date) => {
  const { runs, currentRun } = get();
  const targetRun = runs.find(r => r.id === runId);
  if (!targetRun) return null;
  // Einmaliges Setzen: nur wenn noch nicht vorhanden
  if (targetRun.stats.bookingDate) return targetRun;

  const updatedStats = { ...targetRun.stats, bookingDate: date };
  const updatedRun = { ...targetRun, stats: updatedStats };

  set({
    runs: runs.map(r => r.id === runId ? updatedRun : r),
    currentRun: currentRun?.id === runId
      ? { ...currentRun, stats: updatedStats }
      : currentRun,
  });

  return updatedRun;  // <-- DIREKT zurueckgeben, nicht auf Re-Render warten!
},
```
**WARUM Return-Value?** Zustand/React State-Updates sind asynchron. Der naechste `currentRun`-Zugriff im selben Event-Handler hat den alten Wert. Der Return-Value liefert das frische Run-Objekt sofort.

**b) Interface RunState erweitern:**
```ts
setBookingDate: (runId: string, date: string) => Run | null;
```

**c) Bestehende `setManualPrice` bleibt UNVERAENDERT.**

### 5a. `src/components/run-detail/IssuesCenter.tsx` — Preis-Anzeige korrigieren
**Zeile 770:** Die Anzeige im price-mismatch-Resolver zeigt falsche Werte:
```
AKTUELL:  Pos. {l.positionIndex}: {l.unitPriceInvoice?.toFixed(2)} EUR -> {l.unitPriceSage?.toFixed(2)} EUR (manuell)
```
**AENDERN zu:**
```tsx
Pos. {l.positionIndex}: RE {l.unitPriceInvoice?.toFixed(2)} EUR -> Final {(l.unitPriceFinal ?? l.unitPriceInvoice)?.toFixed(2)} EUR (manuell)
```

**HINWEIS — PriceCell-Workflow funktioniert bereits korrekt:**
- In Artikelliste (ItemsTable): `readOnly={!currentRun?.isExpanded}` -> nach Step 4 ist Popover aktiv
- Alle drei Optionen (Rechnungspreis/Sage-Preis/Manuell) rufen `setManualPrice` -> `unitPriceFinal = price`
- Export liest `unitPriceFinal ?? unitPriceInvoice` — Workflow ist konsistent

### 6. `src/pages/RunDetail.tsx` — Export-Kachel + Toolbar-Button
**a) Toolbar-Button ENTFERNEN (Zeile 642-652):**
- Gesamten Block `{isExportReady && ( <Button ...>XML + CSV Export</Button> )}` loeschen

**b) `handleToolbarExport` ENTFERNEN (Zeile 298-344):**
- Komplette Funktion loeschen (toter Code nach Button-Entfernung)

**c) Export-Kachel (Kachel 6, Zeile 712-759) — Neues Verhalten:**
- **Optik-Wechsel:** Wenn `allStepsComplete && isExportReady`:
  - Hintergrund: `bg-[#008C99]` (statt `bg-[#c9c3b6]`)
  - Text/Icon: weiss (`text-white`)
  - Hover: `hover:bg-[#007080]`
  - Icon: Download-Icon in weiss
  - Label: "Export" in weiss
  - SubValue: "CSV herunterladen" in weiss/opacity
- **Klick-Handler:** Wenn `allStepsComplete && isExportReady`: `handleTileExport()` aufrufen

**d) Neuer Handler `handleTileExport` (Race-Condition-sicher):**
```ts
const handleTileExport = () => {
  if (!currentRun || !isExportReady) return;

  // 1. Buchungsdatum: setBookingDate gibt frischen Run zurueck (sync!)
  const freshRun = setBookingDate(currentRun.id, new Date().toLocaleDateString('de-DE'));
  if (!freshRun) return;

  // 2. RunMeta mit frischem bookingDate aufbauen
  const runMeta: RunExportMeta = {
    fattura: freshRun.invoice.fattura,
    invoiceDate: freshRun.invoice.invoiceDate,
    deliveryDate: freshRun.invoice.deliveryDate ?? null,
    eingangsart: freshRun.config.eingangsart,
    runId: freshRun.id,
    bookingDate: freshRun.stats.bookingDate ?? new Date().toLocaleDateString('de-DE'),
  };

  // 3. CSV generieren + Download
  const csvContent = generateCSV(currentRunLines, columnOrder, runMeta, csvDelimiter, csvIncludeHeader);
  const csvFileName = buildExportFileName(freshRun.id, 'csv');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = csvFileName; a.click();
  URL.revokeObjectURL(url);

  // 4. Archive mit frischem Run
  archiveService.writeArchivePackage(freshRun, currentRunLines, { exportCsv: csvContent }).catch(() => {});

  // 5. Log + Audit + Diagnostics
  logService.info(`Export durchgefuehrt: ${csvFileName}`, {
    runId: freshRun.id, step: 'Export',
    details: `Format: CSV, Positionen: ${currentRunLines.length}, Spalten: ${columnOrder.length}`,
  });
  addAuditEntry({ runId: freshRun.id, action: 'export-download', details: `CSV: ${csvFileName}`, userId: 'system' });
  setLastDiagnostics({ timestamp: new Date().toISOString(), fileName: csvFileName, lineCount: currentRunLines.length, status: 'success' });
};
```

**e) Store-Destructuring erweitern:**
- `setBookingDate` aus `useRunStore`
- `csvIncludeHeader` aus `useExportConfigStore`
- `setLastDiagnostics` aus `useExportConfigStore`

**f) Imports:** `archiveService` importieren. `generateCSV`/`buildExportFileName` behalten.

### 7. `src/components/run-detail/ExportPanel.tsx` — includeHeader + bookingDate (Race-Condition-sicher)
**Destructuring:**
- `setBookingDate` aus `useRunStore`
- `csvIncludeHeader` aus `useExportConfigStore`

**handleDownload aendern:**
```ts
const handleDownload = (format: 'xml' | 'csv') => {
  // Buchungsdatum: einmalig setzen, frischen Run zurueck bekommen
  const freshRun = setBookingDate(run.id, new Date().toLocaleDateString('de-DE'));
  const effectiveRun = freshRun ?? run;

  const runMeta: RunExportMeta = {
    fattura: effectiveRun.invoice.fattura,
    invoiceDate: effectiveRun.invoice.invoiceDate,
    deliveryDate: effectiveRun.invoice.deliveryDate ?? null,
    eingangsart: effectiveRun.config.eingangsart,
    runId: effectiveRun.id,
    bookingDate: effectiveRun.stats.bookingDate ?? '',
  };

  // ... rest wie bisher, aber generateCSV mit includeHeader ...
  const content = isXml
    ? xmlPreview
    : generateCSV(invoiceLines, columnOrder, runMeta, csvDelimiter, csvIncludeHeader);

  // ... Blob download, archive mit effectiveRun, logging ...
};
```

### 8. `src/components/SettingsPopup.tsx` — Header-Toggle
**In `ExportConfigTab` (Zeile 175-280):**
- Destructuring erweitern: `csvIncludeHeader, setCsvIncludeHeader`
- Nach CSV-Trennzeichen-Section (nach Zeile 261), VOR Aktionsleiste einfuegen:
```tsx
<div className="border-t border-border pt-3">
  <div className="flex items-center justify-between">
    <Label className="text-xs font-semibold">Headerzeile einfuegen:</Label>
    <Switch checked={csvIncludeHeader} onCheckedChange={setCsvIncludeHeader} />
  </div>
  <p className="text-xs text-muted-foreground mt-1">
    Wenn aktiviert, wird eine Kopfzeile mit Spaltennamen in die CSV-Datei eingefuegt.
  </p>
</div>
```
- `Switch` ist bereits importiert (Zeile 17)

### 9. Archiv-Persistenz (Bug 3 — Verifikation)
Kein Code-Aenderung noetig. Der bestehende Flow funktioniert korrekt.
- NEU: Alle Export-Handler nutzen jetzt `freshRun` (Return von `setBookingDate`) fuer `archiveService.writeArchivePackage`, damit das Archiv-Paket konsistente Daten enthaelt.

### 10. `src/pages/Index.tsx` — generateCSV Call-Site (Zeile 164)
**WICHTIG:** Auch in Index.tsx wird `generateCSV` aufgerufen (Zeile 164):
- `csvIncludeHeader` aus `useExportConfigStore` destructuren
- RunExportMeta braucht `bookingDate`: `run.stats.bookingDate ?? ''`
- `generateCSV(runLines, columnOrder, meta, csvDelimiter, csvIncludeHeader)`

### 11. Dokumentation
**`features/INDEX.md`:** PROJ-42-ADD-ON Eintrag hinzufuegen

---

## ACHTUNG: Bestehende Funktionen NICHT verletzen

### InvoiceLine.unitPriceInvoice bleibt UNVERAENDERT
Die Property `unitPriceInvoice` auf `InvoiceLine` (types/index.ts Zeile 273) wird an ~30 Stellen verwendet. NICHT umbennen/entfernen!
- NUR der `ExportColumnKey`-Typ aendert sich: `'unitPriceInvoice'` -> `'unitPrice'`

### Alle generateCSV Call-Sites muessen aktualisiert werden
1. `src/components/run-detail/ExportPanel.tsx` (Zeile 62)
2. `src/pages/RunDetail.tsx` (Zeile 310 — wird geloescht mit handleToolbarExport)
3. `src/pages/Index.tsx` (Zeile 164) — NICHT VERGESSEN!

### Alle RunExportMeta-Konstruktionen muessen bookingDate enthalten
1. `src/components/run-detail/ExportPanel.tsx` (handleDownload)
2. `src/pages/RunDetail.tsx` (handleTileExport)
3. `src/pages/Index.tsx` (Zeile 155-161)

### generateXML Signatur bleibt UNVERAENDERT
Kein `includeHeader`-Parameter. Aber RunExportMeta mit `bookingDate` muss uebergeben werden (Typsicherheit).

### Kachel 6: Bestehende States erhalten
Pausiert / Workflow laufend / Failed Step bleiben IDENTISCH. Nur `allStepsComplete` aufteilen:
- `allStepsComplete && isExportReady` -> teal-Optik + CSV-Download
- `allStepsComplete && !isExportReady` -> tan-Optik, wechselt zu Export-Tab

---

## Ausfuehrungsreihenfolge
1. `src/types/index.ts` — ExportColumnKey + RunStats.bookingDate
2. `src/services/exportService.ts` — resolveColumnValue + RunExportMeta + generateCSV
3. `src/store/exportConfigStore.ts` — DEFAULT_COLUMN_ORDER + csvIncludeHeader
4. `src/store/runStore.ts` — setBookingDate Action (mit Return-Value!)
5. `src/services/matching/OrderMatcher.ts` — supplierId Fallback
6. `src/components/run-detail/IssuesCenter.tsx` — Preis-Anzeige
7. `src/components/run-detail/ExportPanel.tsx` — bookingDate + includeHeader
8. `src/components/SettingsPopup.tsx` — Header-Toggle
9. `src/pages/RunDetail.tsx` — Kachel + Toolbar
10. `src/pages/Index.tsx` — generateCSV + bookingDate
11. `npx tsc --noEmit` -> Fehler fixen
12. `features/PROJ-42-ADD_ON_Bugfixes.md` aktualisieren
13. `features/INDEX.md` aktualisieren

---

## Verifikation
1. `npx tsc --noEmit` — keine Typfehler
2. Kachel 6: Optik-Wechsel bei Export-Bereitschaft, Klick -> CSV-Download
3. Toolbar-Button "XML + CSV Export" ist weg
4. Export-Tab: "CSV exportieren" + "XML exportieren" funktionieren
5. CSV: Ein "Einzelpreis"-Feld (`unitPriceFinal ?? unitPriceInvoice`), "Datum der Buchung" DD.MM.YYYY
6. Buchungsdatum-Persistenz: Export -> Reload -> erneut exportieren -> Datum IDENTISCH
7. "Lieferant" befuellt (5-stellige Nummer)
8. Headerzeile: Default OFF, Settings-Toggle persistiert
9. IssuesCenter: `unitPriceFinal`-Wert korrekt angezeigt

---

## Nuetzliche Hinweise fuer Sonnet bei der Durchfuehrung des Plans um Fehler zu vermeiden

### Fallstricke

1. **Race-Condition bookingDate:** `setBookingDate` gibt den aktualisierten `Run` als Return-Value zurueck. NIEMALS `currentRun` nach dem `set()` im selben Handler verwenden — Zustand ist noch nicht aktualisiert! IMMER den Return-Value (`freshRun`) nutzen.

2. **InvoiceLine.unitPriceInvoice NICHT anfassen:** Das Feld `unitPriceInvoice` existiert auf `InvoiceLine` (Zeile 273) und wird an ~30 Stellen im Code verwendet (Parser, Matcher, PriceCell, KPI). Nur der `ExportColumnKey`-Union-Type aendert sich. Die Property auf dem Interface bleibt!

3. **generateCSV hat jetzt 5 Parameter:** Alle drei Call-Sites (ExportPanel, RunDetail, Index) muessen den neuen `includeHeader: boolean` Parameter erhalten. Index.tsx wird leicht uebersehen!

4. **RunExportMeta hat jetzt `bookingDate`:** Alle Stellen, die `RunExportMeta` konstruieren, muessen `bookingDate` enthalten — auch fuer `generateXML`-Aufrufe, obwohl XML den Wert nicht nutzt (Typsicherheit!).

5. **localStorage-Migration Column-Order:** Nutzer mit alten `exportColumnConfig`-Daten (mit `unitPriceInvoice`/`unitPriceOrder`) bekommen automatisch die neuen Defaults, weil `loadPersistedOrder` die Key-Validierung durchfuehrt. Kein extra Code noetig.

6. **supplierId Fallback in OrderMatcher:** Die Aenderung `chosen.supplierId || line.supplierId` ist bewusst. `chosen.supplierId` ist ein leerer String `''` wenn die OpenWE-Spalte fehlt. `||` faellt auf `line.supplierId` zurueck (aus ArticleMaster/Step 2).

7. **ExportPanel bekommt `run` als Prop:** Das `run`-Objekt in ExportPanel ist ein Prop, kein Store-Selector. Nach `setBookingDate` hat das Prop noch den alten Wert. Daher: `const freshRun = setBookingDate(run.id, ...) ?? run;` und `freshRun` fuer alles weitere nutzen.

8. **Kachel 6 hat drei bestehende States:** Pausiert (rot), Workflow laufend (tan), Failed Step (tan+retry). Diese States duerfen NICHT veraendert werden. Nur der `allStepsComplete`-Zustand bekommt die neue Logik.

### Tipps

- **Erst die Typen aendern** (types/index.ts), dann tsc laufen lassen — das zeigt sofort alle betroffenen Stellen.
- **setBookingDate im runStore:** Das Pattern fuer `set()` + Return-Value existiert NICHT im bestehenden Store. Schau dir `setManualPrice` (Zeile 2295) als Vorlage fuer das `set()`-Pattern an, aber fuege den Return-Value hinzu.
- **Switch-Komponente in SettingsPopup:** Ist bereits importiert (Zeile 17). Kein neuer Import noetig.
- **archiveService Import in RunDetail:** Pruefen ob bereits importiert. Falls nicht: `import { archiveService } from '@/services/archiveService';`
