# PROJ-45 ADD-ON: Artikelmatch Fehlerhandling - Diagnose

Stand: 2026-03-16

## Kurzfazit

Der aktive Step-2-Pfad laeuft **nicht** ueber den Legacy-`ArticleMatcher`, sondern ueber `runStore.executeMatcherCrossMatch()` -> `FalmecMatcher_Master.crossMatch()`.

Das aktuelle Lagebild ist:

1. Einen **expliziten** Fallback `kein Treffer -> nimm articles[0]` habe ich im aktiven Code **nicht** gefunden.
2. Es gibt aber einen **gefährlichen datenabhaengigen Fallback** in Step 2:
   - `Strategy 4: Partial ArtNo match` verwendet `articles.find(...)` und nimmt damit den **ersten partiell passenden Datensatz in Array-Reihenfolge**.
3. Die Validierung der Falmec-Artikelnummer ist zwar im Schema definiert, wird beim Import der Stammdaten aber **nicht runtime-seitig erzwungen**.
4. Das UI rendert den Match-Indikator **nicht aus einem eigenen Confidence-Feld**, sondern direkt aus `InvoiceLine.matchStatus`.
5. Step 4 wird aktuell **nicht** durch offene `no-article-match`-Issues blockiert.
6. Schlimmer noch: no-match-Zeilen koennen in Step 4 als `orderAssignmentReason: 'pending'` durchrutschen und werden dann vom Step-4-Status/Issue-Building teilweise nicht erfasst.

---

## 1. Wo passiert der gefaehrliche Fallback auf den ersten Datensatz?

### Sicher belegt

Im **aktiven** Matcher existiert kein harter `articles[0]`-Fallback.

Aktiver Pfad:

- `src/store/runStore.ts:3190-3276`
- `src/services/matchers/modules/FalmecMatcher_Master.ts:188-206`

Der eigentliche Risk-Pfad sitzt hier:

- `src/services/matchers/modules/FalmecMatcher_Master.ts:421-427`

```ts
let matchByPartial: ArticleMaster | undefined;
if (lineCode && lineCode.length >= 4) {
  matchByPartial = articles.find(a => {
    const normA = normalize(a.manufacturerArticleNo);
    return normA.includes(lineCode) || lineCode.includes(normA);
  });
}
```

`articles.find(...)` liefert den **ersten Treffer in Array-Reihenfolge**. Das ist kein "nimm immer Datensatz 0", aber funktional ein **first-hit fallback**.

Wenn also:

- Exact ArtNo scheitert,
- Exact EAN scheitert,
- Sanitized ArtNo scheitert,
- aber irgendein Stammdatensatz per `includes(...)` partiell passt,

dann wird der **erste** partielle Treffer als gueltiger Match akzeptiert und als `code-it-only` gespeichert:

- `src/services/matchers/modules/FalmecMatcher_Master.ts:430-438`

### Wichtige Inferenz zu "100001"

Die konkrete "100001"-Zuordnung ist im Code **nicht hart verdrahtet**. Es gibt keinen Literal-Wert `100001` und keinen `articles[0]`-Zugriff im aktiven Step-2-Pfad.

Damit bleiben aus dem Code zwei realistische Erklaerungen:

1. **Partial-Match first hit**
   - Der erste Stammdatensatz passt ueber `includes(...)` breit genug und wird deshalb gezogen.
2. **Fehlerhaft/unvalidiert importierte Stammdaten**
   - `falmecArticleNo` wird beim Excel-Import ungeprueft uebernommen.
   - Wenn der importierte Datensatz selbst falsch ist, zeigt der Match spaeter trotzdem dessen `falmecArticleNo`.

Ohne die konkrete hochgeladene Excel-Datei kann ich **nicht beweisen**, welcher der beiden Faelle euer beobachtetes `100001` konkret ausloest.

### Zusatzbefund

Der Legacy-`ArticleMatcher` ist zwar noch im Repo, aber laut Header **deprecated** und nicht der aktive Workflow:

- `src/services/matching/ArticleMatcher.ts:1-11`

Auch dort gibt es keinen `articles[0]`-Fallback, nur Exact-Matches:

- `src/services/matching/ArticleMatcher.ts:81-106`

---

## 2. Wo findet die Validierung der Artikelnummer statt und warum rutscht `XXXXX` durch?

### Sicher belegt

Die einzige echte Validierungsdefinition fuer Art-# (DE) liegt im Schema des Matchers:

- `src/services/matchers/modules/FalmecMatcher_Master.ts:35-40`
- `src/services/matchers/modules/FalmecMatcher_Master.ts:66-80`

Aktuell:

```ts
const ARTNO_DE_REGEX = /^1\d{5}$/;
...
validationPattern: '^1\\d{5}$',
validate: (v) => ARTNO_DE_REGEX.test(v.trim()),
```

Das ist bereits **strenger** als euer gewuenschtes `^\d{6}$`, weil es nur 6 Ziffern erlaubt, die mit `1` beginnen.

### Warum `XXXXX` trotzdem durchrutscht

Weil diese Validierung im Importpfad **nirgendwo aufgerufen** wird.

Der Parser importiert `falmecArticleNo` blind:

- `src/services/masterDataParser.ts:227-247`

```ts
const falmecArticleNo = idx('artNoDE') >= 0 ? cellStr(row[idx('artNoDE')]) : '';
...
const article: ArticleMaster = {
  ...
  falmecArticleNo,
  ...
};
articles.push(article);
```

Es gibt:

- Warnungen fuer fehlende Pflichtspalten: `src/services/masterDataParser.ts:203-208`
- aber **keine Row-Level-Validierung** des Zellwerts gegen `field.validate`.

In `src/services/matchers/types.ts:26-34` steht sogar ausdruecklich, dass `validationPattern` nur fuer Anzeige gedacht ist und Runtime-Validation ueber `validate` erfolgen soll. Diese Runtime-Validation wird im Parser aber aktuell nicht benutzt.

### Warum das UI dann gruene Haken zeigt

Der grüne Haken haengt **nur** an `matchStatus === 'full-match'`:

- `src/components/run-detail/StatusCheckbox.tsx:25-29`
- `src/components/run-detail/ItemsTable.tsx:374-376`
- `src/components/run-detail/InvoicePreview.tsx:462-498`

Wenn also ein Datensatz fachlich ungueltige `falmecArticleNo: "XXXXX"` traegt, aber ArtNo-IT und/oder EAN erfolgreich matchen, dann wird:

- `matchStatus` auf `full-match`, `code-it-only` oder `ean-only` gesetzt
- und das UI zeigt den entsprechenden Match-Status an
- **ohne** zusaetzliche Pruefung, ob `falmecArticleNo` formal gueltig ist.

### Wo die saubere Regex-Pruefung eingehaengt werden muesste

Primärer Hook fuer sauberes Fehlerhandling:

- `src/services/masterDataParser.ts` direkt **vor** `articles.push(article)` in der Row-Schleife (`224-250`)

Dort sollte `falmecArticleNo` gegen die Regel geprueft werden. Fuer euren Zielzustand:

```regex
^\d{6}$
```

Sekundärer Schutzwall:

- `src/services/matchers/modules/FalmecMatcher_Master.ts` direkt **vor** dem erfolgreichen Rueckgabezweig mit `matchedArticle`

Dann koennte ein formal ungueltiger Stammdatensatz trotz zufaelligem Identifier-Match nicht mehr als "Match" im UI landen.

### Zusatzbefund

Es existieren Override-Felder fuer Matcher-Regexe:

- `src/types/index.ts:136-145`

Aber ich habe keine aktive Runtime-Verkabelung gefunden, die `matcherProfileOverrides.artNoDeRegex` im Parser oder Matcher wirklich anwendet.

---

## 3. Wie wird der Confidence-Wert/Match-Status aktuell gespeichert und ans UI uebergeben?

### Sicher belegt: Es gibt zwei verschiedene Ebenen

#### A. Zeilenebene: `InvoiceLine.matchStatus`

`InvoiceLine` hat **kein eigenes Feld `confidence`**. Die relevante Zeileninformation ist nur:

- `src/types/index.ts:276-318`
- konkret: `matchStatus` in `src/types/index.ts:302-303`

Moegliche Werte:

- `pending`
- `full-match`
- `code-it-only`
- `ean-only`
- `no-match`

Das ist aktuell die einzige persistierte line-level Information dafuer, **welche Match-Art gewonnen hat**.

#### B. Step-Ebene: `StepDiagnostics.confidence`

Ein echtes `confidence`-Feld existiert nur auf Step-Diagnose-Ebene:

- `src/types/index.ts:116-125`

Step 2 schreibt dieses Feld hier:

- `src/store/runStore.ts:3411-3418`

```ts
confidence: noMatchCount === 0 ? 'high' : noMatchCount < enrichedLines.length / 2 ? 'medium' : 'low'
```

Das ist aber **nur eine globale Step-2-Schaetzung** fuer den gesamten Lauf, nicht fuer einzelne `InvoiceLine`s.

### Wie der Match-Status im `InvoiceLine` gesetzt wird

Der Matcher setzt pro Zeile:

- `full-match` bei ArtNo + EAN auf denselben Artikel
- `code-it-only` bei Treffer nur ueber Herstellerartikelnr.
- `ean-only` bei Treffer nur ueber EAN
- `no-match` bei keinem Treffer oder Konflikt

Siehe:

- `src/services/matchers/modules/FalmecMatcher_Master.ts:376-402`
- `src/services/matchers/modules/FalmecMatcher_Master.ts:408-438`
- `src/services/matchers/modules/FalmecMatcher_Master.ts:442-474`

Danach kopiert `runStore.executeMatcherCrossMatch()` diese Felder auf alle Zeilen der Position:

- `src/store/runStore.ts:3278-3300`

Dabei werden u.a. uebernommen:

- `matchStatus`
- `falmecArticleNo`
- `descriptionDE`
- `unitPriceSage`
- `serialRequired`
- `activeFlag`
- `storageLocation`
- `logicalStorageGroup`
- `priceCheckStatus`
- `unitPriceFinal`

### Was **nicht** gespeichert wird

Es gibt aktuell **keine expliziten Felder** auf `InvoiceLine` wie:

- `matchedByEan: boolean`
- `matchedByManufacturerArticleNo: boolean`
- `matchConfidence: 'high'|'medium'|'low'`
- `matchStrategy: 'exact'|'sanitized'|'partial'`

Die genaue Strategie lebt nur implizit in:

- `matchStatus`
- temporären `warnings` / `MATCH_TRACE`

Die `MATCH_TRACE`-Information wird zwar erzeugt, aber nicht auf `InvoiceLine` persistiert:

- `src/services/matchers/modules/FalmecMatcher_Master.ts:249-258`
- `src/services/matchers/modules/FalmecMatcher_Master.ts:412-417`

### Wie das UI den Status anzeigt

Die Tabelle bekommt **nur `matchStatus`**:

- Artikelliste: `src/components/run-detail/ItemsTable.tsx:374-376`
- Rechnungspositionen: `src/components/run-detail/InvoicePreview.tsx:462-498`

`StatusCheckbox` mappt rein statisch:

- `full-match` -> gruener `CheckCircle2`
- `code-it-only` -> `Code_IT.ico`
- `ean-only` -> `EAN.ico`
- `no-match` -> rotes X
- `pending` -> Hourglass

Siehe:

- `src/components/run-detail/StatusCheckbox.tsx:18-30`

### Fazit zu Punkt 3

Der UI-Indikator zeigt **nicht** den globalen `confidence` aus `StepDiagnostics`.
Er zeigt auch **nicht** "welche Felder gematcht haben" als separates Modell.
Er zeigt ausschliesslich den `matchStatus` der Zeile.

Wenn ihr fachlich "Confidence" anzeigen wollt, ist die aktuelle Architektur daher uneinheitlich:

- globaler Step-Confidence existiert
- line-level Match-Art existiert
- line-level Confidence/Feldmatrix existiert **nicht**

---

## 4. Workflow-Check: Blockiert das System Step 4 bei `no-article-match`?

### Klare Antwort

**Nein.**

Ein offenes `no-article-match` Issue blockiert den Lauf aktuell **nicht**.

### Beleg 1: Step 2 auto-advancet auch bei `soft-fail`

- `src/store/runStore.ts:1577-1586`

```ts
if (step2 && (step2.status === 'ok' || step2.status === 'soft-fail')) {
  afterMatch.advanceToNextStep(runId);
}
```

Step 2 setzt bei `noMatchCount > 0` explizit:

- `src/store/runStore.ts:3303-3305`

```ts
const step2Status: StepStatus = noMatchCount > 0 ? 'soft-fail' : 'ok';
```

Das heisst:

- `no-article-match` erzeugt Errors/Issues
- Step 2 wird aber nur `soft-fail`
- der Workflow laeuft trotzdem nach Step 3 weiter

### Beleg 2: Step 3 auto-advancet ebenfalls bei `soft-fail`

- `src/store/runStore.ts:1608-1621`

Damit kommt der Run trotz offenem Step-2-Artikelproblem ganz normal in Step 4.

### Beleg 3: Step-4-Gates pruefen andere Dinge, aber nicht `no-article-match`

Geblockt wird Step 4 nur bei:

- `parseResult.validationError`
- `parseResult.positions.length === 0`
- `parseResult.diagnostics.confidence === 'low'`

Siehe:

- `src/store/runStore.ts:1676-1750`

Kein Check auf:

- offene Step-2-Issues
- `no-article-match`
- `matchStatus === 'no-match'`

### Zusaetzlicher Schwachpunkt in Step 4

Unmatched Artikellinien koennen in Step 4 sogar **unsichtbar problematisch** bleiben:

1. Alle neuen `InvoiceLine`s starten mit:
   - `orderAssignmentReason: 'pending'`
   - `matchStatus: 'pending'`
   - `falmecArticleNo: null`
   - `src/services/invoiceParserService.ts:142-183`

2. Wenn Step 2 `no-match` liefert, bleibt `falmecArticleNo: null`.

3. Step 4 kann solche Zeilen nicht sinnvoll in den OrderPool aufnehmen:
   - `src/services/matching/orderPool.ts:96-100`

4. Run 1 / Run 2 / Run 3 springen bei leerem `falmecArticleNo` einfach raus:
   - `src/services/matching/runs/run1PerfectMatch.ts:62-67`
   - `src/services/matching/runs/run2PartialFillup.ts:58-63`
   - `src/services/matching/runs/run3ExpandFifo.ts:137-142`

5. Dadurch bleiben solche Zeilen unter Umstaenden bei `orderAssignmentReason: 'pending'`.

6. `matchingEngine` zaehlt fuer Issues und Step-Status aber nur `not-ordered`, nicht `pending`:
   - Issues: `src/services/matching/matchingEngine.ts:69-90`
   - Stats: `src/services/matching/matchingEngine.ts:186-198`
   - Step-4-Status: `src/store/runStore.ts:2982-2983`

Das bedeutet:

- offene Artikel-No-Matches blockieren Step 4 nicht
- und koennen dort sogar als `pending` unter dem Radar bleiben
- Step 4 kann deshalb im Extremfall `ok` werden, obwohl Zeilen ohne Artikelmatch fachlich nicht mapbar waren

---

## Konzentrierte Befunde fuer die weitere Planung

### A. Harte Sicherheitsluecke in Step 2

`Strategy 4 Partial-ArtNo Match` ist ein unsicherer First-Hit-Fallback:

- `src/services/matchers/modules/FalmecMatcher_Master.ts:421-438`

### B. Stammdaten-Import ist unvalidiert

Die Schema-Validierung ist definiert, aber der Import benutzt sie nicht:

- Definition: `src/services/matchers/modules/FalmecMatcher_Master.ts:66-80`
- Nicht angewendet: `src/services/masterDataParser.ts:224-250`

### C. UI-Indikator ist kein echter Confidence-Indikator

Die Tabelle zeigt `matchStatus`, nicht `StepDiagnostics.confidence` und nicht eine Feldmatrix.

### D. Step-4-Gating ist fachlich unvollstaendig

Es gibt keinen Guard "offene `no-article-match` => Step 4 blockieren".

### E. Zusatzausfall in Step 4

No-match-Zeilen koennen bei `pending` haengenbleiben und werden von Step-4-Issues/Status nicht sauber mitgezaehlt.

---

## Antworten in Kurzform

1. **Warum wird offenbar `100001` gemappt?**
   - Kein expliziter `articles[0]`-Fallback gefunden.
   - Wahrscheinlichster aktiver Risk-Pfad ist `articles.find(...)` im Partial-ArtNo-Fallback (`FalmecMatcher_Master.ts:421-427`), also "erster partieller Treffer".
   - Alternativ stammt `100001` bereits aus unvalidiert importierten Stammdaten.

2. **Warum rutscht `XXXXX` durch?**
   - Die Regex existiert nur als Schema-Definition, wird aber im Parser nicht ausgefuehrt.
   - `masterDataParser` uebernimmt `falmecArticleNo` ungeprueft.
   - Das UI vertraut spaeter nur `matchStatus`.

3. **Wie wird Confidence/Match-Status gespeichert?**
   - Per Zeile nur `InvoiceLine.matchStatus`.
   - Global pro Step zusaetzlich `StepDiagnostics.confidence`.
   - Das UI-Icon nutzt nur `matchStatus`.

4. **Blockiert `no-article-match` Step 4?**
   - Nein.
   - Step 2 mit No-Match wird `soft-fail` und auto-advancet weiter.
   - Step 4 prueft nur Order-Parser-Gates, nicht offene Artikel-Mismatch-Issues.

