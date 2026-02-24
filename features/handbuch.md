# Handbuch: Die 5 KPI-Kacheln und ihre Prüfsignale

## Was sind die grünen Kacheln?

Im Run-Detail-Cockpit siehst du 5 Kacheln (Positionen, Artikel, Preise, Serials, Beleg), die dir den aktuellen Stand der Verarbeitung zeigen. Wenn eine Kachel **grün leuchtet** und ein kleines Häkchen-Icon in der rechten unteren Ecke erscheint, bedeutet das: **Das System hat diese Kachel automatisch geprüft und für vollständig und korrekt befunden.**

Das grüne Signal ist ein Vertrauens-Siegel — es zeigt dir, dass du diesen Bereich nicht mehr manuell nachprüfen musst.

Wichtig: Diese Prüfung läuft **live** im Hintergrund. Wenn du einen Schritt neu startest oder etwas korrigierst, aktualisiert sich das Siegel sofort.

---

## Kachel 1 — Positionen erhalten

**Was wird gezeigt:**
Die Zeile 3 zeigt den Gesamtbetrag der Rechnung, z. B. `12.345,67 € Gesamtsumme`.

**Wann wird die Kachel grün?**
Das System addiert die Einzelbeträge aller extrahierten Rechnungspositionen und vergleicht sie mit dem aufgedruckten Gesamtbetrag der Rechnung. Wenn die Differenz kleiner als **0,10 €** ist (Toleranz für Rundungsfehler), wird die Kachel grün.

**Was bedeutet es, wenn sie NICHT grün wird?**
Entweder konnte der Gesamtbetrag nicht aus der PDF gelesen werden, oder die Summe der Zeilen weicht stärker vom Rechnungsbetrag ab. Prüfe in diesem Fall die Rechnungsvorschau.

---

## Kachel 2 — Artikel extrahiert

**Was wird gezeigt:**
Die Zeile 3 zeigt die Paket-Anzahl laut Rechnungs-Header, z. B. `48 Artikel gelistet`.

**Wann wird die Kachel grün?**
Das System summiert die Mengenfelder (Qty) aller extrahierten Rechnungspositionen und vergleicht sie mit dem Paket-Anzahl-Feld im Rechnungs-Header. Wenn beide Zahlen exakt übereinstimmen, wird die Kachel grün.

**Was bedeutet es, wenn sie NICHT grün wird?**
Möglicherweise wurden nicht alle Positionen vollständig extrahiert, oder der Rechnung-Header enthält einen abweichenden Wert. Überprüfe die Artikelliste auf fehlende Positionen.

---

## Kachel 3 — Preise checken

**Was wird gezeigt:**
Die Zeile 3 zeigt Anzahl der Preisabweichungen oder fehlenden Preise (falls vorhanden).

**Wann wird die Kachel grün?**
Wenn **alle** geprüften Positionen einen korrekten Preis haben (keine Abweichungen, keine fehlenden Preise) und mindestens eine Position geprüft wurde, wird die Kachel grün.

**Was bedeutet es, wenn sie NICHT grün wird?**
Es gibt noch Preisabweichungen oder fehlende Preise. Du kannst in der Artikelliste einzelne Preise manuell überschreiben. Sobald alle Preise in Ordnung sind, wird die Kachel automatisch grün.

---

## Kachel 4 — Serials geparst

**Was wird gezeigt:**
Die Zeile 3 zeigt, wie viele Artikel **keine** Seriennummernpflicht haben, z. B. `12 ART. ohne S/N-PFLICHT`. Wenn generell keine Artikel Seriennummern benötigen, steht dort `Keine SN-Pflicht`.

**Wann wird die Kachel grün?**
Das System prüft, ob die Summe der Artikel mit Seriennummernpflicht **plus** die Summe der Artikel ohne Seriennummernpflicht exakt der Gesamtmenge aller Artikel entspricht. Kurz: Jeder Artikel muss eindeutig in eine der beiden Gruppen fallen — kein Artikel darf "verschwinden". Wenn diese Gleichung aufgeht, wird die Kachel grün.

**Was bedeutet es, wenn sie NICHT grün wird?**
Die Klassifizierung ist lückenhaft — einige Artikel sind weder als "S/N-pflichtig" noch als "S/N-frei" eingestuft. Das kann auf einen Fehler im Matcher-Schritt hinweisen.

---

## Kachel 5 — Beleg zugeteilt

**Was wird gezeigt:**
Die Zeile 3 zeigt, wie viele **eindeutige** Beleg-Nummern vergeben wurden, z. B. `3 Beleg-Nr. zugeteilt`. (Eine Beleg-Nummer kann dabei für mehrere Artikel genutzt werden — das ist normal.)

**Wann wird die Kachel grün?**
Alle drei Bedingungen müssen erfüllt sein:

1. **Vollständigkeit:** Alle Rechnungspositionen haben eine zugewiesene Bestellnummer.
2. **Mindestens eine Beleg-Nummer:** Es wurde überhaupt eine Bestellung zugeteilt.
3. **Formatprüfung:** Jede (einzigartige) Beleg-Nummer hat das korrekte Falmec-Format `YYYY-XXXXX`:
   - `YYYY` ist entweder `0000` oder ein Jahr im gültigen Bereich (ca. ±20 Jahre vom aktuellen Jahr).
   - `XXXXX` sind genau 5 Ziffern und beginnen mit einer der zulässigen Präfixe: `10`, `11`, `12`, `20`, `97`, `98` oder `99`.

**Was bedeutet es, wenn sie NICHT grün wird?**
Entweder sind noch nicht alle Positionen einer Bestellung zugewiesen, oder eine Beleg-Nummer hat ein ungewöhnliches Format (z. B. Tippfehler des Lieferanten). In diesem Fall solltest du die Artikelliste auf rot markierte Positionen prüfen.

---

## Zusammenfassung der 5 Prüfsignale

| Kachel | Zeile 3 | Prüfbedingung (kurz) |
|---|---|---|
| 1 — Positionen | Rechnungsgesamtbetrag | Zeilensumme ≈ Rechnungsbetrag (< 0,10 € Differenz) |
| 2 — Artikel | Paket-Anzahl laut Header | Qty-Summe aller Zeilen = packagesCount |
| 3 — Preise | Abweichungen / Fehlende | 0 Abweichungen UND mind. 1 Preis geprüft |
| 4 — Serials | Artikel ohne S/N-Pflicht | Ohne-S/N + Mit-S/N = Gesamtmenge |
| 5 — Beleg | Eindeutige Beleg-Nummern | Alle zugeteilt + Formatprüfung bestanden |

---

*Dieser Text wird unter `docs/handbuch.TXT` abgelegt und kann dem Enduser als Referenz ausgehändigt werden.*
