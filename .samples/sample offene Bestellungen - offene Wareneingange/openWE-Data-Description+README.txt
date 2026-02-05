## Offene Bestellpositionen / noch nicht gelieferte Artikel `<openWE>` 📦

### Dokumentbeschreibung
CSV-Auszug aller aktuell bestellten, aber noch nicht gelieferten Artikel. Jede Zeile entspricht einer Bestellposition inkl. **Belegnummer**, **Vorgang** und **offener Menge**.  
**Regel:** Alle Spalten, die nicht als „wichtig“ benannt sind, werden als `"ignore"` behandelt.

### Dateiformat & Aufbau
- Datei: `openWE-Beispeil.csv`
- Typ: CSV (Semikolon-getrennt)
- Trennzeichen: `;`
- Encoding: `ISO-8859-1`
- Header: Ja – **erste Zeile** ist der Spaltenheader (kein zusätzlicher Report-Header)
- Datenumfang: **439** Datensätze, **23** Spalten

### Wichtige Spalten (nur diese werden verarbeitet)
1) `<Liefernat#>` (Lieferant)  
- Lieferantennummer (in dieser Datei konstant `70001`)

2) `<ean>` (EAN-Nummer)  
- EAN / Barcode (Hinweis: in dieser Datei **108** Datensätze ohne EAN → nicht inferieren)

3) `<article#IT>` (Bestellnummer)  
- Herstellerartikelnummer (IT) (Hinweis: in dieser Datei **14** Datensätze ohne Bestellnummer → nicht inferieren)

4) `<vorgang>` (Vorgang)  
- Vorgangsnummer des Bestell-Workflows (Sage)

5) `<orderYear>` (Jahr)  
- Bestelljahr (in dieser Datei konstant `2025`)

6) `<Belegnummer>` (Belegnummer)  
- zentrale Bestell-Belegnummer zur Zuordnung (sehr wichtig)

7) `<article#DE>` (Artikelnummer)  
- zusätzliche Artikelnummer (DE / intern)

8) `<articleDescriptionDE>` (Artikelmatchcode)  
- Artikelbeschreibung deutsch (Matchcode)

9) `<openDeliveryPz>` (<Offene Menge (vorgangsbezogen))  
- offene Menge innerhalb des Vorgangs  
- Wichtig: Spaltenname ist in der Datei exakt so vorhanden und beginnt mit `<` (ohne schließendes `>`)

10) `<openDeliveryOrderPz>` (Menge Belegposition)  
- ursprüngliche Bestellmenge der Position (ohne Abzug evtl. bereits gelieferter Mengen)

11) `<pricetax>` (Preiskennzeichen)  
- Netto/Brutto Kennzeichen (in dieser Datei konstant `Netto`)

12) `<articlegroup#>` (Artikelgruppe_Wert)  
- Artikelgruppe als Zahlenwert

13) `<articlegroupDescription>` (Artikelgruppe_Bezeichnung)  
- Artikelgruppe als Text

### `"ignore"`-Spalten (nicht verarbeiten)
- Bezeichnung 2
- Liefertermin Belegposition
- Referenznummer
- ME
- Erfüllt Vorgang
- Erfüllt Position
- Wkz_Wert
- Wkz_Bezeichnung
- Besteuerungsart_Wert
- Besteuerungsart_Bezeichnung

### Validierungs- und Kontrollregeln (Soft-Fail statt Erfindung)
- `openQty` und `orderedQty` müssen Ganzzahlen `>= 0` sein.
- `openQty <= orderedQty`  
  - Wenn `openQty > orderedQty` → **Soft-Fail + UI-Korrektur**.
- Fehlende `EAN-Nummer` oder `Bestellnummer` **nicht** ergänzen/erraten.
- Matching-/Primärschlüssel-Vorschlag: `(Belegnummer, Vorgang, Artikelnummer, Bestellnummer)`.

### README (Kurztext)
`<openWE>` ist eine CSV-Liste offener Bestellpositionen aus Sage. Pro Zeile wird eine Bestellposition mit Belegnummer und Vorgang geführt, sowie der offenen Menge je Position. Es werden ausschließlich die definierten wichtigen Felder verarbeitet; alle übrigen Spalten sind `"ignore"`. Fehlende EAN oder IT-Bestellnummern werden nicht inferiert. Mengen werden plausibilisiert (open <= ordered); bei Abweichungen Soft-Fail mit UI-Korrektur.
