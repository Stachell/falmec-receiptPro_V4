

+++ ANPASSUNG NOTWENDIG
	+ [LLM-NOTE] Datenanbindung - Workflow
	- aktuell vorhanden: "#" (Positionsnummer), "Arikelnummer (IT)", "EAN", "Beschreibung", "Menge", "Preis (Rechnung)"; Preis (Sage), "Bestellung" und "Lagerort"
		>> Feldbezeichnung umbenennen.
		"Artikelnummer (IT)" umbenennen zu "Artikel-# (DE)
		"Bezeichnung" umbenennen in "Bezeichnung (DE)"
	
		>> FELDBEZEICHNUNG ZU ERGÄNZEN:
		- "Artikel-# (DE)" - Beschreibung: Artikelnummer DE / Deutsche Artikelnummer aus unserem ERP - Sage
		- "Serial-#" - Beschreibung: Seriennummer je Artikel (dynmisches Feld - bei Schritt wird der Wert Seriennummernpflicht aus der "Artikelliste" übernommen, je Artikel mit true oder false, die Kachel Seriennummer kann im Nenner ausgefüllt werden mit der Summe der Artikel die mit "true" markiert sind - ab Schritt Seriennummern soll jedem Artikel der mit "true" im Feld "Serial-#" markiert ist die Seriennummer aus der Liste in das Feld eingetragen bekommen, Parsing-Regel separat notiert und der Counter soll die erfolgreich zugeordneten Seriennummmern zählen.
		- "Checkbox" - das soll ein dynmisches Anzeigefeld werden, ein Icon reicht als anzeige mit 5. möglichen Zuständen
			1. Zustand: "folgt" - in gelb >> Eintrag bis zum Schritt 2, bis Werte zur Bearbeitung kommen
			2. Zustand: "match" - in grün >> Schritt 2 sucht in 2 Werten einen Match - "Aritkel-# (IT)" und "EAN", dieser Button soll erscheinen wenn beide einen Match habenEintrag bis zum Schritt 2, bis Werte zur Bearbeitung kommen
			3. Zustand: "Code-IT" - in hellerem orange >> Schritt 2 sucht in 2 Werten einen Match - "Aritkel-# (IT)" und "EAN", dieser Button soll erscheinen wenn nur der Wert Aritkel-# (IT)" gematcht werden konnte. 
			4. Zustand: "Code-IT" - in hellerem orange >> Schritt 2 sucht in 2 Werten einen Match - "Aritkel-# (IT)" und "EAN", dieser Button soll erscheinen wenn nur der Wert Aritkel-# (IT)" gematcht werden konnte. 
			5. Zustand: "fail" - rot >> Schritt 2 sucht in 2 Werten einen Match - "Aritkel-# (IT)" und "EAN", dieser Button soll erscheinen wenn keiner der Werte gefunden werden konnnte (Schwerer Fehler - Blockade!). 
		-  "Details" - ein Link der ein Popup-Fenster öffnet und eine Übersicht über ALLE Daten des Artikels. Beispiel, in den folgenden Schritten werden Werte aus den Dateien gezogen die nicht für die Verarbeitung aber für den Endausdruck wichtig sind, wie z.B. "Lieferant" - 5-stellige Lieferantennummer, "EK-Vorgang" - Vorgangsnummer des Bestellebelegs, "Bestellmenge_Order" - die offenen Aritikel welche in dieser Bestellung noch zu liefern sind, "




			
		>> FELDBEZEICHNUNG ZU ENTFERNEN / KONSOLIDIEREN / ZU EINEM DYNAMISCHEN FELD UMBAUEN:
		Tabellenfelder "Preis (Rechnung)" und "Preis (Sage)" zu einem dynmischen Feld zusammenfügen. Bei Schritt 1. sollen die aus der Rechnung erhaltenen Einzelpreise in dieses Feld eingetragen werden
		-- im Statusfeld "Preis-Check folgt" 
		-- Sobald der Schritt mit den Preisen aktiviert ist und erfolgreich durchlaufen ist, soll im "Preis-Status" gezeigt werden, möglichst in grün "OK", bei Abweichung "PRÜFEN" in Gelb, falls kein Preis auf der Rechnung oder in der Aritkelliste eingetragen ist in rot "fehlt"
		-- "Preis-Status" Etiketten zusätzlich verlinken zu einer Popup-Fenster in welchem für diesen Artikel der Preis selbst über einen Button wählbar ist mit: 1. Rechnungspreis , 2. Sage Preis (ERP) und 3. eintragen (Bei Punkt 3 setze ich manuell einen Preis welcher dann eingetragen wird. Bei eigens gesetzten Preisen soll ein 4 Preisstatus-Button erscheinen in blau mit der Schrift "angepasst" auf der Artikelliste oder
	
	
	
	
	
	>> REIHENFOLGE
	"#" (Positionsnummer), "Checkbox", "Artikel-# (DE)", "Artikel-# (IT)", "EAN", "Bezeichnung (DE)", "Menge", "Preis (Rechnung)"; "Preis (Sage", "Bestellung" und "Lagerort"
	
	
	
	STEP 1. "RECHNUNG EINLESEN" löst aus: 
	-- parsing der Rechnung mit Eintrag der Rechnungsposition unter "Positionen" 
	-- Eintrag der Werte in Aritkelliste der einzlenen Artikel
	-- Eintrag der Kacheln 
	    1. Rechnungsposition (kann mit nenner und counter befüllt werden)
		2. Artikel extrahieren (Nenner kann eingetragen werden - Summe der gelieferten Artikel, Counter erst im Step 2 - daher bleibt er solange bei 0)
		3. Seriennummer anfügen (kann noch nicht ausgefüllt werden)
		5. Preise checken (Nenner kann eingeragen werden, Summe der Aritkel bzw. deren Einzelpreise, Counter wird noch befüllt, also 0.
		4. Bestellungen mappen (Nenner bleibt leer, Counter ist die Artikelsumme)
		3. Bestellungen mappen (der Nenner kann eingetragen werden - Summe der gelieferten Aritkel)
		
	STEP 2. "ARITKEL EXTRAHIEREN" löst aus:
	-- der Workflow sucht Artikel für Artikel anhand der "Artikel-# (IT)" und "EAN" sucht er einen Match in den Zeilen und überträgt bei Match "Artikel-# (DE)" (5-stellig), den true/false Wert im Feld "Serial-#" (darstellung bitte in Deutsch für ja/nein) und trägt den "Einzelpreis" in die 'Invoiceline'* diese  Datei "Artikelstammdaten" wird Artikel für Arti
	-- Der Button "Checkbox" kann anzeigen wie das Parsing zur Aritkelliste funk
	-- Eintrag in die Kachell des Counters für erfolgreich zugeordnete Preise
	-- in der Ansicht der 'Invoiceline' kann der Preis geroutet werden.
	-- in der Invoiceline kann der Lagerort eingetragen werden 
	

	
	Step 3. "SERIENNUMMER ANFÜGEN" löst aus:
	-- Alle Artikel die in der 'Invoiceline' in der Tabelle "Serial-#" auf "ja" stehen, werden in der Warenbegleitdatei wieder mit "EAN" und "Artikel-# (IT)" 
	-- Vielleicht kann man hier ebenfalls eine kleine "Checkbox" einbauen, damit klar ist mit den 5 Zuständen.
	
	
	Step 4. "BESTELLUNG MAPPEN" löst aus,
	-- "Bestellparser" - muss noch erstellt werden.
	>>> LOGIK DES BESTELLPARSERS:
	1. Der Bestellparser soll die Zeilen nach "Artikel-#" und "EAN" durchsuchen, bei Match soll die Zeile in einen seperaten Speicher oder in ein separates Fenster. 
	2. Wenn die Daten aus der Excelfile konsulidiert wurden, folgende Felder sind wichtig:
		1. "Artikel-# (DE)
		2. "EAN"
		3. "Jahreszahl" (2026, etc - wichtig weil in der Endausgabe die Bestellnummern immer folgendes Format haben müssen - Beispiel: 2026-10065
		3. "Bestellnummer"
		4. "Bestellmenge_Order"
		5. "EK-Vorgang"
	
	3. Der erhaltene Datensatz kann nun mit dem vorhandenen Datensatz in Tab-Reiter "Positionen" (alt Rechnung) gematcht werden. Folgende Regel-Reihenfolge:
		1. ist eine 5-stellige Bestellnummer beginnend mit 1xxxx und ergibt sich immer aus der Jahreszahl, Bindestich und die fortlaufende Nummer. Hier muss eine Regel gefunden werden da die 5-stellige Nummer auf dem Dokument getrennt eingetragen ist, ich würde sie auch getrennt lassen allerdings für den Parsing-Prozess auf beiden Seiten zusammen führen.
			WICHTIG: Wenn in der Bestellung bei beispielsweise 4x Produkt A mit Bestellung 10153 gekennzeichnet wurde und in der Liste dieser Artikel in dieser Stückzahl auch 4x offen ist, gilt dies als erfolgreich "MATCH", falls nicht Stufen wie folgt:
		2. 	Eine Bestellnummer ist auf dre Rechnung genannt und diese ist in mehreren Bestellungen offen, dann bitte die offnen Bestellungen, welche älter sind zuerst eintragen (Beispiel, Alter kann anhand der Nummer und Jahreszahl bestimmt werden, so ist zum Beispiel 2025-10065 älter als Bestellung 2026-10008 und/oder 2026-10008 ist älter als 2026-10009
		3.  keine Bestellung vorhanden - dann markiert mit "keine Bestellung" und die Möglichkeit diese manuell als "OK" zu setzen oder eine Bestellung nachzutragen. Wichtig, dann müssen zwei Felder ausgefüllt werden, das Feld für die Jahreszahl gerne ein Dropdown, da du hier nicht viele Werte finden wirst, Beispiel: 2025, 2026, etc. 


	Step 5. "Export" löst aus, 
		Den Export eine Datei, wahlweise als XML / CSV aufgebaut, jeder Artikel eine Zeile, soll aus der Invoiceline übernommen werden und folgende Werte je Tabelle. Tabelle von 1. links zu X rechts, (mit Überschriftenzeile wie folgt):
		>> ACHTUNG: Da jeder Artikel eine eigene Zeile bekommt, keine Mengenangabe durch Bezeichnung, lediglich beim Auflösen der Rechnungspositionen!
		1.  Artikel-# (DE)
		3.  Aritkel-# (IT)
		4.  EAN
		5.  Beschreibung (DE)
		6.  Bestellnummer_JAHR
		7.  Bestellnummer_CODE
		8.  Vorgangsnummer Order
		9.  Seriennummer
		10. Lagerplatz


	VERMERK - Die Rechnungspositionen welche direkt in Positionen geparst werden nach Möglichkeit in Verbiundung zueinander lassen, so dass in Positionen als Beispiel 4 Stk | CLVI20.E0P7#ZZZF461F | 8034122477183	| Bezeichnungbeispiel | 865,00 | 3460,00 wird in der Artikelliste zu 4 Einträgen, jeder Eintrag ein Artikel. 	