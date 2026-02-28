# PROJ-37: Optimierung des Fehler-Centers (Rev 1)

**Status:** Done
**Datum:** 2026-02-28
**Rev:** 3 (Implementierung abgeschlossen, UX-Politur finalisiert)
**Skill:** requirements → architecture → frontend → backend-local
**Baut auf:** PROJ-17, PROJ-21, PROJ-20, PROJ-36

---

## Architektur-Prinzipien (Rev 1)

> **Zentrale Aenderung gegenueber Rev 0:** Kein UI-Formatting im Backend!
> Die Issue-Erzeuger speichern nur strukturierte Daten (`affectedLineIds`).
> Die Frontend-Komponente baut die UI-Darstellung on-the-fly aus dem Run-State.

---

## Aufgabe 1: Separation of Concerns — `affectedLineIds` statt `details`-String

### Ziel

Die Issue-Erzeuger (Backend/Services) generieren KEINE formatierten UI-Strings mehr. Stattdessen speichern sie ein Array der betroffenen Line-IDs im `Issue`-Objekt. Das Frontend (`IssueCard`) baut die mehrzeilige Darstellung on-the-fly aus dem Store.

### Aenderung am `Issue`-Interface (`src/types/index.ts:342-362`)

```typescript
export interface Issue {
  // ... bestehende Felder ...
  details: string;                // BLEIBT — wird zum kurzen Summary-Text (1-Zeiler)
  relatedLineIds: string[];       // BEREITS VORHANDEN — wird weiterhin fuer Jump-Links genutzt
  affectedLineIds: string[];      // NEU — IDs aller betroffenen InvoiceLines fuer UI-Rendering
  // ...
}
```

**Warum `affectedLineIds` NEBEN `relatedLineIds`?**
- `relatedLineIds` steuert die Jump-Link-Navigation und Auto-Resolve-Logik (PROJ-21). Diese IDs sind kontextabhaengig und duerfen NICHT veraendert werden.
- `affectedLineIds` ist das neue, rein deskriptive Array fuer die UI-Darstellung. Es kann identisch sein, muss aber nicht (z.B. bei aggregierten Issues).

### Aenderungen an den Issue-Erzeugern

Alle 4 Erzeuger-Stellen werden umgebaut:

| Erzeuger | Datei | Aenderung |
|----------|-------|-----------|
| `buildStep1ParserIssues()` | `src/store/runStore.ts:148-190` | `affectedLineIds` aus `warning.positionIndex` ableiten; `details` bleibt kurzer Summary |
| `crossMatch()` | `src/services/matchers/modules/FalmecMatcher_Master.ts:195-256` | `affectedLineIds` = IDs der nicht-gematchten Lines; `details` = kurzer Summary ("X Positionen ohne Match") |
| `serialExtract()` | `src/services/matchers/modules/FalmecMatcher_Master.ts:448-571` | `affectedLineIds` = IDs der Lines mit S/N-Problemen; `details` = kurzer Summary |
| `buildEngineIssues()` | `src/services/matching/matchingEngine.ts:61-155` | `affectedLineIds` = IDs aller betroffenen Lines pro Issue-Typ; `details` = kurzer Summary |

**Regel:** `details` wird zu einem einzeiligen Summary-String (z.B. "5 Positionen ohne Bestellzuordnung"). Dieser Text wird im Header der IssueCard angezeigt und fuer den Clipboard-Text verwendet.

### Frontend: On-the-fly Rendering in `IssueCard`

Die neue `IssueCard`-Subkomponente in `IssuesCenter.tsx` iteriert ueber `issue.affectedLineIds`, holt die zugehoerigen `InvoiceLine`-Objekte aus `useRunStore().invoiceLines` und rendert pro Zeile:

```
Pos.: 16  |  Artikel: 102133  |  Bestellnummer: CLVI20.E0P7  |  EAN: 8034122477183  |  Menge: 2  |  Preis: RE: 1450,00 EUR / Sage: 1450,00 EUR
```

**Regeln (unveraendert aus Rev 0):**
1. Felder ohne Wert weglassen (null, undefined, '', 0)
2. Bestellwerte in `"..."` einschliessen
3. Zwei Bestellquellen (PDF + Step 4) wenn verfuegbar
4. S/N-Logik: NEIN / JA - Seriennummern / JA - (fehlt)
5. Limit: 30 Zeilen, danach `... (+X weitere Positionen)`

### Datenfelder pro Zeile (identisch zu Rev 0)

| Anzeige | Quelle (InvoiceLine) | Hinweis |
|---------|---------------------|---------|
| `Pos.:` | `positionIndex` | 1-basiert |
| `Artikel:` | `falmecArticleNo` oder `manufacturerArticleNo` | Falmec bevorzugt |
| `Bestellnummer:` | `manufacturerArticleNo` | Original aus Rechnung |
| `EAN:` | `ean` | EAN-Barcode |
| `Menge:` | `qty` | Liefermenge |
| `Preis:` | `unitPriceInvoice` / `unitPriceSage` | Format: `RE: X EUR / Sage: Y EUR` |
| `S/N:` | `serialRequired` + `serialNumbers[]` | Logik wie oben |
| `Bestellung:` | `allocatedOrders[]` oder `orderNumberAssigned` | In Gaensefuesschen |

### Neue Helper-Funktion (Frontend-seitig)

**Neue Datei: `src/lib/issueLineFormatter.ts`** (NICHT in services/ — ist reine UI-Logik!)

```typescript
export function formatLineForDisplay(line: InvoiceLine): string { ... }
export function buildIssueClipboardText(issue: Issue, lines: InvoiceLine[]): string { ... }
```

Diese Funktionen werden von `IssueCard` und der Copy-Logik geteilt.

### Entfaellt aus Rev 0

- ~~`src/services/issueDetailFormatter.ts`~~ — Kein Backend-Formatter mehr noetig
- ~~`buildDetailBlock()`~~ — Wird durch Frontend-Rendering ersetzt

---

## Aufgabe 2: Collapsible-UI mit Header/Body/Footer

### Ziel (unveraendert)

Jede Issue-Meldung erhaelt Header, scrollbaren Body und einklappbaren Footer.

### Soll-Zustand — IssueCard Struktur

```
+-----------------------------------------------------------------+
| HEADER                                                           |
| [SeverityBadge] [TypLabel] [message]                             |
|          [Betroffene Zeilen isolieren] [kopieren] [Senden]       |
+-----------------------------------------------------------------+
| BODY (scrollbar, max-height ~5 Zeilen eingeklappt)               |
| Pos.: 16  |  Artikel: 102133  |  Bestellnr: CLVI20...           |
| Pos.: 19  |  Artikel: 204567  |  Bestellnr: CVJN90...           |
| ...                                                              |
+-----------------------------------------------------------------+
| FOOTER  [ChevronsDown / ChevronsUp]                              |
+-----------------------------------------------------------------+
```

### Header-Aufbau

**Links:**
1. `SeverityBadge` (bestehend)
2. Typ-Label Badge (bestehend)
3. Issue `message` Text

**Rechts (rechtbuendig):**
1. **"Betroffene Zeilen isolieren"** — UMBENANNT + NEUE LOGIK (siehe Aufgabe 2b)
   - Icon: `Filter` (aus lucide-react)
   - Funktion: Setzt `activeIssueFilterIds` im Store + wechselt zum Tab "Artikelliste"
   - Darstellung: `variant="ghost"`, `size="sm"`
2. **"kopieren"** — NEU
   - Icon: `Copy` (aus lucide-react)
   - Darstellung: `variant="ghost"`, `size="sm"`
   - Funktion: Kopiert `issueClipboardText` via PROJ-36 Pattern (siehe Aufgabe 4)
3. **"Senden"** — bestehend, UNVERAENDERT

### Body-Aufbau (unveraendert)

- Inhalt: On-the-fly gerenderte Zeilen aus `affectedLineIds` (Aufgabe 1)
- Darstellung: `whitespace-pre-wrap`, `font-mono`, `text-xs`
- Eingeklappt: `max-h-[130px]`, `overflow-y-auto`
- Ausgeklappt: `max-h-[5000px]`, `overflow-y-auto`
- Transition: `transition-all duration-500 ease-in-out`

### Footer-Aufbau (unveraendert)

1:1 Kopie des Patterns aus `WarehouseLocations.tsx:224-237` (ChevronsDown/Up mit animate-pulse).

### Kopiertext-Format (`issueClipboardText`)

```
[Fehler] Bestellung nicht zuordenbar — 5 Positionen ohne Bestellzuordnung
---
Pos.: 16  |  Artikel: 102133  |  Bestellnummer: CLVI20.E0P7#ZZZF461F  |  ...
Pos.: 19  |  Artikel: 204567  |  ...
```

Wird durch `buildIssueClipboardText()` aus `src/lib/issueLineFormatter.ts` erzeugt.

---

## Aufgabe 2b: Tab-Wechsel mit Issue-Filter (KISS-Loesung)

### Ziel

Der Button "Betroffene Zeilen isolieren" springt NICHT zu einer Einzelzeile, sondern filtert die Tabelle auf alle betroffenen Zeilen.

### Neuer State im Store (`src/store/runStore.ts`)

```typescript
// RunState interface — NEU:
activeIssueFilterIds: string[] | null;        // null = kein Issue-Filter aktiv
setActiveIssueFilterIds: (ids: string[] | null) => void;
```

### Flow bei Klick auf "Betroffene Zeilen isolieren"

1. `setActiveIssueFilterIds(issue.affectedLineIds)` — setzt den temporaeren Filter
2. `setActiveTab('items')` — wechselt zum Tab "Artikelliste"
3. Die Tabelle in `ItemsTable.tsx` filtert: Wenn `activeIssueFilterIds !== null`, zeige NUR diese Zeilen
4. Ueber der Tabelle erscheint ein Banner:
   ```
   "Zeige X isolierte Fehler-Zeilen [X Filter aufheben]"
   ```
5. Klick auf "[X Filter aufheben]" → `setActiveIssueFilterIds(null)`

### Filter-Prioritaet in den Tabellen

Wenn `activeIssueFilterIds` gesetzt ist:
- Es ueberschreibt den normalen `statusFilter` (Dropdown bleibt auf seinem Wert, wird aber ignoriert)
- Die Tabelle zeigt NUR die Zeilen, deren `id` im `activeIssueFilterIds`-Array enthalten ist
- Sobald der User das Dropdown bedient ODER den FilterX-Button klickt → `activeIssueFilterIds` wird geleert

### Betroffene Tabellen

- `src/components/run-detail/ItemsTable.tsx` — Artikelliste (Tab "items")
- `src/components/run-detail/InvoicePreview.tsx` — RE-Positionen (Tab "invoice-preview")

**Beide** Tabellen muessen den `activeIssueFilterIds`-Filter unterstuetzen.

---

## Aufgabe 3: FilterX-Icon + Reset-Logik

### Ziel

Ein dedizierter "Filter zuruecksetzen"-Button in BEIDEN Tabellen (Artikelliste + RE-Positionen).

### Umsetzung

**Neues Icon-Element (links neben dem Filter-Dropdown):**

```tsx
import { FilterX } from 'lucide-react';

{(statusFilter !== 'all' || activeIssueFilterIds) && (
  <button
    className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 transition-colors"
    onClick={() => {
      setStatusFilter('all');
      setActiveIssueFilterIds(null);
    }}
    title="Alle Filter zuruecksetzen"
  >
    <FilterX className="w-4 h-4" />
  </button>
)}
```

**Sichtbarkeit:** Nur wenn ein Filter aktiv ist (`statusFilter !== 'all'` ODER `activeIssueFilterIds !== null`).

**Rote Hover-Akzente:** `hover:bg-red-500/10 hover:text-red-500`

### Fallback-Reset

Sobald der User das normale Filter-Dropdown bedient (egal welchen Wert er waehlt), wird `activeIssueFilterIds` automatisch geleert:

```typescript
// In ItemsTable.tsx und InvoicePreview.tsx:
const handleFilterChange = (value: string) => {
  setStatusFilter(value);
  setActiveIssueFilterIds(null);  // Automatischer Reset
};
```

Das bestehende `onValueChange={setStatusFilter}` wird durch `onValueChange={handleFilterChange}` ersetzt.

### Issue-Filter-Banner

Wenn `activeIssueFilterIds` aktiv ist, erscheint ueber der Tabelle:

```tsx
{activeIssueFilterIds && (
  <div className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-1.5 text-sm flex items-center gap-2">
    <span>Zeige {activeIssueFilterIds.length} isolierte Fehler-Zeilen</span>
    <button
      className="text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1"
      onClick={() => setActiveIssueFilterIds(null)}
    >
      <X className="w-3.5 h-3.5" /> Filter aufheben
    </button>
  </div>
)}
```

---

## Aufgabe 4: Synergie mit PROJ-36 — Copy-Logik

### Ziel

Der "kopieren"-Button in der IssueCard nutzt das PROJ-36 Pattern aus `CopyableText.tsx`.

### PROJ-36 Pattern (Referenz: `src/components/ui/CopyableText.tsx`)

```typescript
// Kern-Pattern:
const [isCopied, setIsCopied] = useState(false);
const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsCopied(false), 1500);
  } catch { /* silent */ }
};
```

### Umsetzung: Inline-Pattern in IssueCard

Da `CopyableText` eine Span-Komponente ist (nicht ein Button), und es keinen `useCopyToClipboard`-Hook gibt, extrahieren wir das Pattern als **neuen Custom Hook**:

**Neue Datei: `src/hooks/useCopyToClipboard.ts`**

```typescript
export function useCopyToClipboard(timeoutMs = 1500) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsCopied(false), timeoutMs);
    } catch { /* silent (KISS) */ }
  };

  return { isCopied, copy };
}
```

**Feedback im Button:**
- Normal: Icon `Copy`, Text "kopieren"
- Nach Klick (1.5s): Icon `Check`, Text "Kopiert!" in `text-green-600`

**Bonus-Refactor:** `CopyableText.tsx` kann spaeter auf diesen Hook umgestellt werden (nicht in Scope PROJ-37).

---

## Aufgabe 5: Umbenennung "Issue" → "Probleme" (nur Anzeigenamen)

### Ziel (unveraendert aus Rev 0)

Nur Display-Texte aendern. Alle Code-Identifier bleiben gleich.

### SICHER UMZUBENENNEN (nur Display-Text):

| Datei | Zeile | Aktuell | Neu |
|-------|-------|---------|-----|
| `IssuesCenter.tsx` | 265 | `"Keine Issues"` | `"Keine Probleme"` |
| `IssuesCenter.tsx` | 365 | `"Issue loesen"` | `"Problem loesen"` |
| `RunDetail.tsx` | 649 | `"${totalIssues} Issues offen"` | `"${totalIssues} Probleme offen"` |
| `RunDetail.tsx` | 649 | `"Keine offenen Issues"` | `"Keine offenen Probleme"` |
| `ExportPanel.tsx` | 125 | `"Keine blockierenden Issues"` | `"Keine blockierenden Probleme"` |
| `ExportPanel.tsx` | 229 | `"...alle blockierenden Issues..."` | `"...alle blockierenden Probleme..."` |
| `WorkflowStepper.tsx` | 73 | `"{count} Issue{s}"` | `"{count} Problem{e}"` |

### NICHT UMBENENNEN (Code-Identifier):

Interfaces, State-Properties, Funktionsnamen, Tab-Values, Component-Names — alle bleiben auf Englisch.

---

## Betroffene Dateien (Gesamt Rev 1)

| Datei | Aufgabe | Art der Aenderung |
|-------|---------|-------------------|
| `src/types/index.ts` | 1 | `Issue`-Interface: `affectedLineIds: string[]` hinzufuegen |
| `src/lib/issueLineFormatter.ts` | 1 | **NEU** — Frontend-Helper: `formatLineForDisplay()`, `buildIssueClipboardText()` |
| `src/hooks/useCopyToClipboard.ts` | 4 | **NEU** — Shared Hook, extrahiert aus PROJ-36 Pattern |
| `src/store/runStore.ts` | 1, 2b | `buildStep1ParserIssues()`: `affectedLineIds` setzen; `activeIssueFilterIds` State + Action |
| `src/services/matchers/modules/FalmecMatcher_Master.ts` | 1 | `crossMatch()` + `serialExtract()`: `affectedLineIds` setzen |
| `src/services/matching/matchingEngine.ts` | 1 | `buildEngineIssues()`: `affectedLineIds` setzen |
| `src/components/run-detail/IssuesCenter.tsx` | 1, 2, 4, 5 | Haupt-Umbau: IssueCard-Subkomponente, On-the-fly Rendering, Copy-Button, Display-Texte |
| `src/components/run-detail/ItemsTable.tsx` | 2b, 3 | Issue-Filter-Integration, FilterX-Button, Banner, Dropdown-Reset-Fallback |
| `src/components/run-detail/InvoicePreview.tsx` | 2b, 3 | Issue-Filter-Integration, FilterX-Button, Banner, Dropdown-Reset-Fallback |
| `src/pages/RunDetail.tsx` | 5 | 2 Display-Text-Aenderungen |
| `src/components/run-detail/ExportPanel.tsx` | 5 | 2 Display-Text-Aenderungen |
| `src/components/WorkflowStepper.tsx` | 5 | 1 Display-Text + Plural-Logik |

---

## Umsetzungs-Reihenfolge

1. **Phase 1 — Typen + Helpers** (Fundament)
   - `Issue`-Interface erweitern (`affectedLineIds`)
   - `src/lib/issueLineFormatter.ts` erstellen
   - `src/hooks/useCopyToClipboard.ts` erstellen

2. **Phase 2 — Issue-Erzeuger umbauen** (Backend)
   - `buildStep1ParserIssues()` — `affectedLineIds` setzen
   - `crossMatch()` — `affectedLineIds` setzen
   - `serialExtract()` — `affectedLineIds` setzen
   - `buildEngineIssues()` — `affectedLineIds` setzen
   - `details` auf kurzen Summary-String kuerzen

3. **Phase 3 — Store erweitern** (State)
   - `activeIssueFilterIds: string[] | null` + Action

4. **Phase 4 — IssueCard UI** (Kern-Feature)
   - IssueCard-Subkomponente mit Header/Body/Footer
   - On-the-fly Rendering aus `affectedLineIds` + `invoiceLines`
   - Copy-Button mit `useCopyToClipboard` Hook
   - "Betroffene Zeilen isolieren"-Button

5. **Phase 5 — Tabellen-Integration** (Filter)
   - `ItemsTable.tsx`: Issue-Filter-Logik, Banner, FilterX-Button, Dropdown-Reset
   - `InvoicePreview.tsx`: Gleiche Integration

6. **Phase 6 — Display-Texte** (Finishing)
   - 7 Stellen in 4 Dateien umbenennen

7. **Phase 7 — Test** (Verifikation)

---

## Verifikation / Testplan

1. **Separation of Concerns (Aufgabe 1):**
   - Issue-Erzeuger pruefen: `affectedLineIds` ist ein Array von Line-IDs, `details` ist ein 1-Zeiler
   - IssueCard: Body zeigt mehrzeilige Darstellung mit allen Feldern
   - Fehlende Werte werden weggelassen (z.B. kein EAN → kein EAN-Feld)

2. **Issue-Filter (Aufgabe 2b):**
   - Klick "Betroffene Zeilen isolieren" → Tab wechselt zu "Artikelliste"
   - Tabelle zeigt NUR die betroffenen Zeilen
   - Banner "Zeige X isolierte Fehler-Zeilen [X Filter aufheben]" erscheint
   - Klick "Filter aufheben" → alle Zeilen wieder sichtbar

3. **FilterX-Reset (Aufgabe 3):**
   - FilterX-Button erscheint nur wenn Filter aktiv
   - Klick setzt Dropdown auf "Alle" UND leert `activeIssueFilterIds`
   - Dropdown-Bedienung leert ebenfalls `activeIssueFilterIds`

4. **Copy-Logik (Aufgabe 4):**
   - Klick "kopieren" → Clipboard enthaelt formatierten Text
   - Button-Text aendert sich kurz auf "Kopiert!" in gruen (1.5s)
   - Kein Toast, kein globaler State

5. **Umbenennung (Aufgabe 5):**
   - Alle 7 Display-Stellen zeigen "Problem/Probleme" statt "Issue/Issues"
   - Tab-Routing (`value="issues"`) funktioniert weiterhin

6. **Regression:**
   - "Senden"-Button oeffnet Resolution-Dialog wie bisher
   - CSV-Export funktioniert (nutzt `details`-Summary, nicht mehrzeiligen Body)
   - Auto-Resolve-Logik nutzt weiterhin `relatedLineIds` (nicht `affectedLineIds`)
   - KPI-Kachel-Klick → Tab-Wechsel + Step-Filter funktioniert

---

## Stolpersteine

### 1. `affectedLineIds` vs `relatedLineIds` — Verwechslungsgefahr

Die Auto-Resolve-Logik (`checkIssueStillActive()` in `runStore.ts:197-239`) nutzt `relatedLineIds`. Die neue `affectedLineIds` dient nur der UI-Darstellung. **NIEMALS** die Auto-Resolve-Logik auf `affectedLineIds` umstellen. Beide Arrays koennen identisch sein, muessen aber nicht.

### 2. Issue-Erzeuger: Line-ID-Verfuegbarkeit

In den Issue-Erzeugern muss die `InvoiceLine.id` zuverlaeassig verfuegbar sein. In Step 1 (`buildStep1ParserIssues`) existieren die `InvoiceLine`-Objekte ggf. noch nicht vollstaendig. **Loesung:** `affectedLineIds` kann in Step 1 leer sein (`[]`), da Step-1-Issues typischerweise globale Parser-Warnungen sind (nicht zeilen-spezifisch).

### 3. On-the-fly Rendering: Performance bei 40+ Positionen

Die `IssueCard` rendert fuer jede `affectedLineId` eine Lookup-Operation auf `invoiceLines`. Bei 40+ Positionen pro Issue koennte das teuer werden. **Loesung:** `useMemo` in der IssueCard mit Abhaengigkeit auf `issue.affectedLineIds` und `invoiceLines`. Plus das bestehende 30-Zeilen-Limit.

### 4. Tab-Value "issues" ist hardcoded

In `RunDetail.tsx` wird `value="issues"` in `TabsTrigger` (Z.690), `TabsContent` (Z.806) und `setActiveTab('issues')` (Z.575, 596) verwendet. **NIEMALS** aendern.

### 5. Filter-Kollision: `activeIssueFilterIds` vs `statusFilter`

Wenn der User einen Issue-Filter aktiviert hat UND dann das Dropdown bedient, muss der Issue-Filter sofort verschwinden. Die `handleFilterChange`-Wrapper-Funktion in beiden Tabellen stellt das sicher. **Achtung:** Der bestehende Reset-Guard (ItemsTable Z.110-112: "wenn Count=0 → reset") muss NACH dem Issue-Filter-Check laufen.

### 6. InvoicePreview: Tab-Targeting

Der "Betroffene Zeilen isolieren"-Button wechselt immer zum Tab `'items'` (Artikelliste). Fuer RE-Positionen-Issues (Step 1) waere ggf. `'invoice-preview'` besser. **Rev 1 Entscheidung:** Immer `'items'`, da die Artikelliste die reichhaltigeren Daten zeigt. Kann in Rev 2 verfeinert werden.

### 7. CSV-Export: Kein Multiline-Problem mehr

Da `details` nun ein kurzer 1-Zeiler-Summary ist (statt mehrzeiligem Block), entfaellt das CSV-Escaping-Problem aus Rev 0 komplett. Der CSV-Export funktioniert ohne Anpassung.

### 8. Clipboard-API Berechtigung

`navigator.clipboard.writeText()` benoetigt HTTPS oder localhost. Im Dev-Modus (localhost:8080) gegeben. In Produktion muss HTTPS aktiv sein. Der `useCopyToClipboard`-Hook hat einen silent catch (KISS) — kein Fallback noetig.

### 9. `useCopyToClipboard` Hook: Cleanup

Der Timer im Hook muss bei Component-Unmount gecleaned werden. Das `useEffect`-Cleanup im Hook (`return () => clearTimeout(...)`) stellt das sicher. Identisch zum Pattern in `CopyableText.tsx:31-37`.

### 10. Dropdown-onValueChange Signatur

In beiden Tabellen wird aktuell `onValueChange={setStatusFilter}` direkt gesetzt. Der neue `handleFilterChange`-Wrapper muss exakt dieselbe Signatur haben (`(value: string) => void`). Shadcn `Select` uebergibt den neuen Wert als String — passt.

---
---

## IMPLEMENTIERUNGSKONTEXT (Rev 2) — Fuer den ausfuehrenden Agenten

> Dieser Abschnitt enthaelt alle Code-Stellen, exakte Zeilennummern und bestehenden Code-Strukturen,
> die fuer eine fehlerfreie Umsetzung bekannt sein muessen. Erstellt nach vollstaendigem Code-Review.

### AKTUELLES Issue-Interface (src/types/index.ts:342-362)

```typescript
export interface Issue {
  id: string;
  runId?: string;
  severity: IssueSeverity;
  stepNo: number;
  type: IssueType;
  message: string;
  details: string;
  relatedLineIds: string[];          // <-- NICHT ANFASSEN (Auto-Resolve!)
  status: 'open' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  context?: {
    positionIndex?: number;
    field?: string;
    expectedValue?: string;
    actualValue?: string;
  };
}
// AENDERUNG: Nach `relatedLineIds` einfuegen:
//   affectedLineIds: string[];      // NEU — rein deskriptiv fuer UI-Rendering
```

### AKTUELLER RunState (src/store/runStore.ts)

- **Interface `RunState`:** beginnt Zeile 361
- **`activeTab: string;`:** Zeile 395 (unter "// UI State")
- **`setActiveTab: (tab) => void;`:** Zeile 411
- **Initialisierung `activeTab: 'overview'`:** Zeile 529
- **Action `setActiveTab`:** Zeile 541: `setActiveTab: (tab) => set({ activeTab: tab }),`
- **WICHTIG:** `activeIssueFilterIds` existiert NOCH NIRGENDS — komplett neu anzulegen

Einfuegen im RunState Interface (nach `activeTab`):
```typescript
activeIssueFilterIds: string[] | null;
setActiveIssueFilterIds: (ids: string[] | null) => void;
```
Initialisierung: `activeIssueFilterIds: null,`
Action: `setActiveIssueFilterIds: (ids) => set({ activeIssueFilterIds: ids }),`

### ISSUE-ERZEUGER: Exakte Code-Stellen

#### 1. buildStep1ParserIssues() — src/store/runStore.ts:148-190

Zwei Issue-Bloecke (blockingIssues Z.151-166, softFailIssues Z.172-187).
In beide Objekte nach `relatedLineIds:` einfuegen:
```typescript
affectedLineIds: warning.positionIndex ? [`${runId}-line-${warning.positionIndex}`] : [],
```

#### 2. crossMatch() — src/services/matchers/modules/FalmecMatcher_Master.ts

**3 Issue-Objekte:**
- Z.202-217: `no-article-match` — `affectedLineIds: allNoMatch.map(r => r.line.lineId),`
- Z.221-236: `match-artno-not-found` — `affectedLineIds: noMatchNoConflict.map(r => r.line.lineId),`
- Z.240-255: `match-conflict-id` — `affectedLineIds: conflictResults.map(r => r.line.lineId),`

`details` kuerzen auf 1-Zeiler:
- Z.202: `details: allNoMatch.map(r => ...).join(', ')` → `details: \`${allNoMatch.length} Artikel ohne Match in Stammdaten\``
- Z.221: Analog → `details: \`${noMatchNoConflict.length} Zeilen: Artikelnummer/EAN nicht im Stamm\``
- Z.240: Analog → `details: \`${conflictResults.length} Zeilen: ArtNo/EAN-Konflikt\``

#### 3. serialExtract() — src/services/matchers/modules/FalmecMatcher_Master.ts

**2 Issue-Objekte:**
- Z.472-484: `sn-invoice-ref-missing` — `affectedLineIds: [],` (global, keine Zeilen)
- Z.549-562: `sn-insufficient-count` — `affectedLineIds: unassignedLineIds,` (bereits vorhanden als Variable)

`details` kuerzen:
- Z.472: bleibt (ist bereits kurz)
- Z.549: `details: \`${mismatchCount} Zeilen ohne Seriennummer (${assignedCount}/${requiredCount} zugewiesen)\`` (ist bereits kurz)

#### 4. buildEngineIssues() — src/services/matching/matchingEngine.ts:61-154

**3 Issue-Objekte:**
- Z.73-91: `order-no-match` — `affectedLineIds: notOrderedLines.map(l => l.lineId),`
- Z.100-118: `order-fifo-only` — `affectedLineIds: fifoOnlyLines.map(l => l.lineId),`
- Z.135-152: `order-multi-split` — `affectedLineIds: relatedLines.map(l => l.lineId),`

`details` kuerzen auf 1-Zeiler:
- Z.73: → `details: \`${positionIndices.size} Positionen ohne Bestellzuordnung\``
- Z.100: → `details: \`${positionIndices.size} Positionen nur via FIFO zugeordnet\``
- Z.135: → `details: \`${multiSplitPositions.length} Positionen auf 3+ Bestellungen aufgeteilt\``

### TABELLEN: Exakte Filter-Stellen

#### ItemsTable.tsx (src/components/run-detail/ItemsTable.tsx)

- **statusFilter State:** Z.51: `const [statusFilter, setStatusFilter] = useState<string>('all');`
- **Filter-Logik:** Z.90: `return matchesSearch && matchesItemsStatusFilter(line, statusFilter);`
- **Reset-Guard:** Z.109-113: Auto-reset wenn Count=0 (MUSS NACH Issue-Filter-Check laufen!)
- **Filter-Dropdown:** Z.170-192: `<Select value={statusFilter} onValueChange={setStatusFilter}>`
- **Expand/Collapse Header:** Z.231-237 (ChevronsDown/Up Pattern)

AENDERUNGEN:
1. Store destrukturieren: `activeIssueFilterIds, setActiveIssueFilterIds` hinzufuegen
2. Filter-Logik Z.90: Wenn `activeIssueFilterIds !== null` → nur `activeIssueFilterIds.includes(line.lineId)`
3. Dropdown Z.170: `onValueChange={setStatusFilter}` → `onValueChange={handleFilterChange}`
4. `handleFilterChange` Wrapper-Funktion anlegen
5. FilterX-Button vor dem Dropdown einfuegen
6. Issue-Filter-Banner ueber der Tabelle einfuegen

#### InvoicePreview.tsx (src/components/run-detail/InvoicePreview.tsx)

- **statusFilter State:** Z.71: `const [statusFilter, setStatusFilter] = useState<string>('all');`
- **Reset-Guard:** Z.148-153
- **Filter-Dropdown:** Z.266-282: `<Select value={statusFilter} onValueChange={setStatusFilter}>`
- **Expand/Collapse Header:** Z.298-303

AENDERUNGEN: Identisch zu ItemsTable (5 Punkte oben).

### IssuesCenter.tsx: Aktueller Zustand (src/components/run-detail/IssuesCenter.tsx)

- **387 Zeilen** gesamt
- **Store-Destrukturierung Z.86:** `const { issues, resolveIssue, currentRun, issuesStepFilter, setIssuesStepFilter, navigateToLine } = useRunStore();`
  → ERGAENZEN: `invoiceLines, setActiveIssueFilterIds, setActiveTab`
- **Issue-Rendering Z.283-329:** Flache Karten — wird komplett durch IssueCard-Subkomponente ersetzt
- **"Zeile anzeigen" Button Z.306-315:** ENTFAELLT (ersetzt durch "Betroffene Zeilen isolieren")
- **"Senden" Button Z.317-325:** BLEIBT UNVERAENDERT
- **"Keine Issues" Text Z.265:** → "Keine Probleme"
- **"Issue loesen" Dialog-Title Z.365:** → "Problem loesen"
- **CSV-Export Z.141-163:** BLEIBT (nutzt `details` Summary-String)

### Display-Text-Aenderungen: Exakte Stellen

| Datei | Zeile | Aktuell (exakt) | Neu |
|-------|-------|-----------------|-----|
| `IssuesCenter.tsx` | 265 | `Keine Issues` | `Keine Probleme` |
| `IssuesCenter.tsx` | 365 | `Issue lösen` (DialogTitle) | `Problem lösen` |
| `RunDetail.tsx` | 649 | `` `${totalIssues} Issues offen` `` | `` `${totalIssues} Probleme offen` `` |
| `RunDetail.tsx` | 649 | `'Keine offenen Issues'` | `'Keine offenen Probleme'` |
| `ExportPanel.tsx` | 125 | `Keine blockierenden Issues` | `Keine blockierenden Probleme` |
| `ExportPanel.tsx` | 229 | `alle blockierenden Issues` | `alle blockierenden Probleme` |
| `WorkflowStepper.tsx` | 73 | `{step.issuesCount} Issue{step.issuesCount > 1 ? 's' : ''}` | `{step.issuesCount} Problem{step.issuesCount > 1 ? 'e' : ''}` |

### ChevronsDown/Up Pattern zum Klonen (aus WarehouseLocations.tsx:224-237)

```tsx
<div className="flex justify-center py-2 border-t border-border/40">
  <button
    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded"
    onClick={() => setExpanded((e) => !e)}
    aria-label={expanded ? 'Einklappen' : 'Ausklappen'}
  >
    {expanded ? (
      <ChevronsUp className="w-5 h-5" />
    ) : (
      <ChevronsDown className="w-5 h-5 animate-pulse" />
    )}
  </button>
</div>
```

### useCopyToClipboard Hook: Vollstaendige Implementierung

```typescript
// src/hooks/useCopyToClipboard.ts
import { useEffect, useRef, useState } from 'react';

export function useCopyToClipboard(timeoutMs = 1500) {
  const [isCopied, setIsCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setIsCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsCopied(false), timeoutMs);
    } catch {
      // Intentionally silent (KISS)
    }
  };

  return { isCopied, copy };
}
```

### KRITISCHE REGELN (NICHT VERLETZEN!)

1. **`relatedLineIds` NIEMALS aendern** — wird von `checkIssueStillActive()` (runStore.ts:197-239) fuer Auto-Resolve genutzt
2. **Tab-Value `"issues"` NIEMALS aendern** — hardcoded in RunDetail.tsx:690, 806, 575, 596
3. **`navigateToLine()` wird ersetzt** durch `setActiveIssueFilterIds()` + `setActiveTab('items')` — die alte `navigateToLine`-Funktion wird nicht mehr aus IssuesCenter aufgerufen (bleibt aber im Store fuer andere Nutzer)
4. **Filter-Prioritaet:** `activeIssueFilterIds` ueberschreibt `statusFilter` — ABER: Dropdown-Bedienung cleant `activeIssueFilterIds` sofort
5. **Reset-Guard in ItemsTable Z.109-113:** Muss NACH dem Issue-Filter-Check laufen (Reihenfolge beachten!)
6. **`details` bleibt Pflichtfeld** — wird zum 1-Zeiler Summary. CSV-Export (Z.141-163) nutzt diesen Wert
7. **InvoiceLine.lineId** ist der Primaer-Key fuer `affectedLineIds` — Format: `{runId}-line-{positionIndex}` (wird in den Issue-Erzeugern so gesetzt)

### PHASEN-TRACKING

| Phase | Beschreibung | Status |
|-------|-------------|--------|
| 1 | Typen + Helpers (Interface, issueLineFormatter, useCopyToClipboard) | Done |
| 2 | Issue-Erzeuger umbauen (4+3 Stellen: affectedLineIds + details kuerzen) | Done |
| 3 | Store erweitern (activeIssueFilterIds State + Action) | Done |
| 4 | IssueCard UI (Subkomponente, On-the-fly Rendering, Copy, Filter-Button) | Done |
| 5 | Tabellen-Integration (ItemsTable + InvoicePreview: Filter, Banner, FilterX) | Done |
| 6 | Display-Texte (7 Stellen in 4 Dateien) | Done |
| 7 | Test + Verifikation | Done |

### UX-Politur (Finale Korrekturen — 2026-02-28)

1. **Icon-Reihenfolge:** FilterX-Icon vor Filter-Icon platziert (ItemsTable + InvoicePreview) — intuitivere Leserichtung: [FilterX] → [Filter] → [Dropdown]
2. **FilterX im Fehler-Center:** IssuesCenter hat jetzt ein eigenes FilterX-Icon, das alle 3 Dropdowns (Schritt, Schweregrad, Typ) auf Standardwert zuruecksetzt
3. **Banner-Kontrast:** Issue-Filter-Banner in beiden Tabellen auf `text-black` umgestellt — lesbar auf amber-Hintergrund
