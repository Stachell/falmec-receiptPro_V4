## INVARIANTS.md — Architektur-Gesetze (Store Slices & Workflow-Engine)

> **Was ist das hier?** Strukturelle Wahrheiten über die Codebasis.
> Keine Werte, keine Zeilennummern — nur Regeln die gelten solange die Architektur existiert.
> **Wer muss das lesen?** Jeder Agent (Opus, Sonnet, Codex) BEVOR er plant oder codet.
> **Zusammenspiel:** INVARIANTS.md (Gesetze) + CIRCUIT.md (Verdrahtung) + STANDARDS.md (Design/UI).
> **Wichtig:** Nur Regeln in Sektion A sind aktiv. Sektion B enthält Vorschläge die noch geprüft werden.
> **Version:** 1.7 (Nach Slice-Split M3 & M3.5)

---

## A. Aktive Regeln (bestätigt & verbindlich)

### A1. Die Drillinge

`advanceToNextStep`, `retryStep` und `resumeRun` manipulieren dieselbe Step-State-Machine.
Wer eine dieser Funktionen ändert, MUSS die anderen beiden auf Konsistenz prüfen.
Gleiches gilt für `proceedStep4FromWaiting` und `reprocessCurrentRun` — beides sind Eintrittspunkte in denselben State-Flow.
`startWorkflowPhase2` ist der vorgelagerte Phase-2-Controller derselben Engine und darf bei
Änderungen am Einstieg in die State-Machine ebenfalls nicht vergessen werden.

**Warum?** Historisch enthielt `resumeRun` eine 250-Zeilen-Kopie der `advanceToNextStep`-Logik. Divergenz zwischen den Kopien war die häufigste Ursache für Regressions-Bugs.

### A2. Step-Status-Übergänge sind Einbahnstraßen

```
not-started → running → ok | failed | soft-fail
```

Kein Step darf von `ok` zurück auf `running` gesetzt werden.
Kein Step darf von `not-started` direkt auf `ok` springen ohne den Zwischenschritt `running`.
**Ausnahme:** Skip-Pfade (Guard sagt "überspringen") setzen direkt auf `ok` — aber NUR über den dokumentierten Guard-Pfad, nie manuell.

### A3. Ein Step, ein Besitzer

Zu jedem Zeitpunkt darf maximal EIN Step den Status `running` haben.

**Wichtig nach Modus unterscheiden:**
- `advanceToNextStep(runId, completedStepNo)` im **Targeted Mode** MUSS abgewiesen werden, wenn bereits ein anderer Step `running` ist (Idempotenz-Guard).
- `advanceToNextStep(runId)` im **Legacy Mode** darf genau EINEN vorhandenen `running`-Step konsumieren: laufenden Step finalisieren (`ok`) und dann den nächsten `not-started` Step starten.

**Warum?** Ohne diese Regel entstehen "Blinde Advances" — ein verspäteter Callback setzt den falschen Step auf `ok`.

### A4. Kein setTimeout für Workflow-Control-Flow

Timer (`setTimeout`) dürfen NICHT verwendet werden um auf async Operationen zu warten, Steps zu advancen oder Guard-Ergebnisse abzuwarten.
**Stattdessen:** `async/await` mit explizitem Self-Advance am Ende der Execute-Funktion.

**Warum?** Timer sind blind. Sie wissen nicht ob die async Operation fertig ist. Das Ergebnis sind Race Conditions.

> **WARNUNG (Tech Debt):** Die Nutzung eines Auto-Advance-Timers in Step 1 ist eine bekannte Architekturverletzung und dient NICHT als Vorbild für neue Flows.

### A5. Self-Advance gehört in die Execute-Funktion

Der Aufruf `advanceToNextStep(runId, completedStepNo)` darf NUR an diesen Stellen stehen:
- Am Ende einer erfolgreichen Execute-Funktion
- Im Skip-Pfad eines Guards (wenn ein Step übersprungen wird)
- In einem Bypass-Pfad der den Step auf `ok` setzt ohne Execute aufzurufen

NICHT in Timern. NICHT in externen Callbacks. NICHT in UI-Handlern.

**Warum?** Die Execute-Funktion (oder der Skip-Pfad) ist die einzige Stelle die weiß, ob die Arbeit fertig ist oder übersprungen wurde.

> **WARNUNG (Tech Debt):** Die Nutzung eines Auto-Advance-Timers in Step 1 ist eine bekannte Architekturverletzung und dient NICHT als Vorbild für neue Flows.

### A6. Step 4 ist eine geschützte Zone

Step 4 hat drei Code-Pfade: **SSOT**, **Legacy** und **OpenWE**.
Diese drei Pfade bilden eine logische Einheit.

Regeln:
- Wer Step 4 anfasst, muss ALLE DREI Pfade prüfen — auch wenn der Bug nur in einem auftritt.
- Die Orchestrierungslogik darf nur an EINER Stelle leben, nicht dupliziert.
- Der Waiting-Point-Guard (`autoStartStep4`) muss VOR dem async Block geprüft werden, nicht darin.

### A7. Async und Sync nicht mischen

Wenn eine Funktion intern `await` nutzt (IDB-Read, File-Parse), dann:
- Darf der Aufrufer NICHT annehmen, dass das Ergebnis nach dem sync Return vorliegt
- Muss der Aufrufer entweder selbst `await`en oder das Ergebnis via Self-Advance-Pattern abwarten

### A8. Guards sind Pflicht

Kein Step darf gestartet werden ohne vorherigen Guard-Check. Das gilt für Advancement,
Retry und Resume.

**Konkrete Guard-Form je Step (implementierungsnah):**
- **Steps 2–4:** Guard-Check läuft über `runStepGuard(stepNo, runId, get, set)` inklusive
  Repair-Pfad (`validateStepPrerequisites` → `applyStepRepairs`).
- **Step 3 intern:** Der Guard MUSS die async-Variante `validateStep3Async` nutzen
  (SSOT-IDB-Read).
- **Step 5 (dokumentierte Ausnahme):** direkter `validateStepPrerequisites(5, ...)` ohne
  `runStepGuard`-Wrapper und ohne Repair-Pfad. Aufruf erfolgt im Step-5-Zweig von
  `advanceToNextStep` unmittelbar vor `generateStep5Issues`.

Advancement, Retry und Resume müssen den jeweils dokumentierten Guard-Pfad einhalten. Der
Guard-Check als Prinzip bleibt verbindlich — nur seine technische Form variiert zwischen
Steps 2–4 und Step 5.

### A9. Kein State-Read ohne verifizierten Write

Wenn neuer Code einen State-Wert liest, MUSS verifiziert sein dass dieser Wert vorher geschrieben wird.
Zusätzlich: Es darf keinen Pfad geben der den Write UMGEHT aber trotzdem den nachfolgenden Schritt braucht (Skip-Pfade, Early-Returns mit `ok`, Guard-Skips). Solche Bypass-Pfade brauchen einen EIGENEN Advance-Aufruf.

**Prüfmethode:** Für jeden Read im neuen Code: Rückwärts tracen zum Write. Dann: Gibt es einen Pfad der am Write vorbeiführt aber trotzdem advancen muss?

### A10. Neue Konstrukte brauchen mindestens gleichwertige Fehlerbehandlung

Wenn ein Konstrukt durch ein anderes ersetzt wird, MUSS das neue mindestens dieselben Fehlerklassen abfangen.
Konkret: `void (async () => { ... })()` ohne try/catch erzeugt Unhandled Promise Rejections. Jeder solche Block MUSS ein umschließendes try/catch haben.

### A11. Optionale Parameter brauchen explizites Branching

Wenn eine bestehende Funktion einen neuen optionalen Parameter bekommt, MUSS der erste Code-Block ein expliziter `if (param !== undefined) { ... } else { ... }` Branch sein. Ohne explizites Branching werden Guards des neuen Modus auf `undefined`-Werte angewendet und crashen.

### A12. Keine Code-Rekonstruktion aus dem Gedächtnis

Pläne dürfen KEINE Code-Snippets enthalten die aus dem Gedächtnis rekonstruiert wurden.
Der Plan beschreibt WAS geändert wird, WO (Funktion + Position) und UNTER WELCHEN BEDINGUNGEN.
Konkrete Datenstrukturen, Feldnamen, Zugriffsmuster und Syntax werden AUSSCHLIESSLICH in Phase V gegen den echten Code validiert.

**Warum?** Aus dem Gedächtnis rekonstruierter Code enthält systematisch falsche Annahmen über Datenstrukturen (Array vs. Dictionary), vergessene Funktionsreferenzen und fehlende Exit-Pfade. Diese Fehler werden in den Plan eingebettet und bei der Implementierung multipliziert.

**Regel:** Wenn ein Plan ein Code-Snippet enthält, MUSS Phase V dieses Snippet Zeile für Zeile gegen den echten Code validieren. Nicht-validierte Snippets dürfen nicht implementiert werden.

### A13. Idempotenz an der React/Store-Grenze (Context-Switching)

Keine blinden Resets oder Overwrites durch React-Mounts. Jede Store-Funktion, die den globalen Arbeitskontext wechselt (wie `setCurrentRun(run: Run | null)`), MUSS als allererste Anweisung prüfen, ob der Ziel-Kontext bereits aktiv ist:

```typescript
if (run !== null && run.id === get().currentRun?.id) return;
```

**Dispatch-Vollständigkeit (alle 4 Fälle):**

| Eingabe | `get().currentRun?.id` | Guard | Verhalten |
|---|---|---|---|
| `run: Run` mit matching id | match | `true` | return sofort — idempotenter Skip |
| `run: Run` mit anderer id | andere / undefined | `false` | Durchlauf — Reset + Set |
| `run: null` | beliebig | `false` | Durchlauf — Cleanup (Reset + Set null) |
| `run: Run`, currentRun === null | undefined | `false` | Durchlauf — erster Run-Load |

**Kritisch — `null` darf NICHT verschluckt werden:** Cleanup-Pfade (z. B. Unmount des Mount-Effects) rufen `setCurrentRun(null)` auf und müssen den Reset auslösen dürfen. Unsichere Formulierungen wie `if (run?.id === get().currentRun?.id) return` sind verboten — sie würden `null === undefined → true` werten und den Cleanup blockieren.

**Warum?** React-Komponenten (UI) mounten und unmounten unvorhersehbar. Wenn der Store bei einem Re-Mount den laufenden Kontext blind zurücksetzt, werden asynchrone Hintergrundprozesse (Promises), die sich auf diesen Store verlassen, zerstört. Der Store schützt sich selbst durch ID-Abgleich.

### A14. UI-Mount Data Fetching (Store First)

React-Komponenten dürfen asynchrone Fetch/Load-Methoden des Stores (z.B. `loadPersistedRun`) in ihren `useEffect`-Hooks NUR bedingt aufrufen.

**Regel:** Die Komponente MUSS vorher synchron prüfen, ob die benötigten Daten bereits im Store liegen.
`if (useRunStore.getState().currentRun?.id !== targetId) { loadPersistedRun(...) }`

**Warum?** Wenn Workflow-Controller (wie `startWorkflowPhase2`) den Store bereits vorbereitet haben, darf das nachfolgende UI-Mounting diesen frischen In-Flight-State nicht mit veralteten Daten aus der IDB überschreiben. Der Store ist die Source of Truth, nicht der Component-Lifecycle.

### A15. React Mount-Effekte & Store-Dependencies

Mount-Effekte (`useEffect`), die einen globalen Kontext initialisieren, dürfen KEINE reaktiven Store-Objekte (wie Arrays oder tiefe Objekte z.B. `runs`) im Dependency-Array haben.

**Regel:** Daten müssen im Effekt punktuell und nicht-reaktiv via `getState()` ausgelesen werden (z.B. `useRunStore.getState().runs.find(...)`).
**Warum?** Da asynchrone Hintergrund-Workflows den Store im Millisekundentakt updaten, würden reaktive Dependencies endlose Re-Renders oder zerstörerische Reset-Loops auslösen.

### A16. UI-Lifecycle darf laufende Workflow-Steps nicht killen

Die UI ist Beobachter, nicht Besitzer des Workflow-Motors. UI-Mounts und Unmounts dürfen während laufender Workflows KEINEN destruktiven Reset run-sensitiver State-Felder auslösen.

**Regeln:**
- Async Load-Effekte, die nach einem Unmount noch per `.then`/`.finally` zurückkehren können, brauchen ein lokales Abort-/Subscription-Pattern (z. B. lokales `isSubscribed`-Flag), damit Stale-Promises keine Store-Updates mehr auslösen.
- Mount-Effekte, die den globalen Run-Kontext initialisieren, müssen synchron vorher per `getState()` prüfen, ob der Ziel-Kontext bereits aktiv ist (Store-First-Guard) — und reaktive Store-Arrays/Objekte dürfen nicht im Dep-Array stehen.
- Ein koordinierter, symmetrischer Cleanup ist zulässig, solange er durch Store-First-Guard, stabile Effect-Dependencies und lokales Abort-/Subscription-Pattern abgesichert ist.
- Verboten ist der unkoordiniert-destruktive Cleanup, der `setCurrentRun(null)` bzw. `resetRunSensitiveState()` zu jedem reaktiven Store-Update auslösen kann.

**Warum?** Die Gefahr entsteht nicht primär durch beliebige Mid-Execute-Live-Reads, sondern
durch destruktive Resets kurz VOR Guard/Step-Start, beim Re-Entry nach Mount/Unmount oder
zwischen Status-Übergabe und Folge-Step. Die betroffenen Step-Pfade hängen an
run-sensitiven Store-Feldern wie `parsedPositions`, `preFilteredSerials`,
`serialDocument` und `parsedInvoiceResult`; einige Execute-Funktionen snapshotten diese
Felder bereits beim Eintritt. Ein unkoordinierter Reset in diesem Zeitfenster führt zu
stillen Fallback-/Skip-/Blockerpfaden statt zu einer lauten Exception.

### A17. Die 6 unantastbaren Entry-Points der Engine

Es gibt exakt 6 Eintrittspunkte in die State-Machine: `startWorkflowPhase2`, `advanceToNextStep`, `retryStep`, `resumeRun`, `proceedStep4FromWaiting`, `reprocessCurrentRun`. Wer einen anfasst, muss die anderen auf Konsistenz prüfen.
*AUSNAHME-KLAUSEL:* Diese Liste ist fest. Sollte für einen Bugfix oder ein Feature eine Änderung zwingend notwendig sein, gilt HARTER STOPP. Erkläre dem User (Dom) die technische Notwendigkeit und warte auf explizite Freigabe. Keine eigenmächtigen Umbauten!

### A18. Der 5-Familien-Action-Guard (Defense-in-Depth)

Mutationen werden streng nach ihrer Signatur-Familie abgesichert (1. lineId-basiert, 2. explizit runId, 3. dual parametrisiert, 4. positionIndex-only, 5. issueId-basiert).
*AUSNAHME-KLAUSEL:* Diese Guard-Struktur ist unser fixes Sicherheitsnetz. Sollte eine Komponente oder Action sich absolut nicht in dieses Schema pressen lassen, gilt HARTER STOPP. Lösungsvorschlag erarbeiten, Dom fragen, auf Freigabe warten.

### A19. Entkopplung von UI-Interaktion und Workflow-Logik

UI-Komponenten rufen fachliche Actions auf, anstatt Workflow-Status-Übergänge direkt zu steuern. Die Engine entscheidet autonom basierend auf dem Resultat einer Action über den Folgezustand. Dies sichert die Architektur gegen unvorhergesehene State-Sprünge aus der View-Ebene ab.


---


## B. Vorgeschlagene Regeln (noch nicht bestätigt — NICHT verbindlich)

> **Agenten:** Nur Sektion A ist bindend. Sektion B ist rein informativ — befolge diese Regeln NICHT.
> **Dom:** Prüfe diese Vorschläge wenn du Zeit hast:
> - Markiere mit `[✓]` → Agent verschiebt nach Sektion A beim nächsten Task.
> - Markiere mit `[✗]` → Agent löscht den Eintrag beim nächsten Task.

### Format für neue Vorschläge:

> **B[Nr]. [Titel]**
> `CONFI: HIGH | MID | LOW` — [Einzeiler-Begründung]
> `QUELLE:` [Ticket/Projektdatei]
> [Beschreibung der Regel]

> **B1. Wachhund-Payload-Kongruenz-Regel**
> `CONFI: HIGH` — Der `Zustand.subscribe`-Skip-Diff eines AutoSave-Hooks MUSS in einer der folgenden Formen jedes Feld abdecken, das der zugehörige Payload-Builder in die IDB schreibt:
> (a) **direkte Beobachtung:** Das Payload-Feld wird mit `===`-Referenzvergleich verglichen.
> (b) **Ableitungs-Abdeckung:** Das Payload-Feld ist eine direkte, verlässliche Projektion eines anderen beobachteten Feldes (z.B. ist `uploadMetadata` eine `.map()`-Projektion von `uploadedFiles`).
> Umgekehrt: Ein Feld, das weder Payload-Mitglied noch Ableitungsquelle eines Payload-Feldes ist, hat im Wachhund-Diff nichts zu suchen (Dead-Trigger-Verbot).
> `QUELLE:` PROJ-46 M3.5 Leak-Patch

---
*Letzte Aktualisierung: 2026-04-20 | Version 1.7*
