#### SERIENNUMMER: REGEX nicht korrekt ####
> ORDNER - Location: "sample FEHLER SERIENNUMMER - SERIAL-REGEX FEHLER - 1Artikel"

** FEHLERBESCHREIBUNG IM SYSTEM – POP-UP (NICHT VORHANDEN - SOLLTE FÜR FLÜSSIGE OPTIK UND ABLAUF NACHGETRAGEN WERDEN!!):
-- AKTUELL KEINE STATUSMELDUNG FÜR DIESEN FEHLER VORHANDEN - BITTE OPTISCH UND IM ABLAUF GLEICH ZU DEN BESTEHEN+698/ERSTELLEN UND SINNGEMÄß:
„Preisabweichung: Der Rechnungspreis weicht vom Sage-Preis ab. Preis manuell anpassen oder Abweichung per E-Mail klaeren."

### BESCHREIBUNG - USER: **
Die Seriennummer hat und muss eine feste Regex aufweisen, sonst wird der Upload der erstellten Export-Datei geblockt, 
>> daher MUSS dieser Fehler ein hard fail sein und den Workflow blockieren, jedoch über den Workflow die Möglichkeit zur Lösung bieten - siehe "gewünschtes Ergebnis".
Eine Seriennummer beginnt immer mit "K", führt dann 11 Ziffern und endet mit "K".
Die ersten beiden Ziffern, nach dem "K" sind die Jahres bzw. das Baujahr des Gerätes. 
- Beispiel: "K25645904001K" (Baujahr 2025), "K16673602010K" (Baujahr 2016), etc.

BEISPIELDATEI – generierter FEHLER:
>> geänderte Seriennummer im Warenbegleitschein "ndmatricolek..." – 1 Artikel

ZEILE:
31.01.2026 > 20007 > CFPN85.E2P2#ZZZQ490F > CAPPA FLIPPER 85 NRS P.E. CONO VETRO NERO ACIDATO RAL 9005 220-240V ~ 50-60Hz T80 S/FILTRO IMB. FALMEC > 8034122353739 >>> SERIENNUMMER GEDÄNDERT IN: "x855466654d" (REGEXVERSTOSS!)
>> SERIAL zur Fehlerbehebung: K25660709004K

### Fehlerbearbeitung:
- Fehler soll über eine Eingabemaske, eine Vorlage dazu kann die Maske "Stammdaten/EAN nicht zugeordnet" darstellen, diese Maske bietet die Möglichkeit die Daten zu ergänzen oder zu korrigieren.
	- Vermerk: Die Maske erzeugt bei wählen des Feldes "Seriennummernpflicht" ein neues Feld in dem via Button ein Popup öffnet und die Seriennummer eingetragen werden kann.
	- Die Maske muss im Bereich "Seriennummernpflicht" an die bereits geparsten Daten gebunden werden, so dass falls der Artikel welcher bereits durch den WORKFLOW mit Seriennummernpflicht "JA" bestätigt wurde und den Fehler wirft weil die Regex nicht passt im Fehler bearbeiten voreingestellt auf "JA" stehen. Andernfalls ist das verwirrend für den User - im Grunde muss das Feld nur an den Workflow verdrahtet werden um die Voreinstellung zu ziehen.
	- Das aktuelle Pop-up-Feld könnte aktualisiert werden (auch für die Vorlagedatei aus "Stammdaten/EAN nicht zugeordnet" - hier wäre das Popup sinnvoll das ein Drop-Downmenü bietet falls aus mehreren Möglichkeiten eine gewählt werden kann sowie eine Möglichkeit den Eintrag manuell zu setzen.
	
### GEWÜNSCHTES ERGEBNIS:
Checkfeld Schild – Hard fail! Bearbeiter MUSS um sich mit dem Fehler gezwungen auseinanderzusetzen eine Auswahl treffen oder die Daten verwertbar korrigieren
	** 4 LÖSUNGEN ANWENDBAR**:
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


