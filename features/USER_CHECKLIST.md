Diese Liste dient dem User zur Übersicht der offnenen Änderungen.
Die Änderungen werden nach und nach vom User mittels Projekten umgesetzt.

Hier soll keine autonome Umsetzung durch das LLM stattfinden!

AUFLISTUNG:
1. Anbindung von Step 3 Serial parsen an das Fehlercenter
2. Anbindung der Einstellung "Fehler soll workflow stoppen" in den Einstellungen
3. Eine Schieberegler Button muss integriert werden, welcher bei ON den Workflow komplett durchlaufen lässt, bei Off in Step 4 Stopt eine Meldung generiert "sind sie mit der Bearbeitung von Step 1-3 fertig" - dann mit ok es geht weiter und mit abbrechen zurück zum Fenster um ggf. weiter zu bearbeiten.
4. Ein Bufferspeicher falls Daten wie "Artikelliste" / open WE nicht neu eingelesen werden. 
5. Die Suchfunktion in Re-Position und Artikeliste funktionieren nicht, muss noch gefixt werden.

4. 
Die Export-Datei muss angepasst werden, es fehlen Werte wie "Lieferant", "Vorgang (Bestellung)" und Werte wie "Menge" müssen entfernt werden.
5. Die Speicherlogik der Indexed DB muss angepasst werden, damit die "Archiv-Läufe" ordentlich angezeigt werden.
6. Das Pop-Up Artikeldetails > Verknüpfungen müssen aktualisiert werden
7. Im Step Artikel extrahieren muss die Deutsche Beschreibung entweder via Wahlfehld oder als festen Wert überschreiben, bei durchführung mit überschreiben müssen die ArtikelDeatils angepasst werden.
8. Die Logik der Preis-Anpassung mit enstprechendem Impact im Worfkflow muss hinterlegt werden und in Punkt 2 integriert

OPTISCHE MÄNGEL:

>> 
>> 


STEP 4 - STOPFELDEINSTELLUNG:
Hier wird vermutlich ein weiterer Run notwendig sein um Teillieferungen der in der Rechnung genannten Positionen abzufangen, quasi zunächst der "voll-Match-Run", anschließend der normale "MATCH" RUN.




ERLEDIGT:
Fehlermeldungen müssen User freundlicher werden, Werte wie Artikelnummer, EAN, etc. müssen angefügt werden
Fehlerbehandlung im Tab-Reiter "Fehler" müssen ausgearbeitet werden, mit Link zur Versendung via Email und zur Prüfung via Human
erstes Prüffeld schlägt nicht mehr an >> VERGLEICH Rechnungssumme - FELD = Summe der Einzelartikle in Re-Position
HOME > Archivansicht muss die Rechnungssumme verknpüft werden!





