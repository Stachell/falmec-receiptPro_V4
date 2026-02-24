# PROJ-27 - Site Settings / Einstellungen

## Beschreibung

Dieses Projekt enthaelt die Umstrukturierung und Erweiterung der Einstellungen-UI (SettingsPopup + Sidebar-Footer), inklusive Verschiebung bestehender Controls und Klon bestehender Parser/Matcher-Auswahlfelder mit identischer Logik.

## Projekteintraege (pro Aufgabe)

- [x] **P1 - Allgemein: Feineinstellung-Separator**
  - [x] Die 4 Einstellungen `Maussperre`, `Preisbasis`, `Waehrung`, `Toleranz` sind in einen eigenen Bereich `Feineinstellung` verschoben.
  - [x] Der Bereich hat oben und unten einen duennen Separator (`border-y`).

- [x] **P2 - Logfile nach Allgemein verschoben**
  - [x] `Logfile oeffnen` wurde aus `Uebersicht` entfernt.
  - [x] In `Allgemein` wurde oberhalb von `Feineinstellung` ein eigener Separator-Bereich `log` eingefuegt.
  - [x] Der Button behaelt seine Funktion (`logService.viewLogWithSnapshot`) unveraendert.

- [x] **P3 - Reiter-Umbenennung**
  - [x] Reiter `Uebersicht` wurde in `Speicher/Cache` umbenannt.
  - [x] Die Bereichsueberschrift im Tab wurde ebenfalls in `Speicher/Cache` umbenannt.

- [x] **P4 - Archiv synchronisieren nach Speicher/Cache**
  - [x] `Archiv synchronisieren` wurde aus `Bestellung mappen` entfernt.
  - [x] Der Button wurde in den Reiter `Speicher/Cache` verschoben.
  - [x] Verhalten/Handler bleibt unveraendert.

- [x] **P5 - PDF-Parser: neue Separator-Struktur**
  - [x] Oberhalb von `Parser importieren` wurde ein weiterer Separator-Bereich eingefuegt.
  - [x] Der Import-Bereich wurde als `Parser-Import` benannt.
  - [x] `Parser-Verwaltung` bleibt darunter als separater Bereich erhalten.

- [x] **P6 - Parser-Regex Feld in PDF-Parser geklont**
  - [x] Das Sidebar-Footer-Feld `Parser-Regex` (Label, Check-Status, Dropdown) wurde in den neuen oberen Separator im Tab `PDF-Parser` kopiert.
  - [x] Die Logik ist identisch angebunden:
    - [x] Auswahl nutzt denselben Parser-Status.
    - [x] Wechsel triggert dieselbe Footer-Logik inkl. Registry-Persistenz und Logging.
    - [x] `Auto` wird nur angezeigt, wenn mehr als ein Parser-Modul verfuegbar ist.

- [x] **P7 - Artikel extrahieren / Matcher-Anzeige**
  - [x] `Aktiver Matcher` (read-only Anzeige) wurde aus dem Reiter `Artikel extrahieren` entfernt.
  - [x] Oberhalb von `Schema` wurde ein Separator eingefuegt.
  - [x] Matcher-Auswahl im Sidebar-Footer bleibt als aktive Steuerung erhalten (bereits vorhanden, unveraenderte Logik).

## Betroffene Dateien

- `src/components/SettingsPopup.tsx`
- `src/components/AppFooter.tsx`
- `features/INDEX.md`
- `features/PROJ-27-site-settings-einstellungen.md`

## Erweiterung (Follow-up)

- [x] **P8 - Reiter-Reihenfolge erweitert**
  - [x] `Speicher/Cache` wurde aus der Top-Position ans Ende der bestehenden Liste verschoben (unter `Bestellung mappen`).
  - [x] Neuer Reiter `sonstiges` wurde unterhalb von `Speicher/Cache` eingefuegt.

- [x] **P9 - Allgemein: Logfile-Bereich angepasst**
  - [x] Button-Text von `Logfile oeffnen` auf `Logfile` geaendert.
  - [x] Label von `log` auf `Logfile anzeigen:` geaendert.
  - [x] Label und Button stehen in derselben Zeile.
  - [x] Label ist rechtsbuendig ausgerichtet.
  - [x] Logfile-Button ist linksbuendig innerhalb der Control-Spalte ausgerichtet.
  - [x] Logfile-Button-Breite auf gleiche Breite wie die Controls in `Feineinstellung` gesetzt (`w-28`).

- [x] **P10 - Reiter `sonstiges`: Inhalte verschoben**
  - [x] `Aktiver Parser` von `Speicher/Cache` nach `sonstiges` verschoben.
  - [x] `Aktiver Matcher` von `Speicher/Cache` nach `sonstiges` verschoben.

- [x] **P11 - Speicher/Cache: Separator-Ueberschriften**
  - [x] Oberhalb von `Speicher / Cache leeren` wurde die Ueberschrift `Local-Storge / Cache leeren` eingefuegt.
  - [x] Oberhalb von `Archiv synchronisieren` wurde die Ueberschrift `Archiv leeren` eingefuegt.

- [x] **P12 - Allgemein: Log-Bereich Feinschliff**
  - [x] Text `Logfile anzeigen:` auf `Logfile (global) anzeigen` umbenannt.
  - [x] Der Text ist linksbuendig positioniert und steht oberhalb von `Feineinstellung`.
  - [x] Position des Buttons `Logfile` unveraendert belassen.
  - [x] Zwischen Log-Bereich und `Feineinstellung` auf einen Separator reduziert.

- [x] **P13 - Separatoren in weiteren Reitern**
  - [x] In `Serial parsen` wurde zwischen Ueberschrift und `Aktiver Serial-Finder` ein Separator (`border-t`) ergaenzt.
  - [x] In `Bestellung mappen` wurde zwischen Ueberschrift und `Aktiver OrderMapper` ein Separator (`border-t`) ergaenzt.

- [x] **P14 - Artikel extrahieren: Matcher-Feld als Klon**
  - [x] Das Footer-Objekt `Matcher` (Label, Dropdown, Pruef-Icon) wurde unter der Ueberschrift in `Artikel extrahieren` als eigener Separator-Bereich eingefuegt.
  - [x] Inhalt, Verknuepfung und Optik sind identisch zum Footer-/Parser-Regex-Muster.
  - [x] Auswahl nutzt dieselbe Wechsel-Logik wie im Footer (inkl. bestehender Persistenz/Logging-Kette).

- [x] **P15 - Serial parsen: Pruef-Logik + Optik angeglichen**
  - [x] `Aktiver Serial-Finder` zeigt ein gruenes Pruef-Icon mit Ready-Logik analog zu `Parser-Regex`.
  - [x] Label/Dropdown wurden auf die gleiche visuelle Struktur wie `Parser-Regex` umgestellt.
  - [x] In `sonstiges` wurde ein neuer Eintrag `Aktiver Serial-Finder` mit derselben Mechanik wie bei Parser/Matcher ergaenzt.

- [x] **P16 - Bestellung mappen: Aktiver OrderMapper angeglichen**
  - [x] `Aktiver OrderMapper` erhielt ebenfalls Pruef-Icon + Ready-Logik analog `Parser-Regex`.
  - [x] Label/Dropdown-Optik wurde identisch angeglichen.
  - [x] Bereich `Order-Parser-Profil` blieb unveraendert.

- [x] **P17 - Add-on: Sonstiges um Aktiver OrderMapper erweitert**
  - [x] Im Reiter `sonstiges` wurde der Status-Eintrag `Aktiver OrderMapper` ergaenzt.
  - [x] Anzeige basiert auf derselben zentralen Konfiguration (`activeOrderMapperId`).
  - [x] Eintrag nutzt dieselbe Mechanik wie Parser/Matcher/Serial-Finder inklusive gruenem Ready-Icon.

- [x] **P18 - Add-on: Datenverzeichnis-Objekt im Sidebar-Footer optisch angeglichen**
  - [x] Das Objekt `Datenverzeichnis` wurde visuell auf das Design der Parser-/Matcher-Dropdowns umgestellt (gleiches Trigger-Layout, Border, Hover-Optik, Breite).
  - [x] Das gruene Pruef-Icon bleibt als Statusindikator erhalten (nun am Label wie bei den anderen Dropdown-Objekten).
  - [x] Die Funktionslogik zur Verzeichnis-Auswahl (`handleDataPathChange`) blieb unveraendert.

- [x] **P19 - Add-on: Datenverzeichnis auf Einstellungen-Button-Hoverdesign**
  - [x] Das Klickfeld `Datenverzeichnis` nutzt jetzt dieselbe Farb- und Hoverlogik wie der Button `Einstellungen` (beige Grundzustand, tuerkiser Hover, weisser Hover-Text).
  - [x] Der Feld-Charakter als klickbare Aktion wurde damit visuell verstaerkt.
  - [x] Verzeichnis-Auswahlfunktion blieb unveraendert (`handleDataPathChange`).

- [x] **P20 - Bericht/Pruefung: Parser-/Matcher-Doppelung und Verknuepfung bestaetigt**
  - [x] `Parser-Regex` existiert doppelt (Sidebar-Footer + Einstellungen/PDF-Parser) und nutzt denselben Change-Pfad (`handleParserChange` via `onParserChange`).
  - [x] `Matcher` existiert doppelt (Sidebar-Footer + Einstellungen/Artikel extrahieren) und nutzt denselben Change-Pfad (`handleMatcherChange` via `onMatcherChange`).
  - [x] Damit ist ein spaeteres Entfernen der Footer-Felder moeglich, ohne dass die Logik in den Einstellungen entkoppelt wird.

- [x] **P21 - Sonstiges: Aktiver Matcher in interaktives Feld umgestellt**
  - [x] Anzeigename geaendert auf `Aktiver Art.-Matcher`.
  - [x] Read-only-Zeile ersetzt durch interaktives Select-Feld mit gruenem Pruefzeichen.
  - [x] Optionen und Wechsel-Logik sind identisch zu den bestehenden Matcher-Feldern (`Auto` + Modul-Liste, `onMatcherChange`).

- [x] **P22 - Sonstiges: Aktiver Parser umbenannt und auf Select umgestellt**
  - [x] Anzeigename geaendert von `Aktiver Parser` auf `Aktiver Art.-PDF-Parser`.
  - [x] Eintrag als interaktives Select-Feld mit gruenem Pruefzeichen umgesetzt.
  - [x] Optionen/Verknuepfung analog zu Parser-Feldern (`Auto` + Modul-Liste, `onParserChange`).

- [x] **P23 - Sidebar-Footer: Parser/Matcher-Selects durch Statusfelder ersetzt**
  - [x] Footer-Objekt `Parser-Regex` entfernt und durch Statusfeld `Serial-Finder` ersetzt.
  - [x] Footer-Objekt `Matcher` entfernt und durch Statusfeld `OrderMapper` ersetzt.
  - [x] Zusaetzlich eingefuegt:
    - [x] `PDF-Parser` (vor `Art.-Matcher`)
    - [x] `Art.-Matcher` (vor `Serial-Finder`)
  - [x] Finale Reihenfolge der Statusfelder im Footer:
    - [x] `PDF-Parser`
    - [x] `Art.-Matcher`
    - [x] `Serial-Finder`
    - [x] `OrderMapper`
  - [x] Design orientiert sich an den bisherigen Footer-Objekten (kompakt, gleiche Designlinie, gruene Ready-Icons).
  - [x] Logik bleibt an zentrale Konfiguration angebunden (keine Abhaengigkeit vom Reiter `sonstiges`).

- [x] **P24 - Footer-Labels komprimiert**
  - [x] Bei allen 4 neuen Footer-Statusfeldern wurde das Wort `Aktiver` entfernt.
  - [x] Finale Anzeigenamen:
    - [x] `PDF-Parser`
    - [x] `Art.-Matcher`
    - [x] `Serial-Finder`
    - [x] `OrderMapper`

- [x] **P25 - Footer-Labels als Ueberschriften ueber den Feldern**
  - [x] Die Beschriftungen `PDF-Parser`, `Art.-Matcher`, `Serial-Finder`, `OrderMapper` und `Datenverzeichnis` wurden oberhalb der jeweiligen Felder positioniert.
  - [x] Labels sind linksbuendig an den jeweiligen Anzeige-/Auswahlfeldern ausgerichtet.
  - [x] Die gruenen Pruef-Icons bleiben direkt an den Ueberschriften erhalten.

- [x] **P26 - Footer-Felder: feste Breite + kompakter Gruppenabstand**
  - [x] Die vier Status-Anzeigefelder `PDF-Parser`, `Art.-Matcher`, `Serial-Finder`, `OrderMapper` haben eine feste, einheitliche Breite (`w-40`).
  - [x] `Datenverzeichnis` bleibt mit eigener Feldbreite (`w-56`) erhalten.
  - [x] Die vier Statusfelder sind als kompakte Gruppe umgesetzt; der interne Abstand wurde auf ca. 70% des Aussenabstands zur `Datenverzeichnis`-/`Einstellungen`-Zone reduziert.

- [x] **P27 - Footer-Optik bereinigt (Ausrichtung + Konsistenz)**
  - [x] Footer-Layout auf vertikale Label/Feld-Struktur je Objekt vereinheitlicht.
  - [x] Alle betroffenen Objekttexte bleiben bei bestehender Schriftfarbe/-groesse und bilden eine saubere, platzsparende Linie.
  - [x] Bestehende Funktionsanbindungen (Statusanzeige, Datenverzeichnis-Klicklogik) bleiben unveraendert.

- [x] **P28 - Sidebar-Footer Ueberhang auf 110% erweitert**
  - [x] Die ausgeklappte Footer-Hoehe wurde von `66px` auf `73px` angehoben (ca. 110%).
  - [x] Der erweiterte Footer schafft mehr Luft fuer Labels, Statusfelder und den `Einstellungen`-Button.
  - [x] Die Position des Warning-Icons oberhalb des Footers wurde passend auf die neue Hoehe synchronisiert.

- [x] **P29 - Sidebar-Footer Inhalte vertikal zentriert**
  - [x] Alle rechten Footer-Inhalte bleiben rechtsbuendig (`justify-end`), sind aber nun in der Footer-Hoehe zentriert (`items-center`).
  - [x] Die Statusfeld-Gruppe (`PDF-Parser`, `Art.-Matcher`, `Serial-Finder`, `OrderMapper`) wurde ebenfalls vertikal auf Mitte ausgerichtet.
  - [x] Funktionale Logik bleibt unveraendert; es wurden nur Layout-/Ausrichtungswerte angepasst.

- [x] **P30 - Einstellungen-Button auf Blockhoehe von Datenverzeichnis angeglichen**
  - [x] Die Hoehe des `Einstellungen`-Buttons wurde auf die kombinierte Hoehe von `Datenverzeichnis`-Label + Abstand + Anzeigefeld angepasst (`h-[2.875rem]`).
  - [x] Damit liegt der Button visuell von der obersten Labelkante bis zur unteren Feldkante auf derselben Hoehenachse wie der `Datenverzeichnis`-Block.
  - [x] Button-Interaktion (Klick, Hover, Oeffnen des Settings-Popups) bleibt unveraendert.

- [x] **P31 - Footer-Label Feinschliff (Rueckbau + Doppelpunkte)**
  - [x] Der `Einstellungen`-Button wurde wieder auf die Standardhoehe `h-7` zurueckgesetzt und liegt damit wieder in einer Linie mit den Anzeige-Buttons.
  - [x] Ueber dem Button wurde die Ueberschrift `Einstellungen:` im gleichen Label-Stil gesetzt.
  - [x] Der Buttontext bleibt `Settings`.
  - [x] Das Label `Datenverzeichnis` wurde zu `Datenverzeichnis:` geaendert.
  - [x] Funktionale Logik (Settings oeffnen, Datenpfad waehlen) bleibt unveraendert.

- [x] **P32 - Footer-Link: OrderMapper -> Reiter Bestellung mappen**
  - [x] Das Statusfeld `OrderMapper` wurde als klickbarer Button umgesetzt.
  - [x] Klick oeffnet das Einstellungen-Popup direkt im Reiter `Bestellung mappen` (`ordermapper`).
  - [x] Hover-Effekt entspricht dem Stil von `Settings`/`Datenverzeichnis` (beige -> tuerkis, weisser Text, heller Rand).

- [x] **P33 - Footer-Link: Serial-Finder -> Reiter Serial parsen**
  - [x] Das Statusfeld `Serial-Finder` wurde als klickbarer Button umgesetzt.
  - [x] Klick oeffnet das Einstellungen-Popup direkt im Reiter `Serial parsen` (`serial`).
  - [x] Hover-Effekt entspricht dem Stil von `Settings`/`Datenverzeichnis`.

- [x] **P34 - Footer-Link: Art.-Matcher -> Reiter Artikel extrahieren**
  - [x] Das Statusfeld `Art.-Matcher` wurde als klickbarer Button umgesetzt.
  - [x] Klick oeffnet das Einstellungen-Popup direkt im Reiter `Artikel extrahieren` (`matcher`).
  - [x] Hover-Effekt entspricht dem Stil von `Settings`/`Datenverzeichnis`.

- [x] **P35 - Footer-Link: PDF-Parser -> Reiter PDF-Parser**
  - [x] Das Statusfeld `PDF-Parser` wurde als klickbarer Button umgesetzt.
  - [x] Klick oeffnet das Einstellungen-Popup direkt im Reiter `PDF-Parser` (`parser`).
  - [x] Hover-Effekt entspricht dem Stil von `Settings`/`Datenverzeichnis`.

- [x] **P36 - Settings-Button Linkziel auf Allgemein umgestellt**
  - [x] Der Sidebar-Footer-Button `Settings` oeffnet das Einstellungen-Popup nun direkt im Reiter `Allgemein` (`general`) statt `Speicher/Cache`.
  - [x] Button-Optik und Hover-Verhalten bleiben unveraendert.

- [x] **P37 - Status-Linkbuttons auf weissen Grundzustand**
  - [x] Die 4 Footer-Status-Linkbuttons `PDF-Parser`, `Art.-Matcher`, `Serial-Finder`, `OrderMapper` haben im Normalzustand jetzt weissen Hintergrund.
  - [x] Link-Verhalten (Deep-Link in den passenden Reiter) bleibt unveraendert.
  - [x] Hover-Effekt bleibt identisch (`#008C99` Hintergrund, weisser Text, `#D8E6E7` Border).
  - [x] `Datenverzeichnis` und `Settings` wurden dabei nicht veraendert.

- [x] **P38 - Bericht: Warum `Aktiver Art.-PDF-Parser` / `Aktiver Art.-Matcher` als Selects in `sonstiges`**
  - [x] Ursache: Die Umstellung wurde auf expliziten Wunsch umgesetzt, damit diese beiden Eintraege als interaktive Felder mit Pruefzeichen + Select nutzbar sind (nicht nur read-only Statuszeilen).
  - [x] Doppelte Verlinkung ist vorhanden:
    - [x] Parser: in `PDF-Parser` (Parser-Regex Select) und in `sonstiges` (`Aktiver Art.-PDF-Parser`), beide ueber `onParserChange`.
    - [x] Matcher: in `Artikel extrahieren` (Matcher Select) und in `sonstiges` (`Aktiver Art.-Matcher`), beide ueber `onMatcherChange`.
  - [x] Bewertung Loeschbarkeit Reiter `sonstiges`:
    - [x] Parser/Matcher-Steuerung bleibt auch ohne `sonstiges` funktionsfaehig (da in den Hauptreitern weiter vorhanden).
    - [x] Serial-Finder und OrderMapper bleiben ebenfalls steuerbar ueber die eigenen Reiter.
    - [x] Das Loeschen von `sonstiges` ist funktional moeglich; entfallen wuerden dort nur die zusaetzlichen Status-/Komfortanzeigen.

- [x] **P39 - Allgemein/Logfile: Text und Button in einer Zeile**
  - [x] Im Reiter `Allgemein` wurde der Bereich `Logfile` so angepasst, dass Label und Button in derselben Zeile stehen.
  - [x] Der Anzeigetext wurde auf `Logfile (global) anzeigen:` geaendert (mit Doppelpunkt).
  - [x] Button-Funktion und Button-Text `Logfile` bleiben unveraendert.

- [x] **P40 - Reiter `sonstiges` entfernt**
  - [x] Der Tab-Trigger `sonstiges` wurde aus der vertikalen Reiterliste entfernt.
  - [x] Der komplette Tab-Inhalt `sonstiges` wurde entfernt.
  - [x] Funktionale Steuerung bleibt erhalten:
    - [x] Parser ueber Reiter `PDF-Parser`.
    - [x] Matcher ueber Reiter `Artikel extrahieren`.
    - [x] Serial-Finder ueber Reiter `Serial parsen`.
    - [x] OrderMapper ueber Reiter `Bestellung mappen`.
