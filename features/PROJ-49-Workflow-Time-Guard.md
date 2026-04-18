# PROJ-49: Workflow Step-Guard — Zentrale Voraussetzungspruefung

## Motivation

Die aktuelle Pipeline basiert auf verschachtelten `setTimeout`-Kaskaden ohne zentrale State-Validierung.
Jeder Step nimmt an, dass seine Vorbedingungen erfuellt sind — es gibt **keinen Guard**, der das prueft.

### Bekannte Bugs durch fehlende Guards

| Bug | Ursache | Auswirkung |
|-----|---------|------------|
| FIFO-Fallback (25 Positionen) | `parsedPositions` nach Run-Wechsel als `[]` in IndexedDB gespeichert (Auto-Save Timing) | Step 4 findet keine `orderCandidates` → alles FIFO |
| Serial 0/193 | `preFilteredSerials` oder `serialDocument` bei Reprocess/Reload leer | Step 3 paired 0 Seriennummern |
| Pipeline-Stop nach Reprocess | `reprocessCurrentRun` baut keine Auto-Advance-Kaskade auf | Steps 3/4/5 werden nach "Neu verarbeiten" nie getriggert |

### Erkenntnisse aus Diagnostic + Reviews

| Erkenntnis | Konsequenz |
|------------|------------|
| Lazy-Rehydrierung aus globalem `uploadedFiles` ist nicht run-sicher | Guard rehydriert aus IDB-Snapshot (`PersistedRunData`), NICHT aus `uploadedFiles` |
| `saveRun()` Full-Replace: "non-empty wins" konserviert stale Daten | Partial-Overwrite mit Ownership (`currentParsedRunId`) + Freshness (Step-Status) |
| Entfernung von Load-Fallbacks laesst UI ohne Daten | `loadPersistedRun`-Fallback BLEIBT — nur Step-Level-Fallbacks werden entfernt |
| Guard gleichzeitig pure + async ist unklar | Aufteilen: `validateStepPrerequisites()` (pure/sync) + `applyStepRepairs()` (async/side-effects) |
| Akzeptanzkriterien zu breit fuer Stufe A | Archiv-Konsistenz und Run-scoped Uploads raus aus Stufe-A-Kriterien |
| Step 2 blockiert faelschlich wenn Stammdaten nur nicht im Memory sind | Reparaturpfad: `useMasterDataStore.load()` aus eigener IDB vor Block |
| Step 3 Skip-Regel kann Datenverlust als "kein Upload" fehlinterpretieren | Skip nur wenn `uploadMetadata` keinen `serialList`-Eintrag hat |
| `saveRun()` bekommt kein `currentParsedRunId` — Verdrahtung offen | Interface-Erweiterung: Payload liefert Ownership-Metadaten mit |
| openWE-Pruefung in Step 4 ist global, nicht run-scoped | Explizit als Nicht-Ziel Stufe A; fuer frische Runs ok, fuer Rehydrierung Stufe B |

---

## Datenmutations-Karte (Ist-Zustand)

### Persistenz-Architektur

Die App speichert Run-Daten in **IndexedDB** via `runPersistenceService`. Drei Trigger:

| Trigger | Debounce | Mechanismus |
|---------|----------|-------------|
| **AutoSave** | 2000ms | `useRunAutoSave` → Zustand `.subscribe()` → `buildAutoSavePayload()` → `saveRun()` |
| **Hard Checkpoint** (Step 3) | Sofort (await) | `executeMatcherSerialExtract()` → `buildAutoSavePayload()` → `saveRun()` |
| **Unmount Flush** | Sofort | `useRunAutoSave` cleanup → pending Save sofort ausfuehren |

**Stammdaten-Persistenz (separater Kreislauf):**
- `masterDataStore` hat eigene IndexedDB (`falmec-master-data`) + localStorage-Metadata
- `load()` hydiert aus IDB beim App-Boot (`App.tsx useEffect`)
- Stammdaten sind NICHT in `PersistedRunData` enthalten — sie sind global und run-uebergreifend

### Kritische Felder — Wo werden sie gesetzt/geloescht?

| Feld | Upload | Step 1 | Step 2 | Step 3 | Step 4 | Reload (IDB) | IDB-Feld |
|------|--------|--------|--------|--------|--------|-------------|----------|
| `parsedInvoiceResult` | — | SET | — | — | — | Rehydrate | `parsedInvoiceResult` |
| `parsedPositions` | — | SET (aus Result) | — | — | READ | Rehydrate | `parsedPositions` |
| `preFilteredSerials` | SET | — | — | READ | — | Rehydrate | `preFilteredSerials` |
| `serialDocument` | SET | — | — | MUTATE (consumed) | — | Rehydrate | `serialDocument` |
| `invoiceLines` | — | SET (aggregiert) | MAP (Match-Felder) | MAP (S/N) | SET (expanded+Order) | Rehydrate | `invoiceLines` |
| `orderPool` | — | — | — | — | SET | **NICHT** persistiert | — |
| `masterArticles` | SET (Upload) | — | READ | — | — | Eigene IDB | — (nicht in PersistedRunData) |

**Wichtig:** `PersistedRunData` enthaelt `preFilteredSerials`, `serialDocument` und `parsedInvoiceResult` bereits run-spezifisch (Zeile 41-48 in `runPersistenceService.ts`). Die IDB ist damit die run-spezifische Quelle — nicht der globale Store.

### Schutzmechanismen fuer manuelle Korrekturen

| Pruefung | Stelle | Schutzlogik |
|---------|--------|-------------|
| `manualStatus === 'confirmed'` | Step 2 Cross-Match (Zeile ~3930) | Bestaetigte manuelle Artikel werden vom Matcher NICHT ueberschrieben |
| `priceCheckStatus === 'custom' && manualStatus === 'confirmed'` | Step 2 Cross-Match (Zeile ~3933) | Bestaetigte manuelle Preise werden geschuetzt |
| `serialSource === 'manual'` | Step 3 Serial-Extract (Zeile ~4129) | Manuelle S/N werden vom SerialFinder NICHT ueberschrieben |

Diese Schutzmechanismen bleiben vom Guard-System **unberuehrt** — der Guard prueft nur Vorbedingungen, er greift nicht in die Step-Logik ein.

### Draft/Confirmed-Modell (explizit: Modell A beibehalten)

- Draft ist ein legitimer persistierbarer Arbeitszustand
- `Loesung anwenden` bestaetigt den bereits vorhandenen Zustand als `confirmed`
- `reopenIssue()` stuft gezielt zurueck (`confirmed -> draft` bzw. `custom -> mismatch`)
- **Kein stiller Umbau auf Modell B waehrend dieses Bugfixes**

---

## Implementierungsplan — Stufe A (Akute Bugfixes + Guard)

> Stufe A loest die drei bekannten Bugs und fuehrt den zentralen Guard ein.
> Stufe B (SSOT-Haertung, Archiv-Isolation, Hard-Commits, run-scoped openWE) ist ein eigenes Folgeticket.

### Step 1: Step-Guard-Service (neue Datei)

**Neue Datei:** `src/services/stepGuard.ts`

**Architektur: Zwei getrennte Funktionen mit klarer Verantwortung**

#### 1A: `validateStepPrerequisites()` — Pure, synchron, lesend

Liest den aktuellen Store-State und gibt ein Diagnose-Objekt zurueck. Hat **keine Side Effects**.

**Eingabe:** Step-Nummer, Run-ID, aktueller Store-State

**Ausgabe:**
```
{
  canProceed: boolean;
  missingFields: Array<{
    field: string;
    available: 'store' | 'idb' | 'masterDataStore' | 'none';
  }>;
  skipReason?: string;   // Step ueberspringen (z.B. keine S/N-Datei)
  blockReason?: string;  // Step blockieren (z.B. IDB + MasterData leer)
}
```

Die Funktion entscheidet NICHT ueber Reparaturen — sie meldet nur den Zustand.

#### 1B: `applyStepRepairs()` — Async, orchestrierend, mit Side Effects

Nimmt das Ergebnis von `validateStepPrerequisites()` und fuehrt die noetige Rehydrierung durch.

**Rehydrierungsquellen nach Prioritaet:**
1. Run-spezifischer IDB-Snapshot (`runPersistenceService.loadRun(runId)`) fuer `parsedPositions`, `parsedInvoiceResult`, `preFilteredSerials`, `serialDocument`
2. Dedizierte MasterData-IDB (`useMasterDataStore.getState().load()`) fuer `masterArticles`
3. **NICHT** aus globalem `uploadedFiles` — das ist nicht run-gebunden

**Ablauf:**
1. Fehlende Felder aus dem jeweiligen IDB-Snapshot in den Store schreiben
2. Falls IDB-Snapshot ebenfalls leer → `blockReason` setzen, Step NICHT starten, diagnostisch loggen
3. Rueckgabe: aktualisiertes Diagnose-Objekt (canProceed nach Reparatur)

#### Step-spezifische Guard-Regeln

**Step 2 Guard — Artikel extrahieren:**
1. `parsedInvoiceResult` vorhanden und `.lines.length > 0`?
2. `invoiceLines` fuer diesen Run vorhanden (lineId-Prefix-Filter)?
3. Stammdaten (`masterArticles`) geladen?
- Reparatur fuer Punkt 3: `await useMasterDataStore.getState().load()` — hydiert aus eigener IDB (`falmec-master-data`). Erst wenn danach immer noch leer → `blockReason`: "Stammdaten fehlen"
- Fehlerfall Punkt 1/2: `blockReason` — Step 1 muss zuerst laufen

**Step 3 Guard — Seriennummer anfuegen:**
1. `serialRequired` auf mindestens einer Line gesetzt?
2. S/N-Datenquelle vorhanden: `preFilteredSerials.length > 0` ODER `serialDocument !== null`?
3. Falls beides leer → `applyStepRepairs` rehydriert aus IDB (`PersistedRunData.preFilteredSerials` + `.serialDocument`)
4. Falls IDB ebenfalls leer → **uploadMetadata pruefen:**
   - Hat `PersistedRunData.uploadMetadata` einen Eintrag mit `type === 'serialList'`?
   - **JA:** Datenverlust — `blockReason`: "Serial-Datei war vorhanden aber Daten fehlen in Store und IDB. Bitte Serial-Liste erneut hochladen." + diagnostisches Logging
   - **NEIN:** Kein Serial-Upload fuer diesen Run → `skipReason`: Step 3 als 'ok' skippen (identisch zum bestehenden Verhalten)

**Step 4 Guard — Bestellungen mappen:**
1. `parsedPositions.length > 0`?
2. Falls leer → `applyStepRepairs` rekonstruiert aus `parsedInvoiceResult.lines` (Store oder IDB)
3. Falls auch `parsedInvoiceResult` leer → `blockReason`: Step 1 muss zuerst laufen
4. openWE-Verfuegbarkeit: Pruefung gegen `uploadedFiles` (global) ODER `uploadMetadata` (IDB)
   - Wenn weder `uploadedFiles` noch `uploadMetadata` einen `openWE`-Eintrag haben → Step 4 als 'ok' skippen
   - **Hinweis:** Fuer rehydrierte Runs ist `uploadedFiles` moeglicherweise leer. Deshalb zusaetzlich `uploadMetadata` aus `PersistedRunData` pruefen. Die eigentliche CSV-Datei wird weiterhin aus `fileStorageService` geladen — das ist global und nicht run-scoped. Vollstaendig run-scoped openWE ist Stufe B.
5. Lines haben `falmecArticleNo` gesetzt? (= Step 2 muss gelaufen sein)

**Step 5 Guard — Export:**
1. Run `isExpanded === true`?
2. Step 4 Status ist 'ok' oder 'soft-fail'?
- Fehlerfall: `blockReason`

**Codepruefung nach Step 1:** `npx tsc --noEmit` — neue Datei muss fehlerfrei kompilieren.

---

### Step 2: Guard in Pipeline einbauen

**Datei:** `src/store/runStore.ts`

#### 2A: Guard-Aufruf in `advanceToNextStep` (Zeile ~1698)

In jedem Step-Timeout-Callback, direkt VOR dem `executeXxx()`-Aufruf:
1. `validateStepPrerequisites()` aufrufen (sync)
2. Falls `canProceed === false` und `missingFields` vorhanden → `await applyStepRepairs()` (async)
3. Falls danach immer noch `blockReason` → Step auf 'error' setzen, Issue erzeugen, NICHT fortfahren
4. Falls `skipReason` → Step auf 'ok' setzen, weiter mit `advanceToNextStep`

**Einbaupunkte:**
- Zeile ~1707: Vor `executeMatcherCrossMatch()` → Step 2 Guard
- Zeile ~1732: Vor `executeMatcherSerialExtract()` → Step 3 Guard
- Zeile ~1774: Vor `parseOrderFile()` / `executeOrderMapping()` → Step 4 Guard
- Step 5 Guard im Export-Flow

Da `applyStepRepairs()` async ist, muessen die Timeout-Callbacks zu async Functions werden. Die bestehende `setTimeout`-Struktur bleibt erhalten — nur der innere Callback wird async.

#### 2B: Guard-Aufruf in `retryStep` (Zeile ~1966)

Identisch: VOR dem `executeXxx()`-Aufruf den Guard aufrufen.

#### 2C: `reprocessCurrentRun` — Auto-Advance-Kaskade aufbauen (Zeile ~2155)

**Kernproblem:** `reprocessCurrentRun` ruft nur `executeMatcherCrossMatch()` auf — danach stoppt die Pipeline. Steps 3/4/5 werden nie getriggert.

**Loesung:** Nach `executeMatcherCrossMatch()` die gleiche Auto-Advance-Kaskade aufbauen wie in `advanceToNextStep`:

1. Step 2 ausfuehren (mit Guard)
2. Nach Step 2: Status pruefen → wenn 'ok'/'soft-fail' → `advanceToNextStep(runId)` aufrufen
3. `advanceToNextStep` uebernimmt die Kaskade fuer Steps 3→4→5

Das bedeutet: `reprocessCurrentRun` baut nach Step 2 einen `setTimeout` ein, der `advanceToNextStep(runId)` aufruft — analog zur bestehenden t2adv-Logik in Zeile 1709-1719.

**Codepruefung nach Step 2:** `npx tsc --noEmit` — runStore muss fehlerfrei kompilieren.

---

### Step 3: Step-Level-Fallbacks bereinigen + Overwrite-Schutz

**Wichtige Unterscheidung:**
- **Step-Level-Fallbacks** (in `executeOrderMapping`, `buildAutoSavePayload`) → ENTFERNEN, da der Guard diese Aufgabe uebernimmt
- **Load-Level-Fallback** (in `loadPersistedRun`) → BEIBEHALTEN, da die UI sofort nach dem Laden vollstaendige Daten braucht, nicht erst beim naechsten Step-Start

#### 3A: `executeOrderMapping` (runStore.ts, Zeile ~3520-3542)

**Entfernen:** Den gesamten `effectivePositions`-Fallback-Block. Der Step 4 Guard hat `parsedPositions` bereits repariert, bevor `executeOrderMapping()` aufgerufen wird. Zurueck zu `parsedPositions` statt `effectivePositions`.

#### 3B: `buildAutoSavePayload` (buildAutoSavePayload.ts, Zeile ~42-63)

**Entfernen:** Die IIFE-Fallback-Logik fuer `parsedPositions`. Zurueck zur einfachen Ownership-Guard:
- `parsedPositions` wird im Store durch den Guard repariert, BEVOR der Step startet
- AutoSave speichert dann die reparierten Daten
- Die Ownership-Guard (`currentParsedRunId`) bleibt bestehen

**NEU — Ownership-Metadaten im Payload:** `buildAutoSavePayload()` liefert zusaetzlich `currentParsedRunId` im Rueckgabe-Objekt mit. Das ist die Verdrahtung fuer den Overwrite-Schutz in `saveRun()`.

```
return {
  id: runId,
  currentParsedRunId: current.currentParsedRunId,  // NEU
  run,
  invoiceLines: runLines,
  // ... rest wie bisher
};
```

#### 3C: `loadPersistedRun` (runStore.ts, Zeile ~4417-4432)

**BEIBEHALTEN.** Der Fallback in `loadPersistedRun` rekonstruiert `parsedPositions` aus `parsedInvoiceResult` beim Laden. Das ist noetig, weil:
- Die UI (RunDetail, Preview-Tab etc.) sofort nach dem Laden auf `parsedPositions` zugreift
- Der Guard greift erst beim naechsten Step-Start — zwischen Laden und Step-Start wuerde die UI leere Daten anzeigen
- Der Fallback ist eine reine Daten-Rekonstruktion ohne Side Effects

#### 3D: Overwrite-Schutz in `saveRun()` (runPersistenceService.ts)

**Interface-Aenderung:** `saveRun()` bekommt ein erweitertes Payload-Objekt:

```
// Bisherig:
saveRun(data: Omit<PersistedRunData, 'savedAt' | 'sizeEstimateBytes'>)

// Neu:
saveRun(data: Omit<PersistedRunData, 'savedAt' | 'sizeEstimateBytes'> & {
  currentParsedRunId?: string | null;  // Ownership-Info aus buildAutoSavePayload
})
```

`currentParsedRunId` wird NICHT in `PersistedRunData` gespeichert — es ist nur ein transientes Signal fuer den Merge-Schutz.

**Merge-Logik vor `store.put()`:**

1. Bestehenden Eintrag lesen: `store.get(runId)` (im selben Transaction)
2. Falls kein bestehender Eintrag → normaler Put (kein Schutz noetig)
3. Falls bestehender Eintrag vorhanden, fuer jedes sensible Feld:

| Feld | Schutzregel |
|------|-------------|
| `parsedInvoiceResult` | Beibehalten wenn: neuer Wert null UND `currentParsedRunId !== runId` |
| `parsedPositions` | Beibehalten wenn: neuer Wert `[]` UND `currentParsedRunId !== runId` |
| `preFilteredSerials` | Beibehalten wenn: neuer Wert `[]` UND bestehender Wert nicht-leer UND `uploadMetadata` hat `serialList`-Eintrag |
| `serialDocument` | Beibehalten wenn: neuer Wert null UND bestehender Wert nicht-null UND `uploadMetadata` hat `serialList`-Eintrag |

4. `currentParsedRunId` aus dem Payload entfernen vor dem `put()` (nicht persistieren)
5. Logging wenn Overwrite verhindert wird (Feld, RunId, Grund)

**Warum diese Regeln:**
- `currentParsedRunId !== runId` erkennt run-fremde Payloads (z.B. AutoSave feuert nach Run-Wechsel)
- `uploadMetadata`-Check fuer Serials: Wenn nie ein Serial-Upload existierte, ist leeres `preFilteredSerials` korrekt — kein stale-Daten-Problem
- Wenn `currentParsedRunId === runId`, duerfen alle Felder ueberschrieben werden — auch mit leeren Werten (z.B. nach bewusstem Reset)

**Codepruefung nach Step 3:** `npx tsc --noEmit` — alle geaenderten Dateien muessen fehlerfrei kompilieren.

---

### Step 4: Konsistenz-Sicherung + Testlauf

#### 4A: IndexedDB-Konsistenz bei Reprocess

Ablauf nach dem Fix:
1. User klickt "Neu verarbeiten"
2. Steps 2-5 werden auf 'not-started' zurueckgesetzt
3. `invoiceLines` bleiben erhalten (manuelle Korrekturen geschuetzt)
4. Step 2 startet: `validateStepPrerequisites(2)` → prueft Vorbedingungen
   - `masterArticles` leer? → `applyStepRepairs` ruft `useMasterDataStore.load()` auf
   - Danach immer noch leer? → `blockReason` + Issue
5. Step 2 laeuft: Cross-Match setzt `serialRequired`, `falmecArticleNo` etc.
   - **Manuelle Artikel** (`manualStatus === 'confirmed'`) werden NICHT ueberschrieben
   - **Manuelle Preise** (`priceCheckStatus === 'custom' && manualStatus === 'confirmed'`) werden NICHT ueberschrieben
6. AutoSave (2s) persistiert — Overwrite-Schutz greift wenn `currentParsedRunId === runId` → normaler Put
7. `advanceToNextStep` → Step 3: `validateStepPrerequisites(3)` → `preFilteredSerials` leer?
8. Falls leer: `applyStepRepairs()` → IDB-Snapshot laden → `preFilteredSerials` rehydrieren
9. Falls IDB auch leer: `uploadMetadata` pruefen → `serialList` vorhanden? → JA: blockieren (Datenverlust). NEIN: skippen.
10. Step 3 laeuft: Serials werden zugewiesen
    - **Manuelle S/N** (`serialSource === 'manual'`) werden NICHT ueberschrieben
11. Hard Checkpoint: State wird sofort in IndexedDB persistiert
12. `advanceToNextStep` → Step 4: `validateStepPrerequisites(4)` → `parsedPositions` leer?
13. Falls leer: `applyStepRepairs()` → aus `parsedInvoiceResult` rekonstruieren
14. Step 4 laeuft: OrderMapping mit vollstaendigen `orderCandidates`
15. `advanceToNextStep` → Step 5

**Ergebnis:** Jeder Step hat garantiert seine Eingangsdaten aus run-spezifischer Quelle, manuelle Korrekturen bleiben geschuetzt, IndexedDB ist konsistent.

#### 4B: Issue-Workflow Kompatibilitaet

Wenn ein User ueber "Loesung anwenden" einen Fehler behebt:
- `manualStatus` wird auf `'confirmed'` gesetzt
- `articleSource` wird auf `'manual'` gesetzt
- Diese Felder werden via AutoSave in IndexedDB persistiert

Bei "Neu verarbeiten":
- Step 2 Cross-Match respektiert `manualStatus === 'confirmed'` (Zeile ~3930)
- Step 3 Serial-Extract respektiert `serialSource === 'manual'` (Zeile ~4129)
- **Der Guard greift NICHT in diese Schutzlogik ein** — er prueft nur Vorbedingungen

**Kein Einfluss des Guard-Systems auf den Issue-Workflow.**

#### 4C: Manueller Testlauf

Nach Abschluss aller Code-Aenderungen:
1. Dev-Server starten
2. Bestehenden Test-Run laden
3. "Neu verarbeiten" klicken
4. Pruefen: Alle 5 Steps laufen durch, Serial-Kachel zeigt korrekte Zahlen, keine FIFO-Fallbacks bei Positionen mit PDF-Referenzen
5. Run wechseln, zurueckwechseln: Daten noch vollstaendig
6. Seite neu laden: Run aus IDB geladen, Daten vollstaendig

**Codepruefung nach Step 4:** `npx tsc --noEmit` — finaler Check.

---

## Betroffene Dateien (Zusammenfassung)

| Datei | Step | Aenderungstyp |
|-------|------|---------------|
| **NEU**: `src/services/stepGuard.ts` | Step 1 | Neue Datei — `validateStepPrerequisites()` + `applyStepRepairs()` |
| `src/store/runStore.ts` | Step 2A | Guard-Aufruf in `advanceToNextStep` (4 Stellen) |
| `src/store/runStore.ts` | Step 2B | Guard-Aufruf in `retryStep` (3 Stellen) |
| `src/store/runStore.ts` | Step 2C | Auto-Advance-Kaskade in `reprocessCurrentRun` |
| `src/store/runStore.ts` | Step 3A | Inline-Fallback in `executeOrderMapping` entfernen |
| `src/hooks/buildAutoSavePayload.ts` | Step 3B | IIFE-Fallback entfernen + `currentParsedRunId` im Payload |
| `src/services/runPersistenceService.ts` | Step 3D | Interface erweitern + Ownership-basierter Overwrite-Schutz |

**NICHT geaendert (und warum):**

| Datei | Grund |
|-------|-------|
| `src/store/runStore.ts` `loadPersistedRun` | Fallback BLEIBT — UI braucht sofort vollstaendige Daten |
| `src/store/masterDataStore.ts` | Wird nur aufgerufen (`load()`), nicht geaendert |
| Parser-Logik (Step 1) | Guard prueft nur Vorbedingungen, nicht Step-Logik |
| Cross-Match-Logik (Step 2) | Manuelle Schutzlogik bleibt unangetastet |
| Serial-Extract-Logik (Step 3) | `serialSource === 'manual'` Guard bleibt |
| Matching-Engine (Step 4) | 3-Run-Engine bleibt unveraendert |
| Export-/Archiv-Service | Stufe B |
| AutoSave-Hook (`useRunAutoSave.ts`) | Trigger-Logik bleibt unveraendert |
| UI-Komponenten | Keine UI-Aenderungen in Stufe A |

---

## Risiken & Mitigierung

| Risiko | Wahrscheinlichkeit | Mitigierung |
|--------|---------------------|-------------|
| `applyStepRepairs()` IDB-Read verlangsamt Pipeline | Niedrig | Nur bei leeren Daten; normaler Flow bleibt sync via `validateStepPrerequisites()` |
| Guard blockiert faelschlich (Stammdaten) | Keine | Reparaturpfad via `masterDataStore.load()` greift vor Block |
| Guard skippt faelschlich (Serials) | Keine | Skip nur wenn `uploadMetadata` keinen `serialList`-Eintrag hat; sonst blockieren |
| Manuelle Korrekturen gehen verloren | Keine | Guard greift nicht in Step-Logik ein; Schutzmechanismen bleiben bestehen |
| `saveRun()` Overwrite-Schutz zu restriktiv | Niedrig | Ownership + Freshness + uploadMetadata — legitime Updates gehen durch |
| `saveRun()` Extra-Read verlangsamt AutoSave | Niedrig | Ein IDB-Get im selben Transaction — <1ms bei lokaler DB |
| UI zeigt leere Daten zwischen Load und Step-Start | Keine | `loadPersistedRun`-Fallback bleibt bestehen |

---

## Bekannte Einschraenkungen Stufe A (explizite Nicht-Ziele)

Diese Punkte sind bewusst NICHT Teil von Stufe A und werden als Stufe B dokumentiert:

1. **Archiv-Isolation:** `archiveRun()` und Export lesen `preFilteredSerials` aus globalem Store — nicht run-spezifisch
2. **Hard-Commits fuer manuelle Fixes:** `confirmManualFix()`, `setManualOrder()` etc. verlassen sich auf 2s-Debounce statt sofortigem IDB-Commit
3. **Run-scoped Herkunft:** `preFilteredSerials`, `serialDocument` haben kein `sourceRunId`-Feld
4. **Invoice-PDF global:** `writeArchivePackage()` laedt Invoice via `fileStorageService.loadFile('invoice')` — nicht run-scoped
5. **openWE run-scoped:** Step 4 prueft `uploadedFiles` (global) fuer openWE-Verfuegbarkeit. Fuer frische Runs ist das korrekt. Fuer rehydrierte/persistierte Runs ist der Fallback auf `uploadMetadata` ein Kompromiss — die eigentliche CSV liegt weiterhin global in `fileStorageService`. Vollstaendig run-scoped openWE-Handling ist Stufe B.

---

## Akzeptanzkriterien — Stufe A

1. **FIFO-Bug behoben:** Nach `loadPersistedRun` + Reprocess werden `orderCandidates` korrekt rekonstruiert; keine Positionen fallen in FIFO wenn PDF-Referenzen vorhanden sind
2. **Serial-Bug behoben:** Nach "Neu verarbeiten" werden alle Steps 2→3→4→5 kaskadiert ausgefuehrt; `preFilteredSerials` wird bei Bedarf aus IDB rehydriert (nicht aus globalem uploadedFiles); Serial-Kachel zeigt korrekte Pairing-Zahlen
3. **Stammdaten-Rehydrierung:** Step 2 blockiert nicht faelschlich wenn Stammdaten in der MasterData-IDB vorhanden sind
4. **Serial-Datenverlust erkannt:** Wenn `uploadMetadata` einen `serialList`-Eintrag hat aber Store+IDB leer sind, wird blockiert statt still geskippt
5. **Manuelle Korrekturen geschuetzt:** Bestaetigte manuelle Artikel, Preise und Seriennummern ueberleben Reprocess
6. **Overwrite-Schutz:** `saveRun()` ueberschreibt sensible Felder nicht mit run-fremden leeren Werten; Ownership via `currentParsedRunId` im Payload verdrahtet; legitime Updates gehen durch
7. **UI-Stabilitaet:** Run-Detail-Ansicht zeigt nach Load sofort vollstaendige Daten (loadPersistedRun-Fallback aktiv)
8. **Keine Regression:** Neuer Run, Retry, Load funktionieren unveraendert
9. **tsc 0 Errors**

**Explizit NICHT in Stufe A:**
- Archiv-/Export-Konsistenz (globaler State → Stufe B)
- Run-scoped Upload-Herkunft inkl. openWE (Stufe B)
- Hard-Commits fuer manuelle Fixes (Stufe B)
