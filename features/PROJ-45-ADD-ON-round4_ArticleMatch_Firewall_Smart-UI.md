# PROJ-45-ADD-ON-round4: ArticleMatch — Firewall, Handbremse & Smart-UI

## Context

**Problem:** Die "Strategy 4: Partial ArtNo match" in `FalmecMatcher_Master.ts` (Z.421-427) nutzt einen `.includes()` Fallback, der den **ersten** Zufallstreffer im Array zurückgibt. Ein falscher Artikel-Match zerschiesst ERP-Bestaende (Sage). Zusaetzlich gibt es KEINE Validierung der `falmecArticleNo` beim Excel-Import — ungueltige Werte (z.B. Text statt 6-stelliger Nummer) landen in den Stammdaten.

**Zustand heute:** Step 2 geht bei `noMatchCount > 0` auf `soft-fail` (runStore.ts:3305), was Auto-Advance nach Step 3/4 NICHT blockiert (Z.1583: `status === 'ok' || status === 'soft-fail'`). Der User hat keine Moeglichkeit, fehlende Artikeldaten on-the-fly zu korrigieren.

**Ziel:** 3-Phasen-Haertung: (1) Partial-Match entfernen + Import-Validierung, (2) Step 2 hart stoppen bei no-match, (3) Smart-UI-Formular im IssueDialog zur manuellen Artikelkorrektur.

---

## Phase 1: Backend Firewall

### 1a. Strategy 4 entfernen

**Datei:** `src/services/matchers/modules/FalmecMatcher_Master.ts` (Z.421-446)

**Aenderung:** Den gesamten Block Strategy 4 (Z.421-446) entfernen. Der `else`-Block (Z.440-446) mit `matchStatus = 'no-match'` wird zum direkten Fallback nach Strategy 3.

**Vorher (vereinfacht):**
```
Strategy 3 miss → Strategy 4 partial → match oder no-match
```

**Nachher:**
```
Strategy 3 miss → direkt no-match
```

**Konkret:** Z.418-446 KOMPLETT ersetzen (NICHT nur Z.421-439 loeschen!). Z.440 `} else {` ist der else-Zweig von `if (matchByPartial)` (Z.430) — wenn das if wegfaellt, hat das else keinen Partner → TS-Syntaxfehler! Deshalb muss der gesamte innere else-Block (Z.418-446) als ein Stueck ersetzt werden.

**Rewrite Z.418-446 zu:**
```typescript
} else {
  if (lineSanitized) attempts.push(`Sanitized-ArtNo fail ('${lineSanitized}')`);
  // No match found after Strategies 1-3
  matchStatus = 'no-match';
  matchedArticle = undefined;
  if (lineCode) attempts.push(`ArtNo final fail`);
  reason = attempts.join('; ') || 'Kein Identifier vorhanden';
}
```
> WICHTIG: Die `lineSanitized`-Trace-Zeile (Original Z.419) MUSS erhalten bleiben — sonst fehlt die Sanitized-Strategie in der Diagnose-Ausgabe!

### 1b. Import-Validierung in masterDataParser.ts

**Datei:** `src/services/masterDataParser.ts` (Z.227-250)

**Regex:** `^1\d{5}$` — 6 Ziffern, erste muss eine 1 sein (konsistent mit `ARTNO_DE_REGEX` in FalmecMatcher_Master.ts:35).

**Default-Regex als Konstante** (Top-Level in masterDataParser.ts):
```typescript
const DEFAULT_ARTNO_DE_REGEX = /^1\d{5}$/;
```

**Aenderung Z.227:** Regex-Override aus `matcherProfileOverrides` beruecksichtigen (wird via Parameter uebergeben):
```typescript
const falmecArticleNoRaw = idx('artNoDE') >= 0 ? cellStr(row[idx('artNoDE')]) : '';
const artNoRegex = artNoDeOverrideRegex ?? DEFAULT_ARTNO_DE_REGEX;
const falmecArticleNo = artNoRegex.test(falmecArticleNoRaw.trim())
  ? falmecArticleNoRaw.trim()
  : '';  // Ungueltige ArtNo → leer (Artikel wird trotzdem importiert, kann via EAN/ManufacturerArtNo matchen)
```

**Parameter-Weitergabe:** Die Funktion heisst `parseMasterDataFile` (NICHT `parseMasterData`!) und nimmt ein `File`-Objekt:
```typescript
export async function parseMasterDataFile(
  file: File,
  options?: { artNoDeRegex?: RegExp },
): Promise<MasterDataParseResult>
```
Aufrufer in runStore.ts (Z.690 und Z.960) uebergibt `globalConfig.matcherProfileOverrides?.artNoDeRegex` (als `new RegExp(...)` gewrappt, mit try/catch Fallback auf Default).

**Wichtig:** Artikel mit leerer `falmecArticleNo` werden NICHT verworfen — sie koennen immer noch via `manufacturerArticleNo` oder `ean` matchen (Strategies 1-3). Nur das `falmecArticleNo`-Feld wird bereinigt.

### 1c. Settings-UI: "Zuruecksetzen"-Button + Wiring

**Befund:** Die Override-Infrastruktur existiert BEREITS:
- `MatcherProfileOverrides` Interface mit `artNoDeRegex` Feld → `src/types/index.ts` (Z.148)
- Toggle "Custom Override aktiv" + "Anpassen"-Button → `src/components/SettingsPopup.tsx` (Z.1192-1205)
- `OverrideEditorModal` mit RegexField fuer "Falmec Art-Nr Regex" → `src/components/OverrideEditorModal.tsx` (Z.294-299)
- **ABER:** Die gespeicherten Overrides werden vom Matcher/Parser NICHT konsumiert — nur gespeichert.

**Aenderungen:**

**1. SettingsPopup.tsx (Z.1202-1206):** "Anpassen" → "Bearbeiten" umbenennen + "Zuruecksetzen"-Button daneben:
```tsx
{matcherOverrideEnabled && (
  <div className="flex gap-2">
    <FooterButton onClick={() => openOverrideModal(2)}>
      Bearbeiten
    </FooterButton>
    <FooterButton onClick={handleResetMatcherOverrides}>
      Zuruecksetzen
    </FooterButton>
  </div>
)}
```

**2. Reset-Bestaetigungsdialog** — KISS: Nativer `window.confirm()`, KEINE neue shadcn-Komponente:
```typescript
const handleResetMatcherOverrides = () => {
  if (window.confirm(
    'Der aktuelle Wert wird durch die Grundeinstellung (^1\\d{5}$) ersetzt. ' +
    'Der ueberschriebene Wert wird nicht gesichert. Wollen Sie fortfahren?'
  )) {
    setGlobalConfig({ matcherProfileOverrides: { enabled: true } }); // Aliases/Regex auf undefined → Defaults
  }
};
```

**3. Wiring: artNoDeRegex zum Parser durchreichen:**
- In `runStore.ts` beim Aufruf von `parseMasterData()`: `globalConfig.matcherProfileOverrides?.artNoDeRegex` auslesen
- Als `new RegExp(artNoDeRegex)` wrappen (String → RegExp) mit try/catch Fallback auf Default

---

## Phase 2: Workflow Handbremse

### 2a. Step 2 Status: soft-fail → failed

**Dateien:**
- `src/store/runStore.ts` (Z.3305) — `executeMatcherCrossMatch`
- `src/store/runStore.ts` (Z.2649) — `executeArticleMatching`

**Aenderung (beide Stellen identisch):**
```typescript
// VORHER:
const step2Status: StepStatus = noMatchCount > 0 ? 'soft-fail' : 'ok';

// NACHHER:
const step2Status: StepStatus = noMatchCount > 0 ? 'failed' : 'ok';
```

**Warum das reicht:** Der Auto-Advance bei Z.1583 prueft `step2.status === 'ok' || step2.status === 'soft-fail'`. Da `'failed'` NICHT in dieser Bedingung ist, wird Auto-Advance automatisch blockiert. Kein zusaetzlicher Guard noetig.

### 2b. Re-Evaluation nach manueller Korrektur

**Neue Logik in der Store-Action (Phase 3):** Nach jedem manuellen Artikel-Fix:
1. InvoiceLine updaten → matchStatus = `'full-match'`
2. `computeMatchStats()` ausfuehren → noMatchCount neu berechnen
3. Wenn `noMatchCount === 0`:
   - Step 2 Status auf `'ok'` setzen
   - Auto-Advance triggern: `get().advanceToNextStep(runId)`
4. Wenn `noMatchCount > 0` aber reduziert:
   - Step 2 bleibt `'failed'`
   - Stats updaten + `refreshIssues(runId)` fuer Auto-Resolve der betroffenen Issue-Zeilen

### 2c. Resume-Guard pruefen

**Datei:** `src/store/runStore.ts` (Z.2127)

Die Resume-Logik prueft ebenfalls `step2.status === 'ok' || step2.status === 'soft-fail'`. Da wir jetzt `'failed'` nutzen, wird auch Resume nicht versehentlich weiter-advancen. **Kein Code-Aenderung noetig** — funktioniert automatisch korrekt.

---

## Phase 3: IssueDialog Smart-UI

### 3a. Neue Store-Action: `setManualArticleByPosition`

**Datei:** `src/store/runStore.ts` — nach `setManualPriceByPosition` (Z.2777)

**Interface fuer die Formulardaten:**
```typescript
interface ManualArticleData {
  falmecArticleNo: string;       // Pflichtfeld, muss ^1\d{5}$ matchen (oder Override-Regex)
  manufacturerArticleNo?: string;
  ean?: string;
  serialRequired?: boolean;
  storageLocation?: string;
  descriptionDE?: string;
  supplierId?: string;
  orderNumberAssigned?: string;  // Format: YYYY-XXXX
}
```

**Action-Signatur:**
```typescript
setManualArticleByPosition: (positionIndex: number, data: ManualArticleData, runId: string) => void;
```

**Implementierung (Pattern analog zu `setManualPriceByPosition` Z.2731-2777):**

**KRITISCH — Stammdaten-Lookup VOR dem Line-Update:**
```typescript
// 0. Artikel in masterDataStore suchen
const masterArticles = useMasterDataStore.getState().articles;
const matched = masterArticles.find(a => a.falmecArticleNo === data.falmecArticleNo);
```
Wenn `matched` gefunden → echte Stammdaten haben VORRANG vor Formulardaten.
Wenn NICHT gefunden → Formulardaten direkt verwenden (User hat manuell eingegeben).

1. `set()` — Alle InvoiceLines mit `positionIndex` + `runId`-Prefix updaten:
   - `falmecArticleNo: data.falmecArticleNo`
   - `matchStatus: 'full-match'`
   - **Aus Stammdaten (wenn matched):**
     - `unitPriceSage: matched.unitPriceNet` (KRITISCH fuer Step 4 Preis!)
     - `descriptionDE: matched.descriptionDE ?? data.descriptionDE`
     - `storageLocation: matched.storageLocation || data.storageLocation`
     - `serialRequired: matched.serialRequirement`  (Achtung: `serialRequirement` auf ArticleMaster, `serialRequired` auf InvoiceLine)
     - `manufacturerArticleNo: matched.manufacturerArticleNo || data.manufacturerArticleNo`
     - `ean: matched.ean || data.ean`
     - `supplierId: matched.supplierId ?? data.supplierId`
     - `activeFlag: matched.activeFlag`
   - **Ohne Stammdaten-Treffer (Fallback auf Formulardaten):**
     - `descriptionDE: data.descriptionDE ?? line.descriptionDE`
     - `storageLocation: data.storageLocation ?? line.storageLocation`
     - `serialRequired: data.serialRequired ?? line.serialRequired`
     - `manufacturerArticleNo: data.manufacturerArticleNo ?? line.manufacturerArticleNo`
     - `ean: data.ean ?? line.ean`
     - `supplierId: data.supplierId ?? line.supplierId`
     - `unitPriceSage: null` (kein Stammdaten-Preis verfuegbar)
   - **Immer:**
     - `logicalStorageGroup`: ableiten aus finalem `storageLocation` (WE/KDD/null)
     - `priceCheckStatus`: neu berechnen (Vergleich `unitPriceSage` vs `unitPriceInvoice`)
     - Optional: `orderNumberAssigned`, `orderYear`, `orderCode` aus YYYY-XXXX parsen

   **Preis-Check-Logik:**
   ```typescript
   const finalPrice = matched?.unitPriceNet ?? null;
   const priceCheckStatus: PriceCheckStatus = !finalPrice
     ? 'missing'
     : Math.abs(finalPrice - line.unitPriceInvoice) <= tolerance
       ? 'ok'
       : 'mismatch';
   const unitPriceFinal = priceCheckStatus === 'ok' ? finalPrice : line.unitPriceFinal;
   ```

2. `logService.info(...)` + `addAuditEntry(...)` — mit Info ob Stammdaten-Treffer oder nur Formular
3. Match-Stats + Step2-Status re-evaluieren (via `computeMatchStats`):
   ```typescript
   const matchStats = computeMatchStats(runLines);
   const noMatchCount = matchStats.noMatchCount ?? 0;
   const newStep2Status: StepStatus = noMatchCount > 0 ? 'failed' : 'ok';
   // Step 2 Status updaten in runs + currentRun
   ```
4. `refreshIssues(runId)` — Auto-Resolve triggern
5. Wenn `noMatchCount === 0` und Step 2 war vorher `'failed'`:
   - Step 2 → `'ok'`
   - **Pause-Guard:** NUR wenn `!get().isPaused` → dann `setTimeout(() => { if (!get().isPaused) get().advanceToNextStep(runId); }, 100)` (Auto-Advance nachholen)
   - Ohne Pause-Guard wuerde ein pausierter Run versehentlich weiter-advancen!

**logicalStorageGroup ableiten — EXAKT wie der Matcher (Z.486-488):**
```typescript
// Echte Matcher-Logik: KDD wenn 'KDD' enthalten, sonst WE (Default!), null nur bei leerem storageLocation
const logicalStorageGroup: 'WE' | 'KDD' | null = storageLocation
  ? (storageLocation.includes('KDD') ? 'KDD' : 'WE')
  : null;
```
> ACHTUNG: Der Matcher nutzt CASE-SENSITIVE `.includes('KDD')` und defaultet zu `'WE'` fuer JEDE nicht-KDD Location! Die urspruenglich geplante Funktion mit `.toLowerCase()` und `return null` Fallback war FALSCH und haette fuer Locations ohne 'we'/'kdd' im Namen `null` statt `'WE'` geliefert.

### 3b. Store-Interface erweitern

**Datei:** `src/store/runStore.ts` — Interface `RunStore` (ca. Z.500-530)

Neue Action-Signatur hinzufuegen:
```typescript
setManualArticleByPosition: (positionIndex: number, data: ManualArticleData, runId: string) => void;
```

### 3c. ArticleMatchForm im IssueDialog

**Datei:** `src/components/run-detail/IssueDialog.tsx`

**Platzierung:** Im "Uebersicht"-Tab, direkt NACH dem PriceCell-Block (Z.311) und VOR dem Warntext-Block (Z.313). Analog zum PriceCell-Pattern:

```tsx
{/* PROJ-45-ADD-ON-round4: ArticleMatchForm — nur bei no-article-match */}
{(issue?.type === 'no-article-match' || issue?.type === 'match-artno-not-found') && (() => {
  // affectedLines ist bereits dedupliziert (1 pro Position)
  return (
    <div className="rounded-lg border-2 border-teal-400/50 bg-white/40 p-3 space-y-3">
      <div>
        <p className="text-sm font-semibold mb-0.5">Artikel manuell zuordnen:</p>
        <p className="text-xs text-muted-foreground">
          Fehlende Stammdaten ergaenzen. Bekannte Daten sind vorbefuellt.
        </p>
      </div>
      {affectedLines.map(line => (
        <ArticleMatchCard key={line.lineId} line={line} runId={currentRun!.id} />
      ))}
    </div>
  );
})()}
```

### 3d. ArticleMatchCard Komponente

**Option A (bevorzugt):** Inline in IssueDialog.tsx als lokale Komponente (kein eigenes File — KISS).
**Option B:** Eigenes File `src/components/run-detail/ArticleMatchCard.tsx` falls zu gross.

**Felder-Layout (2-Spalten Grid):**

| Feld | Typ | Pre-Fill Quelle | Pflicht |
|------|-----|-----------------|---------|
| Artikelnummer (Falmec) | Input `^1\d{5}$` | `line.falmecArticleNo` (meist null) | JA |
| Herstellerartikelnummer | Input | `line.manufacturerArticleNo` | Nein |
| EAN | Input | `line.ean` | Nein |
| S/N-Pflicht | Select (Ja/Nein) | `line.serialRequired` | Nein |
| Wareneingangslager | Select (STORAGE_LOCATIONS) | `line.storageLocation` | Nein |
| Bestellnummer | Input (YYYY-XXXX) | `line.orderNumberAssigned` | Nein |
| Lieferant | Input | `line.supplierId` | Nein |
| Bezeichnung (DE) | Input | `line.descriptionDE` | Nein |

**Visueller Aufbau:**
```
┌─ border-2 border-teal-400/50 bg-white/40 rounded-lg p-3 ─────────┐
│ POS 1: EAN 8010999163758 / Art-Nr..."                            │
│                                                                    │
│  [Artikelnr (Falmec)*]  [Hersteller-Art-Nr]                       │
│  [EAN               ]  [Bezeichnung (DE) ]                        │
│  [S/N-Pflicht ▼     ]  [Lager         ▼  ]                        │
│  [Bestellnummer     ]  [Lieferant        ]                        │
│                                                                    │
│                              [ Uebernehmen ]                       │
└────────────────────────────────────────────────────────────────────┘
```

**State-Management (LOKAL im Card):**
```typescript
const [formData, setFormData] = useState<ManualArticleData>(() => ({
  falmecArticleNo: line.falmecArticleNo ?? '',
  manufacturerArticleNo: line.manufacturerArticleNo ?? '',
  ean: line.ean ?? '',
  serialRequired: line.serialRequired ?? false,
  storageLocation: line.storageLocation ?? '',
  descriptionDE: line.descriptionDE ?? '',
  supplierId: line.supplierId ?? '',
  orderNumberAssigned: line.orderNumberAssigned ?? '',
}));
```

**Uebernehmen-Button:**
- Validierung: `falmecArticleNo` muss `^1\d{5}$` matchen (oder aktive Override-Regex) → sonst Button disabled + Fehlermeldung
- onClick: `setManualArticleByPosition(line.positionIndex, formData, runId)`
- Nach Erfolg: visuelles Feedback (z.B. kurzes Haekchen oder die Card wird gruen)

### 3e. Imports in IssueDialog.tsx

Neue Imports:
- `STORAGE_LOCATIONS` aus `@/types`
- `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` aus `@/components/ui/select` (schon vorhanden pruefen)
- `Input` aus `@/components/ui/input`
- `setManualArticleByPosition` aus dem Store (analog zu `setManualPriceByPosition`)

---

## Zusammenfassung der Dateiaenderungen

| Datei | Aenderung |
|-------|-----------|
| `src/services/matchers/modules/FalmecMatcher_Master.ts` | Strategy 4 (Z.418-446 komplett ersetzen) |
| `src/services/masterDataParser.ts` | `falmecArticleNo` Regex-Validierung (Z.227) + optionaler Override-Param |
| `src/components/SettingsPopup.tsx` | "Anpassen"→"Bearbeiten" + "Zuruecksetzen"-Button + `window.confirm()` |
| `src/store/runStore.ts` (Z.3305) | `'soft-fail'` → `'failed'` |
| `src/store/runStore.ts` (Z.2649) | `'soft-fail'` → `'failed'` |
| `src/store/runStore.ts` (neu, ~Z.2778) | `setManualArticleByPosition` Action + Stammdaten-Lookup |
| `src/store/runStore.ts` (Interface) | Action-Signatur hinzufuegen |
| `src/components/run-detail/IssueDialog.tsx` | ArticleMatchForm/Card + Imports |
| `features/PROJ-45-ADD-ON-round4_ArticleMatch_Firewall_Smart-UI.md` | Diesen Plan speichern |
| `features/INDEX.md` | Neuen Eintrag hinzufuegen |

---

## Bestehende Funktionen wiederverwenden

- `computeMatchStats()` — `src/store/runStore.ts:318` — Stats nach manueller Aenderung
- `buildArticleMatchIssues()` — `src/store/runStore.ts:353` — Issues neu generieren
- `resolveIssueLines()` — `src/store/runStore.ts:207` — IDs → InvoiceLines
- `checkIssueStillActive()` — `src/store/runStore.ts:246` — Auto-Resolve (prueft `matchStatus === 'no-match'`)
- `STORAGE_LOCATIONS` — `src/types/index.ts:412` — Dropdown-Werte
- PriceCell-Card-Styling — `src/components/run-detail/IssueDialog.tsx:286` — Visuelles Template
- `MatcherProfileOverrides` — `src/types/index.ts:148` — Override-Interface (artNoDeRegex bereits definiert)
- `OverrideEditorModal` — `src/components/OverrideEditorModal.tsx` — Regex-Editor (fertig, nur Wiring fehlt)
- `FooterButton` — `src/components/SettingsPopup.tsx` — Button-Komponente fuer Settings-Footer
- `ARTNO_DE_REGEX` — `src/services/matchers/modules/FalmecMatcher_Master.ts:35` — Bestehende `/^1\d{5}$/` Konstante
- `useMasterDataStore` — `src/store/masterDataStore.ts` — Globaler Stammdaten-Store (articles[] fuer Lookup, bereits in runStore.ts importiert Z.24)

---

## Verifikation / Testplan

1. **Phase 1 testen:**
   - Excel mit ungueltiger `falmecArticleNo` (z.B. "ABC", "12345", "200001") importieren → Feld muss leer sein (nicht mit 1 beginnend)
   - Excel mit gueltiger `falmecArticleNo` (z.B. "123456") importieren → Feld korrekt gefuellt
   - PDF mit Artikel matchen, der vorher nur via Partial-Match traf → muss jetzt `no-match` sein
   - Settings > Matcher > Override aktivieren → "Bearbeiten" + "Zuruecksetzen" Buttons erscheinen
   - "Zuruecksetzen" klicken → Bestaetigungsdialog mit Grundeinstellung `^1\d{5}$` → OK → Override geloescht
   - Custom Regex im OverrideEditor eingeben + speichern → naechster Import nutzt die neue Regex
   - `npx tsc --noEmit` — keine TypeScript-Fehler

2. **Phase 2 testen:**
   - Run starten mit mindestens 1 Artikel ohne Match → Step 2 Status muss `'failed'` zeigen
   - Auto-Advance darf NICHT nach Step 3 weitergehen
   - Step 2 Kachel zeigt Fehler-Status (rot)

3. **Phase 3 testen:**
   - IssueDialog oeffnen bei `no-article-match` Issue → Formular muss sichtbar sein
   - Felder muessen mit InvoiceLine-Daten vorbefuellt sein
   - `falmecArticleNo` eingeben (6 Ziffern, mit 1 beginnend) → Uebernehmen klicken
   - InvoiceLine muss `matchStatus: 'full-match'` haben
   - Stammdaten-Lookup: wenn falmecArticleNo in masterDataStore existiert → unitPriceSage, descriptionDE etc. automatisch befuellt
   - Issue muss auto-resolven (verschwindet oder Status 'resolved')
   - Wenn ALLE no-match Zeilen korrigiert: Step 2 springt auf `'ok'` + Auto-Advance startet

4. **Edge Cases:**
   - Mehrere no-match Zeilen: einzeln korrigieren, pruefen dass Auto-Advance erst nach LETZTER Korrektur startet
   - Dialog schliessen ohne Speichern: keine Aenderung
   - Ungueltige falmecArticleNo eingeben: Button bleibt disabled
   - falmecArticleNo die NICHT in Stammdaten existiert: Formular-Daten werden direkt verwendet, kein Preis

---

## Nuetzliche Hinweise fuer Sonnet bei der Durchfuehrung des Plans um Fehler zu vermeiden

### 1. Formular-Rerenders im Dialog
- `useState` mit **Initializer-Funktion** `() => ({...})` verwenden, NICHT mit direktem Objekt → verhindert Re-Initialisierung bei jedem Rerender
- Die `line`-Prop der ArticleMatchCard aendert sich, wenn der User "Uebernehmen" klickt (weil `invoiceLines` im Store aktualisiert wird). Der lokale `formData`-State darf sich dann NICHT zuruecksetzen! Loesung: **KEIN** `useEffect([line])` das den State resettet — der User soll seine Eingaben behalten
- Falls mehrere Cards gerendert werden (mehrere affectedLines): Jede Card ist eine **eigene Instanz** mit eigenem State. React-Key muss `line.lineId` sein (NICHT `positionIndex`, da positionIndex sich nach Expansion aendern kann)

### 2. Store-Action korrekt implementieren
- `set()` im Zustand ist **immutable** — IMMER `...line` spreaden, dann ueberschreiben
- `positionIndex`-basiertes Update: ALLE Zeilen mit gleichem `positionIndex` + `runId`-Prefix muessen aktualisiert werden (nach Expansion gibt es mehrere Zeilen pro Position)
- Nach dem `set()` sofort `get()` aufrufen fuer frische Daten — NICHT die alten Closure-Werte verwenden
- `refreshIssues(runId)` MUSS nach dem Stats-Update kommen, nicht davor

### 3. Auto-Advance nach Step 2 Korrektur — PAUSE-GUARD PFLICHT
- Der Auto-Advance nach manueller Korrektur darf NICHT sofort feuern — nutze `setTimeout(() => { ... }, 100)` analog zum Pattern in Z.1578
- **ZWINGEND:** Pruefe VOR dem Advance ob `!get().isPaused` (PROJ-25 Guard) — ein pausierter Run darf NIEMALS auto-advancen!
- Pruefe ob Step 3 nicht schon laeuft (doppelter Advance verhindern)
- Pattern: `setTimeout(() => { const s = get(); if (!s.isPaused) s.advanceToNextStep(runId); }, 100)`

### 4. TypeScript-Fallen
- `ManualArticleData` Interface muss AUSSERHALB der Store-Definition deklariert werden (Top-Level oder in types/index.ts)
- `STORAGE_LOCATIONS` ist `as const` — Typ ist `readonly string[]`, NICHT `string[]`. Bei `Select`-Komponenten evtl. Cast noetig
- `logicalStorageGroup` ist `'WE' | 'KDD' | null` — String-Literal-Typ, nicht einfach `string`

### 5. Settings-UI (SettingsPopup)
- KEIN `AlertDialog` installieren! Nutze `window.confirm()` — KISS
- Der Reset-Handler setzt `matcherProfileOverrides` auf `{ enabled: true }` (NICHT `undefined`!) — damit der Toggle an bleibt aber alle Overrides geloescht werden
- Das "Zuruecksetzen" darf nur die Matcher-Overrides zuruecksetzen, NICHT die Order-Parser-Overrides (`orderParserProfileOverrides` unangetastet lassen)

### 6. Stammdaten-Lookup in Store-Action (KRITISCH!)
- `useMasterDataStore.getState().articles` ist der Zugriffspfad auf die Stammdaten
- Import: `import { useMasterDataStore } from '@/store/masterDataStore'` (bereits in runStore.ts Z.24 importiert!)
- Die Suche ist `articles.find(a => a.falmecArticleNo === data.falmecArticleNo)` — linearer Scan ist OK (max ~3000 Artikel)
- **Achtung Feldname-Divergenz:** `ArticleMaster.serialRequirement` (boolean) vs `InvoiceLine.serialRequired` (boolean) — unterschiedliche Namen fuer dasselbe Konzept!
- Wenn Stammdaten-Treffer: ALLE Felder aus `ArticleMaster` muessen in die `InvoiceLine` fliessen, besonders `unitPriceNet` → `unitPriceSage` (sonst fehlt der Preis fuer Step 4/5 Export!)
- `priceCheckStatus` muss nach dem Stammdaten-Lookup neu berechnet werden — Vergleich `unitPriceSage` vs `unitPriceInvoice` mit Toleranz aus `globalConfig.tolerance`

### 7. Strategy-4-Entfernung (SYNTAXFALLE!)
- Z.418-446 KOMPLETT als ein Stueck ersetzen! NICHT nur Z.421-439 loeschen!
- Grund: Z.440 `} else {` ist der else-Zweig des `if (matchByPartial)` bei Z.430. Wenn das if wegfaellt, hat das else keinen Partner → TS-Syntaxfehler!
- Die Zeile `if (lineSanitized) attempts.push(...)` (Original Z.419) MUSS im neuen Code erhalten bleiben!
- Die Variable `matchByPartial` und die Referenzen darauf werden automatisch mit dem Block entfernt

### 8. FooterButton API
- `FooterButton` in SettingsPopup.tsx akzeptiert NUR: `onClick`, `children`, `danger?`, `disabled?`, `className?`
- Es gibt KEINE `variant`-Prop! Nutze `className` fuer abweichendes Styling

### 9. Sonnet-Regeln (Checkliste)
1. `features/PROJ-45-ADD-ON-round4-ArticleMatch.md` physisch schreiben
2. `features/INDEX.md` aktualisieren
3. `npx tsc --noEmit` am Ende ausfuehren und ALLE Fehler fixen
4. Skills laden wenn hilfreich (`frontend`, `react-dev`, `qa`)
5. Kein Over-Engineering — lokaler State reicht, kein separater Zustand-Store fuer das Formular
