# PROJ-48 — Anpassung Export: CSV → XLSX auf Kachel 6 + Einstellungs-Erweiterungen

Stand: 2026-03-27
Status: IMPLEMENTIERT — alle 8 Phasen abgeschlossen, Build + Tests gruen
Branch: (wird bei Umsetzung erstellt)

---

## 1. Projektziel (SOLL-Zustand)

| Exportweg | Format | Einstellungen greifen? | Wo? |
|---|---|---|---|
| **Kachel 6** (Standard-Weg, 95 %) | **XLSX** | Spaltenreihenfolge, Headerzeile, Feld-Aktivierung | RunDetail-Dashboard |
| Button "CSV exportieren" | CSV | Spaltenreihenfolge, Headerzeile, Delimiter, Feld-Aktivierung | Run-Detail > Tab "Export" |
| Button "XML exportieren" | XML | Spaltenreihenfolge, Feld-Aktivierung | Run-Detail > Tab "Export" |
| Dashboard Schnell-Downloads | CSV + XML (unveraendert) | wie bisher | Index-Seite Archiv-Tabelle |

Neue Einstellungen (Sidebar > Einstellungen > Export):
- **Feld-Aktivierung**: Jede Spalte kann per Toggle aktiv/inaktiv geschaltet werden. Nur aktive Felder erscheinen im Export. Die Sortier-Reihenfolge gilt nur fuer aktive Felder.
- **Standard-Exportformat** (Drop-Down): XLSX (Standard) oder XLS. Bestimmt das Format fuer Kachel 6.
- Headerzeile und Delimiter bleiben wie bisher, greifen kuenftig AUCH auf XLSX/XLS (Header) bzw. nur CSV (Delimiter).

---

## 2. Ist-Zustand (Zusammenfassung der Analyse)

### 2.1 Was bereits funktioniert
- Zentrale Export-Logik in `src/services/exportService.ts` (resolveColumnValue, generateCSV, generateXML, buildExportFileName)
- Einstellungen in `src/store/exportConfigStore.ts` (Spaltenreihenfolge, Delimiter, Headerzeile) — persistiert in localStorage
- Settings-UI in `src/components/SettingsPopup.tsx:175-293` (ExportConfigTab)
- Step-5-Schutzmechaniken: blockieren Export bei offenen Issues, fehlenden Lagerorten, fehlenden Zeilen
- Archivierung ueber `src/services/archiveService.ts` (appendToArchive + writeArchivePackage)
- XLSX-Paket (SheetJS) bereits installiert und aktiv genutzt (serialFinder, masterDataParser, orderParser)
- Versionierung + bookingDate auf Kachel 6 und Export-Tab

### 2.2 Was noch fehlt
- Kein XLSX-Generator in exportService.ts
- Kachel 6 ist hart auf CSV verdrahtet (`RunDetail.tsx:350-358`)
- Archiv-Metadaten kennen nur `exportXml` und `exportCsv` — kein `exportXlsx` (`types/index.ts:559-560`)
- Archiv-Service erkennt nur `.xml` und `.csv` (`archiveService.ts:349-350, 742-743`)
- Keine Moeglichkeit Felder aktiv/inaktiv zu schalten
- Kein Drop-Down fuer Exportformat (XLSX vs. XLS)
- UI-Texte Kachel 6 sagen "CSV herunterladen"

### 2.3 Gefundene Bugs/Inkonsistenzen (VOR Umsetzung zu beheben)

| # | Bug | Datei | Schwere | Fix |
|---|-----|-------|---------|-----|
| B1 | `isDirty`-Flag wird bei Dialog-Schliessen nicht zurueckgesetzt — "Speichern"-Button erscheint beim naechsten Oeffnen obwohl nichts geaendert wurde | SettingsPopup.tsx | Mittel | Beim Schliessen des Dialogs `isDirty` auf false setzen ODER unsaved changes verwerfen |
| B2 | `saveConfig()` hat kein Error-Handling — bei vollem localStorage wird isDirty trotzdem false | exportConfigStore.ts:125-129 | Niedrig-Mittel | try/catch um setItem, isDirty nur bei Erfolg auf false |
| B3 | Headerzeile-Beschreibung referenziert nur CSV — greift kuenftig auch auf XLSX | SettingsPopup.tsx (ExportConfigTab) | Niedrig | Text auf "CSV- und XLSX-Datei" aktualisieren |

---

## 3. Umsetzungsplan

### Phase 0 — Bug-Fixes (Voraussetzung)
**Ziel**: Saubere Basis bevor neue Features draufgebaut werden.

| Task | Datei | Aenderung |
|------|-------|-----------|
| 0.1 | `src/components/SettingsPopup.tsx` | isDirty beim Dialog-Schliessen zuruecksetzen (useEffect auf open) |
| 0.2 | `src/store/exportConfigStore.ts` | saveConfig() in try/catch wrappen |

### Phase 1 — Datenmodell erweitern
**Ziel**: Typen und Store fuer die neuen Features vorbereiten.

| Task | Datei | Aenderung |
|------|-------|-----------|
| 1.1 | `src/types/index.ts` | `ExportColumnMapping` um `enabled: boolean` erweitern (Default: true) |
| 1.2 | `src/types/index.ts` | `ArchiveMetadata.files` um `exportXlsx: { name: string; size: number } \| null` erweitern |
| 1.3 | `src/store/exportConfigStore.ts` | Neuer State: `exportFormat: 'xlsx' \| 'xls'` (Default: 'xlsx'), persistiert in localStorage |
| 1.4 | `src/store/exportConfigStore.ts` | `DEFAULT_COLUMN_ORDER` um `enabled: true` pro Eintrag erweitern |
| 1.5 | `src/store/exportConfigStore.ts` | Neue Actions: `setExportFormat(f)`, `toggleColumnEnabled(columnKey)` |
| 1.6 | `src/store/exportConfigStore.ts` | `loadPersistedOrder()` — Migration INNERHALB der Validierungslogik: nach dem Key-Check jedes Entry um `enabled: entry.enabled ?? true` erweitern. WICHTIG: Die bestehende strikte Validierung (length===15, alle Keys) darf NICHT gelockert werden — nur das fehlende `enabled`-Property wird ergaenzt, nicht die Grundstruktur geaendert. |

### Phase 2 — Export-Service erweitern
**Ziel**: Zentraler XLSX-Generator auf Basis der bestehenden SSOT (resolveColumnValue).

| Task | Datei | Aenderung |
|------|-------|-----------|
| 2.1 | `src/services/exportService.ts` | Neue Hilfsfunktion `getActiveColumns(columnOrder)` — filtert auf `enabled === true`, sortiert nach position |
| 2.2 | `src/services/exportService.ts` | Neue Funktion `generateXLSX(lines, columnOrder, meta, includeHeader): Uint8Array` — nutzt SheetJS (`aoa_to_sheet`, `book_new`, `book_append_sheet`, `XLSX.write`) |
| 2.3 | `src/services/exportService.ts` | Optionaler Parameter `bookType: 'xlsx' \| 'xls'` in generateXLSX fuer Formatwahl |
| 2.4 | `src/services/exportService.ts` | `generateCSV` und `generateXML` ebenfalls auf `getActiveColumns()` umstellen, damit inaktive Felder auch dort nicht erscheinen |
| 2.5 | `src/services/exportService.ts` | buildExportFileName: funktioniert bereits generisch — keine Aenderung noetig |

**Architektur-Entscheidung**: Kein `buildExportMatrix()`-Zwischenschritt noetig. `resolveColumnValue()` bleibt die SSOT. `getActiveColumns()` ist der einzige neue Filter. KISS.

### Phase 3 — Kachel 6 von CSV auf XLSX umstellen
**Ziel**: Standard-Download-Weg liefert XLSX (oder XLS je nach Einstellung).

| Task | Datei | Zeilen (ca.) | Aenderung |
|------|-------|-------------|-----------|
| 3.1 | `src/pages/RunDetail.tsx` | 349-359 | `generateCSV(...)` durch `generateXLSX(...)` ersetzen, `exportFormat` aus Store lesen |
| 3.2 | `src/pages/RunDetail.tsx` | 352 | Dateiname: `buildExportFileName(id, exportFormat, version)` statt 'csv' |
| 3.3 | `src/pages/RunDetail.tsx` | 353 | Blob-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (XLSX) bzw. `application/vnd.ms-excel` (XLS) |
| 3.4 | `src/pages/RunDetail.tsx` | 365, 371 | extraFiles-Key: XLSX-Dateiname + Uint8Array-Content (statt CSV-String) |
| 3.5 | `src/pages/RunDetail.tsx` | 377-383 | Log-/Audit-/Diagnostik-Texte: "CSV" durch dynamischen Formatnamen ersetzen |
| 3.6 | `src/pages/RunDetail.tsx` | 789 | UI-Text: "CSV herunterladen" → "XLSX herunterladen" (dynamisch je nach exportFormat) |

**WICHTIG**: Folgendes bleibt UNVERAENDERT:
- setBookingDate, incrementExportVersion
- isExportReady-Guard
- Archiv-Aufruf (appendToArchive / writeArchivePackage)
- Run-Log, Audit-Log, Diagnostik-Pipeline

### Phase 4 — Export-Tab (CSV + XML) absichern
**Ziel**: CSV- und XML-Buttons bleiben funktional, nutzen aber ebenfalls die Feld-Aktivierung.

| Task | Datei | Aenderung |
|------|-------|-----------|
| 4.1 | `src/components/run-detail/ExportPanel.tsx` | `generateCSV` und `generateXML` mit `getActiveColumns(columnOrder)` statt rohem `columnOrder` aufrufen |
| 4.2 | `src/components/run-detail/ExportPanel.tsx` | Keine sonstige Aenderung — Buttons, UI, Flow bleiben identisch |

### Phase 5 — Archiv-System erweitern
**Ziel**: XLSX wird genauso sauber archiviert wie bisher CSV.

| Task | Datei | Aenderung |
|------|-------|-----------|
| 5.1 | `src/services/archiveService.ts:349-350` | `.xlsx`-Dateierkennung in `appendToArchive` extraFileInfos hinzufuegen |
| 5.2 | `src/services/archiveService.ts:742-743` | `.xlsx`-Dateierkennung in `writeArchivePackage` Metadaten hinzufuegen |
| 5.3a | `src/services/archiveService.ts:230,662` | `extraFiles`-Typ von `Record<string, string>` auf `Record<string, string \| Blob>` aendern (beide Stellen: `appendToArchive` + `writeArchivePackage`) |
| 5.3b | `src/services/archiveService.ts:665` | `content.length` durch `content instanceof Blob ? content.size : content.length` ersetzen (Size-Berechnung fuer extraFileInfos) |
| 5.3c | `src/pages/RunDetail.tsx` (Kachel 6) | XLSX-Uint8Array vor Uebergabe an extraFiles in `new Blob([xlsxData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })` wrappen |
| 5.3d | _Hinweis_ | `fileSystemService.saveToArchive()` akzeptiert bereits `string \| Blob` — KEIN Umbau in fileSystemService noetig |
| 5.4 | `src/services/archiveService.ts:201` | Default `exportXlsx: null` in Metadaten-Initialisierung |

### Phase 6 — Settings-UI erweitern
**Ziel**: Neue Einstellungen sichtbar und bedienbar machen.

| Task | Datei | Aenderung |
|------|-------|-----------|
| 6.1 | `src/components/SettingsPopup.tsx:186-217` | Toggle (Checkbox/Switch) pro Spaltenzeile fuer aktiv/inaktiv — KISS: kleiner Switch links neben dem GripVertical-Icon |
| 6.2 | `src/components/SettingsPopup.tsx` | Inaktive Zeilen visuell gedimmt (opacity-40) darstellen, Pfeiltasten bleiben funktional |
| 6.3 | `src/components/SettingsPopup.tsx` | Neues Drop-Down "Standard-Exportformat" oberhalb der Spaltenreihenfolge: XLSX (Standard) / XLS |
| 6.4 | `src/components/SettingsPopup.tsx:271` | Headerzeile-Beschreibung: "CSV- und XLSX-Datei" statt nur "CSV-Datei" |
| 6.5 | `src/components/SettingsPopup.tsx:249-261` | CSV-Trennzeichen-Label verdeutlichen: Hinweis "Gilt nur fuer CSV-Export" |

### Phase 7 — Dashboard Schnell-Downloads (bewusst minimal)
**Ziel**: Index-Seite bleibt funktional, profitiert von Feld-Aktivierung.

| Task | Datei | Aenderung |
|------|-------|-----------|
| 7.1 | `src/pages/Index.tsx:175-177` | `generateCSV` und `generateXML` ebenfalls mit `getActiveColumns(columnOrder)` aufrufen |
| 7.2 | `src/pages/Index.tsx` | FORMAT_TYPES und handleDownloadFormat: **NICHT aendern** — Dashboard bietet weiterhin nur CSV + XML als Schnellzugriff |

**Begruendung**: XLSX-Download gehoert auf Kachel 6 (bewusste Entscheidung). Dashboard ist Quick-Access fuer Archiv-Daten — hier braucht es keinen XLSX-Button.

### Phase 8 — Tests
**Ziel**: Regressionssicherheit fuer alle drei Exportformate.

| Task | Typ | Pruefpunkte |
|------|-----|-------------|
| 8.1 | Unit-Test | `generateXLSX` liefert valide XLSX-Binaerdaten |
| 8.2 | Unit-Test | Feldwerte in XLSX identisch mit CSV-Werten (gleiche SSOT) |
| 8.3 | Unit-Test | `getActiveColumns` filtert inaktive Felder korrekt |
| 8.4 | Unit-Test | Headerzeile an/aus fuer CSV und XLSX |
| 8.5 | Unit-Test | CSV-Delimiter wirkt nur auf CSV, nicht XLSX |
| 8.6 | Unit-Test | bookType 'xlsx' vs 'xls' erzeugt unterschiedliche Binaerdaten |
| 8.7 | Manuell | Kachel 6 → XLSX-Download → in Excel oeffnen → Werte pruefen |
| 8.8 | Manuell | Export-Tab → CSV → Werte identisch zu bisherigem Verhalten |
| 8.9 | Manuell | Export-Tab → XML → Werte identisch zu bisherigem Verhalten |
| 8.10 | Manuell | Lagerort fehlt → Export blockiert (Step-5-Guard) |
| 8.11 | Manuell | Feld deaktiviert → fehlt in CSV, XML und XLSX |
| 8.12 | Manuell | Archiv → XLSX-Datei vorhanden, metadata.json referenziert sie |

---

## 4. Betroffene Dateien (Gesamt)

| Datei | Phase | Art der Aenderung |
|-------|-------|-------------------|
| `src/types/index.ts` | 1 | ExportColumnMapping + ArchiveMetadata erweitern |
| `src/store/exportConfigStore.ts` | 0, 1 | Bug-Fix + exportFormat + toggleColumnEnabled |
| `src/services/exportService.ts` | 2 | generateXLSX + getActiveColumns |
| `src/pages/RunDetail.tsx` | 3 | Kachel 6: CSV → XLSX |
| `src/components/run-detail/ExportPanel.tsx` | 4 | getActiveColumns einbinden |
| `src/services/archiveService.ts` | 5 | XLSX-Metadaten + Binaer-Support |
| `src/components/SettingsPopup.tsx` | 0, 6 | Bug-Fix + Toggle + Drop-Down |
| `src/pages/Index.tsx` | 7 | getActiveColumns einbinden |
| `src/services/exportService.test.ts` (NEU) | 8 | Unit-Tests fuer Export-Service |

---

## 5. Risiken und Gegenmassnahmen

| Risiko | Eintrittswahrscheinlichkeit | Gegenmassnahme |
|--------|----------------------------|----------------|
| Doppelte Feldlogik (XLSX nutzt nicht resolveColumnValue) | Niedrig wenn Plan befolgt | XLSX MUSS ueber resolveColumnValue gehen |
| Archiv blind fuer XLSX | Sicher ohne Phase 5 | Phase 5 ist Pflicht, nicht optional |
| Step-5-Blocker umgangen | Niedrig | handleTileExport prueft weiterhin isExportReady |
| Binaerdaten in extraFiles brechen Archiv-Service | **Entschaerft** | `fileSystemService.saveToArchive()` akzeptiert bereits `string \| Blob`. Phase 5.3a-d: extraFiles-Typ auf `string \| Blob`, Size-Berechnung anpassen, XLSX als Blob wrappen |
| localStorage-Migration bei enabled-Flag | Niedrig | Phase 1.6: fehlende Property → true als Default |
| XLS-Format-Probleme (aelteres Format) | Niedrig | SheetJS unterstuetzt bookType 'xls' nativ |

---

## 6. Abgrenzung (explizit NICHT im Scope)

- Kein Umbau der XML-Vorschau im Export-Tab
- Kein XLSX-Button im Dashboard (Index.tsx) — dort bleiben nur CSV + XML
- Keine serverseitige Export-API — alles bleibt clientseitig
- Keine Aenderung an Step-5-Blockern oder Issue-Generatoren
- Kein Drag-and-Drop fuer Spaltenreihenfolge (bleibt bei Pfeiltasten)

---

## 7. Offene Fragen / Ruecksprache-Punkte

- [x] **Format Drop-Down**: XLSX (Standard) + XLS als Option — KISS-konform? → Im Plan aufgenommen
- [x] **Feld-Aktivierung**: Toggle pro Spalte — KISS-konform? → Im Plan aufgenommen (kleiner Switch pro Zeile)
- [x] **Frage 1**: Inaktive Felder fehlen ueberall (CSV, XML, XLSX) — bestaetigt
- [x] **Frage 2**: Sofortpersistenz via localStorage — kein saveConfig()-Button noetig fuer Format/Feld-Aktivierung
- [x] **Frage 3**: Dashboard ersetzt CSV+XML durch XLSX-Download (Planabweichung von Phase 7)

---

## 8. Umsetzungsreihenfolge (empfohlen)

```
Phase 0  →  Phase 1  →  Phase 2  →  Phase 3  →  Phase 4  →  Phase 5  →  Phase 6  →  Phase 7  →  Phase 8
Bug-Fix     Typen       Service     Kachel 6    Export-Tab   Archiv      Settings    Dashboard   Tests
                                                                         UI
```

Jede Phase ist einzeln testbar und commitbar. Bei Problemen in einer Phase bleiben die vorherigen stabil.

---

## Changelog

| Datum | Aenderung |
|-------|-----------|
| 2026-03-27 | Plan erstellt auf Basis Diagnostic + Code-Analyse |
| 2026-03-27 | Kreuzverhoer: Phase 5.3 aufgesplittet (5.3a-d) — fileSystemService akzeptiert bereits Blob, kein Umbau noetig. Phase 1.6 praezisiert (strikte Validierung beibehalten). UI-Text-Referenzen B3 korrigiert. Risiko "Binaerdaten" entschaerft. |
| 2026-03-27 | **IMPLEMENTIERUNG ABGESCHLOSSEN** — alle 8 Phasen umgesetzt, 11 Unit-Tests gruen, Build erfolgreich (Details siehe Abschnitt 9) |

---

## 9. Implementierungsbericht

### Umsetzungsstatus: VOLLSTAENDIG

| Phase | Status | Zusammenfassung |
|-------|--------|-----------------|
| 0 — Bug-Fixes | DONE | `saveConfig()` in try/catch gewrappt. isDirty wird beim Dialog-Schliessen auto-gespeichert (useEffect auf `open`). |
| 1 — Datenmodell | DONE | `ExportColumnMapping.enabled?: boolean` (Default true). `ArchiveMetadata.files.exportXlsx` hinzugefuegt. `ExportFormat` type + `exportFormat` State + `toggleColumnEnabled` + `setExportFormat` im Store. Migration fuer bestehende localStorage-Daten (fehlende `enabled` → `true`). |
| 2 — Export-Service | DONE | `getActiveColumns()` filtert auf `enabled !== false`, sortiert nach position. `generateXLSX()` erzeugt valide XLSX/XLS via SheetJS (aoa_to_sheet). Nutzt `resolveColumnValue` als SSOT — keine doppelte Logik. |
| 3 — Kachel 6 | DONE | `handleTileExport` erzeugt jetzt XLSX statt CSV. Blob-Type dynamisch (XLSX/XLS). Dateiname nutzt `exportFormat`. UI-Text zeigt dynamisch "XLSX herunterladen" / "XLS herunterladen". Alle Guards (isExportReady, bookingDate, exportVersion, Archiv, Log, Audit) bleiben unveraendert. |
| 4 — Export-Tab | DONE | `ExportPanel` nutzt `getActiveColumns(columnOrder)` fuer CSV, XML und XML-Vorschau. Inaktive Felder fehlen in allen Formaten. |
| 5 — Archiv-System | DONE | `extraFiles` Typ auf `Record<string, string \| Blob>` erweitert (beide Methoden). Size-Berechnung: `content instanceof Blob ? content.size : content.length`. `exportXlsx` in Metadaten (appendToArchive + writeArchivePackage + Early Archive Default). |
| 6 — Settings-UI | DONE | Neues Drop-Down "Standard-Exportformat" (XLSX/XLS). Toggle-Switch pro Spaltenzeile. Inaktive Zeilen gedimmt (opacity-40). CSV-Trennzeichen-Label: "gilt nur fuer CSV-Export". Headerzeile-Text: "CSV- und XLSX-Datei". Sofortpersistenz via localStorage (kein Speichern-Button noetig). |
| 7 — Dashboard | DONE | **Planabweichung**: CSV+XML durch XLSX ersetzt (statt nur getActiveColumns anzuwenden). `FORMAT_TYPES` auf `['xlsx']` reduziert. `handleDownloadFormat` erzeugt XLSX via `generateXLSX`. Button zeigt `.XLSX` (bzw. `.XLS` je nach exportFormat). |
| 8 — Tests | DONE | 11 Unit-Tests in `exportService.test.ts`: getActiveColumns (3), generateXLSX (4), generateCSV (1), generateXML (1), buildExportFileName (1), SSOT-Vergleich (1). Alle gruen. |

### Geaenderte Dateien

| Datei | Aenderungsart |
|-------|---------------|
| `src/types/index.ts` | `ExportColumnMapping.enabled` + `ArchiveMetadata.files.exportXlsx` |
| `src/store/exportConfigStore.ts` | Bug-Fix B2 + `ExportFormat` + `exportFormat` State + `toggleColumnEnabled` + `setExportFormat` + Migration |
| `src/services/exportService.ts` | `getActiveColumns()` + `generateXLSX()` + XLSX-Import |
| `src/pages/RunDetail.tsx` | Kachel 6: CSV → XLSX, dynamische UI-Texte |
| `src/components/run-detail/ExportPanel.tsx` | `getActiveColumns` eingebunden fuer CSV + XML |
| `src/services/archiveService.ts` | Blob-Support in extraFiles + `exportXlsx` Metadaten |
| `src/components/SettingsPopup.tsx` | Bug-Fix B1 + Toggle + Format-Dropdown + Texte |
| `src/pages/Index.tsx` | CSV+XML → XLSX Schnell-Download |
| `src/services/exportService.test.ts` | NEU: 11 Unit-Tests |

### Entscheidungen (mit Begruendung)

1. **Kein `buildExportMatrix()`**: `resolveColumnValue()` + `getActiveColumns()` reichen als SSOT. Weniger Abstraktionsebenen = weniger Fehlerflaeche.
2. **Sofortpersistenz fuer Format + Feld-Aktivierung**: Konsistent mit Delimiter/Header. Kein "Speichern vergessen".
3. **Dashboard: XLSX statt CSV+XML**: Per User-Entscheidung. CSV ist Nebenprodukt, XLSX die massgebliche Arbeitsdatei.
4. **`enabled?: boolean` statt `enabled: boolean`**: Abwaertskompatibilitaet mit bestehenden localStorage-Daten. `undefined` = `true` (Migration).

### Manuelle Test-Checkliste (noch offen)

- [ ] Kachel 6 → XLSX-Download → in Excel oeffnen → Werte pruefen
- [ ] Export-Tab → CSV → Werte identisch zu bisherigem Verhalten
- [ ] Export-Tab → XML → Werte identisch zu bisherigem Verhalten
- [ ] Lagerort fehlt → Export blockiert (Step-5-Guard)
- [ ] Feld deaktiviert → fehlt in CSV, XML und XLSX
- [ ] Archiv → XLSX-Datei vorhanden, metadata.json referenziert sie
- [ ] Format-Dropdown XLSX/XLS → richtiges Format wird heruntergeladen
- [ ] Dashboard → .XLSX Button → XLSX Download funktioniert

---

### User-Antworten zu den offenen Fragen (Archiv)

USER EINTRAG - FRAGEN ZU PUNKT 7:
- [ ] **Frage 1**: Sollen inaktive Felder in der XML-Ausgabe ebenfalls fehlen, oder soll XML immer alle 15 Felder enthalten? (Empfehlung: einheitlich — inaktive Felder fehlen ueberall)
USERANTWORT: Ich denke schon sonst wäre der sinn des ganzen sie überhaupt aktivierbar zu machen nicht gegeben. Im Endergebnis soll also nur als Datensatz in die Liste was auch aktiv ist und es soll an der Stelle stehen die im Menü gewählt wird, z.B. Pos. 1, usw.


- [ ] **Frage 2**: Soll der `saveConfig()`-Button kuenftig auch Format und Feld-Aktivierung speichern, oder reicht localStorage-Sofortpersistenz (wie bei Delimiter/Header)?


- [ ] **Frage 3**: Dashboard Schnell-Downloads (Index.tsx) — sollen diese spaeter um XLSX erweitert werden, oder bleibt CSV+XML dort dauerhaft ausreichend?
Nein, es soll gegen den Download als XLSX ersetzt werden, der Download als .CSV sind Nebenprodukte und es ist ausreichend wenn diese im 