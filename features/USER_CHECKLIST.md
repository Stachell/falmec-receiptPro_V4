Diese Liste dient dem User zur Übersicht der offnenen Änderungen.
Die Änderungen werden nach und nach vom User mittels Projekten umgesetzt.

Hier soll keine autonome Umsetzung durch das LLM stattfinden!

AUFLISTUNG:
1. Fehlermeldungen müssen User freundlicher werden, Werte wie Artikelnummer, EAN, etc. müssen angefügt werden
2. Fehlerbehandlung im Tab-Reiter "Fehler" müssen ausgearbeitet werden, mit Link zur Versendung via Email und zur Prüfung via Human
3. Die Logik der Preis-Anpassung mit enstprechendem Impact im Worfkflow muss hinterlegt werden und in Punkt 2 integriert

4. Die Export-Datei muss angepasst werden, es fehlen Werte wie "Lieferant", "Vorgang (Bestellung)" und Werte wie "Menge" müssen entfernt werden.
5. Die Speicherlogik der Indexed DB muss angepasst werden, damit die "Archiv-Läufe" ordentlich angezeigt werden.
6. Das Pop-Up Artikeldetails > Verknüpfungen müssen aktualisiert werden
7. Im Step Artikel extrahieren muss die Deutsche Beschreibung entweder via Wahlfehld oder als festen Wert überschreiben, bei durchführung mit überschreiben müssen die ArtikelDeatils angepasst werden.


OPTISCHE MÄNGEL:

>> erstes Prüffeld schlägt nicht mehr an >> VERGLEICH Rechnungssumme - FELD = Summe der Einzelartikle in Re-Position
>> HOME > Archivansicht muss die Rechnungssumme verknpüft werden!


STEP 4 - STOPFELDEINSTELLUNG:
Das die Bearbeitung dann nur noch über die Artikelliste möglich ist bei Durchlauf von Step 4 werde ich im Nachgang noch eine Lösung implemtieren, die in den Einstellungen einen Schieberegler zeigt, ist er aktiviert wird Step 4 einfach normal ausgeführt, falls nicht erzeugt VOR Step 4 eine Meldung mit "Step 4 wird bearbeitet, sind alle Bearbeitungsschritte in Bereich Rechnungspositionen abgeschlossen?" mit der Möglichkeit auf "OK" zu klicken, dann läuft der Step 4 weiter, oder auf "Pause" dann wird der "Pause"-Button aktiviert und er Nutzer kann seine Änderungen durchführen und die von "Pause" einfach auf weiter klicken. Hintergrund ist das der User die Arbeitsweise in "RE-Position" oder "Artikelliste" dann selbst wählen kann.
