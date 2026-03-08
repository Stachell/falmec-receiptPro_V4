# Export Diagnostic Report

Datum: 2026-03-02
Scope: Analyse des finalen Export-Schritts (Run-Detail Tab "Export" + Settings Tab "Export") ohne Codeänderung.

## Kurzfazit

1. Der Export ist technisch grundsätzlich funktional (XML-Download per Blob funktioniert laut Implementierung).
2. Der Settings-Reiter "Export" kann aktuell nur die Reihenfolge bestehender Spalten ändern, keine neuen Felder hinzufügen/entfernen.
3. Die von dir genannten Felder (`Lieferant`, `Beleg-/Vorgangsnummer`) sind im aktuellen Export nicht enthalten.
4. Zusätzlich gibt es Datenfluss-Lücken: `orderVorgang` und `supplierId` werden im aktuellen PROJ-23-Matchingpfad nicht bis zur Exportzeile durchgetragen.

## Relevante Stellen im Code

- Export-UI/Generator: `src/components/run-detail/ExportPanel.tsx`
- Export-Konfiguration (Settings): `src/store/exportConfigStore.ts`, `src/components/SettingsPopup.tsx`
- Feldtypen: `src/types/index.ts`
- Matching-Pipeline (Run 1-3): `src/services/matching/runs/*.ts`
- Parser-Initialisierung: `src/services/invoiceParserService.ts`

## 1) Welche Werte stehen im Export aktuell zur Verfügung?

Aktuell sind genau 15 `ExportColumnKey` definiert (`src/types/index.ts:463`):

1. `manufacturerArticleNo`
2. `ean`
3. `falmecArticleNo`
4. `descriptionDE`
5. `descriptionIT`
6. `qty`
7. `unitPriceInvoice`
8. `unitPriceOrder`
9. `totalPrice`
10. `orderNumberAssigned`
11. `orderDate`
12. `serialNumber`
13. `storageLocation`
14. `eingangsart`
15. `fattura`

Diese 15 Felder sind auch als Default im Store fix hinterlegt (`src/store/exportConfigStore.ts:15-30`).

## 2) Was kann im Settings-Tab "Export" wirklich eingestellt werden?

Der Tab erlaubt nur:

1. Reihenfolge verändern (`moveColumn`) (`src/components/SettingsPopup.tsx:179,192,201`)
2. Speichern (`saveConfig`) (`src/components/SettingsPopup.tsx:243`)
3. Reset auf Default (`resetToDefault`) (`src/components/SettingsPopup.tsx:250`)

Wichtig: Es gibt dort keine Feldauswahl (kein Add/Remove), nur Sortierung vorhandener Spalten (`src/components/SettingsPopup.tsx:174`).

## 3) Fehlende Felder (dein Hinweis) vs. Ist-Zustand

### 3.1 Lieferant (Nummer)

- Fachlich im Datenmodell vorhanden: `InvoiceLine.supplierId` (`src/types/index.ts:302`).
- Nicht als Export-Spalte definiert (kein `supplierId` in `ExportColumnKey`, `src/types/index.ts:463`).
- Nicht in `resolveColumn` gemappt (`src/components/run-detail/ExportPanel.tsx:44ff`).

### 3.2 Beleg-/Vorgangsnummer

- `orderVorgang` ist im `InvoiceLine`-Typ vorhanden (`src/types/index.ts:298`), aber nicht als Export-Spalte vorhanden.
- `ParsedOrderPosition` enthält `belegnummer` und `supplierId`, aber kein `vorgang` (`src/types/index.ts:424ff`).
- In `orderParser` wird `supplierId` und `belegnummer` gelesen, aber kein `vorgang` (`src/services/matching/orderParser.ts:19-27, 392-404`).
- In Run-3 werden `orderVorgang` und `orderOpenQty` explizit auf `null` gesetzt (`src/services/matching/runs/run3ExpandFifo.ts:115-116`).

=> Ergebnis: Selbst wenn Export-Mapping erweitert würde, sind `orderVorgang`-Werte im aktuellen Flow oft gar nicht mehr vorhanden.

## 4) Auffällige Mismatches im aktuellen Export

1. Label/Mapping-Mismatch:
`orderDate` ist als "Bestelldatum" benannt, exportiert aber nur `orderYear` (`src/store/exportConfigStore.ts:26`, `src/components/run-detail/ExportPanel.tsx:56`).

2. Menge ist noch im Export:
`qty` ist Default-Spalte (`src/store/exportConfigStore.ts:21`), obwohl in PROJ-11 für den Ziel-Export "keine Mengenangabe" beschrieben wurde (siehe `features/PROJ-11-Data-Matching-Update.md`, Kapitel 4.9).

3. "Pflichtfelder vollständig" ist aktuell statisch:
Die Anzeige ist immer grün, ohne echte Feldvalidierung (`src/components/run-detail/ExportPanel.tsx:143`).

## 5) Ist der Export an sich funktional?

### Positiv

1. XML wird generiert (inkl. Header + Item-Felder) und ist aus der konfigurierten Reihenfolge aufgebaut (`src/components/run-detail/ExportPanel.tsx:66-83`).
2. Download wird per Blob + temporärem Anchor ausgelöst (`src/components/run-detail/ExportPanel.tsx:96-101`).
3. Letzte Export-Diagnose wird gespeichert (`setLastDiagnostics`) (`src/components/run-detail/ExportPanel.tsx:102`).

### Einschränkungen / Risiken

1. Export-Freigabe prüft nur:
- offene Error-Issues
- fehlende Lagerorte
(`src/components/run-detail/ExportPanel.tsx:34-36`)

2. `stats.exportReady` wird im Store initial auf `false` gesetzt, aber nicht sichtbar aktualisiert (nur Initialisierungen gefunden: `src/store/runStore.ts:729,816`; Verwendung in UI: `src/pages/RunDetail.tsx:564`).

3. Kein dedizierter automatisierter Test für Exportpfad gefunden (Tests decken Parser/Matching, aber nicht `ExportPanel`/`exportConfigStore` ab).

4. XML-Werte werden ohne Escaping in Tags geschrieben (Sonderzeichen wie `&`, `<` könnten XML brechen) (`src/components/run-detail/ExportPanel.tsx`, String-Interpolation im XML-Builder).

## 6) PROJ-11 Sollbild vs. aktueller Stand (relevant für dein Ticket)

In PROJ-11 sind für den Ziel-Export u.a. `orderVorgang` vorgesehen und qty-freie Einzellogik beschrieben (Kapitel 4.9 in `features/PROJ-11-Data-Matching-Update.md`).
Der aktuelle PROJ-35/Export-Stand arbeitet jedoch mit der festen 15er-Spaltenliste ohne `supplierId`/`orderVorgang`.

## 7) Konkrete Antwort auf deine Frage

1. Nein, die fehlenden Werte sind nicht nur eine reine UI-Sortierfrage im Settings-Tab.
2. `Lieferant` und `Beleg-/Vorgangsnummer` sind derzeit nicht als exportierbare Spalten verfügbar.
3. Zusätzlich ist der Datenfluss für `orderVorgang` im aktuellen Matchingpfad unvollständig (wird auf `null` gesetzt).
4. Der Exportmechanismus selbst (XML-Download) ist grundsätzlich funktionsfähig, aber fachlich unvollständig gegenüber deinem Bedarf.

## Empfehlung für den nächsten Schritt (ohne Umsetzung in diesem Report)

1. Ziel-Exportschema final festziehen (inkl. `supplierId`, `belegnummer`, `orderVorgang`, ohne `qty` falls gewünscht).
2. Datenfluss im PROJ-23-Matchingpfad prüfen/ergänzen, damit diese Felder bis `InvoiceLine` erhalten bleiben.
3. ExportColumnKey + ExportConfig um fehlende Felder erweitern und optional Feldaktivierung (nicht nur Reihenfolge) einführen.
4. Export-Validierung und Export-Tests ergänzen.
