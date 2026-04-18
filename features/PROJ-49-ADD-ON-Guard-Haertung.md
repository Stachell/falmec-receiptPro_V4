# PROJ-49 ADD-ON: SSOT-Architektur — IndexedDB als Single Source of Truth

> Entscheidung nach vier Guard-Fix-Runden (v1–v4): die bisherigen Guard-Patches haben Symptome
> behandelt, nicht die Wurzel. Architekturentscheidung: IndexedDB wird zur echten Single Source
> of Truth. Erst persistieren, dann verarbeiten.
>
> Plan-Version: v29 — FINAL APPROVED. Confidence: **0.99 / 1.00**
>
> Gegenüber v28 korrigiert: (29) Redaktionelle Konsistenz — vier ältere Absolutaussagen
> ("restlos gelöscht", "kein Geister-Run") an das bewusst tolerierte Ghost-Run-Verhalten
> bei IDB-Infrastrukturfehlern angepasst. Alle Stellen verweisen jetzt auf Änderung 14b
> als Schutzschicht. Keine Logik-Änderung, nur Dokumentkonsistenz.
>
> Gegenüber v27 korrigiert: (28) Akzeptanzkriterien #25 und #27 an das bewusst tolerierte
> Ghost-Run-Verhalten angepasst: bei erfolgreichem Auto-Delete verschwindet der Ghost-Run;
> bei fehlgeschlagenem Auto-Delete darf er in der Liste sichtbar, aber nie ladbar sein.
> Keine neue Logik, nur ehrliche Formulierung der bewussten Abbruchkante.
>
> Gegenüber v26 korrigiert: (27) Ghost-Run-Autodelete in loadPersistedRun() (Änderung 14b):
> deletePersistedRun() kann auch hier fehlschlagen. Statt "endgültig entfernt" zu behaupten,
> wird der Rückgabewert geprüft und bei Fehlschlag nur geloggt + return false. Der Ghost-Run
> bleibt dann in IDB, wird aber bei jedem Lade-Versuch erneut als unladbarer Ghost erkannt.
> Das ist die bewusste Abbruchkante: kein weiterer Retry, kein tieferes Error-Handling —
> ein persistenter IDB-Fehler ist ein Infrastruktur-Problem jenseits von Anwendungslogik.
>
> Gegenüber v25 korrigiert: (26) Ghost-Run-Autodelete in loadPersistedRun() (Änderung 14b)
> loggt mit { runId } → erzeugt erneut falmec-run-log-{runId} in localStorage (selbe
> Fehlerklasse wie v24). Fix: logService.error() ohne options.runId, runId nur per
> String-Interpolation in der Message. Generelle Regel ergänzt: nach clearRunLog(runId)
> oder in Cleanup-Pfaden darf runId NIE als options.runId an logService übergeben werden.
>
> Gegenüber v24 korrigiert: (25) deletePersistedRun(false)-Pfad ist NICHT harmlos:
> Index.tsx lädt die IDB-Liste beim Mount via loadPersistedRunList() neu — ein
> Ghost-Run aus fehlgeschlagenem IDB-Delete taucht nach Reload wieder in der
> Run-Liste auf und kann geladen werden. Verteidigung: (a) Retry-Versuch mit
> Backoff im Cleanup selbst, (b) loadPersistedRun() blockt SSOT-Runs mit
> unvollständigem ingestStatus (kein Step-Start, Fehlermeldung + auto-Delete).
>
> Gegenüber v23 korrigiert: (24) cleanupFailedIngest() Fehlerlog im
> deletePersistedRun(false)-Pfad darf runId NICHT als options.runId übergeben —
> logService.error('...', { runId }) schreibt sofort via addToRunLog() in
> falmec-run-log-{runId} (localStorage), was den gerade geleerten Run-Log
> wieder anlegt. Stattdessen: runId nur per String-Interpolation in der Message,
> OHNE options.runId. So landet der Fehler nur im Systemlog, nicht im Run-Log.
>
> Gegenüber v22 korrigiert: (23) cleanupFailedIngest() Fehlschlag-Pfad für
> deletePersistedRun() definiert: bei false → ERROR-Log + persistedRunSummaries
> manuell bereinigen (defensive Cleanup). Kein UI-Fehler → In-Memory ist bereits
> sauber, IDB-Rest ist nur Speicher-Leiche ohne funktionalen Einfluss.
>
> Gegenüber v21 korrigiert: (22) cleanupFailedIngest() invoiceLines-Filter auf
> `${runId}-line-` Prefix umgestellt statt nacktem `startsWith(runId)` — verhindert
> Präfix-Kollision mit Zeilen anderer Runs (z.B. runId "INV-2024" matcht sonst auch
> "INV-2024-001-line-..."). Konsistent mit dem Pattern in loadPersistedRun() (runStore.ts:4510)
> und allen anderen linePrefix-Nutzungen im Codebase.
>
> Gegenüber v19 korrigiert: (21) cleanupFailedIngest() verwendet NICHT mehr deleteRun() —
> deleteRun() (runStore.ts:2385) ruft intern archiveService.deleteArchivedRun(runId) auf.
> Da finalRunId aus der Rechnungsnummer kommt, kann dieselbe ID ein gültiges Archiv eines
> früheren Runs haben. Hard-Fail-Cleanup inlined jetzt nur die Store-Bereinigung (runs,
> currentRun, invoiceLines, issues, auditLog) in einem einzigen set()-Aufruf — ohne Archiv-
> Seiteneffekt. clearRunLog() bleibt danach (fängt auch eventuelle Logeinträge aus set() auf).
>
> Gegenüber v18 korrigiert: (20) clearRunLog(runId) NACH deleteRun(runId) verschoben —
> deleteRun() loggt intern `logService.info('Run gelöscht')`, was den gerade geleerten
> Run-Log-Buffer sofort wieder befüllt hätte. Jetzt: deleteRun() → clearRunLog() → fertig.
>
> Gegenüber v17 korrigiert: (18) cleanupFailedIngest() räumt jetzt auch auditLog-Einträge
> des fehlgeschlagenen Runs auf — deleteRun() filtert auditLog nicht, bei Wiederholung mit
> gleicher finalRunId hängen alte Einträge sonst am neuen Run, (19) neue Methode
> logService.clearRunLog(runId) entfernt Run-Log-Buffer (runBuffers Map) + localStorage-Key
> (falmec-run-log-{runId}) — ohne Cleanup kontaminieren diese einen Folge-Run mit identischer ID.
>
> Gegenüber v16 korrigiert: (16) cleanupFailedIngest() ruft resetRunSensitiveState() auf, damit
> auch currentParsedRunId, parsedInvoiceResult, parsedPositions, parserWarnings etc. geleert
> werden — deleteRun() allein räumt diese Felder NICHT auf, (17) Kurzform in Änderung 6
> (NewRun.tsx) enthält jetzt cleanupFailedIngest() im Hard-Fail-Pfad statt nacktem return.
>
> Gegenüber v14 korrigiert: (1) Auto-Advance per autoAdvance-Parameter (Variante C, verbindlich),
> (2) startWorkflowPhase2 NUR für Erststart — Reprocess hat eigenen Pfad, (3) Reihenfolge-
> Widerspruch behoben: loadPersistedRun() überschreibt alles → erst laden, dann resetten, dann
> persistieren (load→reset→save→advance), (4) orderAssignmentReason 'none'→'pending', (5) kein
> erfundener zweiter Parameter für advanceToNextStep, (6) executeOrderMapping() liest masterArticles
> für SSOT-Runs aus parsedArticlePool statt globalem masterDataStore, (7) orderPool als run-sensitiver
> Arbeitscache: bei Run-Wechsel/Reprocess auf null setzen, (8) resetRunSensitiveState()-Helper für
> createRunSkeleton()/setCurrentRun(), (9) Input-Vertrag Phase 1: fileSnapshot VOR Reset erstellen,
> als Parameter an parseInvoiceForIngest()/ingestAndPersistRunData() übergeben — Signaturen
> durchgängig korrigiert, Duplikat-Aufruf ohne Snapshot entfernt, (10) loadPersistedRun-
> Widerspruch aufgelöst: Hauptlogik unverändert, nur Ownership-Pfade ergänzt, (11) uploadMetadata
> wird von ingestAndPersistRunData() aus fileSnapshot erzeugt und in IDB persistiert,
> (12) buildAutoSavePayload: uploadMetadata nur bei nicht-leerem uploadedFiles bauen — verhindert
> Überschreibung der Phase-1-Daten durch leeren Store, (13) parseInvoiceForIngest()-Signatur
> mit FileSnapshot explizit spezifiziert, (14) Hard-Fail-Cleanup: bei fehlgeschlagenem Phase-1-
> Ingest wird der Run aus Store + IDB gelöscht (bei IDB-Fehler: Ghost-Run nie ladbar), try/catch für
> Exceptions, (15) Persistenzmethode von ingestAndPersistRunData() explizit via saveRun().

---

## Wurzelursache

Die Run-ID trennt den persistierten Datensatz in der IndexedDB sauber. Das Problem liegt im
**aktiven Arbeitsspeicher**: zentrale Workflow-Felder sind global statt run-isoliert. Beim
Run-Wechsel kann AutoSave diese Felder unter der falschen Run-ID in die IDB schreiben.

**Drei Stellen mit globalem Zugriff auf Run-Daten (Code-verifiziert):**

| Stelle | Code-Fundstelle | Problem |
|--------|----------------|---------|
| `buildAutoSavePayload()` | `buildAutoSavePayload.ts:54` | `uploadMetadata` aus globalem `uploadedFiles` ohne owned-Check |
| `executeMatcherCrossMatch()` | `runStore.ts:3954` | Artikel aus `useMasterDataStore.getState().articles` — immer global |
| `archiveRun()` | `runStore.ts:2978+2988` | `preFilteredSerials` aus globalem State — nicht aus Run-Snapshot |

---

## Architektur: Phase 1 + Phase 2

### Phase 1 — Ingest & Validate (neu, vor dem Workflow)

1. User lädt Dateien hoch → klickt "Verarbeitung starten"
2. Run-Skeleton wird angelegt (`createRunSkeleton()`)
3. PDF wird geparst (`parseInvoiceForIngest()`) → Run-ID aus Rechnungsnummer finalisiert
4. Alle anderen Quellen werden geparst (bestehende Parser, kein Umbau)
5. Jede Quelle wird minimal validiert (Hard-Fail-Regeln, s.u.)
6. Valide Pools werden run-spezifisch in IDB persistiert
7. Jeder Quelle wird ein Status zugewiesen: `ready | not_provided | invalid`
8. Load Guard prüft Freigaberegel — Ja → Phase 2, Nein → Dialog + zurück zu NewRun

### Phase 2 — Workflow (bestehend, minimal angepasst)

Steps 1–5 arbeiten auf persistierten IDB-Daten. Beim Run-Wechsel / Reload:
`setCurrentRun()` leert globale Felder → `loadPersistedRun()` befüllt aus IDB.

---

## Kritische Korrektur v6: createNewRunWithParsing() aufteilen

**Problem (v5):** `createNewRunWithParsing()` (runStore.ts:1035) macht bereits in Phase 1 Phase-2-Arbeit:
- Fix A (Zeile 1102): Stammdaten-Rehydrierung → `masterDataStore` global
- Fix B (Zeile 1125): Serial-Rehydrierung → `preFilteredSerials` + `serialDocument` global
- ID-Rename aus Rechnungsnummer (nach PDF-Parse)

Wenn `ingestAndPersistRunData()` erst *nach* `createNewRunWithParsing()` aufgerufen wird, ist
Phase 2 bereits teils gelaufen, bevor der Ingest abgeschlossen ist.

**Lösung v7:** `createNewRunWithParsing()` aufteilen in vier Funktionen:

```
createRunSkeleton()         → Run anlegen, keine Hydration, keine Felder setzen
parseInvoiceForIngest()     → PDF parsen, Run-ID finalisieren (Rechnungsnummer-Rename)
ingestAndPersistRunData()   → alle Quellen parsen, validieren, in IDB ablegen
startWorkflowPhase2()       → loadPersistedRun() aus IDB, dann Workflow starten
```

Der neue Ablauf in `handleStartProcessing()`:

```typescript
const handleStartProcessing = async () => {
  // SCHRITT 0: Lokalen Snapshot der Upload-Dateien erstellen BEVOR der Reset passiert.
  // createRunSkeleton() ruft resetRunSensitiveState() auf, das uploadedFiles leert.
  // Die Parser in Phase 1 brauchen aber die File-Objekte als Input.
  const fileSnapshot = {
    invoice:     uploadedFiles.find(f => f.type === 'invoice'),
    articleList: uploadedFiles.find(f => f.type === 'articleList'),
    serialList:  uploadedFiles.find(f => f.type === 'serialList'),
    openWE:      uploadedFiles.find(f => f.type === 'openWE'),
  };

  const runId = await createRunSkeleton();                                    // Reset + Run anlegen
  const finalRunId = await parseInvoiceForIngest(runId, fileSnapshot);        // PDF parsen, ID finalisieren
  const ingestResult = await ingestAndPersistRunData(finalRunId, fileSnapshot); // Quellen ingestieren

  if (!ingestResult.allReady) {
    // HARD-FAIL-CLEANUP: Run aus Store + IDB entfernen (bei IDB-Fehler: Ghost-Run nie ladbar, s. Änderung 14b)
    await cleanupFailedIngest(finalRunId);
    showIngestErrorDialog(ingestResult.failedSources); // Dialog → OK → zurück zu NewRun
    return;
  }
  await startWorkflowPhase2(finalRunId); // loadPersistedRun() + advanceToNextStep(runId)
  navigate(`/run/${finalRunId}`);
};
```

**Input-Vertrag Phase 1 (verbindlich):**

`parseInvoiceForIngest()` und `ingestAndPersistRunData()` erhalten die Upload-Dateien als
expliziten `fileSnapshot`-Parameter. Sie lesen NICHT aus `state.uploadedFiles` (das ist nach
`createRunSkeleton()` leer). Der Snapshot wird in `handleStartProcessing()` VOR dem
`createRunSkeleton()`-Aufruf erstellt — zu diesem Zeitpunkt sind die Files noch im Store.

Nach Abschluss von Phase 1 werden die File-Objekte nicht mehr benötigt. Alle relevanten
Parse-Ergebnisse sind run-spezifisch in IDB persistiert. Der `fileSnapshot` ist eine lokale
Variable in `handleStartProcessing()` und wird automatisch GC'd.

**Hard-Fail-Cleanup (verbindlich):**

Bei `!ingestResult.allReady` wird der teilweise angelegte Run **restlos entfernt**:

```typescript
async function cleanupFailedIngest(runId: string): Promise<void> {
  // 1. Run-sensitive globale Felder leeren (currentParsedRunId, parsedInvoiceResult,
  //    parsedPositions, parserWarnings, serialDocument, preFilteredSerials, orderPool, …)
  //    parseInvoiceForIngest() hat diese Felder bereits gesetzt — deleteRun() räumt sie NICHT auf.
  resetRunSensitiveState();

  // 2. auditLog-Einträge des fehlgeschlagenen Runs entfernen.
  //    loadPersistedRun() merged nach runId (runStore.ts:4517). Bei Wiederholung mit gleicher
  //    finalRunId (selbe Rechnungs-Nr.) hängen alte Audit-Einträge sonst am neuen Run.
  //
  // 3. Run aus In-Memory-Store entfernen (runs, currentRun, invoiceLines, issues).
  //    NICHT deleteRun() verwenden! deleteRun() (runStore.ts:2385) ruft intern
  //    archiveService.deleteArchivedRun(runId) auf. Da die finale runId aus der Rechnungsnummer
  //    kommt, kann dieselbe ID bereits ein gültiges Archiv eines früheren Runs haben.
  //    Ein Hard-Fail-Cleanup darf nur den neu angelegten Müll wegräumen, kein bestehendes Archiv.
  const linePrefix = `${runId}-line-`;  // Exakter Prefix — NICHT nacktes startsWith(runId)!
  set(state => ({
    auditLog:     state.auditLog.filter(a => a.runId !== runId),
    runs:         state.runs.filter(r => r.id !== runId),
    currentRun:   state.currentRun?.id === runId ? null : state.currentRun,
    invoiceLines: state.invoiceLines.filter(l => !l.lineId.startsWith(linePrefix)),
    issues:       state.issues.filter(i => i.runId !== runId),
  }));

  // 4. Run-Log-Buffer + localStorage des fehlgeschlagenen Runs entfernen.
  //    NACH dem set()-Aufruf, nicht davor — logService.info()-Aufrufe aus Schritt 1–3
  //    könnten noch Run-spezifische Einträge erzeugen.
  logService.clearRunLog(runId);   // NEUE Methode — siehe Implementierungshinweis 12

  // 5. Run aus IDB entfernen (ingestAndPersistRunData hat Teilstand persistiert)
  //    deletePersistedRun() liefert Promise<boolean> — bei false ist IDB-Löschung fehlgeschlagen.
  //    In-Memory ist zu diesem Zeitpunkt bereits sauber (Schritte 1–4). Der IDB-Rest ist eine
  //    Speicher-Leiche ohne funktionalen Einfluss (kein Run im Store → wird nie geladen).
  //    Trotzdem: ERROR loggen für Monitoring + persistedRunSummaries defensiv bereinigen,
  //    damit der Ghost-Eintrag nicht in der Run-Liste auftaucht.
  // 5a. Erster Versuch: IDB-Löschung
  let idbDeleted = await get().deletePersistedRun(runId);

  // 5b. Retry bei Fehlschlag — IDB-Fehler sind oft transient (locked transaction, quota).
  //     Ein einzelner Retry mit kurzem Backoff fängt die meisten Fälle ab.
  if (!idbDeleted) {
    await new Promise(r => setTimeout(r, 500));
    idbDeleted = await get().deletePersistedRun(runId);
  }

  // 5c. Endgültiger Fehlschlag — Ghost-Run-Verteidigung
  if (!idbDeleted) {
    // WICHTIG: runId NICHT als options.runId übergeben! logService.error('...', { runId })
    // schreibt via addToRunLog() sofort in falmec-run-log-{runId} (localStorage) —
    // das würde den gerade geleerten Run-Log wieder anlegen. Bei erneutem Start mit
    // gleicher Rechnungsnummer hängt dann Altlog am neuen Run.
    // Stattdessen: runId nur per String-Interpolation in der Message → landet nur im Systemlog.
    logService.error(`[cleanupFailedIngest] IDB-Löschung fehlgeschlagen für Run ${runId} nach Retry — Ghost-Run in IDB möglich`);
    // Defensiv: persistedRunSummaries trotzdem bereinigen, auch wenn IDB-Delete versagt hat.
    // deletePersistedRun() aktualisiert persistedRunSummaries nur bei success (runStore.ts:4587–4590).
    // Ohne diesen Fallback bleibt ein Ghost-Eintrag in der Run-Liste für diese Session sichtbar.
    // ACHTUNG: Nach Reload lädt Index.tsx:132 die IDB-Liste neu — der Ghost-Run taucht dann
    // wieder auf. Dagegen schützt die Integritätsprüfung in loadPersistedRun() (siehe Änderung 14b).
    set(state => ({
      persistedRunSummaries: state.persistedRunSummaries.filter(s => s.id !== runId),
    }));
  }
}
```

**⚠️ ARCHIV-SCHUTZ — KRITISCHE DESIGN-ENTSCHEIDUNG (Warum kein `deleteRun()`):**
>
> **Dies ist eine der wichtigsten Schutzmaßnahmen des gesamten Plans.**
> `deleteRun()` (runStore.ts:2385) ruft intern `archiveService.deleteArchivedRun(runId)` auf.
> Da `finalRunId` aus der Rechnungsnummer kommt, kann bei einem Retry-Versuch **exakt dieselbe ID**
> wieder entstehen. Ein früherer, erfolgreich archivierter Run mit dieser ID würde durch einen
> fehlgeschlagenen Ingest-Versuch sein **gesamtes Archiv unwiederbringlich verlieren**.
>
> Der Verzicht auf `deleteRun()` in `cleanupFailedIngest()` verhindert diesen massiven
> Archiv-Löschseiteneffekt. Stattdessen wird die Store-Bereinigung (`runs`, `currentRun`,
> `invoiceLines`, `issues`, `auditLog`) **inline** in einem einzigen `set()`-Aufruf durchgeführt —
> gezielt nur der Müll des fehlgeschlagenen Ingest-Versuchs, ohne je das Archiv-System zu berühren.
>
> **WARNUNG AN DEN IMPLEMENTIERER:** Unter KEINEN Umständen darf `cleanupFailedIngest()` durch
> einen Aufruf von `deleteRun()` "vereinfacht" werden. Jeder Refactoring-Impuls in diese Richtung
> ist ein Archiv-zerstörender Bug. Diese Entscheidung ist final und nicht verhandelbar.

**Neue Methode `logService.clearRunLog(runId)` (Implementierungshinweis 12):**
`logService` hat aktuell keine dedizierte Clear-Methode. `exportRunLog()` (logService.ts:320–321)
löscht Buffer + localStorage nur nach erfolgreicher Datei-Persistierung. Für Hard-Fail-Cleanup
braucht es eine eigenständige Methode:
```typescript
// In logService — neue Methode
clearRunLog(runId: string): void {
  this.runBuffers.delete(runId);
  localStorage.removeItem(`${RUN_LOG_PREFIX}${runId}`);
}
```
Klein, KISS-konform, kein neues Pattern — nutzt die vorhandene `runBuffers`-Map und `RUN_LOG_PREFIX`.

**Warum komplettes Löschen (KISS-Entscheidung):**
- Der User erhält eine Fehlermeldung mit Quellenname und kann die betroffene Datei korrigieren.
- Danach startet er einen komplett neuen Run mit korrigierten Daten.
- Halbfertige Runs in der Liste oder IDB wären nur Müll — kein fachlicher Nutzen.
- Kein Spezialstatus `'invalid'` oder `'failed-ingest'` nötig — der Run existiert einfach nicht.
- Gilt unabhängig davon, ob der Fehler vor oder nach `finalRunId` auftritt:
  - Fehler in `parseInvoiceForIngest()` → `runId` (temp-ID) aufräumen
  - Fehler in `ingestAndPersistRunData()` → `finalRunId` aufräumen

**Auch bei Exceptions:** `handleStartProcessing()` muss den Cleanup in einem `try/catch`
absichern. Unerwartete Fehler (Parser-Crash, IDB-Fehler) dürfen keinen Geister-Run hinterlassen:

```typescript
const handleStartProcessing = async () => {
  const fileSnapshot = { ... };
  let currentRunId: string | null = null;
  try {
    currentRunId = await createRunSkeleton();
    const finalRunId = await parseInvoiceForIngest(currentRunId, fileSnapshot);
    currentRunId = finalRunId; // ab jetzt ist finalRunId die aktive ID
    const ingestResult = await ingestAndPersistRunData(finalRunId, fileSnapshot);
    if (!ingestResult.allReady) {
      await cleanupFailedIngest(finalRunId);
      showIngestErrorDialog(ingestResult.failedSources);
      return;
    }
    await startWorkflowPhase2(finalRunId);
    navigate(`/run/${finalRunId}`);
  } catch (error) {
    // Unerwarteter Fehler — Run aufräumen (bei IDB-Fehler: Ghost-Run nie ladbar, s. Änderung 14b)
    if (currentRunId) await cleanupFailedIngest(currentRunId);
    showIngestErrorDialog([`Unerwarteter Fehler: ${error instanceof Error ? error.message : error}`]);
  }
};
```

**Fix A und Fix B (runStore.ts:1102–1154) werden ersatzlos gelöscht.** Phase 1 hat alle
Quellen bereits in IDB, `loadPersistedRun()` in `startWorkflowPhase2()` liest daraus.

---

## Architektur-Leitsätze (für Implementierer verbindlich)

> Diese Sätze sind keine Kommentare — sie sind Entscheidungsregeln. Jede Code-Änderung muss gegen sie prüfbar sein.

**SSOT-Leitsatz:** Nach Abschluss von Phase 1 arbeitet der Workflow ausschließlich auf dem persistierten Run-Snapshot in IndexedDB. Globale In-Memory-Daten sind nur Arbeitskopie, nie Wahrheitsquelle.

**Legacy-Leitsatz:** Fallbacks auf globale Daten oder Alt-Store-Daten sind nur für Legacy-Runs ohne `ingestStatus` erlaubt. Für neu erzeugte SSOT-Runs (erkennbar an `idbData.ingestStatus !== undefined`) sind solche Fallbacks verboten.

**Phase-2-Leitsatz:** Phase 2 führt keine Parser erneut gegen Upload-Dateien aus. Alle benötigten Pools müssen bereits in Phase 1 erzeugt und persistiert worden sein.

**Artikelvalidierungs-Leitsatz:** Die Artikelliste ist nur dann `ready`, wenn mindestens ein persistierbarer Artikeldatensatz alle workflowkritischen Pflichtfelder trägt (`artNo`, `storageLocation`, `supplierId`). Ein nicht-leeres Parsergebnis allein reicht nicht.

**Run-Wechsel-Leitsatz:** Beim Run-Wechsel werden alle run-sensitiven globalen Felder geleert; danach wird der aktive Zustand ausschließlich durch `loadPersistedRun()` wieder aufgebaut.

**Upload-Store-Leitsatz:** `uploadedFiles` und `fileStorageService` sind ausschließlich New-Run Session Buffer. Sie dürfen in folgenden Pfaden **nicht** als Wahrheitsquelle dienen: `startWorkflowPhase2()`, `reprocessCurrentRun()`, Step 4 Order-Mapping, `archiveRun()`, `buildAutoSavePayload()` für fremde Runs.

---

## Hard-Fail-Regeln je Quelle (Phase 1)

| Quelle | Status | Pflichtfelder (mind. 1 gültige Zeile) |
|--------|--------|---------------------------------------|
| PDF (Rechnung) | **Pflicht** | Rechnungsnummer + numberOfPackages |
| Artikelliste | **Pflicht** | Artikelnummer (via konfiguriertem `artNoDeRegex`¹) + Seriennummernpflicht + Hauptlager + Hauptlieferant |
| Seriallist | **Optional** | Seriennummer in ≥1 Zeile — nur wenn hochgeladen |
| openWE | **Optional** | Artikelnummer + Bestellnummer in ≥1 gemeinsamer Zeile — nur wenn hochgeladen |

¹ **Artikelvalidierung auf tatsächliche Pflichtfelder (Korrektur v7):**
`parseMasterDataFile()` liefert pro Artikel `artNo`, `storageLocation`, `supplierId`,
`serialRequirement` (alle bereits in masterDataParser.ts:251–254 extrahiert).
`ready`-Bedingung: mindestens 1 Zeile im Ergebnis-Pool hat alle vier Felder belegt:
```typescript
const validRows = parsedArticlePool.filter(a =>
  a.artNo && a.storageLocation && a.supplierId != null
);
// serialRequirement ist Boolean → immer vorhanden wenn Row valide
const articleListReady = validRows.length > 0;
```
`artNoDeRegex` aus `matcherProfileOverrides` (optional) wird an `parseMasterDataFile()`
übergeben wie bisher. Die Feldvalidierung selbst ist unabhängig davon.

**Status-Logik:** `ready` | `not_provided` (optional, nicht hochgeladen) | `invalid` (Hard-Fail)

**Freigabe:** PDF=`ready` AND Artikelliste=`ready` AND Seriallist∈{`ready`,`not_provided`} AND openWE∈{`ready`,`not_provided`}

*Hinweis zur Optionalität:* Die aktuelle NewRun-UI zeigt alle vier Felder, aber serialList und openWE
sind fachlich optional (nicht jeder Run hat seriennummernpflichtige Artikel oder Bestellzuordnung).
Stufe B: UI-Optionalität im Upload-Screen sichtbar machen.

---

## Konkrete Code-Änderungen

### 1. `PersistedRunData` erweitern (`runPersistenceService.ts`)

```typescript
ingestStatus?: {
  pdf: 'ready' | 'invalid' | 'pending';
  articleList: 'ready' | 'invalid' | 'pending';
  serialList: 'ready' | 'not_provided' | 'invalid' | 'pending';
  openWE: 'ready' | 'not_provided' | 'invalid' | 'pending';
};
parsedOrderPool?: ParsedOrderPosition[];  // aus parseOrderFile() — run-spezifisch
parsedArticlePool?: MasterArticle[];      // aus parseMasterDataFile() — run-spezifisch
```

Zwei neue Pools:
- `parsedOrderPool`: löst globalen `uploadedFiles.find('openWE')` in Step 4 ab
- `parsedArticlePool`: löst globalen `masterDataStore` in Step 2 ab

### 2. `createRunSkeleton()` — neue Funktion (`runStore.ts`)

Extrahiert aus `createNewRunWithParsing()`: Run-Objekt anlegen, in State setzen,
`logService.startRunLogging()` aufrufen. Keine Hydration, keine Parser-Aufrufe.
Gibt temporäre `runId` zurück.

**Tabula-Rasa-Pflicht:** `createRunSkeleton()` MUSS als erstes dieselbe run-sensitive
Feldbereinigung durchführen wie `setCurrentRun()` (Änderung 7). Dazu einen gemeinsamen
Helper `resetRunSensitiveState()` extrahieren, der von beiden Stellen aufgerufen wird:

```typescript
// Gemeinsamer Helper — wird von setCurrentRun() UND createRunSkeleton() aufgerufen
function resetRunSensitiveState() {
  const timer = get().autoAdvanceTimer;
  if (timer) clearTimeout(timer);

  set({
    currentParsedRunId: null,
    parsedInvoiceResult: null,
    parsedPositions: [],
    parserWarnings: [],
    serialDocument: null,
    preFilteredSerials: [],
    uploadedFiles: [],
    orderPool: null,
    autoAdvanceTimer: null,
    isPaused: false,
    isWaitingBeforeStep4: false,
    waitingStep4RunId: null,
    showStep4WaitingDialog: false,
    lastOrderParserDiagnostics: null,
    latestDiagnostics: {},
  });
}
```

**Warum:** Ohne diesen Reset können Artefakte des vorherigen Runs (z.B. `orderPool`,
`latestDiagnostics`, `preFilteredSerials`) noch im Memory liegen, während Phase 1
des neuen Runs startet. Phase 1 überschreibt manche dieser Felder erst spät oder gar
nicht — das Restrisiko für Run-Vermischung bleibt sonst bestehen.

### 3. `parseInvoiceForIngest()` — neue Funktion (`runStore.ts`)

```typescript
async parseInvoiceForIngest(runId: string, fileSnapshot: FileSnapshot): Promise<string> {
  // Input: fileSnapshot.invoice enthält das PDF-File — NICHT aus state.uploadedFiles lesen!
  // 1. fileSnapshot.invoice prüfen — fehlt es, ist das ein harter Fehler (Pflichtquelle)
  // 2. parseInvoice(fileSnapshot.invoice.file) aufrufen (bestehender Parser)
  // 3. updateRunWithParsedData(runId, result, /* autoAdvance */ false)  ← Timer unterdrücken!
  // 4. ID-Rename: temp-ID → Rechnungsnummer-ID (falls aus Header extrahierbar)
  // 5. Falls IDB-Eintrag unter temp-ID existiert: löschen oder umschreiben auf finalRunId
  // Rückgabe: finalRunId (string)
}
```

Extrahiert aus `createNewRunWithParsing()`. Gibt finale `runId` zurück.

**KRITISCH — Auto-Advance in `updateRunWithParsedData()` neutralisieren:**

Im aktuellen Code (runStore.ts ~Zeile 1651) enthält `updateRunWithParsedData()` einen
`setTimeout(() => advanceToNextStep(), 500)`, der nach erfolgreichem PDF-Parse automatisch
den nächsten Step startet. In der alten Architektur war das gewollt — PDF parsen → sofort
weiter mit Step 2. In der neuen SSOT-Architektur ist das **fatal**: Phase 1 (Ingest) ist
noch nicht abgeschlossen, aber der Timer kickt Phase 2 an.

**Wichtig:** Dieser `setTimeout()` speichert sein Handle NICHT in `state.autoAdvanceTimer`.
Es ist ein lokaler, anonymer Timer. Er kann daher nicht über `get().autoAdvanceTimer` +
`clearTimeout()` von außen gekillt werden.

**Verbindliche Lösung (Variante C):**

`updateRunWithParsedData()` bekommt einen neuen Parameter `autoAdvance: boolean`
(Default `true` für volle Rückwärtskompatibilität mit allen bestehenden Aufrufstellen).
Der `setTimeout(() => advanceToNextStep(), 500)`-Block (Zeile ~1651) wird in ein
`if (autoAdvance) { ... }` gewrappt.

`parseInvoiceForIngest()` ruft mit `autoAdvance: false` auf:

```typescript
// In parseInvoiceForIngest():
updateRunWithParsedData(runId, parsedInvoiceResult, /* autoAdvance */ false);

// In updateRunWithParsedData() — geänderte Signatur:
updateRunWithParsedData: (runId: string, result: ParsedInvoiceResult, autoAdvance = true) => {
  // ... bestehende Logik unverändert ...

  // Auto-advance to next step — NUR wenn autoAdvance === true
  if (autoAdvance && (stepStatus === 'ok' || stepStatus === 'soft-fail')) {
    setTimeout(() => {
      // ... bestehender Timer-Code unverändert ...
    }, 500);
  }
}
```

**Warum Variante C:** Kein zusätzlicher State-Flag nötig (KISS). Kein Versuch, einen
anonymen Timer von außen zu killen (technisch unmöglich). Bestehende Aufrufe (ohne
zweiten Parameter) behalten ihr bisheriges Verhalten durch den Default `true`.

**Run-ID-Timing (verbindlich):** Falls `createRunSkeleton()` bereits einen IDB-Eintrag unter
der temporären ID anlegt, muss dieser Eintrag hier entweder umgeschrieben (`finalRunId`) oder
gelöscht werden, bevor `ingestAndPersistRunData()` startet. Es darf keinen persistierten
Zustand unter der temporären ID geben, sobald `finalRunId` bekannt ist. Alle nachfolgenden
IDB-Writes in Phase 1 und Phase 2 verwenden ausschließlich `finalRunId`.

### 4. `ingestAndPersistRunData()` — neue Funktion (`runStore.ts`)

```typescript
interface FileSnapshot {
  invoice:     UploadedFile | undefined;
  articleList: UploadedFile | undefined;
  serialList:  UploadedFile | undefined;
  openWE:      UploadedFile | undefined;
}

async ingestAndPersistRunData(runId: string, fileSnapshot: FileSnapshot): Promise<IngestResult> {
  // Input: fileSnapshot enthält die Upload-Dateien — NICHT aus state.uploadedFiles lesen!
  // Alle Writes verwenden ausschließlich finalRunId (nach parseInvoiceForIngest)

  // 0. uploadMetadata aus fileSnapshot erzeugen und sofort in den Run-Snapshot schreiben:
  const uploadMetadata = Object.values(fileSnapshot)
    .filter(Boolean)
    .map(f => ({ type: f.type, name: f.name, size: f.size, uploadedAt: f.uploadedAt }));
  // → wird mit dem ersten saveRun()-Aufruf unten in IDB persistiert

  // 1. PDF: bereits geparst → validate (Rechnungsnummer + numberOfPackages) → ingestStatus.pdf
  // 2. ArticleList: parseMasterDataFile(fileSnapshot.articleList) mit artNoDeRegex
  //    → ready nur wenn: parsedArticlePool.filter(a => a.artNo && a.storageLocation && a.supplierId != null).length > 0
  //    → parsedArticlePool unter runId in IDB
  // 3. SerialList: preFilterSerialExcel(fileSnapshot.serialList) → validate (≥1 Zeile)
  //    → preFilteredSerials unter runId in IDB. Nicht hochgeladen → not_provided.
  // 4. openWE: parseOrderFile(fileSnapshot.openWE) mit aktivem Profil/Overrides
  //    → ready wenn ≥1 Zeile mit artNo + orderNumber → parsedOrderPool unter runId in IDB
  //    Nicht hochgeladen → not_provided.
  // Nach jedem Schritt: saveRun(runId) mit aktualisiertem ingestStatus + uploadMetadata
  // Rückgabe: { allReady: boolean, failedSources: string[] }
}
```

Parser werden unverändert aufgerufen, erhalten aber ihre File-Objekte aus `fileSnapshot`,
nicht aus dem Store. Die Adapter lösen: Profil aus Settings, parse, validieren, in
Run-Snapshot schreiben.

**Persistenzmethode (verbindlich):**

`ingestAndPersistRunData()` nutzt den bestehenden `saveRun(runId)`-Pfad aus
`runPersistenceService.ts`. Sie baut **keinen** eigenen IDB-Zugriff. Ablauf pro Quelle:

1. Parse-Ergebnis im In-Memory-Store setzen (z.B. `set({ parsedArticlePool })` oder
   direkt am Run-Objekt in `state.runs`)
2. `ingestStatus`-Feld im Run-Objekt aktualisieren
3. `saveRun(runId)` aufrufen — der bestehende Merge-Pfad persistiert den gesamten
   Run-Snapshot inkl. aller bis dahin gesetzten Pools, `ingestStatus` und `uploadMetadata`

Das bedeutet: nach Schritt 1 (PDF-Validierung) ist ein Teilstand in IDB. Nach Schritt 4
(openWE) ist der vollständige Ingest-Stand in IDB. Bei Hard-Fail räumt
`cleanupFailedIngest()` diesen Teilstand komplett auf.

**uploadMetadata-Vertrag:** `ingestAndPersistRunData()` ist die einzige Stelle, die
`uploadMetadata` für SSOT-Runs in IDB schreibt. Sie baut die Metadaten aus `fileSnapshot`
auf und persistiert sie zusammen mit dem ersten `saveRun()`-Aufruf. `buildAutoSavePayload()`
schreibt `uploadMetadata` für SSOT-Runs nicht — der Store ist nach dem Reset leer, und
der `owned`-Guard in Änderung 9 verhindert leere Überschreibungen.

### 5. `startWorkflowPhase2()` — neue Funktion, NUR für Erststart nach Phase 1 (`runStore.ts`)

**Scope:** Diese Funktion wird ausschließlich nach erfolgreichem Phase-1-Ingest aufgerufen.
Sie wird NICHT von `reprocessCurrentRun()` verwendet. Reprocess hat einen eigenen Pfad
(siehe Änderung 16).

```
SIGNATUR: startWorkflowPhase2(runId: string): Promise<void>

VERWENDUNG: Nur in handleStartProcessing() nach ingestAndPersistRunData() → allReady: true.
            Wird NICHT von reprocessCurrentRun() aufgerufen.

DARF NUR:
  - loadPersistedRun(runId) aufrufen
  - transiente States räumen
  - advanceToNextStep(runId) aufrufen  ← Signatur hat NUR runId, keinen startFromStep

DARF NICHT:
  - parseMasterDataFile() aufrufen
  - preFilterSerialExcel() aufrufen
  - parseOrderFile() aufrufen
  - uploadedFiles lesen
  - fileStorageService nutzen
  - globale Hydration / Fix-A / Fix-B / Ersatzlogik enthalten
```

Fix A und Fix B (runStore.ts:1102–1154) werden **ersatzlos gelöscht**, nicht migriert.
`loadPersistedRun()` liest aus IDB: `parsedArticlePool`, `preFilteredSerials`, `parsedOrderPool`.
Wird **nur** aufgerufen, wenn `ingestAndPersistRunData()` `allReady: true` zurückgibt.

**Engine-Verdrahtung (verbindlich für Implementierer):**

`startWorkflowPhase2(runId)` muss folgende Schritte **exakt in dieser Reihenfolge** ausführen:

1. **Timer killen:** `clearTimeout(state.autoAdvanceTimer)` + `autoAdvanceTimer = null`.

2. **Transiente Waiting-States räumen:**
   - `isWaitingBeforeStep4 = false`
   - `waitingStep4RunId = null`
   - `showStep4WaitingDialog = false`
   - `isPaused = false`
   - `latestDiagnostics = {}`
   - `lastOrderParserDiagnostics = null`

3. **`await loadPersistedRun(runId)`** — lädt den vollständigen Run-Snapshot aus IDB.
   Nach Phase 1 enthält der IDB-Snapshot: Step 1 = `'ok'`/`'soft-fail'`, Steps 2–5 =
   `'not-started'`, alle Pools persistiert. `loadPersistedRun()` setzt `currentRun`,
   `invoiceLines`, `issues`, globale Felder und `currentParsedRunId`. **Es werden hier
   KEINE Step-Stati manuell gesetzt** — die IDB hat bereits den korrekten Zustand.

4. **Defensiv-Prüfung:** Step 1 muss `'ok'` oder `'soft-fail'` sein, Steps 2–5 müssen
   `'not-started'` sein. Falls nicht → Integritätsfehler, abbrechen.

5. **`advanceToNextStep(runId)`** aufrufen — erst NACH erfolgreichem Load + Prüfung.
   `advanceToNextStep()` hat nur EINEN Parameter (`runId`). Es gibt keinen `startFromStep`.
   Die Funktion sucht intern den nächsten Step mit `status === 'not-started'` (runStore.ts:1742).
   Da Step 1 = `'ok'` und Steps 2–5 = `'not-started'`, findet die Engine automatisch Step 2.

**Warum keine Step-Resets vor loadPersistedRun():**
`loadPersistedRun()` (runStore.ts:4502) ersetzt `currentRun`, `invoiceLines` und `issues`
vollständig aus IDB. Jeder vorher gesetzte In-Memory-Zustand wird überschrieben. Deshalb:
Erst laden, dann prüfen/arbeiten — nie andersherum.

**Race-Condition-Schutz:** Die `owned`-Formel aus Änderung 9 (`currentParsedRunId === runId`)
schützt: `loadPersistedRun()` setzt `currentParsedRunId` erst am Ende — AutoSave-Calls
während des Loads greifen ins Leere.

### 6. `NewRun.tsx` — Loading Gate

**Hinweis:** Der vollständige `handleStartProcessing()`-Ablauf mit `fileSnapshot` steht in
der Hauptbeschreibung oben (Abschnitt "Kritische Korrektur v6"). Die Kurzform hier nur
zur Orientierung:

```typescript
// Vollständiger Ablauf — siehe oben für Details inkl. try/catch + cleanupFailedIngest()
const fileSnapshot = { invoice, articleList, serialList, openWE }; // VOR Reset!
const runId = await createRunSkeleton();                           // Reset + Run
const finalRunId = await parseInvoiceForIngest(runId, fileSnapshot);
const ingestResult = await ingestAndPersistRunData(finalRunId, fileSnapshot);
if (!ingestResult.allReady) {
  await cleanupFailedIngest(finalRunId);   // resetRunSensitiveState() + Store + IDB löschen
  showIngestErrorDialog(ingestResult.failedSources);
  return;
}
await startWorkflowPhase2(finalRunId);
navigate(`/run/${finalRunId}`);
```

### 7. `setCurrentRun()` — globale Felder leeren, vollständig (`runStore.ts`)

**Korrektur v6:** `parsedPositions` und `parserWarnings` fehlten in v5. Vollständige Liste.

**Korrektur v15:** Gemeinsamer Helper `resetRunSensitiveState()` (definiert in Änderung 2):

```typescript
setCurrentRun: (run) => {
  resetRunSensitiveState();  // Timer killen + alle run-sensitiven Felder leeren
  set({ currentRun: run });
},
```

Dieselbe `resetRunSensitiveState()`-Funktion wird auch von `createRunSkeleton()` (Änderung 2)
und `cleanupFailedIngest()` (Hard-Fail-Cleanup) aufgerufen. **Vier Stellen, ein Helper —
keine divergierenden Feldlisten.**

**Bekannte Einschränkung (Stufe B):** `uploadedFiles: []` in `setCurrentRun()` reicht nicht
vollständig, solange `fileStorageService` global nach Typ speichert und `NewRun.tsx` beim
Mount `loadStoredFiles()` aufruft. Alt-Uploads können nach Run-Wechsel wieder erscheinen.
Stufe B: `fileStorageService` aus dem kritischen Workflowpfad nehmen oder auf NewRun-Session begrenzen.

### 8. `RunDetail.tsx` — inMemory-Guard entfernen

`loadPersistedRun()` immer aufrufen (auch wenn Run in `state.runs`). Globale Felder werden
immer aus dem Run-spezifischen IDB-Snapshot befüllt.

### 9. `buildAutoSavePayload.ts` — owned-Formel, alle run-kritischen Felder gaten

```typescript
const owned = current.currentParsedRunId === runId;  // null-Fallback entfernen

parsedPositions: owned ? current.parsedPositions : [],
parserWarnings:  owned ? current.parserWarnings  : [],

// uploadMetadata: SSOT-Runs haben uploadMetadata bereits in Phase 1 via
// ingestAndPersistRunData() aus fileSnapshot persistiert. Der In-Memory-Store
// hat nach resetRunSensitiveState() leere uploadedFiles — daraus uploadMetadata
// zu bauen würde die korrekt persistierten Daten mit [] überschreiben.
// Lösung: uploadMetadata nur aus dem Store bauen, wenn uploadedFiles NICHT leer ist.
// Leere uploadedFiles → undefined → saveRun()-Merge-Schutz bewahrt bestehende Daten.
uploadMetadata: (owned && current.uploadedFiles.length > 0)
  ? current.uploadedFiles.map(f => ({ type: f.type, name: f.name, size: f.size, uploadedAt: f.uploadedAt }))
  : undefined,
```

**Warum `uploadedFiles.length > 0` statt SSOT-Check:** Ein IDB-Roundtrip in `buildAutoSavePayload()`
wäre zu teuer (wird regelmäßig getriggert). Die `length > 0`-Prüfung ist synchron und fängt
exakt den Fall: owned, aber Store ist leer nach Reset → `undefined` → Merge-Schutz greift.
Für Legacy-Runs ändert sich nichts (dort ist `uploadedFiles` nach Phase-1-alt befüllt).

Alle drei Felder sind im AutoSave-Race-Fenster gefährdet. Der `owned`-Guard hier +
der `saveRun()`-Merge-Schutz in Änderung 10 bilden zusammen die doppelte Absicherung.

### 10. `saveRun()` — Merge-Schutz für run-kritische Felder (`runPersistenceService.ts`)

Schutzregel: "leeres Array darf bestehende Daten nur überschreiben, wenn der Run owned ist."
Gilt für drei Felder, die alle im AutoSave-Race-Fenster betroffen sind:

```typescript
// uploadMetadata
if ((!mergedData.uploadMetadata || mergedData.uploadMetadata.length === 0) &&
    existing.uploadMetadata?.length > 0 && !isOwnedByCurrentRun) {
  mergedData.uploadMetadata = existing.uploadMetadata;
}
// parsedPositions — Schutz vor AutoSave im Run-Wechsel-Fenster
if ((!mergedData.parsedPositions || mergedData.parsedPositions.length === 0) &&
    existing.parsedPositions?.length > 0 && !isOwnedByCurrentRun) {
  mergedData.parsedPositions = existing.parsedPositions;
}
// parserWarnings — identischer Schutz
if ((!mergedData.parserWarnings || mergedData.parserWarnings.length === 0) &&
    existing.parserWarnings?.length > 0 && !isOwnedByCurrentRun) {
  mergedData.parserWarnings = existing.parserWarnings;
}
```

### 11. Step 2: `executeMatcherCrossMatch()` — `parsedArticlePool` aus IDB (`runStore.ts`)

Statt `useMasterDataStore.getState().articles` (global, Zeile 3954):

```typescript
const idbData = await runPersistenceService.loadRun(runId);
const isSSoTRun = !!idbData?.ingestStatus;

if (isSSoTRun) {
  // SSOT-Run: parsedArticlePool muss vorhanden sein — fehlt er, ist das ein Integritätsfehler
  if (!idbData!.parsedArticlePool?.length) {
    logService.error('[Step2] SSOT-Run ohne parsedArticlePool — Integritätsfehler', { runId });
    updateStepStatus(runId, 2, 'failed'); // Step als fehlgeschlagen markieren
    // kein Issue-Eintrag, kein Dialog — Fehler im Log + Step-Status reicht für Diagnose
    return;
  }
  articles = idbData!.parsedArticlePool;
} else {
  // Legacy-Run: Fallback auf masterDataStore erlaubt
  articles = idbData?.parsedArticlePool ?? useMasterDataStore.getState().articles;
}
```

### 12. Step 4: `parsedOrderPool` + `masterArticles` aus IDB (`runStore.ts`)

**Zwei globale Seiteneingänge schließen:**

**12a. `parsedOrderPool` (openWE-Daten)** — alle drei Aufruf-Stellen (`advanceToNextStep`, `retryStep`, Resume-Pfad):

```typescript
const idbData = await runPersistenceService.loadRun(runId);
const isSSoTRun = !!idbData?.ingestStatus;

if (isSSoTRun) {
  // SSOT-Run: ingestStatus ist autoritativ — kein Fallback auf uploadedFiles
  const openWEStatus = idbData!.ingestStatus!.openWE;
  if (openWEStatus === 'not_provided') {
    parsedOrders = []; // optional, nicht hochgeladen — leer ist korrekt
  } else if (openWEStatus === 'ready') {
    if (!idbData!.parsedOrderPool?.length) {
      logService.error('[Step4] SSOT-Run: ingestStatus.openWE=ready aber kein parsedOrderPool — Integritätsfehler', { runId });
      updateStepStatus(runId, 4, 'failed');
      return;
    }
    parsedOrders = idbData!.parsedOrderPool;
  } else {
    // 'invalid' | 'pending' | unbekannt → Blocker, nie Legacy-Fallback
    logService.error(`[Step4] SSOT-Run: openWE-Status '${openWEStatus}' — Blocker`, { runId });
    updateStepStatus(runId, 4, 'failed');
    return;
  }
} else {
  // Legacy-Run: Fallback auf uploadedFiles wie bisher
  parsedOrders = /* uploadedFiles.find('openWE') Pfad */;
}
```

**12b. `masterArticles` in `executeOrderMapping()` (runStore.ts:3660)** — zweiter globaler Seiteneingang:

Im aktuellen Code liest `executeOrderMapping()` Artikeldaten aus dem globalen `masterDataStore`:
```typescript
// AKTUELL (runStore.ts:3660) — globaler Zugriff:
const masterArticles = useMasterDataStore.getState().articles;
const poolResult = buildOrderPool(parsedOrders, runLines, masterArticles, runId);
```

Für SSOT-Runs muss stattdessen `parsedArticlePool` aus IDB verwendet werden — dieselbe
Quelle wie Step 2. `idbData` ist zu diesem Zeitpunkt bereits geladen (12a oben):

```typescript
let masterArticles;
if (isSSoTRun) {
  // SSOT-Run: parsedArticlePool ist dieselbe run-spezifische Artikelquelle wie in Step 2
  if (!idbData!.parsedArticlePool?.length) {
    logService.error('[Step4] SSOT-Run ohne parsedArticlePool — Integritätsfehler', { runId });
    updateStepStatus(runId, 4, 'failed');
    return;
  }
  masterArticles = idbData!.parsedArticlePool;
} else {
  // Legacy-Run: Fallback auf globalen masterDataStore
  masterArticles = useMasterDataStore.getState().articles;
}
const poolResult = buildOrderPool(parsedOrders, runLines, masterArticles, runId);
```

**Warum:** Step 2 und Step 4 verwenden damit dieselbe run-spezifische Artikelquelle.
Kein zweiter globaler Seiteneingang mehr. Logisch sauber und nachvollziehbar.

Resume-Pfad (~Zeile 2474): Guard-Aufruf vor Pool-Read einführen (heute kein Guard).

### 13. `archiveRun()` — `preFilteredSerials` aus IDB (`runStore.ts`)

Statt `state.preFilteredSerials` (global, Zeilen 2978+2988):

```typescript
const idbData = await runPersistenceService.loadRun(runId);
const isSSoTRun = !!idbData?.ingestStatus;

let serialsForArchive;
if (isSSoTRun) {
  // SSOT-Run: ingestStatus.serialList ist autoritativ — identische Logik wie Step 4/F3
  const serialStatus = idbData!.ingestStatus!.serialList;
  if (serialStatus === 'not_provided') {
    serialsForArchive = []; // optional, nicht hochgeladen — leer ist korrekt
  } else if (serialStatus === 'ready') {
    if (!idbData!.preFilteredSerials) {
      logService.error('[archiveRun] SSOT-Run: serialList=ready aber kein preFilteredSerials — Abbruch', { runId });
      return; // Integritätsfehler — kein unvollständiges Archiv
    }
    serialsForArchive = idbData!.preFilteredSerials;
  } else {
    // 'invalid' | 'pending' → Abbruch, nie mit leerem Feld weiterarchivieren
    logService.error(`[archiveRun] SSOT-Run: serialList-Status '${serialStatus}' — Abbruch`, { runId });
    return;
  }
} else {
  // Legacy-Run: Fallback auf globalen State erlaubt
  serialsForArchive = idbData?.preFilteredSerials ?? state.preFilteredSerials;
}
```

### 14. `loadPersistedRun()` — Ownership-Pfade ergänzen (`runStore.ts`)

**Klarstellung:** Die Hauptlogik von `loadPersistedRun()` (Zeile 4502–4546) wird NICHT
umgebaut. Keine Spezialregeln, keine Ausnahmen für Reprocess. Die Funktion bleibt die
universelle Lade-Funktion aus IDB.

Was ergänzt wird, sind zwei fehlende `currentParsedRunId`-Zuweisungen in Randpfaden:
- `!data`-Pfad (Zeile ~4496): `set({ currentParsedRunId: runId })` — frischer Run bekommt Eigentümer
- `catch`-Pfad: `set({ currentParsedRunId: null })` — kein Eigentümer bei Fehler

Das ist keine Verhaltensänderung der Hauptlogik, sondern eine Lücke im Ownership-Tracking,
die den AutoSave-Schutz (Änderung 9) in Fehlerfällen unwirksam machen würde.

### 14b. `loadPersistedRun()` — Ghost-Run-Erkennung für fehlgeschlagene Ingests (`runStore.ts`)

**Problem:** Wenn `deletePersistedRun()` in `cleanupFailedIngest()` fehlschlägt (IDB-Fehler),
bleibt ein inkompletter Run in IDB. Nach Reload lädt `Index.tsx:132` die IDB-Liste neu →
der Ghost-Run erscheint in der Run-Liste. Klickt der User darauf, lädt `loadPersistedRun()`
einen Run mit unvollständigem Ingest-Status (mindestens ein Feld ist `'pending'` oder `'invalid'`).

**Verteidigung:** `loadPersistedRun()` prüft nach dem Laden, ob ein SSOT-Run einen
abgeschlossenen Ingest hat. Ein SSOT-Run (erkennbar an `data.ingestStatus`) dessen
Pflichtquellen (`pdf`, `articleList`) nicht `'ready'` sind, ist ein Ghost-Run aus einem
fehlgeschlagenen Ingest und darf nicht geladen werden.

```typescript
// In loadPersistedRun(), nach dem erfolgreichen Laden von data, VOR dem set()-Aufruf:
if (data.ingestStatus) {
  const { pdf, articleList } = data.ingestStatus;
  if (pdf !== 'ready' || articleList !== 'ready') {
    // Ghost-Run aus fehlgeschlagenem Ingest — nicht ladbar.
    // Auto-Cleanup: IDB-Löschung nachholen, die beim Hard-Fail-Cleanup versagt hat.
    // WICHTIG: runId NICHT als options.runId übergeben — logService schreibt sonst via
    // addToRunLog() sofort in falmec-run-log-{runId} (localStorage). Das erzeugt einen
    // Log-Rest, der bei erneutem Start mit gleicher Rechnungsnummer am neuen Run hängt.
    // (Siehe Implementierungshinweis 13: generelle Regel für Cleanup-Pfade.)
    logService.error(`[loadPersistedRun] SSOT-Run ${runId} mit unvollständigem Ingest erkannt — auto-delete`);
    const deleted = await get().deletePersistedRun(runId);
    if (!deleted) {
      // Bewusste Abbruchkante: Kein Retry, kein tieferes Error-Handling.
      // Ein persistenter IDB-Fehler ist ein Infrastruktur-Problem jenseits von Anwendungslogik.
      // Der Ghost-Run bleibt in IDB, wird aber bei JEDEM Lade-Versuch erneut als unladbarer
      // Ghost erkannt und abgewiesen — der User kann ihn nie öffnen, nur in der Liste sehen.
      logService.error(`[loadPersistedRun] Auto-Delete für Ghost-Run ${runId} fehlgeschlagen — IDB-Infrastrukturproblem`);
    }
    return false;
  }
}
```

**Warum hier und nicht in der UI:** Die Verteidigung gehört in die Lade-Funktion, nicht in
die Anzeige-Logik. So ist der Ghost-Run auch gegen direkte Navigation (`/run/{id}`) geschützt,
nicht nur gegen die Run-Liste. Bei erfolgreichem Auto-Delete verschwindet der Ghost-Run beim
nächsten `loadPersistedRunList()`. Bei fehlgeschlagenem Auto-Delete bleibt er in der Liste
sichtbar, ist aber **funktional tot**: jeder Lade-Versuch erkennt den unvollständigen
Ingest-Status und gibt `false` zurück — der Run kann nie geöffnet werden. Das ist die
bewusste Abbruchkante dieses Plans.

**KISS-Bewertung:** Kein neuer State, kein neues Flag, kein UI-Umbau. Eine `if`-Prüfung mit
zwei Feldvergleichen + bestehender `deletePersistedRun()`-Aufruf. Legacy-Runs (ohne
`ingestStatus`) sind nicht betroffen.

### 15. `stepGuard.ts` — F3 Scope-Differenzierung (Korrektur v7)

**Logikfehler v6:** `hasIngestStatus = !!idbData?.ingestStatus` innerhalb von `if (!idbData)` ist
immer `false` — SSOT-Blocker war nie erreichbar. Corrected: drei Ebenen, klar getrennt:

```typescript
// F3: Serial-Status prüfen
// Ebene 1: Kein IDB-Eintrag.
// Annahme: SSOT-Runs schreiben Phase 1 immer in IDB → kein IDB = Legacy-Run.
// Technisch kann !idbData auch ein Defekt sein (IDB gelöscht, Corr.). Deshalb:
// - ERROR statt WARN loggen, damit Defekte in Monitoring sichtbar sind
// - canProceed: true bleibt für Rückwärtskompatibilität mit Legacy-Runs
if (!idbData) {
  logService.error('[StepGuard] Step 3: Kein IDB-Snapshot. ' +
    'Entweder Legacy-Run oder Datenverlust. Serial-Status unbekannt.',
    { runId, reason: 'no-idb-snapshot' });
  return { canProceed: true, missingFields: [],
    skipReason: 'Kein IDB-Snapshot — Legacy oder Defekt, Serial-Status unbekannt' };
}

// Ebene 2: IDB vorhanden, kein ingestStatus → Legacy-Run in IDB (altes Format) → Warn-Skip
if (!idbData.ingestStatus) {
  logService.warn('[StepGuard] Step 3: IDB ohne ingestStatus (Legacy-Run). ' +
    'Serial-Status unbekannt.', { runId, reason: 'no-ingest-status-legacy' });
  return { canProceed: true, missingFields: [],
    skipReason: 'IDB ohne ingestStatus (Legacy-Run) — Serial-Status unbekannt' };
}

// Ebene 3: SSOT-Run → ingestStatus.serialList ist autoritativ
if (idbData.ingestStatus.serialList === 'not_provided') {
  return { canProceed: true, missingFields: [],
    skipReason: 'serialList nicht bereitgestellt (optional)' };
}
if (idbData.ingestStatus.serialList !== 'ready') {
  return { canProceed: false, missingFields: ['serialDocument'],
    blockReason: `serialList-Status '${idbData.ingestStatus.serialList}' — Integritätsfehler` };
}
// serialList === 'ready' → normal weiter
```

### 16. `reprocessCurrentRun()` — SSOT-only Reprocess, eigener Pfad (`runStore.ts`)

**Architektur-Entscheidung v15:** `reprocessCurrentRun()` ruft `startWorkflowPhase2()` **NICHT** auf.
Eigener Pfad. Begründung: `loadPersistedRun()` (runStore.ts:4502) ersetzt `currentRun`,
`invoiceLines` und `issues` vollständig aus IDB. Jeder vorher angewendete In-Memory-Reset
wird plattgemacht. Deshalb gilt: **erst laden, dann resetten, dann persistieren, dann starten.**

```
ABLAUF (exakte Reihenfolge, verbindlich):

  1. TIMER KILLEN
     clearTimeout(state.autoAdvanceTimer) + autoAdvanceTimer = null

  2. LADEN — loadPersistedRun(runId)
     Rehydriert den vollständigen Run-Snapshot aus IDB in den In-Memory-Store.
     Danach ist der Zustand identisch mit dem letzten persistierten Stand.
     Für SSOT-Runs: Prüfen, dass idbData.ingestStatus vorhanden ist.
     Fehlt es → Integritätsfehler, Reprocess abbrechen mit Fehlermeldung.

  3. REPROCESS-RESET auf dem frisch geladenen In-Memory-Zustand anwenden:

     3a. Issues für Steps 2–5 löschen (Step-1-Issues bleiben)
     3b. run.stats auf Nullwerte zurücksetzen (außer parsedInvoiceLines aus Step 1)
     3c. orphanSerials leeren
     3d. orderPool auf null setzen (run-spezifischer Arbeitscache, wird in Step 4 neu aufgebaut)
     3e. invoiceLines: pro Zeile Reset — NUR wenn manualStatus !== 'confirmed':

         Schutzregel: manualStatus === 'confirmed' → Zeile komplett unverändert lassen

         Exakte Feldliste mit verbindlichen Default-Werten:
```

```typescript
// Status-Felder → auf Ausgangszustand, NICHT auf null (sonst crasht die UI)
matchStatus:            'pending',       // MatchStatus
priceCheckStatus:       'pending',       // PriceCheckStatus

// Boolean-Felder → auf initialen Wert
activeFlag:             true,            // boolean (Artikel ist aktiv bis Step 2 anders entscheidet)
serialRequired:         false,           // boolean (wird von Step 2 aus Stammdaten neu gesetzt)

// Array-Felder → leeres Array, NICHT null/undefined
serialNumbers:          [],              // string[]
allocatedOrders:        [],              // AllocatedOrder[]

// Alle anderen betroffenen Felder → null bzw. Enum-Default
falmecArticleNo:        null,            // string | null
serialNumber:           null,            // string | null
serialSource:           'none',          // SerialSource (Enum-Default, kein null)
articleSource:          undefined,        // ArticleSource | undefined (optional field)
orderNumberAssigned:    null,            // string | null
orderAssignmentReason:  'pending',        // OrderAssignmentReason — initialer Wert (invoiceParserService.ts:165)
unitPriceSage:          null,            // number | null
unitPriceFinal:         null,            // number | null
storageLocation:        null,            // string | null
logicalStorageGroup:    null,            // 'WE' | 'KDD' | null
supplierId:             null,            // string | null
orderYear:              null,            // number | null
orderCode:              null,            // string | null
orderVorgang:           null,            // string | null
orderOpenQty:           null,            // number | null
descriptionDE:          null,            // string | null
```

```
         WARNUNG: Diese Liste ist abschließend und typ-exakt! Jeder Wert muss dem TypeScript-Typ
         aus InvoiceLine (types/index.ts:286) entsprechen. Keine undefined wo null erwartet wird.
         Keine null wo ein Array oder Enum-String erwartet wird.
         Insbesondere existieren NICHT: matchedOrderLine, priceDeviation, expandedLines.

     3f. Steps 2–5 auf 'not-started' zurücksetzen, issuesCount = 0. Step 1 bleibt unangetastet.

  4. PERSISTIEREN — saveRun(runId) mit dem bereinigten Zustand
     Stellt sicher, dass ein Reload oder Crash nach diesem Punkt den sauberen
     Reprocess-Zustand wiederherstellt, nicht den alten Workflow-Müll.

  5. TRANSIENTE STATES RÄUMEN (nicht in IDB, nur In-Memory)
     isWaitingBeforeStep4 = false
     waitingStep4RunId = null
     showStep4WaitingDialog = false
     isPaused = false
     latestDiagnostics = {}
     lastOrderParserDiagnostics = null

  6. STARTEN — advanceToNextStep(runId)
     Engine findet Step 2 als nächsten 'not-started' Step (Step 1 ist 'ok'/'soft-fail').

DARF NICHT:
  - parseMasterDataFile() / preFilterSerialExcel() / parseOrderFile() aufrufen
  - uploadedFiles lesen
  - fileStorageService als Quelle nutzen
  - startWorkflowPhase2() aufrufen (eigener Pfad!)

WARUM DIESER ABLAUF:
  - loadPersistedRun() MUSS vor den Resets kommen, weil es currentRun, invoiceLines
    und issues vollständig überschreibt (runStore.ts:4502–4523). Resets davor wären sinnlos.
  - saveRun() MUSS nach den Resets kommen, damit der bereinigte Zustand crash-sicher ist.
  - advanceToNextStep() MUSS am Ende stehen, damit die Engine auf dem sauberen Zustand arbeitet.
```

Für SSOT-Runs gilt: fehlt `ingestStatus` im IDB-Snapshot bei Schritt 2, ist Reprocess ein
Integritätsfehler — Reprocess-Button mit Fehlermeldung blockieren.

---

## Gesamtbild: Was wird run-sicher

| Feld | Vorher (global) | Nachher (run-spezifisch) |
|------|----------------|--------------------------|
| `parsedInvoiceResult` | Global Store | IDB via `loadPersistedRun()` |
| `parsedPositions` | Global Store | IDB via `loadPersistedRun()` |
| `parserWarnings` | Global Store | IDB via `loadPersistedRun()` |
| `preFilteredSerials` | Global Store + `archiveRun()` global | IDB via `loadPersistedRun()` + `archiveRun()` aus IDB |
| `serialDocument` | Global Store | IDB via `loadPersistedRun()` |
| `uploadedFiles` / `uploadMetadata` | Global Store | Session-Buffer; owned-gated in AutoSave |
| Artikel (Matcher Step 2) | `masterDataStore` global | `parsedArticlePool` aus IDB (mit Fallback) |
| openWE (Mapper Step 4) | `uploadedFiles` global | `parsedOrderPool` aus IDB |
| Artikel (OrderPool Step 4) | `masterDataStore` global | `parsedArticlePool` aus IDB (mit Fallback) |
| `orderPool` (manueller Order-Cache) | Global Store, überlebt Run-Wechsel | Run-sensitiv: null bei Run-Wechsel/Reprocess, neu aufgebaut in Step 4 |

---

## Abgrenzung Stufe A (dieses Ticket) / Stufe B

| Punkt | Einordnung |
|-------|------------|
| Phase 1 Ingest + Validierung pro Quelle | **SSOT ADD-ON (diese Arbeit)** |
| `createNewRunWithParsing()` aufteilen in 4 Funktionen | **SSOT ADD-ON (diese Arbeit)** |
| `parsedOrderPool` + `parsedArticlePool` in IDB | **SSOT ADD-ON (diese Arbeit)** |
| `ingestStatus` + Load Guard | **SSOT ADD-ON (diese Arbeit)** |
| Run-Wechsel-Feldbereinigung vollständig (inkl. parsedPositions/parserWarnings) | **SSOT ADD-ON (diese Arbeit)** |
| `archiveRun()` liest `preFilteredSerials` aus IDB | **SSOT ADD-ON (diese Arbeit)** |
| Step 2 liest Artikel aus `parsedArticlePool` (mit Fallback) | **SSOT ADD-ON (diese Arbeit)** |
| uploadMetadata owned-gated + saveRun-Schutz | **SSOT ADD-ON (diese Arbeit)** |
| F3 Guard: SSOT-Runs Blocker, Legacy-Runs Warn-Skip | **SSOT ADD-ON (diese Arbeit)** |
| `reprocessCurrentRun()` aus IDB statt Upload-Store | **SSOT ADD-ON (diese Arbeit)** |
| SSOT-Integritätsfehler bei fehlendem Pool (Step 2/4/archiveRun) | **SSOT ADD-ON (diese Arbeit)** |
| saveRun() Merge-Schutz für parsedPositions + parserWarnings + uploadMetadata | **SSOT ADD-ON (diese Arbeit)** |
| setCurrentRun() + reprocessCurrentRun(): transiente UI-State-Felder leeren | **SSOT ADD-ON (diese Arbeit)** |
| invoiceLines-Reset bei Reprocess: manualStatus=confirmed Zeilen schützen | **SSOT ADD-ON (diese Arbeit)** |
| Stabile technische runId (kein Rename aus Rechnungsnummer) | Stufe B |
| UI-Optionalität serialList/openWE im Upload-Screen sichtbar | Stufe B |
| Rohdatei-Blobs run-spezifisch (fileStorageService) | Stufe B |
| `loadStoredFiles()` in NewRun.tsx auf Session begrenzen | Stufe B |
| Step 4 `masterArticles` aus `parsedArticlePool` (IDB) statt globalem `masterDataStore` | **SSOT ADD-ON (diese Arbeit)** |
| `orderPool` bei Run-Wechsel/Reprocess auf null setzen | **SSOT ADD-ON (diese Arbeit)** |
| Hard-Fail-Cleanup: Run restlos löschen bei fehlgeschlagenem Phase-1-Ingest | **SSOT ADD-ON (diese Arbeit)** |
| `masterDataStore` vollständig aus Workflowpfad entkoppeln (nur noch Cache/UI) | Stufe B (Fallback in Änderung 11+12 reicht für Stufe A) |
| Settings-Änderung: Reparse aus Rohdatei vs. bestehendem Pool | Stufe B (Fachentscheidung nötig) |

---

## Akzeptanzkriterien

| # | Kriterium |
|---|-----------|
| 1 | Phase 1 läuft vor dem Workflow; Ladebalken bis alle Quellen `ready`/`not_provided` |
| 2 | Hard-Fail: `invalid`-Quelle → Dialog mit Quellenname + zurück zu NewRun |
| 3 | `parsedOrderPool` in IDB; Step 4 liest daraus statt aus globalem `uploadedFiles` |
| 4 | `parsedArticlePool` in IDB; Step 2 liest daraus (Fallback auf masterDataStore für alte Runs) |
| 5 | `archiveRun()` liest `preFilteredSerials` aus IDB-Snapshot des Runs |
| 6 | Run-Wechsel: `setCurrentRun()` leert alle globalen Felder (inkl. parsedPositions, parserWarnings, transiente UI-State-Felder); `loadPersistedRun()` immer aufgerufen |
| 7 | AutoSave zwischen Run-Wechsel und `loadPersistedRun()`-Abschluss schreibt keine Fremddaten |
| 8 | Seiten-Reload: Run aus IDB vollständig rehydriert, Workflow ohne Datenverlust |
| 9 | "Neu verarbeiten": eigener Pfad — erst `loadPersistedRun()`, dann Reset, dann `saveRun()`, dann `advanceToNextStep()`. Ruft NICHT `startWorkflowPhase2()` auf. Step 1 bleibt, kein FIFO-Fallback. |
| 10 | Artikelvalidierung in Phase 1: mind. 1 Zeile mit `artNo` + `storageLocation` + `supplierId` → ready; sonst invalid |
| 11 | F3 Guard: `!idbData` → ERROR-Log + canProceed:true; `idbData && !ingestStatus` → Warn-Skip; SSOT-Run → `ingestStatus.serialList` autoritativ |
| 12 | Alle Persistenzschritte nach PDF-Analyse verwenden ausschließlich `finalRunId`; kein persistierter Zustand unter temp-ID |
| 13 | Es existiert kein Codepfad, in dem ein SSOT-Run in Phase 2 direkt auf Upload-Dateien zugreift |
| 14 | Es existiert kein Codepfad, in dem ein SSOT-Run für Step 2, Step 4 oder `archiveRun()` globale Pools statt IDB-Snapshot verwendet |
| 15 | Reprocess eines SSOT-Runs funktioniert bei vollständig geleertem globalem Speicher allein aus IndexedDB |
| 16 | Run-Wechsel A→B: keine Parse-, Serial-, Artikel- oder Orderdaten von A sind in B sichtbar |
| 17 | Reprocess: Zeilen mit `manualStatus === 'confirmed'` behalten ihre Matching-Ergebnisse unverändert |
| 18 | tsc 0 Errors, alle bestehenden Tests grün |
| 19 | Neue Tests: Phase-1-Validierung je Quelle (positiv + negativ); Run-Wechsel-Race; Step-2/4 lesen aus IDB-Pool; `archiveRun()` verwendet IDB-Serials; Reprocess ohne globale Felder; confirmed-Zeilen überleben Reprocess |
| 20 | `updateRunWithParsedData()` startet in Phase 1 KEINEN Auto-Advance-Timer — `advanceToNextStep()` wird nicht aufgerufen, bevor Phase 1 abgeschlossen ist |
| 21 | `startWorkflowPhase2(runId)` wird NUR nach Phase-1-Ingest aufgerufen; lädt aus IDB, prüft Step-Stati defensiv, ruft `advanceToNextStep(runId)` auf; wird NICHT von Reprocess verwendet |
| 22 | Reprocess-Reset: alle betroffenen invoiceLine-Felder haben typ-korrekte Defaults (`'pending'`, `true`, `[]`, `null`, Enum-Defaults); kein `undefined` wo ein konkreter Typ erwartet wird |
| 23 | `executeOrderMapping()` liest `masterArticles` für SSOT-Runs aus `parsedArticlePool` (IDB), nicht aus globalem `masterDataStore` |
| 24 | `orderPool` wird bei Run-Wechsel (`setCurrentRun`) und Reprocess auf `null` gesetzt; kein alter Order-Cache überlebt |
| 25 | Hard-Fail in Phase 1: Run wird aus In-Memory-Store gelöscht + IDB-Löschung mit Retry versucht; bei erfolgreichem Delete kein Geister-Run in Liste/Archiv; bei fehlgeschlagenem IDB-Delete (Infrastrukturproblem) darf der Ghost-Run in der Liste sichtbar bleiben, ist aber nie ladbar (Änderung 14b blockt jeden Lade-Versuch); User erhält Fehlermeldung mit Quellenbezug |
| 26 | Unerwartete Exceptions in `handleStartProcessing()` werden per `try/catch` aufgefangen; auch dabei wird der teilweise angelegte Run aufgeräumt |
| 27 | Ghost-Run-Schutz: `loadPersistedRun()` erkennt SSOT-Runs mit unvollständigem Ingest (`pdf`/`articleList` != `ready`) und verweigert das Laden (`return false`); Auto-Delete aus IDB wird versucht — bei Erfolg verschwindet der Ghost-Run bei nächster Listenaktualisierung; bei Fehlschlag bleibt er in der Liste sichtbar, ist aber funktional tot (jeder Lade-Versuch wird erneut abgewiesen) |

---

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/services/runPersistenceService.ts` | `PersistedRunData`: `ingestStatus` + `parsedOrderPool` + `parsedArticlePool`; saveRun() Merge-Schutz für uploadMetadata + parsedPositions + parserWarnings |
| `src/store/runStore.ts` | `createNewRunWithParsing()` aufteilen in 4 Funktionen; `resetRunSensitiveState()` Helper; `updateRunWithParsedData()`: autoAdvance-Parameter; `setCurrentRun()` via Helper; `loadPersistedRun()`: Ownership-Pfade ergänzen + Ghost-Run-Erkennung (Änderung 14b); `startWorkflowPhase2()`: nur Erststart nach Phase 1; `reprocessCurrentRun()`: eigener Pfad (load→reset→save→advance); Step 2: parsedArticlePool mit SSOT-Blocker; Step 4: parsedOrderPool + masterArticles mit SSOT-Blocker; `archiveRun()`: IDB-Serials mit SSOT-Blocker; Resume-Pfad: Guard |
| `src/pages/NewRun.tsx` | Loading Gate: 4-Phasen-Ablauf statt direktem createNewRunWithParsing()-Aufruf |
| `src/pages/RunDetail.tsx` | inMemory-Guard entfernen |
| `src/hooks/buildAutoSavePayload.ts` | owned-Formel; parsedPositions + parserWarnings + uploadMetadata owned-gated |
| `src/services/stepGuard.ts` | F3: SSOT-Blocker vs. Legacy-Warn-Skip; F1 obsolet (parsedOrderPool ersetzt uploadedFiles) |
| `src/services/logService.ts` | Neue Methode `clearRunLog(runId)`: löscht Run-Buffer + localStorage-Key für Hard-Fail-Cleanup |

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans, um Fehler zu vermeiden

### 1. Auto-Advance-Timer in `updateRunWithParsedData()` neutralisieren (Phase-1/Phase-2-Grenze)
`updateRunWithParsedData()` (runStore.ts ~Zeile 1651) enthält `setTimeout(() => advanceToNextStep(), 500)`.
Dieser Timer startet Phase 2 automatisch nach dem PDF-Parse. In der neuen Architektur ist das **fatal**,
weil Phase 1 (Ingest aller Quellen) noch nicht abgeschlossen ist.

**Lösung:** `autoAdvance`-Parameter hinzufügen (Default `true`). `parseInvoiceForIngest()` ruft mit
`autoAdvance: false` auf. Siehe Änderung 3 für die exakte Spezifikation.

**WARNUNG:** Der `setTimeout()` in Zeile ~1651 speichert sein Handle NICHT in `state.autoAdvanceTimer`!
Es ist ein anonymer, lokaler Timer. Man kann ihn daher NICHT nachträglich über
`clearTimeout(get().autoAdvanceTimer)` killen. Nur der `autoAdvance`-Parameter verhindert das Starten.

### 2. loadPersistedRun() überschreibt ALLES — nie Resets davor setzen
`loadPersistedRun()` (runStore.ts:4502–4546) ersetzt `currentRun`, `invoiceLines`, `issues`
und `auditLog` vollständig aus IDB. **Jeder vorher gesetzte In-Memory-Zustand wird plattgemacht.**
Deshalb: IMMER erst laden, dann auf dem geladenen Zustand arbeiten.

Das gilt für beide Pfade:
- **Erststart:** `startWorkflowPhase2()` lädt aus IDB (Phase 1 hat korrekten Zustand persistiert),
  prüft defensiv, startet Engine.
- **Reprocess:** `reprocessCurrentRun()` lädt aus IDB, wendet Resets an, **persistiert den Reset
  zurück in IDB** (crash-sicher), startet Engine.

`loadPersistedRun()` wird in der Hauptlogik NICHT modifiziert. Keine Spezialregeln, keine
Ausnahmen. Einzige Ergänzung: `currentParsedRunId`-Zuweisung in `!data`- und `catch`-Pfaden
(Änderung 14) — das ist Ownership-Tracking, keine Verhaltensänderung.

### 3. clearTimeout VOR null-Setzung (Ghost-Workflow-Schutz)
An **drei Stellen** muss `clearTimeout(state.autoAdvanceTimer)` aufgerufen werden, BEVOR
`autoAdvanceTimer` auf `null` gesetzt wird:
- `setCurrentRun()` (Änderung 7)
- `reprocessCurrentRun()` Schritt 1 (Änderung 16)
- `startWorkflowPhase2()` Punkt 1 (Änderung 5)

**Warum:** Ein `setTimeout()`-Handle bleibt aktiv, auch wenn die Variable auf `null` gesetzt wird.
Ohne `clearTimeout()` feuert der alte Timer in den neuen Run hinein — Ghost-Workflow.
Orientiere dich an `pauseRun()`, das `clearTimeout()` bereits korrekt einsetzt.

### 4. startWorkflowPhase2 und advanceToNextStep — kein erfundener Parameter
`startWorkflowPhase2()` hat keinen `startFromStep`-Parameter. `advanceToNextStep()` hat nur
EINEN Parameter (`runId`) — keinen zweiten. Die Engine sucht intern den nächsten Step mit
`status === 'not-started'` (runStore.ts:1742). Erfinde keinen zweiten Parameter.

### 5. Zwei getrennte Pfade — nicht vermischen
- **`startWorkflowPhase2(runId)`** → NUR für Erststart nach Phase-1-Ingest.
- **`reprocessCurrentRun(runId)`** → NUR für "Neu verarbeiten". Hat eigenen Pfad, ruft
  `startWorkflowPhase2()` NICHT auf.
Diese Trennung ist Absicht. `startWorkflowPhase2()` braucht keine Resets (IDB-Zustand aus
Phase 1 ist korrekt). `reprocessCurrentRun()` braucht Resets (IDB enthält alten Workflow-Müll).
Zusammenführen würde eine der beiden Seiten kaputtmachen.

### 6. invoiceLines-Reset: Exakte Typ-Defaults, kein `undefined`-Roulette
Beim Reprocess-Reset MÜSSEN alle Felder typ-korrekte Defaults haben:
- `matchStatus` und `priceCheckStatus` → `'pending'` (NICHT `null` — UI rendert auf Status-String)
- `activeFlag` → `true` (NICHT `null` — boolean-Feld)
- `serialRequired` → `false` (NICHT `null` — boolean-Feld, wird von Step 2 neu gesetzt)
- `serialNumbers` und `allocatedOrders` → `[]` (NICHT `null` — Array-Felder, `.length` crasht auf null)
- `serialSource` → `'none'` (Enum-Default)
- `orderAssignmentReason` → `'pending'` (initialer Wert — `'none'` existiert NICHT im Typ `OrderAssignmentReason`)
- Alle anderen → `null` (string|null, number|null Felder)
- `articleSource` → `undefined` (optional field im TypeScript-Typ)

**Verboten:** Erfinde KEINE Felder, die nicht in der Liste in Änderung 16 stehen.
Insbesondere existieren `matchedOrderLine`, `priceDeviation` und `expandedLines` NICHT.
Prüfe bei Zweifeln `InvoiceLine` in `types/index.ts:286`.

### 7. manualStatus === 'confirmed' ist heilig
Zeilen mit `manualStatus === 'confirmed'` dürfen bei Reprocess **niemals** verändert werden.
Die gesamte Zeile bleibt unberührt — nicht nur einzelne Felder. Das ist der Schutz für
manuelle Korrekturen des Users.

### 8. orderPool ist ein flüchtiger Arbeitscache — nicht persistieren
`orderPool` (runStore.ts:520) ist ein In-Memory-Cache für manuelle Bestellauflösung in Step 4.
Er wird NICHT in IDB persistiert (das wäre Overengineering für Stufe A). Stattdessen:
- Bei Run-Wechsel (`setCurrentRun`): `orderPool = null`
- Bei Reprocess: `orderPool = null` (wird in Step 4 neu aufgebaut)
- `loadPersistedRun()` setzt ihn NICHT — er bleibt `null` bis Step 4 ihn erzeugt.

### 9. Step 4 hat ZWEI Artikelquellen — beide run-spezifisch machen
`executeOrderMapping()` braucht sowohl `parsedOrders` (openWE-Daten) als auch `masterArticles`
(für den 2-von-3-Score in `buildOrderPool`). Beide müssen für SSOT-Runs aus `parsedArticlePool`
bzw. `parsedOrderPool` der IDB kommen. Der globale `masterDataStore` ist nur Legacy-Fallback.

### 10. Hard-Fail = komplettes Löschen, kein Spezialstatus
Bei fehlgeschlagenem Phase-1-Ingest wird der Run via `cleanupFailedIngest()` gelöscht (In-Memory
immer, IDB mit Retry; bei persistentem IDB-Fehler: Ghost-Run nie ladbar, s. Änderung 14b):
`resetRunSensitiveState()` + inlined Store-Bereinigung (`runs`, `currentRun`, `invoiceLines`,
`issues`, `auditLog`) + `logService.clearRunLog()` + `deletePersistedRun()`.
**Kein `deleteRun()`** — das würde `archiveService.deleteArchivedRun(runId)` aufrufen und damit
ein gültiges Archiv eines früheren Runs mit derselben Rechnungsnummer-ID löschen.
Kein `'invalid'`-Status, kein `'failed-ingest'`-Marker, kein halbfertiger Eintrag in der
Run-Liste, keine Log- oder Audit-Reste, kein Archiv-Seiteneffekt.
Der User bekommt eine Fehlermeldung mit Quellenbezug und startet einen neuen Run.
**Auch bei Exceptions** in `handleStartProcessing()` muss `cleanupFailedIngest()` aufgerufen werden
— deshalb der `try/catch` um den gesamten Ablauf. Kein Geister-Run darf überleben.

### 11. Legacy-Runs nicht brechen
`!!idbData?.ingestStatus` ist der SSOT-Indikator. Nur wenn dieser `true` ist, gelten die
strengen SSOT-Regeln. Ohne `ingestStatus` ist es ein Legacy-Run — dort gelten die Fallbacks.
Niemals Legacy-Pfade entfernen oder SSOT-Regeln auf Legacy-Runs anwenden.

### 12. logService.clearRunLog(runId) — neue Methode für Hard-Fail-Cleanup
`logService` (logService.ts) hat aktuell keine dedizierte Clear-Methode für Run-Logs.
`exportRunLog()` (logService.ts:320–321) löscht Buffer + localStorage erst nach erfolgreichem
Datei-Export. Für den Hard-Fail-Cleanup in `cleanupFailedIngest()` braucht es eine eigenständige
Methode, die ohne Vorbedingung aufräumt:
```typescript
clearRunLog(runId: string): void {
  this.runBuffers.delete(runId);
  localStorage.removeItem(`${RUN_LOG_PREFIX}${runId}`);
}
```
**Warum nötig:** `createRunSkeleton()` ruft `startRunLogging(runId)` auf, was einen
In-Memory-Buffer (`runBuffers.set(runId, [])`) anlegt. Die Run-ID kommt aus der Rechnungsnummer
(`finalRunId`). Wenn der User denselben Beleg korrigiert erneut startet, entsteht dieselbe ID —
dann hängen alte Log-Einträge am neuen Run. Gleiches gilt für den localStorage-Key
`falmec-run-log-{runId}`, der von `persistCurrentRunBuffer()` geschrieben wird.

### 13. Generelle Regel: Kein `{ runId }` in Cleanup-/Löschpfaden an logService übergeben
**`logService.error('...', { runId })` schreibt IMMER in `falmec-run-log-{runId}`** (localStorage)
via `addToRunLog()` (logService.ts:71–72) — unabhängig davon, ob ein Run-Buffer aktiv ist.

In allen Pfaden, die einen Run aufräumen oder löschen, darf `runId` **nur per String-Interpolation**
in die Log-Message geschrieben werden, **NICHT** als `options.runId`:

```typescript
// ✅ KORREKT — runId nur in der Message, nicht in den Options:
logService.error(`[cleanupFailedIngest] Fehler für Run ${runId}`);

// ❌ VERBOTEN in Cleanup-Pfaden — erzeugt Run-Log-Rest:
logService.error('[cleanupFailedIngest] Fehler', { runId });
```

**Betroffene Stellen (abschließend):**
- `cleanupFailedIngest()` — nach `clearRunLog(runId)` (Schritt 4)
- `cleanupFailedIngest()` — `deletePersistedRun(false)`-Pfad (Schritt 5c)
- `loadPersistedRun()` — Ghost-Run-Autodelete (Änderung 14b)

**Warum kritisch:** Die `runId` kommt aus der Rechnungsnummer. Wenn der User denselben Beleg
erneut startet, entsteht dieselbe ID — ein localStorage-Rest `falmec-run-log-{runId}` hängt
dann als Altlog am neuen Run und kontaminiert die Diagnose.

---

## ⛔ Bewusst ausgegrenzte Stufe-B-Themen — NICHT ANFASSEN

> **OFFIZIELLE DEKLARATION FÜR DEN IMPLEMENTIERER (Sonnet):**
>
> Die folgenden Themen sind **keine Lücken, Versäumnisse oder offenen Punkte** dieses Plans.
> Sie wurden bewusst analysiert, bewertet und als **nicht relevant für Stufe A** eingestuft.
> Sie dürfen im Rahmen der Stufe-A-Implementierung **unter keinen Umständen** angefasst,
> "mitgenommen", "vorbereitend umgebaut" oder "schon mal angedacht" werden.
>
> Jede Abweichung von dieser Regel erzeugt unkontrollierte Seiteneffekte in Code-Bereichen,
> die für Stufe A nicht durchgeplant sind.

### B1. Globale `fileStorageService`-Welt

`fileStorageService` speichert Upload-Dateien global nach Typ (nicht nach Run-ID).
`NewRun.tsx` ruft beim Mount `loadStoredFiles()` auf — nach einem Run-Wechsel können
Alt-Uploads wieder erscheinen. Dieses Verhalten ist **bekannt und akzeptiert** für Stufe A.
Die SSOT-Architektur umgeht das Problem, indem Phase 2 niemals auf Upload-Dateien zugreift.
**Stufe B:** `fileStorageService` auf NewRun-Session begrenzen oder aus dem kritischen Pfad nehmen.

### B2. Technische `runId` — kein Rename aus Rechnungsnummer

Die aktuelle Architektur benennt die temp-ID nach dem PDF-Parse in die Rechnungsnummer um
(`finalRunId`). Das ist eine Legacy-Entscheidung und erzeugt die ID-Kollisionsgefahr, die
den Archiv-Schutz in `cleanupFailedIngest()` nötig macht. Eine stabile, technische UUID als
`runId` (mit Rechnungsnummer als reinem Display-Feld) würde diese gesamte Problemklasse eliminieren.
**Stufe B:** Stabile technische runId einführen, ID-Rename entfernen.

### B3. Run-spezifische Rohdatei-Blobs

Die hochgeladenen Rohdateien (PDF, XLSX) werden aktuell nicht run-spezifisch in IDB persistiert.
Phase 1 parst sie und persistiert die Parse-Ergebnisse (Pools) — die Rohdateien selbst sind
danach nicht mehr nötig. Für Features wie "Settings-Änderung → Reparse aus Rohdatei" wäre eine
run-spezifische Blob-Persistierung erforderlich. Das ist eine **fachliche Entscheidung**, die
für Stufe A nicht relevant ist.
**Stufe B:** Rohdatei-Blobs run-spezifisch in IDB; Reparse-aus-Rohdatei als Feature-Entscheidung.

### B4. `masterDataStore` vollständig aus Workflowpfad entkoppeln

In Stufe A verwenden Step 2 und Step 4 für **SSOT-Runs** bereits `parsedArticlePool` aus IDB.
Der Fallback auf `masterDataStore` existiert nur für **Legacy-Runs** (ohne `ingestStatus`).
Eine vollständige Entkopplung (masterDataStore nur noch als Cache/UI, nie als Workflow-Quelle)
ist für Stufe A nicht nötig — der Legacy-Fallback reicht.
**Stufe B:** Legacy-Fallback entfernen, sobald keine Alt-Runs mehr in Produktion sind.

### B5. UI-Optionalität serialList/openWE im Upload-Screen

Die aktuelle NewRun-UI zeigt alle vier Upload-Felder gleichwertig. Fachlich sind `serialList`
und `openWE` optional. Die Phase-1-Validierung behandelt sie korrekt als optional (`not_provided`),
aber die UI kommuniziert das nicht sichtbar.
**Stufe B:** Upload-Screen visuell anpassen (optional-Label, Grauschaltung, Tooltip).

---

> **Versiegelungsvermerk:** Dieser Plan (v29 — FINAL APPROVED) ist die verbindliche Grundlage
> für die Implementierung durch den Coding-Agenten. Änderungen am Plan erfordern eine erneute
> Architektur-Review durch den Planungsmeister (Opus). Der Coding-Agent implementiert exakt
> das, was hier steht — nicht mehr, nicht weniger.
