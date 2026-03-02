# Search Fix Diagnose

## Kontext
Diese Diagnose betrifft die offene Suche im Run-Detail in:
- Artikelliste
- RE-Positionen

Wichtig: Der Dropdown-Filter funktioniert laut Anforderung korrekt und wird in der geplanten Massnahme NICHT veraendert.

## Befund (Ist-Zustand)
Es gibt ein reales Suchproblem bei vollstaendigen Artikelnummern.
Symptom: Treffer brechen beim Tippen nach wenigen Zeichen ab (z. B. nach der 4. Stelle), obwohl die Nummer fachlich korrekt ist.

## Technische Analyse
### 1) Suchlogik ohne Normalisierung
Die offene Suche in beiden Tabellen nutzt `includes(term)` auf Feldern wie `manufacturerArticleNo`, `ean` etc., jedoch ohne Zeichen-Normalisierung.

Referenzen:
- `src/components/run-detail/ItemsTable.tsx` (Filterlogik um Zeile 95-109)
- `src/components/run-detail/InvoicePreview.tsx` (Filterlogik um Zeile 188-205)

### 2) Parser kann Trennzeichen/Leerzeichen in Artikelnummern erzeugen
Im Parser werden PDF-Textfragmente zusammengefuehrt. Bei Abstand (`gap > 3`) wird ein Leerzeichen eingefuegt.

Referenz:
- `src/services/parsers/modules/FatturaParser_Master.ts` (`concatItemsText`, ca. Zeile 163-173)

### 3) Warum der Fehler auftritt
Wenn intern z. B. `KACL .457#NF` steht und der Benutzer `KACL.457#NF` eingibt,
dann passt `includes()` nur bis `KACL`.
Ab dem Punkt ohne identische Zeichenfolge (`.` vs. ` <leer>`) gibt es keinen Treffer mehr.

## Auswirkung
- Betroffen: offene Suche in Artikelliste und RE-Positionen
- Nicht betroffen: Dropdown-Filter (separate Logik)
- Risiko: Benutzer verliert Vertrauen in Suchfunktion bei exakten IDs

## Reproduktionsschema
1. Run-Detail oeffnen.
2. In der offenen Suche eine vollstaendige Artikelnummer eingeben.
3. Beobachten: Treffer vorhanden bei Prefix, aber Abbruch bei spaeteren Zeichen.
4. Vergleichswert aus Tabelle pruefen: Enthaltene Sonderzeichen/Leerzeichen koennen von Eingabe abweichen.

## Plan (ohne Dropdown-Aenderung)
### Phase 1: Such-Normalisierung standardisieren
- Zentrale Hilfsfunktion fuer Suchvergleich definieren (z. B. lowercase + trim + Entfernen von Leerzeichen/Sondertrennzeichen fuer Vergleichsschluessel).
- Felder und Suchterm vor dem Vergleich gleich normalisieren.
- Verhalten fuer EAN numerisch robust halten (optional: nur Ziffernvergleich).

### Phase 2: Beide Tabellen auf dieselbe Suchstrategie bringen
- Artikelliste: offene Suche auf normalisierten Vergleich umstellen.
- RE-Positionen: offene Suche identisch umstellen.
- Dropdown-Filter unveraendert lassen.

### Phase 3: Absicherung mit Tests
- Unit-Tests fuer Normalisierung:
  - Punkt/Leerzeichen/Bindestrich/Slash/# Varianten
  - Gross-/Kleinschreibung
  - Fuehrende/abschliessende Leerzeichen
- Komponentennahe Tests fuer beide Filterpfade (Artikelliste + RE-Positionen).

### Phase 4: Manuelle Abnahme
- Beispielwerte mit und ohne Trennzeichen pruefen.
- Exakte Artikelnummern, EAN, Positionsnummern und Mischsuche pruefen.
- Sicherstellen: Dropdown-Filter bleibt unveraendert funktional.

## Entscheidung
Der Fehler ist fachlich plausibel und technisch belegbar.
Empfehlung: Umsetzung von Phase 1-4 als gezielter Such-Fix ohne Eingriff in die Dropdown-Filterlogik.
