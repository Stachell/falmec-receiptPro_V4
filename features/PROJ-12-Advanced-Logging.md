# PROJ-12: Advanced Logging & File-System Brain

## 1. Zusammenfassung

Umstellung der App von einer rein browser-basierten Datenhaltung (localStorage/IndexedDB) auf eine hybride Architektur, bei der die Festplatte via File System Access API zum persistenten "Gehirn" wird. Drei Kernbereiche: (1) ein tiefes, pro-Rechnung gefuehrtes **Run-Logfile** mit vollstaendigem Parser-Tracking, (2) ein permanent mitlaufendes **Home-Logfile** fuer System-Events, und (3) ein standardisiertes **Archivierungs-Paket** das beim Run-Abschluss alle relevanten Dateien gebuendelt auf die Festplatte schreibt. Zentrale Regel: localStorage dient nur noch als temporaerer Puffer -- nach erfolgreichem Schreiben auf die Festplatte wird der zugehoerige localStorage-Eintrag **zwingend geloescht**.

## 2. Motivation

- **Browser-Bloat**: localStorage-Limit (~5MB) wird durch akkumulierte Logs, Archive und Base64-Dateien regelmaessig erreicht. Ergebnis: Datenverlust, Fehler beim Speichern, Performance-Einbrueche.
- **Kein Cleanup**: Es gibt aktuell keine automatische Bereinigung. Run-Logs, System-Logs und Archiv-Dateien wachsen unbegrenzt.
- **File System Access API untergenutzt**: `fileSystemService.ts` hat bereits Ordnerstruktur-Erstellung und `saveToArchive()`/`saveLogFile()` implementiert, aber diese werden im Workflow **nicht aufgerufen**.
- **Debugging ohne Rohdaten**: Run-Logs enthalten aktuell nur Ergebnis-Meldungen, nicht die Roh-Texte und Pattern-Matches die fuer Post-Mortem-Analyse noetig sind.
- **Archiv unvollstaendig**: Archive enthalten nur Metadaten und kleine Base64-Dateien, nicht die vollstaendigen Export-Dateien und Original-PDFs.

## 3. Betroffene Bereiche

| Bereich | Dateien (Hauptkandidaten) |
|---|---|
| Logging-Service | `src/services/logService.ts` (240 Zeilen, Kern-Refactoring) |
| Archiv-Service | `src/services/archiveService.ts` (309 Zeilen, Kern-Refactoring) |
| Dateisystem-Service | `src/services/fileSystemService.ts` (319 Zeilen, Erweiterung) |
| Run-Store | `src/store/runStore.ts` (1288 Zeilen, Integration) |
| Footer / UI | `src/components/AppFooter.tsx` (Logfile-Button Anbindung) |
| Dashboard | `src/pages/Index.tsx` (Archiv-Aktionen) |
| Run-Detail | `src/pages/RunDetail.tsx`, `src/components/run-detail/ExportPanel.tsx` |
| PDF-Parser | `src/services/parslogic/` (Log-Hooks fuer Roh-Texte) |

---

## 4. Anforderungen im Detail

### 4.1 DAS "RUN-LOGFILE" -- Tiefes Tracking pro Rechnung

#### 4.1.1 Zweck

Das Run-Logfile dokumentiert den gesamten Verarbeitungsvorgang einer einzelnen Rechnung (= eines Runs) in maximaler Tiefe. Es dient der Nachvollziehbarkeit, dem Debugging und der Qualitaetssicherung.

#### 4.1.2 Tracking-Tiefe

Pro Run werden folgende Informationen erfasst:

| Kategorie | Was wird geloggt | Beispiel |
|---|---|---|
| **Parser-Identifikation** | Welcher Parser wurde verwendet (V3, Fallback, etc.) | `"parser": "FatturaParserV3"` |
| **Roh-Texte** | Vollstaendiger extrahierter Text pro PDF-Seite | `"rawPages": [{ "pageNo": 1, "text": "..." }]` |
| **Pattern-Matches** | Welche Regex/Pattern gegriffen haben | `"patterns": [{ "field": "fattura", "pattern": "N\\. \\d+", "matched": "N. 12345" }]` |
| **Erkannte Werte** | Finale extrahierte Werte pro Feld | `"values": { "fattura": "12345", "invoiceDate": "2026-01-15" }` |
| **Zeilen-Parsing** | Roh-Zeile vs. erkannte Artikeldaten pro InvoiceLine | `"lineParsingDetail": [{ "rawLine": "...", "parsed": {...} }]` |
| **Warnings** | Parser-Warnungen (z.B. unklare Zuordnung) | `"warnings": [{ "code": "W001", "msg": "..." }]` |
| **Errors** | Parser-Fehler | `"errors": [{ "code": "E001", "msg": "..." }]` |
| **Step-Uebergaenge** | Wann welcher Step gestartet/beendet wurde | `"steps": [{ "step": 1, "startedAt": "...", "endedAt": "..." }]` |
| **Matching-Ergebnisse** | Artikel-Match, Preis-Check, Bestell-Match pro Zeile | `"matchResults": [{ "lineId": "...", "matchStatus": "full-match" }]` |
| **User-Aktionen** | Manuelle Aenderungen (Preis, Bestellung, OK-ohne-Bestellung) | `"userActions": [{ "action": "setManualPrice", "lineId": "...", "value": 865.00 }]` |

#### 4.1.3 Hybrid-Verhalten (Store/localStorage → Festplatte)

```
PHASE 1: Waehrend der Run aktiv ist
  - Log-Eintraege werden im Zustand (Zustand-Store oder localStorage) gehalten
  - UI kann Live-Zugriff auf aktuelle Logs nehmen (z.B. Log-Tab im RunDetail)
  - localStorage-Key: `falmec-run-log-{runId}` (bestehend, wird weitergenutzt)

PHASE 2: Bei Run-Abschluss ODER Run-Abbruch
  - Das vollstaendige Run-Log wird als `run-log.json` in den Archiv-Ordner geschrieben
  - Pfad: `/.Archiv/Fattura-{Nr}_{Datum}/run-log.json`
  - Format: JSON (strukturiertes Array mit allen Kategorien aus 4.1.2)

PHASE 3: Cleanup (ZWINGEND)
  - Direkt nach erfolgreichem Schreiben der Datei:
    localStorage.removeItem(`falmec-run-log-{runId}`)
  - Bei Fehler beim Schreiben: localStorage-Eintrag bleibt erhalten,
    User erhaelt Warnung, Retry-Option wird angeboten
```

#### 4.1.4 Run-Log JSON-Schema

```typescript
interface RunLogFile {
  version: 1;
  runId: string;
  fattura: string;
  createdAt: string;          // ISO timestamp
  completedAt: string | null; // ISO timestamp oder null bei Abbruch
  status: 'completed' | 'aborted' | 'failed';
  parserUsed: string;         // z.B. "FatturaParserV3"
  config: {
    eingangsart: string;
    tolerance: number;
    currency: string;
  };

  // Roh-Texte
  rawPages: Array<{
    pageNo: number;
    text: string;
  }>;

  // Pattern-Matching Detail
  headerParsing: {
    patterns: Array<{
      field: string;
      pattern: string;
      matched: string | null;
      lineIndex: number;
    }>;
    extractedHeader: Record<string, string | number | null>;
  };

  // Zeilen-Parsing
  lineParsing: Array<{
    rawLine: string;
    positionIndex: number;
    parsed: Record<string, string | number | null> | null;
    warnings: string[];
  }>;

  // Step-Tracking
  steps: Array<{
    stepNo: number;
    name: string;
    startedAt: string;
    endedAt: string | null;
    status: string;
    entriesCount: number;
  }>;

  // Matching-Ergebnisse (Step 2-4)
  matchResults: Array<{
    lineId: string;
    matchStatus: string;
    priceCheckStatus: string;
    orderAssignmentReason: string;
    details: string;
  }>;

  // User-Aktionen
  userActions: Array<{
    timestamp: string;
    action: string;
    lineId?: string;
    oldValue?: unknown;
    newValue?: unknown;
  }>;

  // Zusammenfassung
  summary: {
    totalLines: number;
    expandedLines: number;
    fullMatchCount: number;
    noMatchCount: number;
    warningCount: number;
    errorCount: number;
  };
}
```

**Acceptance Criteria (AC-RUNLOG):**

- [ ] **AC-RUNLOG-01**: Waehrend ein Run aktiv ist, werden alle Log-Eintraege (Parser, Warnings, Errors, Steps) im Store/localStorage unter `falmec-run-log-{runId}` gesammelt.
- [ ] **AC-RUNLOG-02**: Das Run-Log enthaelt den vollstaendigen Rohtext jeder PDF-Seite (`rawPages`).
- [ ] **AC-RUNLOG-03**: Das Run-Log enthaelt fuer jedes geparste Header-Feld das verwendete Pattern und den gematchten Wert.
- [ ] **AC-RUNLOG-04**: Das Run-Log enthaelt fuer jede Rechnungsposition die Rohzeile und das Parse-Ergebnis (`lineParsing`).
- [ ] **AC-RUNLOG-05**: Bei Run-Abschluss (Step 5 fertig ODER manueller Abbruch) wird das Log als `run-log.json` in den Archiv-Ordner `/.Archiv/Fattura-{Nr}_{Datum}/` geschrieben.
- [ ] **AC-RUNLOG-06**: Direkt nach erfolgreichem Schreiben der `run-log.json` wird `localStorage.removeItem('falmec-run-log-{runId}')` aufgerufen.
- [ ] **AC-RUNLOG-07**: Wenn das Schreiben auf die Festplatte fehlschlaegt, bleibt der localStorage-Eintrag erhalten und der User erhaelt eine Warnung mit Retry-Moeglichkeit.
- [ ] **AC-RUNLOG-08**: Das Run-Log im RunDetail-View (Log-Tab oder Button) zeigt waehrend eines aktiven Runs die Live-Daten aus dem Store.
- [ ] **AC-RUNLOG-09**: Fuer abgeschlossene Runs wird das Run-Log aus der Festplatte geladen (nicht aus localStorage, da dort geloescht).
- [ ] **AC-RUNLOG-10**: Das JSON-Schema der `run-log.json` entspricht dem in 4.1.4 definierten `RunLogFile`-Interface.

---

### 4.2 DAS "HOME-LOGFILE" -- Globales System-Log

#### 4.2.1 Zweck

Das Home-Logfile ist ein permanent mitlaufendes, applikationsweites Protokoll. Es dokumentiert **nicht** die tiefen Parser-Details (dafuer ist das Run-Log zustaendig), sondern System-Events auf hoher Ebene.

#### 4.2.2 Tracking-Tiefe

| Event-Typ | Beschreibung | Beispiel |
|---|---|---|
| **App-Start** | App wurde geoeffnet / Seite geladen | `"App gestartet (v1.2.3)"` |
| **Navigation** | Seitenwechsel | `"Navigation: /new-run"` |
| **Run-Lifecycle** | Run erstellt / abgeschlossen / abgebrochen / geloescht | `"Run Fattura-12345 erstellt"` |
| **Step-Wechsel** | Ein Workflow-Step wurde gestartet/beendet | `"Step 2 (Artikel extrahieren) gestartet"` |
| **Datei-Upload** | Datei hochgeladen (Name, Typ, Groesse) | `"PDF hochgeladen: Fattura-12345.pdf (2.3MB)"` |
| **Export** | Export-Datei erzeugt | `"XML-Export erstellt: Fattura-12345.xml"` |
| **Archivierung** | Archiv-Ordner erstellt / Dateien geschrieben | `"Archiv geschrieben: /.Archiv/Fattura-12345_2026-02-17/"` |
| **Filesystem** | Ordner ausgewaehlt / Permission erteilt/verweigert | `"Datenverzeichnis gewaehlt: C:/Falmec/Data"` |
| **Fehler** | Globale Fehler (nicht parser-spezifisch) | `"Fehler: localStorage quota exceeded"` |
| **Config-Aenderung** | Globale Einstellungen geaendert | `"Toleranz geaendert: 0.01 → 0.05"` |
| **User-Klicks** | Relevante UI-Aktionen (Button-Klicks) | `"Button: Logfile anzeigen"` |

#### 4.2.3 Home-Log Entry Schema

```typescript
interface HomeLogEntry {
  id: string;                // UUID
  timestamp: string;         // ISO 8601
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: HomeLogCategory;
  message: string;
  details?: string;          // Optionale Zusatzinfo
}

type HomeLogCategory =
  | 'app'          // App-Start, Navigation
  | 'run'          // Run-Lifecycle
  | 'step'         // Step-Wechsel
  | 'file'         // Upload, Export
  | 'archive'      // Archivierung
  | 'filesystem'   // FS Access API Events
  | 'config'       // Konfigurationsaenderungen
  | 'error'        // Globale Fehler
  | 'user';        // User-Aktionen/Klicks
```

#### 4.2.4 Datei-Ablage: Rollierende Tages-Dateien

```
Verhalten:
  - Pro Tag wird eine Logdatei erzeugt
  - Dateiname: `system-{YYYY-MM-DD}.log.json`
  - Ablageort: `/.logs/system-{YYYY-MM-DD}.log.json`
  - Format: JSON-Array von HomeLogEntry-Objekten
  - Maximale Anzahl: 30 Dateien
  - Bei > 30 Dateien: aelteste Datei wird automatisch geloescht

Hybrid-Verhalten:
  - Waehrend die App laeuft: Logs im Store/localStorage (`falmec-system-log`)
  - Beim Tageswechsel (erster Log-Eintrag des neuen Tages):
    1. Gestrige Logs als Datei in `/.logs/` schreiben
    2. localStorage-Eintraege des Vortages loeschen
  - Beim App-Start: Pruefen ob ungeschriebene Logs vom Vortag existieren,
    falls ja → nachholen
  - Beim App-Beenden (beforeunload): Versuch die aktuellen Logs zu flushen
    (Best-Effort, da beforeunload keine async Ops garantiert)
```

#### 4.2.5 UI-Anbindung

Der bestehende "Logfile"-Button im globalen Footer (`AppFooter.tsx`) greift auf dieses System-Log zu:

- **Klick-Verhalten (aktuell)**: Oeffnet System-Log in neuem Tab (`logService.viewLogWithSnapshot()`)
- **Klick-Verhalten (NEU)**: Zeigt die aktuelle Tages-Logdatei an. Bietet zusaetzlich einen Link/Button "Aeltere Logs" der die Dateien in `/.logs/` auflistet.

**Acceptance Criteria (AC-HOMELOG):**

- [ ] **AC-HOMELOG-01**: Das Home-Log laeuft permanent mit und erfasst alle in 4.2.2 definierten Event-Typen.
- [ ] **AC-HOMELOG-02**: Jeder Log-Eintrag hat eine `category` gemaess dem `HomeLogCategory`-Typ.
- [ ] **AC-HOMELOG-03**: Taeglich wird eine Logdatei `system-{YYYY-MM-DD}.log.json` in den Ordner `/.logs/` geschrieben.
- [ ] **AC-HOMELOG-04**: Nach erfolgreichem Schreiben der Tages-Logdatei werden die zugehoerigen localStorage-Eintraege geloescht.
- [ ] **AC-HOMELOG-05**: Maximal 30 Logdateien werden im `/.logs/`-Ordner vorgehalten. Aeltere werden automatisch geloescht.
- [ ] **AC-HOMELOG-06**: Beim App-Start wird geprueft, ob ungeschriebene Logs vom Vortag existieren und ggf. nachgeholt.
- [ ] **AC-HOMELOG-07**: Der "Logfile"-Button im Footer zeigt das aktuelle Tages-Log an.
- [ ] **AC-HOMELOG-08**: Ein zusaetzlicher "Aeltere Logs"-Zugang listet die vorhandenen Logdateien im `/.logs/`-Ordner auf.

---

### 4.3 DAS ARCHIVIERUNGS-PAKET -- Run-Abschluss

#### 4.3.1 Zweck

Beim Abschluss eines Runs wird ein vollstaendiges, selbst-enthaltendes Archiv-Paket als physischer Ordner auf der Festplatte erzeugt. Dieses Paket enthaelt alle Daten die noetig sind, um den Run spaeter nachzuvollziehen oder Daten wiederherzustellen.

#### 4.3.2 Ordner-Namenskonvention

```
/.Archiv/Fattura-{Rechnungsnummer}_{YYYY-MM-DD}/
```

Beispiel: `/.Archiv/Fattura-12345_2026-02-17/`

> **Hinweis**: Die Fattura-Nummer + Datum bilden auch die Run-ID. Der Ordnername IST die Run-Identifikation.

Bei Duplikaten (gleiche Fattura am gleichen Tag): Suffix `_v2`, `_v3` etc.
Beispiel: `/.Archiv/Fattura-12345_2026-02-17_v2/`

#### 4.3.3 Inhalt des Archiv-Pakets

| # | Datei | Beschreibung | Herkunft | Typ |
|---|---|---|---|---|
| 1 | `run-log.json` | Vollstaendiges Run-Log (s. 4.1) | logService → Festplatte | Physische Kopie |
| 2 | `export.xml` | Exportierte XML-Datei fuer Sage100-Import | ExportPanel | Physische Kopie |
| 3 | `export.csv` | Exportierte CSV-Datei (Semikolon-getrennt) | ExportPanel | Physische Kopie |
| 4 | `invoice-lines.json` | JSON-Auszug aller fertigen InvoiceLines | runStore | Physische Kopie |
| 5 | `{original-filename}.pdf` | Hochgeladene Rechnungs-PDF | IndexedDB/Upload | Physische Kopie |
| 6 | `{original-filename}-warenbegleit.*` | Hochgeladener Warenbegleitschein (Serialliste) | IndexedDB/Upload | Physische Kopie |
| 7 | `metadata.json` | Run-Metadaten (Config, Stats, Timestamps) | runStore | Metadaten-Only |

> **Bewusste Entscheidung**: Artikelstammdaten und Offene-Bestellungen/Offene-Wareneingaenge werden **nicht** als Dateien kopiert, sondern nur als Metadaten referenziert (Dateiname + Groesse + Hash). Grund: Diese Dateien koennen im Notfall ueber das ERP (Sage) nachvollzogen werden und wuerden unnoetig Speicherplatz verbrauchen.

#### 4.3.4 metadata.json Schema

```typescript
interface ArchiveMetadata {
  version: 1;
  runId: string;
  fattura: string;
  invoiceDate: string;
  createdAt: string;
  archivedAt: string;
  status: 'completed' | 'aborted' | 'failed';

  config: {
    eingangsart: string;
    tolerance: number;
    currency: string;
    preisbasis: string;
  };

  stats: {
    parsedPositions: number;
    expandedLines: number;
    fullMatchCount: number;
    noMatchCount: number;
    exportedLines: number;
  };

  files: {
    // Physisch kopierte Dateien
    invoice: { name: string; size: number; hash: string };
    warenbegleitschein: { name: string; size: number; hash: string } | null;
    exportXml: { name: string; size: number } | null;
    exportCsv: { name: string; size: number } | null;

    // Nur als Referenz (nicht kopiert)
    artikelstamm: { name: string; size: number; hash: string } | null;
    offeneBestellungen: { name: string; size: number; hash: string } | null;
  };
}
```

#### 4.3.5 Archivierungs-Workflow

```
TRIGGER: User klickt "Archivieren" im ExportPanel
  ODER: Automatisch nach erfolgreichem Export (Step 5)

ABLAUF:
  1. Ordner erstellen: /.Archiv/Fattura-{Nr}_{Datum}/
  2. run-log.json schreiben (aus 4.1)
  3. export.xml schreiben (falls vorhanden)
  4. export.csv schreiben (falls vorhanden)
  5. invoice-lines.json schreiben (InvoiceLines als JSON)
  6. Original-PDF aus IndexedDB lesen und als Datei schreiben
  7. Warenbegleitschein aus IndexedDB lesen und als Datei schreiben (falls vorhanden)
  8. metadata.json schreiben (Zusammenfassung + Datei-Referenzen)
  9. CLEANUP: Alle zugehoerigen localStorage/IndexedDB-Eintraege loeschen:
     - `falmec-run-log-{runId}`
     - `falmec-archive-file-{fileId}` (alle zum Run gehoerigen)
     - IndexedDB: Hochgeladene Dateien fuer diesen Run
  10. Erfolgs-Meldung an User + Home-Log-Eintrag

FEHLERBEHANDLUNG:
  - Bei Fehler in Schritt 1-8: Abbruch, Warnung, kein Cleanup
  - Bei Fehler in Schritt 9 (Cleanup): Warnung, aber Archiv gilt als geschrieben
  - Teilweises Schreiben: Bereits geschriebene Dateien bleiben, fehlende werden geloggt
```

**Acceptance Criteria (AC-ARCHIVE):**

- [ ] **AC-ARCHIVE-01**: Beim Run-Abschluss wird ein Ordner `/.Archiv/Fattura-{Nr}_{Datum}/` im Datenverzeichnis erstellt.
- [ ] **AC-ARCHIVE-02**: Der Ordner enthaelt mindestens: `run-log.json`, `invoice-lines.json`, `metadata.json` und die Original-PDF.
- [ ] **AC-ARCHIVE-03**: Export-Dateien (`export.xml`, `export.csv`) werden nur geschrieben wenn sie erzeugt wurden.
- [ ] **AC-ARCHIVE-04**: Der Warenbegleitschein wird als physische Datei kopiert, falls hochgeladen.
- [ ] **AC-ARCHIVE-05**: Artikelstamm und Offene-Bestellungen werden **nicht** als Dateien kopiert, sondern nur in `metadata.json` als Referenz (Name, Groesse, Hash) gespeichert.
- [ ] **AC-ARCHIVE-06**: Nach erfolgreichem Schreiben aller Dateien werden die zugehoerigen localStorage- und IndexedDB-Eintraege geloescht.
- [ ] **AC-ARCHIVE-07**: Bei Duplikaten (gleiche Fattura, gleicher Tag) wird ein Suffix `_v2`, `_v3` etc. angehaengt.
- [ ] **AC-ARCHIVE-08**: Bei Fehler beim Dateischreiben bleiben die Browser-Daten erhalten und der User erhaelt eine Fehlermeldung mit Retry-Option.
- [ ] **AC-ARCHIVE-09**: Die `metadata.json` enthaelt das vollstaendige Schema gemaess 4.3.4.
- [ ] **AC-ARCHIVE-10**: Ein Eintrag im Home-Log dokumentiert die erfolgreiche/fehlgeschlagene Archivierung.

---

### 4.4 FILE SYSTEM ACCESS API -- Fallback-Strategie

#### 4.4.1 Primaerer Modus: File System Access API

Wenn der Browser die File System Access API unterstuetzt (Chrome, Edge) und der User die Berechtigung erteilt hat:
- Alle Dateien werden direkt ins Datenverzeichnis geschrieben
- Cleanup-Regeln greifen sofort

#### 4.4.2 Fallback-Modus: Download

Wenn die File System Access API **nicht** verfuegbar ist (Firefox, Safari) oder der User die Berechtigung **verweigert**:

```
VERHALTEN:
  - Archiv-Paket wird als ZIP-Download angeboten
    (alle Dateien aus 4.3.3 gebuendelt)
  - Home-Logfile wird als einzelne JSON-Datei zum Download angeboten
  - Run-Logfile wird als einzelne JSON-Datei zum Download angeboten

  - Logs bleiben im localStorage bis Download erfolgt
  - Cleanup-Dialog: "Sie haben X MB an Logs/Archiven im Browser.
    Bitte laden Sie die Dateien herunter, um Speicherplatz freizugeben."
  - Manueller Cleanup-Button: "Logs loeschen (nach Download)"
```

#### 4.4.3 API-Verfuegbarkeits-Check

```typescript
// Pruefung bei App-Start
const fsApiAvailable = 'showDirectoryPicker' in window;
const hasPermission = await fileSystemService.checkPermission();

// Zustand im Store
interface FileSystemState {
  mode: 'filesystem' | 'download' | 'unavailable';
  directoryHandle: FileSystemDirectoryHandle | null;
  dataPath: string | null;
  lastPermissionCheck: string; // ISO timestamp
}
```

**Acceptance Criteria (AC-FALLBACK):**

- [ ] **AC-FALLBACK-01**: Wenn die File System Access API nicht verfuegbar ist, werden Archiv-Pakete als ZIP-Download angeboten.
- [ ] **AC-FALLBACK-02**: Im Fallback-Modus bleiben Logs im localStorage und ein Cleanup-Dialog informiert den User ueber den Speicherverbrauch.
- [ ] **AC-FALLBACK-03**: Ein manueller Cleanup-Button ermoeglicht das Loeschen von Logs nach erfolgtem Download.
- [ ] **AC-FALLBACK-04**: Beim App-Start wird der Verfuegbarkeits-Modus (`filesystem` / `download` / `unavailable`) ermittelt und im Store gespeichert.

---

### 4.5 localStorage-Cleanup-Regeln (Zusammenfassung)

Zentrale Regel: **localStorage ist ein temporaerer Puffer, nicht ein permanenter Speicher.**

| localStorage-Key | Wann wird geloescht? | Wo wird stattdessen gespeichert? |
|---|---|---|
| `falmec-run-log-{runId}` | Nach Schreiben von `run-log.json` in Archiv-Ordner | `/.Archiv/Fattura-.../run-log.json` |
| `falmec-system-log` | Nach Schreiben der Tages-Logdatei (Tageswechsel) | `/.logs/system-{YYYY-MM-DD}.log.json` |
| `falmec-log-snapshots` | Entfaellt komplett (Snapshots werden durch Datei-Logs ersetzt) | -- |
| `falmec-archive-runs` | Nach Schreiben von `metadata.json` in Archiv-Ordner | `/.Archiv/.../metadata.json` |
| `falmec-archive-file-{id}` | Nach Schreiben der physischen Datei ins Archiv | Physische Datei im Archiv-Ordner |
| `falmec-parsed-invoice` | Nach Abschluss des Runs (Daten sind in InvoiceLines) | `invoice-lines.json` im Archiv |
| `falmec-uploaded-files` | Nach Archivierung (Dateien in IndexedDB + Archiv) | Archiv-Ordner |
| `falmec-data-path` | Bleibt (kleine String-Referenz, kein Bloat) | -- |
| `falmec-directory-handle` | Bleibt (Handle-Referenz) | -- |

**Acceptance Criteria (AC-CLEANUP):**

- [ ] **AC-CLEANUP-01**: Nach erfolgreichem Schreiben einer Datei auf die Festplatte wird der zugehoerige localStorage-Eintrag **sofort** geloescht.
- [ ] **AC-CLEANUP-02**: Die Keys `falmec-data-path` und `falmec-directory-handle` sind von der Cleanup-Regel ausgenommen.
- [ ] **AC-CLEANUP-03**: `falmec-log-snapshots` wird komplett entfernt (Feature entfaellt zugunsten von Datei-Logs).
- [ ] **AC-CLEANUP-04**: Nach einem vollstaendigen Archivierungs-Durchlauf belegt der Run **null Bytes** im localStorage (ausser den beiden Ausnahmen aus AC-CLEANUP-02).

---

## 5. Betroffene bestehende Services

### 5.1 logService.ts -- Erweiterung

**Bestehende Methoden (behalten):**
- `log()`, `info()`, `warn()`, `error()`, `debug()` -- weiterhin die Haupt-API
- `getRunLog(runId)` -- liest aus localStorage (fuer aktive Runs) ODER aus Festplatte (fuer abgeschlossene)
- `getSystemLog()` -- liest aktuelles Tages-Log
- `formatLogsAsText()` -- fuer UI-Anzeige

**Neue Methoden:**
- `flushRunLog(runId, archivePath)` -- Schreibt Run-Log als JSON auf Festplatte, loescht localStorage
- `flushDailyLog(date)` -- Schreibt Tages-Log in `/.logs/`, loescht localStorage
- `rotateLogs()` -- Prueft Anzahl der Logdateien in `/.logs/`, loescht aelteste bei > 30
- `addRunLogDetail(runId, category, data)` -- Fuegt tiefe Parser-Details zum Run-Log hinzu (neu: Roh-Texte, Patterns)

**Entfallende Methoden:**
- `createLogSnapshot()` -- ersetzt durch Datei-Logs
- `viewLogWithSnapshot()` -- wird zu `viewCurrentDayLog()`

### 5.2 archiveService.ts -- Erweiterung

**Bestehende Methoden (refactored):**
- `createArchiveEntry()` -- erstellt jetzt Ordner auf Festplatte statt localStorage-Eintrag
- `getArchivedRun()` -- liest jetzt aus `metadata.json` auf Festplatte

**Neue Methoden:**
- `writeArchivePackage(run, invoiceLines)` -- Orchestriert den gesamten Archivierungs-Workflow (4.3.5)
- `cleanupBrowserData(runId)` -- Loescht alle localStorage/IndexedDB-Daten fuer einen Run
- `readArchiveFromDisk(folderName)` -- Liest Archiv-Metadaten von Festplatte

### 5.3 fileSystemService.ts -- Erweiterung

**Bestehende Methoden (behalten):**
- `selectDirectory()`, `createFolderStructure()`, `saveToArchive()`, `saveLogFile()`, `saveToBin()`

**Neue Methoden:**
- `listArchiveFolders()` -- Listet alle Ordner in `/.Archiv/`
- `listLogFiles()` -- Listet alle Dateien in `/.logs/`
- `readFileFromArchive(folderName, fileName)` -- Liest eine Datei aus einem Archiv-Ordner
- `deleteOldLogFiles(maxCount)` -- Loescht aelteste Logdateien ueber dem Limit
- `writeFileToDisk(handle, fileName, content)` -- Generische Schreib-Methode mit Fehlerbehandlung
- `checkPermission()` -- Prueft ob Directory-Handle noch gueltig ist

---

## 6. Edge Cases und Fehlerbehandlung

### 6.1 File System Access API

| Edge Case | Erwartetes Verhalten |
|---|---|
| User verweigert Berechtigung | Fallback-Modus (Download). Warnung in Footer. |
| Berechtigung verloren (Page Reload) | Bei naechster Schreib-Operation: Permission-Prompt erneut anzeigen. |
| Festplatte voll | Fehler loggen, localStorage-Daten behalten, User informieren. |
| Archiv-Ordner existiert bereits (Duplikat) | Suffix `_v2`, `_v3` etc. anhaengen. |
| Datei gesperrt (anderer Prozess) | Retry nach 2 Sekunden, max 3 Versuche. Dann Fehler + localStorage behalten. |
| Browser-Tab geschlossen waehrend Archivierung | Teilweise geschriebene Dateien bleiben. Beim naechsten Start: Integritaets-Check. |

### 6.2 localStorage

| Edge Case | Erwartetes Verhalten |
|---|---|
| localStorage quota exceeded waehrend Run | Aelteste System-Logs loeschen (FIFO), Run-Log hat Prioritaet. Warnung an User. |
| Korrupte JSON-Daten in localStorage | Fehlerhafte Eintraege loggen und entfernen. Nicht den gesamten Key loeschen. |
| Mehrere Tabs offen | Nur ein Tab schreibt Logs (Leader-Election via localStorage-Lock). |

### 6.3 Archivierung

| Edge Case | Erwartetes Verhalten |
|---|---|
| Run ohne Export (abgebrochen vor Step 5) | Archiv-Paket enthaelt nur `run-log.json`, `metadata.json` (status: 'aborted'), ggf. PDF. Kein `export.xml/csv`. |
| PDF nicht in IndexedDB (z.B. geloescht) | `metadata.json` notiert `invoice: null`. Warnung an User. |
| Warenbegleitschein nicht hochgeladen | `warenbegleitschein: null` in metadata. Kein Fehler. |
| Sehr grosse PDF (> 50MB) | Fortschritts-Anzeige waehrend des Kopierens. Timeout bei 60 Sekunden. |

### 6.4 Log-Rotation

| Edge Case | Erwartetes Verhalten |
|---|---|
| App war 7 Tage nicht offen | Beim Start: Alle ungeschriebenen Logs in eine Sammel-Datei schreiben. |
| Keine Logs an einem Tag | Keine leere Datei erzeugen. |
| Log-Datei > 10MB | Warnung loggen. Kein Split (ein Tag = eine Datei). |

---

## 7. Offene Klaerungspunkte

| # | Frage | Kontext |
|---|---|---|
| 1 | ~~Soll das Run-Log im RunDetail als eigener Tab angezeigt werden?~~ | **GEKLAERT:** Beides -- eigener Tab im RunDetail UND Button im Dashboard. |
| 2 | Soll der Archivierungs-Button automatisch nach Export erscheinen oder immer sichtbar sein? | Workflow-Frage: Archivierung als expliziter Schritt oder automatisch. |
| 3 | Wie wird mit Runs umgegangen, die VOR dem PROJ-12 Upgrade erstellt wurden (kein Archiv-Ordner)? | Migration bestehender Daten. |
| 4 | Soll ein "Archiv oeffnen"-Button den Windows-Explorer am Archiv-Ordner oeffnen? | Convenience-Feature, technisch moeglich via `window.showDirectoryPicker()`. |
| 5 | ~~Braucht der Fallback-Modus ein eigenes npm-Paket?~~ | **GEKLAERT:** Ja, `jszip` (~26KB gzip). |

---

## 8. Abhaengigkeiten

| Von Feature | Abhaengigkeit | Art |
|---|---|---|
| PROJ-8 (Logging, Archiving, Snapshots) | PROJ-12 baut auf PROJ-8 auf und erweitert dessen Services | Erweiterung |
| PROJ-9 (Local Persistence & Filesystem) | PROJ-12 nutzt die bestehende File System Access API Integration | Erweiterung |
| PROJ-4 (Invoice PDF Parsing Engine) | Parser muss Log-Hooks bereitstellen (Roh-Texte, Pattern-Matches) | Erweiterung |
| PROJ-7 (Export Generation) | Export-Dateien muessen fuer Archivierung abgefangen werden | Integration |
| PROJ-11 (Data-Matching-Update) | Matching-Ergebnisse (matchStatus, priceCheckStatus, orderAssignment) muessen ins Run-Log | Integration |

---

## 9. Umsetzungsvorschlag (Implementation Outline)

### Phase A: Run-Log Tiefe + Schema
1. `RunLogFile`-Interface in `src/types/` definieren
2. `logService.ts` erweitern: `addRunLogDetail()` fuer Roh-Texte und Pattern-Matches
3. Parser-Hooks: In `FatturaParserV3` Log-Callbacks einbauen (rawPages, headerParsing, lineParsing)
4. `logService.flushRunLog()` implementieren: JSON-Serialisierung + `fileSystemService.saveToArchive()`

### Phase B: Home-Log Rotation
5. `HomeLogEntry`-Interface + `HomeLogCategory`-Typ definieren
6. `logService.flushDailyLog()` implementieren
7. `logService.rotateLogs()` implementieren (max 30 Dateien)
8. App-Start Hook: Pruefen auf ungeschriebene Vortags-Logs
9. Tageswechsel-Detektion (Vergleich letzter Log-Timestamp mit aktuellem Datum)

### Phase C: Archivierungs-Paket
10. `archiveService.writeArchivePackage()` implementieren (Orchestrierung)
11. `metadata.json` Schema + Serialisierung
12. `invoice-lines.json` Export-Funktion
13. PDF/Warenbegleitschein aus IndexedDB lesen und als Datei schreiben
14. Export-Dateien (XML/CSV) in Archiv-Ordner schreiben

### Phase D: Cleanup + Fallback
15. `archiveService.cleanupBrowserData()` implementieren
16. localStorage-Cleanup nach jedem erfolgreichen Schreiben integrieren
17. Fallback-Modus: ZIP-Download bei fehlender FS API
18. UI: Cleanup-Dialog + Speicherverbrauchs-Anzeige

### Phase E: UI-Integration + Footer
19. Footer "Logfile"-Button auf neues Tages-Log umstellen
20. "Aeltere Logs"-Ansicht (Dateiliste aus `/.logs/`)
21. RunDetail: Log-Tab oder Log-Button fuer Run-spezifisches Log
22. Dashboard: Archiv-Ordner-Status-Anzeige

### Phase F: QA + Edge Cases
23. Unit Tests: `flushRunLog()`, `flushDailyLog()`, `rotateLogs()`
24. Unit Tests: `writeArchivePackage()` mit Mock-FileSystem
25. Integration Tests: Vollstaendiger Archivierungs-Workflow
26. Manueller Test: Fallback-Modus in Firefox

---

## 10. Tech Design (Solution Architect)

Dieses Kapitel beschreibt die Architektur-Entscheidungen und den Bauplan fuer PROJ-12. Es richtet sich an Entwickler und adressiert drei kritische Fokus-Bereiche: die runId-Durchreichung, die fileSystemService-Integration und die Cache-Invalidation.

### 10.1 Architektur-Ueberblick: Datenfluesse

**IST-Zustand (vor PROJ-12):**

```
User Action  →  runStore  →  Parser  →  logService  →  localStorage (SACKGASSE)
                   ↓                        ↓
              archiveService  ←─────  localStorage (SACKGASSE)
                   ↓
              localStorage (SACKGASSE)
```

Alles endet im localStorage. Nichts wird auf die Festplatte geschrieben. Die drei Services (logService, archiveService, fileSystemService) arbeiten isoliert.

**SOLL-Zustand (nach PROJ-12):**

```
User Action  →  runStore  →  Parser(runId!)  →  logService  →  localStorage (PUFFER)
                   ↓                                ↓                  |
              archiveService ──→ fileSystemService ──→ Festplatte     |
                                      ↓                               |
                                 Cleanup ←────────────────────────────┘
                                 (localStorage loeschen)
```

Drei Kernprinzipien:
1. **runId fliess durch**: Vom Store bis tief in den Parser -- eine einzige, durchgaengige ID
2. **fileSystemService als einziger Ausgang**: Alles was persistent wird, laeuft ueber diesen Service
3. **Cleanup ist kein Nachgedanke**: Jede Schreib-Operation auf die Festplatte loest sofort einen localStorage-Cleanup aus

---

### 10.2 FOKUS 1: runId-Durchreichung (das gebrochene Glied reparieren)

#### 10.2.1 Problem-Analyse

Die Log-Kette bricht an einer einzigen Stelle:

```
runStore.parseInvoice(runId)
  → invoiceParserService.parseInvoicePDF(file, runId)     ← runId kommt hier an
    → parser.parseInvoice(pdfFile)                         ← runId wird NICHT weitergegeben
      → FatturaParserService generiert EIGENE ID: run_${Date.now()}
```

**Datei:** `src/services/invoiceParserService.ts` Zeile 43
**Problem:** `parser.parseInvoice(pdfFile)` -- der Aufruf hat keinen `runId`-Parameter

**Datei:** `src/services/parsers/FatturaParserService.ts` Zeile 74-75
**Problem:** `parseInvoice(pdfFile: File)` -- die Methode akzeptiert keine `runId`

#### 10.2.2 Loesung: runId als Parameter durch die gesamte Kette

**Schritt-fuer-Schritt Aenderungen:**

| # | Datei | Aenderung | Beschreibung |
|---|---|---|---|
| 1 | `src/services/parsers/types.ts` | Interface `InvoiceParser` anpassen | Methode `parseInvoice` erhaelt optionalen `runId`-Parameter |
| 2 | `src/services/parsers/FatturaParserService.ts` | `parseInvoice(pdfFile, runId?)` | Akzeptiert runId von aussen, generiert eigene nur als Fallback |
| 3 | `src/services/invoiceParserService.ts` | `parseInvoicePDF()` reicht runId weiter | Zeile 43: `parser.parseInvoice(pdfFile, runId)` |
| 4 | Alle privaten Parser-Methoden | runId-Parameter entfernen (kommt jetzt von oben) | `parseHeaderFromItems`, `parsePositionsBoundingBox`, etc. |

**Ergebnis:** Eine einzige runId fliesst von `runStore.createNewRunWithParsing()` bis zur letzten Log-Zeile im Parser.

---

### 10.3 FOKUS 2: fileSystemService-Integration (wo wird geschrieben?)

#### 10.3.1 Bestehende Infrastruktur (was bereits funktioniert)

`fileSystemService.ts` hat bereits alles was wir brauchen:

| Methode | Status | Wird aufgerufen? |
|---|---|---|
| `selectDirectory()` | Funktioniert | Ja (Footer-Button) |
| `createFolderStructure()` | Funktioniert | Ja (bei Ordnerwahl) |
| `saveToArchive(subfolder, file, content)` | Funktioniert | **NEIN** -- nie aufgerufen! |
| `saveLogFile(fileName, content)` | Funktioniert | **NEIN** -- nie aufgerufen! |
| `saveToBin(fileName, content)` | Funktioniert | Ja (nur bei Delete) |

**Kernproblem:** Die Schreib-Methoden existieren, werden aber im Workflow nirgendwo aufgerufen.

#### 10.3.2 Integrationspunkte: Wo muss fileSystemService aufgerufen werden?

**A) Run-Log auf Festplatte schreiben**

| Wann? | Wo im Code? | Was wird aufgerufen? |
|---|---|---|
| Run-Abschluss (Step 5 fertig) | `runStore.ts` → nach `updateRunStatus('completed')` | `logService.flushRunLog(runId)` → `fileSystemService.saveToArchive(folderName, 'run-log.json', content)` |
| Run-Abbruch (User bricht ab) | `runStore.ts` → `abortRun()` (NEU) | Gleicher Pfad wie oben, aber mit `status: 'aborted'` |

**B) Home-Log auf Festplatte schreiben**

| Wann? | Wo im Code? | Was wird aufgerufen? |
|---|---|---|
| Tageswechsel (erster Log des neuen Tages) | `logService.ts` → innerhalb von `log()` | `logService.flushDailyLog(gesternDatum)` → `fileSystemService.saveLogFile('system-YYYY-MM-DD.log.json', content)` |
| App-Start (Nachhol-Check) | `App.tsx` oder `main.tsx` → `useEffect` beim Mount | `logService.flushPendingLogs()` → prueft ob Vortags-Logs ungeschrieben sind |

**C) Archiv-Paket auf Festplatte schreiben**

| Wann? | Wo im Code? | Was wird aufgerufen? |
|---|---|---|
| Nach Export / Archivierung | `runStore.ts` → nach Export-Schritt ODER expliziter "Archivieren"-Button | `archiveService.writeArchivePackage(run, lines)` → ruft `fileSystemService.saveToArchive()` mehrfach auf |

#### 10.3.3 Neue Methoden in fileSystemService.ts

| Methode | Zweck | Aufrufer |
|---|---|---|
| `listArchiveFolders()` | Alle Ordner in `/.Archiv/` auflisten (fuer Dashboard) | `archiveService.getArchivedRuns()` |
| `listLogFiles()` | Alle Dateien in `/.logs/` auflisten (fuer "Aeltere Logs") | `logService`, Footer-UI |
| `readFileFromArchive(folder, file)` | Einzelne Datei aus Archiv lesen (z.B. `run-log.json`) | `logService.getRunLog()` fuer abgeschlossene Runs |
| `deleteOldLogFiles(maxCount)` | Aelteste Logdateien loeschen (Rotation: max 30) | `logService.rotateLogs()` |
| `checkPermission()` | Prueft ob Directory-Handle noch gueltig (nach Page Reload) | App-Start, vor jeder Schreib-Operation |
| `writeBinaryFile(folder, name, blob)` | Binaer-Dateien schreiben (PDF, Warenbegleitschein) | `archiveService.writeArchivePackage()` |

---

### 10.4 FOKUS 3: Cache-Invalidation (exakte Cleanup-Momente)

#### 10.4.1 Grundregel

```
REGEL: localStorage.removeItem(key) wird NUR aufgerufen, wenn
       fileSystemService.saveToArchive() oder saveLogFile()
       den Rueckgabewert `true` (= Erfolg) liefert.

       Bei `false` (= Fehler): KEIN Cleanup. Daten bleiben erhalten.
```

#### 10.4.2 Cleanup-Tabelle: Wann wird was geloescht?

| # | Trigger-Moment | localStorage-Key der geloescht wird | Vorbedingung |
|---|---|---|---|
| 1 | `run-log.json` erfolgreich geschrieben | `falmec-run-log-{runId}` | `saveToArchive()` === true |
| 2 | Tages-Logdatei erfolgreich geschrieben | `falmec-system-log` (nur Eintraege des Vortages) | `saveLogFile()` === true |
| 3 | `metadata.json` erfolgreich geschrieben | `falmec-archive-runs` (nur dieser Run-Eintrag) | `saveToArchive()` === true |
| 4 | Physische Archiv-Dateien erfolgreich geschrieben | `falmec-archive-file-{id}` (alle zum Run) | `saveToArchive()` === true fuer jede Datei |
| 5 | Archiv-Paket komplett geschrieben | `falmec-parsed-invoice` | Schritt 1-4 alle erfolgreich |
| 6 | Archiv-Paket komplett geschrieben | IndexedDB: Upload-Dateien fuer diesen Run | Schritt 1-4 alle erfolgreich |
| 7 | Sofort bei PROJ-12 Aktivierung | `falmec-log-snapshots` | Einmalig (Feature entfaellt) |

#### 10.4.3 Cleanup-Orchestrierung in archiveService

Die Cleanup-Logik wird als eigene Methode `cleanupBrowserData(runId)` im `archiveService` gebaut. Diese Methode wird am Ende von `writeArchivePackage()` aufgerufen -- aber NUR wenn alle Dateien erfolgreich geschrieben wurden.

**Ablauf:**

```
writeArchivePackage(run, lines):
  results = []
  results.push( saveToArchive(folder, 'run-log.json', ...)     )  // Schritt 1
  results.push( saveToArchive(folder, 'invoice-lines.json', ...) )  // Schritt 2
  results.push( saveToArchive(folder, 'metadata.json', ...)      )  // Schritt 3
  results.push( saveToArchive(folder, '{pdf-name}.pdf', ...)     )  // Schritt 4
  results.push( saveToArchive(folder, '{wbs-name}.*', ...)       )  // Schritt 5 (optional)
  results.push( saveToArchive(folder, 'export.xml', ...)         )  // Schritt 6 (optional)
  results.push( saveToArchive(folder, 'export.csv', ...)         )  // Schritt 7 (optional)

  WENN alle Pflicht-Ergebnisse (1-4) === true:
    → cleanupBrowserData(runId)    // Loescht localStorage + IndexedDB
    → return { success: true, cleanedUp: true }

  SONST:
    → return { success: false, failedFiles: [...], cleanedUp: false }
    → User erhaelt Fehlermeldung mit Retry-Option
```

---

### 10.5 Komponenten-Struktur (UI-Baum)

#### 10.5.1 RunDetail -- Neuer "Log"-Tab

```
RunDetail (bestehende Seite)
+-- WorkflowStepper (bestehend)
+-- KPI-Tiles (bestehend)
+-- Tabs (bestehend)
|   +-- "Uebersicht" Tab (bestehend)
|   +-- "Positionen" Tab (bestehend)
|   +-- "Issues" Tab (bestehend)
|   +-- "Export" Tab (bestehend)
|   +-- "Log" Tab (NEU)
|       +-- Log-Header (Run-ID, Parser, Zeitstempel)
|       +-- Log-Filter (Level: INFO/WARN/ERROR, Kategorie)
|       +-- Log-Eintraege-Liste (scrollbar, neueste oben)
|       +-- Raw-Pages-Accordion (aufklappbar, Rohtext pro Seite)
|       +-- Download-Button ("Log als JSON herunterladen")
```

**Datenquelle des Log-Tabs:**
- Run ist aktiv → Daten aus Store/localStorage (Live-Ansicht)
- Run ist abgeschlossen → Daten aus `/.Archiv/.../run-log.json` (Festplatte)

#### 10.5.2 Footer -- Erweiterter Logfile-Button

```
AppFooter (bestehend)
+-- [bestehende Controls: Preisbasis, Waehrung, Toleranz, ...]
+-- Logfile-Button (ANGEPASST)
|   +-- Klick: Oeffnet aktuelles Tages-Log (wie bisher, aber aus Tages-Datei)
|   +-- "Aeltere Logs" Link
|       +-- Dialog/Popover mit Liste der Logdateien in /.logs/
|       +-- Pro Datei: Datum, Groesse, Oeffnen/Download-Button
+-- Speicher-Indikator (NEU, optional)
    +-- Balken: localStorage-Verbrauch in % (aus archiveService.getStorageInfo())
    +-- Warnung bei > 80%
```

#### 10.5.3 Dashboard -- Archiv-Status

```
Index (Dashboard)
+-- Runs-Tabelle (bestehend)
|   +-- Pro Run: Neues Icon/Badge "Archiviert" (gruener Haken wenn Ordner existiert)
|   +-- Aktionen-Spalte: "Archivieren"-Button (nur wenn noch nicht archiviert)
```

---

### 10.6 Datenmodell (Klartextbeschreibung)

#### 10.6.1 Run-Log Datei (`run-log.json`)

Jedes Run-Log ist eine einzige JSON-Datei die den gesamten Verarbeitungsvorgang dokumentiert:

- **Kopfdaten**: Run-ID, Fattura-Nummer, Zeitstempel, verwendeter Parser, Konfiguration
- **Rohtexte**: Vollstaendiger Text jeder PDF-Seite (fuer Debugging)
- **Header-Parsing**: Welche Muster welche Felder erkannt haben
- **Zeilen-Parsing**: Originalzeile und erkanntes Ergebnis pro Rechnungsposition
- **Step-Tracking**: Wann jeder Workflow-Schritt gestartet/beendet wurde
- **Matching-Ergebnisse**: Match-Status, Preis-Check, Bestellzuordnung pro Artikel
- **User-Aktionen**: Manuelle Aenderungen (Preise, Bestellungen)
- **Zusammenfassung**: Zaehler fuer Matches, Fehler, Warnungen

Gespeichert in: `/.Archiv/Fattura-{Nr}_{Datum}/run-log.json`

#### 10.6.2 Home-Log Datei (`system-YYYY-MM-DD.log.json`)

Ein JSON-Array von Eintraegen, jeder mit:

- **ID**: Eindeutige Kennung
- **Zeitstempel**: Sekundengenau
- **Level**: INFO, WARN, ERROR oder DEBUG
- **Kategorie**: app, run, step, file, archive, filesystem, config, error, user
- **Nachricht**: Menschenlesbarer Text
- **Details**: Optionale Zusatzinformationen

Gespeichert in: `/.logs/system-YYYY-MM-DD.log.json` (max 30 Dateien)

#### 10.6.3 Archiv-Metadaten (`metadata.json`)

Eine JSON-Datei pro Archiv-Ordner mit:

- **Run-Identifikation**: Run-ID, Fattura, Rechnungsdatum
- **Zeitstempel**: Erstellung und Archivierung
- **Status**: completed, aborted oder failed
- **Konfiguration**: Eingangsart, Toleranz, Waehrung, Preisbasis
- **Statistiken**: Positionszahlen, Match-Ergebnisse, Export-Zaehler
- **Datei-Referenzen**: Name, Groesse und Hash jeder Datei im Paket (physisch kopierte UND nur referenzierte)

Gespeichert in: `/.Archiv/Fattura-{Nr}_{Datum}/metadata.json`

---

### 10.7 Tech-Entscheidungen (mit Begruendung)

| Entscheidung | Gewaehlt | Begruendung |
|---|---|---|
| **Festplatten-Zugriff** | File System Access API (Chrome/Edge) mit Download-Fallback | Einzige Web-API die echtes Dateisystem-Schreiben erlaubt. Fallback deckt Firefox/Safari ab. |
| **Log-Format** | JSON (nicht Text) | Maschinenlesbar, spaeter auswertbar, besser filterbar als Freitext. |
| **Archiv-Struktur** | Ein Ordner pro Run (flach, nicht verschachtelt) | Einfach zu navigieren im Explorer. Jeder Ordner ist selbst-enthaltend. |
| **Cleanup-Strategie** | Sofort nach erfolgreichem Schreiben | Verhindert Duplikate und localStorage-Bloat. Rollback bei Fehler moeglich. |
| **Log-Rotation** | Taeglich, max 30 Dateien | 30 Tage Rueckblick reicht fuer normalen Betrieb. Aeltere Logs sind im Archiv. |
| **runId-Durchreichung** | Parameter statt lokale Generierung | Garantiert eine einzige, konsistente ID pro Run ueber alle Services hinweg. |
| **Snapshot-Feature** | Wird entfernt | Snapshots in localStorage waren ein Workaround. Echte Dateien machen sie ueberfluessig. |
| **ZIP fuer Fallback** | jszip (npm-Paket) | Leichtgewichtig (~26KB gzip), gut getestet, kein Backend noetig. |
| **Binaer-Dateien (PDF)** | Blob-basiertes Schreiben ueber createWritable() | File System Access API unterstuetzt Blobs nativ. Kein Base64-Umweg noetig. |

---

### 10.8 Abhaengigkeiten (neue Pakete)

| Paket | Zweck | Groesse |
|---|---|---|
| `jszip` | ZIP-Erstellung fuer Fallback-Modus (Download statt Dateisystem) | ~26KB gzip |

Keine weiteren neuen Pakete noetig. Alle bestehenden Bibliotheken (pdfjs-dist, lucide-react, zustand, shadcn-ui) werden weiterverwendet.

---

### 10.9 Implementierungs-Checkliste (Schritt-fuer-Schritt Bauplan)

#### Phase 1: runId-Fix + Parser-Hooks (Fundament)

| # | Aufgabe | Datei(en) | Aenderungstyp | Abhaengigkeit |
|---|---|---|---|---|
| 1.1 | `InvoiceParser`-Interface: `parseInvoice` erhaelt `runId?` Parameter | `src/services/parsers/types.ts` | Anpassung | -- |
| 1.2 | `FatturaParserService.parseInvoice()`: akzeptiert `runId` von aussen, entfernt eigene ID-Generierung (Zeile 75) | `src/services/parsers/FatturaParserService.ts` | Anpassung | 1.1 |
| 1.3 | `invoiceParserService.parseInvoicePDF()`: reicht `runId` an `parser.parseInvoice(pdfFile, runId)` weiter (Zeile 43) | `src/services/invoiceParserService.ts` | Anpassung | 1.1 |
| 1.4 | Parser-Hook: Nach `extractTextFromPDF()` wird `rawPages`-Array an logService gemeldet | `src/services/parsers/FatturaParserService.ts` | Erweiterung | 1.2 |
| 1.5 | Parser-Hook: Header-Pattern-Matches werden an logService gemeldet (Feld, Pattern, Wert) | `src/services/parsers/FatturaParserService.ts` | Erweiterung | 1.2 |
| 1.6 | Parser-Hook: Zeilen-Parse-Detail (Rohzeile + Ergebnis) wird an logService gemeldet | `src/services/parsers/FatturaParserService.ts` | Erweiterung | 1.2 |

#### Phase 2: logService-Umbau (Hybrid-Verhalten)

| # | Aufgabe | Datei(en) | Aenderungstyp | Abhaengigkeit |
|---|---|---|---|---|
| 2.1 | Neues `RunLogFile`-Interface definieren (Schema aus 4.1.4) | `src/types/index.ts` | Erweiterung | -- |
| 2.2 | Neues `HomeLogEntry` + `HomeLogCategory` Interface definieren | `src/types/index.ts` | Erweiterung | -- |
| 2.3 | Neue Methode `addRunLogDetail(runId, category, data)` -- sammelt tiefe Parser-Details in localStorage | `src/services/logService.ts` | Erweiterung | 2.1 |
| 2.4 | Neue Methode `flushRunLog(runId, folderName)` -- schreibt Run-Log als JSON auf Festplatte via fileSystemService | `src/services/logService.ts` | Erweiterung | 2.1, 10.3 |
| 2.5 | Neue Methode `flushDailyLog(date)` -- schreibt Tages-Log in `/.logs/` via fileSystemService | `src/services/logService.ts` | Erweiterung | 2.2, 10.3 |
| 2.6 | Neue Methode `rotateLogs()` -- prueft Dateianzahl in `/.logs/`, loescht aelteste | `src/services/logService.ts` | Erweiterung | 10.3 |
| 2.7 | Tageswechsel-Erkennung in `log()` -- prueft ob Datum sich geaendert hat, ruft ggf. `flushDailyLog()` auf | `src/services/logService.ts` | Anpassung | 2.5 |
| 2.8 | Methode `getRunLog(runId)` anpassen -- liest aus localStorage ODER Festplatte (je nach Run-Status) | `src/services/logService.ts` | Anpassung | 10.3 |
| 2.9 | `createLogSnapshot()` und `viewLogWithSnapshot()` entfernen, durch `viewCurrentDayLog()` ersetzen | `src/services/logService.ts` | Entfernung + Neubau | 2.5 |
| 2.10 | `falmec-log-snapshots` Key entfernen (einmalige Migration: Key loeschen) | `src/services/logService.ts` | Entfernung | -- |
| 2.11 | `log()` Methode: `category`-Feld hinzufuegen (fuer HomeLogEntry-Kompatibilitaet) | `src/services/logService.ts` | Anpassung | 2.2 |

#### Phase 3: fileSystemService-Erweiterung (Lese- + Loesch-Methoden)

| # | Aufgabe | Datei(en) | Aenderungstyp | Abhaengigkeit |
|---|---|---|---|---|
| 3.1 | Neue Methode `checkPermission()` -- prueft ob Handle noch gueltig ist | `src/services/fileSystemService.ts` | Erweiterung | -- |
| 3.2 | Neue Methode `listArchiveFolders()` -- listet Ordner in `/.Archiv/` | `src/services/fileSystemService.ts` | Erweiterung | -- |
| 3.3 | Neue Methode `listLogFiles()` -- listet Dateien in `/.logs/` | `src/services/fileSystemService.ts` | Erweiterung | -- |
| 3.4 | Neue Methode `readFileFromArchive(folder, file)` -- liest JSON/Text aus Archiv | `src/services/fileSystemService.ts` | Erweiterung | -- |
| 3.5 | Neue Methode `deleteOldLogFiles(maxCount)` -- loescht aelteste Logs | `src/services/fileSystemService.ts` | Erweiterung | 3.3 |
| 3.6 | Neue Methode `writeBinaryFile(folder, name, blob)` -- schreibt Blob (PDF, Bilder) | `src/services/fileSystemService.ts` | Erweiterung | -- |
| 3.7 | Bestehende `saveToArchive()` mit Retry-Logik erweitern (max 3 Versuche) | `src/services/fileSystemService.ts` | Anpassung | -- |

#### Phase 4: archiveService-Umbau (Festplatte statt localStorage)

| # | Aufgabe | Datei(en) | Aenderungstyp | Abhaengigkeit |
|---|---|---|---|---|
| 4.1 | Neues `ArchiveMetadata`-Interface definieren (Schema aus 4.3.4) | `src/types/index.ts` | Erweiterung | -- |
| 4.2 | Neue Methode `writeArchivePackage(run, lines)` -- orchestriert den gesamten Archivierungs-Workflow | `src/services/archiveService.ts` | Erweiterung | 3.6, 3.7, 2.4 |
| 4.3 | Neue Methode `cleanupBrowserData(runId)` -- loescht localStorage + IndexedDB fuer einen Run | `src/services/archiveService.ts` | Erweiterung | -- |
| 4.4 | `createArchiveEntry()` anpassen -- erstellt Ordner auf Festplatte via `fileSystemService.saveToArchive()` statt localStorage | `src/services/archiveService.ts` | Anpassung | 3.7 |
| 4.5 | `getArchivedRun()` anpassen -- liest `metadata.json` von Festplatte via `fileSystemService.readFileFromArchive()` | `src/services/archiveService.ts` | Anpassung | 3.4 |
| 4.6 | `getArchivedRuns()` anpassen -- listet Archiv-Ordner via `fileSystemService.listArchiveFolders()` | `src/services/archiveService.ts` | Anpassung | 3.2 |
| 4.7 | Ordner-Duplikat-Erkennung: Suffix `_v2`, `_v3` bei gleichem Fattura+Datum | `src/services/archiveService.ts` | Erweiterung | 3.2 |

#### Phase 5: runStore-Integration (Workflow-Hooks)

| # | Aufgabe | Datei(en) | Aenderungstyp | Abhaengigkeit |
|---|---|---|---|---|
| 5.1 | Nach Step 5 (Export): `archiveService.writeArchivePackage()` aufrufen | `src/store/runStore.ts` | Erweiterung | 4.2 |
| 5.2 | Neue Action `archiveRun(runId)` -- manueller Archivierungs-Trigger | `src/store/runStore.ts` | Erweiterung | 4.2, 4.3 |
| 5.3 | Neue Action `abortRun(runId)` -- bei Abbruch: Teilarchiv erstellen | `src/store/runStore.ts` | Erweiterung | 4.2 |
| 5.4 | App-Start: `logService.flushPendingLogs()` aufrufen (Nachhol-Check) | `src/App.tsx` oder `src/main.tsx` | Erweiterung | 2.5 |
| 5.5 | App-Start: `logService.rotateLogs()` aufrufen (aelteste Logs aufraeumen) | `src/App.tsx` oder `src/main.tsx` | Erweiterung | 2.6 |

#### Phase 6: UI-Komponenten

| # | Aufgabe | Datei(en) | Aenderungstyp | Abhaengigkeit |
|---|---|---|---|---|
| 6.1 | Neuer "Log"-Tab in RunDetail | `src/components/run-detail/RunLogTab.tsx` (NEU) | Neu | 2.8 |
| 6.2 | RunDetail: Tab-Navigation um "Log" erweitern | `src/pages/RunDetail.tsx` | Anpassung | 6.1 |
| 6.3 | Footer "Logfile"-Button: auf `viewCurrentDayLog()` umstellen | `src/components/AppFooter.tsx` | Anpassung | 2.9 |
| 6.4 | Footer: "Aeltere Logs"-Dialog mit Dateiliste | `src/components/LogHistoryDialog.tsx` (NEU) | Neu | 3.3 |
| 6.5 | Dashboard: "Archiviert"-Badge pro Run | `src/pages/Index.tsx` | Anpassung | 4.6 |
| 6.6 | Dashboard: "Archivieren"-Button in Aktionen-Spalte | `src/pages/Index.tsx` | Anpassung | 5.2 |

#### Phase 7: Fallback-Modus + ZIP

| # | Aufgabe | Datei(en) | Aenderungstyp | Abhaengigkeit |
|---|---|---|---|---|
| 7.1 | `jszip` installieren | `package.json` | Dependency | -- |
| 7.2 | Neue Methode `archiveService.downloadAsZip(run, lines)` -- erzeugt ZIP mit allen Archiv-Dateien | `src/services/archiveService.ts` | Erweiterung | 7.1 |
| 7.3 | Fallback-Erkennung: `fileSystemService.getMode()` liefert 'filesystem' oder 'download' | `src/services/fileSystemService.ts` | Erweiterung | -- |
| 7.4 | `writeArchivePackage()`: Weiche -- bei mode='download' wird `downloadAsZip()` aufgerufen statt Dateisystem-Schreiben | `src/services/archiveService.ts` | Anpassung | 7.2, 7.3 |

#### Phase 8: Tests

| # | Aufgabe | Datei(en) | Aenderungstyp | Abhaengigkeit |
|---|---|---|---|---|
| 8.1 | Unit Test: `flushRunLog()` -- prueft JSON-Struktur und Cleanup | `src/services/__tests__/logService.test.ts` | Neu | 2.4 |
| 8.2 | Unit Test: `flushDailyLog()` + `rotateLogs()` | `src/services/__tests__/logService.test.ts` | Neu | 2.5, 2.6 |
| 8.3 | Unit Test: `writeArchivePackage()` mit Mock-FileSystem | `src/services/__tests__/archiveService.test.ts` | Neu | 4.2 |
| 8.4 | Unit Test: `cleanupBrowserData()` -- prueft localStorage- und IndexedDB-Loesung | `src/services/__tests__/archiveService.test.ts` | Neu | 4.3 |
| 8.5 | Unit Test: runId-Durchreichung (Parser erhaelt Store-runId) | `src/services/parsers/__tests__/runIdPropagation.test.ts` | Neu | 1.1-1.3 |
| 8.6 | Manueller Test: Vollstaendiger Archivierungs-Workflow mit Sample-PDF | -- | Manuell | Alle |
| 8.7 | Manueller Test: Fallback-Modus in Firefox (ZIP-Download) | -- | Manuell | 7.2 |

---

### 10.10 Reihenfolge-Empfehlung

```
Phase 1 (runId-Fix)        →  MUSS ZUERST, da alles darauf aufbaut
Phase 2 (logService)       →  parallel zu Phase 3 moeglich
Phase 3 (fileSystemService) →  parallel zu Phase 2 moeglich
Phase 4 (archiveService)   →  braucht Phase 2 + 3
Phase 5 (runStore)         →  braucht Phase 4
Phase 6 (UI)               →  braucht Phase 5
Phase 7 (Fallback)         →  parallel zu Phase 6 moeglich
Phase 8 (Tests)            →  phasenbegleitend, nicht am Ende
```

**Geschaetzter Umfang:**
- ~8 bestehende Dateien anpassen
- ~3 neue Dateien erstellen (RunLogTab, LogHistoryDialog, Tests)
- ~1 neue Dependency (jszip)
- 0 Breaking Changes an bestehenden UI-Komponenten (nur Erweiterungen)

---

### 10.11 Cross-Referenz: Acceptance Criteria → Design-Schritte

| AC-Gruppe | Abgedeckt durch Schritte |
|---|---|
| AC-RUNLOG-01..10 | Phase 1 (1.1-1.6) + Phase 2 (2.1-2.4) + Phase 4 (4.2) + Phase 6 (6.1) |
| AC-HOMELOG-01..08 | Phase 2 (2.2, 2.5-2.7, 2.9-2.11) + Phase 5 (5.4-5.5) + Phase 6 (6.3-6.4) |
| AC-ARCHIVE-01..10 | Phase 4 (4.1-4.7) + Phase 5 (5.1-5.3) + Phase 6 (6.5-6.6) |
| AC-FALLBACK-01..04 | Phase 7 (7.1-7.4) |
| AC-CLEANUP-01..04 | Phase 4 (4.3) + Phase 2 (2.10) |
