# Fehlercenter + Workflow-Log Diagnostic (Steps 1, 2, 3, 5)

Datum: 2026-03-03
Autor: Codex (Analyse, keine produktive Codeaenderung)

Scope:
- Gleiche Tiefenpruefung wie zuvor, aber fuer die anderen Workflow-Steps (1, 2, 3, 5)
- Beide Log-Systeme:
  - Run-Log (run-spezifisch)
  - Allgemeines Log (Settings > Allgemein > "Logfile")
- Zusatz: Auswertung Fehlercenter (IssuesCenter)

Methodik:
- Statische Code-Analyse, keine Laufzeitsimulation im Browser.
- Fokus auf IST-Funktion, Vollstaendigkeit der Logs und praktische Diagnostik-Tauglichkeit.

---

## Teil 1 - Workflow-Steps 1, 2, 3, 5 (Run-Log + Allgemeiner Log)

## 1) Step 1 - Rechnung auslesen

### IST-Funktion
- Start/Parsing/Update sind sauber orchestriert ueber `createNewRunWithParsing`, `parseInvoice`, `updateRunWithParsedData`.
- Step-1-Issues werden aus Parser-Warnings gebaut (`buildStep1ParserIssues`) und enthalten `relatedLineIds` + `affectedLineIds`.
  - Evidenz: `src/store/runStore.ts:148-192`

### IST-Logabdeckung
- Gute Run-Log-Instrumentierung fuer Kernereignisse:
  - Run-Start: `src/store/runStore.ts:857-863`
  - Parsing Erfolg/Warnung/Fehler: `src/store/runStore.ts:1108-1147`
  - Step-1 Abschluss: `src/store/runStore.ts:1310-1315`
- Logs landen automatisch auch im allgemeinen Log (`logService.log` schreibt immer systemweit, optional run-spezifisch).
  - Evidenz: `src/services/logService.ts:51-73`

### Befunde / Luecken
- Hoch: Es gibt Failure-Pfade mit `issuesCount: 1`, aber ohne echten Issue-Eintrag.
  - Kein Invoice-File Branch: `src/store/runStore.ts:968-995`
  - Vollausfall-Branch: `src/store/runStore.ts:938-966`
- Mittel: Mehrere relevante Step-1 Diagnosen laufen nur ueber `console.*` (nicht im Logsystem), z. B. Raw-Parser-Output und Auto-Advance-Trace.
  - Evidenz: `src/store/runStore.ts:1233-1247`, `1325-1328`

### Sinnvolle Ergaenzungen
- Run-Log:
  - Bei jedem Step-1 Failure-Branch immer einen strukturierten `Issue` erzeugen (nicht nur `issuesCount`).
  - Parser-Modul, Timeout-Wert, Dateiname, Warning-/Error-Anzahl als strukturierte Details.
- Allgemeiner Log:
  - Technische Parser-Ausnahmen (inkl. stack/phase) als zentrale ERROR-Eintraege.
  - Optional Korrelation `source=parseInvoice/updateRunWithParsedData`.

---

## 2) Step 2 - Artikel extrahieren

### IST-Funktion
- Aktiver Pfad: `executeMatcherCrossMatch()` mit Matcher-Modul + Diagnostik.
  - Evidenz: `src/store/runStore.ts:2672-2894`
- Legacy-Pfad weiterhin vorhanden: `executeArticleMatching()`.
  - Evidenz: `src/store/runStore.ts:2193-2270`

### IST-Logabdeckung
- Gute Basislogs fuer Start/Ergebnis/Warnings:
  - Abschluss Step 2: `src/store/runStore.ts:2876-2879`
  - Matcher-Warnings mit Severity-Mapping: `src/store/runStore.ts:2891-2894`
  - Fehlerpfade: `src/store/runStore.ts:2896-2901`
- Kritisch relevante Aktionen (manuelle Preisanpassung) ohne Logeintrag.
  - `setManualPrice`: `src/store/runStore.ts:2273-2304`

### Befunde / Luecken
- Hoch: Mehrere Step-2-Issues werden ohne `affectedLineIds` erstellt, obwohl UI darauf basiert.
  - `price-mismatch`: `src/store/runStore.ts:2804-2820`
  - `inactive-article`: `src/store/runStore.ts:2832-2848`
  - no-master blocking issue: `src/store/runStore.ts:2687-2700`
  - Legacy `buildArticleMatchIssues`: `src/store/runStore.ts:305-323`
- Mittel: Block-Guard 2->3 prueft `price-mismatch` nur bei `severity=error`, Step-2 erzeugt aber `price-mismatch` als `warning`.
  - Guard: `src/store/runStore.ts:1395-1400`
  - Issue-Erzeugung: `src/store/runStore.ts:2807`

### Sinnvolle Ergaenzungen
- Run-Log:
  - Manuelle Preisuebernahme inkl. alt/neu, lineId, Nutzerhinweis.
  - Guard-Entscheidung (blockiert/nicht blockiert) mit regelklarer Begruendung.
- Allgemeiner Log:
  - Fehlende Stammdaten, Matcher-Registry-Fehler, CrossMatch-Ausnahme immer als ERROR.
  - Modul-ID + Konfiguration in den Details (fuer reproduzierbare Analyse).

---

## 3) Step 3 - Seriennummer anfuegen

### IST-Funktion
- Neuer Hauptpfad: `preFilteredSerials` + Smart-Validation + EAN-Zuordnung.
  - Evidenz: `src/store/runStore.ts:2921-3034`
- Legacy-Fallback: matcher-basierte `serialExtract`.
  - Evidenz: `src/store/runStore.ts:3037-3125`

### IST-Logabdeckung
- Run-Log fuer Step-3 Summary vorhanden.
  - `SerialFinder ... Checksum ...`: `src/store/runStore.ts:3030-3033`
- Upload-PreFilter loggt ohne `runId` (nur allgemeines Log, kein sicherer Run-Bezug).
  - Evidenz: `src/store/runStore.ts:641-647`

### Befunde / Luecken
- Hoch: Im aktiven neuen Pfad fehlt `setStepDiagnostics(3, ...)` komplett.
  - Neuer Pfad: `src/store/runStore.ts:2921-3034`
  - Diagnostics nur im Legacy-Pfad: `src/store/runStore.ts:3108-3120`
- Hoch: `serial-mismatch` im neuen Pfad ohne `affectedLineIds`.
  - Evidenz: `src/store/runStore.ts:2980-2998`
- Mittel: Auch beim Hard-Fail (`step3Status='failed'`) wird nur `logService.info(...)` verwendet.
  - Evidenz: `src/store/runStore.ts:2973-2975`, `3030-3033`

### Sinnvolle Ergaenzungen
- Run-Log:
  - Hard-Fail als ERROR, Soft-Fail als WARN.
  - Bei Mismatch: required/assigned, betroffene Positionen, strict-Flag.
- Allgemeiner Log:
  - Serial-PreFilter-Import mit Datei, Zeilenzahl, Regex-Quote plus runId (falls Run aktiv).
  - Reload-/Rehydrierungswarnung, wenn serialList vorhanden aber Step-3 Input leer.

---

## 4) Step 5 - Export

### IST-Funktion
- Kein eigener Store-Executor fuer Step 5 vorhanden; Export ist primar UI-getrieben (`ExportPanel`).
  - Evidenz: `src/components/run-detail/ExportPanel.tsx:15-233`
- Readiness wird lokal aus offenen ERROR-Issues + fehlenden Lagerorten berechnet.
  - Evidenz: `src/components/run-detail/ExportPanel.tsx:33-37`

### IST-Logabdeckung
- Nahezu keine Step-5 Run-Logs:
  - Export-Download schreibt nur `exportConfigStore.lastDiagnostics` (kein `logService`).
  - Evidenz: `src/components/run-detail/ExportPanel.tsx:101-107`, `src/store/exportConfigStore.ts:108-111`
- `run.stats.exportReady` wird initialisiert, aber praktisch nicht gesetzt.
  - Init: `src/store/runStore.ts:747`, `834`
  - Nutzung in UI: `src/pages/RunDetail.tsx:579-583`

### Befunde / Luecken
- Hoch: Step-5 Probleme (z. B. fehlender Lagerort) werden nicht als Issues erzeugt, obwohl Typ vorhanden ist.
  - IssueType existiert: `src/types/index.ts:11`
  - Runtime-Erzeugung fehlt (nur Mock): `src/data/mockData.ts:453-461`
- Hoch: Fehlercenter kann dadurch Step-5 fachlich kaum abbilden, obwohl Filter "Schritt 5" angeboten wird.
  - Filter-UI: `src/components/run-detail/IssuesCenter.tsx:551-562`
- Mittel: Step 5 ist als "nicht retryable" markiert, aber es fehlt ein expliziter Export-Step-Lifecycle im Run-Log.
  - Evidenz: `src/store/runStore.ts:1799-1803`

### Sinnvolle Ergaenzungen
- Run-Log:
  - `Export gestartet`, `Export erfolgreich`, `Export blockiert` (Grundliste), `Export fehlgeschlagen`.
  - Dateiname, Zeilenanzahl, blockierende Kriterien im Detail.
- Allgemeiner Log:
  - XML-Generierung/Download-Fehler zentral als ERROR.
  - Export-Konfigurations-Hash/Profil in DEBUG/INFO fuer forensische Reproduzierbarkeit.

---

## 5) Querfazit zu Steps 1, 2, 3, 5

Starke Seite:
- Grundlegende Step-Orchestrierung und Auto-Advance sind sauber geloggt (v. a. in `advanceToNextStep`).
  - Evidenz: `src/store/runStore.ts:1433-1655`

Hauptluecken:
1. Uneinheitliche Issue-Qualitaet (`affectedLineIds` oft fehlend) -> direkte Folgeschaeden im Fehlercenter.
2. Step-5 Logging und Step-5-Issue-Modell faktisch unvollstaendig.
3. Manuelle Eingriffe (Preis/Order/Issue-Aktionen) kaum oder nicht geloggt.
4. `console.*` bleibt in zentralen Pfaden hoch (z. B. `runStore` und `matchingEngine`).
   - Zaehlung: `runStore` `logService`=79 vs `console`=53, `matchingEngine` `console`=5 und `logService`=0.

---

## Teil 2 - Auswertung Fehlercenter (IssuesCenter)

## 1) IST-Funktionsumfang
- Gruppierung nach Schritt, Filter (Schritt/Severity/Typ), CSV-Export, Isolieren von Zeilen, Mail-Eskalation, Resolve.
  - Evidenz: `src/components/run-detail/IssuesCenter.tsx:402-514`, `551-596`
- Darstellung betroffener Positionen basiert voll auf `affectedLineIds`.
  - Evidenz: `src/components/run-detail/IssuesCenter.tsx:175-182`, `229-240`, `417-423`

## 2) Hauptbefunde

### F1 (hoch): Fehlercenter ist von `affectedLineIds` abhaengig, aber viele Issues liefern diese nicht
- Folge: leere Body-Darstellung, kein "Zeilen isolieren", schwache Mail/Clipboard-Nutzbarkeit.
- Ursachen in Store-Issue-Building (Steps 2/3/4 Gate) siehe Teil 1.

### F2 (hoch): Label-/Hint-Mapping deckt nicht alle IssueTypes ab
- `IssueType` enthaelt u. a. `pool-empty-mismatch`, `supplier-missing`.
  - Evidenz: `src/types/index.ts:31-33`
- `issueTypeLabels` im Fehlercenter enthaelt diese nicht.
  - Evidenz: `src/components/run-detail/IssuesCenter.tsx:58-82`
- Mail-Formatter-Mapping ebenfalls unvollstaendig.
  - Evidenz: `src/lib/issueLineFormatter.ts:11-32`
- Folge: Roh-Typnamen in UI/Mail statt fachlicher Bezeichnung.

### F3 (mittel): Resolve/Eskalation veraendern State, aber ohne Log/Audit-Spur
- Fehlercenter ruft Store-Aktionen korrekt auf.
  - Evidenz: `src/components/run-detail/IssuesCenter.tsx:438-459`
- Store-Aktionen schreiben jedoch keine Log/Audit-Eintraege.
  - Evidenz: `src/store/runStore.ts:1851-1875`, `2180-2189`

### F4 (mittel): Schritt-5-Filter existiert, aber Runtime liefert kaum Schritt-5-Issues
- Folge: Erwartung/Anzeige im Fehlercenter und reale Datenlage laufen auseinander.

### F5 (mittel): Scoped-Issue-Logik nimmt auch `!runId` mit
- Evidenz: `src/components/run-detail/IssuesCenter.tsx:384-386`
- Risiko: run-uebergreifende Alt-/Global-Issues koennen im aktiven Run erscheinen.

### F6 (niedrig): CSV-Export ist funktional, aber Escaping ist minimal
- Aktuell nur einfache Quotes fuer message/details.
  - Evidenz: `src/components/run-detail/IssuesCenter.tsx:486-500`
- Risiko bei eingebetteten Quotes/Zeilenumbruechen in Detailtexten.

## 3) Gesamturteil Fehlercenter

Der Fehlercenter ist funktional gut aufgebaut, aber die Datenqualitaet aus den Step-Pipelines ist uneinheitlich.
Die zentrale technische Kette ist:
- Step erzeugt Issue -> Issue hat `affectedLineIds` + klaren Typ -> Fehlercenter kann voll ausspielen.

Genau an dieser Kette gibt es aktuell Brueche, vor allem in Steps 2/3/5.

---

## Priorisierter Vervollstaendigungsplan (ohne Codeaenderung in diesem Bericht)

1. Datenqualitaet der Issues vereinheitlichen (Pflicht: `relatedLineIds` + `affectedLineIds` bei line-bezogenen Issues).
2. Schritt-5 Modell schliessen: echte Step-5 Issues fuer Export-Blocker + konsistente Step-5 Logs.
3. Fehlercenter-Type-Mappings komplettieren (`pool-empty-mismatch`, `supplier-missing`, weitere neue Typen).
4. Resolve/Eskalation in Run-Log + Audit-Log spiegeln (wer/was/wann/warum).
5. Severity-Harmonisierung (z. B. Step-3 Hard-Fail nicht als INFO).
6. Allgemeines Log staerken fuer technische Fehlerpfade (`console`->`logService` in Kernmodulen).

---

## Abschluss

IST-Stand: Die App funktioniert in den Steps 1/2/3/5 grundsaetzlich, aber fuer durchgaengige Diagnostik und forensische Nachvollziehbarkeit ist die Log-/Issue-Abdeckung noch nicht vollstaendig.

Der groesste Hebel ist nicht die UI des Fehlercenters selbst, sondern die Vollstaendigkeit und Konsistenz der erzeugten Issue- und Logdaten pro Step.
