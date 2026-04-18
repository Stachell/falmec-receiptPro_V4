# PROJ-46 — Clean-up + Slim-down (Iteration 1)

**Autor:** Opus 4.6
**Datum:** 2026-04-15
**Version:** v1.14 (Meilenstein 4 Barriere integriert)
**Punktestand:** Opus aka Architekt: 1 (🐝🐝 R6 + R7, +1 regulärer Sieg R9) | CODEX aka Schnüffler: 0 (🐝 R8, 🟨🟨)
**Status:** DRAFT — Planungsdokument, KEIN Code geändert
**Achtung an KI-Agenten:** Setzt AUSSCHLIESSLICH Teil A um. Refactored NICHT den restlichen Store eigenmächtig!
**Quellen:** `.map/App-Blaupause_15042026-1130.html` **v2.2**, `src/store/runStore.ts` (3966 LOC), `src/pages/RunDetail.tsx`, `src/pages/NewRun.tsx`, `src/hooks/useRunAutoSave.ts`, `src/hooks/buildAutoSavePayload.ts`, `src/services/runPersistenceService.ts`, `src/types/index.ts`, `INVARIANTS.md`, `CIRCUIT.md` (A1–A17), `STANDARDS.md`, Team-Red-Audits (v1.0 + v1.1)
**Probe-Run-Log:** siehe Auftragskontext (Ingest OK → Step 3 feuert vor Step 2 → Step 2 blockiert)
**KI-BEAUFTRAGUNG (KONTRAKT):** Dieses Dokument stellt einen finalen, tiefen-geprüften Ausführungsplan dar. Deine Aufgabe ist die 1:1 technische Umsetzung des Codes ohne eigenmächtige architektonische Änderungen. 
*SHADOW-AUDIT PFLICHT:* Solltest du während der Umsetzung auf Stolpersteine, logische Fehler oder Optimierungspotenzial stoßen, unterbrich die Umsetzung NICHT. Führe den Plan wie dokumentiert aus und erstelle am Ende deiner Ausgabe eine separate Liste "Shadow-Audit: Technische Bedenken & Funde" für die anschließende Diskussion mit Dom.

> Leitprinzipien: **KISS & YAGNI.** > - **KISS:** Keine neuen Abstraktionen ohne Not. Nur das entfernen/entkoppeln, was nachweislich Seiteneffekte erzeugt. Funktionalität, sichtbares Verhalten, Workflow-Semantik bleiben bit-identisch.
> - **YAGNI:** Implementiere nur, was der Plan explizit fordert. Erfinde keine "Zukunfts-Features". WICHTIG: Wenn du augenscheinlich toten oder redundanten Code findest, der gegen YAGNI spricht, darfst du ihn NIEMALS eigenmächtig löschen! Notiere ihn zwingend auf deiner Shadow-Audit-Liste für Dom.


---

## ÄNDERUNGEN v1.9 → v1.10 (BONUS-Runde 1 — KISS-Subtraktion, KEIN neuer Code)

Eine Änderung — reine Subtraktion, kein neues Feature, keine neue Abstraktion:

| Bereich | v1.9 | v1.10 | Begründung |
|---|---|---|---|
| AP7 Helper-Signatur | `recalculateRunAfterMutation: (runId, scope) => …` mit `void scope;` als Zukunftsreserve | **`recalculateRunAfterMutation: (runId) => …`** — `scope`-Parameter + `void scope;`-Kommentar entfernt. | YAGNI > Signatur-Stabilität-ohne-Use-Case. Der Helper hat heute **keinen** scope-abhängigen Pfad (alle 5 Schritte laufen für jeden scope identisch). Parameter ohne operative Rolle ist dead weight — CLAUDE.md: *„Keine neuen Abstraktionen ohne Not"*. Falls später scope-spezifische Kurzpfade gebraucht werden, Parameter dann ergänzen. |

**Warum das keine neue Abstraktion + keine Overengineering-Falle ist:**
- Subtraktion, keine Addition. Signatur wird schmaler, nicht breiter.
- Kein Code-Verhalten ändert sich. Alle Call-Sites rufen den Helper ohne scope auf.
- KISS-Leitprinzip (Zeile 11) wird konsequent angewendet, nicht umgangen.
- CODEX hat diesen Punkt in R7 als „kleinen Restpunkt" selbst markiert — jetzt aufgelöst.

**Header-Update:** Punktestand +1 für Opus nach regulärem Sieg Runde 9.

---

## ÄNDERUNGEN v1.8 → v1.9 (DUELL-Runde 9/Matchball-Härtung nach CODEX-Konter R9)

Letzte CODEX-Kritik (nur Dokumentations-Drift) 1:1 aufgelöst:

| Bereich | v1.8 | v1.9 | CODEX-Beleg |
|---|---|---|---|
| „4-Familien-Tabelle"-Referenzen an 3 Stellen (Zeilen 33/201/225) | historisch korrekt für v1.7, aber inkonsistent mit real 5-zeiliger Tabelle in v1.8 | **Alle 3 Stellen auf „5-Familien-Tabelle" umgeschrieben** (replace_all). Tabelle selbst zählt 5 Zeilen: lineId-basiert, explizit-runId, dual (lineId+runId), positionIndex-only, issueId-basiert. | CODEX R9 Punkt 1. |
| Header + Punktestand | v1.8, 🐝🐝 Opus / 🟨🟨 CODEX | **v1.9/Matchball**, 🐝🐝 Opus + 🐝 CODEX R8 sichtbar. | Schiedsrichter R8. |
| **Finaler Stand** | Regression-Schutz + Guard-Vertrag + AP7-Feed-Vertrag + Regression-Matrix + Audit-Pattern: alle auditierbar. | **GREEN-LIGHT-Kandidat für nächste CODEX-Runde.** Keine verbleibenden Regressionsrisiken in Iteration-1-Scope. | — |

---

## ÄNDERUNGEN v1.7 → v1.8 (DUELL-Runde 8-Härtung nach CODEX-Konter R8)

Berechtigte CODEX-Kritik R8 1:1 übernommen (Code-Belege verifiziert):

| Bereich | v1.7 | v1.8 | CODEX-Beleg |
|---|---|---|---|
| B.6 Grep-Audit-Pattern | `setManualArticleByLine` fehlte im rg-Pattern | **`setManualArticleByLine` ergänzt.** Neuer Audit-Pattern deckt alle 4 setManual*-Actions ab. | CODEX R8 Punkt 1. Typedef-Anker: `runStore.ts:618`. |
| Guard-Tabelle `setManualArticleByLine` | war in Zeile „explizit runId-parametrisiert" mit Guard `runId === currentRun.id` — nutzte nur einen der zwei verfügbaren Parameter | **Eigene Zeile „dual parametrisiert (lineId + runId)"** mit defense-in-depth-Guard `runId === currentRun.id && lineId.startsWith(\`${runId}-line-\`)`. Erkennt zusätzlich mismatch zwischen lineId-Prefix und übergebener runId. | CODEX R8 Punkt 2. |
| Header + Punktestand | v1.7, 🐝 (einfach) | **v1.8**, 🐝🐝 (Schiedsrichter R6 + R7). | Schiedsrichter R7. |

---

## ÄNDERUNGEN v1.6 → v1.7 (DUELL-Runde 7-Härtung nach CODEX-Konter R7)

Berechtigte CODEX-Kritik R7 1:1 übernommen:

| Bereich | v1.6 | v1.7 | CODEX-Beleg |
|---|---|---|---|
| 4-Familien-Guard-Tabelle, Zeile `issueId-basiert` | mischte `confirmManualFix(issueId)` mit `refreshIssues(runId)` und `bulkConfirmDraftIssues(runId)` — unterschiedliche Eingangssignaturen in einer Zeile | **Aufgespalten:** `refreshIssues`/`bulkConfirmDraftIssues` wandern in die Zeile „explizit runId-parametrisiert"; eigene Zeile für `confirmManualFix(issueId)` mit State-Lookup-Pattern `state.issues.find(i => i.id === issueId)?.runId === currentRun.id`. | CODEX R7 Hauptrestpunkt 1. Real-Signatures: `runStore.ts:597,601,603`. |
| Ältere Erklärstellen bei Kind-Komponenten-Mutationen (A.4 Fix 3 Folge-Text + v1.3-Wirkungslogik) | trugen noch pauschalen Guard-Begriff „lineId-Prefix gegen currentRun.id" (vor-v1.6-Form) | **v1.7-Hinweisbox** unter Fix-3-Beschreibung ergänzt: „Details der Guard-Bedingung je Action-Familie siehe Tabelle in Staging-Vorschlag 1 (Sektion B). Der frühere Pauschal-Check ist seit v1.6 obsolet." | CODEX R7 Hauptrestpunkt 2. |
| `void scope;` Kommentar | als Zukunftsreserve markiert | unverändert — CODEX-Bewertung „kleiner Restpunkt"; v1.7 dokumentiert explizit: scope ist kein operativer Parameter in Iteration 1, bleibt nur im Signatur-Kontrakt. | CODEX R7 kleiner Restpunkt (anerkannt, keine Änderung nötig). |
| Header + Punktestand | v1.6 + 0:0 | **v1.7** + „Opus: 0 (🐝 Fleißbiene R6) \| CODEX: 0 (🟨🟨)" sichtbar. | Schiedsrichter R6. |

---

## ÄNDERUNGEN v1.5 → v1.6 (DUELL-Runde 6-Härtung nach CODEX-Konter R6)

Berechtigte CODEX-Kritik R6 1:1 übernommen (Code-Belege verifiziert):

| Bereich | v1.5 | v1.6 | CODEX-Beleg |
|---|---|---|---|
| AP7 `recalculateRunAfterMutation` — linePrefix | `invoiceLines.filter(l => l.lineId.startsWith(runId))` (matcht theoretisch fremde Runs mit gleichem Präfix) | **Präzisiert** auf real-code-konformen Pattern: `const linePrefix = \`${runId}-line-\`; invoiceLines.filter(l => l.lineId.startsWith(linePrefix))`. | `runStore.ts:2210`, `buildAutoSavePayload.ts:28`. CODEX R6 Punkt 2. |
| AP7 Helper — `scope`-Parameter | im Ablauf ungenutzt (nur in Signatur) | **`void scope;`** mit Doku-Kommentar: Aggregates/Issues sind scope-unabhängig; scope bleibt im Kontrakt für spätere scope-spezifische Kurzpfade (Signatur-Stabilität). | CODEX R6 Punkt 2. |
| Store-Action-Guard (Staging-Vorschlag 1) | pauschal `lineId.startsWith(currentRun.id)` bzw. `issue.runId === currentRun.id` | **Nach Action-Familie getrennt** (4 Familien: lineId-basiert, explizit-runId, positionIndex-only, issueId-basiert). Jede Familie hat eigene Guard-Bedingung mit Code-Anker. | CODEX R6 Punkt 1. |
| Header | v1.5 | **v1.6** + Verweis auf Delta-Sektion unten. | — |

---

## ÄNDERUNGEN v1.4 → v1.5 (DUELL-Runde 4-Härtung nach CODEX-Konter R4)

Berechtigte CODEX-Kritik R4 übernommen:

| Bereich | v1.4 | v1.5 | CODEX-Beleg |
|---|---|---|---|
| Staging-Vorschlag 3 | veralteter Gegnerbezug *„CODEX nennt im eigenen Block R3 nur `advanceToNextStep`, `retryStep`, `resumeRun`"* | **Entfernt.** Neue Formulierung nennt nur die 6 realen Trigger ohne Gegnervergleich. v1.5-Korrekturhinweis ergänzt: CODEX-R3 behandelt seit Runde 2 alle 6 Trigger. | CODEX R4 Punkt 2 |
| Header | v1.4 | **v1.5** + Verweis auf Delta-Sektion unten. | CODEX R5 Punkt 1 |
| AP7-Tabelle `setManualPrice*`/`setManualArticleByPosition`/`setManualArticleByLine` | als „FEHLT im Store" markiert (v1.4-Entscheidung) | unverändert — Code-Gap-Dokumentation bleibt ehrlich; Migration dieser Actions erst nach Impl-Schluss im Store. | CODEX R4 Punkt 1 (anerkannt als ehrliche Planbegrenzung, nicht Halluzination). |

---

## ÄNDERUNGEN v1.3 → v1.4 (DUELL-Runde 2-Härtung nach CODEX-Konter R2)

Berechtigte CODEX-Kritik R2 1:1 übernommen (Belege in Datei verifiziert):

| Bereich | v1.3 | v1.4 | CODEX-Beleg |
|---|---|---|---|
| B.6 AP2-Zeile | „retry-Zweig erhält neuen Pause-Check — erwünschte Härtung" (widersprach AP2 v1.3 bit-identisch) | **Entfernt.** Neue Zeile: retry bleibt `pauseCheck = () => false`, Pause-in-Retry als Sektion-B-Vorschlag. | CODEX R2 Punkt 1 |
| B.6 Grep-Audit | auf tote Namen (`setInvoiceLine`/`overrideArticleMatch`/`overrideOrderMatch`) | **Auf reale Action-Namen** (`updateInvoiceLine`, `updatePositionLines`, `setManualPrice*`, `setManualArticleByPosition`, `setManualOrder`, `reassignOrder`, `confirmNoOrder`). | CODEX R2 Punkt 2 |
| R3 in B.5 | „Pause-Check nach Guard Pflicht" (alle Trigger) | **Präzisiert:** nur `advanceToNextStep` + `resumeRun`; `retryStep` bit-identisch. | CODEX R2 Punkt 3 |
| AP7-Tabelle Belegdichte | Action-Oberfläche | **Typedef + Impl getrennt.** `setManualOrder`/`confirmNoOrder`/`reassignOrder` mit Impl-Anker (3070/3104/3137); `setManualPrice*`/`setManualArticleByPosition` nur Typedef (siehe Hinweis unten — reales Code-Gap). | CODEX R2 Punkt 3 |
| Header | v1.3 | **v1.4**, Punktestand-Zeile, Delta-Führung v1.3→v1.4 eingeführt. | CODEX R3 Punkt 2 |

**REAL-CODE-BEFUND (v1.4 ergänzt, relevant für AP7 und R7 beider Pläne):**
`setManualPrice`, `setManualPriceByPosition`, `setManualArticleByPosition`, `setManualArticleByLine` sind in `runStore.ts` **nur als Typedef** (Zeilen 612/614/616/618) deklariert. Eine Implementation im Store-File ist per `grep -n "^  setManualPrice:\|^  setManualArticleBy" runStore.ts` **nicht auffindbar**. Konsumenten: `IssueDialog.tsx:373/561`, `IssuesCenter.tsx:342/626/654`. Das ist ein **dokumentationsrelevantes Code-Gap**, kein Halluzinationsfehler — die Typedefs existieren real. Folge für AP7: diese Actions werden als „Migrations-Kandidat nach Impl-Schluss" markiert, nicht als „sofort migrieren". R7-Kontrakt selbst bleibt tragfähig.

---

## ÄNDERUNGEN v1.2 → v1.3 (DUELL-Runde 1-Härtung nach CODEX-Konter)

Berechtigte CODEX-Kritik 1:1 übernommen (mit Code-Beleg verifiziert):

| Bereich | v1.2 | v1.3 | CODEX-Beleg |
|---|---|---|---|
| AP7 Aufrufsites | `setInvoiceLine*`, `overrideArticleMatch`, `confirmCandidate`, `overrideOrderMatch` | **Halluzination gestrichen.** Reale API-Namen eingesetzt: `updateInvoiceLine`, `updatePositionLines`, `setManualPrice`, `setManualPriceByPosition`, `setManualArticleByPosition`, `setManualOrder`, `reassignOrder`, `confirmNoOrder`, `confirmManualFix`, `bulkConfirmDraftIssues`, `refreshIssues`. | `rg "overrideArticleMatch\|confirmCandidate\|overrideOrderMatch" src/` → **0 Treffer**. Realnamen siehe `runStore.ts:566-636`. |
| Fix 3 (RunDetail-Action-Guard) | als „v2.2-Pflicht" markiert | **Zu Defense-in-Depth degradiert + Scope-Ehrlichkeit.** Fix 3-Guard in RunDetail schützt **nur** die 3 lokalen Mutationen (`resumeRun`, `reprocessCurrentRun`, `retryStep` — `RunDetail.tsx:677`, `:688`, `:771`). Kind-Komponenten-Mutationen (`IssueDialog.updateInvoiceLine` RunDetail.tsx-nahes Child, `WarehouseLocations.updateInvoiceLine`, `IssuesCenter.bulkConfirmDraftIssues`, `ManualOrderPopup.reassignOrder`) **werden von Fix 3 NICHT abgedeckt**. Schutz dort durch Fix 1 + Fix 2 (kein destruktiver Reset → keine stale-state-Mutation). | `IssueDialog.tsx:749`, `WarehouseLocations.tsx:45`, `IssuesCenter.tsx:441`, `ManualOrderPopup.tsx:44`. |
| AP2 retry Pause-Check | „Mini-Verhaltensänderung OK" (widerspricht Leitprinzip) | **Entfernt aus AP2.** `retryStep` bleibt in AP2 **bit-identisch** zu `runStore.ts:2083-2142` (kein Pause-Check). Pause-während-Retry als separater Vorschlag in Sektion B (INVARIANTS.md), nicht in Iteration 1. | `runStore.ts:2087` (heute: direktes `await runStepGuard` ohne vorgelagerten Pause-Return). |
| Blueprint-Version | zitiert v2.0 → v2.2 | unverändert gegenüber v1.2 | — |
| AP4 | Split nach Verben | Ownership-Matrix zuerst (unverändert gegenüber v1.2) | — |
| AP7-Scope | ganze Issue-Modell-Migration | Aggregates + Step-5-Issues; `autoResolveIssues` SSOT (unverändert gegenüber v1.2) | — |

---

## INHALT

- [Teil A — Bug-Analyse + v2.2-konformer Fix](#teil-a--bug-analyse--v22-konformer-fix)
- [Teil B — Refactoring-Plan](#teil-b--refactoring-plan)
  - [B.3 Arbeitspakete AP1–AP7 (AP2/AP4/AP7 wasserdicht)](#b3-arbeitspakete)
  - [B.4 Ownership-Matrix (neu, vor AP4)](#b4-ownership-matrix)
  - [B.5 Konzeptionelle Regeln R1–R8](#b5-konzeptionelle-regeln-r1r8)

---

# Teil A — Bug-Analyse + v2.2-konformer Fix

## A.1 Log-Fakten (unverändert gegenüber v1.1)

```
11:00:13  Ingest vollständig, 4 IDB-Snapshots ready
11:00:14  [StepGuard] Step 3: Reparatur gestartet (serialData)   ← Step 3 läuft
11:00:14  [Seriennummer anfuegen] Auto-Start: Matcher Serial-Extraktion (Step 3)
11:00:14  ERROR [Artikel extrahieren] [StepGuard] Step 2 blockiert:
          Step 1 muss zuerst laufen (parsedInvoiceResult/invoiceLines fehlen)
```

## A.2 Code-Evidenz (im Quelltext verifiziert)

| Stelle | Verhalten | Blueprint v2.2 |
|---|---|---|
| `runStore.ts:670-693` `resetRunSensitiveState` | Leert 14 run-sensitive Felder | „Während `status='running'` MÜSSEN erhalten bleiben: `preFilteredSerials`, `serialDocument`, `parsedPositions`, `parsedInvoiceResult`" (CIRCUIT A17) |
| `runStore.ts:973-978` `setCurrentRun` | Ruft bedingungslos `resetRunSensitiveState`, bevor `currentRun` gesetzt wird | „Destruktiver Reset im Selection-Setter — darf nur bei echtem Run-Wechsel feuern" (Tab 3, Lifecycle-Regel) |
| `RunDetail.tsx:391-398` | useEffect mit `[decodedRunId, runs, setCurrentRun]` + Cleanup `() => setCurrentRun(null)` | **Beides** ist in Blueprint v2.2 explizit als „bekannte aktuelle Abweichung / Risk Item" markiert. |
| `RunDetail.tsx:403-412` | Bedingungsloser `loadPersistedRun(decodedRunId)` | „Mount-Aufruf nur als runId-gebundene Rehydrierung erlaubt … kein blindes Nachladen wenn derselbe Run bereits konsistent im RAM aktiv ist." |

## A.3 Race-Rekonstruktion (Kurzfassung)

1. `startWorkflowPhase2` legt Step 2 auf `running` und startet Wrapper-P2 (`await runStepGuard(2)` pending).
2. `navigate` → RunDetail mountet.
3. useEffect feuert → `setCurrentRun(run)` → `resetRunSensitiveState()` → `parsedInvoiceResult=null`, `parsedPositions=[]`, `currentParsedRunId=null`.
4. Wrapper-P2 wird fortgesetzt → Guard liest leeren Store → `blockReason` → Step 2 failed.
5. runs mutiert → useEffect feuert erneut (Dependency `runs`!) → Schadens-Wiederholung.
6. Step 3 bekommt asymmetrischen Reparatur-Pfad in `runStepGuard` (serialData aus IDB rehydriert) → läuft durch → Log-Reihenfolge wie beobachtet.

## A.4 v2.2-konformer Fix — drei Bausteine (ein Commit)


# 🛑 [MILESTONE 1 - HOLD] SEKTOR: BASIS-FIXES (TEIL A)
---
*Regel: Nach Umsetzung der Fixes 1-3 erfolgt ein harter Stopp für Code-Änderungen.*


### Fix 1 — Idempotenz-Guard in `setCurrentRun`
**WICHTIG (R1 / A13 Konformität):** Es MUSS ein sofortiges `return` erfolgen, wenn die ID gleich bleibt, um unnötige React-Re-Renders zu verhindern.
```ts
setCurrentRun: (run) => {
  const prevId = get().currentRun?.id ?? null;
  const nextId = run?.id ?? null;
  // PROJ-46 R1 / INVARIANTS A13: Reset NUR bei echtem Identitätswechsel.
  if (prevId === nextId) return; // Idempotenter Skip (verhindert Re-Renders)
  
  resetRunSensitiveState(get, set);
  set({ currentRun: run });
},
```

### Fix 2 — RunDetail-Lifecycle v2.2-konform
**WICHTIG (INVARIANTS A16 Konformität):** Async Load-Effekte MÜSSEN ein lokales Abort-Pattern (`isSubscribed`) nutzen, um Stale-Promises nach Unmount zu verhindern.

```tsx
// Einheitlicher Mount-Effekt. Dependency: NUR decodedRunId.
// KEIN destruktiver Unmount. KEIN runs-Abo.
useEffect(() => {
  if (!decodedRunId) return;
  let isSubscribed = true; // A16: Abort-Pattern für Async-Loads

  const s = useRunStore.getState();
  const inStore = s.runs.find(r => r.id === decodedRunId)
               || mockRuns.find(r => r.id === decodedRunId);
  const phase2Active = s.currentRun?.id === decodedRunId
                    && s.currentRun?.steps.some(st => st.status === 'running');

  if (inStore) {
    s.setCurrentRun(inStore);
  }

  // A15/A16: loadPersistedRun NICHT blind.
  if (!(inStore && phase2Active)) {
    setLoadingPersisted(true);
    s.loadPersistedRun(decodedRunId)
      .then((found) => {
        if (!isSubscribed) return; // Stale-Promise Guard
        if (!found) console.warn("Run nicht gefunden");
      })
      .finally(() => {
        if (isSubscribed) setLoadingPersisted(false);
      });
  }

  return () => { isSubscribed = false; }; // Clean-Up für Async-Guard
}, [decodedRunId]);
```

### Fix 3 — Render-/Action-Guard (Defense-in-Depth)
**WICHTIG:** Der Guard muss zwingend `decodedRunId` nutzen (URL-Wahrheit) UND muss auf alle Run-sensitiven Mutationen (inkl. `pauseRun`) angewendet werden!

```ts
// Zentrale Helper-Funktion in RunDetail.tsx:
function withRunGuard<T>(decodedId: string | undefined, fn: () => T): T | void {
  const cr = useRunStore.getState().currentRun;
  if (!decodedId || cr?.id !== decodedId) {
    console.warn(`[RunDetail] Aktion abgelehnt: currentRun=${cr?.id} != decoded=${decodedId}`);
    return;
  }
  return fn();
}

// Anwendung auf ALLE 4 lokalen Action-Buttons:
onClick={() => withRunGuard(decodedRunId, () => useRunStore.getState().resumeRun(decodedRunId))}
onClick={() => withRunGuard(decodedRunId, () => useRunStore.getState().reprocessCurrentRun(decodedRunId))}
onClick={() => withRunGuard(decodedRunId, () => useRunStore.getState().retryStep(decodedRunId, nextStep.stepNo))}
onClick={() => withRunGuard(decodedRunId, () => useRunStore.getState().pauseRun(decodedRunId))} // pauseRun explizit geschützt!
```

**Rendering-Seite:** Komponenten, die run-sensitive Felder lesen (`parsedPositions`, `serialDocument`, `preFilteredSerials`, `parsedInvoiceResult`), renderen einen neutralen Ladezustand, solange `currentRun?.id !== decodedRunId`. Kein Fallback-Render mit leeren Arrays (der heute still S/N=0 produziert).

### Warum die Drei-Bausteine-Ordnung so bleibt (v1.3 realitätsbereinigt)

- **Fix 1** stoppt den beobachteten Bug beim Ownership-Race.
- **Fix 2** schließt die Klassen „destruktiver Unmount" und „runs-Dependency refeuert" → damit operieren auch die unter Fix 3 nicht abgedeckten Kind-Komponenten (`IssueDialog`, `WarehouseLocations`, `IssuesCenter`, `ManualOrderPopup`) nicht mehr auf gerade geleertem Store.
- **Fix 3** ist Defense-in-Depth für die 3 RunDetail-lokalen Mutationen während Reload-Hydration (Fenster zwischen Mount und `loadPersistedRun`-Resolve). **Nicht v2.2-Pflicht**, sondern additiv.
- **Iteration-2-Vorschlag** (Sektion B der Projektdatei): Store-seitiger Action-Guard in allen Mutations-Actions. **v1.7-Hinweis:** Guard-Bedingung richtet sich nach Action-Familie (lineId-basiert, explizit runId-Parameter, positionIndex-only, issueId-basiert) — siehe 5-Familien-Tabelle in Staging-Vorschlag 1. Die Formulierung „prüft lineId-Prefix/Issue-runId gegen currentRun.id" galt pauschal in v1.4 und ist seit v1.6 obsolet.

## A.5 Regression-Matrix

| Szenario | Verhalten v1.2 |
|---|---|
| Echter Wechsel A→B | `prevId !== nextId` ⇒ Reset (R1 korrekt) |
| RunDetail unmount (Back-Navigation) | **Kein** destruktiver Reset mehr. Nächster Mount trägt den Reset bei echtem Wechsel. |
| runs-Array mutiert während Phase 2 | Effect feuert **nicht** mehr (Dependency nur `decodedRunId`) |
| Reload `/run/{id}` | `inStore=undefined` → `loadPersistedRun` → `setCurrentRun` mit `prevId=null` → Reset (korrekt) |
| Retry-Button vor Store-Rehydrierung | `withRunGuard` blockt → keine Aktion, Log-Warn statt Schaden |
| Pause/Resume während Step 3 | Guard-durchlauf intakt; kein Unmount-Cleanup vernichtet S/N-Puffer |
| Failed Ingest + Retry | `cleanupFailedIngest` ruft `resetRunSensitiveState` direkt — unverändert |

---

# Teil B — Refactoring-Plan

## B.0 Leitplanken (unverändert aus v1.1)

KISS · keine funktionalen Änderungen · Step4Block unantastbar · IDB-First · Anti-Looping nach 3 Fix-Versuchen.


# 🛑 [MILESTONE 2 - HOLD] SEKTOR: STORE-AUDIT & CLEANUP (AP1-AP2)
---
*Regel: Erst nach erfolgreichem Test von Teil A darf dieser Sektor betreten werden.*


## B.1 Ist-Zustand

Unverändert aus v1.1 (9 Komplexitätsherde), plus explizit ergänzt:

- **Trigger-Asymmetrie in Skip-Pfaden ist Absicht, nicht Bug** (CIRCUIT A16). Jede Vereinheitlichung muss die zwei Pfade **beibehalten**, nicht abschaffen.
- **Pause-Semantik ist Trigger-spezifisch** (advance: 2× Check, retry: 0× Check, resume: clear+1× Check). Trigger-Wissen kann nicht aus einem gemeinsamen Kern gelesen werden.

## B.2 Ziel-Architektur

Unverändert aus v1.1 (Aggregator + 5 Slices). AP4-Details in [B.4](#b4-ownership-matrix).

## B.3 Arbeitspakete

### AP1 — Phase-Awareness + R1 (unverändert aus v1.1 inhaltlich)

Fixe A.4 (drei Bausteine) ⇒ Codifizierung als R1. Audit-Schritt: `rg -n "setCurrentRun|resetRunSensitiveState" src/` → jeder Call gegen A14/A15/A17 prüfen.

### AP2 — Entry-Point-Deduplikation (**neu konzipiert**)

**Verworfen:** generischer Wrapper mit internem `switch(trigger)`. Unterschiede wären halb versteckt, halb explizit — die schlechteste Welt.

**Neu:** Der gemeinsame **Kern** ist schmal; jeder Trigger behält seine **Prelude** und **Postlude** offen sichtbar.

```ts
// store/internal/stepRunner.ts (< 60 LOC)
// Kapselt AUSSCHLIESSLICH: "führe Guard aus, prüfe Block/Skip, rufe Execute".
// KEIN Pause-Handling, KEIN Status-Reset, KEIN Skip-Postlude-Advance.
export type StepRunOutcome =
  | { kind: 'blocked';  reason: string }
  | { kind: 'skipped';  reason: string }          // Caller entscheidet Legacy vs. Targeted Advance
  | { kind: 'executed' };                          // execute wurde aufgerufen

export async function runStepCore(
  stepNo: 2 | 3 | 4,
  runId: string,
  get: GetState, set: SetState,
  pauseCheck: () => boolean,                      // Trigger-spezifisch injiziert
  execute: () => void | Promise<void>,            // Trigger liefert die konkrete Execute-Funktion
): Promise<StepRunOutcome> {
  if (pauseCheck()) return { kind: 'blocked', reason: '__paused__' };
  const guard = await runStepGuard(stepNo, runId, get, set);
  if (pauseCheck()) return { kind: 'blocked', reason: '__paused__' };
  if (guard.blockReason) return { kind: 'blocked', reason: guard.blockReason };
  if (guard.skipReason)  return { kind: 'skipped', reason: guard.skipReason };
  await execute();
  return { kind: 'executed' };
}
```

Die **drei Call-Sites behalten ihre Trigger-Identität**:

```ts
// advanceToNextStep, Step 3 Ast (Legacy-Advance bei Skip — A16!):
void (async () => {
  const r = await runStepCore(3, runId, get, set,
    () => get().isPaused,
    () => { logService.info('Auto-Start: Matcher Serial-Extraktion (Step 3)', ...); get().executeMatcherSerialExtract(); });
  if (r.kind === 'blocked' && r.reason === '__paused__') return;
  if (r.kind === 'blocked') { logService.error(...); get().updateStepStatus(runId, 3, 'failed'); return; }
  if (r.kind === 'skipped') {
    logService.info(...);
    get().updateStepStatus(runId, 3, 'ok');
    get().advanceToNextStep(runId);          // ← LEGACY (kein completedStepNo) — umgeht Waiting-Point bewusst
  }
})();

// retryStep, Step 3 Ast — v1.3 BIT-IDENTISCH zum heutigen Code (runStore.ts:2101-2125):
get().updateStepStatus(runId, 3, 'running');      // PRELUDE: retry-spezifischer Status-Reset
get().updateRunStatus(runId, 'running');
void (async () => {
  const r = await runStepCore(3, runId, get, set,
    () => false,                                   // v1.3: KEIN Pause-Check (heute in retryStep auch nicht — runStore.ts:2087). Pause-in-Retry-Semantik ist separater Vorschlag in Sektion B (INVARIANTS), NICHT in Iteration 1.
    () => get().executeMatcherSerialExtract());
  if (r.kind === 'skipped') {
    get().updateStepStatus(runId, 3, 'ok');
    if (!get().isPaused) get().advanceToNextStep(runId, 3);  // ← TARGETED — Waiting-Point greift (unverändert)
  }
  // blocked/executed wie oben
})();

// resumeRun:
set({ isPaused: false });                         // PRELUDE: resume-spezifisch
get().updateRunStatus(runId, 'running');
const running = run.steps.find(s => s.status === 'running');
void (async () => {
  const r = await runStepCore(running.stepNo, runId, get, set,
    () => get().isPaused,
    () => dispatchExecute(running.stepNo));
  if (r.kind === 'skipped' && running.stepNo === 3) {
    get().updateStepStatus(runId, 3, 'ok');
    if (!get().isPaused) get().advanceToNextStep(runId, 3);  // ← TARGETED (wie heute)
  }
})();
```

**Was AP2 liefert (v1.3):**
- Der **Guard-Execute-Kern** ist 1× statt 3× geschrieben.
- Die **Trigger-Unterschiede** (Pause-Regime, Failed→Running-Transition bei retry, Pause-Clear bei resume, Skip-Legacy vs. Skip-Targeted) bleiben **sichtbar am Call-Site** — nicht versteckt.
- **NULL Verhaltensänderung.** `pauseCheck` ist im retry-Zweig `() => false` — entspricht 1:1 dem heutigen `runStore.ts:2083-2142`. Bit-Identität vollständig gewahrt.
- Pause-in-Retry-Härtung wird in Sektion B von INVARIANTS.md als separater Vorschlag verankert (nicht Iteration 1).

**Berührt:** `runStore.ts` (3 Funktionen), neue Datei `stepRunner.ts` (~60 LOC).
**Nicht berührt:** `execute*`, StepGuard, Self-Advance, Waiting-Point-Logik (A16), Step-Status-Transitionen.


# 🛑 [MILESTONE 3 - HOLD] SEKTOR: ARCHITEKTUR-REFACTOR (AP3-AP4)
---
*Regel: Erst nach erfolgreichem Test von Sektor 2 darf dieser Sektor betreten werden.*


### AP3 — Step 4 IDB-First final + R4 (unverändert aus v1.1)

Vorgehen identisch. AP3.1 als Puffer, falls `parsedOrderPool` ein Feld fehlt.

### AP4 — Slice-Split mit Ownership-Matrix voran (**neu konzipiert**)

**v1.1-Fehler:** Split nach Verben. Felder wie `parsedInvoiceResult`, `parsedPositions`, `serialDocument`, `orderPool` werden heute aus Ingest, Workflow, Persistence, Reprocess und Mutations gleichzeitig geschrieben. Ein reiner Move-Split würde Cross-Slice-`get()`-Calls vervielfachen.

**v1.2-Soll (Reihenfolge zwingend):**

1. **Phase 4a — Ownership-Matrix erstellen** (Output: `store/internal/ownership.md`, Audit-Artefakt). Siehe B.4.
2. **Phase 4b — Refactor-Leitplanken verankern:** Für jedes Feld genau **ein Slice = Primärer Writer**; Sekundäre Writer gehen durch eine Action-Methode des Primär-Slices, nicht direkt via `set()`.
3. **Phase 4c — Mechanischer Move** erst, wenn 4a+4b konsistent sind und `madge --circular` leer ist.

**Abbruchkriterium 4a:** Wenn ein Feld nicht eindeutig einem Slice zugeordnet werden kann, gehört es in `runCrudSlice` (neutraler Boden) mit Setter-Actions. Kein Split „wurschtelt" es quer.


# 🛑 [MILESTONE 4 - HOLD] SEKTOR: FINALE & UI-SYNC (AP5-AP7)
---
*Regel: Erst nach erfolgreichem Test von Sektor 3 darf dieser Sektor betreten werden.*


### AP5 — `lastOrderParserDiagnostics` entfernen (unverändert aus v1.1)

### AP6 — `renameRun` konsolidieren + R6 (unverändert aus v1.1)

### AP7 — Deklarative Blocker-Matrix + R7 (**neu konzipiert**)

**Ziel 1 — Blocker-Matrix deklarativ (`isIssueBlockingStep`-Lookup).** Unverändert aus v1.1.

**Ziel 2 — `recalculateRunAfterMutation` — KISS, ohne Issue-Origin-Migration**

Die Halluzination `source='manual'` ist ersatzlos gestrichen. Stattdessen:

```ts
// store/slices/mutationSlice.ts
/**
 * PROJ-46 R7: Einheitlicher Pfad, der nach einer manuellen Mutation den Run konsistent macht.
 *
 * KONTRAKT:
 *   IN : runId
 *   OUT: void (Seiteneffekte auf issues + runs/currentRun.stats)
 *
 * v1.10 (Bonus-Runde 1, KISS-Subtraktion): `scope`-Parameter entfernt.
 * Begründung: Der Helper hat keinen scope-abhängigen Pfad (alle 5 Schritte laufen
 * für jeden scope identisch). YAGNI > Signatur-Stabilität-ohne-Use-Case.
 * Falls später scope-spezifische Kurzpfade gebraucht werden, Parameter dann ergänzen.
 *
 * VERHALTEN:
 *   (a) Aggregates neu rechnen:  computeMatchStats + computeOrderStats + expandedLineCount.
 *   (b) Bestehenden SSOT `autoResolveIssues(issues, runLines, runId)` AUFRUFEN.
 *       → resolveRules liegen weiterhin in `checkIssueStillActive` (runStore.ts:248–299).
 *       → Diese Funktion kennt bereits die korrekten Primitive:
 *         `line.manualStatus`, `line.priceCheckStatus`, `line.matchStatus`,
 *         `line.orderAssignmentReason`, `line.serialRequired`, `line.allocatedOrders`.
 *       → Insbesondere bleibt die bestehende Auto-Resolve-Kette für Preis/Artikel/Supplier/
 *         Serial/Order-Issues (runStore.ts:2287, 2331, 2571, 3204) 1:1 erhalten — KEINE
 *         Regression bei manuellen Fixes.
 *   (c) Step-5-Issues regenerieren: `generateStep5Issues(runId)` — deterministisch aus Lines.
 *   (d) Step-Status NICHT automatisch ändern. KEIN advanceToNextStep.
 *   (e) Auto-Save-Flush optional anstoßen (Debounce greift ohnehin).
 *
 * NICHT enthalten:
 *   - Neue Issue-Klassifikation (source/origin). Issue-Modell bleibt unverändert.
 *   - Engine-/Matcher-Ergebnisse werden NICHT überschrieben. Sie fließen nur über
 *     `autoResolveIssues` in den Resolved-Zustand — so wie heute.
 *   - Step 2–4-Issues werden NICHT aus R7 heraus neu erzeugt; das bleibt Sache der
 *     Execute-Funktionen bei einem Re-Run.
 */
recalculateRunAfterMutation: (runId) => {
  const { invoiceLines, issues, orderPool } = get();
  // linePrefix-Kontrakt aus bestehendem Code (runStore.ts:2210, buildAutoSavePayload.ts:28).
  const linePrefix = `${runId}-line-`;
  const runLines = invoiceLines.filter(l => l.lineId.startsWith(linePrefix));

  // (a) Stats
  const matchStats = computeMatchStats(runLines);
  const orderStats = computeOrderStats(runLines);

  // (b) Auto-Resolve durch bestehenden SSOT — KEIN eigener Auflösungs-Code
  const resolved = autoResolveIssues(issues, runLines, runId);

  // (c) Step-5-Issues (missing-storage-location, export-no-lines, etc.)
  //     generateStep5Issues ist bereits idempotent und re-rechnet aus Lines.
  set({ issues: resolved });
  get().generateStep5Issues(runId);

  // (d) Stats in runs/currentRun pushen — Step-Status bleibt unberührt.
  set((state) => ({
    runs: state.runs.map(r =>
      r.id === runId ? { ...r, stats: { ...r.stats, ...matchStats, ...orderStats } } : r),
    currentRun: state.currentRun?.id === runId
      ? { ...state.currentRun, stats: { ...state.currentRun.stats, ...matchStats, ...orderStats } }
      : state.currentRun,
  }));
}
```

**Migrations-Aufrufsites (v1.4 — Typedef + Implementation-Anker, Belegdichte angehoben):**

| Reale Action | Typedef (runStore.ts) | Implementation (runStore.ts) | Frontend-Aufrufer |
|---|---|---|---|
| `updateInvoiceLine(lineId, updates)` | 566 | 2278 | `IssueDialog.tsx:749`, `WarehouseLocations.tsx:45` |
| `updatePositionLines(positionIndex, updates)` | 568 | 2306 | — |
| `setManualPrice(lineId, price)` | 612 | **FEHLT im Store** — nur Typedef vorhanden, 0 Impl-Treffer in `runStore.ts` (v1.4 verifiziert per `grep -n "setManualPrice"`). Migration erst nach Impl. | — |
| `setManualPriceByPosition(positionIndex, price, runId)` | 614 | **FEHLT im Store** — nur Typedef. Konsumenten bereits aktiv (`IssueDialog.tsx:561`, `IssuesCenter.tsx:626`, `:654`). Migration erst nach Impl. | `IssueDialog.tsx:561`, `IssuesCenter.tsx:626,654` |
| `setManualArticleByPosition(positionIndex, data, runId)` | 616 | **FEHLT im Store** — nur Typedef. Migration erst nach Impl. | `IssueDialog.tsx:561`, `IssuesCenter.tsx:626-654` |
| `setManualArticleByLine(lineId, data, runId)` | 618 | **FEHLT im Store** — nur Typedef. In keinem der bekannten Konsumenten aufgerufen. Kandidat für Streichen (AP5-ähnlich), nicht für R7-Migration. | — |
| `setManualOrder(lineId, orderYear, orderCode)` | 633 | 3070 | — |
| `reassignOrder(lineId, newOrderPositionId, freeText?)` | 636 | 3137 | `ManualOrderPopup.tsx:44,65-67` |
| `confirmNoOrder(lineId)` | 634 | 3104 | — |
| Ausroll-Übergang in `run3ExpandFifo` | `src/services/run3ExpandFifo.ts` | — | Nur Daten-Recount; Step4Block-Logik unverändert |

**Nicht migriert (bewusst):**

- `confirmManualFix` (`runStore.ts:2666`), `bulkConfirmDraftIssues` (`runStore.ts:2705`), `reopenIssue`, `refreshIssues` (`runStore.ts:2568`) — diese Funktionen **haben** bereits die richtige Sequenz (invoiceLines-Update → `refreshIssues` → `autoResolveIssues` → Stats, siehe `runStore.ts:2694`, `runStore.ts:2770`). R7 ist deren **Generalisierung**, nicht deren Ersatz. Sie können später auf R7 umgezogen werden, aber nicht in dieser Iteration.
- **Engine-/Matcher-Ergebnisse** in `executeMatcherCrossMatch`/`executeMatcherSerialExtract`/`executeOrderMapping` — diese sind KEINE Mutationen, sondern Execute-Resultate. R7 greift NICHT ein.

**Berührt:** `runStore.ts` + `mutationSlice.ts` + einzelne Edit-Komponenten (die heute direkt mutieren).
**Nicht berührt:** Auto-Advance, Step-Status-Transitionen, `autoResolveIssues`-Implementierung, Engine-Funktionen, Issue-Modell.

**Gewinn:** Ein einziger, auditierbarer Aufrufpunkt für „was passiert nach einer manuellen Änderung" — **ohne** neue Felder, **ohne** Issue-Modell-Migration, **ohne** Regressionsrisiko für den bestehenden manuellen Fix-Vertrag.

## B.4 Ownership-Matrix

Die folgenden Felder wurden im Code als run-sensitiv identifiziert (`resetRunSensitiveState` + CIRCUIT A17 + Live-Writes-Scan). Jedes hat genau einen **Primärwriter-Slice**; alle anderen Writes gehen zwingend durch dessen Action.

| Feld | Primärwriter | Sekundäre Writer (heute direkt) | Ziel-Slice | Umzug |
|---|---|---|---|---|
| `parsedInvoiceResult` | `parseInvoiceForIngest` | `resetRunSensitiveState`, `loadPersistedRun`, `reprocessCurrentRun` | **ingestSlice** | Sekundäre gehen durch `ingestSlice.hydrateParsedInvoice(payload\|null)` |
| `parsedPositions` | `parseInvoiceForIngest` | `loadPersistedRun`, `reprocessCurrentRun`, `resetRunSensitiveState` | **ingestSlice** | wie oben |
| `parserWarnings` | `parseInvoiceForIngest` | `resetRunSensitiveState` | **ingestSlice** | trivial |
| `serialDocument` | `ingestAndPersistRunData` (Sub-3b) | `loadPersistedRun`, `reset` | **ingestSlice** | `ingestSlice.hydrateSerialDocument()` |
| `preFilteredSerials` | `ingestAndPersistRunData` (Sub-3b) | `loadPersistedRun`, `reset` | **ingestSlice** | dito |
| `uploadedFiles` | `startNewRun`/UI-Drop | `cleanupFailedIngest`, `resetRunSensitiveState` | **ingestSlice** (im Zuge AP3 kandidiert für `runCrudSlice`) | Entscheidung in 4a |
| `orderPool` / `parsedOrderPool` | `ingestAndPersistRunData` (Sub-3d) | `loadPersistedRun`, Override-Actions | **ingestSlice** (Schreib), **mutationSlice** (Override-Actions rufen ingestSlice-Setter) |
| `currentParsedRunId` | `parseInvoiceForIngest` (Rename) | `renameRun` (AP6), `reset` | **runCrudSlice** (gehört zu Identität) | R6 macht Rename atomar |
| `isWaitingBeforeStep4`, `waitingStep4RunId`, `showStep4WaitingDialog` | `advanceToNextStep`-Targeted | `proceedStep4FromWaiting`, `dismissStep4WaitingDialog`, `reset` | **workflowSlice** | zu A16 gehörig — dort belassen |
| `isPaused` | `pauseRun`/`resumeRun` | `startWorkflowPhase2` (Init-Clear) | **workflowSlice** | dito |
| `latestDiagnostics` | `runStepGuard` / Execute-Funktionen | `reset` | **workflowSlice** | dito |
| `lastOrderParserDiagnostics` (deprecated) | — | — | entfernt in AP5 | — |

**Regel aus der Matrix (neu, R8-Kandidat):** *Sekundäre Writer eines Feldes rufen eine Action des Primär-Slices. Direktes `set({ feld: … })` außerhalb des Primär-Slices ist ab AP4 verboten.*

(Als R8-Vorschlag in Sektion B der Projektdatei eintragen; nicht sofort als R1-Regel aktiv, da erst AP4 die Slices schafft.)

**6 Engine-Entry-Points (CIRCUIT A1) → Slice-Zuordnung:**

| Entry-Point | Slice | Begründung |
|---|---|---|
| `advanceToNextStep(runId, stepNo?)` | workflowSlice | Primär-Dispatcher |
| `retryStep(runId, stepNo)` | workflowSlice | Trigger-Variante |
| `resumeRun(runId)` | workflowSlice | Trigger-Variante |
| `proceedStep4FromWaiting()` | workflowSlice | an A16 gebunden |
| `reprocessCurrentRun()` | workflowSlice | orchestriert mehrere Resets + advance |
| `startWorkflowPhase2(runId)` | ingestSlice | Bridge von Phase 1 nach Phase 2; nicht Workflow-intern |

## B.5 Konzeptionelle Regeln R1–R8

| # | Regel | Ankerpunkt | Quelle |
|---|---|---|---|
| **R1** | Setter sind nicht destruktiv. `setCurrentRun` löscht nur bei Identitätswechsel. | AP1 / A.4 Fix 1 | Probe-Run-Bug |
| R2 | Phase 1 ist abgeschlossen, bevor Phase 2 startet. | Unverändert | Blueprint Tab 1 |
| R3 | Step-Executer haben genau eine Self-Advance-Stelle. Pause-Check nach Guard Pflicht **nur für `advanceToNextStep` und `resumeRun`** — `retryStep` bleibt bit-identisch (heute kein Pause-Check, Zeile 2087). | AP2, INVARIANTS A11 | — |
| **R4** | stepGuard darf nur aus IDB (`falmec-receiptpro-runs`) und `masterDataStore` lesen. Keine `uploadedFiles`, kein Live-Parsing. | AP3 | — |
| R5 | IDB ist SSOT für Run-Daten. Legacy-Pfad in Step 4 ist letzte Ausnahme. | AP3 | Blueprint v2.2 |
| **R6** | Rename ist atomar — ein `set(...)`. Rename darf R1-Reset auslösen (korrekt). | AP6 | — |
| **R7** | **Workflow-Isolations-Gesetz (HARD RULE):** Innerhalb von PROJ-46 ist es STRIKT UNTERSAGT, Workflow-Trigger (`advanceToNextStep` etc.) direkt an UI-Edit-Elemente zu binden. Jede manuelle Korrektur (Preis, Artikel, S/N) MUSS zwingend über den Intermediär `recalculateRunAfterMutation` fließen. Ein direkter Status-Schreibzugriff aus einem Dialog heraus führt zum sofortigen Abbruch der Aufgabe! | AP7 / UI-Edits | Lokales Projektgesetz |
| **R8** | **Primärwriter-Regel (Keine Zirkelbezüge):** Run-sensitive Felder haben genau EINEN Primärwriter-Slice. Sekundäre Writes MÜSSEN durch die Actions dieses Primär-Slices gehen. Direkte `set()` Aufrufe auf fremde Felder sind strengstens verboten. | AP4 / B.4 | Lokales Projektgesetz |

## B.6 Risiken-Matrix (AP2/AP4/AP7 verschärft)

| AP / Regel | Hauptrisiko | Mitigation |
|---|---|---|
| AP2 | Skip-Pfad-Verwechslung (Legacy vs. Targeted → Waiting-Point bricht) | Runner liefert nur `{kind:'skipped'}` — **Caller** wählt Advance-Form. Testfälle: (1) autoStartStep4=false + Skip in advance → Waiting NICHT ausgelöst; (2) autoStartStep4=false + Skip in retry → Waiting ausgelöst; (3) autoStartStep4=false + Skip in resume → Waiting ausgelöst. |
| AP2 | Bit-Identität für `retryStep` könnte später ungewollt durch Pause-Check aufgeweicht werden | v1.4 **eindeutig:** retry-Zweig behält heutiges Verhalten (`pauseCheck = () => false`, siehe `runStore.ts:2083-2142`). Pause-in-Retry ist **nicht** Teil von AP2. Separater Vorschlag in Sektion B (siehe „Neue Vorschläge" Punkt 2). |
| AP4 | Feld ohne klaren Primärwriter | Abbruchregel: neutrales `runCrudSlice` mit Setter-Actions. Kein Rennen zwischen Slices. |
| AP4 | Zyklische Imports | `madge --circular` Pre-Commit, Importreihenfolge aus B.4 ableiten |
| AP7 | `recalculateRunAfterMutation` maskiert einen ehemals geprüften Engine-Issue-Zustand | R7 ändert `autoResolveIssues`-Inhalt **nicht** — es ruft nur auf. Regression = reine Regression der heutigen `autoResolveIssues`-Kette, die gleich bleibt. |
| AP7 | Migrierte Edit-Komponente vergisst R7-Aufruf | **Grep-Audit auf reale Action-Namen** (v1.8: `setManualArticleByLine` ergänzt nach CODEX R8 Punkt 1): `rg -n "updateInvoiceLine\|updatePositionLines\|setManualPrice\|setManualPriceByPosition\|setManualArticleByPosition\|setManualArticleByLine\|setManualOrder\|reassignOrder\|confirmNoOrder" src/components` — jeder Writer außerhalb von `confirmManualFix`/`bulkConfirmDraftIssues`/`refreshIssues` muss mit R7-Call enden. |
| AP7 | Step-5-Issue-Regen triggert Auto-Advance | `generateStep5Issues` ändert nur `issues`; kein Advance-Aufruf darin. Verifiziert im Code. |

## B.7 Reihenfolge

```
Teil A (Fix 1 + Fix 2 + Fix 3 — ein Commit)
  ▼
AP1  Phase-Awareness/R1 verankern + Audit-Sweep
  ▼
AP2  stepRunner-Kern (schmal) + Call-Site-Migration, Waiting-Point-Tests
  ▼
AP3  Step-4-IDB-First + R4
  ▼
AP4a  Ownership-Matrix (B.4) als ausführbares Audit
AP4b  Leitplanken: direkte set()-Writes verbieten
AP4c  Mechanischer Move (madge-frei)
  ▼
AP5  lastOrderParserDiagnostics entfernen
  ▼
AP6  renameRun zentralisieren (R6)
  ▼
AP7  Blocker-Matrix deklarativ + recalculateRunAfterMutation (KISS, R7)
```

**Abbruch-akzeptable Zwischenstände:** Nach Teil A bugfrei. Nach AP1/AP3 strukturell tragfähig. AP4–AP7 reiner Wartbarkeitsgewinn.

**Harte Abbruchkriterien (Anti-Looping):** 3 fehlgeschlagene Fix-Versuche je AP → STOP, Eskalation.

---

## Annex — Audit-Response-Tabelle

| Audit-Punkt | Antwort v1.2 |
|---|---|
| Kritisch: AP7 `source='manual'` ist Halluzination | **Akzeptiert.** R7 nutzt ausschließlich existierende Primitive (`line.manualStatus`, `line.articleSource`, `autoResolveIssues`). Issue-Modell bleibt unverändert. |
| Kritisch: AP7 widerspricht Manual-Fix-Vertrag | **Akzeptiert.** R7 **ruft** `autoResolveIssues` auf, ersetzt es nicht. Engine-/Matcher-Issues bleiben auto-resolvable wie heute (Zeilen 2287/2331/2571/3204 bleiben 1:1). |
| Hoch: AP2 unterschlägt Skip-Pfad-Unterschied | **Akzeptiert.** Neu-Design: Runner liefert `skipped`, Caller wählt Legacy vs. Targeted Advance. A16-Semantik bleibt. |
| Hoch: AP2 Trigger-Prelude/-Postlude nicht abgedeckt | **Akzeptiert.** Pause-Clear, Failed→Running, Skip-Advance bleiben explizit am Call-Site. |
| Hoch: Teil A nur v2.0-konform | **Akzeptiert.** v2.2-konform: Fix 2 (Unmount-Entkopplung + nur `[decodedRunId]`), Fix 3 (Render/Action-Guard). |
| Hoch: AP4 verschiebt Chaos statt es zu kapseln | **Akzeptiert.** AP4a (Ownership-Matrix) vor AP4c (Move). R8 als neue Regel. |

**v1.3 — Keine Selbst-Confidence-Schätzung.** Score für diesen Plan wird ausschließlich vom Gegner (CODEX) in dessen nächster Runde vergeben (Duell-Regel Schritt 4).

---

## Neue Vorschläge (Sektion B — Staging, nicht Iteration 1)

Aus der Härtung gegen CODEX emergent, für Dom-Freigabe:

1. **Store-seitiger Action-Guard in Mutations-Actions** (deckt alle Kind-Komponenten-Writer ab, nicht nur RunDetail-lokale).
   *v1.6: Guard-Vertrag nach Action-Familie getrennt — nicht mehr ein pauschaler `lineId.startsWith`-Check:*

   | Familie | Guard-Bedingung | Reale Actions |
   |---|---|---|
   | **lineId-basiert** | `lineId.startsWith(\`${currentRun.id}-line-\`)` (linePrefix-Vertrag aus `runStore.ts:2210`) | `updateInvoiceLine(lineId, …)`, `setManualPrice(lineId, …)`, `setManualOrder(lineId, …)`, `reassignOrder(lineId, …)`, `confirmNoOrder(lineId)` |
   | **explizit runId-parametrisiert** | `runId === currentRun.id` | `setManualPriceByPosition(pos, price, runId)`, `setManualArticleByPosition(pos, data, runId)`, `refreshIssues(runId)`, `bulkConfirmDraftIssues(runId)` |
   | **dual parametrisiert (lineId + runId)** | `runId === currentRun.id && lineId.startsWith(\`${runId}-line-\`)` — beide Bedingungen defense-in-depth; erkennt sowohl Run-Wechsel als auch mismatch zwischen lineId-Prefix und übergebener runId. | `setManualArticleByLine(lineId, data, runId)` (Typedef `runStore.ts:618`) |
   | **positionIndex-only, kein runId am Eingang** | Guard gegen `currentRun` implizit: wenn `currentRun` null oder gerade wechselt → no-op. Zusätzlich: invoiceLine zum positionIndex muss zum currentRun gehören. | `updatePositionLines(positionIndex, updates)` |
   | **issueId-basiert (state-lookup)** | `state.issues.find(i => i.id === issueId)?.runId === currentRun.id` | `confirmManualFix(issueId, …)` |

   *v1.8-Korrektur (CODEX R8 Punkt 2):* `setManualArticleByLine(lineId, data, runId)` in eigene Zeile „dual parametrisiert" gezogen. Guard nutzt beide verfügbaren Parameter — stärker als reiner `runId`-Check, weil ein mismatch zwischen lineId-Prefix und runId (theoretisch möglich bei Bug in Caller) zusätzlich erkannt wird.
   *v1.7-Korrektur (CODEX R7 Punkt 1):* `refreshIssues(runId)` und `bulkConfirmDraftIssues(runId)` sind signaturseitig `runId`-parametrisiert — gehören NICHT in die issueId-Zeile. Eigene Zeile für `confirmManualFix(issueId)` mit State-Lookup-Pattern.
   *v1.6-Korrektur:* v1.4-Fassung war pauschal `lineId.startsWith(currentRun.id)` — das matcht `updatePositionLines`/`setManualPriceByPosition`/`setManualArticleByPosition` am Eingang nicht. CODEX R6 Punkt 1.
   *CONFI: 85 %.* Freigabe: `[ ]` Dom.

2. **Pause-Check in `retryStep` ergänzen** (Härtung gegen Pause-während-Retry-Race).
   *Heute: `runStore.ts:2083-2142` hat keinen Pause-Check in retry. Ein pausierter Run kann durch Klick auf „Retry" unbemerkt weiterlaufen. Als separate Iteration nach AP2, damit Bit-Identität in AP2 sauber gewahrt bleibt.*
   *CONFI: 80 %.* Freigabe: `[ ]` Dom.

3. **CIRCUIT A1 — 6 Entry-Points explizit in INVARIANTS.md verankern.**
   *Real sind folgende Engine-Trigger aktiv: `startWorkflowPhase2`, `advanceToNextStep`, `retryStep`, `resumeRun`, `proceedStep4FromWaiting`, `reprocessCurrentRun`. Als 6er-Liste in CIRCUIT A1 / INVARIANTS.md-Sektion-B verankern, damit Refactor-Arbeiten an einzelnen Triggern die Gesamt-Abdeckung nicht verlieren.*
   *CONFI: 90 %.* Freigabe: `[ ]` Dom.
   *v1.5-Korrektur:* Veralteter Gegnerbezug entfernt. CODEX-R3 behandelt seit Runde 2 alle 6 Trigger — der frühere Bezug galt nur v1.1-CODEX.
