# Reparaturplan: Integriertes `logicdev_PDF-Parser` fuer `NO_POSITIONS_FOUND`

## Kurzfassung
Das integrierte TypeScript-Modul wird funktional auf die robuste Positionslogik der Backup-Version angehoben, ohne den Backup-Ordner oder den Betriebsmodus umzubauen. Ziel ist: Schritt 1 darf bei validen Preis-/Mengenzeilen nicht mehr auf 0 Positionen laufen.

## Rahmen und Zielbild
1. `logicdev_PDF-Parser_V1` bleibt unveraendert als Backup bestehen.
2. Aktiver Parser bleibt integriert (`typescript`), kein Auto-Fallback auf Backup.
3. Schritt 1 ist erfolgreich, wenn Positionen aus Preis-/Mengenstruktur erkannt werden, auch wenn Artikel/EAN teilweise fehlen.
4. `NO_POSITIONS_FOUND` darf nur noch auftreten, wenn Hauptlogik plus Fallback-Scan wirklich nichts finden.

## Oeffentliche API/Typen
1. Keine Breaking Changes an `InvoiceParser` oder `ParsedInvoiceResult`.
2. Neue/konkretisierte Warning-Codes aus dem integrierten Parser:
   - `POSITION_MISSING_IDENTIFIER` (severity `warning`)
   - `FALLBACK_PARSING` (severity `warning`)
3. `moduleName` des integrierten Parsers bleibt `logicdev_PDF-Parser`.

## Implementierung (entscheidungsvollstaendig)

### 1. Plan-Dokument im Repo aktualisieren
1. `Parserfix_Chatgpt.md` vollstaendig durch diesen Plan ersetzen.
2. Alte Aussagen dort entfernen, die auf inzwischen geaenderte Parser-Auswahl verweisen.

### 2. Positionsparser in TS auf robuste State-Logik umstellen
Datei: `src/services/parsers/FatturaParserService.ts`

1. `parseLines()` auf zustandsbasierte Verarbeitung umbauen:
   - Zustaende/Akkus: `currentArticle`, `currentEan`, `positionIndex`.
   - Fuer jede `groupedLine`: Skip-Pattern pruefen, Order-Block pflegen, dann Artikel/EAN sammeln, dann PZ/Preis committen.
2. Kombinierte Zeile `article + ean + PZ` ohne Frueh-`continue` verarbeiten.
3. Item-basierte Erkennung wie im Backup:
   - Left-column Scan `x < 100` fuer Artikel/EAN.
   - All-item Scan fuer standalone EAN und numerische Artikel (`9-digit`, `8-digit F#xx`).
4. Trailing-EAN-Logik direkt im Hauptlauf:
   - Wenn neue EAN auftaucht, aber kein neuer Artikel und letzte Position ohne EAN existiert, EAN rueckwirkend zuweisen.
5. Vollstaendige PZ-Verarbeitung:
   - Direktformat `PZ qty unit total`.
   - Teilformat `PZ qty` mit Preis-Lookahead bis 3 Folgezeilen.
   - Abbruch der Lookahead-Suche bei Strukturgrenzen (`Vs. ORDINE`, neuer `PZ`, Header/Skip).
6. Commit-Regel laut Entscheidung:
   - Position wird bei valider Menge/Preis erzeugt, auch wenn Artikel/EAN fehlen.
   - Dann Warning `POSITION_MISSING_IDENTIFIER` mit `positionIndex` hinzufuegen.
7. Rest-Akkumulator am Ende:
   - Falls unvollstaendige Position offen ist, `INCOMPLETE_POSITION` als Warning.

### 3. Fallback-Scan hinzufuegen (nur integriert, nicht Backup)
Datei: `src/services/parsers/FatturaParserService.ts`

1. Neue private Methode `parsePositionsFallback(...)` ergaenzen.
2. Input: verketteter Text aus `pages[*].items[*].text` oder `pages[*].fullText`.
3. Regex-Blockscan fuer `article + ean + PZ + qty + unit + total`.
4. Nur ausfuehren, wenn Hauptlauf 0 Positionen ergibt.
5. Bei Treffer Warning `FALLBACK_PARSING` setzen.
6. `NO_POSITIONS_FOUND` nur setzen, wenn auch Fallback 0 Treffer liefert.

### 4. Muster robuster machen gegen fragmentierten Text
Datei: `src/services/parsers/constants/fatturaPatterns.ts` und `src/services/parsers/FatturaParserService.ts`

1. `EAN_PATTERN` von strikt zeilenankert auf token-/inline-faehig umstellen (`\\b(803\\d{10})\\b`).
2. Artikelerkennung tokenbasiert ergaenzen:
   - `extractArticleNumber(text)` soll zuerst Tokens pruefen, dann Gesamtzeile.
   - Zeilenanker-Muster weiterhin erlaubt, aber nicht einzige Erkennung.
3. Keine Lockerung, die `PZ`/Preisfelder als Artikel fehlklassifiziert.

### 5. Warnungs-/Issue-Transparenz absichern
Datei: `src/store/runStore.ts`

1. Sicherstellen, dass neue Warning-Codes im Step-1-Issue-Mapping korrekt landen.
2. `POSITION_MISSING_IDENTIFIER` bleibt nicht-blockierend (`warning`).
3. Blocker bleibt nur bei echten Parser-Errors wie `NO_POSITIONS_FOUND`.

## Tests und Szenarien

### Automatisierte Tests
Datei neu: `src/services/parsers/FatturaParserService.test.ts`

1. `parst Position bei kombinierter Zeile`:
   - Artikel/EAN/PZ in einer oder nahen Zeilen.
   - Erwartung: mindestens 1 Position.
2. `parst Position bei partial PZ mit Lookahead`:
   - `PZ qty` in Zeile N, Preise in N+1/N+2.
   - Erwartung: Position wird erstellt.
3. `uebernimmt Position ohne Artikel/EAN mit Warning`:
   - nur Menge/Preis vorhanden.
   - Erwartung: Position vorhanden, Warning `POSITION_MISSING_IDENTIFIER`.
4. `fallback scan greift bei 0 Haupttreffern`:
   - Hauptlauf liefert 0, Fallbacktext enthaelt valide Bloecke.
   - Erwartung: Positionen > 0, Warning `FALLBACK_PARSING`.
5. `NO_POSITIONS_FOUND nur bei totalem Nulltreffer`:
   - weder Hauptlauf noch Fallback finden Positionen.
   - Erwartung: Error-Warning vorhanden.

### Verifikation im Projekt
1. `npm run test`
2. `npm run build`
3. Manuell mit `logicdev_PDF-Parser_V1/logicdev_sample/test_pdfs/Fattura2026020007-SAMPLE-DL.pdf`:
   - Schritt 1 zeigt Positionen > 0.
   - Kein blocker `NO_POSITIONS_FOUND`.
   - Parsername im Log: `logicdev_PDF-Parser`.

## Abnahmekriterien
1. Schritt 1 verarbeitet die bekannten Sample-Fattura-PDFs ohne `NO_POSITIONS_FOUND`.
2. Integriertes Modul bleibt aktiv, Backup bleibt unberuehrt.
3. Bei fehlenden Kennungen werden Positionen trotzdem erzeugt und nur gewarnt.
4. Issues-Tab zeigt konsistente Eintraege zu echten Parserfehlern.

## Annahmen und gesetzte Defaults
1. Parsermodus bleibt `typescript` (integriert strikt).
2. Kein automatischer Wechsel auf Backup-Serverparser.
3. Backup-Verzeichnis `logicdev_PDF-Parser_V1` bleibt unveraendert.
4. Parsing-Qualitaet priorisiert Positionsvollstaendigkeit vor harter Kennungs-Pflicht in Schritt 1.
