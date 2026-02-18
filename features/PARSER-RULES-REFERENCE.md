# Parser Rules Reference - devlogic PDF-PARSER_V1

> Vollstaendige Dokumentation aller Parsing-Regeln, Pruefregeln und Datenmodelle.
> Generiert aus dem Quellcode und verifiziert gegen Beispielausgabe `Fattura2026020007-SAMPLE-DL.pdf`.

---

## Inhaltsverzeichnis

1. [Architektur-Ueberblick](#1-architektur-ueberblick)
2. [Kern-Engine (logicdev_Core)](#2-kern-engine-logicdev_core)
3. [Parser-Set: fattura_falmec_v1](#3-parser-set-fattura_falmec_v1)
4. [Pruefregeln (Validation Rules)](#4-pruefregeln-validation-rules)
5. [Datenmodelle](#5-datenmodelle)
6. [Beispiel-Referenz: Fattura 20.007](#6-beispiel-referenz-fattura-20007)

---

## 1. Architektur-Ueberblick

```
PDF-Datei
   |
   v
[1] Text-Extraktion .............. text_extraction.py (pdfplumber)
   |  Jedes Wort mit Page/X/Y/Width/Height
   v
[2] Zeilengruppierung ............ line_grouper.py
   |  Y-Tolerance-basierte Gruppierung + X-Sortierung
   v
[3] Parsing-Skript ............... logicdev_Pars-Units/*.py
   |  Header-Extraktion + Positions-Parsing
   v
[4] Validierung .................. logicdev_Validation-Rules/rule_*.py
   |  Automatische Pruefregeln nach dem Parsing
   v
[5] Ergebnis (ParseResult)
      Header, Positionen, Warnungen, Pruefergebnisse
```

### Registrierte Parser-Sets

| Unit ID | Klasse | Version | Beschreibung | Datei |
|---------|--------|---------|-------------|-------|
| `fattura_falmec_v1` | `FatturaFalmecV1` | 1.0.0 | Falmec S.p.A. Rechnungen (Fattura-Layout) | `logicdev_Pars-Units/fattura_falmec_v1.py` |

### Registrierte Pruefregeln

| Rule ID | Klasse | Severity | Beschreibung | Datei |
|---------|--------|----------|-------------|-------|
| `amount_vs_total` | `AmountVsTotalRule` | error | Positionssumme vs. Rechnungsgesamt | `rule_amount_vs_total.py` |
| `position_identifier` | `PositionIdentifierRule` | error | Jede Position braucht EAN oder Artikelnr. | `rule_position_identifier.py` |
| `qty_vs_packages` | `QtyVsPackagesRule` | warning | Summe Menge vs. Paketanzahl | `rule_qty_vs_packages.py` |

---

## 2. Kern-Engine (logicdev_Core)

### 2.1 Text-Extraktion (`text_extraction.py`)

**Bibliothek:** `pdfplumber`

**Konfiguration:**

| Parameter | Wert | Beschreibung |
|-----------|------|-------------|
| `keep_blank_chars` | `False` | Leere Zeichen ignorieren |
| `x_tolerance` | `3` | Horizontale Toleranz fuer Wort-Erkennung (px) |
| `y_tolerance` | `3` | Vertikale Toleranz fuer Wort-Erkennung (px) |

**Ausgabe pro Wort (`RawTextItem`):**

| Feld | Typ | Quelle |
|------|-----|--------|
| `page` | int | Seitennummer (1-basiert) |
| `text` | str | Worttext (getrimmt) |
| `x` | float | `word["x0"]` gerundet auf 1 Nachkommastelle |
| `y` | float | `word["top"]` gerundet auf 1 Nachkommastelle |
| `width` | float | `x1 - x0` gerundet |
| `height` | float | `bottom - top` gerundet |

**Zusaetzlich:** Volltext pro Seite via `page.extract_text()` fuer Header/Footer-Regex.

---

### 2.2 Zeilengruppierung (`line_grouper.py`)

**Algorithmus:**

1. **Gruppierung:** Items mit aehnlicher Y-Position werden zu einer Zeile zusammengefasst
   - Formel: `key = page * 10000 + round(y / y_tolerance) * y_tolerance`
   - Standard-Toleranz: `3.0` px (Engine-Default), `10.0` px (Fattura-Empfehlung)
2. **Sortierung:** Aufsteigend nach Page, dann Y (top-to-bottom, da pdfplumber top=0)
3. **Normalisierung:** Items innerhalb einer Zeile links-nach-rechts (nach X) sortiert
4. **Text-Bereinigung:** `normalize_text()` - Trim, Whitespace-Kollaps, NBSP-Entfernung

**Ausgabe (`GroupedLine`):**

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `key` | float | Eindeutiger Zeilenschluessel (page*10000 + rounded_y) |
| `text` | str | Zusammengefuegter, normalisierter Zeilentext |
| `items` | list[RawTextItem] | Einzelne Woerter mit Koordinaten |
| `page` | int | Seitennummer |

---

### 2.3 Preisformat-Parser (`price_parser.py`)

**Unterstuetzte Formate (europaeisch):**

| Funktion | Eingabe | Ausgabe | Beschreibung |
|----------|---------|---------|-------------|
| `parse_price()` | `"1.234,56"` | `1234.56` | EU-Format -> Float |
| `parse_price()` | `"894,45"` | `894.45` | Ohne Tausender-Trenner |
| `parse_integer()` | `"295"` | `295` | String -> Int |
| `format_price_eu()` | `1234.56` | `"1.234,56"` | Float -> EU-Format |
| `is_valid_price()` | `float` | `bool` | Nicht-negativ, endlich, kein NaN |

**Konvertierungslogik:**
1. Punkte entfernen (Tausender-Separator)
2. Komma durch Punkt ersetzen (Dezimal-Separator)
3. `float()` Konvertierung

---

### 2.4 Bestellblock-Tracker (`order_block_tracker.py`)

**Kritisches Verhalten:** Bestellnummern werden NICHT nach jeder Position zurueckgesetzt. Sie gelten fuer alle Positionen bis ein neuer `Vs. ORDINE`-Block erscheint.

**Trigger-Pattern:**
```regex
Vs\.\s*ORDINE    (Case-insensitive)
```

**Bestellnummern-Extraktion (`extract_order_candidates`):**

| Format | Beispiel | Ergebnis |
|--------|---------|----------|
| Unterstrich-getrennt | `0_10170_173_172` | `["10170", "10173", "10172"]` |
| Einzeln (5-stellig, 10xxx) | `Vs. ORDINE Nr. 10153` | `["10153"]` |
| Kurzcode-Expansion | `_173` (nach 10xxx-Basis) | `"10173"` (Prefix "10" + "173") |

**Order-Status-Bestimmung:**

| Anzahl Kandidaten | Status | Bedeutung |
|-------------------|--------|-----------|
| 0 | `"NO"` | Keine Bestellung zugeordnet |
| 1 | `"YES"` | Eindeutig zugeordnet |
| 2+ | `"check"` | Mehrdeutig, manuelle Pruefung noetig |

---

### 2.5 Unit-Discovery (`unit_loader.py`)

**Auto-Discovery-Regeln:**
- Verzeichnis: `logicdev_Pars-Units/`
- Dateien mit `_` am Anfang werden uebersprungen (Basis, Templates)
- Jede `.py`-Datei wird geladen
- Alle `BaseParsingUnit`-Subklassen werden instanziiert
- Schluessel: `instance.unit_id`

---

### 2.6 Validation-Discovery (`validation_runner.py`)

**Auto-Discovery-Regeln:**
- Verzeichnis: `logicdev_Validation-Rules/`
- Nur Dateien mit Prefix `rule_` werden geladen
- Alle `BaseValidationRule`-Subklassen werden instanziiert
- Bei fehlgeschlagener Validierung: Warning wird automatisch zum `ParseResult` hinzugefuegt

---

## 3. Parser-Set: fattura_falmec_v1

> **Klasse:** `FatturaFalmecV1` | **Datei:** `logicdev_Pars-Units/fattura_falmec_v1.py`
> **Portiert von:** FatturaParserV3 (TypeScript) - `src/services/parslogic/modules/fattura/parser.ts`

### 3.1 Auto-Erkennung (`can_handle`)

Erkennt Falmec-Rechnungen anhand von:
- `Falmec S.p.A` (case-insensitive) im Gesamttext **ODER**
- `NUMERO DOC` im Gesamttext

---

### 3.2 Header-Parsing-Regeln

#### 3.2.1 Rechnungsnummer (`document_number`)

**Quelle:** Erste Seite

| Prioritaet | Pattern | Regex | Beispiel-Match |
|------------|---------|-------|----------------|
| 1 (hoechste) | NUMERO DOC + Nummer | `NUMERO\s*DOC[^0-9]*(\d{2}\.\d{3})` | `NUMERO DOC./ N° ... 20.007` |
| 2 | Standalone XX.XXX | `\b(\d{2}\.\d{3})\b` | `20.007` |
| 3 (Fallback) | N-Prefix | `N[°o]?\s*(\d{2}\.\d{3})` | `N° 20.007` |

**Fehlerfall:** Warning `MISSING_FATTURA_NUMBER` (severity: error)

#### 3.2.2 Rechnungsdatum (`document_date`)

**Quelle:** Erste Seite

| Pattern | Regex | Transformation |
|---------|-------|---------------|
| DD/MM/YYYY | `(\d{2}/\d{2}/\d{4})` | `/` wird durch `.` ersetzt |

**Beispiel:** `31/01/2026` -> `31.01.2026`

**Fehlerfall:** Warning `MISSING_FATTURA_DATE` (severity: warning)

#### 3.2.3 Paketanzahl (`packages_count`)

**Quelle:** Letzte Seite

| Prioritaet | Strategie | Regex/Logik |
|------------|-----------|-------------|
| 1 | Direkt | `Number\s+of\s+packages\s*[\n\s]*(\d+)` |
| 2 | Naechste Zeile | Zeile nach "Number of packages" -> erster `\d+` Match |
| 3 (Fallback) | Erweitert | `Number\s+of\s+packages[\s\S]{0,50}?(\d{2,3})` |

**Fehlerfall:** Warning `MISSING_PACKAGES_COUNT` (severity: info)

#### 3.2.4 Rechnungsgesamt (`invoice_total`)

**Quelle:** Letzte Seite

| Prioritaet | Strategie | Logik |
|------------|-----------|-------|
| 1 | Ueber CONTRIBUTO | Zeile direkt UEBER `CONTRIBUTO\s+AMBIENTALE` -> Preiswert extrahieren |
| 2 (Fallback) | Nach AMOUNT TO PAY | Naechste 2 Zeilen nach `AMOUNT\s+.*TO\s+PAY` -> Preiswert |

**Preiswert-Pattern:** `([\d]{1,3}(?:[.,]\d{3})*[.,]\d{2})` (EU-Format)

**Fehlerfall:** Warning `MISSING_INVOICE_TOTAL` (severity: warning)

#### 3.2.5 Berechnete Header-Felder

| Feld | Berechnung |
|------|-----------|
| `total_qty` | `SUM(line.quantity_delivered)` ueber alle Positionen |
| `parsed_positions_count` | `len(lines)` |
| `qty_validation_status` | `"ok"` wenn Positionen <= Menge, `"mismatch"` wenn Positionen > Menge, `"unknown"` sonst |

---

### 3.3 Positions-Parsing-Regeln

#### 3.3.1 Skip-Patterns (uebersprungene Zeilen)

Folgende Zeilentypen werden ignoriert (Header/Footer):

| Pattern | Regex | Beispiel |
|---------|-------|---------|
| INVOICE | `^INVOICE` | `INVOICE Pag. 1/ 4` |
| Falmec | `^Falmec` | `Falmec Spa` |
| NUMERO | `^NUMERO` | `NUMERO DOC./ N°` |
| DATA | `^DATA` | `DATA DOC./DATE` |
| DESCRIPTION | `^DESCRIPTION` | Spaltenheader |
| Continues | `^Continues` | `Continues...` |
| EUR | `^EUR$` | Waehrungszeile |
| TOTAL | `^TOTAL` | Total-Zeilen |
| Number of packages | `^Number of packages` | Footer-Bereich |
| EXPIRY | `^EXPIRY` | Faelligkeitszeile |
| Informativa | `^Informativa` | Datenschutzhinweis |
| CUSTOMER | `^CUSTOMER` | Kundenzeile |
| DESTINATARIO | `^DESTINATARIO` | Empfaengerzeile |
| Net weight | `^Net weight` | Gewichtsangabe |
| Gross weight | `^Gross weight` | Gewichtsangabe |

Alle Patterns: case-insensitive.

---

#### 3.3.2 Artikelnummer-Patterns

**8 Patterns, sortiert nach Spezifitaet (hoechste zuerst):**

| # | Pattern-Name | Regex | Beispiel-Match | Beschreibung |
|---|-------------|-------|----------------|-------------|
| 1 | `combined` | `([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)\s+(803\d{10})` | `KACL.457#NF 8034122713656` | Artikel + EAN kombiniert |
| 2 | `standard_hash` | `^([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)$` | `CAEI20.E0P2#ZZZB461F` | Standard Falmec mit # |
| 3 | `k_prefix_hash` | `^(K[A-Z]{3,4}\.\d+#\d*)$` | `KCVJN.00#3` | K-Prefix mit # |
| 4 | `k_prefix_simple` | `^(K[A-Z]{3,4}\.\d+)$` | `KACL.936` | K-Prefix ohne # |
| 5 | `c_prefix` | `^(C[A-Z]{2,3}\d{2}\.[A-Z0-9]+#[A-Z0-9]+)$` | `CAEI20.E0P2#ZZZB461F` | C-Prefix komplex |
| 6 | `numeric_9` | `^(\d{9})$` | `105080365` | 9-stellig numerisch |
| 7 | `numeric_f_suffix` | `^(\d{8}F#\d{2})$` | `30506073F#49` | 8-stellig mit F#xx |
| 8 | `general_hash` | `^([A-Z][A-Z0-9.#\-]{4,}[A-Z0-9])$` | Allgemein alphanumerisch | Min. 6 Zeichen, mit # oder . |

**Matching-Strategie:**
- Items in der linken Spalte (`x < 100`) werden bevorzugt geprueft
- Artikel muss `#` enthalten, um als Artikelnummer erkannt zu werden (nicht als KACL-Kit)
- Alle Items werden auf standalone EAN und numerische Artikel geprueft

---

#### 3.3.3 EAN-Pattern

| Pattern | Regex | Beschreibung |
|---------|-------|-------------|
| EAN-13 Falmec | `^(803\d{10})$` | 13-stellig, beginnt mit `803` |

**Spezialverhalten "Trailing EAN":**
Wenn eine EAN auf einer Zeile NACH der PZ-Zeile steht (pdfplumber-Artefakt), wird sie retroaktiv der letzten Position zugewiesen, sofern diese noch keine EAN hat.

---

#### 3.3.4 Preiszeilen-Erkennung

**Komplett-Pattern:**
```regex
PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)
```
- Gruppe 1: Menge (quantity)
- Gruppe 2: Einzelpreis (unit_price, EU-Format)
- Gruppe 3: Gesamtpreis (total_price, EU-Format)

**Partial-Pattern (nur Menge):**
```regex
PZ\s+(\d+)(?:\s|$)
```

**Beschreibung-Extraktion:** Text VOR `PZ` in der Zeile:
```regex
^(.+?)\s+PZ\s+\d+
```

---

#### 3.3.5 Lookahead fuer geteilte Preiszeilen

Wenn nur `PZ [qty]` ohne Preise gefunden wird:

1. Alle Preiswerte (`PRICE_VALUE_PATTERN`) in der aktuellen Zeile sammeln
2. Falls < 2 Preise: naechste 1-3 Zeilen durchsuchen
3. Abbruch bei: Skip-Pattern, Order-Referenz, neues PZ-Pattern
4. Aus den gesammelten Preisen:
   - `unit_price` = vorletzter Preis (oder einziger)
   - `total_price` = letzter Preis

---

#### 3.3.6 Positions-Commit-Logik

Fuer jede erkannte Preiszeile wird eine Position erstellt:

1. **Bestellnummern** vom `OrderBlockTracker` abfragen (persistiert!)
2. `ParsedLine` erstellen mit allen gesammelten Daten
3. Akkumulatoren (`current_article`, `current_ean`) zuruecksetzen

---

#### 3.3.7 Fallback-Parsing

Wenn KEINE Positionen gefunden wurden, wird ein Full-Text-Scan ausgefuehrt:

```regex
([A-Z]{2,}[A-Z0-9.]+#[A-Z0-9]+)\s+(803\d{10})[^P]*PZ\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)
```

Findet zusammenhaengende Bloecke: Artikel + EAN + PZ + Preise.
**Einschraenkung:** Keine Bestellnummern-Zuordnung im Fallback.

---

#### 3.3.8 Interne Validierung (`_validate_results`)

| Pruefung | Bedingung | Ergebnis |
|----------|-----------|----------|
| Rechnungsnummer vorhanden | `document_number` existiert | `success = False` wenn fehlend |
| Positionen vorhanden | `lines` nicht leer | `success = False` wenn leer |
| Positionskennung | Jede Position hat EAN oder Artikelnr. | Warning `POSITION_NO_IDENTIFIER` (error) |

---

### 3.4 Bestellblock-Zuordnung (Ablauf)

```
Zeile: "Vs. ORDINE ESTERO Nr. 0000000_10153 del 11/11/2025"
  -> OrderBlockTracker.start_new_block(["10153"])
  -> Alle folgenden Positionen erhalten order_candidates=["10153"]

Zeile: "Vs. ORDINE ESTERO Nr. 000000_10158 del 18/11/2025"
  -> OrderBlockTracker.start_new_block(["10158"])
  -> Ab jetzt: order_candidates=["10158"]

Zeile: "Vs. ORDINE ESTERO Nr. 0_10170_173_172 del 05/12/2025"
  -> extract_order_candidates("0_10170_173_172")
     -> "10170" (5-stellig, 10-Prefix)
     -> "173" (3-stellig) + Basis "10" -> "10173"
     -> "172" (3-stellig) + Basis "10" -> "10172"
  -> OrderBlockTracker.start_new_block(["10170", "10173", "10172"])
  -> Ab jetzt: order_status="check" (mehrdeutig)
```

---

## 4. Pruefregeln (Validation Rules)

### 4.1 `amount_vs_total` - Positionssumme vs. Rechnungsgesamt

| Eigenschaft | Wert |
|-------------|------|
| **Rule ID** | `amount_vs_total` |
| **Klasse** | `AmountVsTotalRule` |
| **Severity** | `error` |
| **Datei** | `rule_amount_vs_total.py` |

**Logik:**
```
sum_line_totals = ROUND(SUM(line.total_price), 2)
invoice_total   = header.fields["invoice_total"]

WENN invoice_total == None:
  -> passed=True, severity="info", "skipping comparison"

WENN ABS(sum_line_totals - invoice_total) < 0.02:
  -> passed=True
SONST:
  -> passed=False, severity="error"
```

**Toleranz:** 0,02 EUR (fuer Rundungsdifferenzen)

**Beispiel-Ergebnis:**
```
SUM(amount) = 104.209,50  ==  invoice_total = 104.209,50  -> BESTANDEN
```

---

### 4.2 `position_identifier` - Positionskennung

| Eigenschaft | Wert |
|-------------|------|
| **Rule ID** | `position_identifier` |
| **Klasse** | `PositionIdentifierRule` |
| **Severity** | `error` |
| **Datei** | `rule_position_identifier.py` |

**Logik:**
```
FUER JEDE Position:
  WENN line.ean == "" UND line.manufacturer_article_no == "":
    -> Position zur "missing"-Liste hinzufuegen

WENN missing-Liste leer:
  -> passed=True
SONST:
  -> passed=False, severity="error"
```

**Beispiel-Ergebnis:**
```
Alle 45 Positionen haben EAN oder Artikelnr.  -> BESTANDEN
```

---

### 4.3 `qty_vs_packages` - Menge vs. Pakete

| Eigenschaft | Wert |
|-------------|------|
| **Rule ID** | `qty_vs_packages` |
| **Klasse** | `QtyVsPackagesRule` |
| **Severity** | `warning` |
| **Datei** | `rule_qty_vs_packages.py` |

**Logik:**
```
sum_qty  = SUM(line.quantity_delivered)
packages = header.fields["packages_count"]

WENN packages == None:
  -> passed=True, severity="info", "skipping comparison"

WENN sum_qty == packages:
  -> passed=True
SONST:
  -> passed=False, severity="warning"
```

**Beispiel-Ergebnis:**
```
SUM(qty) = 295  ==  packages_count = 295  -> BESTANDEN
```

---

## 5. Datenmodelle

### 5.1 ParseResult (Hauptergebnis)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `success` | `bool` | Parsing erfolgreich (keine blockierenden Fehler) |
| `header` | `ParsedHeader` | Header-Daten (generisches `fields`-Dict) |
| `lines` | `list[ParsedLine]` | Geparste Positionen |
| `warnings` | `list[ParserWarning]` | Warnungen und Fehler |
| `validation_results` | `list[dict]` | Ergebnisse der Pruefregeln |
| `parser_unit` | `str` | Verwendetes Parsing-Skript (z.B. `"fattura_falmec_v1"`) |
| `parsed_at` | `str` | ISO-Zeitstempel (auto-generiert) |
| `source_file_name` | `str` | Originaler PDF-Dateiname |

### 5.2 ParsedHeader

Generisches Dictionary (`fields`). Inhalt abhaengig vom Parser-Set.

**Fuer `fattura_falmec_v1`:**

| Feld | Typ | Beispielwert | Beschreibung |
|------|-----|-------------|-------------|
| `document_number` | str | `"20.007"` | Rechnungsnummer (XX.XXX) |
| `document_date` | str | `"31.01.2026"` | Rechnungsdatum (DD.MM.YYYY) |
| `packages_count` | int | `295` | Paketanzahl |
| `invoice_total` | float | `104209.5` | Rechnungsgesamtbetrag |
| `total_qty` | int | `295` | Summe aller Mengen |
| `parsed_positions_count` | int | `45` | Anzahl geparster Positionen |
| `qty_validation_status` | str | `"ok"` | `"ok"` / `"mismatch"` / `"unknown"` |

### 5.3 ParsedLine (Position)

| Feld | Typ | Beispielwert | Beschreibung |
|------|-----|-------------|-------------|
| `position_index` | int | `1` | Laufende Nummer (1-basiert) |
| `manufacturer_article_no` | str | `"KACL.457#NF"` | Hersteller-Artikelnummer |
| `ean` | str | `"8034122713656"` | EAN-13 Code (803-Prefix) |
| `description` | str | `"KIT ACC. :MENSOLA..."` | Beschreibungstext |
| `quantity_delivered` | int | `1` | Gelieferte Menge |
| `unit_price` | float | `219.09` | Einzelpreis (EUR) |
| `total_price` | float | `219.09` | Gesamtpreis (EUR) |
| `order_candidates` | list[str] | `["10153"]` | Bestellnummern-Kandidaten |
| `order_candidates_text` | str | `"10153"` | Pipe-getrennt: `"10170\|10173\|10172"` |
| `order_status` | str | `"YES"` | `"YES"` / `"NO"` / `"check"` |
| `raw_position_text` | str | `"KACL.457#NF ... PZ 1 219,09 219,09"` | Rohtext der geparsten Zeile |

### 5.4 ParserWarning

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `code` | str | Fehlercode (z.B. `"MISSING_FATTURA_NUMBER"`) |
| `message` | str | Menschenlesbare Fehlermeldung |
| `severity` | str | `"info"` / `"warning"` / `"error"` |
| `position_index` | int \| None | Betroffene Position (optional) |
| `context` | dict \| None | Zusaetzliche Kontextdaten (optional) |

### 5.5 Moegliche Warning-Codes

| Code | Severity | Ausloeser |
|------|----------|-----------|
| `UNIT_NOT_FOUND` | error | Angefordertes Parser-Set nicht gefunden |
| `PDF_READ_ERROR` | error | PDF konnte nicht gelesen werden |
| `PDF_EMPTY` | error | PDF enthaelt keinen extrahierbaren Text |
| `MISSING_FATTURA_NUMBER` | error | Rechnungsnummer nicht gefunden |
| `MISSING_FATTURA_DATE` | warning | Rechnungsdatum nicht gefunden |
| `MISSING_PACKAGES_COUNT` | info | Paketanzahl nicht gefunden |
| `MISSING_INVOICE_TOTAL` | warning | Rechnungsgesamtbetrag nicht gefunden |
| `POSITIONS_EXCEED_QTY` | warning | Positionen > Summe Menge |
| `INCOMPLETE_POSITION` | warning | Artikel/EAN ohne Preiszeile am Ende |
| `POSITION_NO_IDENTIFIER` | error | Position ohne EAN und Artikelnr. |
| `NO_POSITIONS_FOUND` | error | Keine Positionen gefunden |
| `FALLBACK_PARSING` | warning | Fallback-Parsing verwendet |
| `VALIDATION_*` | varies | Aus fehlgeschlagenen Pruefregeln |

---

## 6. Beispiel-Referenz: Fattura 20.007

> Quelldatei: `logicdev_sample/test_pdfs/Fattura2026020007-SAMPLE-DL.pdf`
> Ergebnis: `logicdev_sample/test_output/Fattura2026020007-SAMPLE-DL_result.json`

### 6.1 Header-Werte

| Feld | Extrahierter Wert | Quelle im PDF |
|------|-------------------|---------------|
| `document_number` | `20.007` | Seite 1: `NUMERO DOC./ N° ... 20.007` |
| `document_date` | `31.01.2026` | Seite 1: `31/01/2026` -> Konvertiert |
| `packages_count` | `295` | Seite 4: `Number of packages 295` |
| `invoice_total` | `104209.5` | Seite 4: Zeile ueber CONTRIBUTO: `104.209,50` |
| `total_qty` | `295` | Berechnet: SUM(quantity_delivered) |
| `parsed_positions_count` | `45` | Berechnet: len(lines) |
| `qty_validation_status` | `"ok"` | 45 Positionen <= 295 Menge |

### 6.2 Bestellblock-Verlauf

| Block | Bestellnummer(n) | Positionen | Order-Status |
|-------|-----------------|-----------|-------------|
| 1 | `10153` | 1-2 | YES |
| 2 | `10158` | 3-7 | YES |
| 3 | `10164` | 8 | YES |
| 4 | `10170`, `10173`, `10172` | 9-25 | check |
| 5 | `10175` | 26-45 | YES |

### 6.3 Positionen (45 Stueck)

| Nr. | Artikelnr. | EAN | Menge | Einzelpreis | Gesamtpreis | Bestellung |
|-----|-----------|-----|------:|------------:|------------:|------------|
| 1 | KACL.457#NF | 8034122713656 | 1 | 219,09 | 219,09 | 10153 |
| 2 | CAEI20.E0P2#ZZZB461F | 8034122354507 | 1 | 894,45 | 894,45 | 10153 |
| 3 | CENI66.E0P6#ZZZN441F | 8034122347004 | 4 | 899,00 | 3.596,00 | 10158 |
| 4 | CDCN60.E0P7#ZZZD461F | 8034122476704 | 2 | 879,00 | 1.758,00 | 10158 |
| 5 | CDCN60.E0P7#ZZZU461F | 8034122476728 | 2 | 845,26 | 1.690,52 | 10158 |
| 6 | CLVI20.E0P7#ZZZF461F | 8034122477183 | 2 | 1.450,00 | 2.900,00 | 10158 |
| 7 | CUZQ76.06P8#ZZZN461F | 8034122901077 | 4 | 865,00 | 3.460,00 | 10158 |
| 8 | CUZQ90.06P8#ZZZN461F | 8034122900940 | 20 | 1.550,00 | 31.000,00 | 10164 |
| 9 | CLUN90.E0P1#NEUI491F | - | 10 | 470,00 | 4.700,00 | 10170\|10173\|10172 |
| 10 | CPLN90.E5P2#ZZZI491F | - | 1 | 365,00 | 365,00 | 10170\|10173\|10172 |
| 11 | KCVJN.00#3 | 8034122707686 | 20 | 12,20 | 244,00 | 10170\|10173\|10172 |
| 12 | CFPN85.E2P2#ZZZQ490F | 8034122353739 | 1 | 488,00 | 488,00 | 10170\|10173\|10172 |
| 13 | KACL.796#4AF | 8034122709611 | 1 | 233,38 | 233,38 | 10170\|10173\|10172 |
| 14 | - | 8034122710938 | 3 | 42,05 | 126,15 | 10170\|10173\|10172 |
| 15 | CLVI20.E0P7#ZZZN461F | 8034122476933 | 3 | 1.600,00 | 4.800,00 | 10170\|10173\|10172 |
| 16 | CLVI20.E0P7#ZZZF461F | 8034122477183 | 2 | 1.450,00 | 2.900,00 | 10170\|10173\|10172 |
| 17 | CVXN85.E1P2#ZZZN490F | 8034122360546 | 4 | 500,00 | 2.000,00 | 10170\|10173\|10172 |
| 18 | CVXN85.E2P2#ZZZN491F | 8034122365640 | 8 | 355,00 | 2.840,00 | 10170\|10173\|10172 |
| 19 | CVJN90.E25P2#EU3490F | 8034122367477 | 1 | 265,00 | 265,00 | 10170\|10173\|10172 |
| 20 | CMUN90.E10P2#ZZZ3460F | 8034122366883 | 1 | 215,00 | 215,00 | 10170\|10173\|10172 |
| 21 | CPLI90.E23P2#EUI490F | 8034122367057 | 1 | 375,00 | 375,00 | 10170\|10173\|10172 |
| 22 | CMFI40.E14P2#EUN490F | 8034122368399 | 1 | 355,00 | 355,00 | 10170\|10173\|10172 |
| 23 | CMFI40.E14P2#EUI490F | 8034122368382 | 1 | 305,00 | 305,00 | 10170\|10173\|10172 |
| 24 | CVXN85.E0P2#ZZZN490F | 8034122368665 | 24 | 285,00 | 6.840,00 | 10170\|10173\|10172 |
| 25 | - | 8034122714424 | 9 | 55,86 | 502,74 | 10170\|10173\|10172 |
| 26 | CEIA00.E0P1#CRII491F | - | 1 | 317,00 | 317,00 | 10175 |
| 27 | CLUN60.E0P1#NEUI491F | - | 3 | 265,50 | 796,50 | 10175 |
| 28 | CLUN90.E0P1#NEUI491F | - | 10 | 275,00 | 2.700,00 | 10175 |
| 29 | CMKN60.E0P2#ZZZN490F | 8034122352169 | 30 | 295,50 | 8.865,00 | 10175 |
| 30 | CMKN90.E0P2#ZZZN490F | 8034122352183 | 10 | 295,50 | 2.955,00 | 10175 |
| 31 | CMHN90.E3P2#ZZZI410F | 8034122355221 | 2 | 450,00 | 900,00 | 10175 |
| 32 | CNBI90.E2P2#ZZZB400F | 8034122363226 | 1 | 335,50 | 335,50 | 10175 |
| 33 | CPLN90.E24P2#EUI490F | 8034122367361 | 2 | 425,00 | 850,00 | 10175 |
| 34 | - | 8034122714349 | 8 | 24,08 | 192,64 | 10175 |
| 35 | CSMI90.E3P2#ZZZB400F | 8034122368566 | 1 | 485,55 | 485,55 | 10175 |
| 36 | CMFI40.E14P2#EUN490F | 8034122368399 | 1 | 355,00 | 355,00 | 10175 |
| 37 | CMFI40.E14P2#EUI490F | 8034122368382 | 1 | 345,00 | 345,00 | 10175 |
| 38 | CVXN55.E0P2#ZZZN490F | 8034122368634 | 8 | 340,50 | 2.724,00 | 10175 |
| 39 | CVXN55.E0P2#ZZZA490F | 8034122368610 | 8 | 275,50 | 2.204,00 | 10175 |
| 40 | CVXN85.E0P2#ZZZN490F | 8034122368665 | 16 | 285,00 | 4.560,00 | 10175 |
| 41 | - | 8034122714585 | 10 | 8,03 | 80,30 | 10175 |
| 42 | - | 8034122714424 | 4 | 55,86 | 223,44 | 10175 |
| 43 | CPON90.E11P2#EUB490F | 8034122369204 | 1 | 375,00 | 293,74 | 10175 |
| 44 | CPOI90.E11P2#EUI490F | 8034122369174 | 1 | 365,50 | 365,50 | 10175 |
| 45 | KCQAN.00#N | 8034122711317 | 50 | 31,78 | 1.589,00 | 10175 |

### 6.4 Pruefregeln-Ergebnisse

| Regel | Ergebnis | Details |
|-------|----------|--------|
| `amount_vs_total` | BESTANDEN | SUM(amount)=104.209,50 == invoice_total=104.209,50 (diff=0,00) |
| `position_identifier` | BESTANDEN | Alle 45 Positionen haben EAN oder Artikelnr. |
| `qty_vs_packages` | BESTANDEN | SUM(qty)=295 == packages_count=295 (diff=0) |

### 6.5 Warnungen

Keine Warnungen. (`warnings: []`)

---

## Anhang: Erweiterungspunkte

### Neues Parser-Set erstellen

1. `logicdev_Pars-Units/_template_unit.py` kopieren
2. Klasse umbenennen, `unit_id` / `unit_name` / `version` setzen
3. `parse()` implementieren
4. Datei speichern -> automatische Erkennung

### Neue Pruefregel erstellen

1. `logicdev_Validation-Rules/_template_rule.py` kopieren
2. Als `rule_<name>.py` speichern
3. `rule_id` / `rule_name` / `severity` setzen
4. `validate()` implementieren
5. Datei speichern -> automatische Erkennung
