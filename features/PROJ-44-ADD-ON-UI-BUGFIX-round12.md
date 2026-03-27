# PROJ-44 ADD-ON — UI-BUGFIX Round 12 (Reparaturplan — Final nach Kreuzverhör)

> **PFLICHTLEKTÜRE VOR BEGINN:** `features/PROJ-44-ADD-ON-SOLL-ZUSTAND.md`
> Lies das Manifest KOMPLETT, bevor du eine einzige Zeile Code anfasst.

---

## Kreuzverhör-Ergebnis

Der erste Plan-Entwurf (OLD) wurde gegen den Diagnosebericht und harten Code-Check geprüft. **Confi-Wert des alten Plans: 62/100.**

Kritische Lücken, die in diesem finalen Plan behoben sind:

| # | Lücke im alten Plan | Korrektur |
|---|---------------------|-----------|
| 1 | Reparatur 4: `undefined` statt `[]` funktioniert NICHT, weil `saveRun()` via `store.put()` FULL REPLACE macht — `undefined` wird von `JSON.stringify` gestrippt und zerstört die Daten genauso | Merge-Strategie in `runPersistenceService.saveRun()` einbauen |
| 2 | Reparatur 3: Diagnose behauptete, Wrapper sei entfernt und `onInteractOutside` existiere — beides FALSCH | Korrekter Ist-Zustand: Wrapper MIT onClick existiert (Zeile 541), KEIN `onInteractOutside` auf DialogContent |
| 3 | Reparatur 2: Diagnose behauptete direktes `resolveIssue()` in IssuesCenter — FALSCH | Kein `resolveIssue`-Import in IssuesCenter. Sabotage kommt NUR aus `refreshIssues()` im Store |
| 4 | Reparatur 1: `effectiveConfig`-Alarm unbegründet — betrifft nur `autoStartStep4` | Step-2-Guard liest korrekt `globalConfig` direkt (Zeile 1578) |

---

## Übersicht: 4 Reparaturen

| # | Symptom | Kernursache | Tatort |
|---|---------|-------------|--------|
| 1 | Hard-Guard versagt (Preis-Blocker rennt durch) | Default `false` + tote Snapshot-Kopie im RunConfig | `runStore.ts`, `types/index.ts`, `SettingsPopup.tsx` |
| 2 | KISS-Flow sabotiert (Auto-Resolve nach Preiswahl) | `refreshIssues()`-Aufruf in `setManualPrice` und `setManualPriceByPosition` | `runStore.ts` |
| 3 | Dead Clicks im IssueDialog | Radix Dialog schließt bei Popover-Portal-Klick (kein Outside-Guard) | `IssueDialog.tsx` |
| 4 | PDF-Datenverlust beim Reprocess | `parsedInvoiceResult` unguarded + `saveRun()` Full-Replace zerstört Daten | `buildAutoSavePayload.ts`, `runPersistenceService.ts` |

---

## Reparatur 1: Hard-Guard versagt

### Big Picture
Der Preis-Blocker ist ein **Sicherheitsmechanismus**: Wenn Preisabweichungen existieren, darf der Workflow NICHT von Step 2 zu Step 3 weiterfahren. Er muss ab Werk aktiviert sein (`true`).

### Ist-Zustand (verifiziert)

**`src/store/runStore.ts:630`** — Default ist `false`:
```typescript
blockStep2OnPriceMismatch: false,
```

**`src/store/runStore.ts:1578`** — Guard liest `globalConfig` (Live-Wert) ✅ KORREKT:
```typescript
if (runningStep.stepNo === 2 && globalConfig.blockStep2OnPriceMismatch) {
```
> ENTWARNUNG: Die `effectiveConfig`-Mechanik (Zeile 1642) betrifft NUR `autoStartStep4`, NICHT den Preis-Guard. Der Guard liest bereits den Live-Wert.

**`src/components/SettingsPopup.tsx:789`** — Fallback `false`:
```typescript
const blockStep2OnPriceMismatch = globalConfig.blockStep2OnPriceMismatch ?? false;
```

**`src/types/index.ts:~162`** — Datenleiche im RunConfig-Interface:
```typescript
blockStep2OnPriceMismatch: boolean; // Default: false
```

### Soll-Zustand & Anweisungen

#### Schritt 1.1: Default auf `true` setzen
- **Datei:** `src/store/runStore.ts` Zeile ~630
- **Änderung:** `blockStep2OnPriceMismatch: false` → `blockStep2OnPriceMismatch: true`

#### Schritt 1.2: Fallback in SettingsPopup auf `true` setzen
- **Datei:** `src/components/SettingsPopup.tsx` Zeile ~789
- **Änderung:** `?? false` → `?? true`

#### Schritt 1.3: Datenleiche aus RunConfig-Interface entfernen
- **Datei:** `src/types/index.ts` — die Zeile `blockStep2OnPriceMismatch: boolean;` aus dem `RunConfig`-Interface **löschen**.
- **ACHTUNG:** `autoStartStep4: boolean` **NICHT** anfassen!

#### Schritt 1.4: Snapshot-Zuweisung aus Run-Erzeugung bereinigen
- **Datei:** `src/store/runStore.ts`
- **Grep:** `blockStep2OnPriceMismatch` in `runStore.ts` → ALLE Fundstellen prüfen.
- **Behalten:** Nur Zeile ~630 (globalConfig-Default) und Zeile ~1578 (Guard).
- **Entfernen:** Jede Zuweisung in `config: { ..., blockStep2OnPriceMismatch: ... }` beim Run-Erstellen.
- Nach Entfernung aus dem Interface werden TypeScript-Fehler diese Stellen automatisch aufzeigen.

#### Schritt 1.5: Guard NICHT anfassen
- `src/store/runStore.ts` Zeile ~1578 ist KORREKT und darf NICHT verändert werden.

### Verifikation
Run starten → Preisabweichung erzeugen → Step 2→3 darf NICHT starten. Settings: Blocker AUS → Step 2→3 darf starten.

---

## Reparatur 2: KISS-Flow sabotiert (Auto-Resolve entfernen)

### Big Picture
Preis setzen (Stufe 1 = Entwurf) darf NIEMALS automatisch den Fehler lösen. `refreshIssues()` triggert intern `autoResolveIssues`, was den Fehler bei `priceCheckStatus !== 'mismatch'` automatisch auf `resolved` setzt.

### Ist-Zustand (verifiziert)

> **KORREKTUR zum Diagnosebericht:** Im `IssuesCenter.tsx` gibt es KEIN direktes `resolveIssue()`-Aufruf nach Preiswahl. Die `resolveIssue`-Funktion wird dort nicht einmal importiert. Die Sabotage kommt AUSSCHLIESSLICH aus den `refreshIssues()`-Aufrufen im Store.

**`src/store/runStore.ts:2818-2819`** (in `setManualPriceByPosition`):
```typescript
// Auto-Resolve feuern
get().refreshIssues(runId);
```

**`src/store/runStore.ts:2766-2769`** (in `setManualPrice`):
```typescript
// PROJ-44-ADD-ON-R7: Auto-Resolve nach manuellem Preis (analog setManualPriceByPosition)
const runIdForRefresh = get().currentRun?.id;
if (runIdForRefresh) {
  get().refreshIssues(runIdForRefresh);
}
```

### Soll-Zustand & Anweisungen

#### Schritt 2.1: Auto-Resolve aus `setManualPriceByPosition` entfernen
- **Datei:** `src/store/runStore.ts` Zeile ~2818-2819
- **Änderung:** Die Zeilen `// Auto-Resolve feuern` und `get().refreshIssues(runId);` **komplett löschen**.

#### Schritt 2.2: Auto-Resolve aus `setManualPrice` entfernen
- **Datei:** `src/store/runStore.ts` Zeile ~2766-2770
- **Änderung:** Die Zeilen mit `// PROJ-44-ADD-ON-R7: Auto-Resolve...` bis inkl. der schließenden `}` des if-Blocks **komplett löschen**.

#### Schritt 2.3: Stats-Updates BLEIBEN
- Die Preis-Statistik-Updates (`priceOkCount`, `priceMismatchCount` etc.) in beiden Funktionen **NICHT** anfassen. Nötig für KPI-Kacheln.

#### Schritt 2.4: Andere `refreshIssues`-Aufrufe NICHT anfassen
- Zeile ~2935 in `setManualArticleByPosition` → bleibt (Artikel-Match-Workflow, nicht Preis-Workflow)
- Zeile ~3018 in `updateLineSerialData` → bleibt (S/N-Workflow)
- `refreshIssues` als Store-Action selbst → bleibt ("Aktualisieren"-Button)
- `autoResolveIssues`-Funktion selbst → bleibt (wird nur nicht mehr beim Preis-Setzen getriggert)

### Verifikation
Preis im Pop-Up wählen → Fehler im IssuesCenter muss als "offen" bleiben. Erst "Lösung anwenden" im IssueDialog schließt den Fehler.

---

## Reparatur 3: Dead Clicks im IssueDialog (Portal vs. Dialog)

### Big Picture
Der IssueDialog ist ein modaler Radix-Dialog. PriceCell nutzt ein Radix-Popover, das seinen Content via `<PopoverPrimitive.Portal>` am Ende von `<body>` rendert. Wenn der User im Popover-Portal klickt, interpretiert der Dialog das als "Klick außerhalb" und **schließt sich** → der Click-Handler kommt nie an.

### Ist-Zustand (verifiziert)

> **KORREKTUR zum Diagnosebericht:** Der Wrapper mit `onClick`-Delegation existiert NOCH (Zeile 541-550). Und es gibt KEIN `onInteractOutside` auf dem `DialogContent` — der Dialog nutzt Radix-Defaults.

**`src/components/run-detail/IssueDialog.tsx:541-560`** — Wrapper existiert noch:
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
→ Dieser Wrapper hilft bei direkten Klicks AUF den Wrapper, aber NICHT bei Popover-Portal-Klicks.

**`src/components/run-detail/IssueDialog.tsx:456`** — DialogContent OHNE Outside-Guard:
```tsx
<DialogContent className="max-w-6xl w-full h-[85vh] max-h-[850px] flex flex-col" style={{ backgroundColor: '#D8E6E7' }}>
```
→ Radix-Default: Klick auf Overlay → Dialog schließt sich.

**`src/components/ui/dialog.tsx:36-42`** — Standard shadcn/ui DialogContent:
```tsx
<DialogPrimitive.Content ref={ref} className={cn(...)} {...props}>
```
→ Props werden durchgereicht, d.h. `onPointerDownOutside` kann in IssueDialog gesetzt werden.

**`src/components/ui/popover.tsx:14`** — Popover nutzt Portal:
```tsx
<PopoverPrimitive.Portal>
  <PopoverPrimitive.Content ... />
</PopoverPrimitive.Portal>
```

### Fehler-Kette
1. User klickt PriceCell-Badge → Popover öffnet sich (Portal am `<body>`-Ende)
2. User klickt "Rechnungspreis" im Popover → Radix Dialog erkennt: "Klick außerhalb meines Content"
3. Dialog ruft `onOpenChange(false)` → `onClose()` → Dialog schließt sich
4. React unmountet PriceCell + Popover → Click-Handler von Button feuert nie
5. `pendingPrice` bleibt leer

### Soll-Zustand & Anweisungen

#### Schritt 3.1: `onPointerDownOutside` auf DialogContent setzen
- **Datei:** `src/components/run-detail/IssueDialog.tsx` Zeile ~456
- **Änderung:** Dem `<DialogContent>` eine `onPointerDownOutside`-Prop hinzufügen, die Popover-Portal-Klicks durchlässt:

```tsx
<DialogContent
  className="max-w-6xl w-full h-[85vh] max-h-[850px] flex flex-col"
  style={{ backgroundColor: '#D8E6E7' }}
  onPointerDownOutside={(e) => {
    // Popover-Portale durchlassen — Radix setzt data-radix-popper-content-wrapper auf den Wrapper
    const target = e.target as HTMLElement;
    if (target.closest('[data-radix-popper-content-wrapper]')) {
      e.preventDefault();
    }
  }}
  onInteractOutside={(e) => {
    // Gleicher Guard für Touch/Keyboard-Interaktionen
    const target = e.target as HTMLElement;
    if (target.closest('[data-radix-popper-content-wrapper]')) {
      e.preventDefault();
    }
  }}
>
```

#### Schritt 3.2: Wrapper-Klick-Delegation prüfen
- Der `div[role="button"]`-Wrapper (Zeile 541-550) kann nach dem Fix aus Schritt 3.1 **vereinfacht** werden: `role="button"`, `tabIndex={0}` und der `onClick`-Handler können entfernt werden, da der Popover jetzt korrekt funktioniert. Der `div` selbst kann als reines Layout-Element bleiben.
- **ACHTUNG:** Erst NACH dem Test von Schritt 3.1 den Wrapper vereinfachen, nicht vorher!

### Verifikation
IssueDialog öffnen → PriceCell-Badge klicken → Popover muss sich öffnen UND Dialog muss OFFEN BLEIBEN → "Rechnungspreis" klicken → `pendingPrice` wird gesetzt → "Lösung anwenden" Button wird aktiv.

---

## Reparatur 4: PDF-Datenverlust beim Reprocess

### Big Picture
PDF-Parsing-Daten sind die heilige Grundlage. "Neu verarbeiten" ruft `createNewRunWithParsing()` auf, was eine neue RunId erzeugt und die Route wechselt. In der Übergangsphase kann der Auto-Save-Hook die Parser-Daten des alten Runs mit falschen/leeren Werten überschreiben.

### Ist-Zustand (verifiziert)

> **KORREKTUR zum Diagnosebericht:** `setCurrentRun(null)` (Zeile 653) setzt NICHT `currentParsedRunId` zurück — es setzt nur `{ currentRun: run }`. Das `currentParsedRunId`-Flackern ist also NICHT der primäre Auslöser.

**KERNPROBLEM 1: `parsedInvoiceResult` hat keinen Ownership-Guard**

`src/hooks/buildAutoSavePayload.ts:44`:
```typescript
parsedInvoiceResult: current.parsedInvoiceResult ?? null,
```
→ Wird IMMER geschrieben, egal welchem Run die Daten gehören. Wenn der Auto-Save für Run A feuert, aber `parsedInvoiceResult` schon die Daten von Run B enthält (nach Reprocess), wird Run A mit falschen Daten überschrieben.

**KERNPROBLEM 2: `saveRun()` macht FULL REPLACE**

`src/services/runPersistenceService.ts:133`:
```typescript
const request = store.put(persistedData);
```
→ `store.put()` ERSETZT den gesamten IndexedDB-Eintrag. Wenn ein Feld im Payload fehlt (weil `undefined` von `JSON.stringify` gestrippt wurde), geht es in der DB verloren. Der alte Plan (`[]` → `undefined`) würde deshalb die Daten GENAUSO zerstören.

**KERNPROBLEM 3: `parsedPositions`/`parserWarnings` — `[]` Fallback**

`src/hooks/buildAutoSavePayload.ts:42-43`:
```typescript
parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : [],
parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : [],
```
→ Leere Arrays überschreiben echte Daten in der IndexedDB.

### Soll-Zustand & Anweisungen

#### Schritt 4.1: `parsedInvoiceResult` unter Ownership-Guard stellen
- **Datei:** `src/hooks/buildAutoSavePayload.ts` Zeile ~44
- **Änderung:**
```typescript
// ALT (FALSCH — immer geschrieben, egal wem die Daten gehören):
parsedInvoiceResult: current.parsedInvoiceResult ?? null,

// NEU (KORREKT — nur schreiben wenn dieser Run die Daten besitzt):
parsedInvoiceResult: current.currentParsedRunId === runId
  ? (current.parsedInvoiceResult ?? null)
  : undefined,
```

#### Schritt 4.2: `parsedPositions`/`parserWarnings` — `[]` durch `undefined` ersetzen
- **Datei:** `src/hooks/buildAutoSavePayload.ts` Zeile ~42-43
- **Änderung:**
```typescript
// ALT (FALSCH — leere Arrays überschreiben Originaldaten):
parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : [],
parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : [],

// NEU (undefined = "dieses Feld nicht anfassen"):
parsedPositions: current.currentParsedRunId === runId ? current.parsedPositions : undefined,
parserWarnings: current.currentParsedRunId === runId ? current.parserWarnings : undefined,
```

#### Schritt 4.3: `saveRun()` auf Merge-Strategie umbauen (KRITISCH!)
- **Datei:** `src/services/runPersistenceService.ts` Zeile ~117-151
- **WARUM:** `store.put()` macht Full-Replace. `JSON.stringify` strippt `undefined`-Felder. Ohne Merge gehen Daten verloren.
- **Änderung:** Vor dem `store.put()` existierende Daten laden und mergen:

```typescript
async function saveRun(data: Omit<PersistedRunData, 'savedAt' | 'sizeEstimateBytes'>): Promise<boolean> {
  try {
    const db = await openDatabase();
    const savedAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([RUNS_STORE], 'readwrite');
      const store = transaction.objectStore(RUNS_STORE);

      // MERGE-STRATEGIE: Erst lesen, dann undefined-Felder aus Bestand übernehmen
      const getRequest = store.get(data.id);
      getRequest.onsuccess = () => {
        const existing = getRequest.result as PersistedRunData | undefined;

        // Nur definierte Felder aus dem neuen Payload übernehmen
        const merged = existing
          ? { ...existing }
          : ({} as Record<string, unknown>);

        for (const [key, value] of Object.entries(data)) {
          if (value !== undefined) {
            (merged as Record<string, unknown>)[key] = value;
          }
        }

        const serialized = JSON.stringify(merged);
        const sizeEstimateBytes = serialized.length * 2;

        const persistedData: PersistedRunData = {
          ...(merged as PersistedRunData),
          savedAt,
          sizeEstimateBytes,
        };

        const putRequest = store.put(persistedData);
        putRequest.onsuccess = () => {
          console.debug(`[RunPersistence] Run saved: ${data.id} (${(sizeEstimateBytes / 1024).toFixed(1)} KB)`);
          resolve(true);
        };
        putRequest.onerror = () => {
          console.error('[RunPersistence] Failed to save run:', putRequest.error);
          reject(putRequest.error);
        };
      };

      getRequest.onerror = () => {
        console.error('[RunPersistence] Failed to read existing run for merge:', getRequest.error);
        reject(getRequest.error);
      };

      transaction.oncomplete = () => db.close();
    });
  } catch (error) {
    console.error('[RunPersistence] Error saving run:', error);
    return false;
  }
}
```

#### Schritt 4.4: `serialDocument` und `preFilteredSerials` ebenfalls schützen (Defense-in-Depth)
- **Datei:** `src/hooks/buildAutoSavePayload.ts` Zeile ~46-47
- **Prüfen:** Werden `serialDocument` und `preFilteredSerials` ownership-geprüft? Falls nicht, sollten sie ebenfalls unter den `currentParsedRunId`-Guard gestellt werden.
- `serialDocument` ist run-unabhängig (kommt aus dem Upload) → kann bleiben.
- `preFilteredSerials` ist ebenfalls upload-basiert → kann bleiben.

### Verifikation
1. Run starten → Step 1 abwarten (PDF geparst).
2. "Neu verarbeiten" klicken.
3. Nach Reprocess: PDF-Vorschau des ALTEN Runs (falls noch navigierbar) muss Daten zeigen.
4. IndexedDB prüfen: `parsedPositions` und `parsedInvoiceResult` des alten Runs dürfen NICHT leer/null sein.

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans, um Fehler zu vermeiden

### Allgemeine Fallstricke

1. **NIEMALS `refreshIssues()` nach einer Datenänderung aufrufen**, es sei denn, der User hat explizit "Aktualisieren" oder "Lösung anwenden" geklickt. `refreshIssues` triggert intern `autoResolveIssues`, was Fehler automatisch schließt — das verstößt gegen die Zwei-Stufen-Regel.

2. **React-Lifecycle beim Store-Update:** Zustand-Store-Updates (`set()`) sind synchron, aber React-Re-Renders sind asynchron. Wenn du in einer Store-Action `get()` direkt nach `set()` aufrufst, bekommst du den neuen State. Aber React-Komponenten sehen den alten State bis zum nächsten Render-Cycle.

3. **RunConfig vs. globalConfig:**
   - `RunConfig` (in `run.config`) = Run-spezifische Einstellungen (z.B. `autoStartStep4`, `eingangsart`).
   - `globalConfig` (in `state.globalConfig`) = Live-UI-Einstellungen (z.B. `blockStep2OnPriceMismatch`).
   - **Faustregel:** Sofort für ALLE Runs → `globalConfig`. Pro Run unterschiedlich → `RunConfig`.

4. **Die `blockStep2OnPriceMismatch`-Bereinigung:**
   - Nur 2 Stellen dürfen diesen Wert HABEN: `globalConfig`-Default (~Zeile 630) und der Guard (~Zeile 1578).
   - ALLE anderen Fundstellen müssen bereinigt werden.
   - `blockStep4OnMissingOrder` ist ein **anderer** Schalter und darf NICHT angefasst werden!
   - `tsc --noEmit` nach Entfernung aus dem RunConfig-Interface zeigt automatisch alle betroffenen Stellen.

5. **Radix Dialog + Popover Portal-Kombination:**
   - Radix `<Popover>` rendert seinen Content in ein Portal am Ende von `<body>`.
   - Radix `<Dialog>` behandelt Klicks außerhalb seines Content als "Schließen"-Trigger.
   - Das Attribut `data-radix-popper-content-wrapper` wird von Radix automatisch auf Popover-Portal-Wrapper gesetzt — darüber kann man sie identifizieren.
   - BEIDE Props setzen: `onPointerDownOutside` UND `onInteractOutside`, da Touch-Events über `onInteractOutside` laufen.
   - **TESTE** den Fix im Browser! Dead-Clicks werfen keinen Fehler — sie sind nur sichtbar daran, dass `pendingPrice` leer bleibt.

6. **`saveRun()` Merge-Strategie — die gefährlichste Änderung:**
   - Die bisherige `store.put()` macht Full-Replace. Die neue Merge-Logik muss in EINER IndexedDB-Transaktion laufen (get + put), damit keine Race-Conditions entstehen.
   - `readwrite`-Transactions in IndexedDB sind atomar — solange beides in derselben Transaction passiert, ist es sicher.
   - TESTE: Speichere einen Run, ändere nur einen Preis, speichere erneut → `parsedPositions` muss identisch geblieben sein.
   - ACHTUNG: `transaction.oncomplete` und `db.close()` dürfen erst nach dem `put` kommen, nicht nach dem `get`.

7. **`JSON.stringify` und `undefined`:**
   - `JSON.stringify({ a: 1, b: undefined })` → `{"a":1}` — das `b`-Feld VERSCHWINDET.
   - Deshalb reicht `undefined` im Payload NICHT aus, um Daten zu schützen, wenn `saveRun` Full-Replace macht.
   - NUR MIT der Merge-Strategie aus Schritt 4.3 ist `undefined` sicher als "nicht anfassen"-Signal.

8. **Reihenfolge der Reparaturen:**
   - Starte mit **Reparatur 1** (Default + TypeScript-Bereinigung) — am einfachsten, sofort testbar.
   - Dann **Reparatur 2** (refreshIssues entfernen) — 2 Zeilen löschen, sofort testbar.
   - Dann **Reparatur 4** (Merge-Strategie) — die technisch anspruchsvollste Änderung. Teste die Merge-Strategie ISOLIERT, bevor du den Payload änderst.
   - Zuletzt **Reparatur 3** (Dialog-Fix) — Portal-Verständnis nötig, am schwierigsten zu debuggen.

9. **NICHT anfassen (Workflow-Schutz):**
   - Die `computeMatchStats`- und `computeOrderStats`-Funktionen.
   - Die `executeMatcherCrossMatch`- und `executeMatcherSerialExtract`-Logik.
   - Die KPI-Kachel-Berechnungen in `RunDetail.tsx` (useMemo-Hooks).
   - Die `autoResolveIssues`-Funktion selbst — nur ihre AUFRUFER in den Preis-Funktionen werden entfernt.
   - Die `resolveIssueLines`-Funktion (zentraler ID-Resolver).
   - `refreshIssues`-Aufrufe in `setManualArticleByPosition` (Zeile ~2935) und `updateLineSerialData` (Zeile ~3018) — das sind ANDERE Workflows (Artikel-Match / Seriennummern), nicht Preis.

10. **Testing-Strategie:**
    - Nach jeder Reparatur: `tsc --noEmit` um TypeScript-Fehler zu finden.
    - Manueller End-to-End-Test nach ALLEN 4 Reparaturen:
      1. Run starten → Preisabweichung → Step 2 BLOCKIERT (Reparatur 1 ✓)
      2. Settings: Blocker AUS → Step 2→3 läuft (Reparatur 1 ✓)
      3. Im IssuesCenter: Preis wählen → Fehler bleibt OFFEN (Reparatur 2 ✓)
      4. IssueDialog öffnen → PriceCell-Badge klicken → Popover öffnet → Preis wählen → `pendingPrice` gesetzt (Reparatur 3 ✓)
      5. "Lösung anwenden" → Fehler wird geschlossen (KISS-Flow ✓)
      6. "Neu verarbeiten" → PDF-Vorschau zeigt weiterhin Daten (Reparatur 4 ✓)
      7. IndexedDB → `parsedPositions` des alten Runs noch vorhanden (Reparatur 4 ✓)
