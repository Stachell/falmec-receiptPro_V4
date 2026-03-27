# PROJ-44 ADD-ON — SOLL-ZUSTAND (Architektur-Manifest)

> Dieses Dokument ist die **Single Source of Truth** für die Fehlerhandling-Architektur.
> Jeder Coding-Agent MUSS dieses Manifest lesen, bevor er eine Zeile Code ändert.

---

## 1. Oberste Vision

**Datensicherheit und Revisionssicherheit** stehen über allem.
- Kein User darf einen Fehler "aus Versehen" mit einem einzigen Klick lösen.
- Preisabweichungen MÜSSEN ab Werk hart blockieren (Default = `true`).
- Extrahierte Original-PDF-Daten sind **heilig** und dürfen bei einem Reprocess niemals verloren gehen.
- KISS-Prinzip: Keine "UX-Abkürzungen" auf Kosten der Datensicherheit.

---

## 2. Die Zwei-Stufen-Regel: "Entwurf eintragen" vs. "Lösung anwenden"

Dies ist das **zentrale Architektur-Prinzip** und der häufigste Punkt, an dem Coding-Agenten Fehler machen.

### Stufe 1: Entwurf eintragen (Blauer Status)
- **Was passiert:** Der User wählt im Pop-Up (PriceCell, ArticleMatchCard etc.) einen neuen Wert.
- **Was sich ändert:** NUR der Wert in der InvoiceLine wird aktualisiert (z.B. `unitPriceFinal`, `priceCheckStatus: 'custom'`).
- **Was sich NICHT ändert:** Der Fehler im IssuesCenter bleibt **OFFEN**. Kein `resolveIssue()`, kein Auto-Close, NICHTS.
- **Rückgängig:** Bei "Neu verarbeiten" werden diese Entwurfs-Werte gnadenlos mit den Original-Parsing-Daten überschrieben.
- **Visuelles Signal:** Blaues Checkbox-Icon = "manuell geändert, aber noch nicht angewendet".

### Stufe 2: Lösung anwenden (Grüner Status)
- **Was passiert:** Der User klickt explizit auf "Lösung anwenden" im IssueDialog ODER der "Aktualisieren"-Button im Fehlercenter validiert alle offenen Fehler.
- **Was sich ändert:** Der Fehler wird auf `resolved` gesetzt. Der Wert wird **gesperrt** (grünes Icon).
- **Gesperrt bedeutet:** Bei "Neu verarbeiten" wird dieser Wert NICHT mehr überschrieben. Er ist persistent.
- **Visuelles Signal:** Grünes Checkbox-Icon = "Lösung angewendet und gesperrt".

### WARUM diese Trennung?
Weil wir eine **ERP-Schnittstelle** bauen, keine Klickibunti-App. Wenn ein Preis in Sage ERP 50,00 EUR beträgt und die Rechnung 55,00 EUR zeigt, dann ist das ein Buchhaltungs-relevanter Unterschied. Den darf kein System automatisch "wegklicken". Der User MUSS bewusst entscheiden.

---

## 3. Warum Snapshots für Live-Guards tödlich sind

### Das Problem (IST-Zustand Round 11)
Beim Erstellen eines Runs wurde ein **Snapshot** der Einstellungen im `RunConfig` gespeichert:
```typescript
// FALSCH — Snapshot im Run-Rucksack
config: { blockStep2OnPriceMismatch: false, ... }
```
Der Guard in `advanceToNextStep` las dann DIESEN Snapshot statt der Live-Einstellung.

### Warum das tödlich ist
1. **Default steht auf `false`** → Jeder neue Run hat den Blocker AUS, egal was der User in den Settings einstellt.
2. **Nachträgliche UI-Änderungen werden ignoriert** → User stellt Schalter auf "AN", aber der Run schaut stur auf sein altes "Foto".
3. **Datenleiche** → Der Snapshot-Wert liegt als toter Code im RunConfig und verleitet zukünftige Agenten dazu, ihn wieder zu verdrahten.

### Der SOLL-Zustand
- `blockStep2OnPriceMismatch` wird **aus dem RunConfig-Interface gelöscht** (Datenleiche entsorgen).
- `blockStep2OnPriceMismatch` wird **aus der Run-Erzeugung entfernt**.
- Der Guard in `advanceToNextStep` fragt **NUR** den Live-Wert: `get().globalConfig.blockStep2OnPriceMismatch`.
- Der **Default** in `globalConfig` steht auf `true` (ab Werk aktiv).

### ACHTUNG: Was NICHT gelöscht werden darf
- `autoStartStep4` im RunConfig **bleibt erhalten** — das ist run-spezifisch (Pausen-Schieberegler).
- Alle anderen RunConfig-Felder (eingangsart, tolerance, etc.) bleiben unberührt.

---

## 4. Pop-Ups sind getrennt vom Fehlercenter

### Architektur-Regel
Pop-Ups (PriceCell-Popover, ArticleMatchCard etc.) ändern **nur den Wert in der InvoiceLine**.
Das Fehlercenter (IssuesCenter, IssueDialog) verwaltet **nur den Fehlerstatus**.
Diese beiden Welten sind **strikt getrennt**.

### Konsequenz
- Kein `resolveIssue()` in `setManualPriceByPosition` oder in der IssueCard.
- Kein Auto-Close von Issues nach Preiswahl.
- Der Fehler verschwindet erst, wenn der User bewusst "Lösung anwenden" klickt oder der "Aktualisieren"-Button alle Fehler validiert und bestätigt.

---

## 5. Der "Aktualisieren"-Button (Mehrstufige Validierung)

### Schritt a: Preisabweichungs-Sperre
Bei Klick prüft das System zuerst, ob unter den offenen Fehlern **Preisabweichungen** sind.
- **JA →** Sofortige Meldung: "Preisabweichungen können nicht über Aktualisieren erledigt werden. Bitte über 'Lösung anwenden' abarbeiten." → Mechanik beendet.
- **NEIN →** Weiter zu Schritt b.

### Schritt b: Regex-/Format-Validierung
System prüft alle offenen Fehler, ob die eingetragenen Entwurfs-Werte den Validierungsregeln entsprechen (Regex für Artikelnummer, Seriennummern-Format, EAN-Länge etc.).
- **Fehler vorhanden →** Meldung: "Fehlerbehandlung nicht abgeschlossen, X offene Fehler verbleiben." → Mechanik beendet.
- **Alle bestanden →** Alle Entwurfs-Felder werden auf "manuell-geprüft" (grünes Icon) gesetzt, alle offenen Fehler auf `resolved`, Workflow wird zum nächsten Step angeschoben.

---

## 6. PDF-Datenschutz beim Reprocess

### Regel
Die Original-PDF-Parsing-Daten (`parsedPositions`, `parserWarnings`, `parsedInvoiceResult`) dürfen **niemals** durch asynchrone Auto-Save-Effekte genullt werden.

### Mechanismus
- `buildAutoSavePayload` darf `parsedPositions` und `parserWarnings` nur speichern, wenn `currentParsedRunId === runId`. Andernfalls darf es **keine leeren Arrays** schreiben, sondern muss die Felder **komplett weglassen** (undefined), damit die IndexedDB-Daten nicht überschrieben werden.
- Beim Reprocess muss `currentParsedRunId` **vor** dem Reset geschützt oder die Rehydrierung aus der IndexedDB erzwungen werden.

---

## 7. Zusammenfassung der Architektur-Regeln

| # | Regel | Kurzform |
|---|-------|----------|
| 1 | Kein Auto-Resolve nach Datenänderung | Pop-Up ≠ Fehlerlösung |
| 2 | Guard liest Live-Wert, nicht Snapshot | globalConfig > RunConfig |
| 3 | Default für Preis-Blocker = true | Ab Werk sicher |
| 4 | Entwurf ≠ Lösung | Blau ≠ Grün |
| 5 | PDF-Daten sind heilig | Auto-Save darf nicht nullen |
| 6 | Datenleichen entsorgen | Toter Code = Fehlerquelle von morgen |
| 7 | KISS über alles | Keine UX-Abkürzungen auf Kosten der Sicherheit |
