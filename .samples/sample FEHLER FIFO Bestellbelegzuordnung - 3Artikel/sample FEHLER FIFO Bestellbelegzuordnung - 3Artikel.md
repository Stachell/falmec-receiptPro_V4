#### FIFO-Fehler: ####
> ORDNER - Location: "sample FEHLER FIFO Bestellbelegzuordnung - 3Artikel"

** FEHLERBESCHREIBUNG IM SYSTEM – POP-UP (SOLL ZWINGEND VORHANDEN BLEIBEN!!):
„STEP 4 - BESTELLZUWEISUNG FIFO Zuweisung: Keine Belegnummer aus dem PDF erkannt. "Zuordnung erfolgte nur nach FIFO-Regel (aelterste zuerst). Belegnummer im PDF oder des offenen Bestell-Verzeichnises pruefen."

** BESCHREIGUNG - USER: **
In der Rechnung werden Bestellnummern erkannt, diese sind allerdings NICHT wie erwartet als Datensatz in den offenen Bestellungen (Datei: openWE-Beispiel) zu finden, allerdings konnte das System einen offenen Artikel aus einer anderen Bestellung zuweisen. Das ERP-System benötigt zwingend zum erfolgreichen Import der erstellten Export-XLSX einen validen Eintrag. Da hier ein Eintrag gewählt wurde, wenn auch nicht passend zum Eintrag aus der Rechnung gefährdetet das nicht den Upload, MUSS aber vom Bearbeiter durchleuchtet werden. Daher ist der Fehler ein SOFT-FAIL.

BEISPIELDATEI – generierter FEHLER:
>> offene Position aus der Liste offene Bestellungen:

### FEHLER 1:
100180	Lumen W 60 – Bestellung aus Wareneingang - BELEGEINTRAG 2026-10175 gelöscht. 
>> getriggerte Fehlermeldung mit Zuordnung zu vorhandener 2026-10124 Bestellung: 
Pos.: 27  |  Artikel: 100180  |  Bestellnummer: CLUN60.E0P1#NEUI491F  |  EAN: 8034122324289  |  Menge: 1  |  Preis: PDF-Rechnung: 265.50 EUR / Sage ERP: 265.50 EUR  |  S/N: JA - K25625401012K  |  Bestellung: "2026-10124"

### FEHLER 2:
100182 Lumen W 90 – Bestellung aus Wareneingang - BELEGEINTRAG 2026-10175 gelöscht. aus Wareneingang - BELEGEINTRAG 2026-10175 gelöscht. >> getriggerte Fehlermeldung mit Zuordnung zu vorhandener 2026-10124 Bestellung:
Pos.: 28  |  Artikel: 100182  |  Bestellnummer: CLUN90.E0P1#NEUI491F  |  EAN: 8034122324876  |  Menge: 1  |  Preis: PDF-Rechnung: 275.00 EUR / Sage ERP: 275.00 EUR  |  S/N: JA - K25673602022K  |  Bestellung: "2026-10124"

### FEHLER 3:
103253 Schall Schutz Deflektor aus Wareneingang - BELEGEINTRAG 2026-10175 gelöscht.
>> getriggerte Fehlermeldung mit Zuordnung zu vorhandener 2026-10124 Bestellung:
Pos.: 34  |  Artikel: 103253  |  Bestellnummer: KACL.1036  |  EAN: 8034122714349  |  Menge: 1  |  Preis: PDF-Rechnung: 24.08 EUR / Sage ERP: 24.08 EUR  |  S/N: NEIN  |  Bestellung: "2026-10120"

### GEWÜNSCHTES ERGEBNIS:
	- Kein Stop des Workflows > SOFTFAIL
	- Bei Lösung erzwingen, Freigabe des Checkfeld Stufe 2 – Kachel: Bestellung zuordnen
	- Bei Lösung erzwingen umschalten auf „grünes“ manuelles Checkfeld und Daten müssen persistent bleiben, auch bei Neu- verarbeiten und über den rückwirkenden Zugang aus dem Archiv (aktuell soweit ich gesehen habe nur persistent über neu verarbeiten). Sobald der Fehler auf „wieder öffnen“ gestellt wird  - zurück zu blauen Checkfeld, Fehler aktiv, blockiert Checkbox Ebene 2 der Kachel Bestellung zugeteilt (reine optische Warnung, nicht Ablaufrelevant!)
