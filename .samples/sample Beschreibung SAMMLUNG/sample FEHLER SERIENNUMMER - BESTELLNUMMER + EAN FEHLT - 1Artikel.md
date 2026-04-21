#### SERIENNUMMER: BESTELLNUMMER BZW. HERSTELLERARTIKEL-Nummer UND EAN-Nummer fehlt (Parsing-Serial schlägt fehl!) ####
> ORDNER - Location: "sample FEHLER SERIENNUMMER - BESTELLNUMMER + EAN FEHLT - 1Artikel"
> VERMERK: BESTELLNUMMER = HERSTELLERARTIKELNUMMER

** FEHLERBESCHREIBUNG IM SYSTEM – POP-UP (NICHT VORHANDEN - SOLLTE FÜR FLÜSSIGE OPTIK UND ABLAUF NACHGETRAGEN WERDEN!!):
-- AKTUELL KEINE STATUSMELDUNG FÜR DIESEN FEHLER VORHANDEN - BITTE OPTISCH UND IM ABLAUF GLEICH ZU DEN BESTEHENDENDEN / ERSTELLEN UND SINNGEMÄß:
„Zuweisung der Seriennummer nicht möglich. Herstellerartikelnummer bzw. Bestellnummer oder EAN-Nummer zur Zuordnung der Seriennummer nicht vorhanden"

### BESCHREIBUNG - USER: **
Die Seriennummer wird von Produkten mit Seriennummernpflicht > "JA" aus dem Warenbegleitdokument geparst. In dem Warenbegleitdokument in welchem die Seriennummern übermittelt werden i.d.R. im besten Fall mit den Werten "EAN" und "Herstellerartikelnummer/Bestellnummer" übermittelt, falls keiner dieser Werte übermittelt oder vorhanden ist schlägt die Zuweisung fehl - der Import ebenfalls.
Um die App konsistent zu halten sollten beide Werte für das Parsing geprüft werden, falls beide Werte im Warenbegleitdokument nicht vorhanden sind, schlägt der Upload fehl, daher muss der Workflow angehalten werden bzw. blockiert werden.
>> Daher MUSS dieser Fehler ein **HART FAIL** sein und eine Blockade des Workflows auslösen - der User MUSS sich damit befassen. Die Workflow relevante Checkebene 1 sowie die visuelle Doppelcheck Ebene 2 dürfen nicht freigebeben werden.


BEISPIELDATEI – generierter FEHLER:
>> gelöschte Bestellnummer bzw. HERSTELLERARTIKEL-Nummer UND gelöschte EAN-NUmmer im Warenbegleitschein "ndmatricolek..." – 1 Artikel

ZEILE:
31.01.2026 > 20007 > CAPPA ELIOS ANGOLO/CORNER 100 C0001 CROMATO INOX CONO INOX 220-240V 50-60Hz T80 C/FILTRO IMB. FALMEC > K25661103009K > ELIOS 100 ED								
>> Fehlende EAN-Nummer: "8034122306322"
>> Fehlende Bestellnummer bzw. HERSTELLERARTIKEL-Nummer: "CEIA00.E0P1#CRII491F"

### Fehlerbearbeitung:
- Fehler soll über eine Eingabemaske, eine Vorlage dazu kann die Maske "Stammdaten/EAN nicht zugeordnet" darstellen, diese Maske bietet die Möglichkeit die Daten zu ergänzen oder zu korrigieren.
	- Vermerk: Innerhalb der Maske kann die Bestellnummer bzw. HERSTELLERARTIKEL-Nummer eingetragen werden - aber auch direkt die fehlende Seriennummer. 

### GEWÜNSCHTES ERGEBNIS:
Der Hard fail muss Checkebene 1 und den Workflow stoppen.
Der Bearbeiter MUSS sich ZWINGEND mit dem Fehler auseinandersetzen.
	**2 LÖSUNGEN ANWENDBAR**:
	a.) Seriennummernpflicht auf "NEIN" setzen im Tab Fehlerbearbeiten / dann als Loesung erzwingen oder Mail senden. 
		- Der Workflow erhält Freigabe, die erste Checkfeld Ebene "Serials geparst" ist frei
		- Das Doppel-Check-Feld Ebene 2 (rein visuell) wird nicht freigeben, die Kachel erhält nur die Freigabe auf Ebene 1 (Workflow-Relevant) in der Kachel "Serials geparst".
    b.) Serial wird mit korrekter Regex eingetragen und Loesung erzwingen.
		- Durch Loesung erzwingen wird der Eintrag fest hinterlegt und ist persisitent für "neu verarbeiten" oder den Zugang aus dem Archiv, solange bis der Fehler wieder geöffnet wird.
		- Das Doppel-Check-Feld Ebene 2 (rein visuell) wird freigeben, da der Datensatz korrekt in Regex eingetragen wurde. (ZUSATZ: Einträge außerhalb der Regex können in diesem Feld nicht mit Loesung erzwingen gespeichert werden - da der Fehlerbearbeitungsmodus zu umgehen wäre.
	c.) Schließen des Vorgangs ohne Vorauswahl im Tab-Reiter Fehler > Fehler bearbeiten. Manueller Befehl den Fehler zu akteptieren und den Workflow weiter laufen zu lassen. Einsatzbeispiel, Ausnahmefall eines Produktes mit Seriennummer außerhalb der bekannten Regex.
		- Durch Loesung erzwingen wird der Eintrag fest hinterlegt und ist persisitent für "neu verarbeiten" oder den Zugang aus dem Archiv, solange bis der Fehler wieder geöffnet wird.
		- Das Doppel-Check-Feld Ebene 2 (rein visuell) wird nicht freigeben, die Kachel erhält nur die Freigabe auf Ebene 1 (Workflow-Relevant) in der Kachel "Serials geparst".
	d.) Email versenden - Fehler wird schwebend als Anfrage gespeichert. Der Workflow bleibt weiterhin blockiert.
		- Wenn der schwebende Fall nach Versand der Mail in diesem Status auf Fehler Loesung erzwingen gestellt wird, soll wie bei Punkt c.) vorgegangen werden.
		- Wenn der schwebende Fall nach Versand der Mail in diesem Status durch das deaktivieren "NEIN" im Feld "Seriennummernpflicht" geändert wurde, siehe Punkt a.), soll auch wie in a.) fortgefahren werden.
		- Wenn der schwebende Fall nach Versand der Mail in diesem Status durch eine korrekte Regex Eingabe - siehe b.) geändert wird soll auch wie in b.) fortgefahren werden.
	f.) - Die EAN-Nummer ODER Bestellnummer bzw. HERSTELLERARTIKEL-Nummer können eingetragen werden, für den Workflow zur Bearbeitung, wenn diese beiden oder einer der beiden Werte eingetragen werden und "Loesung erzwingen" geklickt wird müssen die Daten wie bekannt persitent sein.
			- Durch Klick auf "aktualisieren" im Tab "Fehler" oder auf "neu-verarbeiten" wird der Workflow dann mit geänderten Daten ausgeführt und geht soweit die manuell eingetragenen Werte konsitent sind fehlerfrei durch.
			- Sollten die eigen eingetragenenen Werte weiterhin fehlerhaft sein, kann der User den Fehler wieder öffnen und die vorhandenen Lösungswege neu beschreiten.


