#### SERIENNUMMER: EAN-Nummer fehlt (Parsing-Serial) ####
> ORDNER - Location: "ssample FEHLER SERIENNUMMER - EAN FEHLT - 1Artikel"
> VERMERK: BESTELLNUMMER = HERSTELLERARTIKELNUMMER

** FEHLERBESCHREIBUNG IM SYSTEM – POP-UP (NICHT VORHANDEN - SOLLTE FÜR FLÜSSIGE OPTIK UND ABLAUF NACHGETRAGEN WERDEN!!):
-- AKTUELL KEINE STATUSMELDUNG FÜR DIESEN FEHLER VORHANDEN - BITTE OPTISCH UND IM ABLAUF GLEICH ZU DEN BESTEHENDENDEN / ERSTELLEN UND SINNGEMÄß:

# **WICHTIG FÜR DIESEN FALL - DIE HERSTELLERNUMMER IST VORHANDEN UND DAS PARSING KANN ÜBER DIE HERSTELLERARTIKELNUMMER DRUCHGEFÜHRT WERDEN:**
„Fehlender EAN zur optimalen Zuordnung der Seriennummer, Zuordnung ausschließlich über die Herstellerartikelnummer."

### BESCHREIBUNG - USER: **
Die Seriennummer wird von Produkten mit Seriennummernpflicht > "JA" aus dem Warenbegleitdokument geparst. In dem Warenbegleitdokument in welchem die Seriennummern übermittelt werden i.d.R. im besten Fall mit den Werten "EAN" und "Herstellerartikelnummer/Bestellnummer" übermittelt, in Einzelfällen wird nur die "EAN" oder "Herstellerartikelnummer/Bestellnummer" übermittelt.
Um die App konsistent zu halten sollten beide Werte für das Parsing geprüft werden, falls der EAN nicht in der Datei oder eine falsche Regex hat soll dieser Punkt als **SOFT-FAIL** ohne Blockade des Workflows erzeugt werden.
>> Daher MUSS dieser Fehler ein soft fail sein und den User mit dem Soft-Fail aber auch mit der Blockade der Doppelcheck Ebene 2 als visueller Marker um den Benutzer ggf. zur Prüfung animieren.


BEISPIELDATEI – generierter FEHLER:
>> gelöschte EAN-Nummer im Warenbegleitschein "ndmatricolek..." – 1 Artikel

ZEILE:
31.01.2026 > 20007 > CEIA00.E0P1#CRII491F > CAPPA ELIOS ANGOLO/CORNER 100 C0001 CROMATO INOX CONO INOX 220-240V 50-60Hz T80 C/FILTRO IMB. FALMEC > K25661103009K > ELIOS 100 ED								
>> Fehlende EAN-Nummer: "8034122306322" 

### Fehlerbearbeitung:
- Fehler soll über eine Eingabemaske, eine Vorlage dazu kann die Maske "Stammdaten/EAN nicht zugeordnet" darstellen, diese Maske bietet die Möglichkeit die Daten zu ergänzen oder zu korrigieren.
	- Vermerk: Innerhalb der Maske kann die EAN-Nummer eingetragen werden. 

### GEWÜNSCHTES ERGEBNIS:
Der Soft fail soll das Checkfeld Doppel-Check-Feld Ebene 2 als visuellen Marker markieren, kein Workflow-Stop solange das Parsing korrekt aus der Herstellernummer ausgearbeitet werden konnte! 
Der Bearbeiter MUSS sich NICHT ZWIGEND mit dem Fehler auseinandersetzen.
	**2 LÖSUNGEN ANWENDBAR**:
	a.) EAN-Nummer wird in der Maske "Fehler Bearbeiten" nachgetragen und ist dann für den Workflow eingetragen, allerdings nicht persitent. Wird das als Loesung erzwungen soll der Datensatz persistent gespeichert sein, bis der Fehler wieder geöffnet wird und das Doppel-Check-Feld der Ebene 2 für die Kachel "Serial geparst" kann freigeben werden.
	b.) Fehler bearbeiten > Mail senden - die Anfrage sitzt auf prüfen, dass Doppel-Check-Feld der Ebene 2 bleibt visuell blockiert bzw. wird nicht aktiv. Die weitere Bearbeitung kann z.B. durch Antwort der Mail und damit Erhalt der fehlenden Daten mit Lösung erzwingen erledigt werden, dann weiteres Vorgehen siehe Punkt a.).
	Vermerk: Loesung erzwingen ohne eine vorherige Auswahl oder einen vorherigen EIntrag zu setzen bringt keinen Mehrwert und muss daher nicht freigegben werden. Ähnlich wie im Fehler "Preisabweichung"

