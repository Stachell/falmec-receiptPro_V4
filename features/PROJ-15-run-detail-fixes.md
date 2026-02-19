# PROJ-15: Run-Detail UI & Logic Fixes

**Status:** In Progress
**Priorität:** High
**Voraussetzung:** PROJ-14 (Phase E abgeschlossen)

## Beschreibung
Bündelt vier kleinere Fixes für die Run-Detail-Ansicht, die nach PROJ-14 (FatturaParser_Master) aufgefallen sind: Korrekte Anzeige-Labels, Zähler, Crash-Bug beim Popup-Schließen, und ein Race-Condition-Toast.

---

## Roadmap

### AUFGABE 1: Parser-Erweiterung & Kachel-UI
- [x] `pzCount` Feld zu `ParsedInvoiceHeader` (types.ts) und `InvoiceHeader` (index.ts) hinzufügen
- [x] `header.pzCount = lines.length` im FatturaParser_Master setzen
- [x] Kachel-Label: "erkannte Positionen" → "Rechnungszeilen"
- [x] Kachel-Zähler: Format `parsedInvoiceLines / pzCount` (z.B. `45 / 45`)

### AUFGABE 2: Tabs & Popup-Crash (Stabilität)
- [x] Tab "Rechnung" → "RE-Positionen"
- [x] Tab "Positionen" → "Artikelliste"
- [x] Badge am "Artikelliste"-Tab zeigt `packagesCount` (nicht Zeilenanzahl)
- [x] DetailPopup dt-Labels: Farbe auf `#E3E0CF`
- [x] **Crash-Fix:** `open`/`line`-State in ItemsTable trennen — `detailLine` wird beim Schließen NICHT auf null gesetzt (verhindert shadcn Exit-Animation-Crash auf leerem Objekt)

### AUFGABE 3: Details-Tab aufräumen + LINK-Bereich
- [x] "Aktivitätsprotokoll" (toter Mock-Code) vollständig entfernen
- [x] Neues Feld `archivePath?: string | null` zum `Run`-Interface
- [x] `archivePath = folderName` nach erfolgreichem `writeArchivePackage` im Run persistieren
- [x] Vite-Plugin: `/api/dev/open-folder` um `?subfolder=<name>` Query-Parameter erweitern
- [x] Neuer LINK-Bereich mit Button: "Öffnet die Original-Rechnung" → öffnet Archiv-Unterordner in Explorer

### AUFGABE 4: KISS-Fix für Status-Toast
- [x] Toast-Anzeige beim Mount um 2 Sekunden verzögern (Race-Condition-Workaround)
- [x] Echter Parsing-Erfolg hat nach 2s keinen Delay mehr

### AUFGABE 5: Off-by-One Fix & Workflow Auto-Advance (Phase B)
- [x] **Off-by-One Fix:** `positionIndex + 1` → `positionIndex` in ItemsTable (Parser liefert bereits 1-basiert)
- [x] **Auto-Advance Step 2:** Nach erfolgreichem Step 1 ruft `advanceToNextStep` automatisch `executeArticleMatching(mockArticleMaster)` auf
- [x] **Auto-Advance Step 3:** Nach `executeArticleMatching` (Status `ok`/`soft-fail`) wird automatisch `advanceToNextStep` für Step 3 aufgerufen
- [x] **Error-Stop:** Automatik hält an wenn Step-Status `failed` — kein Weiterspringen über Fehler
- [x] **Start-Button Retry:** Bei `failed`-Step zeigt Button "Retry" und führt den fehlgeschlagenen Schritt erneut aus (Step 2 → `executeArticleMatching`, andere → `advanceToNextStep`)

---

## Status-Legende
- [ ] Todo
- [x] Done
- [~] In Progress
