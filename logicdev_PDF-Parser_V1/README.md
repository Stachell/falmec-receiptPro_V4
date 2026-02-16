# devlogic PDF-PARSER_V1

Modularer PDF-Parser mit austauschbaren Parsing-Skripten und konfigurierbaren Validierungsregeln.

Entwickelt als eigenstaendiges Python-Modul, das in beliebige Projekte eingebunden werden kann. Die Kernlogik (PDF-Extraktion, Zeilengruppierung, Preisformatierung) ist fest, waehrend die Parsing-Logik pro Dokumenttyp als separates Skript bereitgestellt wird.

---

## Schnellstart

### 1. Umgebung einrichten

```
setup_env.bat
```

Erstellt eine virtuelle Python-Umgebung (`.venv/`) und installiert die Abhaengigkeiten (`pdfplumber`).

**Voraussetzung:** Python 3.10+ muss installiert und im PATH verfuegbar sein.

### 2. Test ausfuehren

```
logicdev_sample\run_test.bat
```

Liest die Konfiguration aus `TESTPARSING.txt`, parst die dort angegebene PDF-Datei und schreibt die Ergebnisse nach `test_output/`:

- `{Name}_result.json` - Vollstaendiges Ergebnis als JSON
- `{Name}_report.md` - Lesbare Uebersicht auf Deutsch (Zusammenfassung, Positionen, Pruefregeln, Hinweise)

### 3. Eigene PDF testen

1. PDF-Datei nach `logicdev_sample\test_pdfs\` kopieren
2. `logicdev_sample\TESTPARSING.txt` oeffnen
3. `pdf_file=` auf den Dateinamen aendern
4. `parsing_skript=` auf das passende Skript setzen
5. `run_test.bat` doppelklicken

---

## Projektstruktur

```
logicdev_PDF-Parser_V1/
|
|-- run_parse.py              CLI-Einstiegspunkt
|-- run_parse.bat              Schnellstarter (leitet an run_parse.py weiter)
|-- setup_env.bat              Erstellt .venv und installiert Abhaengigkeiten
|-- requirements.txt           Python-Abhaengigkeiten (pdfplumber)
|
|-- logicdev_Core/             KERN-ENGINE (nicht aendern)
|   |-- engine.py              PDFEngine - Hauptorchestrator
|   |-- text_extraction.py     PDF-Text-Extraktion mit Koordinaten (pdfplumber)
|   |-- line_grouper.py        Gruppiert Textelemente zu logischen Zeilen
|   |-- price_parser.py        EU-Preisformat (1.234,56) Parsing und Formatierung
|   |-- order_block_tracker.py Bestellreferenz-Tracking ueber Positionen
|   |-- unit_loader.py         Automatische Erkennung der Parsing-Skripte
|   |-- validation_runner.py   Automatische Erkennung und Ausfuehrung der Regeln
|   |-- models.py              Datenmodelle (ParseResult, ParsedLine, etc.)
|   |-- logger.py              Logging-Konfiguration
|   '-- __init__.py            Exportiert PDFEngine und alle Modelle
|
|-- logicdev_Pars-Units/       PARSING-SKRIPTE (erweiterbar)
|   |-- _base_unit.py          Abstrakte Basisklasse (nicht aendern)
|   |-- _template_unit.py      Vorlage fuer neue Skripte
|   '-- fattura_falmec_v1.py   Falmec Rechnungen (Fattura)
|
|-- logicdev_Validation-Rules/ PRUEFREGELN (erweiterbar)
|   |-- _base_rule.py          Abstrakte Basisklasse (nicht aendern)
|   |-- _template_rule.py      Vorlage fuer neue Regeln
|   |-- rule_qty_vs_packages.py  Summe Menge vs. Paketanzahl
|   '-- rule_position_identifier.py  Jede Position hat EAN oder Artikelnr.
|
|-- logicdev_sample/           TESTUMGEBUNG
|   |-- TESTPARSING.txt        Testkonfiguration (hier PDF und Skript eintragen)
|   |-- run_test.bat           Startet den Testdurchlauf
|   |-- test_pdfs/             PDF-Dateien hierhin kopieren
|   '-- test_output/           Ergebnisse erscheinen hier
|
'-- logicdev_API/              DASHBOARD (Vorbereitung, noch nicht aktiv)
    |-- schemas.py             Pydantic-Schemas fuer REST-API
    '-- README.md              Geplante Dashboard-Funktionen
```

---

## Wie der Parser funktioniert

Der Ablauf beim Parsen einer PDF-Datei:

```
PDF-Datei
   |
   v
[1] Text-Extraktion (pdfplumber)
   |  Jedes Wort mit X/Y-Koordinaten + Seitentext
   v
[2] Zeilengruppierung (line_grouper)
   |  Woerter mit aehnlicher Y-Position = eine Zeile
   |  Steuerbar ueber y_tolerance
   v
[3] Parsing-Skript (z.B. fattura_falmec_v1)
   |  Extrahiert Header-Daten und Positionen
   |  Nutzt Regex-Muster fuer Artikelnr., EAN, Preise
   v
[4] Validierung (Pruefregeln)
   |  Automatisch alle rule_*.py Dateien
   |  z.B. Summe Menge == Paketanzahl
   v
[5] Ergebnis (ParseResult)
      Header, Positionen, Warnungen, Pruefergebnisse
      -> JSON + Markdown-Report
```

### Kern-Engine (logicdev_Core)

Die Engine uebernimmt die schwere Arbeit:

- **PDFEngine** (`engine.py`): Orchestriert den gesamten Ablauf. Laedt die PDF, ruft das Parsing-Skript auf und fuehrt die Validierung durch.
- **Text-Extraktion** (`text_extraction.py`): Nutzt `pdfplumber` um jedes Wort mit exakten X/Y-Koordinaten zu extrahieren.
- **Zeilengruppierung** (`line_grouper.py`): Kombiniert Woerter auf gleicher Hoehe zu logischen Zeilen. Der Parameter `y_tolerance` steuert, wie nah Woerter sein muessen (Standard: 3.0, Falmec Fattura: 10.0).
- **Preisformate** (`price_parser.py`): Versteht europaeische Preise wie `1.234,56` und konvertiert sie zuverlaessig.

### Parsing-Skripte (logicdev_Pars-Units)

Jedes Skript ist fuer einen bestimmten Dokumenttyp zustaendig. Aktuell verfuegbar:

| Skript-ID | Beschreibung | Version |
|-----------|-------------|---------|
| `fattura_falmec_v1` | Falmec Rechnungen (Fattura) | 1.0.0 |

Skripte werden **automatisch erkannt** - einfach eine neue `.py`-Datei in den Ordner legen.

### Pruefregeln (logicdev_Validation-Rules)

Regeln laufen automatisch nach dem Parsing und pruefen die Ergebnis-Qualitaet:

| Regel | Prueft |
|-------|--------|
| `qty_vs_packages` | Summe aller Mengen == Paketanzahl im Header |
| `position_identifier` | Jede Position hat mindestens EAN oder Artikelnr. |

Neue Regeln werden automatisch erkannt wenn der Dateiname mit `rule_` beginnt.

---

## CLI-Nutzung

### Ueber Konfigurationsdatei

```
run_parse.bat --config logicdev_sample\TESTPARSING.txt
```

### Direkte Angabe

```
run_parse.bat --pdf pfad\zur\rechnung.pdf --unit fattura_falmec_v1
```

### Verfuegbare Skripte anzeigen

```
run_parse.bat --list-units
```

### Alle Optionen

| Option | Beschreibung |
|--------|-------------|
| `--config PFAD` | Pfad zur Konfigurationsdatei (TESTPARSING.txt) |
| `--pdf PFAD` | Direkter Pfad zur PDF-Datei |
| `--unit ID` | Parsing-Skript ID |
| `--pdf-dir PFAD` | Verzeichnis mit PDF-Dateien |
| `--output-dir PFAD` | Ausgabeverzeichnis |
| `--output-format` | `json`, `csv` oder `both` |
| `--list-units` | Zeigt verfuegbare Parsing-Skripte |
| `--log-level` | `DEBUG`, `INFO`, `WARNING`, `ERROR` |

---

## TESTPARSING.txt - Konfiguration

```ini
[test]

# --- PFLICHTFELDER ---

# Name der PDF-Datei (muss in test_pdfs\ liegen):
pdf_file=Fattura2026020007-SAMPLE-DL.pdf

# Parsing-Skript:
parsing_skript=fattura_falmec_v1

# --- OPTIONAL ---

# output_format=json
# y_tolerance=10.0
# run_validation=true
# log_level=INFO
```

| Feld | Standard | Beschreibung |
|------|---------|-------------|
| `pdf_file` | - | Dateiname der PDF (Pflicht) |
| `parsing_skript` | - | ID des Parsing-Skripts (Pflicht) |
| `output_format` | `json` | Ausgabeformat: `json`, `csv`, `both` |
| `y_tolerance` | `3.0` | Toleranz fuer Zeilengruppierung in PDF-Punkten |
| `run_validation` | `true` | Pruefregeln ausfuehren |
| `log_level` | `INFO` | Log-Detailgrad |

> **Hinweis:** Der alte Key `unit_id` wird weiterhin akzeptiert (Abwaertskompatibilitaet).

---

## Eigenes Parsing-Skript erstellen

1. `logicdev_Pars-Units/_template_unit.py` kopieren und umbenennen, z.B. `rechnung_firma_v1.py`

2. Klasse und Metadaten anpassen:
```python
class RechnungFirmaV1(BaseParsingUnit):
    unit_id = "rechnung_firma_v1"
    unit_name = "Firma Rechnungs-Parser"
    version = "1.0.0"
    description = "Parser fuer Firma-Rechnungen"
```

3. Die `parse()`-Methode implementieren. Verfuegbare Daten:
   - `pages` - Seitentext als Liste (fuer Regex-Suche im Header/Footer)
   - `grouped_lines` - Logische Zeilen mit Text und Koordinaten (fuer Positions-Parsing)
   - `raw_items` - Einzelne Woerter mit X/Y-Koordinaten (fuer praezise Analyse)

4. Datei speichern - wird automatisch beim naechsten Start erkannt.

### Hilfsmodule fuer eigene Skripte

```python
from logicdev_Core.price_parser import parse_price, format_price_eu
from logicdev_Core.order_block_tracker import OrderBlockTracker
```

- `parse_price("1.234,56")` -> `1234.56`
- `format_price_eu(1234.56)` -> `"1.234,56"`
- `OrderBlockTracker` verfolgt Bestellreferenzen ueber mehrere Positionen

---

## Eigene Pruefregel erstellen

1. `logicdev_Validation-Rules/_template_rule.py` kopieren und als `rule_mein_check.py` speichern

2. Klasse und Metadaten anpassen:
```python
class MeinCheckRule(BaseValidationRule):
    rule_id = "mein_check"
    rule_name = "Mein Check"
    severity = "warning"      # "info", "warning" oder "error"
```

3. Die `validate()`-Methode implementieren:
```python
def validate(self, result: ParseResult) -> dict:
    # result.header.fields -> Header-Daten (dict)
    # result.lines         -> Positionen (list[ParsedLine])
    total = sum(line.total_price for line in result.lines)
    passed = total > 0

    return {
        "rule_id": self.rule_id,
        "rule_name": self.rule_name,
        "passed": passed,
        "message": f"Gesamtsumme: {total}",
        "severity": "info" if passed else self.severity,
        "details": {"total": total},
    }
```

4. Datei muss mit `rule_` beginnen, dann wird sie automatisch erkannt.

---

## Programmatische Nutzung

Der Parser kann auch direkt in Python-Code eingebunden werden:

```python
from logicdev_Core import PDFEngine

engine = PDFEngine()

# Verfuegbare Skripte auflisten
units = engine.list_units()

# PDF parsen
result = engine.parse(
    pdf_path="rechnung.pdf",
    unit_id="fattura_falmec_v1",
    y_tolerance=10.0,
)

# Ergebnis nutzen
print(result.success)                              # True/False
print(result.header.fields["document_number"])      # "20.007"
print(len(result.lines))                            # 45

for line in result.lines:
    print(f"{line.manufacturer_article_no}  {line.ean}  {line.quantity_delivered}")

# Oder direkt als JSON
json_str = engine.parse_to_json("rechnung.pdf", unit_id="fattura_falmec_v1")
```

---

## Datenmodell

### ParseResult

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `success` | `bool` | Parsing erfolgreich |
| `header` | `ParsedHeader` | Header-Daten |
| `lines` | `list[ParsedLine]` | Geparste Positionen |
| `warnings` | `list[ParserWarning]` | Warnungen und Fehler |
| `validation_results` | `list[dict]` | Ergebnisse der Pruefregeln |
| `parser_unit` | `str` | Verwendetes Parsing-Skript |
| `parsed_at` | `str` | Zeitstempel (ISO) |
| `source_file_name` | `str` | Name der Quell-PDF |

### ParsedLine (Position)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `position_index` | `int` | Laufende Nummer |
| `manufacturer_article_no` | `str` | Hersteller-Artikelnummer |
| `ean` | `str` | EAN-Code |
| `description` | `str` | Beschreibung |
| `quantity_delivered` | `int` | Gelieferte Menge |
| `unit_price` | `float` | Einzelpreis |
| `total_price` | `float` | Gesamtpreis |
| `order_candidates` | `list[str]` | Bestellnummern |
| `order_status` | `str` | `"YES"`, `"NO"`, `"check"` |

### ParsedHeader

Generisches `fields`-Dictionary, Inhalt abhaengig vom Parsing-Skript.

Fuer `fattura_falmec_v1`:
- `document_number` - Rechnungsnummer
- `document_date` - Rechnungsdatum
- `packages_count` - Anzahl Pakete
- `invoice_total` - Rechnungsgesamt (TOTAL EUR)

---

## REST-API / React-Integration

Der Parser kann als lokaler REST-Server betrieben werden. Die React-App verbindet sich automatisch.

### Server starten

```
logicdev_API\run_server.bat
```

Der Server laeuft auf **Port 8090**. Die React-App erwartet ihn unter `http://localhost:8090`.

> **Wichtig**: Der Server muss gestartet sein **bevor** die React-App eine PDF verarbeitet.

### API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|-------------|
| `GET` | `/health` | Server-Status pruefen |
| `GET` | `/units` | Verfuegbare Parsing-Skripte auflisten |
| `POST` | `/parse` | PDF-Datei parsen (multipart/form-data) |

**POST /parse Parameter:**
- `file` (required) - PDF-Datei
- `unit_id` (optional, default: `fattura_falmec_v1`) - Parsing-Skript
- `y_tolerance` (optional, default: `10.0`) - Zeilengruppierungs-Toleranz
- `run_validation` (optional, default: `true`) - Pruefregeln ausfuehren

### Typischer Workflow (React + Python)

```
1. run_server.bat starten  (einmalig pro Session)
2. React-App starten (npm run dev)
3. PDF hochladen und "Neu verarbeiten" klicken
   -> React sendet PDF an http://localhost:8090/parse
   -> Parser liefert JSON-Ergebnis zurueck
   -> Step 1 zeigt "ok" / "soft-fail" / "failed"
```

---

## Voraussetzungen

- **Python 3.10+** (getestet mit 3.13)
- **pdfplumber, fastapi, uvicorn** (werden automatisch durch `setup_env.bat` installiert)
- **Windows** (BAT-Dateien fuer Testumgebung, Python-Code ist plattformunabhaengig)
