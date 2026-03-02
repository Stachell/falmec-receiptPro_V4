# PROJ-23 ADD-ON: Upload-Validierung & Dateiformat-Erweiterung

**Status:** In Progress
**Scope:** `src/pages/NewRun.tsx`, `src/services/matching/orderParser.ts`, `src/store/runStore.ts`, `src/types/index.ts`
**Ticket-Kontext:** PROJ-23 (3-Run Engine / OrderPool)
**Datum:** 2026-03-02

---

## Motivation

Die Analyse hat gezeigt, dass die Matching-Engine fehlerfrei arbeitet, aber ~85% der Bestellpositionen verworfen werden, weil Excel beim CSV-Export lange EAN-Nummern in wissenschaftliche Notation umwandelt (`8,03412E+12`). Statt diesen Müll zu normalisieren (fragiler Workaround), wird das Problem an der Wurzel gepackt:

1. **Direkte XLSX/XLS-Imports** umgehen den Präzisionsverlust vollständig.
2. **Fail-Fast-Validierung** blockiert korrupt exportierte Dateien sofort mit klarer Fehlermeldung.
3. **KISS-Bugfix** behebt ein UI-Stale-State-Problem auf der NewRun-Seite.

---

## Massnahme 1: Dateiformat-Erweiterung (XLSX / XLS / XML)

### NewRun.tsx

Der Order-Upload-Slot akzeptiert ab sofort `.csv`, `.xlsx`, `.xls` und `.xml`:

```typescript
// ALT
accept={{ 'text/csv': ['.csv'], 'application/vnd.ms-excel': ['.csv'] }}

// NEU
accept={{
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls', '.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/xml': ['.xml'],
  'text/xml': ['.xml'],
}}
```

Label + Description werden ebenfalls aktualisiert.

### orderParser.ts

Binary `isCsv/else`-Logik durch explizite Extension-Erkennung ersetzen:

```typescript
const ext = file.name.toLowerCase().split('.').pop() ?? '';
let workbook: XLSX.WorkBook;
if (ext === 'csv') {
  workbook = XLSX.read(new TextDecoder('iso-8859-1').decode(buffer), { type: 'string', FS: ';' });
} else {
  // xlsx, xls, xml — Binary-Read (SheetJS unterstützt alle nativ)
  workbook = XLSX.read(buffer, { type: 'array' });
}
```

SheetJS unterstützt XLSX, XLS und SpreadsheetML-XML out-of-the-box. Keine neuen Packages.

---

## Massnahme 2: Pre-Check-Funktion (Fail Fast)

### Neue private Funktion `validateOrderDataRows()`

Läuft in `parseOrderFile()` nach `detectColumns()` und **vor** der Hauptzeilen-Schleife.

**Regel A — Wissenschaftliche Notation:**
```
Regex: /^-?\d[\d,.]*(E|e)[+\-]\d+$/
→ Matched: "8,03412E+12", "8.03412E+12", "8.03412e+12"
→ Wenn ≥ 1 Treffer → hartes ABORT mit Meldung
```

**Regel B — Fehlende Artikel-IDs:**
```
→ Zeile hat weder EAN noch artNoDE noch artNoIT
→ Schwellwert: ≥ 5 Zeilen ODER > 80% aller Zeilen
→ Hartes ABORT mit Meldung
```

Toleranz-Schwellwert verhindert Fehlalarme durch legitime Summen-/Leerzeilen.

### Erweiterung OrderParseResult

Neues optionales Feld `validationError?: string` im Interface.

### runStore.ts Guard

An allen 3 `parseOrderFile`-Callsites (`~1477`, `~1635`, `~1885`) wird nach dem bestehenden Confidence-Gate ein weiterer Guard eingefügt:

```typescript
if (parseResult.validationError) {
  logService.error(`[OrderParser] Validierungsfehler: ${parseResult.validationError}`, ...);
  // Issue severity='error' + Step 4 → 'failed'
  return;
}
```

---

## Massnahme 3: KISS-Bugfix Warning bleibt stehen

### Problem
Gelbes Warning `Bitte wählen Sie ein Datenverzeichnis` prüft `!isDirectoryConfigured` (lokaler React State). Wird das Verzeichnis über den AppFooter gesetzt, bleibt der State stale — Warning bleibt stehen.

### Fix
Einzeiler in `NewRun.tsx`:

```typescript
// ALT
{allFilesUploaded && !isDirectoryConfigured && (

// NEU
{allFilesUploaded && !canStartProcessing && (
```

`canStartProcessing` liest `fileSystemService.getDataPath()` direkt — immer aktuell, kein Stale-State.

---

## Verifikation

| Test | Erwartung |
|------|-----------|
| XLSX-Datei in Order-Slot ziehen | Akzeptiert, kein "Ungültiges Format" |
| CSV mit `8,03412E+12` in EAN-Spalte | Step 4 → Fehler: "Datenverlust in EAN-Spalte" |
| CSV ohne jegliche Artikel-IDs | Step 4 → Fehler: "Pflicht-IDs fehlen" |
| Korrekte XLSX hochladen | Normaler Flow, keine Fehler |
| Warning nach AppFooter-Verzeichniswahl | Warning verschwindet sofort |

---

## Scope-Abgrenzung

- `matchingEngine.ts`, `orderPool.ts`, `orderMapper.ts` — unberührt
- Matcher-Runs (`run1`, `run2`, `run3`) — unberührt
- `masterDataParser.ts` — unberührt
- Keine neuen npm-Packages
