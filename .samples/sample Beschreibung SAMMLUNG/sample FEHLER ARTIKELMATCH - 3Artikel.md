#### ARTIKELMATACH / ZUORDNUNG FEHLT KOMPLETT / TEILWEISE: ####
> ORDNER - Location: "sample FEHLER ARTIKELMATCH - 3Artikel"
** USER-VERMERK: Diesen Vorgang habe ich am meisten von allen getestet - er gefällt mir im Design und vorgehen gut, kann ggf. als Vorlage für andere Fehler dienen die ähnliche Eingabemöglichkeiten benötigen weil **NOCH** keine Vorauswahl als Drop-Down-Möglichkeit vorhanden ist.

** FEHLERBESCHREIBUNG IM SYSTEM – POP-UP (SOLL ZWINGEND VORHANDEN BLEIBEN!!):
„Artikelnummer/EAN nicht im Stamm: Artikelstamm aktualisieren oder Artikelnummer in der Rechnung pruefen. Der Stamm muss die Herstellerartikelnummer enthalten."

** BESCHREIBUNG - USER: **
Falls keine Zuordnung des Artikels entweder zu EAN oder zu Bestellnummer bzw. Herstellerartikel-Nummer (SOFTFAIL) oder schlimmsten Falls beidegar nicht - dann schlägt die Zuordung des Arikels fehl  (HARD-FAIL!)
>> VERMERK:
   - Ohne Artikelzuordnung kann keine Export-Datei erstellt werden - Hard Fail und Workflow-Stop - wichtig.
   - Eine Zuordnung mit EAN ODER (statt und) Bestellnummer bzw. Herstellerartikel-Nummer kann vorkommen, der User sollte darüber informiert werden so das er entscheiden kann ob das bekannt ist oder er der Sache nachgeht.
		- Er sieht es zum einen als visueller Vermerk in der Body Tabelle "ARTIKEL-MATCH" im Tab "RE-Positionen" + "Artikelliste"
		- Als Soft-Warning Schild im Fehler-Center wäre wünschenswert - als Hinweis so ähnlich wie bei anderen Fehlern, als Beispiel: "Artikelnummer/EAN nicht im Stamm: Artikelstamm aktualisieren oder Artikelnummer in der Rechnung pruefen. Der Stamm muss die Herstellerartikelnummer enthalten." mit der Licht-Icon vorne dran.
		- Der Fehlerbody soll ebenfalls nur als Warning fungieren und ähnlich wie FIFO behandelt werden.
		- KEIN STOP des Workflows!! - Lediglich blockieren des visuellen Checkfeldes Ebene 2 - für den User in Kachel 2 "Positionen extrahiert" nicht freigeben. 
   
## 1. Artikel 1 EAN gelöscht:
Artikel: 100414	
	- Bestellnummer/Hersteller-Art-Nr.: "CENI66.E0P6#ZZZN441F"
	- EAN: "8034122347004"
	- BEZEICHNUNG (DE): "DAMA IS 60CM - GUNMETAL"
		>> ** VORAB im innerhalb der Zeile die Zelle "EAN" - also den Wert "8034122347004" gelöscht. **
		>> ** Zuordnung ausschließlich über die Bestellnummer bzw. Herstellerartikel-Nummer. (SOFT!) **
—---
## 2. Artikel 2 Bestellnummer bzw. Herstellerartikel-Nummer gelöscht:
Artikel: 101921	
	- Bestellnummer/Hersteller-Art-Nr.: "CDCN60.E0P7#ZZZD461F"
	- EAN: "8034122476704"
	- BEZEICHNUNG (DE): "DAMA IS 60CM - GUNMETAL"
		>> ** VORAB im innerhalb der Zeile die Zelle "Bestellnummer bzw. Herstellerartikel-Nummer" - also den Wert "CDCN60.E0P7#ZZZD461F" gelöscht. **
		>> ** Zuordnung ausschließlich über die EAN-Nummer. (SOFT!) **
—---
## 3. FEHLER 1 fehlender Lagerplatz-Eintrag:
Artikel: 101560 
	- "ARTIKELNR (Falmec)*": "101560"
	- BEZEICHNUNG (DE): "AURA 120"	
	- Bestellnummer/Hersteller-Art-Nr.: "CAEI20.E0P2#ZZZB461F" 
	- EAN: "8034122354507" 
	- Lieferant "70001" 
	- Bestellnummer (JJJJ-XXXX): "2026-10175"
	- Wareneingangslager: "WE LAGER;0;0;0"
		>> ** VORAB im die ganze Artikelzeile gelöscht. Der Artikel ist in dieser Testdatei nicht mehr vorhanden! **

### GEWÜNSCHTES ERGEBNIS VON ARTIKEL 1 UND ARTIKEL 2 (SOFT-FAIL):
 - fehlerloses und korrektes Einspielen des Lagerorte, insofern in der Liste vorhanden und in korrekter Regex, da dies keinen Fehler darstellt, abbruch wäre Fehler.
 - die Checkllisten in den Tab-Reitern "Artikelliste" und "RE-Positionen" zeigen das jeweilige Checkfeld als visuelle "Warnung".
 - Im Tab Fehler ist eine Warnhinweiß mit einem Licht-Icon vorhanden
 - Im Body sind Warnings, die wie die FIFO jedoch nicht zwingend behandelt werden MÜSSEN.
 - Kachel 2 "Positionen extrahiert" gibt zweite Check-Ebene (nur visuell - nicht Ebene1 diese ist Workflow-relevant) nicht frei.
 
### GEWÜNSCHTES ERGEBNIS VON FEHLERL 1 (HARD-FAIL / BLOCK):
 - Hard-Fail – Workflow stoppt! Bearbeiter MUSS um sich mit dem Fehler gezwungen auseinanderzusetzen, im Tab Fehler kann er im Fehler Body auf (Fehler) "bearbeiten" klicken - dort sieht er eine Maske und kann die fehlenden Daten eintragen.
 - Die Daten können in der Maske aktualisiert bzw. nachgetragen werden. Dann auf speichern, und die Daten funktionieren für den weiteren Worfklow (insofern sie der Bearbeiter korrekt und Regex-konform eingetragen hat).
 - Klingt man auf "Lösung anwenden" sieht man die Auswahl nochmal und kann sie sichten und schlussendlich nochmal "loesung anwenden" klicken und dann bleibt der Eintrag für den Run persistent gespeichert, bis ich den Fehler wieder eröffne. 
 ** USER-VERMERK: Diesen Vorgang habe ich am meisten von allen getestet - er gefällt mir im Design und vorgehen gut, kann ggf. als Vorlage für andere Fehler dienen die ähnliche Eingabemöglichkeiten benötigen weil **NOCH** keine Vorauswahl als Drop-Down-Möglichkeit vorhanden ist.