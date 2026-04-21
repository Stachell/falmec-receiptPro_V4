#### PREISABWEICHUNG: ####
> ORDNER - Location: "sample FEHLER PREISABWEICHUNG-ARTIKEL - 8Artikel"

** FEHLERBESCHREIBUNG IM SYSTEM – POP-UP (SOLL ZWINGEND VORHANDEN BLEIBEN!!):
„Preisabweichung: Der Rechnungspreis weicht vom Sage-Preis ab. Preis manuell anpassen oder Abweichung per E-Mail klaeren."

** BESCHREIBUNG - USER: **
Das ist der einzige Punkt, in welcher das ERP keinen konsistenten Wert erwartet – ABER hier greift unser interner Firmen-Workflow, denn die Buchhaltung muss über derartige Preisänderung informiert werden. Der Fehler soll daher ebenfalls ein Hard-Fail sein und vor Erstellung der Export-Datei blockieren, um den Bearbeiter zu zwingen in der Fehlerbearbeitung entweder den Fehler durch „Loesung erzwingen“ oder durch das Senden einer Mail zu bearbeiten. Anders als andere Fehler soll hier die Blockade nicht nur bei „Loesung erzwingen“ aufgehoben werden, sondern auch sobald eine Mail gesendet wurde. Das Doppelcheckfeld der Kachel „Preise geprüft“ soll ebenfalls bei „Loesung erzwingen NICHT positiv aktiviert werden, aber falls eine Mail gesendet wird. Hintergrund: das ist der vorgesehene Weg bei diesem Fehler die Buchhaltung via Mail zu informieren, so dass diese prüfen kann. 


BEISPIELDATEI – generierter FEHLER:
>> geänderte Preise in der fattura – 8 Artikel

## FEHLER 1:
[Warnung] Pos 1: Preisabweichung PDF-Rechnung 209.09€ vs. Sage ERP 219.09€
102958 — PDF-Rechnung 209.09€, Sage ERP 219.09€
Pos.: 1  |  Artikel: 102958  |  Bestellnummer: KACL.457#NF  |  EAN: 8034122713656  |  Menge: 1  |  Preis: PDF-Rechnung: 209.09 EUR / Sage ERP: 219.09 EUR  |  S/N: JA - K25661813002K  |  Bestellung: "2026-10153"---
---
## FEHLER 2:
[Warnung] Pos 9: Preisabweichung PDF-Rechnung 275.00€ vs. Sage ERP 470.00€
100182 — PDF-Rechnung 275.00€, Sage ERP 470.00€
Pos.: 9  |  Artikel: 100182  |  Bestellnummer: CLUN90.E0P1#NEUI491F  |  EAN: 8034122324876  |  Menge: 1  |  Preis: PDF-Rechnung: 275.00 EUR / Sage ERP: 470.00 EUR  |  S/N: JA - K25673602001K  |  Bestellung: "2026-10124"
---
## FEHLER 3:
[Warnung] Pos 23: Preisabweichung PDF-Rechnung 345.00€ vs. Sage ERP 305.00€
103341 — PDF-Rechnung 345.00€, Sage ERP 305.00€
Pos.: 23  |  Artikel: 103341  |  Bestellnummer: CMFI40.E14P2#EUI490F  |  EAN: 8034122368382  |  Menge: 1  |  Preis: PDF-Rechnung: 345.00 EUR / Sage ERP: 305.00 EUR  |  S/N: JA - K25661208009K  |  Bestellung: "2026-10172"
---
## FEHLER 4:
[Warnung] Pos 26: Preisabweichung PDF-Rechnung 317.00€ vs. Sage ERP 327.00€
100073 — PDF-Rechnung 317.00€, Sage ERP 327.00€
Pos.: 26  |  Artikel: 100073  |  Bestellnummer: CEIA00.E0P1#CRII491F  |  EAN: 8034122306322  |  Menge: 1  |  Preis: PDF-Rechnung: 317.00 EUR / Sage ERP: 327.00 EUR  |  S/N: JA - K25661103009K  |  Bestellung: "2026-10175"
---
## FEHLER 5:
[Warnung] Pos 28: Preisabweichung PDF-Rechnung 275.00€ vs. Sage ERP 470.00€
100182 — PDF-Rechnung 275.00€, Sage ERP 470.00€
Pos.: 28  |  Artikel: 100182  |  Bestellnummer: CLUN90.E0P1#NEUI491F  |  EAN: 8034122324876  |  Menge: 1  |  Preis: PDF-Rechnung: 275.00 EUR / Sage ERP: 470.00 EUR  |  S/N: JA - K25673602025K  |  Bestellung: "2026-10175"
---
## FEHLER 6:
[Warnung] Pos 32: Preisabweichung PDF-Rechnung 335.50€ vs. Sage ERP 325.50€
101681 — PDF-Rechnung 335.50€, Sage ERP 325.50€
Pos.: 32  |  Artikel: 101681  |  Bestellnummer: CNBI90.E2P2#ZZZB400F  |  EAN: 8034122363226  |  Menge: 1  |  Preis: PDF-Rechnung: 335.50 EUR / Sage ERP: 325.50 EUR  |  S/N: JA - K25645510008K  |  Bestellung: "2026-10175"
---
## FEHLER 7:
[Warnung] Pos 33: Preisabweichung PDF-Rechnung 425.00€ vs. Sage ERP 405.00€
103237 — PDF-Rechnung 425.00€, Sage ERP 405.00€
Pos.: 33  |  Artikel: 103237  |  Bestellnummer: CPLN90.E24P2#EUI490F  |  EAN: 8034122367361  |  Menge: 1  |  Preis: PDF-Rechnung: 425.00 EUR / Sage ERP: 405.00 EUR  |  S/N: JA - K25609405010K  |  Bestellung: "2026-10175"
---
## FEHLER 8:
[Warnung] Pos 37: Preisabweichung PDF-Rechnung 345.00€ vs. Sage ERP 305.00€
103341 — PDF-Rechnung 345.00€, Sage ERP 305.00€
Pos.: 37  |  Artikel: 103341  |  Bestellnummer: CMFI40.E14P2#EUI490F  |  EAN: 8034122368382  |  Menge: 1  |  Preis: PDF-Rechnung: 345.00 EUR / Sage ERP: 305.00 EUR  |  S/N: JA - K25661208010K  |  Bestellung: "2026-10175"
---

### GEWÜNSCHTES ERGEBNIS:
 - Checkfeld Schild – Warning! Bearbeiter MUSS um sich mit dem Fehler gezwungen auseinanderzusetzen eine Auswahl treffen, dann umstellen auf Checkfeld blau – manuelle Bearbeitung und anschließend kann „Loesung erzwingen“ aktiviert werden.
 - Lösung „Mail versenden“ soll ohne Vor-Auswahl möglich sein.
 -	Zwingend Stop des Workflows > HARD FAIL vor Export.
 -	Bei Lösung erzwingen, Freigabe des Workflow und der Erstellung der Export-Datei,  Checkfeld Stufe 2 – Kachel: Preise geprüft NICHT freigeben
 -	Bei Lösungsdurchführung „Email senden“, Freigabe des Workflow und der Erstellung der Export-Datei,  Checkfeld Stufe 2 – Kachel: Preise geprüft ALS POSITIV freigeben (gewollter Arbeitsweg, daher optische Freigabe des Checkfelds). Weiterer Weg dieser Lösung, z.B. Anfrage bleibt schwebend offen, etc. soll beibehalten werden.




