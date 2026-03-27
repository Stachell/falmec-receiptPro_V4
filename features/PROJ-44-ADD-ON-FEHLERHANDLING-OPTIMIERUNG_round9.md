# PROJ-44-ADD-ON-FEHLERHANDLING-OPTIMIERUNG — Round 9

**Stand:** 2026-03-22
**Status:** Plan erstellt — Implementierung offen
**Scope:** UI-Cleanup (Bulk-Altlasten), Workflow-Konsistenz, Re-Processing-Schutz, Manuelle-Fix-Marker
**Betroffene Dateien:**

- `src/components/run-detail/IssueDialog.tsx`
- `src/components/run-detail/IssuesCenter.tsx`
- `src/lib/issueLineFormatter.ts`
- `src/store/runStore.ts`
- `src/pages/RunDetail.tsx`
- `src/types/index.ts` (Phase 2E)
- `src/components/run-detail/SerialStatusDot.tsx` (Phase 2E)
- `src/components/run-detail/StatusCheckbox.tsx` (Phase 2E — nur Legende/Kontext)
- `src/components/run-detail/ItemsTable.tsx` (Phase 2E)
- `src/components/run-detail/InvoicePreview.tsx` (Phase 2E)
- `src/components/IconGuidePopup.tsx` (Phase 2E)

**Diagnostik-Grundlage:** `features/PROJ-44-ADD-ON-Fehlercenter-rebuild-Anpassung-round9_diagnostic.md`

---

## Phase 2A — Ghost-State Fix & Revisionssicherheit

### 2A-1: Sauberer State-Reset im IssueDialog bei Issue-Wechsel

**Problem:** Der `useEffect` bei Issue-Wechsel (IssueDialog.tsx:400-408) resetet nur `storedEmails`, `emailBody` und `pendingPrice`. NICHT resetet werden:
- `activeTab` (Zeile 376) → nächstes Issue startet ggf. auf falschem Tab
- `resolutionNote` (Zeile 377) → alte Lösungsnotiz bleibt sichtbar
- `selectedLineIds` (Zeile 378) → alte Checkbox-Auswahl schleppt mit (wird in 2B-2 gelöscht, aber bis dahin muss der Reset da sein)
- `selectedEmail` (Zeile 379) → alter Empfänger bleibt
- `manualEmail` (Zeile 380) → manuell eingetippte Adresse bleibt

**Aktion:** Im bestehenden `useEffect` (Zeile 400-408) folgende Resets ergänzen:
```ts
setActiveTab('overview');
setResolutionNote('');
setSelectedLineIds([]);
setSelectedEmail('');
setManualEmail('');
```

**Risiko:** Gering. Rein lokaler State, keine Store-Mutation.

### 2A-2: Store-Action `reopenIssue` — Metadaten-Bereinigung

**Problem:** `reopenIssue` (runStore.ts:2535-2548) setzt nur `status: 'open'`, räumt aber NICHT auf:
- `resolvedAt` — bleibt aus dem vorigen Resolve-Zyklus hängen
- `resolutionNote` — alte Lösungsbeschreibung bleibt am Issue
- `escalatedAt` — Eskalationsdatum vom vorigen Status
- `escalatedTo` — Eskalationsempfänger vom vorigen Status

**Aktion:** In der `reopenIssue`-Action (runStore.ts:2539) die Mutation erweitern:
```ts
{
  ...issue,
  status: 'open' as const,
  resolvedAt: undefined,
  resolutionNote: undefined,
  escalatedAt: undefined,
  escalatedTo: undefined,
}
```

**ACHTUNG:** Die Felder im `Issue`-Type (types/index.ts:366-390) sind mit `?: string` typisiert, also nullable. Wir setzen sie auf `undefined`, NICHT auf `null`, um mit der Type-Definition konform zu sein. Prüfe zur Sicherheit die exakte Typdefinition: `resolvedAt` und `resolutionNote` sind in der aktuellen Codebase als `resolvedAt: string | null` typisiert (runStore.ts:3466-3467 setzt sie auf `null`). Falls der Typ `string | null` ist: auf `null` setzen statt `undefined`.

**Audit-Log:** Das bestehende `addAuditEntry` (Zeile 2546) bleibt unverändert — es dokumentiert korrekt, DASS reaktiviert wurde. Die bereinigten Felder sind Zustand, kein History-Verlust.

**Risiko:** Gering. Felder werden bei erneutem Resolve/Eskalation sowieso neu gesetzt.

### 2A-3: "Wieder öffnen"-Button in IssuesCenter bei erledigten Problemen

**Problem:** Erledigte Issues (IssuesCenter.tsx:639-660) werden nur passiv gerendert. Kein Weg zurück zu "offen".

**Aktion:**

**Schritt 1 — Store-Destructure erweitern (IssuesCenter.tsx:325-335):**
`reopenIssue` zum bestehenden Destructure hinzufügen:
```ts
const {
  issues,
  refreshIssues,
  currentRun,
  // ...bestehende...
  setManualPriceByPosition,
  reopenIssue,              // NEU
} = useRunStore();
```

**Schritt 2 — Button im resolved-Block ergänzen (IssuesCenter.tsx:640-660):**
Im bestehenden `<div className="flex items-start gap-4">` (Zeile 641) einen Button rechts platzieren:
```tsx
<div key={issue.id} className="enterprise-card p-4 opacity-60 mb-3">
  <div className="flex items-start gap-4">
    <CheckCircle2 className="w-5 h-5 text-status-ok flex-shrink-0 mt-0.5" />
    <div className="flex-1 min-w-0">
      <h4 className="font-medium text-foreground line-through">{issue.message}</h4>
      {/* ...resolutionNote bleibt... */}
    </div>
    {/* NEU: Wieder oeffnen Button */}
    <Button
      variant="ghost"
      size="sm"
      className="gap-1 text-xs h-7 px-2 flex-shrink-0"
      onClick={() => reopenIssue(issue.id)}
    >
      <RefreshCw className="w-3.5 h-3.5" />
      Wieder oeffnen
    </Button>
  </div>
</div>
```

**Import:** `RefreshCw` ist in IssuesCenter.tsx bereits importiert (Zeile 15). `Button` ist ebenfalls bereits importiert (Zeile 20). Keine neuen Imports nötig.

**ACHTUNG für Sonnet:** Das bestehende `<div>` hat KEIN `className="flex-1 min-w-0"` auf dem inneren Container. Dieses muss ergänzt werden, damit der Button rechts steht und der Text links nicht überläuft. Die bestehende Struktur (Zeile 641-659) muss um den `flex-1`-Wrapper und den Button ergänzt werden, OHNE das aeussere `enterprise-card`-div zu verändern.

**Risiko:** Gering. `reopenIssue` existiert bereits, durch 2A-2 korrekt bereinigt.

---

## Phase 2B — Die UI-Abrissbirne

### 2B-1: Checkbox-Block im "Loesung erzwingen"-Tab löschen

**Problem:** Der gesamte Block IssueDialog.tsx:683-725 ist Bulk-Altlast:
- "Zeilen auswaehlen"-Label + "Alle auswaehlen/abwaehlen"-Toggle (686-699)
- `.map()` über `affectedLines` mit Checkbox pro Zeile (701-717)
- Split-Hinweistext "X von Y Zeilen ausgewaehlt — Issue wird gesplittet" (719-723)

**Aktion:** Den gesamten Block (Zeile 683-725) ersatzlos löschen. Der Resolve-Tab enthält danach:
1. Warntext (Zeile 661-663)
2. ggf. Pending-Preis-Anzeige (665-681)
3. Textarea Loesungsbeschreibung (727-737)
4. Submit-Button (740-758)

**ACHTUNG:** Die umschließenden Container-`div`s müssen intakt bleiben:
- `<div className="flex-1 overflow-y-auto space-y-3">` (Zeile 660) — Scroll-Container
- Das schließende `</div>` dieses Containers (Zeile 738)
Nur den INHALT zwischen Warntext und Textarea löschen. Zeilenreferenzen prüfen, NICHT blind nach Zeilennummer löschen — den Block anhand seines Inhalts identifizieren (Suche nach `Zeilen auswaehlen` oder `selectedLineIds.length === affectedLines.length`).

### 2B-2: `selectedLineIds`-State und `toggleLine`-Funktion löschen

**Aktion:**
- State `selectedLineIds` (Zeile 378) löschen: `const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);`
- Funktion `toggleLine` (Zeile 457-461) löschen
- `Checkbox`-Import (Zeile 51) **DEFINITIV** entfernen — verifiziert: `Checkbox` wird NUR in dem gelöschten Block verwendet (Zeile 704)
- Den `setSelectedLineIds([])`-Reset aus dem `useEffect` (2A-1) ebenfalls entfernen, da der State nicht mehr existiert

### 2B-3: `splitIssue` aus handleResolve und Store entfernen

**Problem:** `handleResolve` (IssueDialog.tsx:430-438) hat einen Split-Branch:
```ts
if (selectedLineIds.length > 0 && selectedLineIds.length < affectedLines.length) {
  splitIssue(issue.id, selectedLineIds, resolutionNote.trim());
}
```

**Aktion IssueDialog:**
- Split-Branch (Zeile 432-433) löschen — nur `resolveIssue()` bleibt
- `splitIssue` aus dem Store-Destructure (Zeile 371) entfernen
- `handleResolve` wird zu:
  ```ts
  const handleResolve = () => {
    if (!resolutionNote.trim()) return;
    resolveIssue(issue.id, resolutionNote.trim());
    onClose();
  };
  ```

**Aktion Store:**
- Interface-Signatur `splitIssue` (runStore.ts:538) löschen
- Implementierung `splitIssue` (runStore.ts:2481-2532) löschen

**Verifiziert:** Grep bestätigt, dass `splitIssue` NUR in diesen 2 Dateien vorkommt:
- `src/store/runStore.ts` (Interface + Implementierung)
- `src/components/run-detail/IssueDialog.tsx` (Destructure + Aufruf)

### 2B-4: `ArticleMatchCard` Multi-Rendering auf Single-Rendering umbauen

**Problem:** IssueDialog.tsx:588-590 rendert:
```tsx
{affectedLines.map(line => (
  <ArticleMatchCard key={line.lineId} line={line} runId={currentRun.id} />
))}
```

**Aktion:** `.map()` durch direktes Rendering der ersten (einzigen) Zeile ersetzen:
```tsx
{affectedLines.length > 0 && (
  <ArticleMatchCard line={affectedLines[0]} runId={currentRun.id} />
)}
```

**Sicherheit:** `affectedLines` kann bei run-level Issues leer sein (types/index.ts erlaubt leere `affectedLineIds`). Deshalb `affectedLines.length > 0`-Guard beibehalten.

**ACHTUNG:** Der umgebende Container `<div className="rounded-lg border-2 border-teal-400/50 bg-white/40 p-3 space-y-3">` (Zeile 581) MUSS erhalten bleiben. Nur die innere `.map()`-Zeile durch den Single-Render ersetzen.

### 2B-5: Übersichtsliste "Betroffene Positionen" vereinfachen

**Problem:** IssueDialog.tsx:530 nutzt `.slice(0, 5).map(...)` — für 1:1 Issues redundant.

**Aktion:** Die Slice/Overflow-Logik (Zeile 525-540) auf Single-Rendering umbauen:
```tsx
{affectedLines.length > 0 && (
  <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">Betroffene Position:</Label>
    <p className="text-xs font-mono text-foreground">
      {getLineLabel(issue, affectedLines[0])}
    </p>
  </div>
)}
```

**Achtung:** Label von "Betroffene Positionen (max. 5):" auf "Betroffene Position:" ändern (Singular). Die umgebende Struktur (das `{affectedLines.length > 0 && (` Guard) bleibt identisch — nur der innere Block ändert sich.

---

## Phase 2C — Der neue KISS-Workflow & Text-Kosmetik

### 2C-1: Auto-Jump bei Preisauswahl entfernen

**Problem:** IssueDialog.tsx:570 setzt `setActiveTab('resolve')` sofort nach PriceCell-Callback.

**Aktion:** Zeile 570 (`setActiveTab('resolve');`) löschen. Der User bleibt auf dem Übersicht-Tab und kann selbst zum Resolve-Tab navigieren.

**ACHTUNG:** NUR die eine Zeile `setActiveTab('resolve');` löschen. Die `setPendingPrice({...})`-Logik darüber (Zeile 565-569) MUSS erhalten bleiben — sie merkt den gewählten Preis für den späteren Resolve-Flow.

### 2C-2: Button-Text generisch machen

**Problem:** IssueDialog.tsx:757 hat Sonderfall `'Preis uebernehmen'` vs `'Loesung anwenden'`.

**Aktion:** Einheitlich auf `'Loesung anwenden'` setzen. Der `pendingPrice`-Sonderpfad im onClick (Zeile 743-748) bleibt erhalten — nur das Label wird vereinheitlicht.

ALT (Zeile 757):
```tsx
{issue.type === 'price-mismatch' && pendingPrice ? 'Preis uebernehmen' : 'Loesung anwenden'}
```

NEU:
```tsx
{'Loesung anwenden'}
```

### 2C-3: Textarea-Pflicht bei vorhandenem `pendingPrice` aufheben

**Bewertung:** Die Disable-Logik (IssueDialog.tsx:753) ist bereits korrekt implementiert:
```ts
disabled={issue.type === 'price-mismatch' && pendingPrice ? false : !resolutionNote.trim()}
```
Wenn `pendingPrice` vorhanden ist, ist der Button enabled. **KEIN Handlungsbedarf.**

### 2C-4: Text-Kosmetik — "RE" -> "PDF-Rechnung", "Sage" -> "Sage ERP"

**VOLLSTAENDIGE Stellenliste (3 Dateien, 4 Stellen):**

**a) `issueLineFormatter.ts:115-117` — Preisanzeige in Card-Body & Clipboard:**
```ts
// ALT:
if (hasInvoice) priceParts.push(`RE: ${line.unitPriceInvoice?.toFixed(2)} EUR`);
if (hasSage) priceParts.push(`Sage: ${line.unitPriceSage?.toFixed(2)} EUR`);

// NEU:
if (hasInvoice) priceParts.push(`PDF-Rechnung: ${line.unitPriceInvoice?.toFixed(2)} EUR`);
if (hasSage) priceParts.push(`Sage ERP: ${line.unitPriceSage?.toFixed(2)} EUR`);
```

**b) `IssueDialog.tsx:94` — `getLineLabel()` fuer price-mismatch:**
```ts
// ALT:
return `${pos}: ${line.falmecArticleNo ?? line.manufacturerArticleNo ?? ''} — RE ${(line.unitPriceInvoice ?? 0).toFixed(2)} EUR vs. Sage ${(line.unitPriceSage ?? 0).toFixed(2)} EUR`;

// NEU:
return `${pos}: ${line.falmecArticleNo ?? line.manufacturerArticleNo ?? ''} — PDF-Rechnung ${(line.unitPriceInvoice ?? 0).toFixed(2)} EUR vs. Sage ERP ${(line.unitPriceSage ?? 0).toFixed(2)} EUR`;
```

**c) `runStore.ts:3580-3581` — Issue-Message-Generierung bei price-mismatch:**
```ts
// ALT:
message: `Pos ${l.positionIndex}: Preisabweichung RE ${l.unitPriceInvoice.toFixed(2)}€ vs. Sage ${(l.unitPriceSage ?? 0).toFixed(2)}€`,
details: `${l.falmecArticleNo ?? l.manufacturerArticleNo} — RE ${l.unitPriceInvoice.toFixed(2)}€, Sage ${(l.unitPriceSage ?? 0).toFixed(2)}€`,

// NEU:
message: `Pos ${l.positionIndex}: Preisabweichung PDF-Rechnung ${l.unitPriceInvoice.toFixed(2)}€ vs. Sage ERP ${(l.unitPriceSage ?? 0).toFixed(2)}€`,
details: `${l.falmecArticleNo ?? l.manufacturerArticleNo} — PDF-Rechnung ${l.unitPriceInvoice.toFixed(2)}€, Sage ERP ${(l.unitPriceSage ?? 0).toFixed(2)}€`,
```

**CSS/Layout:** Keine Klassen ändern. Nur String-Literale. Die längeren Texte passen in die bestehenden `font-mono text-xs`-Container (keine feste Breite).

---

## Phase 2D — Workflow-Konsistenz & Re-Processing (KRITISCH)

### 2D-1: Architektur-Analyse — Warum der aktuelle Pfad Daten zerstört

**Ist-Zustand:**
- "Neu verarbeiten" Button in `RunDetail.tsx:676-696`
- onClick: `createNewRunWithParsing()` (runStore.ts:916)
- Erzeugt einen **komplett neuen Run** mit neuer ID
- Parst die PDF erneut (Step 1) — erzeugt neue `invoiceLines`
- Alle manuellen Fixes aus dem alten Run gehen verloren

**Zusätzliches Problem bei Step-2-Rerun:**
`executeMatcherCrossMatch()` (runStore.ts:3527-3543) überschreibt in der Enrichment-Schleife BEDINGUNGSLOS alle Match-/Preisfelder:
```ts
return {
  ...line,
  matchStatus: matched.matchStatus,
  priceCheckStatus: matched.priceCheckStatus,  // ueberschreibt 'custom'!
  unitPriceFinal: matched.unitPriceFinal,      // ueberschreibt manuellen Preis!
  // ...
};
```
Damit werden manuell gesetzte Preise (`priceCheckStatus: 'custom'`) UND manuell zugeordnete Artikel bei einem Re-Run von Step 2 vernichtet.

**Bestehender Schutz in Step 3:**
`executeMatcherSerialExtract()` hat bereits einen Guard (runStore.ts:3720):
```ts
if (line.serialSource === 'manual') return line;
```
Manuell eingetragene Seriennummern sind also bei einem Step-3-Rerun geschützt.

### 2D-2: Neue Store-Action `reprocessCurrentRun(runId)`

**Zweck:** Ermöglicht Re-Processing ab Step 2 OHNE erneutes PDF-Parsing. Bestehende `invoiceLines` (inkl. manueller Fixes) bleiben als Datenbasis erhalten.

**Interface (runStore.ts, neben `retryStep`):**
```ts
/** PROJ-44-R9: Re-Process — Steps 2-5 neu starten, Step 1 + invoiceLines bleiben */
reprocessCurrentRun: (runId: string) => void;
```

**Implementierung:**
```ts
reprocessCurrentRun: (runId) => {
  const state = get();
  const run = state.runs.find(r => r.id === runId);
  if (!run) return;

  logService.info('Reprocess: Steps 2-5 werden zurueckgesetzt', { runId, step: 'System' });
  get().addAuditEntry({ runId, action: 'reprocessCurrentRun', details: 'Steps 2-5 reset, invoiceLines beibehalten', userId: 'system' });

  // 1. Steps 2-5 zuruecksetzen, Step 1 bleibt 'ok'
  const resetSteps = run.steps.map(s =>
    s.stepNo >= 2 ? { ...s, status: 'not-started' as const, issuesCount: 0 } : s
  );

  // 2. Issues von Steps 2-5 loeschen (Step-1-Issues bleiben!)
  const keptIssues = state.issues.filter(i => !(i.runId === runId && i.stepNo >= 2));

  // 3. Run-Status auf 'running' setzen
  set((state) => ({
    runs: state.runs.map(r =>
      r.id === runId ? { ...r, steps: resetSteps, status: 'running' as const } : r
    ),
    currentRun: state.currentRun?.id === runId
      ? { ...state.currentRun, steps: resetSteps, status: 'running' as const }
      : state.currentRun,
    issues: keptIssues,
    // Diagnostics zuruecksetzen fuer Steps 2-4
    latestDiagnostics: {},
  }));

  // 4. Pipeline ab Step 2 triggern — robuster Ansatz analog retryStep (runStore.ts:1882-1884)
  get().updateStepStatus(runId, 2, 'running');
  get().updateRunStatus(runId, 'running');
  setTimeout(() => get().executeMatcherCrossMatch(), 50);
},
```

### 2D-3: Guard in `executeMatcherCrossMatch()` — Manuelle Fixes schützen

**Problem:** Die Enrichment-Schleife (runStore.ts:3527-3543) überschreibt alle Felder bedingungslos.

**Aktion:** In der Enrichment-Schleife Guards fuer manuell korrigierte Daten einfügen:

```ts
// runStore.ts — innerhalb der enrichedLines map-Funktion (Zeile 3527-3544)
const enrichedLines = allRunLines.map(line => {
  const matched = matchedByPosition.get(line.positionIndex);
  if (!matched) return line;

  // PROJ-44-R9: Manuell zugeordnete Artikel komplett schuetzen (alle Felder beibehalten)
  if (line.articleSource === 'manual') return line;

  // PROJ-44-R9: Manuell korrigierte Preise schuetzen
  const protectPrice = line.priceCheckStatus === 'custom';

  return {
    ...line,
    matchStatus: matched.matchStatus,
    falmecArticleNo: matched.falmecArticleNo,
    descriptionDE: matched.descriptionDE,
    unitPriceSage: matched.unitPriceSage,
    serialRequired: matched.serialRequired,
    activeFlag: matched.activeFlag,
    storageLocation: matched.storageLocation,
    logicalStorageGroup: matched.logicalStorageGroup,
    // Preisfelder: nur ueberschreiben wenn NICHT manuell korrigiert
    priceCheckStatus: protectPrice ? line.priceCheckStatus : matched.priceCheckStatus,
    unitPriceFinal: protectPrice ? line.unitPriceFinal : matched.unitPriceFinal,
    // Artikelquelle: Matcher hat zugeordnet
    articleSource: 'matcher' as const,
  };
});
```

**Warum funktioniert das?**
- `setManualArticleByPosition` setzt `articleSource: 'manual'` (Phase 2E-2) — bei manuellem Artikel-Fix wird die gesamte Zeile geschuetzt (analog `serialSource === 'manual'` in Step 3)
- `setManualPriceByPosition` setzt `priceCheckStatus: 'custom'` (runStore.ts:2781) — nur Preisfelder geschuetzt, andere Felder werden normal aktualisiert
- Reihenfolge: Artikel-Guard kommt ZUERST (returned sofort), Preis-Guard danach

**Serial-Schutz:** Bereits vorhanden in Step 3 (`serialSource === 'manual'` Guard, Zeile 3720). Kein Handlungsbedarf.

### 2D-4: "Neu verarbeiten" Button umverdrahten

**Aktion in `RunDetail.tsx:676-696`:**

1. **Store-Destructure erweitern:** `reprocessCurrentRun` zum Destructure hinzufuegen
2. **Button-onClick aendern:** Von `createNewRunWithParsing()` auf `reprocessCurrentRun(currentRun.id)`
3. **Navigation entfernen:** Der bestehende Code navigiert zu einer neuen Run-ID — das ist bei Reprocess nicht noetig, da der Run beibehalten wird

**ALT (RunDetail.tsx:681-692):**
```ts
onClick={wrap('reprocess', () => {
  const parsingPromise = createNewRunWithParsing();
  const initialRun = getStoreState().currentRun;
  if (initialRun) {
    navigate(`/run/${encodeURIComponent(initialRun.id)}`);
    parsingPromise.then(finalRun => {
      if (finalRun && finalRun.id !== initialRun.id) {
        navigate(`/run/${encodeURIComponent(finalRun.id)}`, { replace: true });
      }
    });
  }
})}
```

**NEU:**
```ts
onClick={wrap('reprocess', () => {
  reprocessCurrentRun(currentRun.id);
})}
```

**ACHTUNG:** `createNewRunWithParsing` muss NICHT aus dem Store-Destructure in RunDetail.tsx entfernt werden — sie wird auch von `NewRun.tsx` verwendet und bleibt dort relevant. Es geht NUR um den Button-Handler.

### 2D-5: Issue-Regeneration bei Reprocess

**Automatisch abgedeckt:** Die Pipeline-Steps generieren Issues selbst:
- Step 2 (`executeMatcherCrossMatch`): Erzeugt `price-mismatch`, `no-article-match` etc. (Zeile 3550-3617)
- Step 3 (`executeMatcherSerialExtract`): Erzeugt `serial-mismatch`, `sn-insufficient-count` etc.
- Step 5 (`generateStep5Issues`): Erzeugt `missing-storage-location`, `export-no-lines`

Da `reprocessCurrentRun` alle Issues ab Step 2 loescht (2D-2 Schritt 2), werden sie von den jeweiligen Steps frisch erzeugt. Keine zusätzliche Logik nötig.

---

## Phase 2E — Manuelle Fix-Marker & UI-Indikatoren

### 2E-1: Neuer Typ `ArticleSource` und Feld in `InvoiceLine`

**Datei: `src/types/index.ts`**

**Schritt 1 — Neuen Typ definieren (neben `SerialSource`, Zeile 46):**
```ts
export type ArticleSource = 'matcher' | 'manual' | 'none';
```

**Schritt 2 — Feld in `InvoiceLine` ergänzen (nach `matchStatus`, ca. Zeile 305):**
```ts
  // --- PROJ-11: Match status ---
  matchStatus: MatchStatus;

  // --- PROJ-44-R9: Article source tracking ---
  articleSource: ArticleSource;
```

**Default-Wert:** Alle bestehenden Zeilen-Erzeugungsstellen (Step-1-Parser, `createNewRun`) erzeugen Zeilen ohne `articleSource`. Da TypeScript das Feld als required sieht, muss es entweder:
- Optional gemacht werden: `articleSource?: ArticleSource;` (EMPFOHLEN — vermeidet Aenderungen an allen Erzeugungsstellen)
- Oder an allen Erzeugungsstellen mit `articleSource: 'none'` initialisiert werden

**Empfehlung:** Optional (`articleSource?: ArticleSource`) — der Guard prüft explizit `=== 'manual'`, undefined/fehlend wird nie geschuetzt. Das ist das sicherste Pattern.

### 2E-2: `articleSource: 'manual'` in `setManualArticleByPosition` setzen

**Datei: `src/store/runStore.ts`**

In `setManualArticleByPosition` (runStore.ts:2823-2896) gibt es zwei Return-Pfade:
1. **Mit Stammdaten-Treffer** (`if (matched)`, Zeile 2851-2872): Ergänze `articleSource: 'manual' as const`
2. **Ohne Stammdaten-Treffer** (`else`, Zeile 2873-2893): Ergänze `articleSource: 'manual' as const`

**Exakte Einfügestelle in beiden Pfaden** — jeweils als letztes Feld vor der schließenden Klammer:
```ts
return {
  ...line,
  // ... bestehende Felder ...
  serialSource: data.serialNumbers?.length ? 'manual' as const : line.serialSource,
  articleSource: 'manual' as const,  // PROJ-44-R9: Manuell-Marker
};
```

### 2E-3: `articleSource: 'matcher'` in `executeMatcherCrossMatch` Enrichment setzen

**Bereits in Phase 2D-3 integriert.** Die Enrichment-Schleife setzt `articleSource: 'matcher' as const` fuer alle vom Matcher verarbeiteten Zeilen (siehe aktualisiertes Code-Beispiel in 2D-3).

### 2E-4: Match-Spalte — Manueller Artikel-Indikator in ItemsTable

**Datei: `src/components/run-detail/ItemsTable.tsx`**

**Ist-Zustand (Zeile 401-407):**
```tsx
<TableCell className="px-1 pl-0 text-left">
  <div className="flex justify-start">
    <StatusCheckbox
      status={line.matchStatus}
      onClick={() => setDetailLine(line)}
    />
  </div>
</TableCell>
```

**Aktion:** Nach der `StatusCheckbox` einen kleinen Marker ergänzen, wenn `articleSource === 'manual'`:
```tsx
<TableCell className="px-1 pl-0 text-left">
  <div className="flex justify-start items-center gap-0.5">
    <StatusCheckbox
      status={line.matchStatus}
      onClick={() => setDetailLine(line)}
    />
    {line.articleSource === 'manual' && (
      <span className="text-[10px] leading-none" title="Artikel manuell zugeordnet">{'\u{1F6B9}'}</span>
    )}
  </div>
</TableCell>
```

**Layout-Sicherheit:**
- `gap-0.5` (2px) ist minimal — das Emoji passt neben die 20x20px StatusCheckbox
- `text-[10px]` ist kleiner als die StatusCheckbox-Icons — kein Overflow
- Das bestehende `flex justify-start` wird um `items-center` ergänzt fuer vertikale Zentrierung
- Die Spaltenbreite ist flexibel (`px-1 pl-0`) — die 10px Emoji-Breite passt rein

**ACHTUNG:** Das Emoji `\u{1F6B9}` ist dasselbe wie in `PriceCell`'s `BADGE_CONFIG.custom` — visuelle Konsistenz fuer "manuell" in der gesamten App.

### 2E-5: Serial-Spalte — Blauer Punkt fuer manuell zugewiesene S/N

**Datei: `src/components/run-detail/SerialStatusDot.tsx`**

**Ist-Zustand:** 3 Farb-Zustände basierend auf 2 Booleans:
- Schwarz (#000000): `!serialRequired`
- Grau (#E5E7EB): `serialRequired && !serialAssigned`
- Gruen (#22C55E): `serialRequired && serialAssigned`

**Aktion — Props erweitern:**
```ts
interface SerialStatusDotProps {
  serialRequired: boolean;
  serialAssigned: boolean;
  /** PROJ-44-R9: Manuell zugewiesen (blauer Punkt) */
  isManual?: boolean;
  /** PROJ-44-R6: Klick-Handler */
  onClick?: () => void;
}
```

**Aktion — Farb-Logik erweitern (4. Zustand fuer manuell):**
```ts
export function SerialStatusDot({ serialRequired, serialAssigned, isManual, onClick }: SerialStatusDotProps) {
  const bg = !serialRequired
    ? '#000000'
    : isManual
      ? '#3B82F6'   // blue-500 — manuell zugewiesen
      : serialAssigned
        ? '#22C55E'  // green-500 — automatisch zugeteilt
        : '#E5E7EB'; // gray-200 — ausstehend

  const border = !serialRequired
    ? '#000000'
    : isManual
      ? '#2563EB'   // blue-600
      : serialAssigned
        ? '#16A34A'  // green-600
        : '#9CA3AF'; // gray-400

  // ... Rest bleibt identisch
```

**Warum optional (`isManual?: boolean`)?** Backward-Compat: Alle bestehenden Aufrufe ohne `isManual` funktionieren weiter — undefined ist falsy, also greift der alte Pfad.

### 2E-6: `SerialStatusDot`-Aufrufe aktualisieren (3 Stellen)

**a) `ItemsTable.tsx:464-468` — isManual-Prop ergänzen:**
```tsx
<SerialStatusDot
  serialRequired={line.serialRequired}
  serialAssigned={!!line.serialNumber}
  isManual={line.serialSource === 'manual'}
  onClick={() => handleSerialDotClick(line)}
/>
```

**b) `InvoicePreview.tsx:605-609` — isManual-Prop ergänzen:**
```tsx
<SerialStatusDot
  serialRequired={posStatus.serialRequired}
  serialAssigned={posStatus.serialAssigned}
  isManual={posStatus.representativeLine?.serialSource === 'manual'}
  onClick={posStatus.representativeLine ? () => handleSerialDotClick(posStatus.representativeLine!) : undefined}
/>
```

**ACHTUNG InvoicePreview:** `posStatus` ist ein aggregiertes Objekt — es hat kein direktes `serialSource`-Feld. Wir greifen auf `posStatus.representativeLine?.serialSource` zu. Prüfe ob `representativeLine` den Typ `InvoiceLine` hat (sollte es, da es aus den gefilterten Lines stammt).

**c) `IconGuidePopup.tsx:162-166` — wird in 2E-7 separat behandelt.

### 2E-7: Legenden-Update in `IconGuidePopup.tsx`

**Datei: `src/components/IconGuidePopup.tsx`**

**a) SERIAL_LEGEND erweitern (Zeile 47-55):**

Typ-Definition erweitern:
```ts
const SERIAL_LEGEND: Array<{
  serialRequired: boolean;
  serialAssigned: boolean;
  isManual?: boolean;       // PROJ-44-R9
  text: string;
}> = [
  { serialRequired: true, serialAssigned: false, text: 'S/N-pflichtig, noch nicht zugeteilt' },
  { serialRequired: false, serialAssigned: false, text: 'Nicht S/N-pflichtig' },
  { serialRequired: true, serialAssigned: true, text: 'S/N erfolgreich zugeteilt' },
  { serialRequired: true, serialAssigned: true, isManual: true, text: 'S/N manuell zugewiesen' },
];
```

Render-Block aktualisieren (Zeile 159-169) — `isManual`-Prop durchreichen:
```tsx
{SERIAL_LEGEND.map((row, i) => (
  <div key={i} className="flex items-center gap-3">
    <div className="w-8 flex items-center justify-center">
      <SerialStatusDot
        serialRequired={row.serialRequired}
        serialAssigned={row.serialAssigned}
        isManual={row.isManual}
      />
    </div>
    <span className="text-xs">{row.text}</span>
  </div>
))}
```

**b) MATCH_LEGEND — Manuellen Artikel-Eintrag ergänzen (nach Zeile 130):**

Einen zusätzlichen Eintrag UNTERHALB des regulären MATCH_LEGEND-Blocks einfuegen (NICHT ins Array, da `StatusCheckbox` keinen `manual`-Status kennt):
```tsx
{/* Sub: -MATCH */}
<p className="text-xs font-medium mb-1.5">- MATCH</p>
<div className="space-y-1.5 ml-2 mb-3">
  {MATCH_LEGEND.map((row) => (
    <div key={row.status} className="flex items-center gap-3">
      <StatusCheckbox status={row.status} />
      <span className="text-xs">{row.text}</span>
    </div>
  ))}
  {/* PROJ-44-R9: Manueller Artikel-Indikator */}
  <div className="flex items-center gap-3">
    <div className="inline-flex items-center gap-0.5">
      <StatusCheckbox status="full-match" />
      <span className="text-[10px] leading-none">{'\u{1F6B9}'}</span>
    </div>
    <span className="text-xs">Artikel manuell zugeordnet</span>
  </div>
</div>
```

**c) PRICE_LEGEND — Bereits korrekt:**
Der `custom`-Eintrag (Zeile 43) zeigt bereits "Preis manuell angepasst" mit dem blauen Badge. Kein Handlungsbedarf.

---

## Zusammenfassung: Dateiliste & Aenderungsumfang

| Datei | Phase | Aenderungstyp |
|---|---|---|
| `IssueDialog.tsx` | 2A-1, 2B-1..5, 2C-1..2, 2C-4b | State-Reset, Block-Loeschung, Text-Kosmetik |
| `IssuesCenter.tsx` | 2A-3 | Store-Destructure + Button "Wieder oeffnen" |
| `issueLineFormatter.ts` | 2C-4a | String-Ersetzung RE->PDF-Rechnung, Sage->Sage ERP |
| `runStore.ts` | 2A-2, 2B-3, 2C-4c, 2D-2, 2D-3, 2E-2, 2E-3 | `reopenIssue` bereinigen, `splitIssue` loeschen, Text-Kosmetik, `reprocessCurrentRun`, Guards, `articleSource` setzen |
| `RunDetail.tsx` | 2D-4 | Button-Handler umverdrahten |
| `types/index.ts` | 2E-1 | `ArticleSource`-Typ + Feld in `InvoiceLine` |
| `SerialStatusDot.tsx` | 2E-5 | `isManual`-Prop + blauer 4. Zustand |
| `ItemsTable.tsx` | 2E-4, 2E-6a | Match-Emoji-Indikator + Serial-isManual-Prop |
| `InvoicePreview.tsx` | 2E-6b | Serial-isManual-Prop |
| `IconGuidePopup.tsx` | 2E-7 | Legenden-Eintraege fuer manuell (Match + Serial) |

---

## Nützliche Hinweise für Sonnet

### 1. UI-Abriss: Parent-Container NICHT zerschiessen

Beim Loeschen des Checkbox-Blocks (2B-1, Zeile 683-725):
- Der Block liegt INNERHALB eines `<div className="flex-1 overflow-y-auto space-y-3">` (Zeile 660)
- Dieses Parent-`div` ist der Scroll-Container fuer den gesamten Resolve-Tab und MUSS erhalten bleiben
- Nur den INHALT (den Checkbox-Block) loeschen, NICHT den umgebenden Container
- Identifiziere den Block anhand seines INHALTS (suche nach `Zeilen auswaehlen` oder `selectedLineIds`), NICHT blind nach Zeilennummern

Gleiches gilt fuer den `ArticleMatchCard`-Block (2B-4):
- Container `<div className="rounded-lg border-2 border-teal-400/50 bg-white/40 p-3 space-y-3">` (Zeile 581) MUSS erhalten bleiben
- Nur die `.map()`-Zeile durch den Single-Render ersetzen

### 2. `reopenIssue`: Null vs. Undefined — Type-Konsistenz pruefen!

Die zu bereinigenden Felder haben in der Codebase unterschiedliche Null-Konventionen:
- In `types/index.ts` sind manche Felder als `string | null` typisiert
- In der `executeMatcherCrossMatch`-Issue-Erzeugung (Zeile 3466-3467) werden sie auf `null` gesetzt
- **Vor dem Setzen: die exakte Type-Definition in `types/index.ts:366-390` pruefen und die passende Null-Form verwenden (`null` wenn `string | null`, `undefined` wenn optionales `?:`)**

Das bestehende `addAuditEntry` (runStore.ts:2546) NICHT veraendern.

### 3. CSS-Klassen bei Text-Kosmetik exakt erhalten

Bei ALLEN 4 Text-Kosmetik-Stellen (2C-4):
- NUR die String-Literale aendern (`RE` -> `PDF-Rechnung`, `Sage` -> `Sage ERP`)
- KEINE umgebenden JSX-Elemente, className-Attribute oder Template-Literal-Strukturen veraendern
- Die Backtick-Template-Strings bleiben exakt gleich aufgebaut — nur die Textfragmente darin aendern sich

### 4. `splitIssue`-Loeschung: Vollstaendigkeit pruefen

Nach dem Loeschen von `splitIssue` aus Store + Dialog:
- **Grep** nach `splitIssue` im gesamten `src/`-Verzeichnis — es darf KEINE verbleibende Referenz geben
- **Verifiziert:** `splitIssue` kommt NUR in 2 Dateien vor: `runStore.ts` und `IssueDialog.tsx`
- `npx tsc --noEmit` MUSS fehlerfrei durchlaufen

### 5. Imports nach Loeschung bereinigen

Nach den Loeschungen in IssueDialog.tsx muessen folgende Imports entfernt werden:
- `Checkbox` (Zeile 51) — **DEFINITIV** entfernen, wird NUR im geloeschten Checkbox-Block verwendet
- Pruefen ob nach Loeschung von `selectedLineIds` noch `useState<string[]>` benoetigt wird (ja, `storedEmails` nutzt es noch)

### 6. `reprocessCurrentRun` — Die `advanceToNextStep`-Falle

`advanceToNextStep` (runStore.ts:1560) hat eine spezifische Erwartung:
1. Es sucht einen Step mit `status === 'running'` und setzt ihn auf `'ok'`
2. Es sucht den naechsten Step mit `status === 'not-started'` und setzt ihn auf `'running'`

**Empfohlener Ansatz (robuster als advanceToNextStep):**
```ts
// Step 1 bleibt 'ok', Step 2 direkt auf 'running' setzen
get().updateStepStatus(runId, 2, 'running');
get().updateRunStatus(runId, 'running');
// Step-2-Execution analog zu retryStep (runStore.ts:1882-1884)
setTimeout(() => get().executeMatcherCrossMatch(), 50);
```
Der Auto-Advance-Mechanismus in `executeMatcherCrossMatch()` uebernimmt dann Step 3 -> 4 -> 5 automatisch.

### 7. Guards in `executeMatcherCrossMatch` — Exakte Position und Reihenfolge

Der Guard muss in die Enrichment-Schleife (runStore.ts:3527-3543) eingefuegt werden:
- NICHT die `representativeLines`-Logik veraendern (Zeile 3496-3502)
- NICHT den `matcher.crossMatch()`-Aufruf veraendern (Zeile 3514-3519)
- NUR die `enrichedLines`-Map-Funktion (Zeile 3527) modifizieren
- **Reihenfolge:** Artikel-Guard (`articleSource === 'manual'`) kommt ZUERST und returnt sofort die komplette Zeile. Preis-Guard (`priceCheckStatus === 'custom'`) kommt danach und schuetzt nur die Preisfelder.
- Beide Guards pruefen am ORIGINAL-`line` (aus `allRunLines`), NICHT am `matched` (aus dem Matcher-Ergebnis)

### 8. `ArticleSource`-Typ: Optional machen!

Das Feld `articleSource` in `InvoiceLine` MUSS als optional definiert werden (`articleSource?: ArticleSource`), weil:
- Alle bestehenden Zeilen-Erzeugungsstellen (Step 1 Parser, `createNewRun`) erstellen Lines OHNE dieses Feld
- Ein required-Feld wuerde Dutzende Erzeugungsstellen aendern muessen — massives Over-Engineering
- Der Guard in `executeMatcherCrossMatch` prueft `=== 'manual'` — `undefined` ist sicher (wird nie als 'manual' behandelt)
- `setManualArticleByPosition` setzt es explizit auf `'manual'`
- Die Enrichment-Schleife setzt es auf `'matcher'`

### 9. SerialStatusDot: `isManual` ist optional mit Backward-Compat

Die neue Prop `isManual?: boolean` ist optional:
- Bestehende Aufrufe ohne `isManual` (z.B. in RE-Positionen Detail-Popups) funktionieren weiter
- `undefined` ist falsy — der alte 3-Farb-Pfad greift automatisch
- Nur die 3 aktualisierten Stellen (ItemsTable, InvoicePreview, IconGuidePopup) uebergeben den Wert

### 10. IconGuidePopup: Layout-Stabilität bei neuen Eintraegen

Die neuen Legenden-Eintraege muessen exakt dasselbe Layout-Pattern nutzen wie die bestehenden:
- `flex items-center gap-3` fuer jede Zeile
- `w-8 flex items-center justify-center` fuer den Icon-Container
- `text-xs` fuer den Text
- Der manuelle Match-Eintrag (StatusCheckbox + Emoji) braucht `inline-flex items-center gap-0.5` — NICHT `gap-3`, da Checkbox und Emoji ENG zusammen stehen muessen
- Die Scroll-Area (`max-h-[70vh] overflow-y-auto`, Zeile 99) hat genug Platz fuer 2 zusaetzliche Zeilen

### 11. Reihenfolge der Aenderungen

Empfohlene Reihenfolge, um Compilerfehler zu minimieren:
1. **2E-1** (ArticleSource-Typ) — ZUERST, da 2E-2 und 2D-3 es benoetigen
2. **2A-1** (State-Reset) — rein additiv, bricht nichts
3. **2A-2** (reopenIssue) — rein additiv im Store
4. **2A-3** (Wieder-oeffnen-Button) — rein additiv in IssuesCenter
5. **2C-4** (Text-Kosmetik, alle 4 Stellen) — rein Strings, bricht nichts
6. **2C-1 + 2C-2** (Auto-Jump + Button-Text) — kleine Loeschungen
7. **2B-4 + 2B-5** (Single-Rendering) — UI-Vereinfachung
8. **2B-1 + 2B-2** (Checkbox-Loeschung + Import-Cleanup) — groesserer Block
9. **2B-3** (splitIssue-Loeschung) — Interface + Impl, MUSS zuletzt bei den UI-Aenderungen
10. **2E-2** (articleSource in setManualArticleByPosition) — Store-Erweiterung
11. **2D-2** (reprocessCurrentRun Store-Action) — eigenstaendig
12. **2D-3 + 2E-3** (Guards + articleSource: 'matcher' in executeMatcherCrossMatch) — zusammen
13. **2D-4** (Button-Handler umverdrahten) — haengt von 2D-2 ab
14. **2E-5** (SerialStatusDot — isManual-Prop) — Komponente erweitern
15. **2E-6** (SerialStatusDot-Aufrufe — ItemsTable + InvoicePreview) — Props durchreichen
16. **2E-4** (Match-Emoji-Indikator in ItemsTable) — UI-Erweiterung
17. **2E-7** (IconGuidePopup Legende) — abschliessend
18. `npx tsc --noEmit` — Abschluss-Validierung
19. **Grep-Validierung:** `splitIssue`, `Checkbox` (nach Import-Cleanup), `selectedLineIds` — keine Reste

### 12. SONNET-REGELN (zwingend)

1. **IMMER** vorher in den Plan-Modus (thinking) gehen.
2. **IMMER** Aenderungen in die Projektdaten schreiben.
3. Am Ende selbststaendig `npx tsc --noEmit` ueber das Bash-Terminal ausfuehren und Fehler fixen.
4. Die Datei `features/INDEX.md` aktualisieren.
5. **NIEMALS** `createNewRunWithParsing` aus dem Store loeschen — sie wird weiterhin von `NewRun.tsx` benoetigt.
6. **NIEMALS** den `onClose`-Handler im IssueDialog veraendern oder entfernen.
7. **NIEMALS** die `PriceCell`-Callback-Logik (setPendingPrice) im Uebersicht-Tab veraendern — nur den Auto-Jump entfernen.
8. **NIEMALS** die bestehenden 3 Farben in `SerialStatusDot` aendern — NUR den 4. blauen Zustand HINZUFUEGEN.
9. **NIEMALS** das `StatusCheckbox`-Component oder die `MatchStatus`-Union veraendern — der manuelle Artikel-Marker ist ein SEPARATES Emoji NEBEN der Checkbox, kein neuer Status.
10. **NIEMALS** die `BADGE_CONFIG` in `PriceCell.tsx` veraendern — der `custom`-Eintrag (blau + Emoji) ist bereits korrekt und zeigt "manuell" an.
