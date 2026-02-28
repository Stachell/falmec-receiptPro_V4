# ADD-ON zu PROJ-22/23 — Fertigstellung POPUP „PREIS / CHECK" mit Verdrahtung

> **Erstellt:** 2026-02-28
> **Status:** OFFEN — Wartet auf Execution-Freigabe
> **Zuordnung:** ADD-ON zu `PROJ-22` Phase `B3` (Pop-ups)
> **Referenz-Datei:** `PROJ-22-23-MASTERPLAN.md`

---

## Inhaltsverzeichnis

1. [Ausgangssituation (IST)](#1-ausgangssituation-ist)
2. [Ziel (SOLL)](#2-ziel-soll)
3. [Detailspezifikation: Verdrahtung PriceCell → Store](#3-detailspezifikation-verdrahtung-pricecell--store)
4. [Detailspezifikation: priceCheckStatus-Verhalten](#4-detailspezifikation-pricecheckstatus-verhalten)
5. [Detailspezifikation: Verhalten nach Step 4 (isExpanded)](#5-detailspezifikation-verhalten-nach-step-4-isexpanded)
6. [Detailspezifikation: Popup-Inhalt (KISS)](#6-detailspezifikation-popup-inhalt-kiss)
7. [Aggregations-Logik: Position vs. Einzellinie](#7-aggregations-logik-position-vs-einzellinie)
8. [Betroffene Dateien & Änderungen](#8-betroffene-dateien--nderungen)
9. [Verifikationsplan](#9-verifikationsplan)
10. [Stolpersteine](#10-stolpersteine)

---

## 1. Ausgangssituation (IST)

### Was existiert bereits (korrekt, bleibt unverändert)

| Datei | Status |
|-------|--------|
| `src/components/run-detail/PriceCell.tsx` | **Fertig** — Popover-UI mit 3 Optionen (Rechnungspreis / Sage-Preis / Manuell), alle Handler implementiert |
| `src/store/runStore.ts` → `setManualPrice()` | **Fertig** — Store-Action existiert, schreibt `unitPriceFinal` + setzt `priceCheckStatus: 'custom'` |
| `src/components/run-detail/InvoicePreview.tsx` → `handleSetPrice()` | **STUB** — Funktion vorhanden, ruft aber nur `console.log()` auf, kein Store-Aufruf |
| `PriceCheckStatus` Typ | **Fertig** — `'pending' | 'ok' | 'mismatch' | 'missing' | 'custom'` |
| `BADGE_CONFIG` in `PriceCell.tsx` | **Fertig** — Visuelles Mapping für alle Stati |

### Das konkrete Problem

`handleSetPrice` in `InvoicePreview.tsx` (Zeile 165-167) ist ein leerer Stub:

```typescript
// IST (Stub — läuft ins Leere):
const handleSetPrice = (lineId: string, price: number, source: 'invoice' | 'sage' | 'custom') => {
  console.log('setPrice (RE-Positionen):', lineId, price, source);
  // TODO: Wire to store action when price persistence is implemented (PROJ-23 A2)
};
```

Klickt der Nutzer im Popup auf „Rechnungspreis", „Sage-Preis (ERP)" oder gibt einen manuellen Preis ein und bestätigt → **es passiert nichts**. Kein Store-Update, kein visuelles Feedback, kein Status-Wechsel.

---

## 2. Ziel (SOLL)

### Kernfunktionalität

1. **Popup öffnet** → zeigt immer beide Preise (Rechnung + Sage/ERP), auch wenn sie identisch sind (KISS-Regel)
2. **Nutzer wählt einen Preis** → `unitPriceFinal` wird im Store gesetzt, `priceCheckStatus` wechselt auf `'custom'`
3. **Badge-Anzeige ändert sich** dynamisch: Das Checkfeld/Badge in der Spalte „PREIS / CHECK" zeigt den neuen Status
4. **Re-Öffnen möglich**: Das Feld bleibt klickbar, auch nach `'custom'`-Status — jederzeit neu wählbar
5. **`'custom'`-Status bleibt bestehen**, auch wenn das Popup erneut geöffnet und bestätigt wird
6. **Vor Step 4** (kein `isExpanded`): Popup öffnet direkt aus der RE-Positionen-Tabelle
7. **Nach Step 4** (`isExpanded = true`): Klick in RE-Positionen springt zur Artikelliste (Scroll-Anchor zum ersten Artikel der Invoiceline); Popup öffnet sich stattdessen in der Artikelliste auf dem „PREIS / CHECK"-Button

---

## 3. Detailspezifikation: Verdrahtung PriceCell → Store

### 3.1 Änderung in `InvoicePreview.tsx`

Der Stub `handleSetPrice` wird durch eine echte Store-Verbindung ersetzt:

**Schritt 1:** `setManualPrice` aus dem Store importieren

```typescript
// InvoicePreview.tsx — Ergänzung im useRunStore()-Destructuring:
const { invoiceLines, currentRun, activeIssueFilterIds, setActiveIssueFilterIds, setManualPrice } = useRunStore();
```

**Schritt 2:** `handleSetPrice` verdrahten

```typescript
// SOLL: Echter Store-Aufruf statt console.log
const handleSetPrice = (lineId: string, price: number, _source: 'invoice' | 'sage' | 'custom') => {
  setManualPrice(lineId, price);
};
```

> **Hinweis:** Der `source`-Parameter (`'invoice' | 'sage' | 'custom'`) ist im `setManualPrice`-Interface aktuell nicht vorgesehen — `setManualPrice(lineId, price)` setzt **immer** `priceCheckStatus: 'custom'`. Das ist korrekt und KISS-konform: Egal welche Quelle gewählt wird, die Änderung gilt als manuell bestätigt.

### 3.2 Aggregationsebene: lineId vs. positionIndex

**Kritisch:** In RE-Positionen wird `posStatus.representativeLine` übergeben — das ist die **erste** `InvoiceLine` der Position. Vor Step 4 (`isExpanded = false`) gibt es pro Position genau eine aggregierte Zeile — die lineId ist eindeutig und korrekt.

**Beispiel:** Position 3, qty=5 → `lineId = "run-abc-line-3"` → `setManualPrice("run-abc-line-3", 89.50)` schreibt korrekt auf diese eine Aggregat-Zeile.

Nach Step 4 (`isExpanded = true`) existieren 5 Einzelzeilen (`run-abc-line-3-0` bis `run-abc-line-3-4`). In diesem Fall wird der PriceCell-Klick in RE-Positionen **nicht** mehr direkt ausgeführt (siehe Abschnitt 5).

---

## 4. Detailspezifikation: priceCheckStatus-Verhalten

### 4.1 Status-Übergänge

| Ausgangsstatus | Aktion Nutzer | Neuer Status | Visuelles Ergebnis |
|---|---|---|---|
| `pending` | Wählt irgendeinen Preis | `custom` | Badge: blau „angepasst" / 🚹 |
| `ok` | Wählt irgendeinen Preis | `custom` | Badge: blau „angepasst" / 🚹 |
| `mismatch` | Wählt Rechnungspreis oder Sage-Preis | `custom` | Badge: blau „angepasst" / 🚹 |
| `missing` | Gibt manuellen Preis ein | `custom` | Badge: blau „angepasst" / 🚹 |
| `custom` | Wählt erneut (Popup öffnet sich wieder) | `custom` | Bleibt blau — neuer Preis überschreibt |

> **Design-Entscheidung (KISS):** Es wird **kein** spezieller `'mismatch-resolved'`-Status eingeführt. Alle manuellen Interventionen → `'custom'`. Das ist ausreichend als Signal „hier wurde Hand angelegt".

### 4.2 Popup-Verhalten: IMMER sichtbar

Das Popup öffnet sich **in jedem Status** (pending, ok, mismatch, missing, custom). Dies entspricht der KISS-Regel:
- Bei `ok`: Nutzer kann trotzdem manuell abweichen (Sonderfälle)
- Bei `mismatch`: Nutzer löst den Konflikt durch Auswahl
- Bei `custom`: Nutzer kann den gesetzten Preis korrigieren

Der bestehende PopoverTrigger in `PriceCell.tsx` (Zeile 103-125) unterstützt das bereits — alle Badges sind klickbar, solange `readOnly={false}`.

### 4.3 `unitPriceFinal` im Popup

Im Popup werden die Preise aus der `InvoiceLine` gelesen:

| Label im Popup | Datenquelle |
|---|---|
| „Rechnungspreis" | `line.unitPriceInvoice` |
| „Sage-Preis (ERP)" | `line.unitPriceSage` (disabled wenn `null`) |
| Manuell-Feld | Freitext → `parseFloat()` |

Der aktuell gesetzte `unitPriceFinal` wird **oberhalb** der Buttons angezeigt als Info-Zeile: „Aktuell: X,XX €" — nur wenn `unitPriceFinal != null`.

> **Klarstellung:** Dieser Info-Text existiert aktuell **nicht** im Popup. Es handelt sich um eine **optionale Ergänzung** (ADD-ON B), die in Abschnitt 6 beschrieben ist.

---

## 5. Detailspezifikation: Verhalten nach Step 4 (isExpanded)

### 5.1 Kontext

Nach Ausführung von Step 4 gilt `currentRun.isExpanded === true`. Die ~45 aggregierten Zeilen wurden zu ~295 Einzelzeilen expandiert. In RE-Positionen wird weiterhin die aggregierte Sicht gezeigt (die `positionStatusMap` zeigt `representativeLine`), aber ein direkter Preis-Schreibzugriff per `lineId` auf eine Einzelzeile ist nicht mehr eindeutig (es existieren jetzt N Einzelzeilen mit verschiedenen lineIds für dieselbe Position).

### 5.2 Verhalten: Klick auf PREIS/CHECK in RE-Positionen (nach Step 4)

**Statt Popup öffnen** → Scroll-Navigation zur Artikelliste:

1. Der PriceCell-Badge in RE-Positionen bleibt klickbar (visuell unverändert)
2. Klick triggert **keinen Popover** mehr, sondern ruft die bestehende `navigateToLine`-Funktion auf (aus PROJ-21, Jump-Links)
3. Ziel: Die Artikelliste scrollt zum **ersten Artikel** der jeweiligen Invoiceline (kleinster `expansionIndex` = 0)
4. Die Artikelliste wird automatisch aufgeklappt (`setExpanded(true)`) falls noch collapsed

**Umsetzung in `PriceCell.tsx`:**
- Neuer optionaler Prop: `onJumpToArticleList?: () => void`
- Wenn `isExpanded && onJumpToArticleList` → PopoverTrigger wird durch einen normalen Button ersetzt, Klick ruft `onJumpToArticleList()` auf
- Badge-Darstellung bleibt identisch (kein visueller Unterschied für den Nutzer)

**Umsetzung in `InvoicePreview.tsx`:**
- Neuer Handler `handlePriceJump(positionIndex: number)` der:
  1. Die lineId des ersten expandierten Artikels der Position berechnet: `${runId}-line-${positionIndex}-0`
  2. `navigateToLine(lineId)` aus `useRunStore` aufruft (setzt `scrollToLineId`)

### 5.3 Verhalten: Popup in der Artikelliste (nach Step 4)

In der **Artikelliste** (`ItemsTable.tsx`) ist `PriceCell` aktuell mit `readOnly={true}` gesetzt. Nach Step 4 muss die Preisänderung **dort** erfolgen.

**Änderung in `ItemsTable.tsx`:**
- `readOnly` wird abhängig von `currentRun?.isExpanded`:
  - `isExpanded === false`: `readOnly={true}` (wie bisher)
  - `isExpanded === true`: `readOnly={false}` — Popup öffnet sich in der Artikelliste

**Handler in `ItemsTable.tsx`:**
```typescript
// Bestehend (Stub):
const handleSetPrice = (_lineId: string, _price: number, _source: ...) => {};

// SOLL (nach Step 4):
const handleSetPrice = (lineId: string, price: number, _source: ...) => {
  if (currentRun?.isExpanded) {
    setManualPrice(lineId, price);
  }
  // Wenn nicht expanded: bleibt leer (sollte durch readOnly verhindert sein)
};
```

> **Wichtig (KISS-Kompromiss):** Nach Step 4 muss jede Einzelzeile **separat** bearbeitet werden. Pro Position (qty=5) gibt es 5 Einzelartikel in der Artikelliste, jeder mit eigenem PREIS/CHECK-Button. Das ist der dokumentierte Kompromiss laut Zielbeschreibung — hinnehmbar, weil Step 4 der letzte Schritt ist und gezielte Korrekturen damit möglich sind.

---

## 6. Detailspezifikation: Popup-Inhalt (KISS)

### 6.1 Beibehaltene Popup-Struktur (unverändert)

Der bestehende `PopoverContent` in `PriceCell.tsx` (Zeile 126-170) bleibt **vollständig erhalten**:

```
┌──────────────────────────────┐
│ Preis festlegen              │
├──────────────────────────────┤
│ [Rechnungspreis]   89,50 €   │
├──────────────────────────────┤
│ [Sage-Preis (ERP)] 92,00 €   │  ← disabled wenn null
├──────────────────────────────┤
│ Manuell eintragen            │
│ [0,00_____________] [OK]     │
└──────────────────────────────┘
```

### 6.2 Optionale Erweiterung: Aktuell-Zeile (ADD-ON B, separate Entscheidung)

Falls gewünscht (separate Freigabe), kann eine Info-Zeile oben ergänzt werden:

```
┌──────────────────────────────┐
│ Preis festlegen              │
│ Aktuell: 89,50 € [angepasst] │  ← NUR wenn unitPriceFinal != null
├──────────────────────────────┤
│ ...                          │
└──────────────────────────────┘
```

> Diese Zeile ist **nicht Teil der Kernanforderung** und kann unabhängig entschieden werden.

### 6.3 Preisvergleich-Hinweis bei Mismatch (ADD-ON C, separate Entscheidung)

Bei `priceCheckStatus === 'mismatch'` könnte eine Hinweiszeile erscheinen:

```
│ ⚠ Preisabweichung: PDF 89,50 € ≠ ERP 92,00 €  │
```

Auch dies ist **nicht Teil der Kernanforderung** und kann separat beschlossen werden.

---

## 7. Aggregations-Logik: Position vs. Einzellinie

### 7.1 Problem: `positionStatusMap` und `representativeLine`

In `InvoicePreview.tsx` verwendet die `positionStatusMap` stets `lines[0]` als `representativeLine`:

```typescript
// Zeile 122 in InvoicePreview.tsx:
const representativeLine = lines[0];
```

Vor Step 4 ist `lines[0]` die einzige Zeile der Position (aggregiert). `lineId = "run-abc-line-3"`.

Nach Step 4 wäre `lines[0]` die erste expandierte Zeile `"run-abc-line-3-0"`. Da das Popup nach Step 4 aber **nicht mehr direkt** aus RE-Positionen aufgerufen wird (→ Jump zur Artikelliste), ist dies kein Problem.

### 7.2 Preis-Synchronisation: Alle Zeilen einer Position

**Offene Frage für Implementierung:** Wenn vor Step 4 ein Preis für eine aggregierte Zeile `"run-abc-line-3"` gesetzt wird, und danach Step 4 ausgeführt und die Zeile expandiert wird — werden die expandierten Einzelzeilen den Preis übernehmen?

**Erwartetes Verhalten (SOLL):**
- Bei der Expansion (Step 4) sollen `unitPriceFinal` und `priceCheckStatus` der Aggregat-Zeile auf alle Einzelzeilen vererbt werden
- Dies ist Teil der Step-4-Expansionslogik (PROJ-23 A4, Phase `run3ExpandFifo.ts`)
- Für dieses ADD-ON gilt: **Preise, die vor Step 4 gesetzt werden, müssen bei der Expansion mitgenommen werden**

> **Abgrenzung:** Die genaue Expansionslogik für diesen Preis-Carry-Over ist **in PROJ-23 A4 zu spezifizieren**. Dieses ADD-ON dokumentiert nur die Anforderung.

---

## 8. Betroffene Dateien & Änderungen

### Pflicht-Änderungen (Kern des ADD-ONs)

| Datei | Art | Beschreibung |
|-------|-----|--------------|
| `src/components/run-detail/InvoicePreview.tsx` | **Modify** | `handleSetPrice` → echten `setManualPrice(lineId, price)` Store-Aufruf einbauen. `setManualPrice` aus `useRunStore` destructuren. |
| `src/components/run-detail/InvoicePreview.tsx` | **Modify** | Neuer Handler `handlePriceJump(positionIndex)` für post-Step-4-Verhalten: ruft `navigateToLine()` auf |
| `src/components/run-detail/PriceCell.tsx` | **Modify** | Neuer optionaler Prop `onJumpToArticleList?: () => void`. Wenn gesetzt UND Aufruf in post-Step-4-Kontext: Klick → Jump statt Popover |
| `src/components/run-detail/ItemsTable.tsx` | **Modify** | `handleSetPrice` mit echtem `setManualPrice(lineId, price)` füllen (guard: nur wenn `currentRun?.isExpanded`). `readOnly` prop dynamisch: `readOnly={!currentRun?.isExpanded}` |

### Keine Änderungen nötig

| Datei | Begründung |
|-------|------------|
| `src/store/runStore.ts` → `setManualPrice()` | Vollständig implementiert, korrekt, unverändert |
| `src/components/run-detail/PriceCell.tsx` → Popup-UI | Vollständig implementiert, korrekt, unverändert |
| `src/types/index.ts` → `PriceCheckStatus` | Korrekt, kein neuer Status nötig |
| `BADGE_CONFIG` in `PriceCell.tsx` | Korrekt, alle States abgedeckt |

---

## 9. Verifikationsplan

| # | Test | Erwartetes Ergebnis |
|---|------|---------------------|
| V1 | Run ohne Step 4: Klick auf CHECK-Badge bei `mismatch` → Popup öffnet | Popup erscheint mit beiden Preisen |
| V2 | Klick auf „Rechnungspreis" im Popup | Badge wechselt auf blau „angepasst" / 🚹, `unitPriceFinal` = `unitPriceInvoice` |
| V3 | Klick auf „Sage-Preis (ERP)" im Popup | Badge wechselt auf blau „angepasst" / 🚹, `unitPriceFinal` = `unitPriceSage` |
| V4 | Manuellen Preis eingeben + OK | Badge wechselt auf blau „angepasst" / 🚹, `unitPriceFinal` = eingegebener Wert |
| V5 | `priceCheckStatus === 'ok'`: Popup öffnet sich trotzdem | Popup erscheint, Preis kann geändert werden |
| V6 | Nach Setzen: Badge-Klick erneut → Popup öffnet wieder | Popup öffnet sich erneut, Preis kann überschrieben werden |
| V7 | `unitPriceSage === null`: Sage-Button | Button ist disabled, kein Crash |
| V8 | Run nach Step 4 (`isExpanded = true`): Klick auf CHECK in RE-Positionen | Kein Popup; stattdessen: Artikelliste scrollt zum ersten Artikel der Position |
| V9 | Run nach Step 4: Klick auf CHECK-Badge in der **Artikelliste** | Popup öffnet sich direkt in der Artikelliste |
| V10 | Run nach Step 4: Preis in Artikelliste setzen | `setManualPrice` schreibt auf Einzelzeile, Badge in Artikelliste wechselt auf blau |
| V11 | Preis-KPI-Kacheln: nach Änderung | `priceCustomCount` steigt um 1, `priceMismatchCount` sinkt (wenn von mismatch) |
| V12 | Price-Mismatch Issue im Fehler-Center | Nach Preis-Auswahl: Issue auto-resolves (falls PROJ-21 Auto-Resolve greift) |

---

## 10. Stolpersteine

### ST-1: Aggregations-Ebenen-Verwechslung

**Risiko:** `positionStatusMap` in `InvoicePreview` nutzt `lines[0]` als `representativeLine`. Vor Step 4 ist das korrekt. Wenn jedoch durch einen Bug Step 4 teilweise ausgeführt wurde und `invoiceLines` bereits expandiert enthält, könnten falsche lineIds übergeben werden.

**Empfehlung:** Im Handler explizit auf `!currentRun?.isExpanded` prüfen, bevor `setManualPrice` aufgerufen wird. Wenn `isExpanded === true`, stattdessen nur den Jump auslösen.

---

### ST-2: `navigateToLine` — Tab-Switch-Nebeneffekt

**Risiko:** `navigateToLine(lineId)` aus PROJ-21 setzt `scrollToLineId` und triggert in `ItemsTable.tsx` automatisch `setExpanded(true)`. Falls die Artikelliste in einem anderen Tab liegt (RunDetail-Tab-Wechsel nötig), könnte der Scroll ins Leere laufen.

**Empfehlung:** Prüfen ob der aktive Tab bereits die Artikelliste zeigt. Falls nein, zunächst Tab wechseln (Tab-Logik in `RunDetail.tsx`), dann erst `navigateToLine` aufrufen. Alternativ: Der Nutzer sieht keine Wirkung → Hinweis-Toast „Zur Artikelliste gewechselt" als UX-Feedback.

---

### ST-3: READ-ONLY Zustand in ItemsTable nach Step 4 — Edge Case bei Partial-Step

**Risiko:** `isStep4Done` (Zeile 68 in ItemsTable: `step4.status === 'ok' || 'soft-fail'`) und `currentRun?.isExpanded` können in der Theorie auseinanderlaufen. Z.B. Step 4 = `'soft-fail'` aber `isExpanded` noch `false` (Bug in Step-4-Logik).

**Empfehlung:** Als primäres Signal `currentRun?.isExpanded` nutzen (da dieses direkt die Datenstruktur beschreibt), nicht `isStep4Done`. Das ist robuster.

---

### ST-4: setManualPrice schreibt auf alle Zeilen oder nur eine?

**Risiko:** Die aktuelle `setManualPrice`-Implementierung schreibt **nur** auf die übergebene `lineId`. Bei einer aggregierten Zeile (`run-abc-line-3`) ist das korrekt — es gibt nur diese eine Zeile. Nach Expansion gibt es aber `run-abc-line-3-0`, `run-abc-line-3-1`, usw. Die RE-Positionen-Sicht summiert/aggregiert diese Zeilen, aber das Badge zeigt immer `representativeLine.priceCheckStatus`.

**Konsequenz:** Wenn nach Step 4 nur `run-abc-line-3-0` auf `custom` gesetzt wird, aber `run-abc-line-3-1` bis `-4` noch auf `mismatch` stehen, zeigt die RE-Positionen-Sicht das Badge der Zeile `-0` (`custom`) — was visuell inkonsistent wirken kann.

**Empfehlung:** Nach Step 4 erfolgt die Preisänderung ausschließlich per Artikelliste auf Einzelzeilen-Ebene (dokumentierter Kompromiss). Die RE-Positionen-Sicht ist nach Step 4 READ-ONLY (Jump-Modus). Das ist KISS-konform und ausreichend dokumentiert.

---

### ST-5: Auto-Resolve von `price-mismatch` Issues (PROJ-21)

**Risiko:** PROJ-21 hat eine Auto-Resolve-Logik für Issues. Das `price-mismatch`-Issue wird bei Step 2 erzeugt. Die Auto-Resolve-Prüfung (Zeile 208 in runStore: `l.priceCheckStatus === 'mismatch'`) prüft zur Laufzeit ob die Bedingung noch gilt.

**Konsequenz:** Wenn `setManualPrice` `priceCheckStatus: 'custom'` setzt, sollte das Issue beim nächsten Auto-Resolve-Durchlauf verschwinden — **aber nur wenn Auto-Resolve aktiv aufgerufen wird**. Es ist zu prüfen, ob `setManualPrice` einen Auto-Resolve-Trigger auslösen muss.

**Empfehlung:** Nach `setManualPrice` explizit `autoResolveIssues(runId)` aufrufen (falls diese Action existiert), oder sicherstellen, dass der Auto-Resolve-Mechanismus reaktiv auf `invoiceLines`-Änderungen läuft.

---

### ST-6: Popup-Positionierung (Popover `align="end"`)

**Risiko:** Das Popover ist mit `align="end"` konfiguriert. In kompakten Tabellenzeilen kann es zu Überlappungen mit Tabellenrändern oder Modals kommen, besonders in schmalen Viewports.

**Empfehlung:** Im Test auf verschiedenen Viewport-Breiten prüfen. Falls Überlappung, `align="center"` oder `side="bottom"` testen.

---

### ST-7: `mismatch` Badge bei `pending` Sage-Preis

**Risiko:** Wenn `unitPriceSage === null` (Step 2 noch nicht durchgelaufen oder Artikel nicht in Sage gefunden), ist der Sage-Button disabled. Der Nutzer kann nur Rechnungspreis oder manuellen Preis wählen. Der Status `missing` zeigt an, dass kein Sage-Preis gefunden wurde — in diesem Fall sollte das Popup trotzdem öffnen und der Nutzer kann den Rechnungspreis bestätigen.

**Empfehlung:** Sicherstellen, dass auch bei `status === 'missing'` und `unitPriceSage === null` das Popup öffnet und der Rechnungspreis-Button aktiv ist.

---

*Ende des ADD-ON Plans. Dieser Plan ist abgestimmt auf `PROJ-22-23-MASTERPLAN.md` und ergänzt Phase B3 (Pop-ups).*
