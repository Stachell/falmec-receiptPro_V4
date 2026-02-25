# PROJ-28 – Unification of Settings & Workflow Mechanics

## Beschreibung

Die Settings-Tabs ("PDF-Parser", "Artikel extrahieren", "Serial parsen", "Bestellung mappen") sind historisch isoliert gewachsen. Jeder Tab hat eigene Muster fuer Engine-Auswahl, Profil-Verwaltung, Overrides und Step-Blockierung. PROJ-28 standardisiert das gesamte Settings-Cockpit (UI-Struktur, Store-State, Interfaces) ohne die eigentliche Ausfuehrungslogik der Parser/Matcher/Finder anzufassen.

## Abhaengigkeiten

- Baut auf: PROJ-14 (Parser-Modularisierung), PROJ-16 (Matcher-System), PROJ-20 (SerialFinder/OrderMapper), PROJ-24 (OrderParser-Profile), PROJ-27 (Settings-UI-Rework)
- Voraussetzung fuer: PROJ-22 (Enterprise UI Polish)

---

## User Stories

| # | Story | Akzeptanzkriterium |
|---|-------|-------------------|
| US-1 | Als Lager-MA will ich in **jedem** Settings-Tab dieselbe Struktur sehen (Engine, Profil, Override, Diagnose, Block-Toggle), damit ich keine Tab-spezifischen Muster lernen muss. | Alle 4 Step-Tabs haben identische Abschnitts-Hierarchie A–F |
| US-2 | Als Einkauf will ich einen Toggle "Preisabweichungen blockieren Step 2", damit der Run nicht weiterlaeuft, solange offene Preis-Issues bestehen. | Toggle blockiert Advance von Step 2 → Step 3 bei offenen `price-mismatch` Error-Issues |
| US-3 | Als Einkauf will ich einen Toggle "Fehlende Bestellzuweisung blockiert Step 4", damit keine unzugeordneten Artikel in den Export rutschen. | Toggle blockiert Advance von Step 4 → Step 5 bei offenen `order-assignment` Error-Issues |
| US-4 | Als Power-User will ich Alias-Listen und Regex-Felder in einem separaten Modal pflegen (nicht inline im Tab), damit der Tab uebersichtlich bleibt. | Override-Toggle ON → "Anpassen"-Button → Modal mit zwei Sektionen (Aliases / Regex) |
| US-5 | Als Lager-MA will ich nach jedem Run-Schritt eine Diagnose-Zusammenfassung im Settings-Tab sehen. | Alle 4 Tabs zeigen `latestDiagnostics[stepNo]` mit Modul, Konfidenz, Summary |

---

## Edge Cases

| # | Szenario | Erwartetes Verhalten |
|---|----------|---------------------|
| EC-1 | Block-Toggle wird waehrend laufendem Step umgelegt | Guard greift sofort beim naechsten "Weiter"-Klick (Live-Wirkung) |
| EC-2 | Alle Error-Issues werden geloest, waehrend Block aktiv ist | Guard erkennt leere Error-Liste → Advance wird freigegeben |
| EC-3 | Override-Toggle auf OFF → Overrides waren vorher gesetzt | Override-Daten bleiben gespeichert (nicht geloescht), werden aber ignoriert |
| EC-4 | Neuer Run gestartet → alte Diagnostics noch sichtbar | `latestDiagnostics` wird bei Run-Start auf `{}` zurueckgesetzt |
| EC-5 | Step 4: Bestehende `lastOrderParserDiagnostics` vs. neue Struktur | Migration: altes Feld wird in `latestDiagnostics[4]` ueberfuehrt; alter Feldname entfernt |

---

## Tech Design (Solution Architect)

### A) Komponenten-Struktur

```
SettingsPopup (bestehend, 889 Zeilen → wird umstrukturiert)
├── Tab: Allgemein (unveraendert)
├── Tab: PDF-Parser (Step 1)
│   ├── [A] Aktiver Parser (Dropdown) ✓ besteht
│   ├── [D] Letzte Diagnose (NEU — read-only Block)
│   └── [E] Import / Verwaltung ✓ besteht
├── Tab: Artikel extrahieren (Step 2)
│   ├── [A] Aktiver Matcher (Dropdown) ✓ besteht
│   ├── [C] Custom Override (Toggle + "Anpassen" Button → Modal) NEU
│   ├── [D] Letzte Diagnose (NEU)
│   └── [F] Block-Toggle: Preisabweichungen blockieren Step 2 (NEU)
├── Tab: Serial parsen (Step 3)
│   ├── [A] Aktiver Serial-Finder (Dropdown) ✓ besteht
│   ├── [D] Letzte Diagnose (NEU)
│   └── [F] Block-Toggle: Pflicht-S/N blockiert Step 3 ✓ besteht (Label-Fix)
├── Tab: Bestellung mappen (Step 4)
│   ├── [A] Aktiver OrderMapper (Dropdown) ✓ besteht
│   ├── [B] Order-Parser-Profil (Dropdown) ✓ besteht
│   ├── [C] Custom Override → Modal (UMBAU: Inline-Inputs raus, Modal rein)
│   ├── [D] Letzte Diagnose (MIGRATION auf latestDiagnostics[4])
│   └── [F] Block-Toggle: Fehlende Bestellzuweisung blockiert Step 4 (NEU)
├── Tab: Speicher/Cache (unveraendert)
└── Tab: Sonstiges (unveraendert)

OverrideEditorModal (NEU — shadcn Dialog)
├── Sektion 1: Alias-Listen (CSV-Textfelder je Feld)
│   ├── Step 2: Matcher-Feld-Aliase
│   └── Step 4: 7 Order-Parser-Felder (besteht, wird hierher verschoben)
└── Sektion 2: Zahlenformate / Regex (dedizierte benannte Felder)
    ├── Step 2: "Falmec Art-Nr Regex", "EAN Regex", "Hersteller-Nr Regex"
    └── Step 4: "Bestellnummer Regex", "Bestelljahr Regex"
```

### B) Datenmodell (Klartext)

**Permanente User-Einstellungen (RunConfig — bestehend, wird erweitert):**
- Alle bestehenden Felder bleiben unveraendert
- NEU: `blockStep2OnPriceMismatch` — Ja/Nein, Standard: Nein
- NEU: `blockStep4OnMissingOrder` — Ja/Nein, Standard: Nein
- NEU: `matcherProfileOverrides` — Override-Daten fuer Step 2 (Aliases + Regex), analog zum bestehenden `orderParserProfileOverrides`

**Fluechtige Run-Ergebnisse (RunState — bestehend, wird erweitert):**
- NEU: `latestDiagnostics` — Sammelt Diagnose-Daten aller 4 Steps in einem Feld
  - Jeder Step (1–4) liefert: Modulname, Konfidenz (hoch/mittel/niedrig), Zusammenfassung, Zeitstempel
- MIGRATION: Das bestehende Feld `lastOrderParserDiagnostics` (nur Step 4) wird in `latestDiagnostics[4]` ueberfuehrt und als eigenes Feld entfernt

**Gespeichert in:** Zustand-Store (Memory) + localStorage-Hydration fuer RunConfig

### C) Tech-Entscheidungen

| Entscheidung | Begruendung |
|---|---|
| **Diagnostics in RunState, nicht in RunConfig** | Diagnostics sind fluechtige Ergebnisse eines konkreten Runs. RunConfig speichert nur permanente User-Einstellungen. Step 4 lebte schon in RunState → jetzt alle 4 Steps vereinheitlicht. |
| **Block-Guard prueft beim Step-ABSCHLUSS** | Preisabweichungen entstehen WAEHREND Step 2 — der Guard muss also pruefen, wenn Step 2 abgeschlossen wird (nicht beim Betreten). Analoges Timing fuer Step 4. |
| **Block-Toggles wirken LIVE** | Der Guard wird bei jedem Klick auf "Weiter" neu ausgewertet. Vorteil: User kann Toggle waehrend des Runs umschalten. |
| **Override-Daten bleiben bei Toggle OFF gespeichert** | User verliert keine muehsam eingetippten Aliases wenn er den Override voruebergehend deaktiviert. Override wird nur ignoriert, nicht geloescht. |
| **Eigene Komponente OverrideEditorModal** | Trennt die Alias-/Regex-Pflege sauber vom Settings-Tab. Halbiert die Zeilenanzahl im SettingsPopup. Wiederverwendbar fuer Step 2 + Step 4. |
| **Regex-Felder klar benannt statt generisches Array** | Step 2 bekommt 3 feste Felder ("Falmec Art-Nr Regex", "EAN Regex", "Hersteller-Nr Regex") analog zu Step 4's "Bestellnummer Regex" / "Bestelljahr Regex". Keine "+/-"-Liste — das ist sicherer und verstaendlicher. |
| **Kein Override fuer Step 1 und Step 3** | Step 1 (PDF-Parser) hat Import/Verwaltung statt Aliases. Step 3 (Serial-Finder) hat kein Alias-System. Override ergibt dort keinen Sinn. |

### D) Abhaengigkeiten (Packages)

Keine neuen Packages noetig. Alles wird mit bestehenden Tools gebaut:
- **shadcn/ui Dialog** — fuer das OverrideEditorModal (bereits installiert)
- **shadcn/ui Switch** — fuer Block-Toggles (bereits installiert)
- **Zustand** — fuer Store-Erweiterung (bereits installiert)
- **Lucide Icons** — fuer Diagnose-Indikatoren (bereits installiert)

---

## Implementation Phasen

### Phase A — Types & Store (kein UI)
- Neue Interfaces: `StepDiagnostics`, `MatcherProfileOverrides`, `MatcherFieldAliases`
- RunConfig um 3 Felder erweitern (blockStep2, blockStep4, matcherProfileOverrides)
- RunState um `latestDiagnostics` erweitern; `lastOrderParserDiagnostics` migrieren
- Neue Action: `setStepDiagnostics(stepNo, diag)`

### Phase B — Block-Step-Guard
- Step-Guard in RunDetail.tsx: Pruefen beim Abschluss von Step 2 (price-mismatch) und Step 4 (order-assignment)
- Optionaler visueller Hinweis im WorkflowStepper ("Blockiert: X offene Issues")

### Phase C — Override-Modal
- Neue Komponente `OverrideEditorModal.tsx` (shadcn Dialog)
- Sektion 1: Alias-Listen (CSV je Feld)
- Sektion 2: Benannte Regex-Felder mit Live-Validierung

### Phase D — SettingsPopup Unified Layout
- Alle 4 Step-Tabs unifizieren (Abschnitte A–F)
- Bestehende Inline-Alias-Inputs aus Tab 4 ins Modal verschieben
- Diagnose-Block in allen 4 Tabs aus `latestDiagnostics[stepNo]`

### Phase E — Diagnose-Stubs
- Nach jedem Step-Abschluss `setStepDiagnostics()` aufrufen (Stub-Daten OK fuer PROJ-28)
- Step 4: Bestehenden `lastOrderParserDiagnostics`-Schreiber auf neue Struktur umstellen

---

## Betroffene Dateien

| Datei | Aenderungstyp |
|---|---|
| `src/types/index.ts` | RunConfig erweitern; 3 neue Interfaces |
| `src/store/runStore.ts` | initialState, neue Action, Migration |
| `src/pages/RunDetail.tsx` | Step-Guard (2 neue Checks) |
| `src/components/WorkflowStepper.tsx` | Optionaler Block-Hinweis |
| `src/components/SettingsPopup.tsx` | 4 Tabs unifiziert; Override → Modal |
| `src/components/OverrideEditorModal.tsx` | NEU |
| `src/services/invoiceParserService.ts` | Diagnose-Stub Step 1 |

---

## Status

- [x] Feature-Spec erstellt
- [x] Tech Design erstellt
- [x] Phase A — Types & Store
- [x] Phase B — Block-Step-Guard
- [x] Phase C — Override-Modal (`src/components/OverrideEditorModal.tsx` neu erstellt; shadcn Dialog, Sektion 1 Alias-CSV, Sektion 2 benannte Regex-Felder mit Live-Validierung, wiederverwendbar fuer Step 2 + Step 4)
- [x] Phase D — SettingsPopup Unified Layout (alle 4 Step-Tabs unifiziert: DiagnosticsBlock [D] in allen Tabs, [C] Override-Toggle + Anpassen-Button in Matcher + OrderMapper, [F] Block-Toggles in Matcher + OrderMapper, Schema-Display entfernt, Inline-Alias-Inputs nach Modal migriert, `latestDiagnostics` ersetzt `lastOrderParserDiagnostics`)
- [x] Phase E — Diagnose-Stubs

---

## ADD-ON: RE-Positionen Header-Separator + Top-Right Expand/Collapse Toggle

### Zielbild
- Im Header-Bereich von `Run-Detail > RE-Positionen > Body` wird der rechte Cluster wie in der Artikelliste aufgebaut:
  1. linker Teil: bestehender Textblock (rechtsbuendig, unveraendert)
  2. rechter Teil: neuer Separator-Slot als unsichtbarer Layoutanker
- In diesem Separator-Slot sitzt ein kompakter Top-Toggle (icon-only), der denselben Expand/Collapse-State wie der Footer-Toggle steuert.
- Bei leerer Liste (`positions.length === 0`) wird kein Top-Toggle angezeigt.

### Technische Umsetzung
- Datei: `src/components/run-detail/InvoicePreview.tsx`
- `BESTELLUNG`-Spaltenbreite und Header-Slot teilen sich eine gemeinsame Breitenquelle:
  - `const bestellungWidthClass = 'w-24'`
- Header-Layout rechts:
  - Container: `ml-auto flex items-stretch`
  - Slot: `${bestellungWidthClass} flex items-center justify-center self-stretch border-l border-transparent`
- Top-Toggle:
  - `Button` mit `variant="ghost"` + `size="icon"`
  - collapsed: `ChevronsDown` mit Pulse
  - expanded: `ChevronsUp`
  - gleicher State-Handler wie Footer (`expandedPositions` / `setExpandedPositions`)

### Sicherheitsregel
- Kein Top-Toggle und kein zusaetzlicher Separator-Slot im Empty-State (`positions.length === 0`).

### Scope / Non-Goals
- Keine Aenderung an Store, Parser, Workflow oder API.
- Rein visuelles/strukturelles UI-Refinement in `InvoicePreview`.
