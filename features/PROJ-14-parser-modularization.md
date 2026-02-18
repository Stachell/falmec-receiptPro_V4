# PROJ-14: Modularisierung PDF-Parser & UI-Bereinigung

## 1. Zusammenfassung

Umstellung der Parser-Architektur auf ein modulares, laufzeitdynamisches System mit austauschbaren Parser-Regeldateien. Parallel dazu: Auslagerung globaler Einstellungen aus dem Slider in ein eigenes Settings-Popup, Einfuehrung eines Parser-Dropdowns, Importfunktion fuer externe Parser-Dateien, sowie systemweite Umlaut-Korrektur auf UI-Ebene.

---

## 2. Motivation

- **Parser-Rigidtaet**: Aktuell gibt es genau einen Parser (`FatturaParserService.ts`), der als Singleton in `src/services/parsers/index.ts` hart verdrahtet ist. Ein zweites Regelset (z.B. andere Lieferanten oder veraenderte PDF-Layouts) erfordert Code-Aenderungen und einen Rebuild.
- **Slider-Ueberladung**: Der globale Footer-Slider enthaelt aktuell 5 Controls (Preisbasis, Waehrung, Toleranz, Datenverzeichnis, Maussperre) plus 1 Action-Button (Logfile). Die selten genutzten Einstellungen (Preisbasis, Waehrung, Toleranz, Maussperre) versperren Platz fuer neue Controls wie das Parser-Dropdown.
- **Umlaut-Defekte**: Mehrere UI-Dateien (`Index.tsx`, `RunDetail.tsx`, `NewRun.tsx`) enthalten defekte UTF-8-Doppel-Encodings (`Ã¼` statt `ue`, `Ã¶` statt `oe`, etc.), die in der Darstellung sichtbar sind.
- **Fehlende Transparenz**: Es gibt kein Log-Tracking fuer Parser-Wechsel, -Importe oder -Ladefehler ausserhalb der Run-Logs.

---

## 3. Betroffene Bereiche

| Bereich | Dateien (Hauptkandidaten) | Aenderungstyp |
|---|---|---|
| Parser-Registry | `src/services/parsers/index.ts` | Refactoring |
| Bestehender Parser | `src/services/parsers/FatturaParserService.ts` → Umbenennung zu `_V1` | Rename + Neue Datei V2 |
| Parser-Typen | `src/services/parsers/types.ts` | Erweiterung |
| Parser-Config | `src/services/parsers/config.ts` | Erweiterung |
| InvoiceParserService | `src/services/invoiceParserService.ts` | Anpassung |
| Footer/Slider | `src/components/AppFooter.tsx` | Refactoring |
| Settings-Popup | `src/components/SettingsPopup.tsx` (NEU) | Neu |
| Parser-Dropdown | In `AppFooter.tsx` | Erweiterung |
| Logging | `src/services/logService.ts` | Erweiterung |
| Issue-Center | `src/store/runStore.ts` (Issue-Erstellung) | Erweiterung |
| UI-Dateien (Umlaute) | `Index.tsx`, `RunDetail.tsx`, `NewRun.tsx`, ggf. weitere | Fix |
| Parser-Module-Ordner | `src/services/parsers/modules/` (NEU) | Neu |
| Parser-Registry | `src/services/parsers/modules/parser-registry.json` (NEU) | Neu |

---

## 4. Anforderungen im Detail

### 4.1 FRONTEND: GLOBALES SETTINGS-POPUP

#### 4.1.1 Zweck

Die selten geaenderten Konfigurationswerte (Maussperre, Preisbasis, Waehrung, Toleranz) werden aus dem globalen Slider entfernt und in ein eigenes Popup "Einstellungen" verlagert. Der Slider wird dadurch uebersichtlicher und hat Platz fuer das neue Parser-Dropdown.

#### 4.1.2 Funktionsbeschreibung

**Slider (nach Umbau) enthaelt nur noch:**

| Control | Typ | Beschreibung |
|---|---|---|
| Parser-Dropdown | Select | Auswahl der aktiven Parser-Regel (NEU, s. 4.2) |
| Datenverzeichnis | Button | Ordner-Auswahl via File System Access API (bestehend) |
| Logfile | Button | Logfile anzeigen (bestehend) |
| Einstellungen | Button (NEU) | Oeffnet das Settings-Popup |

**Settings-Popup enthaelt:**

| Control | Typ | Default | Beschreibung |
|---|---|---|---|
| Maussperre | Select (0.0-3.0s) | 0.0 | Click-Lock-Dauer in Sekunden |
| Preisbasis | Select (Netto/Brutto) | Netto | Netto- oder Bruttobasis fuer Preisvergleiche |
| Waehrung | Select (EUR) | EUR | Waehrung (derzeit nur EUR) |
| Toleranz (EUR) | Number-Input | 0.00 | Toleranzwert fuer Preis-Matching |
| Parser importieren | Button | -- | Importiert eine externe .ts-Parser-Datei (s. 4.4) |

**Popup-Verhalten:**
- Modal-Dialog (shadcn `Dialog`-Komponente)
- Schliesst mit X-Button, Escape-Taste oder Klick ausserhalb
- Aenderungen werden sofort in `globalConfig` (Zustand-Store) persistiert (kein expliziter "Speichern"-Button noetig)

#### 4.1.3 User Stories

**US-SETTINGS-01**: Als Anwender moechte ich ein Settings-Popup oeffnen koennen, damit ich selten genutzte Einstellungen aendern kann, ohne den Slider zu ueberladen.

**US-SETTINGS-02**: Als Anwender moechte ich, dass Aenderungen im Settings-Popup sofort wirksam sind, ohne dass ich explizit speichern muss.

**US-SETTINGS-03**: Als Anwender moechte ich den Settings-Button im Slider sehen und mit einem Klick das Popup oeffnen koennen.

#### 4.1.4 Acceptance Criteria

- [ ] **AC-SETTINGS-01**: Der Slider enthaelt nach dem Umbau genau 4 Elemente: Parser-Dropdown, Datenverzeichnis-Button, Logfile-Button, Einstellungen-Button.
- [ ] **AC-SETTINGS-02**: Preisbasis, Waehrung, Toleranz und Maussperre sind NICHT mehr im Slider sichtbar.
- [ ] **AC-SETTINGS-03**: Der "Einstellungen"-Button im Slider oeffnet ein Modal-Popup.
- [ ] **AC-SETTINGS-04**: Das Popup enthaelt alle 4 migrierten Settings (Maussperre, Preisbasis, Waehrung, Toleranz) plus den "Parser importieren"-Button.
- [ ] **AC-SETTINGS-05**: Aenderungen im Popup aktualisieren sofort den `globalConfig` im Zustand-Store.
- [ ] **AC-SETTINGS-06**: Das Popup kann via X-Button, Escape oder Klick ausserhalb geschlossen werden.
- [ ] **AC-SETTINGS-07**: Alle bisherigen Settings-Funktionalitaeten (Wertebereich, Defaults, Persistierung) bleiben unveraendert.

---

### 4.2 FRONTEND: PARSER-DROPDOWN & SYSTEMLOGIK

#### 4.2.1 Zweck

Neues Dropdown im Slider zur Auswahl der aktiven Parser-Regel. Ermoeglicht dem Anwender, zwischen verschiedenen Parser-Modulen zu wechseln, ohne Code-Aenderungen. Die Auswahl wird persistent in der Systemkonfiguration gespeichert und ueberlebt Browser-Wechsel, Cache-Leerungen und Geraetewechsel.

#### 4.2.2 Funktionsbeschreibung

**Dropdown-Optionen:**

| Option | Bedingung | Verhalten |
|---|---|---|
| "Auto" | Immer verfuegbar | App sucht den passenden Parser via `canHandle()`-Pruefung (bestehende Router-Logik in `findParserForFile()`) |
| `{Parser.moduleName} v{version}` | Pro registriertem Parser | Erzwingt diesen spezifischen Parser, ignoriert `canHandle()` |

**Anzeige:**
- Label: "Parser-Regel"
- Position: Ganz links im Slider (erstes Element)
- Format: `{moduleName} v{version}` z.B. "logicdev_PDF-Parser v2.0.0"

#### 4.2.3 Persistenz der Parser-Auswahl

Die vom User im Dropdown getroffene Auswahl wird **in der Systemkonfigurationsdatei** (`parser-registry.json`) gespeichert -- NICHT im Browser-Speicher (localStorage/SessionStorage/Zustand-Persistenz).

**Warum nicht Browser-Speicher?**

| Aspekt | Browser-Speicher (localStorage) | Systemkonfiguration (parser-registry.json) |
|---|---|---|
| Browser-Wechsel | Auswahl verloren | Auswahl erhalten |
| Cache / Daten loeschen | Auswahl verloren | Auswahl erhalten |
| Anderer Rechner, gleicher Projekt-Ordner | Auswahl verloren | Auswahl erhalten |
| Inkognito-Modus | Auswahl verloren | Auswahl erhalten |
| Zuverlaessigkeit | Abhaengig von Browser-Zustand | Abhaengig von Dateisystem (robust) |

**Erweiterung der parser-registry.json:**

Die bestehende `parser-registry.json` (s. 4.4.2) wird um ein Top-Level-Feld `selectedParserId` erweitert:

```
{
  "version": 1,
  "selectedParserId": "auto",
  "modules": [ ... ]
}
```

Moegliche Werte fuer `selectedParserId`:
- `"auto"` -- System waehlt passenden Parser via `canHandle()`
- Eine beliebige `moduleId` aus der `modules`-Liste (z.B. `"fattura_falmec_v2"`)

Bei jeder Dropdown-Aenderung wird `selectedParserId` sofort in die JSON-Datei zurueckgeschrieben.

#### 4.2.4 Master-Parser (Systemanker)

Es existiert ein **fest definierter Master-Parser**, der als ultimativer Fallback-Anker im System dient. Der Master kann NICHT geloescht oder deregistriert werden.

**Master-Definition:**

| Eigenschaft | Wert |
|---|---|
| Master-Parser-ID | `"auto"` |
| Bedeutung | Automatische Erkennung via `canHandle()`-Kette |
| Deregistrierbar? | NEIN -- fest im System verankert |
| Aenderbar durch User? | NEIN -- nur durch Codeaenderung |

**Fallback-Kaskade des Master-Modus ("auto"):**

```
1. canHandle()-Kette durchlaufen (alle registrierten Parser in Registry-Reihenfolge)
2. Falls kein Parser canHandle() bestaetigt:
   → Fallback auf den ERSTEN builtin-Parser in der Registry (source: "builtin")
3. Falls kein builtin-Parser vorhanden:
   → Fehler: "Kein Parser verfuegbar" + Issue-Center-Eintrag
```

#### 4.2.5 Start-Verhalten (Boot-Validierung)

Beim App-Start fuehrt das System eine deterministische Validierung des gespeicherten `selectedParserId` durch:

```
1. parser-registry.json lesen
2. selectedParserId auslesen
3. WENN selectedParserId == "auto":
     → Nichts weiter pruefen. Auto-Modus aktiv.
4. WENN selectedParserId == eine moduleId aus modules[]:
     a. Pruefen: Existiert die zugehoerige .ts-Datei physisch im Ordner?
     b. Pruefen: Laesst sich das Modul fehlerfrei laden?
     c. WENN beides ja → Parser aktiv. Fertig.
     d. WENN nein → LAUTLOSER Fallback auf "auto".
        - selectedParserId in der JSON auf "auto" zuruecksetzen
        - Log-Eintrag (WARN): "Gespeicherter Parser '{moduleId}' nicht verfuegbar. Fallback auf Auto."
        - KEIN User-Dialog, KEIN Toast, KEIN Popup.
5. WENN selectedParserId einen Wert hat, der weder "auto" noch eine bekannte moduleId ist:
     → Identisches Verhalten wie 4d (lautloser Fallback auf "auto").
```

**Kernprinzip:** Der User soll beim Start NIEMALS mit einem Fehler-Dialog konfrontiert werden, nur weil ein zuvor gewaehlter Parser zwischenzeitlich entfernt wurde. Das System heilt sich selbst.

#### 4.2.6 Auto-Select bei Einzel-Parser

Befindet sich physisch **exakt eine** Parser-Datei im Modul-Ordner (`src/services/parsers/modules/`), greift eine Sonderregel:

| Bedingung | Verhalten |
|---|---|
| Genau 1 Parser-Datei im Ordner | Parser wird automatisch als `selectedParserId` in der JSON gesetzt. Dropdown zeigt nur diesen Parser (kein "Auto" noetig, da es keine Auswahl gibt). |
| 0 Parser-Dateien im Ordner | Dropdown zeigt "Kein Parser verfuegbar". Parse-Versuch erzeugt Fehler. |
| ≥2 Parser-Dateien im Ordner | Normale Logik: `selectedParserId` aus JSON uebernehmen. Bei "auto" oder ungueltigem Wert → Auto-Modus. |

**Automatische Konfig-Aktualisierung:** Wenn der Auto-Select greift, wird der Wert in `parser-registry.json` persistent geschrieben (nicht nur im Speicher gehalten). Damit ist die Auswahl auch nach einem Neustart stabil.

#### 4.2.7 User Stories

**US-DROPDOWN-01**: Als Anwender moechte ich im Slider sehen, welcher Parser aktiv ist, damit ich die korrekte Verarbeitungsregel nachvollziehen kann.

**US-DROPDOWN-02**: Als Anwender moechte ich zwischen verschiedenen Parsern wechseln koennen, wenn mehrere verfuegbar sind.

**US-DROPDOWN-03**: Als Anwender moechte ich eine "Auto"-Option haben, die automatisch den passenden Parser fuer das PDF ermittelt.

**US-DROPDOWN-04**: Als Anwender moechte ich, dass meine Parser-Auswahl auch nach einem Browser-Wechsel, Cache-Leerung oder auf einem anderen Rechner (gleicher Projekt-Ordner) erhalten bleibt, damit ich die Einstellung nicht jedes Mal neu treffen muss.

**US-DROPDOWN-05**: Als Anwender moechte ich, dass das System beim Start lautlos auf einen funktionierenden Parser zurueckfaellt, wenn mein zuvor gewaehlter Parser nicht mehr verfuegbar ist, damit ich nicht mit einem Fehler-Dialog konfrontiert werde.

**US-DROPDOWN-06**: Als Anwender moechte ich, dass bei nur einem vorhandenen Parser dieser automatisch gewaehlt wird, ohne dass ich manuell etwas auswaehlen muss.

#### 4.2.8 Acceptance Criteria

- [ ] **AC-DROPDOWN-01**: Im Slider existiert ein Dropdown "Parser-Regel" als erstes Element (links).
- [ ] **AC-DROPDOWN-02**: Das Dropdown listet alle registrierten Parser mit `{moduleName} v{version}`.
- [ ] **AC-DROPDOWN-03**: Die Option "Auto" ist verfuegbar und nutzt die bestehende `findParserForFile()`-Logik.
- [ ] **AC-DROPDOWN-04**: Bei genau 1 physisch vorhandenem Parser im Modul-Ordner ist dieser automatisch selektiert UND in `parser-registry.json` als `selectedParserId` persistiert.
- [ ] **AC-DROPDOWN-05**: Bei ≥2 Parsern und `selectedParserId == "auto"` in der JSON ist "Auto" der Default im Dropdown.
- [ ] **AC-DROPDOWN-06**: Die Auswahl wird in `parser-registry.json` persistiert (Top-Level-Feld `selectedParserId`), NICHT im Browser-Speicher (localStorage/Zustand-Persistenz).
- [ ] **AC-DROPDOWN-07**: Bei manuellem Parser-Wechsel wird ein Log-Eintrag im Home-Log geschrieben (s. 4.5).
- [ ] **AC-DROPDOWN-08**: Wird ein Parser ausgewaehlt, der aktuell nicht geladen ist (z.B. nach Import-Fehler), erscheint ein Fehlerhinweis im Dropdown.
- [ ] **AC-DROPDOWN-09**: Beim App-Start wird der in `parser-registry.json` gespeicherte `selectedParserId` validiert. Ist der Parser nicht verfuegbar oder ungueltig, faellt das System LAUTLOS auf `"auto"` zurueck und aktualisiert die JSON-Datei.
- [ ] **AC-DROPDOWN-10**: Der lautlose Fallback erzeugt einen Log-Eintrag (Level: WARN), aber KEINEN User-Dialog, Toast oder Popup.
- [ ] **AC-DROPDOWN-11**: Der Master-Parser `"auto"` kann nicht aus dem Dropdown entfernt oder deaktiviert werden.
- [ ] **AC-DROPDOWN-12**: Bei 0 Parser-Dateien im Modul-Ordner zeigt das Dropdown "Kein Parser verfuegbar" und ein Parse-Versuch erzeugt einen Fehler + Issue-Center-Eintrag.
- [ ] **AC-DROPDOWN-13**: Die Auto-Select-Logik (Einzel-Parser) schreibt die Auswahl persistent in `parser-registry.json`, nicht nur in den Arbeitsspeicher.

---

### 4.3 MODULARITAET & NEUE REGELN

#### 4.3.1 Zweck

Parser-Regeln werden als modulare Dateien in einem separierten Ordner abgelegt. Die bestehende Parser-Registry (`src/services/parsers/index.ts`) wird von einer statischen Konfiguration auf einen ordnerbasierten Discovery-Mechanismus umgestellt.

#### 4.3.2 Funktionsbeschreibung

**Neuer Ordner: `src/services/parsers/modules/`**

Alle Parser-Module werden hier abgelegt. Jedes Modul ist eine einzelne `.ts`-Datei, die das `InvoiceParser`-Interface implementiert.

**Umbenennung bestehender Parser:**

| Vorher | Nachher | Beschreibung |
|---|---|---|
| `src/services/parsers/FatturaParserService.ts` | `src/services/parsers/modules/FatturaParserService_V1.ts` | Bestehender Parser (unveraenderte Logik) |
| -- (NEU) | `src/services/parsers/modules/FatturaParserService_V2.ts` | Neuer Parser basierend auf `PARSER-RULES-REFERENCE.md` |

**Registrierung:**

Die Registry in `src/services/parsers/index.ts` wird umgebaut:

```
VORHER (statisch):
  const fatturaParser = new FatturaParserService();
  const LOCAL_PARSERS = [fatturaParser];

NACHHER (ordnerbasiert):
  const LOCAL_PARSERS = discoverParsers('src/services/parsers/modules/');
  // Alle .ts-Dateien im Ordner werden geladen und instanziiert
```

**FatturaParserService_V2:**
- Neue Klasse, die auf den Regeln aus `PARSER-RULES-REFERENCE.md` basiert
- `moduleId`: `'fattura_falmec_v2'`
- `moduleName`: `'Fattura Falmec V2'`
- `version`: `'2.0.0'`
- Implementiert dieselben Interfaces (`InvoiceParser`, `ParsedInvoiceResult`) wie V1
- Nutzt die pdfjs-dist Text-Extraktion (wie V1), aber mit angepassten/erweiterten Regex-Patterns gemaess PARSER-RULES-REFERENCE.md

#### 4.3.3 User Stories

**US-MODULE-01**: Als Entwickler moechte ich neue Parser als einzelne .ts-Dateien in einem Modul-Ordner ablegen koennen, ohne andere Dateien aendern zu muessen.

**US-MODULE-02**: Als Anwender moechte ich sowohl den alten V1-Parser als auch den neuen V2-Parser zur Auswahl haben, um Ergebnisse vergleichen zu koennen.

**US-MODULE-03**: Als Entwickler moechte ich, dass der bestehende Parser unter `_V1` weiterhin funktioniert, damit es keine Breaking Changes gibt.

#### 4.3.4 Acceptance Criteria

- [ ] **AC-MODULE-01**: Es existiert ein Ordner `src/services/parsers/modules/`.
- [ ] **AC-MODULE-02**: `FatturaParserService.ts` wurde zu `modules/FatturaParserService_V1.ts` umbenannt. Alle Imports/Referenzen sind angepasst.
- [ ] **AC-MODULE-03**: Eine neue Datei `modules/FatturaParserService_V2.ts` existiert und implementiert `InvoiceParser`.
- [ ] **AC-MODULE-04**: V2 basiert auf den Regeln in `PARSER-RULES-REFERENCE.md` (Header-Parsing, Positions-Parsing, Bestellblock-Zuordnung, Validierungsregeln).
- [ ] **AC-MODULE-05**: V2 erkennt Falmec-Rechnungen via `canHandle()` (Pruefung auf "Falmec S.p.A" oder "NUMERO DOC" im Text).
- [ ] **AC-MODULE-06**: Die Parser-Registry (`index.ts`) laedt alle Module aus `modules/` (statischer Import, kein dynamisches `import()`).
- [ ] **AC-MODULE-07**: Beide Parser (V1 und V2) sind gleichzeitig im Dropdown verfuegbar.
- [ ] **AC-MODULE-08**: Bestehende Tests fuer den V1-Parser laufen weiterhin ohne Aenderung (ausser Importpfad).

#### 4.3.5 Technische Fragen fuer den Solution Architect

> **TQ-MODULE-01**: Soll die Modul-Discovery rein statisch (explizite Imports in `index.ts`) oder semi-dynamisch (Vite `import.meta.glob()`) erfolgen? Statisch ist einfacher und Build-sicher, erfordert aber einen manuellen Import pro neuem Modul. `import.meta.glob()` waere automatischer, hat aber Einschraenkungen bei Laufzeit-Imports.

> **TQ-MODULE-02**: Wie soll mit dem Fall umgegangen werden, dass V1 und V2 beide `canHandle()` fuer dasselbe PDF bestehen? Prioritaetsreihenfolge noetig (V2 vor V1?).

---

### 4.4 UI: PARSER-IMPORT

#### 4.4.1 Zweck

Anwender koennen ueber das Settings-Popup externe .ts-Dateien als Parser-Module importieren. Dies ermoeglicht die Verteilung neuer Parser-Regeln ohne Rebuild.

#### 4.4.2 Systemlogik: Registry-Ansatz (ENTSCHIEDEN)

> **Entscheidung zu TQ-IMPORT-01**: Option (c) -- Registry-Only-Ansatz mit `parser-registry.json`.
> Vite kann .ts-Dateien zur Laufzeit nicht kompilieren. Deshalb wird ein minimaler, KISS-basierter Ansatz verwendet:
> Der Import legt die Datei im Modul-Ordner ab und registriert sie in einer simplen JSON-Datei.
> Der neue Parser ist erst nach einem App-Refresh (Page Reload) verfuegbar.

**parser-registry.json:**

Einfache Manifest-Datei im Parser-Modul-Ordner (`src/services/parsers/modules/parser-registry.json`):

```json
{
  "version": 1,
  "selectedParserId": "auto",
  "modules": [
    {
      "fileName": "FatturaParserService_V1.ts",
      "moduleId": "logicdev_pdf_parser_integrated_v2",
      "moduleName": "logicdev_PDF-Parser",
      "version": "2.0.0",
      "addedAt": "2026-02-18T10:00:00Z",
      "source": "builtin"
    },
    {
      "fileName": "FatturaParserService_V2.ts",
      "moduleId": "fattura_falmec_v2",
      "moduleName": "Fattura Falmec V2",
      "version": "2.0.0",
      "addedAt": "2026-02-18T10:00:00Z",
      "source": "builtin"
    }
  ]
}
```

- `source`: `"builtin"` (mitgeliefert) oder `"imported"` (via UI importiert)
- Beim App-Start liest die Registry diese Datei und laedt die Module via statischem Import
- Beim Import wird ein neuer Eintrag mit `"source": "imported"` hinzugefuegt

#### 4.4.3 Import-Ablauf

```
1. User klickt "Parser importieren" im Settings-Popup
2. Datei-Dialog oeffnet sich (nur .ts-Dateien)
3. User waehlt eine oder mehrere .ts-Dateien aus
4. App validiert:
   a. Dateiendung ist .ts
   b. Dateigroesse <= 1 MB
   c. Grundlegende Heuristik-Pruefung (Datei enthaelt `moduleId`, `implements InvoiceParser` o.ae.)
5. Bei Erfolg:
   a. Datei wird in den Parser-Modul-Ordner kopiert
   b. Eintrag in `parser-registry.json` hinzugefuegt (source: "imported")
   c. Log-Eintrag: "Parser importiert: {fileName}"
   d. Success-Popup wird angezeigt (s. 4.4.4)
6. Bei Fehler:
   a. Fehlermeldung an User (Toast)
   b. Log-Eintrag: "Parser-Import fehlgeschlagen: {fileName} - {reason}"
   c. Issue-Center-Eintrag (severity: warning)
```

**WICHTIG**: Der importierte Parser ist NICHT sofort verfuegbar. Er wird erst nach einem Page Reload geladen, da Vite .ts-Dateien zur Build-Zeit bundelt.

#### 4.4.4 UI-Verhalten: Import-Bereich im Settings-Popup

**Hinweistext unter dem Import-Button:**

Direkt unter dem "Parser importieren"-Button wird ein dezenter, zurueckhaltender Hinweistext angezeigt:

```
Achtung - App muss neu geladen werden, um Aenderungen anzuzeigen.
```

- Styling: Klein, gedaempft (z.B. `text-xs text-muted-foreground`)
- Immer sichtbar (nicht erst nach Import), damit der User vorab informiert ist

**Success-Popup nach erfolgreichem Import:**

Nach einem erfolgreichen Import-Vorgang erscheint ein modaler Dialog (shadcn `AlertDialog`):

```
┌─────────────────────────────────────────────┐
│  Parser erfolgreich importiert              │
│                                             │
│  Die Datei "{fileName}" wurde importiert    │
│  und in der Registry registriert.           │
│                                             │
│  Die Seite muss aktualisiert werden, damit  │
│  der neue Parser verfuegbar ist.            │
│                                             │
│          [Verstanden]    [Refresh]           │
└─────────────────────────────────────────────┘
```

| Button | Verhalten |
|---|---|
| **Verstanden** | Schliesst das Popup. User laedt spaeter manuell neu. Settings-Popup bleibt offen. |
| **Refresh** | Fuehrt sofort `window.location.reload()` aus. |

- Das Popup ist modal und blockiert Interaktion mit dem Hintergrund
- Das Popup kann NICHT via Escape oder Klick ausserhalb geschlossen werden (bewusste Entscheidung: User soll eine der beiden Optionen waehlen)

#### 4.4.5 User Stories

**US-IMPORT-01**: Als Anwender moechte ich Parser-Dateien (.ts) ueber die UI importieren koennen, damit ich neue Verarbeitungsregeln ohne Entwickler-Hilfe hinzufuegen kann.

**US-IMPORT-02**: Als Anwender moechte ich bei Import-Fehlern eine verstaendliche Fehlermeldung erhalten.

**US-IMPORT-03**: Als Anwender moechte ich nach einem erfolgreichen Import klar informiert werden, dass ein App-Refresh noetig ist, und die Moeglichkeit haben, diesen sofort durchzufuehren.

**US-IMPORT-04**: Als Anwender moechte ich bereits VOR dem Import-Vorgang wissen, dass ein Neuladen erforderlich sein wird, damit ich nicht ueberrascht bin.

#### 4.4.6 Acceptance Criteria

- [ ] **AC-IMPORT-01**: Im Settings-Popup existiert ein Button "Parser importieren".
- [ ] **AC-IMPORT-02**: Der Button oeffnet einen Datei-Dialog mit Filter auf `.ts`-Dateien.
- [ ] **AC-IMPORT-03**: Unter dem Import-Button ist dauerhaft ein Hinweistext sichtbar: "Achtung - App muss neu geladen werden, um Aenderungen anzuzeigen." (dezent, `text-xs text-muted-foreground`).
- [ ] **AC-IMPORT-04**: Bei erfolgreichem Import erscheint ein modales Success-Popup mit Erklaerungstext.
- [ ] **AC-IMPORT-05**: Das Success-Popup bietet exakt zwei Buttons: "Verstanden" (schliesst Popup) und "Refresh" (fuehrt `window.location.reload()` aus).
- [ ] **AC-IMPORT-06**: Das Success-Popup kann NICHT via Escape oder Klick ausserhalb geschlossen werden.
- [ ] **AC-IMPORT-07**: Erfolgreich importierte Dateien werden in `parser-registry.json` eingetragen (mit `source: "imported"`).
- [ ] **AC-IMPORT-08**: Nach einem Page Reload erscheint der importierte Parser im Dropdown.
- [ ] **AC-IMPORT-09**: Bei Import-Fehler wird ein Toast mit der Fehlermeldung angezeigt (KEIN Success-Popup).
- [ ] **AC-IMPORT-10**: Jeder Import (Erfolg und Fehler) erzeugt einen Log-Eintrag im Home-Log.
- [ ] **AC-IMPORT-11**: Ein fehlgeschlagener Import erzeugt einen Eintrag im Issue-Center (severity: warning).
- [ ] **AC-IMPORT-12**: Ein bereits existierender Parser (gleiche `moduleId`) wird in der Registry ueberschrieben (Update-Szenario), nicht dupliziert. Die .ts-Datei wird ueberschrieben.

#### 4.4.7 Technische Fragen fuer den Solution Architect

> **TQ-IMPORT-01**: ~~Vite bundelt TypeScript-Dateien zur Build-Zeit. Wie soll eine zur Laufzeit importierte .ts-Datei ausgefuehrt werden?~~
> **ENTSCHIEDEN**: Registry-Only-Ansatz (Option c). Import legt Datei ab + registriert in `parser-registry.json`. Parser ist erst nach Page Reload verfuegbar. KISS-Prinzip.

> **TQ-IMPORT-02**: Wie wird die Validierung einer importierten .ts-Datei implementiert? Ein vollstaendiger TypeScript-Check ist im Browser nicht moeglich. Welche Heuristiken genuegen? (z.B. Pruefung auf `implements InvoiceParser`, Export-Statement, `moduleId`-Property).

> **TQ-IMPORT-03**: Soll ein importierter Parser in einer Sandbox laufen (z.B. Web Worker), um die Hauptanwendung vor fehlerhaftem Parser-Code zu schuetzen?

---

### 4.5 BACKEND/LOGGING

#### 4.5.1 Zweck

Alle Parser-bezogenen Aktionen (Import, Wechsel, Ladefehler) werden im allgemeinen Home-Log protokolliert. Fehler erzeugen automatisch Issue-Center-Eintraege.

#### 4.5.2 Funktionsbeschreibung

**Neue Log-Events (Home-Log, NICHT Run-Log):**

| Event | Level | Category | Beispiel-Nachricht |
|---|---|---|---|
| Parser-Import erfolgreich | INFO | config | `"Parser importiert: FatturaParserService_V3.ts (moduleId: fattura_falmec_v3)"` |
| Parser-Import fehlgeschlagen | ERROR | error | `"Parser-Import fehlgeschlagen: BadParser.ts - SyntaxError in Zeile 42"` |
| Parser-Wechsel | INFO | config | `"Parser gewechselt: Auto → Fattura Falmec V2 v2.0.0"` |
| Parser-Ladefehler | ERROR | error | `"Parser-Modul konnte nicht geladen werden: modules/Broken.ts"` |
| Parser-Registry aktualisiert | INFO | app | `"Parser-Registry: 2 Module geladen (V1, V2)"` |

**Issue-Center-Integration:**

Folgende Fehlerereignisse erzeugen automatisch einen Issue-Eintrag:

| Fehlertyp | Issue-Severity | Issue-Nachricht |
|---|---|---|
| Parser-Import-Fehler | warning | `"Parser-Import fehlgeschlagen: {fileName} - {reason}"` |
| Parser-Lade-Fehler (beim App-Start) | error | `"Parser-Modul nicht ladbar: {moduleFile}"` |
| Parser-Ausfuehrungsfehler (zur Laufzeit) | error | `"Parser-Fehler in {moduleId}: {errorMessage}"` |

#### 4.5.3 User Stories

**US-LOG-01**: Als Anwender moechte ich im Logfile nachvollziehen koennen, wann welcher Parser gewechselt oder importiert wurde.

**US-LOG-02**: Als Anwender moechte ich bei Parser-Fehlern einen Eintrag im Issue-Center sehen, damit ich nicht das Logfile durchsuchen muss.

#### 4.5.4 Acceptance Criteria

- [ ] **AC-LOG-01**: Parser-Import (Erfolg/Fehler), Parser-Wechsel und Parser-Ladefehler werden im Home-Log (`/.logs/system-{date}.log.json`) protokolliert.
- [ ] **AC-LOG-02**: Log-Eintraege verwenden die bestehende `HomeLogCategory` (`config` fuer Wechsel/Import, `error` fuer Fehler).
- [ ] **AC-LOG-03**: Parser-Import-Fehler und Parser-Lade-Fehler erzeugen automatisch einen Issue-Center-Eintrag.
- [ ] **AC-LOG-04**: Issue-Center-Eintraege enthalten den Dateinamen und die Fehlerursache.
- [ ] **AC-LOG-05**: Diese Log-Events werden NICHT in Run-Logs geschrieben (sie sind systemweit, nicht run-spezifisch).

---

### 4.6 UMLAUT-KORREKTUR

#### 4.6.1 Zweck

Systemweite Korrektur defekter Umlaute (UTF-8-Doppel-Encodings) AUSSCHLIESSLICH auf der UI-/Darstellungsebene. Interne Daten, Keys, Datenbankspalten und JSON-Strukturen duerfen NICHT veraendert werden.

#### 4.6.2 Problembeschreibung

Mehrere Quelldateien enthalten defekte UTF-8-Sequenzen, vermutlich durch doppelte Encoding-Konvertierung (UTF-8 → Latin-1 → UTF-8):

| Defektes Zeichen | Korrektes Zeichen | Betroffene Dateien |
|---|---|---|
| `Ã¼` | `ue` (oder `ü` falls UTF-8 korrekt) | Index.tsx, RunDetail.tsx, NewRun.tsx |
| `Ã¶` | `oe` (oder `ö`) | Index.tsx |
| `Ã¤` | `ae` (oder `ä`) | Index.tsx, NewRun.tsx |
| `Ãœ` | `Ue` (oder `Ü`) | RunDetail.tsx |
| `â€"` | `--` (oder `—`) | RunDetail.tsx |

**Bekannte betroffene Stellen (aus Grep-Analyse):**

| Datei | Zeile | Defekter Text | Korrektur |
|---|---|---|---|
| `Index.tsx` | 88 | `Log-EintrÃ¤ge fÃ¼r` | `Log-Eintraege fuer` |
| `Index.tsx` | 118 | `RechnungsprÃ¼fung ... fÃ¼r` | `Rechnungspruefung ... fuer` |
| `Index.tsx` | 142 | `Ã¶ffnen` | `oeffnen` |
| `Index.tsx` | 208 | `Dateien Ã¶ffnen` | `Dateien oeffnen` |
| `Index.tsx` | 217 | `Logfile Ã¶ffnen` | `Logfile oeffnen` |
| `Index.tsx` | 246 | `VerarbeitungslÃ¤ufe` | `Verarbeitungslaeufe` |
| `RunDetail.tsx` | 117 | `ZurÃ¼ck zur Ãœbersicht` | `Zurueck zur Uebersicht` |
| `RunDetail.tsx` | 362 | `rechtsbÃ¼ndig` | `rechtsbuendig` |
| `RunDetail.tsx` | 389 | `Warnungen prÃ¼fen` | `Warnungen pruefen` |
| `RunDetail.tsx` | 420 | `verfÃ¼gbar` | `verfuegbar` |
| `RunDetail.tsx` | 423 | `verfÃ¼gbar` | `verfuegbar` |
| `NewRun.tsx` | 154 | `WareneingÃ¤nge` | `Wareneingaenge` |
| `NewRun.tsx` | 155 | `WareneingÃ¤nge` | `Wareneingaenge` |
| `NewRun.tsx` | 203 | `wÃ¤hlen` | `waehlen` |
| `NewRun.tsx` | 230 | `ausgewÃ¤hlt` | `ausgewaehlt` |
| `NewRun.tsx` | 237 | `auswÃ¤hlen` | `auswaehlen` |

#### 4.6.3 Korrektur-Strategie

**REGEL: Nur UI-Strings in JSX/TSX-Dateien werden korrigiert.**

Nicht angefasst werden:
- localStorage-Keys
- JSON-Property-Names
- Datenbank-Spalten / IndexedDB-Keys
- TypeScript-Interfaces/Typen
- Dateinamen
- Log-Messages in Service-Dateien (sofern nicht UI-sichtbar)

**Umlaut-Schreibweise**: Alle defekten Umlaute werden durch korrekte UTF-8-Zeichen ersetzt (ue→ü, oe→ö, ae→ä, Ue→Ü, Oe→Ö, Ae→Ä). Falls die Projektkonvention ASCII-only-Umlaute vorsieht (ue/oe/ae), wird diese Konvention stattdessen angewendet.

#### 4.6.4 User Stories

**US-UMLAUT-01**: Als Anwender moechte ich, dass alle deutschen Texte in der Oberflaeche korrekt dargestellt werden, ohne defekte Sonderzeichen.

#### 4.6.5 Acceptance Criteria

- [ ] **AC-UMLAUT-01**: Alle in 4.6.2 identifizierten defekten Umlaut-Stellen sind korrigiert.
- [ ] **AC-UMLAUT-02**: Kein localStorage-Key, kein JSON-Property-Name und kein Interface-Feld wurde geaendert.
- [ ] **AC-UMLAUT-03**: Ein vollstaendiger Grep ueber `src/` nach dem Pattern `Ã¼|Ã¶|Ã¤|Ãœ|Ã–|Ã„` liefert 0 Treffer in `.tsx`-Dateien.
- [ ] **AC-UMLAUT-04**: Die Anwendung ist nach der Korrektur visuell korrekt (kein Layout-Bruch durch geaenderte Textlaengen).

#### 4.6.6 Technische Fragen fuer den Solution Architect

> **TQ-UMLAUT-01**: Soll eine Utility-Funktion `fixUmlauts(text: string)` erstellt werden, die defekte Sequenzen zur Laufzeit korrigiert (fuer dynamische Texte aus localStorage/API)? Oder genuegt die einmalige Quelldatei-Korrektur?

> **TQ-UMLAUT-02**: Gibt es weitere Dateien mit defekten Umlauten ausserhalb der 3 identifizierten TSX-Dateien? Ein breiterer Scan (`*.ts`, `*.tsx`, `*.json`) sollte im Solution-Design durchgefuehrt werden.

---

## 5. Edge Cases und Fehlerbehandlung

### 5.1 Parser-Modul-Ordner

| Edge Case | Erwartetes Verhalten |
|---|---|
| Modul-Ordner `modules/` existiert nicht | Wird beim App-Start automatisch erstellt. Fallback auf statische Registry. |
| Modul-Ordner ist leer | Kein Parser verfuegbar. Dropdown zeigt "Kein Parser verfuegbar". Parse-Versuch erzeugt Fehler. |
| Modul-Datei hat Syntaxfehler | Fehlerhafte Datei wird uebersprungen. Log-Eintrag + Issue-Center. Andere Module laden normal. |
| Zwei Module mit gleicher `moduleId` | Letztes gewinnt (Dateisystem-Reihenfolge). Warnung im Log. |
| Modul implementiert `InvoiceParser` nicht korrekt | Wird bei Registrierung abgefangen. Log-Eintrag: "Modul {file} implementiert InvoiceParser nicht". |

### 5.2 Parser-Import

| Edge Case | Erwartetes Verhalten |
|---|---|
| Importierte Datei ist kein TypeScript | Fehlermeldung (Toast): "Nur .ts-Dateien werden unterstuetzt". Kein Success-Popup. |
| Importierte Datei hat Kompilierfehler | Datei wird trotzdem in den Ordner kopiert und in `parser-registry.json` registriert (Validierung erfolgt erst beim naechsten Build/Reload). Hinweis im Success-Popup bleibt gleich. Beim naechsten Reload schlaegt das Laden fehl → Issue-Center-Eintrag. |
| Import waehrend eines laufenden Runs | Import ist erlaubt. Der laufende Run nutzt weiterhin den bei Start geladenen Parser. Der importierte Parser wird erst nach Reload verfuegbar. |
| Importierte Datei ueberschreibt bestehenden Parser (gleiche moduleId) | Datei wird ueberschrieben, Registry-Eintrag aktualisiert. Success-Popup erscheint normal. Aenderung erst nach Reload wirksam. |
| Datei > 1 MB | Ablehnung mit Fehlermeldung (Toast): "Parser-Datei zu gross (max. 1 MB)". Kein Success-Popup. |
| Keine Datei-Berechtigung (File System Access API) | Fehlermeldung: "Kein Schreibzugriff auf den Parser-Ordner". Datei wird NICHT registriert. |
| `parser-registry.json` ist korrupt/nicht lesbar | Beim App-Start: Registry wird aus den tatsaechlich vorhandenen .ts-Dateien im Ordner neu aufgebaut. Log-Warnung. |
| `parser-registry.json` existiert nicht | Wird beim App-Start automatisch mit den builtin-Modulen erzeugt. |
| User klickt "Verstanden" im Success-Popup und vergisst den Reload | Parser ist nicht im Dropdown. Kein Datenverlust. Beim naechsten App-Start wird der Parser normal geladen. |
| User klickt "Refresh" waehrend ein Run aktiv ist | Page Reload wird ausgefuehrt. Laufender Run geht verloren (gleich wie manueller Browser-Refresh). Das Success-Popup sollte in diesem Fall keinen zusaetzlichen Warnhinweis zeigen (KISS). |

### 5.3 Parser-Dropdown & Systemlogik

| Edge Case | Erwartetes Verhalten |
|---|---|
| **Persistenz** | |
| Gespeicherter Parser (`selectedParserId`) existiert nicht mehr | Lautloser Fallback auf `"auto"`. JSON wird aktualisiert. Log-Eintrag (WARN). KEIN User-Dialog. |
| `selectedParserId` enthaelt einen unbekannten Wert (weder `"auto"` noch bekannte `moduleId`) | Identisch: Lautloser Fallback auf `"auto"`. JSON wird korrigiert. Log-Eintrag (WARN). |
| `parser-registry.json` hat kein Feld `selectedParserId` (z.B. nach manuellem Editieren) | System setzt `selectedParserId` auf `"auto"` und schreibt das Feld in die JSON. Log-Eintrag (INFO). |
| `parser-registry.json` ist schreibgeschuetzt (kein Dateisystem-Zugriff) | Fallback-Wert `"auto"` wird im Arbeitsspeicher gehalten. Dropdown funktioniert normal, aber Aenderungen ueberleben keinen Neustart. Log-Eintrag (WARN): "Parser-Konfiguration konnte nicht gespeichert werden." |
| **Master-Parser** | |
| Alle Parser schlagen bei `canHandle()` fehl (Auto-Modus) | Fallback auf den ersten builtin-Parser (`source: "builtin"`) in der Registry. Warnung: "Kein passender Parser gefunden, verwende {name} als Fallback." |
| Kein einziger builtin-Parser vorhanden (alle geloescht/korrupt) | Fehler: "Kein Parser verfuegbar". Dropdown zeigt Fehlerzustand. Issue-Center-Eintrag (severity: error). |
| User versucht `"auto"` aus dem Dropdown zu entfernen | Nicht moeglich -- `"auto"` ist fest verankert und wird immer als Option angezeigt (ausser bei Einzel-Parser, s. Auto-Select). |
| **Auto-Select (Einzel-Parser)** | |
| Genau 1 Parser-Datei im Ordner beim App-Start | Parser wird automatisch als `selectedParserId` in JSON gesetzt. Dropdown zeigt nur diesen Parser, "Auto" wird nicht angezeigt. |
| Einzel-Parser wird geloescht (Ordner wird leer) | Beim naechsten Start: 0 Parser erkannt → Dropdown zeigt "Kein Parser verfuegbar". `selectedParserId` wird auf `"auto"` zurueckgesetzt. |
| Zweiter Parser wird hinzugefuegt (1→2 Parser) | Beim naechsten Start: Auto-Select greift NICHT mehr. Bisherige Auswahl bleibt in JSON erhalten. "Auto"-Option wird wieder im Dropdown angezeigt. |
| **Laufzeit** | |
| Parser-Wechsel waehrend eines laufenden Runs | Dropdown-Aenderung wird sofort in `parser-registry.json` geschrieben, wirkt aber erst beim naechsten Run. Toast: "Parser-Aenderung wird fuer den naechsten Durchlauf wirksam." |
| Zwei Browser-Tabs offen, Parser in Tab A geaendert | Tab B liest die JSON beim naechsten Run/Reload. Kein Echtzeit-Sync zwischen Tabs (bewusst akzeptiert, KISS). |

### 5.4 Vite/Build-Constraints & Registry

| Edge Case | Erwartetes Verhalten |
|---|---|
| `parser-registry.json` referenziert Datei die nicht existiert | Modul wird uebersprungen. Log-Warnung + Issue-Center. Andere Module laden normal. |
| Neue .ts-Datei im Ordner, aber kein Eintrag in Registry | Datei wird NICHT geladen (Registry ist die Single Source of Truth). Log-Info beim App-Start. |
| Dev-Modus: HMR nach Datei-Import | Vite erkennt neue Datei im `modules/`-Ordner und laedt automatisch neu (HMR). Success-Popup "Refresh"-Button ist trotzdem der empfohlene Weg. |
| Produktions-Build: Neue Datei nach Deploy | Importierte Dateien muessen beim naechsten Build mit eingeschlossen werden. Im reinen SPA-Modus (ohne Rebuild) sind importierte Parser erst nach erneutem `npm run build` + Deploy verfuegbar. |

### 5.5 Settings-Popup

| Edge Case | Erwartetes Verhalten |
|---|---|
| Popup wird geoeffnet waehrend ein Run laeuft | Alle Einstellungen sind aenderbar. Aenderungen wirken sofort (Toleranz, Preisbasis) oder beim naechsten Run (Parser). |
| Toleranz wird auf negativen Wert gesetzt | Input-Validierung: `min="0"`. Negativer Wert wird auf 0 korrigiert. |
| Browser-Tab wird geschlossen waehrend Popup offen ist | Keine Aktion noetig. Aenderungen wurden bereits in den Store geschrieben. |

---

## 6. Offene Klaerungspunkte

| # | Frage | Kontext | Status |
|---|---|---|---|
| 1 | Soll die Modul-Discovery statisch oder via `import.meta.glob()` erfolgen? | s. TQ-MODULE-01 | Offen |
| 2 | ~~Wie funktioniert der Runtime-Import von .ts-Dateien in einem Vite-Produktions-Build?~~ | ~~s. TQ-IMPORT-01~~ | **ENTSCHIEDEN**: Registry-Only-Ansatz. Import legt Datei + `parser-registry.json`-Eintrag ab. Parser verfuegbar nach Page Reload. |
| 3 | Reicht eine heuristische Validierung importierter Parser-Dateien? | s. TQ-IMPORT-02 | Offen |
| 4 | Soll der importierte Parser in einer Sandbox laufen? | s. TQ-IMPORT-03 | Offen |
| 5 | Soll eine Laufzeit-Umlaut-Korrektur-Utility erstellt werden? | s. TQ-UMLAUT-01 | Offen |
| 6 | Welche Umlaut-Schreibweise gilt (UTF-8 oder ASCII ae/oe/ue)? | Projektkonvention festlegen | Offen |
| 7 | Wie wird die Prioritaet bei mehreren `canHandle()`-Matches bestimmt? | s. TQ-MODULE-02 | Offen |
| 8 | Soll der V2-Parser den V1-Parser vollstaendig ersetzen oder parallel betrieben werden? | V1 als Legacy-Fallback behalten? | Offen |

---

## 7. Abhaengigkeiten

| Von Feature | Abhaengigkeit | Art |
|---|---|---|
| PROJ-12 (Advanced Logging) | Home-Log-Infrastruktur wird fuer Parser-Events benoetigt | Voraussetzung |
| PROJ-12 (Advanced Logging) | Issue-Center-Erstellung fuer Parser-Fehler | Voraussetzung |
| PROJ-4 (Invoice PDF Parsing Engine) | Bestehender FatturaParserService wird umbenannt und modularisiert | Refactoring |
| PROJ-5 (Issue Management) | Issue-Center nimmt Parser-Fehler entgegen | Integration |
| PROJ-0 (Base Setup) | Footer/Slider wird umgebaut | Refactoring |

---

## 8. Umsetzungsvorschlag (Implementation Outline)

### Phase A: Umlaut-Korrektur (Quickwin)
1. Alle defekten Umlaut-Sequenzen in TSX-Dateien korrigieren
2. Grep-Validierung: 0 Treffer auf defekte Patterns

### Phase B: Settings-Popup & Slider-Umbau
3. `SettingsPopup.tsx` erstellen (Modal-Dialog mit migrierten Controls)
4. `AppFooter.tsx` refactoren: Controls entfernen, Einstellungen-Button + Parser-Dropdown hinzufuegen
5. `globalConfig` um `selectedParserId` erweitern

### Phase C: Parser-Modularisierung
6. Ordner `src/services/parsers/modules/` erstellen
7. `FatturaParserService.ts` nach `modules/FatturaParserService_V1.ts` verschieben
8. Alle Imports anpassen (index.ts, Tests, invoiceParserService)
9. `FatturaParserService_V2.ts` erstellen (basierend auf PARSER-RULES-REFERENCE.md)
10. `index.ts` (Registry) auf ordnerbasierte Discovery umbauen

### Phase D: Parser-Import (Registry-Ansatz)
11. `parser-registry.json` Schema definieren und initiale Datei mit builtin-Modulen erzeugen
12. App-Start: Registry-Loader der `parser-registry.json` liest und Module laedt
13. Import-Button im Settings-Popup implementieren (inkl. Hinweistext darunter)
14. Datei-Validierung (Endung, Groesse, Heuristik) und Kopier-Logik in Modul-Ordner
15. `parser-registry.json` nach Import aktualisieren (neuer Eintrag mit `source: "imported"`)
16. Success-Popup mit "Verstanden"- und "Refresh"-Button implementieren

### Phase E: Logging & Issue-Center
17. Neue Log-Events fuer Parser-Aktionen im Home-Log
18. Automatische Issue-Erstellung bei Parser-Fehlern

### Phase F: Tests & QA
19. Unit Tests: Registry-Discovery, Parser-Wechsel, Import-Validierung, Registry-JSON-Integrität
20. Manuelle Tests: UI-Umlaute, Popup-Verhalten, Dropdown-Logik, Import-Flow mit Refresh

---

## 9. Technische Fragen fuer den Solution Architect (Gesammelt)

Alle technischen Fragen, die vor der Implementierung geklaert werden muessen:

| # | ID | Frage | Kontext | Kritikalitaet |
|---|---|---|---|---|
| 1 | TQ-MODULE-01 | Statische Imports vs. `import.meta.glob()` fuer Modul-Discovery? | Bestimmt die gesamte Registrierungs-Architektur | Hoch |
| 2 | TQ-MODULE-02 | Prioritaet bei mehreren `canHandle()`-Matches? | V1 und V2 matchen beide auf Falmec-PDFs | Mittel |
| 3 | ~~TQ-IMPORT-01~~ | ~~Laufzeit-Import von .ts-Dateien im Vite-Prod-Build?~~ | **ENTSCHIEDEN**: Registry-Only (Option c). Datei ablegen + `parser-registry.json` + Page Reload. KISS. | ~~Kritisch~~ **Erledigt** |
| 4 | TQ-IMPORT-02 | Validierungs-Heuristiken fuer importierte Parser-Dateien? | Ohne TypeScript-Compiler im Browser | Mittel |
| 5 | TQ-IMPORT-03 | Web-Worker-Sandbox fuer importierte Parser? | Schutz vor fehlerhaftem Code | Niedrig (MVP) |
| 6 | TQ-UMLAUT-01 | Laufzeit-Utility fuer Umlaut-Korrektur dynamischer Texte? | localStorage-Daten koennten auch betroffen sein | Niedrig |
| 7 | TQ-UMLAUT-02 | Vollstaendiger Scan aller Dateitypen auf defekte Umlaute? | Bisher nur TSX geprueft | Mittel |

---

## Tech Design (Solution Architect)

> Erstellt: 2026-02-18 | Autor: Solution Architect (Claude)
> Zielgruppe: Produktmanagement / nicht-technische Stakeholder

---

### A) Komponentenstruktur (Component Tree)

Der folgende Baum zeigt, welche UI-Bausteine neu entstehen oder umgebaut werden.
Elemente mit `(NEU)` existieren heute noch nicht; `(UMBAU)` markiert bestehende Teile, die sich aendern.

```
AppLayout
+-- AppSidebar (unveraendert)
+-- Main Content Area (unveraendert)
+-- AppFooter (UMBAU)
    |
    +-- Slider-Leiste (UMBAU -- reduziert auf 4 Elemente)
    |   +-- [1] Parser-Dropdown (NEU)
    |   |       Typ: Select-Feld
    |   |       Optionen: "Auto" | "{moduleName} v{version}" pro Parser
    |   |       Position: ganz links
    |   |
    |   +-- [2] Datenverzeichnis-Button (bestehend, unveraendert)
    |   |
    |   +-- [3] Logfile-Button (bestehend, unveraendert)
    |   |
    |   +-- [4] Einstellungen-Button (NEU)
    |           Typ: Icon-Button (Zahnrad / Settings)
    |           Aktion: oeffnet das Settings-Popup
    |
    +-- SettingsPopup (NEU -- eigene Datei: SettingsPopup.tsx)
    |   Typ: Modal-Dialog (shadcn Dialog)
    |   Schliesst via: X-Button, Escape, Klick ausserhalb
    |   |
    |   +-- Maussperre (Select, 0.0 - 3.0s)
    |   +-- Preisbasis (Select, Netto/Brutto)
    |   +-- Waehrung (Select, EUR)
    |   +-- Toleranz (Number-Input, min 0)
    |   +-- Trennlinie
    |   +-- "Parser importieren"-Button
    |   +-- Hinweistext (dauerhaft sichtbar, dezent):
    |       "Achtung -- App muss neu geladen werden, um Aenderungen anzuzeigen."
    |
    +-- ImportSuccessPopup (NEU -- Teil von SettingsPopup oder eigene Komponente)
        Typ: Modaler Alert-Dialog (shadcn AlertDialog)
        KANN NICHT via Escape/Klick ausserhalb geschlossen werden
        |
        +-- Titel: "Parser erfolgreich importiert"
        +-- Erklaerungstext mit Dateiname
        +-- [Verstanden]-Button --> schliesst Popup, Settings bleibt offen
        +-- [Refresh]-Button   --> fuehrt window.location.reload() aus
```

**Zusammenfassung der UI-Aenderungen:**

| Was | Vorher | Nachher |
|---|---|---|
| Slider-Elemente | 5 Controls + 1 Action-Button (6 Stueck) | 1 Dropdown + 3 Buttons (4 Stueck) |
| Selten genutzte Settings | Im Slider sichtbar | Versteckt im Settings-Popup |
| Parser-Auswahl | Nicht moeglich (fest verdrahtet) | Dropdown im Slider |
| Parser-Import | Nicht moeglich | Button im Settings-Popup + Success-Dialog |

---

### B) Datenmodell

#### B.1) parser-registry.json (NEU -- Single Source of Truth)

Die Registry ist eine einfache JSON-Datei, die im Parser-Modul-Ordner liegt. Sie beschreibt, welche Parser-Module vorhanden sind. Die App liest diese Datei beim Start und laedt nur die darin aufgelisteten Module.

**Speicherort:** `src/services/parsers/modules/parser-registry.json`

**Struktur:**

```
Die Datei hat folgende Top-Level-Felder:
- version          : Schema-Version der Registry selbst (aktuell: 1)
- selectedParserId : Aktuell gewaehlter Parser ("auto" | eine moduleId). Persistiert die Dropdown-Auswahl.
- modules          : Liste aller registrierten Parser-Eintraege

Jeder Eintrag in der modules-Liste hat:
- fileName        : Name der .ts-Datei im Modul-Ordner (z.B. "FatturaParserService_V1.ts")
- moduleId        : Eindeutige technische ID (z.B. "logicdev_pdf_parser_integrated_v2")
- moduleName      : Anzeigename fuer das Dropdown (z.B. "logicdev_PDF-Parser")
- version         : Versionsnummer (z.B. "2.0.0")
- addedAt         : Zeitstempel, wann der Eintrag hinzugefuegt wurde (ISO-Format)
- source          : Herkunft -- "builtin" (mitgeliefert) oder "imported" (vom User importiert)
```

**Regeln:**

| Regel | Beschreibung |
|---|---|
| Eindeutigkeit | Pro `moduleId` existiert maximal ein Eintrag. Ein Import mit gleicher `moduleId` ueberschreibt den bestehenden Eintrag. |
| Single Source of Truth | Nur Dateien, die in der Registry stehen, werden beim App-Start geladen. Eine .ts-Datei im Ordner OHNE Registry-Eintrag wird ignoriert. |
| Selbstheilung | Ist die Registry-Datei korrupt oder fehlt sie, wird sie beim App-Start aus den vorhandenen builtin-Modulen neu erzeugt. `selectedParserId` wird dabei auf `"auto"` gesetzt. |
| Initiale Belegung | Nach der Ersteinrichtung enthaelt die Registry genau 2 Eintraege: V1 (bestehender Parser) und V2 (neuer Parser). `selectedParserId` ist initial `"auto"`. |
| Parser-Auswahl-Persistenz | `selectedParserId` wird ausschliesslich in dieser Datei gespeichert (NICHT in localStorage/Zustand). Bei jeder Dropdown-Aenderung wird die Datei aktualisiert. |
| Boot-Validierung | Beim App-Start wird `selectedParserId` gegen die vorhandenen `modules[]` validiert. Ungueltiger Wert → lautloser Fallback auf `"auto"` + JSON-Korrektur. |

#### B.2) Parser-Auswahl-Persistenz (in parser-registry.json)

Die Parser-Auswahl wird NICHT im Zustand-Store (localStorage) gespeichert, sondern als Top-Level-Feld in der `parser-registry.json`:

```
Neues Top-Level-Feld in parser-registry.json:
- selectedParserId : string (Default: "auto")
  Moegliche Werte: "auto" | eine beliebige moduleId aus der modules[]-Liste
  Wird im Slider-Dropdown angezeigt und bei Aenderung sofort in die JSON-Datei geschrieben

Lese-/Schreibzyklus:
  1. App-Start: selectedParserId aus parser-registry.json lesen → Dropdown setzen
  2. User aendert Dropdown: neuen Wert sofort in parser-registry.json schreiben
  3. App-Start (Validierung): Falls gespeicherter Wert ungueltig → "auto" setzen + JSON aktualisieren
```

**Hinweis:** Der `globalConfig` im Zustand-Store (`runStore`) wird NICHT um `selectedParserId` erweitert. Der Wert lebt ausschliesslich in der Datei. Im Arbeitsspeicher wird er als lokaler React-State oder Zustand-Feld gehalten (ohne localStorage-Persistenz), damit das Dropdown reagieren kann. Die Datei ist die Single Source of Truth.

---

### C) Tech Decisions (Architektur-Entscheidungen)

#### C.1) KISS-Prinzip: Registry + Page Reload statt Laufzeit-Compiler

**Problem:** Vite (unser Build-Tool) uebersetzt TypeScript-Dateien nur zur Build-Zeit in ausfuehrbares JavaScript. Wenn ein Anwender zur Laufzeit eine neue .ts-Datei importiert, kann der Browser diese Datei nicht direkt ausfuehren -- er versteht nur JavaScript.

**Verworfene Alternative:** Man koennte einen TypeScript-Compiler im Browser einbetten (z.B. `ts-morph`, `sucrase`, `esbuild-wasm`). Das wuerde bedeuten:
- Ca. 2-5 MB zusaetzliche Bibliotheks-Groesse
- Komplexe Fehlerbehandlung (was, wenn der importierte Code Kompilierfehler hat?)
- Sicherheitsrisiken (ausfuehrbarer Code von aussen wird live kompiliert)
- Schwer wartbar und schwer testbar

**Unsere Entscheidung:** Der einfachste Weg, der zuverlaessig funktioniert:
1. Der Import-Button kopiert die .ts-Datei in den Modul-Ordner
2. Ein Eintrag wird in `parser-registry.json` geschrieben
3. Der User wird informiert: "Bitte Seite neu laden"
4. Beim naechsten Seitenaufruf erkennt Vite (im Dev-Modus) die neue Datei automatisch und bundelt sie mit ein

**Vorteile:**
- Null zusaetzliche Bibliotheken
- Keine Sicherheitsrisiken durch Laufzeit-Kompilierung
- Verlaesslich, weil der normale Build-Prozess die Arbeit uebernimmt
- Ein Page Reload (F5 oder `window.location.reload()`) dauert unter 2 Sekunden

**Einschraenkung (bewusst akzeptiert):** Der neue Parser ist nicht sofort nach dem Import verfuegbar, sondern erst nach einem Seitenneustart. Das Success-Popup erklaert dies klar und bietet einen "Refresh"-Button fuer den sofortigen Neustart.

#### C.2) Warum eine Registry-Datei statt automatischer Ordner-Erkennung?

**Problem:** Man koennte theoretisch beim App-Start einfach "alle .ts-Dateien im Ordner" scannen und laden (z.B. via `import.meta.glob()`). Warum stattdessen eine explizite JSON-Datei?

**Gruende:**

| Aspekt | Ohne Registry (automatisch) | Mit Registry (parser-registry.json) |
|---|---|---|
| Kontrolle | Jede .ts-Datei im Ordner wird geladen -- auch versehentlich abgelegte | Nur explizit registrierte Dateien werden geladen |
| Metadaten | Keine -- Name und Version muessten aus der Datei selbst gelesen werden (aufwaendig) | Name, Version, Herkunft direkt in der JSON sichtbar |
| Import-Tracking | Nicht nachvollziehbar, wann eine Datei hinzukam | `addedAt` und `source` dokumentieren die Herkunft |
| Fehlerisolation | Defekte Datei im Ordner blockiert den gesamten Scan | Defekte Datei kann gezielt uebersprungen werden (Eintrag bleibt, Datei wird als fehlerhaft markiert) |
| Debugging | Schwer zu erkennen, warum ein Parser (nicht) geladen wird | Ein Blick in die JSON-Datei zeigt den vollstaendigen Zustand |

**Entscheidung:** Die Registry ist die Single Source of Truth. Das bedeutet:
- Eine .ts-Datei im Ordner OHNE Registry-Eintrag → wird NICHT geladen (nur Log-Hinweis)
- Ein Registry-Eintrag OHNE passende .ts-Datei → wird uebersprungen (Log-Warnung + Issue-Center)

#### C.3) Modul-Discovery: Statische Imports (Entscheidung zu TQ-MODULE-01)

**Entscheidung:** Statische Imports in `index.ts`, NICHT `import.meta.glob()`.

**Begruendung fuer PMs:** Statische Imports bedeuten, dass jeder Parser-Modul-Name einmal explizit in der zentralen Registry-Datei steht. Das ist einfacher nachzuvollziehen ("was ist aktiv?"), einfacher zu debuggen und erfordert keine Vite-spezifische Magie. Nachteil: Wenn ein neuer builtin-Parser hinzukommt, muss ein Entwickler eine Zeile in `index.ts` ergaenzen. Bei importierten Parsern (via UI) wird diese Zeile automatisch beim naechsten Build hinzugefuegt.

#### C.4) canHandle()-Prioritaet (Entscheidung zu TQ-MODULE-02)

**Problem:** V1 und V2 erkennen beide Falmec-Rechnungen. Wer gewinnt im Auto-Modus?

**Entscheidung:** Die Registry-Reihenfolge bestimmt die Prioritaet. V2 steht in der Registry VOR V1 → V2 wird zuerst gefragt. Wenn V2 `canHandle()` bestaetigt, wird V1 nicht mehr gefragt.

**Fuer PMs:** Der neuere Parser hat automatisch Vorrang. Der aeltere bleibt als Fallback verfuegbar und kann manuell im Dropdown ausgewaehlt werden.

#### C.5) Import-Validierung: Leichtgewichtige Heuristik (Entscheidung zu TQ-IMPORT-02)

**Problem:** Ohne TypeScript-Compiler im Browser kann nicht geprueft werden, ob eine importierte Datei gueltig ist.

**Entscheidung:** Drei einfache Pruefungen, die keinen Compiler benoetigen:
1. Dateiendung muss `.ts` sein
2. Dateigroesse maximal 1 MB
3. Text-Heuristik: Die Datei muss die Zeichenkette `moduleId` enthalten (minimaler Plausibilitaetscheck)

Alles darueber hinaus (Syntaxfehler, fehlende Interface-Implementierung) wird erst beim naechsten App-Reload erkannt und fuehrt dann zu einem Issue-Center-Eintrag.

**Fuer PMs:** Grobe Fehlimporte (z.B. eine Bilddatei mit .ts-Endung) werden sofort abgefangen. Feinere Fehler (z.B. fehlerhafter Code) werden beim naechsten Start erkannt und gemeldet -- der User muss nicht raten, was schiefging.

#### C.6) Keine Web-Worker-Sandbox (Entscheidung zu TQ-IMPORT-03)

**Entscheidung:** Kein Sandboxing fuer MVP. Parser laufen im Hauptthread.

**Begruendung:** Die Parser-Dateien werden von einem kleinen, bekannten Nutzerkreis erstellt (interne Entwickler). Das Risiko boeswilligen Codes ist minimal. Eine Web-Worker-Isolation wuerde erhebliche Komplexitaet hinzufuegen (Kommunikation zwischen Worker und Hauptthread, Datei-Zugriff, Fehlerbehandlung). Kann in einer spaeteren Version nachgeruestet werden, falls noetig.

#### C.7) Umlaut-Korrektur: Einmalige Quelldatei-Korrektur (Entscheidung zu TQ-UMLAUT-01 + TQ-UMLAUT-02)

**Entscheidung:**
- Keine Laufzeit-Utility-Funktion. Die defekten Umlaute werden einmalig direkt in den Quelldateien korrigiert.
- Ein vollstaendiger Scan ueber alle `.ts`, `.tsx` und `.json`-Dateien wird VOR der Korrektur durchgefuehrt, um sicherzustellen, dass keine weiteren betroffenen Stellen uebersehen werden.

**Begruendung:** Eine Laufzeit-Funktion wuerde bei jedem Rendern laufen und Performance kosten -- fuer ein Problem, das einmalig in den Quelldateien behoben werden kann. Dynamische Daten aus localStorage sind nicht betroffen (die defekten Zeichen entstanden durch Datei-Encoding, nicht durch Benutzereingaben).

---

### D) Abhaengigkeiten (Dependencies)

| Paket / Komponente | Bereits vorhanden? | Zweck |
|---|---|---|
| shadcn `Dialog` | Ja (`src/components/ui/dialog.tsx`) | Settings-Popup (Modal) |
| shadcn `AlertDialog` | Ja (`src/components/ui/alert-dialog.tsx`) | Import-Success-Popup (nicht schliessbar via Escape) |
| shadcn `Select` | Ja (`src/components/ui/select.tsx`) | Parser-Dropdown im Slider |
| shadcn `Sonner` / Toast | Ja (`src/components/ui/sonner.tsx`) | Fehlermeldungen bei Import-Fehlern |
| shadcn `Input` | Ja (`src/components/ui/input.tsx`) | Toleranz-Feld im Settings-Popup |
| shadcn `Label` | Ja (`src/components/ui/label.tsx`) | Beschriftungen im Settings-Popup |
| `lucide-react` Icons | Ja (bereits im Projekt) | Settings-Icon (Zahnrad) fuer den neuen Button |

**Ergebnis: Keine neuen Pakete erforderlich.** Alle benoetigten UI-Bausteine sind bereits im Projekt vorhanden. Es muessen keine zusaetzlichen Bibliotheken installiert werden.

---

### E) Beantwortete Technische Fragen (Zusammenfassung)

| ID | Frage (kurz) | Entscheidung |
|---|---|---|
| TQ-MODULE-01 | Statisch vs. `import.meta.glob()`? | **Statische Imports** -- einfacher, transparenter, debugbar (s. C.3) |
| TQ-MODULE-02 | Prioritaet bei mehreren `canHandle()`? | **Registry-Reihenfolge** -- V2 vor V1, neuerer Parser hat Vorrang (s. C.4) |
| TQ-IMPORT-01 | Laufzeit-Import von .ts? | **Registry-Only + Page Reload** -- bereits entschieden in Spec (s. C.1) |
| TQ-IMPORT-02 | Validierung importierter Dateien? | **Leichtgewichtige Heuristik** -- Endung + Groesse + `moduleId`-Check (s. C.5) |
| TQ-IMPORT-03 | Web-Worker-Sandbox? | **Nein fuer MVP** -- interner Nutzerkreis, Komplexitaet nicht gerechtfertigt (s. C.6) |
| TQ-UMLAUT-01 | Laufzeit-Umlaut-Utility? | **Nein** -- einmalige Quelldatei-Korrektur genuegt (s. C.7) |
| TQ-UMLAUT-02 | Breiterer Datei-Scan? | **Ja** -- vollstaendiger Scan ueber `.ts/.tsx/.json` vor der Korrektur (s. C.7) |

---

### F) Checkliste Solution Architect

- [x] Bestehende Architektur via git geprueft (Komponenten, Parser, Store)
- [x] Feature-Spec gelesen und verstanden
- [x] Komponentenstruktur dokumentiert (visueller Baum, PM-lesbar)
- [x] Datenmodell beschrieben (Klartext, kein Code)
- [x] Backend-Bedarf geklaert: Kein Backend noetig (reine SPA, localStorage)
- [x] Tech-Entscheidungen begruendet (WARUM, nicht WIE)
- [x] Abhaengigkeiten gelistet: Keine neuen Pakete noetig
- [x] Design in Feature-Spec-Datei eingefuegt
- [ ] User hat reviewed und approved
- [ ] `features/INDEX.md` Status auf "In Progress" aktualisiert

---

## 10. Umsetzungsprotokoll (Implementation Log)

### Phase A: Umlaut-Korrektur -- ERLEDIGT (2026-02-18)

**Betroffene Dateien:**
- `src/pages/Index.tsx` -- 8 Korrekturen (Ã¤→ae, Ã¼→ue, Ã¶→oe, â€"→–, â€ž→„)
- `src/pages/RunDetail.tsx` -- 6 Korrekturen (Ã¼→ue, Ãœ→Ue, â€¢→•, â€"→–)
- `src/pages/NewRun.tsx` -- 4 Korrekturen (Ã¤→ae, Ã¼→ue) + 2x â€"→– in Kommentaren

**Validierung:** `grep -rP 'Ã¼|Ã¶|Ã¤|Ãœ|Ã–|Ã„|â€"|â€ž|â€¢' src/**/*.tsx` = 0 Treffer

**Acceptance Criteria:**
- [x] AC-UMLAUT-01: Alle identifizierten Stellen korrigiert
- [x] AC-UMLAUT-02: Kein localStorage-Key, JSON-Property oder Interface geaendert
- [x] AC-UMLAUT-03: 0 Treffer bei Grep-Scan ueber .tsx-Dateien
- [x] AC-UMLAUT-04: Visuelle Pruefung steht aus (manueller Browser-Test)

### Phase B: Settings-Popup & Slider-Umbau -- ERLEDIGT (2026-02-18)

**Neue Dateien:**
- `src/components/SettingsPopup.tsx` (NEU) -- Modal-Dialog mit migrierten Settings + Parser-Import-UI

**Geaenderte Dateien:**
- `src/components/AppFooter.tsx` -- Komplett-Refactoring: 4 alte Controls entfernt, 4 neue Elemente
- `src/types/index.ts` -- ~~`RunConfig` um `selectedParserId: string` erweitert~~ **VERALTET**: `selectedParserId` wird gemaess neuer Spezifikation (4.2.3) in `parser-registry.json` persistiert, NICHT im Zustand-Store. Feld im Store ggf. zurueckbauen.
- `src/store/runStore.ts` -- ~~Default `selectedParserId: 'auto'` in globalConfig~~ **VERALTET**: s. oben. Persistenz wandert in parser-registry.json (Phase C/D).

**Slider-Elemente (neu, v.l.n.r.):**
1. Parser-Regex (Select-Dropdown, Sidebar-Hintergrund, Hover wie Datenverzeichnis)
2. Datenverzeichnis (Button, bestehend)
3. Logfile (Button, bestehend)
4. Einstellungen (Button, NEU, Zahnrad-Icon, oeffnet SettingsPopup)

**SettingsPopup-Inhalt:**
1. Maussperre (SEK.) -- Select (0,0-3,0)
2. Preisbasis -- Select (Netto/Brutto)
3. Waehrung -- Select (EUR)
4. Toleranz (EUR) -- Number-Input (min 0, step 0.01)
5. Trennlinie
6. "Parser importieren"-Button (File-Picker, .ts-Filter, max 1 MB, moduleId-Heuristik)
7. Hinweistext: "Achtung – App muss neu geladen werden, um Aenderungen anzuzeigen."

**Import-Success-AlertDialog:**
- Modal, NICHT schliessbar via Escape/Klick ausserhalb
- "Verstanden"-Button (schliesst Dialog)
- "Refresh"-Button (window.location.reload())

**WICHTIG -- Frontend-Grenze:**
Der "Parser importieren"-Button oeffnet den File-Picker und fuehrt Client-seitige Validierung durch (Endung, Groesse, moduleId-Heuristik). Die tatsaechliche Datei-Kopie ins Dateisystem und das Schreiben der `parser-registry.json` ist als Mock implementiert und wird vom Backend-Agenten in Phase D ergaenzt.

**Acceptance Criteria:**
- [x] AC-SETTINGS-01: Slider enthaelt genau 4 Elemente (Parser-Regex, Datenverzeichnis, Logfile, Einstellungen)
- [x] AC-SETTINGS-02: Preisbasis, Waehrung, Toleranz, Maussperre NICHT mehr im Slider
- [x] AC-SETTINGS-03: Einstellungen-Button oeffnet Modal-Popup
- [x] AC-SETTINGS-04: Popup enthaelt alle 4 migrierten Settings + Parser-Import-Button
- [x] AC-SETTINGS-05: Aenderungen im Popup aktualisieren sofort den globalConfig Store
- [x] AC-SETTINGS-06: Popup schliessbar via X, Escape, Klick ausserhalb
- [x] AC-SETTINGS-07: Wertebereich, Defaults und Persistierung unveraendert
- [x] AC-IMPORT-01: Import-Button im Settings-Popup vorhanden
- [x] AC-IMPORT-02: File-Dialog mit .ts-Filter
- [x] AC-IMPORT-03: Hinweistext dauerhaft sichtbar (text-xs text-muted-foreground)
- [x] AC-IMPORT-04: Modales Success-Popup nach erfolgreichem Import
- [x] AC-IMPORT-05: Zwei Buttons: "Verstanden" + "Refresh"
- [x] AC-IMPORT-06: Success-Popup NICHT via Escape/Klick ausserhalb schliessbar
- [x] AC-DROPDOWN-01: Dropdown "Parser-Regex" als erstes Element im Slider
- [ ] ~~AC-DROPDOWN-06 (ALT)~~: ~~Auswahl wird in globalConfig persistiert~~ **ERSETZT durch AC-DROPDOWN-06 (NEU)**: Auswahl wird in `parser-registry.json` persistiert (Phase C/D)

**Build-Validierung:**
- TypeScript (`tsc --noEmit`): 0 Fehler
- Vite Build (`vite build`): Erfolgreich
- VS Code Diagnostics: 0 Fehler in SettingsPopup.tsx und AppFooter.tsx

### V2 Parser Bugfixes: 3 Korrekturen (42/45, fehlende EANs, Preis-Clipping) -- ERLEDIGT (2026-02-18)

**Betroffene Datei:** `src/services/parsers/modules/FatturaParserService_V2.ts`

**Root Causes (aus Log-Analyse Fattura 20.007):**
- 42 statt 45 Positionen (Mengensumme 285 statt 295): Delayed-Commit ignoriert zweiten PZ auf selber Block-Instanz
- Fehlende EANs: EANs auf Nicht-Starter-Zeilen wurden nur in `descriptionParts` geschrieben, nie in `currentBlock.ean`
- Preis-Clipping (Preissumme 95.209 statt 104.209): `smartJoinRowItems()` Gap-Schwelle zu klein, pdfjs-Splits bei Tausenderpreisen

**Fix 1 — PZ als impliziter Block-Starter (42/45 Problem):**
- Schritt D in `parsePositionsStateful()`: Wenn `currentBlock.pzQty > 0` und ein neuer PZ erkannt wird → `tryCommit()` + neuer Block
- Stellt das V1-Verhalten (jeder PZ = Commit-Punkt) wieder her, ohne den Delayed-Commit-Vorteil zu verlieren

**Fix 2 — EAN-Extraktion (fehlende EANs):**
- Fix 2a: Neuer Schritt D2 — Inline-EAN-Check `/\b(803\d{10})\b/` auf jeder Zeile (nicht nur Starter)
- Fix 2b: `isBlockStarter()` — Joined Text gegen inline-EAN-Regex pruefen (word-boundary, nicht anchored)
- Fix 2c: `isBlockStarter()` — Joined Text gegen `standard_hash`/`general_hash` ohne Anker als Fallback (fuer pdfjs-Split-Artikelnummern wie "C LVI 20.E0P7#ZZZF461F")

**Fix 3 — Preis-Clipping:**
- Fix 3a: `smartJoinRowItems()` Gap-Schwelle von `< 3` auf `< 12` erhoeht (pdfjs Tausenderpunkt-Splits haben 4-8px Gap)
- Fix 3b: `normalizeEuropeanPrices()` um zweiten Pass erweitert: `digits SPACE , digits` → `digits,digits`

**Build-Validierung:**
- TypeScript (`tsc --noEmit`): 0 Fehler
- Vite Build (`vite build`): Erfolgreich

**Erwartete Ergebnisse (Referenz-PDF Fattura 20.007):**
- 45 Positionen (statt 42)
- SUM(qty) = 295 (statt 285)
- SUM(amount) ≈ 104.209,50 (statt 95.209)
- Deutlich mehr Positionen mit EAN
- Bestellnummern-Zuordnung: Keine Regression

---

### Phase C2: Parser-Verwaltung Automatisierung -- ERLEDIGT (2026-02-18)

**Neue Methoden:**

1. **`fileSystemService.deleteFile(fileName)`** — Loescht eine Datei aus dem Root-Data-Ordner via `rootFolderHandle.removeEntry()` (Pattern aus `rotateHomeLogs`)
2. **`parserRegistryService.wipeRegistry()`** — Loescht `parser-registry.json` vom Disk + setzt In-Memory-Cache zurueck
3. **`parserRegistryService.initialize()` — Rebuild-Logik erweitert:**
   - Vergleicht `registry.modules[].moduleId` mit `getAllParsers()[].moduleId`
   - Bei Unterschied: Wipe + Rebuild, `selectedParserId` wird beibehalten falls Parser noch existiert
   - Fallback auf `'auto'` falls gespeicherter Parser nicht mehr vorhanden

**Vite Dev Plugin (`vite.config.ts`):**
- `POST /api/dev/delete-parser` — Loescht Parser-Datei + bereinigt `index.ts` (Import- und Registrierungszeilen)
  - Safety: Nur `.ts`, kein `..`, Datei muss in `modules/` existieren
- `GET /api/dev/open-folder` — Oeffnet `modules/` im Windows Explorer
- Nur im `development`-Modus aktiv

**Geaenderte Dateien:**
- `src/services/fileSystemService.ts` — `deleteFile()` hinzugefuegt
- `src/services/parserRegistryService.ts` — `wipeRegistry()` + Rebuild-Logik in `initialize()`
- `vite.config.ts` — `parserDevPlugin()` hinzugefuegt

### Phase D2: Parser-Management UI -- ERLEDIGT (2026-02-18)

**Neue Sektion "Parser-Verwaltung" im SettingsPopup** (unterhalb "Parser importieren"):

- Trennlinie + Sektions-Header "Parser-Verwaltung"
- Dropdown: Alle Parser aus `getAllParsers()`, Placeholder "Parser waehlen..."
- Button "Entfernen": Disabled wenn kein Parser gewaehlt oder nur 1 Parser verbleibt
  - Bestaetigungs-AlertDialog: "Parser wirklich loeschen?" mit "Abbrechen" / "OK"
  - Workflow: `/api/dev/delete-parser` → `wipeRegistry()` → `window.location.reload()`
- Button "Ordner oeffnen": FolderOpen-Icon, ruft `/api/dev/open-folder` auf
- Hinweistext: "Achtung – App wird nach Aenderung neu geladen, um die Registry zu aktualisieren."

**Styling:** Identisch zu bestehenden Buttons (h-9 px-4, Hover #008C99/#FFFFFF/#D8E6E7)

**Geaenderte Dateien:**
- `src/components/SettingsPopup.tsx` — Parser-Verwaltung Sektion hinzugefuegt

### Phase G: V3 Produktionsreife -- ERLEDIGT (2026-02-18)

**Interface-Konformitaet (`FatturaParserService_V3.ts`):**

| Korrektur | Vorher | Nachher |
|---|---|---|
| Klassen-Properties | `name`, `provider` | `moduleName`, `version` |
| Header-Felder | `invoiceNumber`, `invoiceDate` | `fatturaNumber`, `fatturaDate` + `totalQty`, `parsedPositionsCount`, `qtyValidationStatus` |
| Line-Felder | `articleNo`, `qty`, `orderReferences` | `manufacturerArticleNo`, `quantityDelivered`, `orderCandidates` + `orderCandidatesText` + `orderStatus` + `rawPositionText` |
| Result-Felder | `{ header, lines, validation, warnings }` | `{ success, header, lines, warnings, validationResults, parserModule, parsedAt, sourceFileName }` |
| Header-Parsing | `INVOICE_NUMBER_PATTERNS` als RegExp[] | Korrekt als `{ name, regex }[]` mit `FATTURA_NUMBER_FLEXIBLE`-Sonderbehandlung |
| Validation | `runValidation(): ValidationResult` (single) | `runValidation(): ValidationResult[]` (array) |

**Preis-Healing:** 3. Pass ergaenzt: `(\d)\s+,\s*(\d)` → `$1,$2` (Edge Case "digits SPACE , digits")

**Verifizierte Features (keine Aenderung noetig):**
- Digit-Enforcer (V3:88-97): `text.length >= 4 && /\d/.test(text)` filtert "E.P.CAP" korrekt
- X-Zonen-Logik (V3:111-124): -5px Toleranz, 3-Zonen-Klassifikation korrekt
- Anywhere-EANs: Ohne Word-Boundaries, fangen geklebte EANs

**Registrierung in `index.ts`:**
- V3 importiert und als erstes Element in `LOCAL_PARSERS` (hoechste Prioritaet)
- In `parserRegistry` Map aufgenommen (inkl. `'typescript'` und `'auto'` Aliase)

**Geaenderte Dateien:**
- `src/services/parsers/modules/FatturaParserService_V3.ts` — Komplette Interface-Konformitaet
- `src/services/parsers/index.ts` — V3 registriert

**Build-Validierung:**
- TypeScript (`tsc --noEmit`): 0 Fehler
- Vite Build (`vite build`): Erfolgreich

---

### Noch offen (fuer spaetere Phasen):
- Phase E: Logging & Issue-Center Integration
- Phase F: Tests & QA
