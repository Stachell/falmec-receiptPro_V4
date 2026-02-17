# PROJ-11: Data-Matching-Update -- Feldstruktur, Matching-Logik & Export-Mapping

## 1. Zusammenfassung

Grundlegende Neustrukturierung der Artikeldaten-Pipeline: neue und umbenannte Tabellenfelder, ein dynamisches 5-Zustands-Checkbox-Feld, konsolidierte Preis-Spalte mit Status-Routing, ein Bestellparser mit Matching- und Fallback-Logik (Jahreszahl+Code), sowie ein neues CSV/XML-Export-Mapping mit 10 definierten Spalten. Betrifft die Steps 1-5 des Run-Workflows und die zentrale `InvoiceLine`-Datenstruktur.

## 2. Motivation

- Die aktuelle Feldstruktur verwendet IT-zentrische Bezeichnungen und trennt Preisinformationen in zwei statische Spalten.
- Es fehlt ein dynamischer Match-Indikator, der den Benutzer sofort zeigt, ob ein Artikel erfolgreich in den Stammdaten gefunden wurde.
- Der Bestellparser existiert noch nicht; Bestellnummern werden bisher manuell oder gar nicht zugeordnet.
- Das Export-Format entspricht nicht dem Ziel-Layout fuer den ERP-Import (Sage).

## 3. Betroffene Bereiche

| Bereich | Dateien (Hauptkandidaten) |
|---|---|
| Datenmodell | `src/types/index.ts` (`InvoiceLine`, `RunStats`, `WorkflowStep`) |
| UI / Tabelle | `src/components/run-detail/ItemsTable.tsx` |
| Workflow / Store | `src/store/runStore.ts` |
| Parsing Steps | `src/services/parslogic/` (Step 2-4 Logik) |
| Export | `src/components/run-detail/ExportPanel.tsx`, Export-Services |
| Neue Komponenten | Checkbox-Icon, Preis-Popup, Details-Popup, Bestellparser |

---

## 4. Anforderungen im Detail

### 4.1 Feldumbenennung und neue Spaltenstruktur

#### 4.1.1 Umbenennung bestehender Felder

| Alter Feldname (UI) | Neuer Feldname (UI) | Interner Key |
|---|---|---|
| "Artikelnummer (IT)" | "Artikel-# (IT)" | `manufacturerArticleNo` (unveraendert) |
| "Beschreibung" | "Bezeichnung (DE)" | `descriptionDE` (Mapping aendert sich, s. 4.1.2) |

#### 4.1.2 Neue Felder

| Feldname (UI) | Interner Key | Typ | Beschreibung |
|---|---|---|---|
| "Artikel-# (DE)" | `falmecArticleNo` | `string \| null` | 5-stellige deutsche Artikelnummer aus Sage-ERP. Wird in Step 2 aus Artikelstammdaten befuellt. |
| "Serial-#" | `serialRequired` | `boolean` | Seriennummernpflicht (ja/nein). Wird in Step 2 aus Artikelstammdaten uebernommen. Anzeige als "ja"/"nein" (deutsch). |
| "Checkbox" | `matchStatus` | `MatchStatus` (Enum, s. 4.2) | Dynamisches Icon-Feld mit 5 Zustaenden. |
| "Details" | -- (UI-only Link) | -- | Link/Button der ein Popup mit allen Artikeldaten oeffnet (s. 4.5). |

#### 4.1.3 Konsolidierte Spalten

**"Preis (Rechnung)" + "Preis (Sage)" --> ein dynamisches Preisfeld**

- In Step 1 wird der Rechnungs-Einzelpreis angezeigt.
- Ab Step 2 wird zusaetzlich der Sage-Preis geladen.
- Anzeige: ein einzelner Preiswert + ein Preis-Status-Badge (s. 4.3).

#### 4.1.4 Neue Spaltenreihenfolge (links nach rechts)

| # | Spalte | Breite-Hinweis |
|---|---|---|
| 1 | **#** (Positionsnummer) | schmal, ~40px |
| 2 | **Checkbox** (Match-Status-Icon) | Icon, ~48px |
| 3 | **Artikel-# (DE)** | mono, ~80px |
| 4 | **Artikel-# (IT)** | mono, ~160px |
| 5 | **EAN** | mono, ~140px |
| 6 | **Bezeichnung (DE)** | flex, min 200px |
| 7 | **Menge** | rechtsbuendig, ~60px |
| 8 | **Preis** (dynamisch mit Status) | rechtsbuendig, ~120px |
| 9 | **Bestellung** | ~120px |
| 10 | **Lagerort** | ~100px |
| 11 | **Serial-#** | ~60px |
| 12 | **Details** | Icon-Link, ~48px |

---

### 4.2 Dynamisches Checkbox-Feld (Match-Status-Icon) -- 5 Zustaende

Neuer Typ:
```typescript
export type MatchStatus = 'pending' | 'full-match' | 'code-it-only' | 'ean-only' | 'no-match';
```

| # | Zustand | UI-Label | Farbe | Bedingung |
|---|---|---|---|---|
| 1 | `pending` | "folgt" | Gelb (#F59E0B) | Default nach Step 1. Matching wurde noch nicht ausgefuehrt. |
| 2 | `full-match` | "match" | Gruen (#22C55E) | Step 2: Sowohl `manufacturerArticleNo` (Artikel-# IT) als auch `ean` wurden in den Artikelstammdaten gefunden. |
| 3 | `code-it-only` | "Code-IT" | Helles Orange (#FB923C) | Step 2: Nur `manufacturerArticleNo` konnte gematcht werden, `ean` nicht gefunden. |
| 4 | `ean-only` | "EAN" | Helles Orange (#FB923C) | Step 2: Nur `ean` konnte gematcht werden, `manufacturerArticleNo` nicht gefunden. |
| 5 | `no-match` | "fail" | Rot (#EF4444) | Step 2: Weder `manufacturerArticleNo` noch `ean` konnten zugeordnet werden. **Schwerer Fehler -- blockierend!** |

**Acceptance Criteria (AC-CHECKBOX):**

- [ ] **AC-CHECKBOX-01**: Nach Step 1 (Rechnung einlesen) steht `matchStatus` jeder InvoiceLine auf `pending`. Die UI zeigt ein gelbes Icon mit Tooltip "folgt".
- [ ] **AC-CHECKBOX-02**: Nach Step 2 (Artikel extrahieren) steht `matchStatus` auf `full-match`, wenn sowohl `manufacturerArticleNo` als auch `ean` in `ArticleMaster` gefunden wurden. Die UI zeigt ein gruenes Icon mit Tooltip "match".
- [ ] **AC-CHECKBOX-03**: `matchStatus` = `code-it-only`, wenn nur `manufacturerArticleNo` in `ArticleMaster` existiert, aber kein passender `ean`-Eintrag. UI: oranges Icon, Label "Code-IT".
- [ ] **AC-CHECKBOX-04**: `matchStatus` = `ean-only`, wenn nur `ean` in `ArticleMaster` existiert, aber kein passender `manufacturerArticleNo`-Eintrag. UI: oranges Icon, Label "EAN".
- [ ] **AC-CHECKBOX-05**: `matchStatus` = `no-match`, wenn weder `manufacturerArticleNo` noch `ean` in `ArticleMaster` vorhanden sind. UI: rotes Icon, Label "fail".
- [ ] **AC-CHECKBOX-06**: Bei `no-match` wird ein Issue vom Typ `blocking` erzeugt, der den Workflow-Fortschritt blockiert.
- [ ] **AC-CHECKBOX-07**: Das Icon ist clickable und zeigt als Tooltip den vollen Zustandstext an.

---

### 4.3 Dynamisches Preisfeld mit Status-Routing

**Konsolidierung von "Preis (Rechnung)" und "Preis (Sage)" zu einer einzigen Spalte.**

Neuer Typ fuer erweiterten Preis-Status:
```typescript
export type PriceCheckStatus = 'pending' | 'ok' | 'mismatch' | 'missing' | 'custom';
```

| Phase | Angezeigter Preis | Status-Badge | Farbe |
|---|---|---|---|
| Nach Step 1 | `unitPriceInvoice` (Rechnungspreis) | "Preis-Check folgt" | Grau |
| Nach Step 2, Preise stimmen ueberein | `unitPriceInvoice` | "OK" | Gruen |
| Nach Step 2, Preise weichen ab | `unitPriceInvoice` | "PRUEFEN" | Gelb |
| Kein Preis auf Rechnung ODER in Artikelliste | -- | "fehlt" | Rot |
| Manuell gesetzter Preis | manueller Wert | "angepasst" | Blau |

**Preis-Popup (bei Klick auf Status-Badge):**

Fuer jeden Artikel eroeffnet ein Popup-Dialog mit 3 Optionen:
1. **Rechnungspreis uebernehmen** (`unitPriceInvoice`)
2. **Sage-Preis (ERP) uebernehmen** (`unitPriceSage`)
3. **Manuell eintragen** -- Freitextfeld fuer Preis, setzt `priceCheckStatus` auf `custom` und zeigt blaues Badge "angepasst".

**Acceptance Criteria (AC-PRICE):**

- [ ] **AC-PRICE-01**: Nach Step 1 zeigt die Preisspalte den Rechnungspreis und das Badge "Preis-Check folgt" in Grau.
- [ ] **AC-PRICE-02**: Nach erfolgreichem Step 2 zeigt die Preisspalte "OK" in Gruen, wenn `unitPriceInvoice` und `unitPriceSage` innerhalb der Toleranz (`RunConfig.tolerance`) uebereinstimmen.
- [ ] **AC-PRICE-03**: Bei Preisabweichung ausserhalb der Toleranz zeigt die Preisspalte "PRUEFEN" in Gelb.
- [ ] **AC-PRICE-04**: Wenn weder `unitPriceInvoice > 0` noch `unitPriceSage > 0` vorhanden ist, zeigt die Preisspalte "fehlt" in Rot.
- [ ] **AC-PRICE-05**: Ein Klick auf das Preis-Status-Badge oeffnet ein Popup mit den 3 Preis-Optionen (Rechnungspreis, Sage-Preis, manuell eintragen).
- [ ] **AC-PRICE-06**: Bei Auswahl "manuell eintragen" kann der User einen Preis eintippen. Nach Bestaetigung wird `priceCheckStatus` auf `custom` gesetzt und das Badge zeigt "angepasst" in Blau.
- [ ] **AC-PRICE-07**: Der Kachel-Counter "Preise checken" zaehlt die Anzahl der Artikel mit `priceCheckStatus !== 'pending'`.

---

### 4.4 Seriennummer-Feld (Serial-#)

**Dynamisches Feld das sich ueber die Steps entwickelt:**

| Phase | Anzeige in "Serial-#" | Quelle |
|---|---|---|
| Nach Step 2 | "ja" oder "nein" | `ArticleMaster.serialRequirement` (true/false) |
| Nach Step 3 | Seriennummer (z.B. "SN12345") oder "nein" | Warenbegleitdatei / SerialList Match |

**Kachel "Seriennummer anfuegen":**
- Nenner: Anzahl der Artikel mit `serialRequired === true`
- Counter: Anzahl der erfolgreich zugeordneten Seriennummern (nach Step 3)

**Acceptance Criteria (AC-SERIAL):**

- [ ] **AC-SERIAL-01**: Nach Step 2 wird `serialRequired` aus `ArticleMaster.serialRequirement` uebernommen und in der Spalte "Serial-#" als "ja" bzw. "nein" dargestellt.
- [ ] **AC-SERIAL-02**: Die Kachel "Seriennummer anfuegen" zeigt als Nenner die Summe aller Artikel mit `serialRequired === true`.
- [ ] **AC-SERIAL-03**: In Step 3 werden Artikel mit `serialRequired === true` anhand von `ean` + `manufacturerArticleNo` in der Warenbegleitdatei (SerialList) gesucht.
- [ ] **AC-SERIAL-04**: Bei Match wird die Seriennummer in `InvoiceLine.serialNumber` eingetragen und in der Spalte "Serial-#" angezeigt.
- [ ] **AC-SERIAL-05**: Der Kachel-Counter zaehlt nur erfolgreich zugeordnete Seriennummern (nicht manuell oder fehlende).
- [ ] **AC-SERIAL-06**: Optional: Eigenes Mini-Checkbox-Icon (5 Zustaende analog 4.2) fuer den Seriennummer-Match pro Zeile.

---

### 4.5 Details-Popup

Ein Link/Icon-Button in der letzten Spalte jeder Zeile, der ein Popup-Dialog oeffnet mit einer vollstaendigen Uebersicht aller Artikeldaten.

**Angezeigte Felder im Popup (Auszug):**

| Feld | Quelle | Beschreibung |
|---|---|---|
| Artikel-# (DE) | `falmecArticleNo` | 5-stellig |
| Artikel-# (IT) | `manufacturerArticleNo` | Herstellernummer |
| EAN | `ean` | Barcode |
| Bezeichnung (DE) | `descriptionDE` | Deutsche Bezeichnung |
| Bezeichnung (IT) | `descriptionIT` | Italienische Bezeichnung |
| Menge | `qty` | Gelieferte Stueckzahl |
| Preis (Rechnung) | `unitPriceInvoice` | Einzelpreis lt. Rechnung |
| Preis (Sage) | `unitPriceSage` | Einzelpreis lt. ERP |
| Lieferant | `supplierId` *(neu)* | 5-stellige Lieferantennummer |
| EK-Vorgang | `orderVorgang` *(neu)* | Vorgangsnummer des Bestellbelegs |
| Bestellmenge (offen) | `orderOpenQty` *(neu)* | Offene Artikel in dieser Bestellung |
| Bestellnummer | `orderNumberAssigned` | Zugewiesene Bestellnummer |
| Seriennummer | `serialNumber` | Zugewiesene Seriennummer |
| Lagerort | `storageLocation` | Zugewiesener Lagerplatz |
| Match-Status | `matchStatus` | Checkbox-Zustand |
| Preis-Status | `priceCheckStatus` | Aktueller Preisstatus |

**Acceptance Criteria (AC-DETAILS):**

- [ ] **AC-DETAILS-01**: Jede Zeile in der Artikelliste hat einen klickbaren "Details"-Link/Icon.
- [ ] **AC-DETAILS-02**: Der Klick oeffnet einen Dialog/Popup mit allen oben gelisteten Feldern.
- [ ] **AC-DETAILS-03**: Felder, die noch nicht befuellt sind (z.B. vor Step 2), werden als "--" oder "noch nicht verfuegbar" angezeigt.

---

### 4.6 Step-Kacheln: Neuordnung und Aktualisierung

Die Kacheln (KPI-Tiles) im RunDetail-Cockpit werden wie folgt definiert:

| # | Kachel-Name | Nenner (Denominator) | Counter (Zaehler) | Wann befuellt |
|---|---|---|---|---|
| 1 | Rechnungspositionen | Anzahl geparster Positionen | = Nenner (bei Erfolg) | Step 1 |
| 2 | Artikel extrahieren | Summe der gelieferten Artikel (qty) | Erfolgreich zugeordnete Artikel | Counter ab Step 2 |
| 3 | Seriennummer anfuegen | Artikel mit `serialRequired === true` | Erfolgreich zugeordnete SN | Step 3 |
| 4 | Preise checken | Summe aller Artikel (Einzelpreise) | Erfolgreich gepruefte Preise | Counter ab Step 2 |
| 5 | Bestellungen mappen | Summe der gelieferten Artikel | Erfolgreich zugeordnete Bestellungen | Step 4 |

**Acceptance Criteria (AC-TILES):**

- [ ] **AC-TILES-01**: Nach Step 1 sind Kachel 1 (Nenner+Counter) und Kachel 2/4/5 (nur Nenner) befuellt. Kachel 3 hat noch keinen Nenner.
- [ ] **AC-TILES-02**: Nach Step 2 werden Counter fuer Kachel 2 und 4 befuellt. Kachel 3 erhaelt ihren Nenner.
- [ ] **AC-TILES-03**: Nach Step 3 wird der Counter fuer Kachel 3 befuellt.
- [ ] **AC-TILES-04**: Nach Step 4 wird der Counter fuer Kachel 5 befuellt.

---

### 4.7 Bestellparser (Step 4) -- Neue Logik

#### 4.7.1 Parsing der Bestelldaten (Excel/OpenWE)

Der Bestellparser durchsucht die hochgeladene Bestelldatei (`openWE`) Zeile fuer Zeile:

1. **Matching-Kriterien:** Suche nach `Artikel-# (IT)` (`manufacturerArticleNo`) und/oder `EAN` in jeder Zeile.
2. **Extrahierte Felder bei Match:**

| Feld | Interner Key | Beschreibung |
|---|---|---|
| Artikel-# (DE) | `falmecArticleNo` | 5-stellige Falmec-Artikelnummer |
| EAN | `ean` | Barcode |
| Jahreszahl | `orderYear` | z.B. 2025, 2026 -- fuer Bestellnummern-Format |
| Bestellnummer | `orderCode` | 5-stellige fortlaufende Nummer (1xxxx) |
| Bestellmenge (offen) | `orderOpenQty` | Offene Artikelmenge in dieser Bestellung |
| EK-Vorgang | `orderVorgang` | Vorgangsnummer des Bestellbelegs |

3. **Zusammengefuehrte Bestellnummer:** Format `{orderYear}-{orderCode}`, Beispiel: `2026-10065`.

> **Wichtig:** Die Jahreszahl und die fortlaufende Nummer sind im Quelldokument getrennt erfasst. Fuer das Parsing muessen sie zusammengefuehrt werden, in der Datenhaltung aber separat bleiben (`orderYear` + `orderCode`).

#### 4.7.2 Matching-Regeln (Prioritaetsreihenfolge)

```
REGEL 1: Exakter Mengen-Match
  WENN Bestellung.orderOpenQty == InvoiceLine.qty
    UND Bestellnummer auf der Rechnung genannt
    UND diese in genau einer offenen Bestellung vorkommt
  DANN --> "MATCH" (erfolgreich)

REGEL 2: Aelteste Bestellung zuerst (Fallback bei Mehrdeutigkeit)
  WENN eine Bestellnummer in MEHREREN offenen Bestellungen existiert
  DANN --> die aelteste Bestellung bevorzugen
  Sortierung:
    1. orderYear aufsteigend (2025 < 2026)
    2. orderCode aufsteigend (10065 < 10066)
  Beispiel: 2025-10065 wird vor 2026-10008 zugeordnet

REGEL 3: Keine Bestellung vorhanden
  WENN weder auf der Rechnung noch in den Bestelldaten eine
       zuordenbare Bestellung gefunden wird
  DANN --> markiere als "keine Bestellung"
  Benutzer-Aktion:
    a) Manuell als "OK" setzen (ohne Bestellnummer), ODER
    b) Bestellung manuell nachtragen:
       - Dropdown fuer Jahreszahl (2024, 2025, 2026, ...)
       - Freitextfeld fuer Bestellnummer (5-stellig, 1xxxx)
       --> Zusammenfuehrung zu "YYYY-NNNNN"
```

#### 4.7.3 Bestellnummer-Format

- **Vollformat:** `{YYYY}-{NNNNN}` (z.B. `2026-10065`)
- **Jahreszahl (`orderYear`):** 4-stellig, aus Quelldatei extrahiert
- **Code (`orderCode`):** 5-stellig, beginnt mit `1`, fortlaufend (z.B. `10065`, `10153`)
- **Fuer Export werden `orderYear` und `orderCode` GETRENNT ausgegeben** (s. 4.9)

**Acceptance Criteria (AC-ORDER):**

- [ ] **AC-ORDER-01**: Der Bestellparser durchsucht die openWE-Datei nach Matches auf `manufacturerArticleNo` und/oder `ean`.
- [ ] **AC-ORDER-02**: Bei exaktem Mengen-Match (`orderOpenQty == qty`) und eindeutiger Bestellnummer wird die Bestellung als "MATCH" zugeordnet.
- [ ] **AC-ORDER-03**: Bei mehreren offenen Bestellungen fuer dieselbe Bestellnummer wird die aelteste Bestellung zuerst zugeordnet (Sortierung: `orderYear` ASC, `orderCode` ASC).
- [ ] **AC-ORDER-04**: Wenn keine Bestellung zuordenbar ist, wird die Zeile als "keine Bestellung" markiert.
- [ ] **AC-ORDER-05**: Der Benutzer kann eine Zeile ohne Bestellung manuell als "OK" setzen.
- [ ] **AC-ORDER-06**: Der Benutzer kann eine Bestellung manuell nachtragen: Dropdown fuer Jahreszahl + Freitextfeld fuer 5-stelligen Code. Die zusammengefuehrte Bestellnummer `YYYY-NNNNN` wird gespeichert.
- [ ] **AC-ORDER-07**: Die Bestellnummer wird intern in zwei Feldern gespeichert: `orderYear` (number) und `orderCode` (string, 5-stellig).
- [ ] **AC-ORDER-08**: Die Kachel "Bestellungen mappen" zaehlt alle erfolgreich zugeordneten Bestellungen (Counter) gegen die Gesamtzahl der Artikel (Nenner).

---

### 4.8 Aufloesen der Rechnungspositionen zu Einzelartikeln (Invoiceline-Expansion)

**Kernregel:** Jede Rechnungsposition mit `qty > 1` wird in der Artikelliste zu `qty` einzelnen Eintraegen aufgeloest.

Beispiel:
```
Rechnungsposition:  4 Stk | CLVI20.E0P7#ZZZF461F | 8034122477183 | Bezeichnung | 865,00 | 3.460,00

-->  Artikelliste (4 Eintraege):
  Zeile 1: CLVI20.E0P7#ZZZF461F | 8034122477183 | Bezeichnung | 1 | 865,00
  Zeile 2: CLVI20.E0P7#ZZZF461F | 8034122477183 | Bezeichnung | 1 | 865,00
  Zeile 3: CLVI20.E0P7#ZZZF461F | 8034122477183 | Bezeichnung | 1 | 865,00
  Zeile 4: CLVI20.E0P7#ZZZF461F | 8034122477183 | Bezeichnung | 1 | 865,00
```

- Die expandierten Zeilen behalten die Verbindung zur Ursprungs-Rechnungsposition (`positionIndex`).
- Jeder Einzelartikel erhaelt eine eigene `lineId` und kann individuell eine Bestellnummer, Seriennummer und einen Lagerort zugewiesen bekommen.
- In der UI sollen zusammengehoerige Artikel visuell gruppiert bleiben (z.B. durch abwechselnde Hintergrundfarben oder einen Gruppenrahmen).

**Acceptance Criteria (AC-EXPAND):**

- [ ] **AC-EXPAND-01**: Eine Rechnungsposition mit `qty = N` erzeugt genau N Eintraege in der Artikelliste, jeweils mit `qty = 1` und `unitPrice` des Originals.
- [ ] **AC-EXPAND-02**: Jeder expandierte Eintrag hat eine eigene `lineId` aber denselben `positionIndex`.
- [ ] **AC-EXPAND-03**: Expandierte Eintraege sind in der UI visuell als zusammengehoerig erkennbar.
- [ ] **AC-EXPAND-04**: Jeder Einzelartikel kann individuell eine Bestellnummer, Seriennummer und Lagerort erhalten.

---

### 4.9 Export-Mapping (Step 5: CSV/XML)

**Jeder Artikel = eine Zeile. Keine Mengenangabe -- die Aufloesung geschieht durch die Expansion (s. 4.8).**

| # | Spaltenname (Export-Header) | Quelle (InvoiceLine-Feld) | Beschreibung |
|---|---|---|---|
| 1 | `Artikel-# (DE)` | `falmecArticleNo` | 5-stellige Falmec-Artikelnummer |
| 2 | `Artikel-# (IT)` | `manufacturerArticleNo` | Hersteller-Artikelnummer |
| 3 | `EAN` | `ean` | EAN/Barcode |
| 4 | `Beschreibung (DE)` | `descriptionDE` | Deutsche Artikelbezeichnung |
| 5 | `Bestellnummer_JAHR` | `orderYear` | Jahreszahl der Bestellung (z.B. 2026) |
| 6 | `Bestellnummer_CODE` | `orderCode` | 5-stelliger Bestellcode (z.B. 10065) |
| 7 | `Vorgangsnummer Order` | `orderVorgang` | EK-Vorgangsnummer |
| 8 | `Seriennummer` | `serialNumber` | Zugewiesene Seriennummer (leer wenn keine) |
| 9 | `Lagerplatz` | `storageLocation` | Zugewiesener Lagerort |
| 10 | `Preis` | dynamisch (s. 4.3) | Der final gesetzte Preis (Rechnung, Sage oder manuell) |

> **Hinweis:** Spalte 10 (Preis) ist nicht in der Originalanforderung explizit als 10. Spalte aufgefuehrt, folgt aber logisch aus der Preiskonsolidierung. Falls nicht gewuenscht, kann sie entfallen -- **Klaerungsbedarf.**

**Acceptance Criteria (AC-EXPORT):**

- [ ] **AC-EXPORT-01**: Die Export-Datei (CSV oder XML) enthaelt genau die 10 definierten Spalten in der angegebenen Reihenfolge.
- [ ] **AC-EXPORT-02**: Jede Zeile repraesentiert einen einzelnen Artikel (keine Mengen-Spalte, Expansion bereits geschehen).
- [ ] **AC-EXPORT-03**: `Bestellnummer_JAHR` und `Bestellnummer_CODE` werden als getrennte Spalten exportiert (nicht zusammengefuehrt).
- [ ] **AC-EXPORT-04**: CSV verwendet Semikolon (`;`) als Trennzeichen und UTF-8 mit BOM.
- [ ] **AC-EXPORT-05**: XML folgt dem bestehenden Sage100-Import-Schema (zu pruefen gegen PROJ-7).
- [ ] **AC-EXPORT-06**: Die Export-Spaltenheader sind exakt wie in der Tabelle oben definiert.

---

## 5. Datenmodell-Aenderungen

### 5.1 Erweiterung `InvoiceLine`

```typescript
export type MatchStatus = 'pending' | 'full-match' | 'code-it-only' | 'ean-only' | 'no-match';
export type PriceCheckStatus = 'pending' | 'ok' | 'mismatch' | 'missing' | 'custom';

export interface InvoiceLine {
  lineId: string;
  positionIndex: number;           // Referenz zur Ursprungs-Rechnungsposition
  manufacturerArticleNo: string;   // Artikel-# (IT)
  ean: string;
  descriptionIT: string;           // Originalbezeichnung (IT)
  descriptionDE: string | null;    // Bezeichnung (DE) -- aus Artikelstamm
  qty: number;                     // nach Expansion immer 1
  unitPriceInvoice: number;
  totalLineAmount: number;
  falmecArticleNo: string | null;  // Artikel-# (DE) -- 5-stellig, aus Artikelstamm

  // Match-Status (Checkbox)
  matchStatus: MatchStatus;

  // Seriennummer
  serialRequired: boolean;         // aus ArticleMaster.serialRequirement
  serialNumber: string | null;
  serialSource: SerialSource;

  // Preis
  unitPriceSage: number | null;
  unitPriceFinal: number | null;   // NEU: der final gesetzte Preis
  priceCheckStatus: PriceCheckStatus;

  // Bestellung
  orderNumberAssigned: string | null;  // Vollformat "YYYY-NNNNN"
  orderYear: number | null;            // NEU: Jahreszahl separat
  orderCode: string | null;            // NEU: 5-stelliger Code separat
  orderVorgang: string | null;         // NEU: EK-Vorgangsnummer
  orderOpenQty: number | null;         // NEU: Offene Bestellmenge
  orderAssignmentReason: OrderAssignmentReason;

  // Weitere Stammdaten
  supplierId: string | null;           // NEU: 5-stellige Lieferantennummer
  activeFlag: boolean;
  storageLocation: string | null;
}
```

### 5.2 Erweiterung `OrderAssignmentReason`

```typescript
export type OrderAssignmentReason =
  | 'direct-match'      // Bestellnummer + Menge stimmen exakt
  | 'exact-qty-match'   // Mengen-Match
  | 'oldest-first'      // Aelteste Bestellung bei Mehrdeutigkeit
  | 'manual'            // Manuell nachgetragen
  | 'manual-ok'         // NEU: Manuell als "OK" ohne Bestellnummer gesetzt
  | 'not-ordered'       // Keine Bestellung gefunden
  | 'pending';          // Noch nicht zugeordnet
```

---

## 6. Edge Cases und Fehlerbehandlung

### 6.1 Checkbox / Matching

| Edge Case | Erwartetes Verhalten |
|---|---|
| Artikel-# (IT) ist leer/fehlend auf Rechnung | Nur EAN-Match versuchen. Wenn EAN auch fehlt --> `no-match`. |
| EAN ist leer/fehlend auf Rechnung | Nur Artikel-# (IT) Match versuchen. |
| Artikel existiert mehrfach in ArticleMaster mit unterschiedlichen EANs | Erster Match zaehlt. Issue als Warning erzeugen. |
| ArticleMaster-Datei wurde nicht hochgeladen | Step 2 ist nicht ausfuehrbar. Alle Artikel bleiben auf `pending`. |

### 6.2 Preise

| Edge Case | Erwartetes Verhalten |
|---|---|
| Rechnungspreis = 0 | Status "fehlt" (Rot). |
| Sage-Preis nicht vorhanden (kein Match in Artikelstamm) | Status "fehlt" (Rot) fuer Sage-Preis-Teil. |
| Manueller Preis = 0 | Erlaubt (z.B. Gratisartikel/Muster). Status "angepasst" (Blau). |
| Toleranz-Grenze exakt getroffen | Gilt als "OK" (inklusive Grenzen). |

### 6.3 Bestellungen

| Edge Case | Erwartetes Verhalten |
|---|---|
| Gleiche Bestellnummer, gleiches Jahr, verschiedene Artikel | Jeder Artikel wird separat gematcht. |
| Bestellung mit offener Menge < gelieferte Menge | Teilmatch: N Artikel dieser Bestellung zuordnen, Rest als "keine Bestellung". |
| Bestellnummer im falschen Format (nicht 5-stellig, nicht mit 1 beginnend) | Warnung erzeugen, trotzdem verarbeiten. |
| Manuell nachgetragene Bestellnummer bereits einer anderen Zeile zugeordnet | Erlaubt (eine Bestellung kann mehrere Artikel abdecken). |
| openWE-Datei nicht hochgeladen | Step 4 nicht ausfuehrbar. Alle Bestellungen bleiben auf `pending`. |

### 6.4 Expansion

| Edge Case | Erwartetes Verhalten |
|---|---|
| Rechnungsposition mit qty = 0 | Keine Expansion, Position wird als Warnung geloggt. |
| Rechnungsposition mit qty = 1 | Genau ein Eintrag, keine sichtbare Expansion noetig. |
| Sehr grosse Menge (z.B. qty = 200) | 200 Einzeleintraege erzeugen. Performance-Warnung bei qty > 50. |

### 6.5 Export

| Edge Case | Erwartetes Verhalten |
|---|---|
| Artikel ohne Bestellnummer (manuell "OK") | `Bestellnummer_JAHR` und `Bestellnummer_CODE` bleiben leer. |
| Artikel ohne Seriennummer trotz `serialRequired = true` | Export trotzdem moeglich, aber Warning im Issue-Center. |
| Artikel mit `matchStatus = no-match` | Export blockiert! Alle `no-match` muessen vorher geloest werden. |

---

## 7. Offene Klaerungspunkte

| # | Frage | Kontext |
|---|---|---|
| 1 | Soll die 10. Export-Spalte "Preis" enthalten sein oder nur 9 Spalten? | Originalanforderung listet 9 Spalten (1-9 ohne Preis). Logisch waere Preis als 10. Spalte. |
| 2 | Wie wird der Lagerort in Step 2 eingetragen? Manuell oder automatisch aus Artikelstamm? | Anforderung sagt "in der InvoiceLine kann der Lagerort eingetragen werden". |
| 3 | Welche Felder genau soll das Details-Popup anzeigen? | Anforderung gibt Beispiele aber keine abschliessende Liste. |
| 4 | Soll die Checkbox auch in Step 3 (Seriennummern) einen eigenen 5-Zustands-Indikator bekommen? | Anforderung sagt "vielleicht". |
| 5 | Wie wird mit der `activeFlag`-Pruefung umgegangen? Bleibt das bestehende Verhalten oder wird es durch `matchStatus` ersetzt? | Aktuell erzeugt `activeFlag = false` ein Issue. |

---

## 8. Abhaengigkeiten

| Von Feature | Abhaengigkeit | Art |
|---|---|---|
| PROJ-4 (Invoice Parsing) | Step 1 Parsing muss die neuen Felder (`matchStatus: 'pending'`, expandierte Zeilen) erzeugen | Erweiterung |
| PROJ-7 (Export) | Export-Mapping muss komplett ersetzt werden (10 Spalten statt bisheriges Format) | Breaking Change |
| PROJ-2 (File Upload) | openWE-Datei muss die neuen Bestellfelder (`orderYear`, `orderCode`, `orderVorgang`) enthalten | Erweiterung |
| PROJ-3 (Workflow Cockpit) | Kacheln muessen angepasst werden (Reihenfolge, Nenner/Counter-Logik) | Erweiterung |
| PROJ-5 (Issues) | Neue Issue-Typen fuer `no-match` (blocking) und Preis/Bestell-Warnungen | Erweiterung |
| PROJ-6 (Warehouse) | Lagerort-Zuweisung bleibt bestehen, wird aber frueher im Flow moeglich (ab Step 2) | Verschiebung |

---

## 9. Umsetzungsvorschlag (Implementation Outline)

### Phase A: Datenmodell + Feldumbenennung
1. `InvoiceLine`-Interface erweitern (neue Felder, neue Typen)
2. `ItemsTable.tsx` Spaltenreihenfolge und Labels anpassen
3. Checkbox-Icon-Komponente erstellen (5 Zustaende)
4. Preis-Spalte konsolidieren, Preis-Popup erstellen

### Phase B: Step 1 + Step 2 Anpassung
5. Step 1: Expansion (`qty > 1` --> N Einzelzeilen) implementieren
6. Step 2: Artikelstamm-Matching mit MatchStatus-Logik
7. Step 2: Preis-Check-Logik und Counter

### Phase C: Step 3 + Step 4 (Bestellparser)
8. Step 3: Seriennummern-Zuordnung anpassen (Serial-# Feld)
9. Step 4: Bestellparser komplett neu implementieren
10. Step 4: Matching-Regeln (Exakt, Aelteste-zuerst, Fallback)
11. Step 4: Manuelle Bestellzuordnung UI

### Phase D: Export + Details
12. Details-Popup implementieren
13. Export-Mapping auf 10 Spalten umstellen
14. Kacheln/KPIs anpassen

### Phase E: QA + Edge Cases
15. Unit Tests fuer Matching-Logik
16. Unit Tests fuer Bestellparser
17. E2E-Pruefung mit Beispiel-PDFs

---

## 10. Technical Design

Dieses Kapitel beschreibt die konkrete technische Umsetzung der in Kapitel 4-9 definierten Anforderungen. Es dient als Referenz fuer die Implementierung und deckt vier Kernbereiche ab: Datenmodell, Komponenten-Architektur, Business Logic & Store sowie Export-Strategie.

### 10.1 Datenmodell-Update (`src/types/index.ts`)

#### 10.1.1 Neue und erweiterte Typen

```typescript
// --- Neue Typen ---

export type MatchStatus =
  | 'pending'        // Default nach Step 1
  | 'full-match'     // Artikel-# IT + EAN gefunden
  | 'code-it-only'   // nur Artikel-# IT gefunden
  | 'ean-only'       // nur EAN gefunden
  | 'no-match';      // nichts gefunden → blocking

// --- Erweiterte Typen (bestehende ersetzen) ---

export type PriceCheckStatus =
  | 'pending'    // vor Step 2
  | 'ok'         // Preise stimmen ueberein (innerhalb Toleranz)
  | 'mismatch'   // Preisabweichung
  | 'missing'    // NEU: kein Preis vorhanden (Rechnung oder Sage)
  | 'custom';    // NEU: manuell gesetzter Preis

export type OrderAssignmentReason =
  | 'direct-match'
  | 'exact-qty-match'
  | 'oldest-first'
  | 'manual'
  | 'manual-ok'      // NEU: manuell als OK ohne Bestellnummer
  | 'not-ordered'
  | 'pending';

export type IssueType =
  | 'order-assignment'
  | 'serial-mismatch'
  | 'price-mismatch'
  | 'inactive-article'
  | 'missing-storage-location'
  | 'missing-ean'
  | 'parser-error'
  | 'no-article-match'      // NEU: matchStatus === 'no-match'
  | 'price-missing'         // NEU: priceCheckStatus === 'missing'
  | 'order-no-match';       // NEU: keine Bestellung zuordenbar
```

#### 10.1.2 Erweitertes `InvoiceLine`-Interface

Gegenueber dem bestehenden Interface (`src/types/index.ts:103-121`) kommen 7 neue Felder hinzu. Das `positionIndex`-Feld existiert bereits auf `ParsedInvoiceLineExtended` und wird jetzt auf `InvoiceLine` uebernommen. `expansionIndex` ist komplett neu.

```typescript
export interface InvoiceLine {
  // --- bestehende Felder (unveraendert) ---
  lineId: string;
  manufacturerArticleNo: string;
  ean: string;
  descriptionIT: string;
  qty: number;                         // nach Expansion immer 1
  unitPriceInvoice: number;
  totalLineAmount: number;
  orderNumberAssigned: string | null;
  orderAssignmentReason: OrderAssignmentReason;
  serialNumber: string | null;
  serialSource: SerialSource;
  falmecArticleNo: string | null;
  descriptionDE: string | null;
  storageLocation: string | null;
  unitPriceSage: number | null;
  activeFlag: boolean;
  priceCheckStatus: PriceCheckStatus;

  // --- NEU: Positions-Tracking ---
  positionIndex: number;               // Referenz zur Ursprungs-Rechnungsposition (0-basiert)
  expansionIndex: number;              // 0-basierter Index innerhalb der Expansion (0..qty-1)

  // --- NEU: Match-Status ---
  matchStatus: MatchStatus;            // 5-Zustaende, default 'pending'

  // --- NEU: Seriennummer-Pflicht ---
  serialRequired: boolean;             // aus ArticleMaster.serialRequirement

  // --- NEU: Final-Preis ---
  unitPriceFinal: number | null;       // der fuer Export gesetzte Preis

  // --- NEU: Bestelldaten (aus openWE) ---
  orderYear: number | null;            // Jahreszahl, z.B. 2026
  orderCode: string | null;            // 5-stelliger Code, z.B. "10065"
  orderVorgang: string | null;         // EK-Vorgangsnummer
  orderOpenQty: number | null;         // Offene Bestellmenge

  // --- NEU: Lieferant ---
  supplierId: string | null;           // 5-stellige Lieferantennummer
}
```

**LineId-Schema nach Expansion:**

```
{runId}-line-{positionIndex}-{expansionIndex}
```

Beispiel: Rechnungsposition 3 mit qty=4 erzeugt:
- `run_abc-line-3-0`
- `run_abc-line-3-1`
- `run_abc-line-3-2`
- `run_abc-line-3-3`

Das bisherige Schema `{runId}-line-{positionIndex}` (ohne expansionIndex) wird durch die Expansion abgeloest.

#### 10.1.3 Erweitertes `RunStats`-Interface

```typescript
export interface RunStats {
  // --- bestehende Felder ---
  parsedInvoiceLines: number;         // Rechnungspositionen (vor Expansion)
  matchedOrders: number;
  notOrderedCount: number;
  serialMatchedCount: number;
  mismatchedGroupsCount: number;
  articleMatchedCount: number;
  inactiveArticlesCount: number;
  priceOkCount: number;
  priceMismatchCount: number;
  exportReady: boolean;

  // --- NEU ---
  expandedLineCount: number;          // Gesamtzahl Zeilen nach Expansion (Nenner fuer Kacheln 2/4/5)
  fullMatchCount: number;             // matchStatus === 'full-match'
  codeItOnlyCount: number;            // matchStatus === 'code-it-only'
  eanOnlyCount: number;               // matchStatus === 'ean-only'
  noMatchCount: number;               // matchStatus === 'no-match' (blocking)
  serialRequiredCount: number;        // Anzahl Zeilen mit serialRequired === true (Nenner Kachel 3)
  priceMissingCount: number;          // priceCheckStatus === 'missing'
  priceCustomCount: number;           // priceCheckStatus === 'custom'
  manualOkOrderCount: number;         // orderAssignmentReason === 'manual-ok'
}
```

#### 10.1.4 Migration bestehender localStorage-Daten

Bestehende `InvoiceLine`-Objekte im localStorage haben die neuen Felder nicht. Beim Laden werden Defaults gesetzt:

```typescript
function migrateInvoiceLine(line: Partial<InvoiceLine>): InvoiceLine {
  return {
    ...line,
    positionIndex: line.positionIndex ?? 0,
    expansionIndex: line.expansionIndex ?? 0,
    matchStatus: line.matchStatus ?? 'pending',
    serialRequired: line.serialRequired ?? false,
    unitPriceFinal: line.unitPriceFinal ?? null,
    orderYear: line.orderYear ?? null,
    orderCode: line.orderCode ?? null,
    orderVorgang: line.orderVorgang ?? null,
    orderOpenQty: line.orderOpenQty ?? null,
    supplierId: line.supplierId ?? null,
  } as InvoiceLine;
}
```

Die Migration wird in `runStore.ts` beim Laden aus localStorage angewendet (`loadPersistedInvoiceLines()`).

---

### 10.2 Komponenten-Architektur

#### 10.2.1 `StatusCheckbox` (NEU: `src/components/run-detail/StatusCheckbox.tsx`)

**Zweck:** Rendert ein Icon mit Tooltip fuer die 5 `MatchStatus`-Zustaende.

**Props:**
```typescript
interface StatusCheckboxProps {
  status: MatchStatus;
  onClick?: () => void;   // optional: oeffnet Details-Popup
}
```

**Icon-Mapping (lucide-react):**

| MatchStatus | Icon | Farbe | Tooltip |
|---|---|---|---|
| `pending` | `Clock` | `#F59E0B` (amber-500) | "folgt" |
| `full-match` | `CheckCircle2` | `#22C55E` (green-500) | "match" |
| `code-it-only` | `AlertTriangle` | `#FB923C` (orange-400) | "Code-IT" |
| `ean-only` | `AlertTriangle` | `#FB923C` (orange-400) | "EAN" |
| `no-match` | `XCircle` | `#EF4444` (red-500) | "fail" |

**Abhaengigkeiten:**
- `src/components/ui/tooltip.tsx` (bestehende shadcn Tooltip-Primitive)
- `lucide-react` (bereits im Projekt)

**Rendering-Logik:**
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button className="..." onClick={onClick}>
      <Icon className="h-5 w-5" style={{ color }} />
    </button>
  </TooltipTrigger>
  <TooltipContent>{label}</TooltipContent>
</Tooltip>
```

#### 10.2.2 `PriceCell` (NEU: `src/components/run-detail/PriceCell.tsx`)

**Zweck:** Zeigt den konsolidierten Preis + Status-Badge + Popover mit 3 Optionen.

**Props:**
```typescript
interface PriceCellProps {
  line: InvoiceLine;
  onSetPrice: (lineId: string, price: number, source: 'invoice' | 'sage' | 'custom') => void;
}
```

**Badge-Mapping:**

| PriceCheckStatus | Badge-Text | Badge-Farbe (Tailwind) |
|---|---|---|
| `pending` | "Preis-Check folgt" | `bg-gray-100 text-gray-600` |
| `ok` | "OK" | `bg-green-100 text-green-700` |
| `mismatch` | "PRUEFEN" | `bg-yellow-100 text-yellow-700` |
| `missing` | "fehlt" | `bg-red-100 text-red-700` |
| `custom` | "angepasst" | `bg-blue-100 text-blue-700` |

**Popover-Inhalt (3 Optionen):**
1. **Rechnungspreis uebernehmen** - Button, setzt `unitPriceFinal = unitPriceInvoice`
2. **Sage-Preis uebernehmen** - Button (disabled wenn `unitPriceSage === null`), setzt `unitPriceFinal = unitPriceSage`
3. **Manuell eintragen** - Input + Bestaetigen-Button, setzt `unitPriceFinal = manueller Wert`, `priceCheckStatus = 'custom'`

**Abhaengigkeiten:**
- `src/components/ui/popover.tsx` (bestehende shadcn Popover-Primitive)
- `src/components/ui/button.tsx`
- `src/components/ui/input.tsx`

#### 10.2.3 `DetailPopup` (NEU: `src/components/run-detail/DetailPopup.tsx`)

**Zweck:** Dialog mit allen 16 Feldern einer InvoiceLine (s. Abschnitt 4.5).

**Props:**
```typescript
interface DetailPopupProps {
  line: InvoiceLine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

**Layout:** 2-Spalten-Grid innerhalb eines shadcn `Dialog`. Jedes Feld wird als Label + Wert dargestellt. Felder ohne Wert zeigen "--".

**Feld-Reihenfolge im Dialog:**

| # | Label | Feld | Formatierung |
|---|---|---|---|
| 1 | Artikel-# (DE) | `falmecArticleNo` | mono |
| 2 | Artikel-# (IT) | `manufacturerArticleNo` | mono |
| 3 | EAN | `ean` | mono |
| 4 | Bezeichnung (DE) | `descriptionDE` | -- |
| 5 | Bezeichnung (IT) | `descriptionIT` | -- |
| 6 | Menge | `qty` | rechtsbuendig |
| 7 | Preis (Rechnung) | `unitPriceInvoice` | EUR-Format |
| 8 | Preis (Sage) | `unitPriceSage` | EUR-Format oder "--" |
| 9 | Preis (Final) | `unitPriceFinal` | EUR-Format oder "--" |
| 10 | Lieferant | `supplierId` | mono |
| 11 | EK-Vorgang | `orderVorgang` | -- |
| 12 | Bestellmenge (offen) | `orderOpenQty` | rechtsbuendig |
| 13 | Bestellnummer | `orderNumberAssigned` | Format YYYY-NNNNN |
| 14 | Seriennummer | `serialNumber` | -- |
| 15 | Lagerort | `storageLocation` | -- |
| 16 | Match-Status | `matchStatus` | StatusCheckbox-Icon inline |
| 17 | Preis-Status | `priceCheckStatus` | Badge inline |

**Abhaengigkeiten:**
- `src/components/ui/dialog.tsx` (bestehende shadcn Dialog-Primitive)

#### 10.2.4 `ItemsTable` Restructuring (`src/components/run-detail/ItemsTable.tsx`)

**Aenderungen:**
1. **12 Spalten** in neuer Reihenfolge (s. Abschnitt 4.1.4)
2. **Visuelle Gruppierung** fuer expandierte Zeilen: abwechselnde Hintergrundfarbe pro `positionIndex` (gerade = `bg-white`, ungerade = `bg-slate-50`)
3. **Neue Zell-Komponenten** einbinden: `StatusCheckbox` (Spalte 2), `PriceCell` (Spalte 8), `DetailPopup`-Trigger (Spalte 12)
4. **Spaltenbreiten** gemaess Abschnitt 4.1.4

**Spalten-Definition (Pseudo-Code):**

```typescript
const columns = [
  { key: 'positionIndex',          header: '#',               width: '40px',  align: 'center' },
  { key: 'matchStatus',            header: 'Checkbox',        width: '48px',  component: StatusCheckbox },
  { key: 'falmecArticleNo',        header: 'Artikel-# (DE)', width: '80px',  className: 'font-mono' },
  { key: 'manufacturerArticleNo',  header: 'Artikel-# (IT)', width: '160px', className: 'font-mono' },
  { key: 'ean',                    header: 'EAN',             width: '140px', className: 'font-mono' },
  { key: 'descriptionDE',          header: 'Bezeichnung (DE)', width: 'auto', minWidth: '200px' },
  { key: 'qty',                    header: 'Menge',           width: '60px',  align: 'right' },
  { key: 'price',                  header: 'Preis',           width: '120px', component: PriceCell },
  { key: 'orderNumberAssigned',    header: 'Bestellung',      width: '120px' },
  { key: 'storageLocation',        header: 'Lagerort',        width: '100px' },
  { key: 'serialRequired',         header: 'Serial-#',        width: '60px',  format: boolToJaNein },
  { key: 'details',                header: 'Details',         width: '48px',  component: DetailPopupTrigger },
];
```

---

### 10.3 Business Logic & Store

#### 10.3.1 Invoiceline-Expansion (`src/services/invoiceParserService.ts`)

**Neue Funktion `expandInvoiceLines()`** ersetzt die bestehende `convertToInvoiceLines()` (Zeile 115-138).

```typescript
/**
 * Expand parsed invoice lines: each position with qty=N becomes N individual lines with qty=1.
 * Replaces convertToInvoiceLines().
 */
export function expandInvoiceLines(
  parsedLines: ParsedInvoiceLine[],
  runId: string
): InvoiceLine[] {
  const expanded: InvoiceLine[] = [];

  for (const parsed of parsedLines) {
    const qty = parsed.quantityDelivered;

    // Edge case: qty <= 0 → skip with warning (handled by caller)
    if (qty <= 0) continue;

    for (let i = 0; i < qty; i++) {
      expanded.push({
        lineId: `${runId}-line-${parsed.positionIndex}-${i}`,
        positionIndex: parsed.positionIndex,
        expansionIndex: i,
        manufacturerArticleNo: parsed.manufacturerArticleNo,
        ean: parsed.ean,
        descriptionIT: parsed.descriptionIT,
        qty: 1,                          // immer 1 nach Expansion
        unitPriceInvoice: parsed.unitPrice,
        totalLineAmount: parsed.unitPrice, // qty=1 → total = unit
        orderNumberAssigned: null,         // Expansion loescht directe Zuordnung
        orderAssignmentReason: 'pending',
        serialNumber: null,
        serialSource: 'none',
        falmecArticleNo: null,
        descriptionDE: null,
        storageLocation: null,
        unitPriceSage: null,
        unitPriceFinal: null,
        activeFlag: true,
        priceCheckStatus: 'pending',
        matchStatus: 'pending',
        serialRequired: false,
        orderYear: null,
        orderCode: null,
        orderVorgang: null,
        orderOpenQty: null,
        supplierId: null,
      });
    }
  }

  return expanded;
}
```

**Auswirkung auf Store:** In `runStore.ts` Zeile 721 wird `convertToInvoiceLines(result.lines, runId)` durch `expandInvoiceLines(result.lines, runId)` ersetzt. Der Import (Zeile 23) wird entsprechend angepasst.

#### 10.3.2 `ArticleMatcher` (NEU: `src/services/matching/ArticleMatcher.ts`)

**Zweck:** Stateless Service-Klasse, die InvoiceLines gegen ArticleMaster[] matcht und MatchStatus + Stammdaten setzt.

```typescript
import { InvoiceLine, ArticleMaster, MatchStatus, PriceCheckStatus } from '@/types';

export interface ArticleMatchResult {
  matchStatus: MatchStatus;
  falmecArticleNo: string | null;
  descriptionDE: string | null;       // aus ArticleMaster (falls vorhanden)
  unitPriceSage: number | null;
  serialRequired: boolean;
  activeFlag: boolean;
  storageLocation: string | null;
  supplierId: string | null;          // aus dem zugeordneten Artikel
  priceCheckStatus: PriceCheckStatus;
  unitPriceFinal: number | null;
}

export function matchArticle(
  line: InvoiceLine,
  articles: ArticleMaster[],
  tolerance: number
): ArticleMatchResult {
  // 1. Suche nach manufacturerArticleNo
  const byCode = articles.find(
    a => a.manufacturerArticleNo === line.manufacturerArticleNo
  );

  // 2. Suche nach EAN
  const byEan = articles.find(a => a.ean === line.ean);

  // 3. MatchStatus bestimmen
  let matchStatus: MatchStatus;
  let matchedArticle: ArticleMaster | null = null;

  if (byCode && byEan) {
    matchStatus = 'full-match';
    matchedArticle = byCode;   // Code-Match hat Prioritaet
  } else if (byCode) {
    matchStatus = 'code-it-only';
    matchedArticle = byCode;
  } else if (byEan) {
    matchStatus = 'ean-only';
    matchedArticle = byEan;
  } else {
    matchStatus = 'no-match';
  }

  // 4. Stammdaten uebernehmen
  if (!matchedArticle) {
    return {
      matchStatus,
      falmecArticleNo: null,
      descriptionDE: null,
      unitPriceSage: null,
      serialRequired: false,
      activeFlag: true,
      storageLocation: null,
      supplierId: null,
      priceCheckStatus: 'missing',
      unitPriceFinal: null,
    };
  }

  // 5. Preis-Check
  const pcs = checkPrice(line.unitPriceInvoice, matchedArticle.unitPriceNet, tolerance);

  return {
    matchStatus,
    falmecArticleNo: matchedArticle.falmecArticleNo,
    descriptionDE: null,   // ArticleMaster hat kein descriptionDE → spaeter erweiterbar
    unitPriceSage: matchedArticle.unitPriceNet,
    serialRequired: matchedArticle.serialRequirement,
    activeFlag: matchedArticle.activeFlag,
    storageLocation: matchedArticle.storageLocation,
    supplierId: null,      // aus OpenWE, nicht ArticleMaster
    priceCheckStatus: pcs,
    unitPriceFinal: pcs === 'ok' ? line.unitPriceInvoice : null,
  };
}

/**
 * Preis-Check mit Toleranz (inklusive Grenzen).
 */
export function checkPrice(
  invoicePrice: number,
  sagePrice: number,
  tolerance: number
): PriceCheckStatus {
  if (invoicePrice <= 0 || sagePrice <= 0) return 'missing';
  const diff = Math.abs(invoicePrice - sagePrice);
  return diff <= tolerance ? 'ok' : 'mismatch';
}

/**
 * Batch-Matching: alle Lines gegen ArticleMaster.
 */
export function matchAllArticles(
  lines: InvoiceLine[],
  articles: ArticleMaster[],
  tolerance: number
): InvoiceLine[] {
  return lines.map(line => {
    const result = matchArticle(line, articles, tolerance);
    return { ...line, ...result };
  });
}
```

#### 10.3.3 `OrderMatcher` (NEU: `src/services/matching/OrderMatcher.ts`)

**Zweck:** 3-Regel-Prioritaetssystem fuer Bestellzuordnung. Trackt verbrauchte Mengen ueber expandierte Zeilen hinweg.

```typescript
import { InvoiceLine, OpenWEPosition, OrderAssignmentReason } from '@/types';

export interface OrderMatchResult {
  orderNumberAssigned: string | null;   // Format "YYYY-NNNNN"
  orderYear: number | null;
  orderCode: string | null;
  orderVorgang: string | null;
  orderOpenQty: number | null;
  supplierId: string | null;
  orderAssignmentReason: OrderAssignmentReason;
}

/**
 * Match expanded invoice lines against open order positions.
 * Consumes quantities across lines sharing the same positionIndex.
 *
 * Rules (priority order):
 *   1. Exact qty match: orderOpenQty matches remaining lines for this article
 *   2. Oldest first: sort by orderYear ASC, orderCode ASC
 *   3. No match: mark as 'not-ordered'
 */
export function matchAllOrders(
  lines: InvoiceLine[],
  openPositions: OpenWEPosition[]
): InvoiceLine[] {
  // Build consumption tracker: Map<positionKey, remainingQty>
  const consumed = new Map<string, number>();  // key = OpenWEPosition.id → consumed qty

  // Group lines by manufacturerArticleNo for batch processing
  const result = [...lines];

  for (let i = 0; i < result.length; i++) {
    const line = result[i];
    if (line.orderAssignmentReason !== 'pending') continue;

    // Find matching open positions for this article
    const candidates = openPositions
      .filter(op =>
        op.manufacturerArticleNo === line.manufacturerArticleNo ||
        (op.ean && op.ean === line.ean)
      )
      .filter(op => {
        const used = consumed.get(op.id) ?? 0;
        return op.openQty - used > 0;
      })
      .sort((a, b) => {
        // Regel 2: aelteste zuerst
        if (a.orderYear !== b.orderYear) return a.orderYear - b.orderYear;
        return a.belegnummer.localeCompare(b.belegnummer);
      });

    if (candidates.length === 0) {
      // Regel 3: keine Bestellung
      result[i] = {
        ...line,
        orderAssignmentReason: 'not-ordered',
      };
      continue;
    }

    // Regel 1 pruefen: exakter Mengen-Match
    // Zaehle wieviele expandierte Zeilen noch fuer diesen Artikel pending sind
    const pendingForArticle = result.filter(
      l => l.manufacturerArticleNo === line.manufacturerArticleNo
        && l.orderAssignmentReason === 'pending'
    ).length;

    const exactMatch = candidates.find(op => {
      const remaining = op.openQty - (consumed.get(op.id) ?? 0);
      return remaining === pendingForArticle;
    });

    const chosen = exactMatch ?? candidates[0];  // Fallback: aelteste

    // Consume 1 unit
    consumed.set(chosen.id, (consumed.get(chosen.id) ?? 0) + 1);

    const orderCode = chosen.belegnummer.slice(-5);  // letzte 5 Stellen
    result[i] = {
      ...line,
      orderNumberAssigned: `${chosen.orderYear}-${orderCode}`,
      orderYear: chosen.orderYear,
      orderCode: orderCode,
      orderVorgang: chosen.vorgang,
      orderOpenQty: chosen.openQty,
      supplierId: chosen.supplierId,
      orderAssignmentReason: exactMatch ? 'exact-qty-match' : 'oldest-first',
    };
  }

  return result;
}
```

#### 10.3.4 Store Actions (`src/store/runStore.ts`)

Neue Actions im RunStore-Interface:

```typescript
// --- Neue Store Actions ---

/** Step 2: Artikelstamm-Matching ausfuehren */
executeArticleMatching: (articles: ArticleMaster[]) => void;

/** Step 4: Bestellzuordnung ausfuehren */
executeOrderMatching: (openPositions: OpenWEPosition[]) => void;

/** Manuellen Preis setzen (aus PriceCell-Popover) */
setManualPrice: (lineId: string, price: number) => void;

/** Manuelle Bestellnummer setzen */
setManualOrder: (lineId: string, orderYear: number, orderCode: string) => void;

/** Zeile manuell als "OK ohne Bestellung" markieren */
confirmNoOrder: (lineId: string) => void;
```

**Implementierungs-Skizze `executeArticleMatching`:**

```typescript
executeArticleMatching: (articles) => {
  const { invoiceLines, runs, activeRunId } = get();
  if (!activeRunId) return;

  const run = runs.find(r => r.id === activeRunId);
  if (!run) return;

  const updatedLines = matchAllArticles(invoiceLines, articles, run.config.tolerance);

  // Stats berechnen
  const stats = computeMatchStats(updatedLines);

  set({
    invoiceLines: updatedLines,
    runs: runs.map(r => r.id === activeRunId
      ? { ...r, stats: { ...r.stats, ...stats } }
      : r
    ),
  });
},
```

**Hilfsfunktion `computeMatchStats`:**

```typescript
function computeMatchStats(lines: InvoiceLine[]): Partial<RunStats> {
  return {
    expandedLineCount: lines.length,
    fullMatchCount: lines.filter(l => l.matchStatus === 'full-match').length,
    codeItOnlyCount: lines.filter(l => l.matchStatus === 'code-it-only').length,
    eanOnlyCount: lines.filter(l => l.matchStatus === 'ean-only').length,
    noMatchCount: lines.filter(l => l.matchStatus === 'no-match').length,
    articleMatchedCount: lines.filter(l => l.matchStatus !== 'pending' && l.matchStatus !== 'no-match').length,
    serialRequiredCount: lines.filter(l => l.serialRequired).length,
    priceOkCount: lines.filter(l => l.priceCheckStatus === 'ok').length,
    priceMismatchCount: lines.filter(l => l.priceCheckStatus === 'mismatch').length,
    priceMissingCount: lines.filter(l => l.priceCheckStatus === 'missing').length,
    priceCustomCount: lines.filter(l => l.priceCheckStatus === 'custom').length,
  };
}
```

---

### 10.4 Export-Strategie

#### 10.4.1 CSV-Export (NEU: `src/services/export/csvExporter.ts`)

**Format:**
- Trennzeichen: Semikolon (`;`)
- Encoding: UTF-8 mit BOM (`\uFEFF`)
- Dezimalformat: Komma (Deutsch), z.B. `865,00`
- Zeilenende: `\r\n` (Windows)

```typescript
const CSV_HEADERS = [
  'Artikel-# (DE)',
  'Artikel-# (IT)',
  'EAN',
  'Beschreibung (DE)',
  'Bestellnummer_JAHR',
  'Bestellnummer_CODE',
  'Vorgangsnummer Order',
  'Seriennummer',
  'Lagerplatz',
  'Preis',
] as const;

export function exportToCSV(lines: InvoiceLine[], fileName: string): void {
  const bom = '\uFEFF';
  const header = CSV_HEADERS.join(';');

  const rows = lines.map(line => [
    line.falmecArticleNo ?? '',
    line.manufacturerArticleNo,
    line.ean,
    line.descriptionDE ?? line.descriptionIT,
    line.orderYear?.toString() ?? '',
    line.orderCode ?? '',
    line.orderVorgang ?? '',
    line.serialNumber ?? '',
    line.storageLocation ?? '',
    formatGermanDecimal(line.unitPriceFinal ?? line.unitPriceInvoice),
  ].join(';'));

  const csv = bom + [header, ...rows].join('\r\n');
  downloadBlob(csv, fileName, 'text/csv;charset=utf-8');
}

function formatGermanDecimal(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
```

#### 10.4.2 XML-Export (Update: `src/components/run-detail/ExportPanel.tsx`)

**Neues Sage100-Schema mit 10 Elementen pro Item, ohne Quantity-Element:**

```xml
<Item>
  <FalmecArticleNo>{falmecArticleNo}</FalmecArticleNo>
  <ManufacturerArticleNo>{manufacturerArticleNo}</ManufacturerArticleNo>
  <EAN>{ean}</EAN>
  <Description>{descriptionDE || descriptionIT}</Description>
  <OrderYear>{orderYear}</OrderYear>
  <OrderCode>{orderCode}</OrderCode>
  <OrderVorgang>{orderVorgang}</OrderVorgang>
  <SerialNumber>{serialNumber}</SerialNumber>
  <StorageLocation>{storageLocation}</StorageLocation>
  <UnitPrice>{unitPriceFinal || unitPriceInvoice}</UnitPrice>
</Item>
```

**Entfernte Elemente:** `<Quantity>` (Expansion macht qty=1 implizit), `<OrderNumber>` (ersetzt durch `<OrderYear>` + `<OrderCode>`)

#### 10.4.3 Export-Blocker-Check

Der bestehende Blocker-Check in `ExportPanel.tsx` (Zeile 21-23) wird erweitert:

```typescript
const isExportReady =
  openBlockingIssues.length === 0 &&
  missingLocations.length === 0 &&
  invoiceLines.every(line => line.matchStatus !== 'no-match');  // NEU
```

Zusaetzlich: Warnung (nicht blockierend) wenn Zeilen mit `priceCheckStatus === 'mismatch'` vorhanden sind.

---

### 10.5 Implementierungs-Reihenfolge (Phasen A-E)

#### Phase A: Types + Expansion + UI-Komponenten

| # | Schritt | Dateien | Abhaengigkeit |
|---|---|---|---|
| A1 | `MatchStatus`, `PriceCheckStatus`, `IssueType` erweitern | `src/types/index.ts` | -- |
| A2 | `InvoiceLine` Interface erweitern (7 neue Felder) | `src/types/index.ts` | A1 |
| A3 | `RunStats` Interface erweitern | `src/types/index.ts` | A1 |
| A4 | Migration-Funktion fuer localStorage | `src/store/runStore.ts` | A2 |
| A5 | `expandInvoiceLines()` implementieren, `convertToInvoiceLines()` ersetzen | `src/services/invoiceParserService.ts`, `src/store/runStore.ts` | A2 |
| A6 | `StatusCheckbox` Komponente | `src/components/run-detail/StatusCheckbox.tsx` (NEU) | A1 |
| A7 | `PriceCell` Komponente | `src/components/run-detail/PriceCell.tsx` (NEU) | A1 |

**Verifikation Phase A:** `npx tsc --noEmit` muss fehlerfrei durchlaufen.

#### Phase B: ArticleMatcher + Price Check + Store

| # | Schritt | Dateien | Abhaengigkeit |
|---|---|---|---|
| B1 | `ArticleMatcher` Service | `src/services/matching/ArticleMatcher.ts` (NEU) | A2 |
| B2 | `executeArticleMatching` Store Action | `src/store/runStore.ts` | B1, A3 |
| B3 | `setManualPrice` Store Action | `src/store/runStore.ts` | A7 |
| B4 | ItemsTable Spalten-Restructuring + StatusCheckbox/PriceCell einbinden | `src/components/run-detail/ItemsTable.tsx` | A5, A6, A7 |

#### Phase C: OrderMatcher + Manual UI

| # | Schritt | Dateien | Abhaengigkeit |
|---|---|---|---|
| C1 | `OrderMatcher` Service | `src/services/matching/OrderMatcher.ts` (NEU) | A2 |
| C2 | `executeOrderMatching`, `setManualOrder`, `confirmNoOrder` Store Actions | `src/store/runStore.ts` | C1 |
| C3 | Manuelle Bestellzuordnung UI (Dropdown + Input in ItemsTable) | `src/components/run-detail/ItemsTable.tsx` | C2 |

#### Phase D: DetailPopup + Export + KPIs

| # | Schritt | Dateien | Abhaengigkeit |
|---|---|---|---|
| D1 | `DetailPopup` Komponente | `src/components/run-detail/DetailPopup.tsx` (NEU) | A2 |
| D2 | CSV-Exporter | `src/services/export/csvExporter.ts` (NEU) | A2 |
| D3 | XML-Schema Update + Blocker-Check erweitern | `src/components/run-detail/ExportPanel.tsx` | A2 |
| D4 | KPI-Kacheln Counter/Nenner-Logik anpassen | `src/components/run-detail/OverviewPanel.tsx` | A3, B2 |

#### Phase E: Tests

| # | Schritt | Dateien | Abhaengigkeit |
|---|---|---|---|
| E1 | Unit Tests: `expandInvoiceLines()` | `src/services/__tests__/invoiceParserService.test.ts` | A5 |
| E2 | Unit Tests: `ArticleMatcher` (5 MatchStatus-Zustaende + Preis-Check) | `src/services/matching/__tests__/ArticleMatcher.test.ts` | B1 |
| E3 | Unit Tests: `OrderMatcher` (3 Regeln + Consumption Tracking) | `src/services/matching/__tests__/OrderMatcher.test.ts` | C1 |
| E4 | E2E: Kompletter Run mit Sample-PDF + Mock-Stammdaten | manuell / Playwright | D3 |

---

### 10.6 Cross-Referenz: Acceptance Criteria → Design

| AC-Gruppe | Abgedeckt durch |
|---|---|
| AC-CHECKBOX-01..07 | 10.2.1 (StatusCheckbox) + 10.3.2 (ArticleMatcher) |
| AC-PRICE-01..07 | 10.2.2 (PriceCell) + 10.3.2 (`checkPrice`) + 10.3.4 (`setManualPrice`) |
| AC-SERIAL-01..06 | 10.1.2 (`serialRequired`) + 10.2.4 (ItemsTable Serial-# Spalte) |
| AC-DETAILS-01..03 | 10.2.3 (DetailPopup) |
| AC-TILES-01..04 | 10.1.3 (RunStats) + 10.3.4 (`computeMatchStats`) |
| AC-ORDER-01..08 | 10.3.3 (OrderMatcher) + 10.3.4 (`executeOrderMatching`, `setManualOrder`, `confirmNoOrder`) |
| AC-EXPAND-01..04 | 10.3.1 (`expandInvoiceLines`) + 10.2.4 (ItemsTable Gruppierung) |
| AC-EXPORT-01..06 | 10.4.1 (CSV) + 10.4.2 (XML) + 10.4.3 (Blocker-Check) |
