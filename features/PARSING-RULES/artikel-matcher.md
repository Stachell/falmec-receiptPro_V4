# Artikel-Matcher — Parsing-Rules

> **Modul:** `FalmecMatcher_Master` (v1)
> **Pfad:** `src/services/matchers/modules/FalmecMatcher_Master.ts`
> **Step:** 2 — Artikel extrahieren (Cross-Match)
> **Legacy-Fallback:** `src/services/matching/ArticleMatcher.ts` (einfacher 2-Pfad-Matcher)

---

## 1. Architektur-Prinzip

Der Matcher gleicht jede Rechnungsposition (InvoiceLine) gegen den hochgeladenen Artikelstamm (ArticleMaster[]) ab. Ziel: Falmec-Artikelnummer (DE), Sage-Preis, S/N-Pflicht, Lagerort und Aktivstatus zuweisen.

**PROJ-23 Aenderung:** Der Matcher arbeitet ab sofort auf **aggregierten Positionen** (z.B. 45 Zeilen mit qty > 1), nicht auf expandierten Einzelzeilen. Da das Matching auf Artikel-Identifiern basiert (nicht qty-abhaengig), aendert sich die Kern-Logik nicht. Das Match-Ergebnis wird einmal pro Position bestimmt und gilt fuer alle spaeter expandierten Einzelzeilen.

Der Abgleich erfolgt über eine **4-Strategie-Kaskade** mit vorberechneten O(1)-Lookup-Maps. Erst wenn alle 4 Strategien scheitern, wird `matchStatus: 'no-match'` gesetzt.

---

## 2. FALMEC_SCHEMA — Stammdaten-Felddefinition

Das Schema definiert die 7 Felder des Artikelstamms mit ihren Spalten-Aliasen für die automatische Excel-Spalten-Erkennung:

| fieldId | Label | Aliases | Required | Validation |
|---------|-------|---------|----------|------------|
| `artNoDE` | Art-# (DE) | `Art.-Nr. DE`, `Artikelnummer DE`, `Falmec Art.-Nr.`, `DE-Artikelnummer`, `Art. DE`, `Artikel DE`, `Art-# (DE)`, `Artikelnummer` | Ja | `/^1\d{5}$/` |
| `artNoIT` | Art-# (IT) | `Herstellerartikelnummer`, `Hersteller-Artikelnummer`, `Hersteller ArtNr`, `Art.-Nr.`, `Article No`, `Codice Articolo`, `Art. IT`, `Art-# (IT)` | Ja | — |
| `ean` | EAN | `EAN`, `EAN-Code`, `EAN-NUMMER`, `Barcode`, `GTIN` | Ja | — |
| `price` | Preis netto | `Preis netto`, `VK netto`, `Net Price`, `Prezzo`, `Einzelpreis` | Ja | — |
| `serialRequired` | SN-Pflicht | `SN-Pflicht`, `Serial Required`, `Seriennummer`, `Seriennummerpflicht`, `Seriennummernpflicht` | Nein | Boolean |
| `storageLocation` | Lagerort | `Lagerort`, `Storage Location`, `Magazzino`, `Hauptlagerplatz`, `Hauptlager` | Nein | — |
| `supplierId` | Lieferant | `Lieferant`, `Supplier`, `Fornitore`, `Hauptlieferant` | Nein | — |

### Art-# (DE) Validierung

```
Regex: /^1\d{5}$/
```

Exakt 6 Ziffern, **muss mit "1" beginnen**. Beispiele:
- `"100456"` — gueltig
- `"200456"` — ungueltig (beginnt nicht mit 1)
- `"10045"` — ungueltig (nur 5 Ziffern)

### Spalten-Kollisions-Aufloesung

Wenn zwei Excel-Spalten denselben Alias matchen, gewinnt die Spalte mit **mehr nicht-leeren Zellen**. Bei Gleichstand gewinnt die **linkere Spalte**. Kollisionen werden als Warning geloggt.

---

## 3. Normalisierung und Sanitisierung

```typescript
// Normalisierung: Trim + Uppercase
function normalize(value: string): string {
  return String(value ?? '').trim().toUpperCase();
}

// Sanitisierung: Sonderzeichen entfernen
function sanitize(value: string): string {
  return value.replace(/[.\-#/,\s]/g, '');
}
// Entfernt: . - # / , Leerzeichen
// "CFAB90#VT.ME" → "CFAB90VTME"
```

---

## 4. Die 4-Strategie-Kaskade

Fuer jede Rechnungsposition wird sequenziell geprueft:

### Strategie 1 — Exact ArtNo Match (O(1))

```
Lookup: byArtNo.get(normalize(line.manufacturerArticleNo))
```

Direkter Treffer der normalisierten Herstellerartikelnummer gegen die vorberechnete Map.

**Ergebnis bei Treffer:** `matchStatus = 'code-it-only'` (oder `'full-match'` wenn auch EAN passt)

### Strategie 2 — Exact EAN Match (O(1))

```
Lookup: byEan.get(normalize(line.ean))
```

Direkter Treffer des normalisierten EAN-Codes.

**Ergebnis bei Treffer:** `matchStatus = 'ean-only'` (oder `'full-match'` wenn auch ArtNo passt)

### CONFLICT-Regel (zwischen Strategie 1 und 2)

Wenn **beide** Strategien einen Treffer liefern, aber auf **verschiedene Artikel** zeigen:

```
ArtNo "CFAB90#VT.ME" → Artikel A (id: "md-42-100456")
EAN   "8032624878610" → Artikel B (id: "md-87-100789")
```

**Ergebnis:**
- `matchStatus = 'no-match'`
- `isConflict = true`
- Warning: `"KONFLIKT: ArtNo 'CFAB90#VT.ME' → Artikel A, EAN '8032624878610' → Artikel B"`
- Blocking Issue im Issues-Center (Typ `'match-conflict-id'`)

Wenn beide auf **denselben Artikel** zeigen: `matchStatus = 'full-match'`.

### Strategie 3 — Sanitized ArtNo Match (O(1))

Nur wenn Strategien 1 und 2 scheitern.

```
Lookup: bySanitizedArt.get(sanitize(normalize(line.manufacturerArticleNo)))
```

Sonderzeichen (`.`, `-`, `#`, `/`, `,`, Leerzeichen) werden vor dem Vergleich entfernt.

**Beispiel:** `"CFAB90#VT.ME"` → `"CFAB90VTME"` matcht gegen `"CFAB90VTME"` im Stamm.

**Ergebnis bei Treffer:** `matchStatus = 'code-it-only'`, Info-Warning mit Trace

### Strategie 4 — Partial ArtNo Match (O(n), Fallback)

Nur wenn alle 3 vorherigen Strategien scheitern. Lineare Suche ueber alle Artikel.

```typescript
if (lineCode.length >= 4) {
  match = articles.find(a => {
    const normA = normalize(a.manufacturerArticleNo);
    return normA.includes(lineCode) || lineCode.includes(normA);
  });
}
```

Bidirektionaler Substring-Vergleich. Mindestlaenge 4 Zeichen.

**Ergebnis bei Treffer:** `matchStatus = 'code-it-only'`, Info-Warning mit Trace

---

## 5. Price-Check (Preisvergleich)

Nach dem Artikel-Match wird der Rechnungspreis gegen den Sage-Preis geprueft:

```typescript
function checkPrice(invoicePrice: number, sagePrice: number, tolerance: number): PriceCheckStatus {
  if (!isFinite(invoicePrice) || invoicePrice <= 0) return 'missing';
  if (!isFinite(sagePrice) || sagePrice <= 0) return 'missing';
  const diff = Math.abs(invoicePrice - sagePrice);
  return diff <= tolerance ? 'ok' : 'mismatch';
}
```

| Status | Bedingung |
|--------|-----------|
| `'ok'` | `abs(invoicePrice - sagePrice) <= tolerance` |
| `'mismatch'` | Differenz ueberschreitet Toleranz |
| `'missing'` | Einer der Preise ist <= 0 oder nicht-finit |
| `'custom'` | Manuell gesetzt (nach User-Aktion) |
| `'pending'` | Noch kein Match durchgefuehrt |

**Default-Toleranz:** `0.01` EUR (konfigurierbar ueber `RunConfig.tolerance`)

### unitPriceFinal-Logik

```
priceCheckStatus === 'ok'  → unitPriceFinal = invoicePrice
priceCheckStatus !== 'ok'  → unitPriceFinal = null (manuell zu klaeren)
```

---

## 6. Match-Status Werte

| matchStatus | Bedeutung | Strategie |
|-------------|-----------|-----------|
| `'full-match'` | ArtNo UND EAN treffen denselben Artikel | 1 + 2 |
| `'code-it-only'` | Nur ArtNo-Treffer | 1, 3 oder 4 |
| `'ean-only'` | Nur EAN-Treffer | 2 |
| `'no-match'` | Kein Treffer oder CONFLICT | — |
| `'pending'` | Noch nicht gematcht (Initialzustand) | — |

---

## 7. Output-Schema

```typescript
interface CrossMatchResult {
  lines: InvoiceLine[];           // Aktualisierte Zeilen mit matchStatus, Preisen etc.
  stats: Partial<RunStats>;       // fullMatchCount, noMatchCount, priceOk etc.
  issues: Issue[];                // Blocking Issues (z.B. no-match Artikel)
  warnings: MatcherWarning[];     // Traces, Conflicts, Info-Meldungen
}
```

### Stats-Felder (nach Step 2)

| Feld | Beschreibung |
|------|--------------|
| `fullMatchCount` | Anzahl `'full-match'` |
| `codeItOnlyCount` | Anzahl `'code-it-only'` |
| `eanOnlyCount` | Anzahl `'ean-only'` |
| `noMatchCount` | Anzahl `'no-match'` |
| `articleMatchedCount` | Alle ausser `'pending'` und `'no-match'` |
| `serialRequiredCount` | Zeilen mit `serialRequired === true` |
| `inactiveArticlesCount` | Zeilen mit `activeFlag === false` |
| `priceOkCount` | Anzahl `priceCheckStatus === 'ok'` |
| `priceMismatchCount` | Anzahl `priceCheckStatus === 'mismatch'` |
| `priceMissingCount` | Anzahl `priceCheckStatus === 'missing'` |
