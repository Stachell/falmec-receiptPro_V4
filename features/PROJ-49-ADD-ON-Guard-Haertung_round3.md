# PROJ-49 ADD-ON Guard-Haertung — Round 3 v2: Verdrahtungskollision Phase-2-Start

> Erstellt: 2026-03-30
> Letzte Aktualisierung: 2026-03-30 (v2 — fatale Logikluecke in v1 behoben)
> Erstellt von: Opus (Planungsmeister)
> Grundlage: Diagnostik-Ergebnis aus Round 2 + Diagnose-Tool-Fund (Doppel-Effect-Problem)
> Status: **PLAN — noch keine Code-Aenderungen durchgefuehrt**
> Tracking: Dieses Dokument ist das zentrale Tracking fuer diesen Fix.

---

## Befund: Verdrahtungskollision beim Navigieren auf RunDetail

### Symptom

Phase 1 startet den Workflow perfekt (Motor laeuft, `currentRun` ist im Zustand-Store live). Sobald die App auf `/run/:runId` navigiert, mountet `RunDetail.tsx` und zerstoert den laufenden Workflow durch zwei Initialisierungs-Effects, die sich gegenseitig sabotieren.

### Ursache: Zwei Effects, die zusammen eine toedliche Kaskade bilden

**Effect 1 (Zeile 392-399) — `setCurrentRun`:**

```typescript
useEffect(() => {
  // Find run by ID - first search in store runs (real runs), then fallback to mock data
  const run = runs.find(r => r.id === decodedRunId) || mockRuns.find(r => r.id === decodedRunId);
  if (run) {
    setCurrentRun(run);
  }
  return () => setCurrentRun(null);
}, [decodedRunId, runs, setCurrentRun]);
```

**Problem:** `setCurrentRun()` ruft intern `resetRunSensitiveState()` auf. Das **leert** alle globalen Felder (`parsedArticlePool`, `parsedOrderPool`, etc.) — selbst wenn der uebergebene Run identisch mit dem aktuellen ist. Ergebnis: Der Motor laeuft, aber der Treibstoff (die geparsten Daten) wird abgepumpt.

**Effect 2 (Zeile 404-413) — `loadPersistedRun`:**

```typescript
// --- PROJ-40 6B / PROJ-49 SSOT: IndexedDB-Nachladen — immer aufrufen,
//     damit globale Felder (parsedArticlePool etc.) aus IDB-Snapshot befüllt werden.
const [loadingPersisted, setLoadingPersisted] = useState(false);
useEffect(() => {
  if (!decodedRunId) return;

  setLoadingPersisted(true);
  useRunStore.getState().loadPersistedRun(decodedRunId)
    .then((found) => {
      if (!found) console.warn(`[RunDetail] Run ${decodedRunId} weder in Memory noch IndexedDB`);
    })
    .finally(() => setLoadingPersisted(false));
}, [decodedRunId]);
```

**Problem:** Laedt bedingungslos den IDB-Snapshot, der zum Zeitpunkt der Navigation noch den alten Stand hat. Ueberschreibt den Live-State mit veralteten Daten.

### Warum v1 des Plans falsch war

v1 wollte nur Effect 2 mit einem Guard blockieren, Effect 1 aber unveraendert lassen. Das haette bedeutet:
1. Effect 1 feuert → `setCurrentRun(run)` → `resetRunSensitiveState()` leert `parsedArticlePool` etc.
2. Effect 2 wird durch Guard blockiert (Run ist ja schon im Store).
3. Ergebnis: `parsedArticlePool` ist leer, wird nie wiederhergestellt → **fataler Datenverlust**.

### Die korrekte Loesung: Beide Effects zu EINEM verschmelzen

Wenn der Run bereits mit korrekter ID im Store liegt, darf **weder** `setCurrentRun` **noch** `loadPersistedRun` aufgerufen werden. Beide Effects muessen daher durch einen einzigen, intelligenten Effect ersetzt werden.

---

## Fix-Uebersicht

| # | Titel | Datei | Schwere | Status |
|---|-------|-------|---------|--------|
| 1 | Zwei Initialisierungs-Effects → ein intelligenter Guard-Effect | `src/pages/RunDetail.tsx` | **KRITISCH** | [ ] offen |

---

## Fix 1: Kombinierter Guard-Effect in `RunDetail.tsx`

### Betroffene Stelle

**Datei:** `src/pages/RunDetail.tsx`, Zeile 392-413 (beide Effects + `loadingPersisted`-State)

### VORHER (zwei separate Effects, Zeile 392-413)

```typescript
  useEffect(() => {
    // Find run by ID - first search in store runs (real runs), then fallback to mock data
    const run = runs.find(r => r.id === decodedRunId) || mockRuns.find(r => r.id === decodedRunId);
    if (run) {
      setCurrentRun(run);
    }
    return () => setCurrentRun(null);
  }, [decodedRunId, runs, setCurrentRun]);

  // --- PROJ-40 6B / PROJ-49 SSOT: IndexedDB-Nachladen — immer aufrufen,
  //     damit globale Felder (parsedArticlePool etc.) aus IDB-Snapshot befüllt werden.
  const [loadingPersisted, setLoadingPersisted] = useState(false);
  useEffect(() => {
    if (!decodedRunId) return;

    setLoadingPersisted(true);
    useRunStore.getState().loadPersistedRun(decodedRunId)
      .then((found) => {
        if (!found) console.warn(`[RunDetail] Run ${decodedRunId} weder in Memory noch IndexedDB`);
      })
      .finally(() => setLoadingPersisted(false));
  }, [decodedRunId]);
```

### NACHHER (ein kombinierter Guard-Effect)

```typescript
  // --- PROJ-49 Round 3: Kombinierter Initialisierungs-Guard ---
  // Schuetzt laufende Workflows: Wenn der Run bereits live im Store liegt,
  // wird NICHTS aufgerufen (kein setCurrentRun, kein loadPersistedRun).
  // Nur bei Reload/Direkt-URL/Run-Wechsel wird aus IDB nachgeladen.
  const [loadingPersisted, setLoadingPersisted] = useState(false);
  useEffect(() => {
    if (!decodedRunId) return;

    // Guard: Run bereits mit dieser ID im Store? → Motor laeuft, nicht anfassen!
    const currentRunId = useRunStore.getState().currentRun?.id;
    if (currentRunId === decodedRunId) {
      return;
    }

    // Fallback: Run nicht im Memory (Reload, Direkt-URL, anderer Run) → aus IDB laden.
    // loadPersistedRun() setzt intern currentRun + rehydriert alle SSOT-Felder sicher.
    setLoadingPersisted(true);
    useRunStore.getState().loadPersistedRun(decodedRunId)
      .then((found) => {
        if (!found) console.warn(`[RunDetail] Run ${decodedRunId} weder in Memory noch IndexedDB`);
      })
      .finally(() => setLoadingPersisted(false));

    return () => setCurrentRun(null);
  }, [decodedRunId]);
```

### Erklaerung der Aenderung (Schritt fuer Schritt)

1. **Effect 1 (Zeile 392-399) wird KOMPLETT GELOESCHT.** Er hat keine Daseinsberechtigung mehr. Sein `setCurrentRun(run)`-Aufruf ist im Erfolgsfall redundant (Phase-1-Navigation: Run ist schon im Store) und im Reload-Fall wird `loadPersistedRun` diese Aufgabe sicher uebernehmen.

2. **Effect 2 (Zeile 401-413) wird durch den neuen Guard-Effect ersetzt.** Die Struktur bleibt aehnlich, aber mit dem entscheidenden Guard am Anfang.

3. **Guard-Logik (neu):**
   - `const currentRunId = useRunStore.getState().currentRun?.id;`
   - `if (currentRunId === decodedRunId) return;` — Run ist live, NICHTS tun.
   - Ansonsten: `loadPersistedRun` aufrufen (wie bisher, fuer Reload/Direkt-URL/Run-Wechsel).

4. **Cleanup:** `return () => setCurrentRun(null);` bleibt erhalten (aus dem alten Effect 1 uebernommen), damit beim Verlassen der Seite der Run sauber aus dem Store entfernt wird.

5. **Dependency-Array:** `[decodedRunId]` — genau wie der alte Effect 2. Die Abhaengigkeiten `runs` und `setCurrentRun` aus dem alten Effect 1 entfallen, weil wir `runs.find()` nicht mehr aufrufen und `setCurrentRun` nur noch im Cleanup verwendet wird (stabile Referenz bei Zustand).

### Warum `loadPersistedRun` das `setCurrentRun` ersetzt

`loadPersistedRun` in `runStore.ts` laedt den Run aus der IDB und setzt dabei intern `currentRun` + alle SSOT-Felder (`parsedArticlePool`, `parsedOrderPool`, etc.) **atomar**. Es gibt keinen Zwischenzustand mit geleerten Feldern. Deshalb ist es der sichere Ersatz fuer das rohe `setCurrentRun(run)`, das nur den Run-Header setzte aber die SSOT-Felder durch `resetRunSensitiveState` zerstoerte.

---

## Aenderungen — Gesamtuebersicht

| Datei | Stelle | Aktion |
|-------|--------|--------|
| `src/pages/RunDetail.tsx:392-399` | Erster useEffect (`setCurrentRun`) | **KOMPLETT LOESCHEN** |
| `src/pages/RunDetail.tsx:401-413` | Zweiter useEffect (`loadPersistedRun`) | Ersetzen durch neuen Guard-Effect (siehe "Nachher") |

**Keine weiteren Dateien betroffen.** Kein Interface-Change, kein Store-Umbau, kein Persistenz-Change.

---

## Validierung nach Umsetzung

### TypeScript-Pruefung

```bash
npx tsc --noEmit
# Erwartung: 0 Errors
```

### Regressions-Checkliste

| # | Test-Szenario | Erwartung | Status |
|---|---------------|-----------|--------|
| 1 | Phase 1 starten → App navigiert auf RunDetail → Workflow laeuft weiter | `currentRun` UND `parsedArticlePool` bleiben intakt, Phase 2 startet normal | [ ] |
| 2 | Direkter URL-Aufruf `/run/INV-123` (kein Run im Store) | Run wird aus IDB geladen inkl. aller SSOT-Felder, UI zeigt korrekte Daten | [ ] |
| 3 | F5-Reload auf RunDetail-Seite | Run wird aus IDB nachgeladen, alle Felder rehydriert, Workflow kann fortgesetzt werden | [ ] |
| 4 | Von Run A zu Run B navigieren | Run B wird aus IDB geladen (andere ID als `currentRun`) | [ ] |
| 5 | RunDetail-Seite verlassen | `setCurrentRun(null)` wird durch Cleanup aufgerufen, Store ist sauber | [ ] |
| 6 | Phase 1 → Phase 2 → Phase 3 Durchlauf komplett | Kein Regressionsbruch im gesamten Workflow | [ ] |

---

## Abhaengigkeiten

Dieser Fix ist **vollstaendig unabhaengig** von den Round-2-Fixes (Fix 1-4). Er kann vor, nach oder parallel zu diesen umgesetzt werden.

---

## Nützliche Hinweise für Sonnet

> **ACHTUNG — Nur diese eine Datei anfassen: `src/pages/RunDetail.tsx`**
>
> **Konkret zu tun (3 Schritte):**
>
> 1. **LOESCHEN:** Den ERSTEN `useEffect` (Zeile 392-399, der mit `setCurrentRun(run)`) **komplett entfernen** — inklusive aller Zeilen von `useEffect(() => {` bis einschliesslich `}, [decodedRunId, runs, setCurrentRun]);`. Dieser Effect ist die Wurzel des Problems und wird NICHT ersetzt, sondern ersatzlos gestrichen.
>
> 2. **ERSETZEN:** Den ZWEITEN `useEffect` (Zeile 401-413, der mit `loadPersistedRun`) durch den neuen Guard-Effect aus dem "Nachher"-Block oben ersetzen. Der `const [loadingPersisted, setLoadingPersisted] = useState(false);` bleibt bestehen.
>
> 3. **PRUEFEN:** `npx tsc --noEmit` ausfuehren — es duerfen keine neuen Fehler entstehen.
>
> **Was NICHT gemacht werden soll:**
> - Keine Aenderungen an `runStore.ts`, `stepGuard.ts`, `NewRun.tsx` oder anderen Dateien.
> - Keine neuen Hooks, Utilities oder Abstraktionen einfuehren.
> - Keine bestehenden Imports aendern oder neue hinzufuegen (der `mockRuns`-Import bleibt, da er ggf. anderswo in der Datei genutzt wird).
> - Die `loadPersistedRun`-Funktion selbst NICHT modifizieren — nur den Aufruf in `RunDetail.tsx` bewachen.
> - Den alten Effect 1 NICHT durch einen neuen Effect ersetzen — er wird GELOESCHT, nicht umgebaut.
