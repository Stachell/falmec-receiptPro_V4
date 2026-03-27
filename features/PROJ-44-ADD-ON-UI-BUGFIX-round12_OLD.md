# PROJ-44 ADD-ON — UI-BUGFIX Round 12 (Reparaturplan)

> **PFLICHTLEKTÜRE VOR BEGINN:** `features/PROJ-44-ADD-ON-SOLL-ZUSTAND.md`
> Lies das Manifest KOMPLETT, bevor du eine einzige Zeile Code anfasst.

---

## Übersicht: 4 Reparaturen

| # | Symptom | Kernursache | Tatort |
|---|---------|-------------|--------|
| 1 | Hard-Guard versagt (Preis-Blocker rennt durch) | Snapshot-Datenleiche + Default `false` | `runStore.ts`, `types/index.ts` |
| 2 | KISS-Flow sabotiert (Auto-Resolve nach Preiswahl) | Eigenmächtiger `refreshIssues`-Aufruf | `runStore.ts` → `setManualPriceByPosition` |
| 3 | Dead Clicks im IssueDialog | Portal-Gefängnis (Popover-Klicks von Dialog geschluckt) | `IssueDialog.tsx`, `PriceCell.tsx` |
| 4 | PDF-Datenverlust beim Reprocess | Auto-Save nullt `parsedPositions` bei ID-Flackern | `buildAutoSavePayload.ts`, `RunDetail.tsx` |

---

## Reparatur 1: Hard-Guard versagt

### Big Picture
Der Preis-Blocker ist ein **Sicherheitsmechanismus**: Wenn Preisabweichungen existieren, darf der Workflow NICHT von Step 2 zu Step 3 weiterfahren. Er muss ab Werk aktiviert sein (`true`), damit kein User versehentlich fehlerhafte Preise ins ERP exportiert.

### Ist-Zustand (Code-Analyse)

**`src/types/index.ts:162`**
```typescript
blockStep2OnPriceMismatch: boolean; // Default: false  ← FALSCH
```

**`src/store/runStore.ts:630`** (globalConfig-Initialwert)
```typescript
blockStep2OnPriceMismatch: false,  ← FALSCH, muss true sein
```

**`src/store/runStore.ts:1578`** (Guard in advanceToNextStep)
```typescript
if (runningStep.stepNo === 2 && globalConfig.blockStep2OnPriceMismatch) {
```
→ Der Guard liest bereits `globalConfig` (Live-Wert) — das ist KORREKT.

**`src/components/SettingsPopup.tsx:789`**
```typescript
const blockStep2OnPriceMismatch = globalConfig.blockStep2OnPriceMismatch ?? false;
```
→ Fallback ist `false` — muss auf `true` geändert werden.

### Soll-Zustand & Anweisungen

#### Schritt 1.1: Default auf `true` setzen
- **Datei:** `src/store/runStore.ts` Zeile ~630
- **Änderung:** `blockStep2OnPriceMismatch: false` → `blockStep2OnPriceMismatch: true`

#### Schritt 1.2: Fallback in SettingsPopup auf `true` setzen
- **Datei:** `src/components/SettingsPopup.tsx` Zeile ~789
- **Änderung:** `?? false` → `?? true`

#### Schritt 1.3: Datenleiche aus RunConfig entfernen
- **Datei:** `src/types/index.ts` Zeile ~162
- **Änderung:** Die Zeile `blockStep2OnPriceMismatch: boolean;` aus dem `RunConfig`-Interface **löschen**.
- **ACHTUNG:** `autoStartStep4: boolean` (Zeile ~168) **NICHT** anfassen! Das ist run-spezifisch und bleibt.

#### Schritt 1.4: Snapshot-Zuweisung aus Run-Erzeugung entfernen
- **Datei:** `src/store/runStore.ts`
- **Suche:** In der `createNewRunWithParsing`-Funktion (und allen anderen Stellen, die ein `config`-Objekt für einen neuen Run bauen) die Zuweisung `blockStep2OnPriceMismatch: ...` entfernen.
- **Grep-Hilfe:** `blockStep2OnPriceMismatch` in `runStore.ts` liefert alle Fundstellen. Die einzige, die BLEIBEN muss, ist Zeile ~630 (globalConfig default) und Zeile ~1578 (der Guard selbst).

#### Schritt 1.5: Guard verifizieren
- **Datei:** `src/store/runStore.ts` Zeile ~1578
- Der Guard `if (runningStep.stepNo === 2 && globalConfig.blockStep2OnPriceMismatch)` ist KORREKT und darf NICHT verändert werden. Er liest bereits den Live-Wert.

### Verifikation
Nach der Änderung: Einen Run starten, Preisabweichung erzeugen → Step 2 → Step 3 darf NICHT starten. In den Einstellungen Blocker AUS → Step 2 → Step 3 darf jetzt starten.

---

## Reparatur 2: KISS-Flow sabotiert (Auto-Resolve entfernen)

### Big Picture
Im KISS-Workflow darf das Setzen eines Preises (Stufe 1 = Entwurf) NIEMALS automatisch den Fehler lösen. Der Fehler verschwindet erst bei expliziter Bestätigung durch den User (Stufe 2 = "Lösung anwenden"). Ein `refreshIssues()`-Aufruf nach `setManualPriceByPosition` ist **Architektur-Sabotage**, weil `refreshIssues` intern `autoResolveIssues` aufruft, was den Fehler automatisch auf `resolved` setzt, wenn `priceCheckStatus !== 'mismatch'`.

### Ist-Zustand (Code-Analyse)

**`src/store/runStore.ts` Zeile ~2818-2819** (in `setManualPriceByPosition`):
```typescript
// Auto-Resolve feuern
get().refreshIssues(runId);
```
→ Das ist der Täter. Nach dem Setzen des Preises wird `refreshIssues` aufgerufen, was `autoResolveIssues` triggert. Da der `priceCheckStatus` jetzt `'custom'` ist (nicht mehr `'mismatch'`), wird `checkIssueStillActive` false zurückgeben und den Fehler automatisch lösen.

**`src/store/runStore.ts` Zeile ~2766-2770** (in `setManualPrice`):
```typescript
// PROJ-44-ADD-ON-R7: Auto-Resolve nach manuellem Preis (analog setManualPriceByPosition)
get().refreshIssues(runIdForRefresh);
```
→ Gleicher Fehler in der Einzel-Preis-Funktion.

### Soll-Zustand & Anweisungen

#### Schritt 2.1: Auto-Resolve aus `setManualPriceByPosition` entfernen
- **Datei:** `src/store/runStore.ts` Zeile ~2818-2819
- **Änderung:** Die Zeilen `// Auto-Resolve feuern` und `get().refreshIssues(runId);` **komplett löschen**.

#### Schritt 2.2: Auto-Resolve aus `setManualPrice` entfernen
- **Datei:** `src/store/runStore.ts` Zeile ~2766-2770
- **Änderung:** Die Zeilen mit `// PROJ-44-ADD-ON-R7: Auto-Resolve...` und `get().refreshIssues(runIdForRefresh);` **komplett löschen**.

#### Schritt 2.3: Stats-Update BLEIBT
- Die Preis-Statistik-Updates (priceOkCount, priceMismatchCount etc.) in beiden Funktionen **NICHT** anfassen. Die sind korrekt und nötig für die KPI-Kacheln.

### ACHTUNG: Was NICHT entfernt werden darf
- `refreshIssues` als Store-Action selbst bleibt bestehen — sie wird vom "Aktualisieren"-Button im IssuesCenter genutzt.
- Der `autoResolveIssues`-Mechanismus selbst bleibt bestehen — er wird nur nicht mehr beim Preis-Setzen getriggert.

### Verifikation
Preis im Pop-Up wählen → Fehler im IssuesCenter muss weiterhin als "offen" angezeigt werden. Erst "Lösung anwenden" im IssueDialog schließt den Fehler.

---

## Reparatur 3: Dead Clicks im IssueDialog (Portal-Gefängnis)

### Big Picture
Der IssueDialog ist ein modaler Dialog (Radix UI `<Dialog>`). Das PriceCell-Popover rendert seinen Content in ein React-Portal am Ende des `<body>`. Wenn der User im Popover auf "Rechnungspreis" oder "Sage-Preis" klickt, denkt der modale Dialog: "Klick war außerhalb von mir → ignorieren." Der Klick-Event erreicht nie den `onSetPrice`-Handler. Das `pendingPrice` bleibt leer.

In Round 11 wurde ein Wrapper entfernt, der vorher als Event-Bridge funktionierte. Ohne diesen Wrapper prallen die Klicks am modalen Dialog ab.

### Ist-Zustand (Code-Analyse)

**`src/components/run-detail/IssueDialog.tsx` Zeile ~541-560:**
```tsx
<div
  role="button"
  tabIndex={0}
  className="inline-flex items-center gap-2 ..."
  onClick={(e) => {
    const btn = e.currentTarget.querySelector('button');
    if (btn && !btn.contains(e.target as Node)) {
      btn.click();
    }
  }}
>
  <PriceCell line={mismatchLine} onSetPrice={...} />
</div>
```
→ Der äußere `div`-Wrapper delegiert Klicks, aber das Popover-Portal lebt außerhalb dieses Wrappers und außerhalb des Dialogs.

**`src/components/run-detail/PriceCell.tsx` Zeile ~141:**
```tsx
<Popover open={open} onOpenChange={setOpen}>
```
→ Standard-Popover ohne `modal`-Prop. Der Popover-Content wird als Portal gerendert.

### Soll-Zustand & Anweisungen

#### Schritt 3.1: Popover `modal` setzen ODER Container-Prop nutzen
**Option A (bevorzugt — KISS):** Dem `<PopoverContent>` in PriceCell die Prop `onPointerDownOutside={(e) => e.preventDefault()}` geben und dem Popover `modal={false}` explizit setzen (falls nicht default). Zusätzlich dem `<DialogContent>` in IssueDialog die Prop `onPointerDownOutside` so erweitern, dass Klicks auf Popover-Portale durchgelassen werden:

```tsx
// IssueDialog.tsx — DialogContent
<DialogContent
  ...
  onPointerDownOutside={(e) => {
    // Popover-Portale durchlassen (Radix rendert sie als [data-radix-popper-content-wrapper])
    const target = e.target as HTMLElement;
    if (target.closest('[data-radix-popper-content-wrapper]')) {
      e.preventDefault();
    }
  }}
>
```

**Option B (Fallback):** Den PriceCell im IssueDialog so umbauen, dass er KEIN Popover nutzt, sondern die drei Buttons (Rechnungspreis, Sage-Preis, Custom) direkt inline rendert. Das eliminiert das Portal-Problem komplett.

#### Schritt 3.2: Wrapper-Klick-Delegation prüfen
Der `div[role="button"]`-Wrapper um die PriceCell (Zeile ~541-550) kann entfernt werden, wenn Option A funktioniert. Er war ein Workaround für genau dieses Problem, funktioniert aber nicht für Portal-Clicks.

### Verifikation
IssueDialog öffnen → Tab "Uebersicht" → PriceCell-Badge klicken → Popover öffnet sich → "Rechnungspreis" klicken → Preis muss sich ändern (in der InvoiceLine), Popover schließt sich.

---

## Reparatur 4: PDF-Datenverlust beim Reprocess

### Big Picture
Die Original-PDF-Parsing-Daten (Positionen, Warnungen, Header) sind die **heilige Grundlage** des gesamten Workflows. Wenn der User auf "Neu verarbeiten" klickt, wird ein neuer Run erstellt. Durch React-Lifecycle-Effekte flackert `currentParsedRunId` kurzzeitig auf `null`. In genau diesem Moment greift der Auto-Save-Hook, sieht `currentParsedRunId !== runId` und schreibt leere Arrays in die IndexedDB, was die Originaldaten überschreibt.

### Ist-Zustand (Code-Analyse)

**`src/hooks/buildAutoSavePayload.ts` Zeile ~42-43:**
```typescript
parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : [],
parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : [],
```
→ Wenn `currentParsedRunId` kurz `null` ist (während des Reprocess), wird `[]` geschrieben. Das überschreibt die echten Daten in der IndexedDB.

**`src/pages/RunDetail.tsx` Zeile ~385-392:**
```typescript
useEffect(() => {
  const run = runs.find(r => r.id === decodedRunId) || mockRuns.find(r => r.id === decodedRunId);
  if (run) { setCurrentRun(run); }
  return () => setCurrentRun(null);  // ← Cleanup setzt currentRun auf null
}, [decodedRunId, runs, setCurrentRun]);
```
→ Der Cleanup `setCurrentRun(null)` bei Route-Wechsel (Reprocess erzeugt neue RunId → neue Route) setzt `currentRun` auf null, was `currentParsedRunId`-Checks zum Scheitern bringt.

### Soll-Zustand & Anweisungen

#### Schritt 4.1: buildAutoSavePayload — Leere Arrays durch `undefined` ersetzen
- **Datei:** `src/hooks/buildAutoSavePayload.ts` Zeile ~42-43
- **Änderung:**
```typescript
// ALT (FALSCH — schreibt leere Arrays, die Originaldaten überschreiben):
parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : [],
parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : [],

// NEU (KORREKT — undefined wird beim Speichern ignoriert, Originaldaten bleiben):
parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : undefined,
parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : undefined,
```

#### Schritt 4.2: runPersistenceService.saveRun prüfen
- Verifiziere, dass `runPersistenceService.saveRun` bei `undefined`-Feldern die bestehenden Daten in der IndexedDB nicht überschreibt. Falls der Service ein `Object.assign` oder Spread macht, muss ein Guard hinzugefügt werden:
```typescript
// Nur nicht-undefined Felder überschreiben:
if (payload.parsedPositions !== undefined) { existingData.parsedPositions = payload.parsedPositions; }
```

#### Schritt 4.3: parsedInvoiceResult ebenfalls schützen
- **Datei:** `src/hooks/buildAutoSavePayload.ts` Zeile ~44
- Prüfen: `parsedInvoiceResult: current.parsedInvoiceResult ?? null` — das `?? null` ist potenziell gefährlich. Wenn `parsedInvoiceResult` noch nicht geladen ist, wird `null` geschrieben und überschreibt die DB-Daten.
- **Änderung:** Auch hier einen Guard einbauen, der nur schreibt, wenn der Run aktiv geparst wird:
```typescript
parsedInvoiceResult: current.currentParsedRunId === runId
  ? (current.parsedInvoiceResult ?? null)
  : undefined,
```

#### Schritt 4.4: RunDetail-Cleanup absichern (optional, Defense-in-Depth)
- **Datei:** `src/pages/RunDetail.tsx` Zeile ~391
- Der `return () => setCurrentRun(null)` Cleanup ist an sich korrekt (React-Lifecycle). Das eigentliche Problem wird durch Schritt 4.1-4.3 gelöst. Falls man aber zusätzliche Sicherheit will:
- Im `setCurrentRun(null)`-Aufruf könnte man einen "Reprocess-Guard" einbauen, der prüft, ob gerade ein `isProcessing` aktiv ist, und in dem Fall den Cleanup überspringt.

### Verifikation
1. Run starten, PDF parsen lassen (Step 1 abwarten).
2. "Neu verarbeiten" klicken.
3. Nach dem Reprocess: Die PDF-Vorschau (InvoicePreview) muss die Original-Daten anzeigen, nicht leer sein.
4. IndexedDB prüfen: `parsedPositions` des alten Runs darf NICHT leer sein.

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans, um Fehler zu vermeiden

### Allgemeine Fallstricke

1. **NIEMALS `refreshIssues()` nach einer Datenänderung aufrufen**, es sei denn, der User hat explizit "Aktualisieren" oder "Lösung anwenden" geklickt. `refreshIssues` triggert intern `autoResolveIssues`, was Fehler automatisch schließt — das verstößt gegen die Zwei-Stufen-Regel.

2. **React-Lifecycle beim Store-Update:** Zustand-Store-Updates (`set()`) sind synchron, aber React-Re-Renders sind asynchron. Wenn du in einer Store-Action `get()` direkt nach `set()` aufrufst, bekommst du den neuen State. Aber React-Komponenten sehen den alten State bis zum nächsten Render-Cycle. Plane deine Logik entsprechend.

3. **RunConfig vs. globalConfig:**
   - `RunConfig` (in `run.config`) = Run-spezifische Einstellungen, die beim Erstellen eines Runs eingefroren werden (z.B. `autoStartStep4`, `eingangsart`).
   - `globalConfig` (in `state.globalConfig`) = Live-UI-Einstellungen, die sofort wirken (z.B. `blockStep2OnPriceMismatch`).
   - **Faustregel:** Wenn ein Setting sofort und für ALLE Runs gelten soll → `globalConfig`. Wenn es pro Run unterschiedlich sein kann → `RunConfig`.

4. **Die `blockStep2OnPriceMismatch`-Bereinigung:**
   - Nur 2 Stellen dürfen diesen Wert HABEN: `globalConfig`-Default (~Zeile 630) und der Guard (~Zeile 1578).
   - ALLE anderen Fundstellen (RunConfig-Interface in types, Snapshot-Zuweisung in createNewRun, SettingsPopup-Fallback) müssen bereinigt werden.
   - `blockStep4OnMissingOrder` ist ein **anderer** Schalter und darf NICHT angefasst werden!

5. **PriceCell-Popover im Dialog:**
   - Radix UI `<Popover>` rendert seinen Content in ein Portal am Ende von `<body>`.
   - Radix UI `<Dialog>` fängt standardmäßig alle Klicks außerhalb seines Content-Bereichs ab (via `onPointerDownOutside`).
   - Die Lösung ist, dem `<DialogContent>` beizubringen, dass Popover-Portale "dazugehören" — das geht über das `data-radix-popper-content-wrapper`-Attribut, das Radix automatisch auf Popover-Wrapper setzt.
   - **TESTE** den Fix im Browser! Dead-Clicks sind schwer zu debuggen, weil sie keinen Fehler werfen.

6. **buildAutoSavePayload — `undefined` vs. `[]`:**
   - `[]` (leeres Array) **überschreibt** bestehende Daten in der IndexedDB.
   - `undefined` **wird beim Spread ignoriert** und lässt bestehende Daten unberührt.
   - Prüfe, wie `runPersistenceService.saveRun` das Payload verarbeitet. Wenn es ein `Object.assign` oder `{ ...existing, ...payload }` macht, wird `undefined` korrekt ignoriert. Wenn es explizit `data.parsedPositions = payload.parsedPositions` macht, muss ein `if (payload.parsedPositions !== undefined)`-Guard hinzugefügt werden.

7. **Reihenfolge der Reparaturen:**
   - Starte mit Reparatur 1 (Guard-Default), da sie am einfachsten ist und sofort Wirkung zeigt.
   - Dann Reparatur 2 (Auto-Resolve entfernen), da sie direkt zusammenhängt.
   - Dann Reparatur 4 (PDF-Schutz), da sie den Auto-Save-Hook betrifft.
   - Zuletzt Reparatur 3 (Dead Clicks), da sie die komplexeste ist und React-Portal-Verständnis erfordert.

8. **NICHT anfassen (Workflow-Schutz):**
   - Die `computeMatchStats`- und `computeOrderStats`-Funktionen.
   - Die `executeMatcherCrossMatch`- und `executeMatcherSerialExtract`-Logik.
   - Die KPI-Kachel-Berechnungen in `RunDetail.tsx` (useMemo-Hooks).
   - Die `autoResolveIssues`-Funktion selbst — nur ihre AUFRUFER werden entfernt.
   - Die `resolveIssueLines`-Funktion (zentraler ID-Resolver).

9. **TypeScript-Kompilierung nach Reparatur 1:**
   - Wenn `blockStep2OnPriceMismatch` aus `RunConfig` entfernt wird, können TypeScript-Fehler an Stellen auftreten, wo auf `run.config.blockStep2OnPriceMismatch` zugegriffen wird. Diese Stellen müssen auf `globalConfig.blockStep2OnPriceMismatch` umgestellt werden.
   - Mache nach Reparatur 1 einen `tsc --noEmit`-Check, um alle betroffenen Stellen zu finden.

10. **Testing-Strategie:**
    - Nach jeder Reparatur: `npm run build` (oder `tsc --noEmit`) um TypeScript-Fehler zu finden.
    - Manueller Test: Run starten → Preisabweichung erzeugen → Preis im Pop-Up wählen → Fehler muss OFFEN bleiben → "Lösung anwenden" → Fehler wird geschlossen → "Neu verarbeiten" → PDF-Daten müssen erhalten bleiben.
