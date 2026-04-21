#### PREISABWEICHUNG - Rechnungssumme - Rechnungsdaten: ####
> ORDNER - Location: "sample FEHLER ARTIKELSUMMIERUNG-PDF-RECHNUNG -Gesamtrechnungssumme - 0Artikel"

** FEHLERBESCHREIBUNG IM SYSTEM – POP-UP (SOLL ZWINGEND VORHANDEN BLEIBEN!!):
>> VERMERK: Erscheint im Feld Tab "RE-Positionen" - darf ebenfalls so bleiben
Hinweise (1)
Preissumme 102299.50 != Rechnungstotal 102349.50 (Diff: 50.00)



** BESCHREIGUNG - USER: **
Das ist der einzige Punkt, in welcher das ERP keinen konsistenten Wert erwartet – ABER hier greift unser interner Firmen-Workflow, denn die Buchhaltung muss über derartige Preisänderung informiert werden. 
In diesem speziellen Fehler könnten aber auch Rabatte, etc. vorhanden sein. Daher diesen FEHLER als SOFT-FAIL behandeln und gleich behandeln wie der FEHLER "FIFO". 


BEISPIELDATEI – generierter FEHLER:
>> geänderte Preise in der fattura – Allerdings im Abgleich der Gesamtsumme - daher 0 Artikel direkt betroffen.

## FEHLER 1:
Hinweise (1)
Preissumme 102299.50 != Rechnungstotal 102349.50 (Diff: 50.00)

### GEWÜNSCHTES ERGEBNIS:
 - Checkfeld Schild – Warning! Bearbeiter MUSS um sich nicht zwingend mit dem Fehler auseinanderzusetzen, aber eine Mitteilung an die Buchhaltung via Mail ist wünschenswert. 
 - Lösung „Mail versenden“ soll ohne Vor-Auswahl möglich sein.
 -	Kein Stop des Workflows > SOFT FAIL.
 -  Blockieren des Doppelcheck-Feldes Ebene 2 (rein optische Einordnung für Bearbeiter) - "Positionen eingelesen" 
 -	Bei Lösung erzwingen, ohne Vorauswahl möglich machen, Checkfeld Stufe 2 – Kachel: "Positionen eingelesen" NICHT freigeben
 -	Bei Lösungsdurchführung „Email senden“, Freigabe des Workflow und der Erstellung der Export-Datei,  Checkfeld Stufe 2 – Kachel: "Positionen eingelesen" ALS POSITIV freigeben (gewollter Arbeitsweg, daher optische Freigabe des Checkfelds). Weiterer Weg dieser Lösung, z.B. Anfrage bleibt schwebend offen, etc. soll beibehalten werden.


### ZUSATZ:
Die Fehlermeldung reiht sich im Tab RE-Positionen ein, das ist okay, aber vielleicht könnte man das gleich zu den anderen Fehlern in den Tab "Fehler" mit der Meldung die bei Softfail üblicherweise erzeugt wird in gleicher Optik - wie z.B. 
BEISPIEL:
 - PREISABWEICHUNG: „Preisabweichung: Der Rechnungspreis weicht vom Sage-Preis ab. Preis manuell anpassen oder Abweichung per E-Mail klaeren."
oder
 - FIFO: „STEP 4 - BESTELLZUWEISUNG FIFO Zuweisung: Keine Belegnummer aus dem PDF erkannt. "Zuordnung erfolgte nur nach FIFO-Regel (aelterste zuerst). Belegnummer im PDF oder des offenen Bestell-Verzeichnises pruefen."


