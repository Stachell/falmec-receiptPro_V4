#### LAGERPLATZ FEHLT / ZUORDNUNG: ####
> ORDNER - Location: "sample FEHLER LAGERPALTZ-ZUWEISUNG FEHLT+KDD_TEST - 4Artikel"

** FEHLERBESCHREIBUNG IM SYSTEM – POP-UP (SOLL ZWINGEND VORHANDEN BLEIBEN!!):
„Lagerplatzzuordnung nicht möglich: Bitte den Lagerplatz zuteilen."

** BESCHREIBUNG - USER: **
Falls kein Lagerplatz aus der Artikelliste gewählte werden kann, weil dieser nicht dem erwarteten Input entspricht, muss ein Hard-Fail erzeugt werden weil bei fehlerhaften Werten in der Upload-Datei der Upload fehl schlägt.
>> VERMERK: 
   - Es sind feste Lagerplätze aus dem ERP-System hinterlegt.
   - Diese sind unterteilt in Hauptlagerplätze und Nebenlagerplätze sowie "Nebenlagerplätze". Dies ist in der App auch so angelegt und hinterlegt.
   - I. d. R. wird der Hauptlagerplatz als Eingangs-Hauptlagerort übermittelt - das ist jedoch dynamisch und kann auch ein Nebenlagerort sein.
   - Sollten auch feste und strenge Regex haben:
>> HAUPTLAGERPLATZ 1: "WE LAGER;0;0;0"
>> HAUPTLAGERPLATZ 2: "WE KDD;0;0;0"
>> NEBENLAGERPLATZ 3: "KD;0;0;0"
>> NEBENLAGERPLATZ 4: "LKW5;0;0;0"
>> NEBENLAGERPLATZ 5: "LKW6;0;0;0"
>> NEBENLAGERPLATZ 6: "LKW7;0;0;0"

BEISPIELDATEI – generierter FEHLER:
>> geänderte Lagerplätze in der Artikelliste "Artikelauszug_31.01.2026_LAGERPLATZ FEHLT - KDD Zuweisung.xlsx" – 4 Artikel

## 1. Artikel 1 Lagerplatz auf  geändert:
Artikel: 103253	Bestellnummer: KACL.1036 — EAN: 8034122714349 - von "WE LAGER;0;0;0" auf "WE KDD;0;0;0" gestellt um das korrekte Routing zu testen.
—---
## 2. Artikel 2 Lagerplatz auf  geändert:
Artikel: 103819	Bestellnummer: KACL.1059 — EAN: 8034122714585 - von "WE LAGER;0;0;0" auf "KD;0;0;0" gestellt um das korrekte Routing zu testen.
—---
## 3. FEHLER 1 fehlender Lagerplatz-Eintrag:
Artikel: 100180	Bestellnummer: CLUN60.E0P1#NEUI491F — EAN: 8034122324289 - vorab eingetragene "WE LAGER;0;0;0" gelöscht - also fehlender Datensatz.

## FEHLER 2 falsche Regex des Lagerplatz-Eintrags:
Artikel: 100182	Bestellnummer: CLUN90.E0P1#NEUI491F — EAN: 8034122324876 - vorab eingetragene "WE LAGER;0;0;0" geändert mit falschem Regex-Eintrag: "lager,0,0".


### GEWÜNSCHTES ERGEBNIS VON ARTIKEL 1 UND ARTIKEL 2:
 - fehlerloses und korrektes Einspielen der Lagerorte, insofern in der Liste vorhanden und in korrekter Regex, da dies keinen Fehler darstellt, abbruch wäre Fehler.
 
### GEWÜNSCHTES ERGEBNIS VON FEHLERL 1 UND FEHLER 2:
 - Hard-Fail – Workflow stoppt! Bearbeiter MUSS um sich mit dem Fehler gezwungen auseinanderzusetzen eine Auswahl treffen, Hier bietet sich ein Dropdown-Menü zur Auswahl der verfügbaren Lagerplätze als Möglichkeit (vielleicht wie schon vorhanden in Tab "Lagerorte > bearbeiten > neues POP-Up dann erscheint Dropdown-Menü - nur das Dropdown-Menü im Fehler "Uebersicht" als auswahl wäre schon ausreichend) der Erledigung in Tab Fehler > FEHLER BEARBEITEN. 
	- In der Ubersicht gewählt soll die Auswahl den Workflow nicht mehr stoppen allerdings die Auswahl nicht persisntent speichern.
	- Wird in der Übersicht die Auswahl gewählt und anschließend "Loesung erzwingen" gewählt soll die Auswahl persistent bleiben, der Fehler als Erledigt, ähnlich wie die gründe Markierung der Checkbox Preisabweichung. Der Fehler KANN wieder geöffnet werden - muss nicht.
	- Wird in der Übersicht die Auswahl gewählt und anschließend "Lösung „Mail versenden“" gewählt soll die Auswahl persistent bleiben, der Fehler wie in der App vorgehesehen als "Auf Anfrage". Das soll für diesen Fehler den gleichen Status wie "Erledigt" haben.
		- von hier aus kann der Fehler aus kosmetik mit "Loesung erzwingen" erledigt werden.
		- oder er bleibt stehen Export.




