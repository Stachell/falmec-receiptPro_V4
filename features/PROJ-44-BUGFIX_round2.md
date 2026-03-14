# PROJ-44 BUGFIX Runde 2 — Master-Architekturplan

> **Confidence: 9.6 / 10.0**
> **Datum:** 2026-03-13
> **Status:** Bereit zur Durchführung

---

## Kontext

Runde 2 der PROJ-44 Bugfixes behebt 4 verbleibende UI-Bugs nach der ersten Bugfix-Runde (PROJ-43+44). Alle Änderungen sind **reine UI/Darstellung** — keine Datenmodell-, Workflow- oder Export-Änderungen. Die Bugs betreffen: leere E-Mail-Felder beim Öffnen der Settings, ein platzendes Issue-Popup, falsches Button-Design und fehlende/falsche Tabellenspalten in der Lagerort-Ansicht.

### ⛔ WORKFLOW-SCHUTZ (Absolute Warnung)

**Keine der folgenden Dateien/Module darf verändert werden:**
- `src/services/exportService.ts` (CSV/XML Export-Spalten)
- `src/services/matchers/` (Matcher-Logik)
- `src/services/parslogic/` (Parser-Logik)
- `src/services/archiveService.ts` (Archiv-Workflow)
- `src/store/runStore.ts` (Run-Lifecycle)
- `src/types/index.ts` (Datenmodell)

Ein zerschossener Export bedeutet **Datenverlust im ERP-System**. UI und Core-Logik bleiben strikt getrennt.

---

## Bug 2: E-Mail Settings (SettingsPopup.tsx)

### Problem
- E-Mail-Inputs sind beim Öffnen des Popups kurz leer (Flash), weil der State als leeres Array initialisiert wird (Zeile 316-318)
- Kein Auto-Save: User vergisst "Speichern" → Daten gehen verloren
- Toast-z-index und Button-Feedback sind bereits korrekt implementiert (z-index 9999 in `sonner.tsx:13`, "Gespeichert!" in Zeile 1016-1019)

### Lösung (3 Änderungen)

**Änderung 2a — State-Initialisierung fixen (Zeile 316-318)**

```diff
- const [emailAddresses, setEmailAddresses] = useState<string[]>(
-   Array.from({ length: ERROR_HANDLING_EMAIL_SLOT_COUNT }, () => ''),
- );
+ const [emailAddresses, setEmailAddresses] = useState<string[]>(getStoredEmailSlots);
```

`getStoredEmailSlots` als Lazy-Initializer (Funktionsreferenz ohne `()`) → React ruft es nur beim ersten Mount auf. Eliminiert den leeren Flash komplett. Der `useEffect` bei `[open]` (Zeile 360-364) bleibt bestehen — er lädt frische Daten beim erneuten Öffnen.

**Änderung 2b — isInitialMountRef hinzufügen (bei Zeile 315, nach `emailSaved`-State)**

```tsx
const isInitialMountRef = useRef(true);
```

`useRef` ist bereits importiert (Zeile 312: `fileInputRef`).

**Änderung 2c — Debounced Auto-Save einfügen (nach Zeile 364, nach dem Email-Lade-useEffect)**

```tsx
// PROJ-44 BUGFIX R2: Debounced auto-save (500ms, überspringt ersten Render)
useEffect(() => {
  if (isInitialMountRef.current) {
    isInitialMountRef.current = false;
    return;
  }
  const timer = setTimeout(() => {
    saveEmailAddresses(emailAddresses);
  }, 500);
  return () => clearTimeout(timer);
}, [emailAddresses]);
```

- `isInitialMountRef` verhindert Save beim ersten Render (der ja die geladenen Daten enthält)
- 500ms Debounce: Timer wird bei jedem Tastenanschlag zurückgesetzt → nur finaler Zustand wird gespeichert
- Stilles Save (kein Toast) — der manuelle "Speichern"-Button behält sein visuelles Feedback

**Keine Änderung an:** `sonner.tsx` (z-index 9999 ✅), Speichern-Button (Zeile 1015-1024 ✅)

---

## Bug 3: IssueDialog Layout (IssueDialog.tsx)

### Problem
- Dialog ist zu schmal (600px) und platzt bei umfangreichen Fehlerberichten
- Kein Höhen-Constraint: Content läuft aus dem Fenster
- Action-Buttons scrollen mit statt unten fixiert zu bleiben

### Lösung (3 Änderungen)

**Änderung 3a — DialogContent verbreitern + Flex-Column (Zeile 190)**

```diff
- <DialogContent className="max-w-[600px] w-full" style={{ backgroundColor: '#D8E6E7' }}>
+ <DialogContent className="max-w-[810px] w-full max-h-[85vh] flex flex-col" style={{ backgroundColor: '#D8E6E7' }}>
```

600px × 1.35 = **810px**. `max-h-[85vh]` begrenzt die Höhe. `flex flex-col` ermöglicht es dem Tabs-Bereich, den verfügbaren Platz zu füllen.

**Änderung 3b — Tabs-Container: flex-fill statt fixe Höhe (Zeile 205)**

```diff
- className="flex gap-4 mt-2 h-[65vh] max-h-[800px]"
+ className="flex gap-4 mt-2 flex-1 overflow-hidden"
```

`flex-1` füllt den restlichen Platz im Dialog. `overflow-hidden` delegiert Scroll-Verantwortung an die TabsContent-Kinder.

**Änderung 3c — Tab 3 "Lösung erzwingen": Button am Boden fixieren (Zeile 324 + 385-392)**

Tab 3 TabsContent (Zeile 324) ändern:
```diff
- <TabsContent value="resolve" className="flex-1 overflow-y-auto mt-0 space-y-3">
+ <TabsContent value="resolve" className="flex-1 flex flex-col overflow-hidden mt-0">
```

Dann den Content in scrollbaren Container wrappen und Button herauslösen:
```tsx
<TabsContent value="resolve" className="flex-1 flex flex-col overflow-hidden mt-0">
  <div className="flex-1 overflow-y-auto space-y-3">
    {/* Bestehender Content: Warning-Box, Zeilen-Auswahl, Resolution-Note */}
  </div>
  <div className="pt-2 shrink-0">
    <Button onClick={handleResolve} disabled={!resolutionNote.trim()}
      className="gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white">
      <AlertTriangle className="w-3.5 h-3.5" />
      Loesung anwenden
    </Button>
  </div>
</TabsContent>
```

**Andere Tabs** (1, 2, 4, 5) behalten `overflow-y-auto` — dort funktioniert Scrolling bereits korrekt.

---

## Bug 4: Button-Design Tab 3 (IssueDialog.tsx)

### Problem
- "Lösung erzwingen"-Button in Tab 3 (Zeile 388): Orangener Hintergrund, weiße Schrift — katastrophal
- Tab 1 (Zeile 291) hat bereits das korrekte Design — muss unangetastet bleiben

### Lösung (1 Änderung)

**Änderung 4a — Button-Klassen in Zeile 388 ONLY:**

```diff
- className="gap-1 text-xs bg-orange-600 hover:bg-orange-700 text-white"
+ className="gap-1 text-xs bg-white text-orange-600 border border-orange-600 shadow-sm hover:bg-green-600 hover:text-white"
```

> **WARNUNG:** Zeile 291 (Tab 1 Shortcut-Button) hat bereits identisches Styling → **NICHT anfassen!**

*Hinweis: Diese Änderung wird in Änderung 3c bereits integriert, da der Button dort im neuen `<div className="pt-2 shrink-0">` Wrapper landet.*

---

## Bug 6: Tabelle WarehouseLocations (WarehouseLocations.tsx)

### Problem
- Keine Falmec-Artikelnummer-Spalte
- "Artikelnummer" zeigt `manufacturerArticleNo` — ist eigentlich die Hersteller-Nummer
- Beschreibung zeigt `descriptionIT` statt `descriptionDE`
- Sortierung unterstützt nur 2 Keys, braucht 3
- Falmec-Artikelnummer ist ein String → braucht numerische String-Sortierung

### Lösung (6 Änderungen)

**Änderung 6a — SortKey-Typ erweitern (Zeile 21)**

```diff
- type SortKey = 'positionIndex' | 'storageLocation';
+ type SortKey = 'positionIndex' | 'falmecArticleNo' | 'storageLocation';
```

**Änderung 6b — sortLines-Funktion erweitern (Zeile 62-74, komplett ersetzen)**

```tsx
const sortLines = (lines: InvoiceLine[]): InvoiceLine[] => {
  return [...lines].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'positionIndex') {
      cmp = (a.positionIndex ?? 0) - (b.positionIndex ?? 0);
    } else if (sortKey === 'falmecArticleNo') {
      const aVal = a.falmecArticleNo ?? '';
      const bVal = b.falmecArticleNo ?? '';
      cmp = aVal.localeCompare(bVal, 'de', { numeric: true });
    } else {
      const aVal = a.storageLocation ?? '';
      const bVal = b.storageLocation ?? '';
      cmp = aVal.localeCompare(bVal, 'de');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });
};
```

`{ numeric: true }` stellt sicher: `"99"` < `"100"` (nicht alphabetisch `"100"` < `"2"`).
**DRY-Regel eingehalten:** Eine einzige `sortLines`-Funktion für alle Arrays.

**Änderung 6c — Neue Spalte "Artikelnr." im Header (nach Zeile 200, nach Pos-Header)**

```tsx
<TableHead
  className={`cursor-pointer select-none ${expandedDetails ? 'bg-[hsl(var(--surface-sunken))]' : 'sticky top-0 z-20 bg-[hsl(var(--surface-sunken))]'}`}
  onClick={() => handleSortClick('falmecArticleNo')}
>
  Artikelnr. <SortIcon col="falmecArticleNo" />
</TableHead>
```

**Änderung 6d — "Artikelnummer" umbenennen zu "Herstellerartikelnr." (Zeile 201)**

```diff
- <TableHead className={...}>Artikelnummer</TableHead>
+ <TableHead className={...}>Herstellerartikelnr.</TableHead>
```

**Änderung 6e — Neue Datenzelle "Artikelnr." im Body (nach Zeile 227, nach Pos-Zelle)**

```tsx
<TableCell>
  <span className="font-mono text-sm">{line.falmecArticleNo ?? '—'}</span>
</TableCell>
```

**Änderung 6f — Beschreibung von IT auf DE umstellen (Zeile 233)**

```diff
- {line.descriptionIT}
+ {line.descriptionDE ?? line.descriptionIT}
```

Fallback auf `descriptionIT` wenn `descriptionDE` null ist.

---

## Zusammenfassung der Änderungen

| Datei | Bug | Änderungen | Risiko |
|-------|-----|------------|--------|
| `src/components/SettingsPopup.tsx` | Bug 2 | State-Init + Auto-Save | Gering |
| `src/components/run-detail/IssueDialog.tsx` | Bug 3+4 | Layout 810px + Flex + Button-Style | Mittel |
| `src/components/run-detail/WarehouseLocations.tsx` | Bug 6 | 3 Spalten-Änderungen + Sorting | Gering |
| `src/components/ui/sonner.tsx` | — | Nur Verifikation (keine Änderung) | — |

**Nicht betroffene Dateien:** exportService.ts, Matcher, Parser, archiveService.ts, runStore.ts, types/index.ts

---

## Durchführungsreihenfolge

1. **Bug 6** (WarehouseLocations.tsx) — Am isoliertesten, geringstes Risiko
2. **Bug 3 + Bug 4** (IssueDialog.tsx) — Beide in einer Datei, Layout zuerst, dann Styling
3. **Bug 2** (SettingsPopup.tsx) — Nuancierteste Logik (Debounce), zuletzt

---

## Verifikation / Testplan

1. **Bug 2 testen:**
   - Settings öffnen → E-Mail-Felder müssen sofort gefüllt sein (kein leerer Flash)
   - E-Mail ändern → Dialog schließen OHNE "Speichern" → Dialog erneut öffnen → Änderung muss persistiert sein
   - "Speichern"-Button klicken → "Gespeichert!" + Toast müssen erscheinen (Toast über Dialog sichtbar)

2. **Bug 3 testen:**
   - Issue-Dialog öffnen → muss breiter sein als zuvor (~810px)
   - Langen Fehlerbericht erzeugen → Content scrollt, Dialog platzt nicht
   - Tab 3: Viele Zeilen auswählen → "Lösung anwenden" bleibt unten fixiert

3. **Bug 4 testen:**
   - Tab 3: Button hat weißen Hintergrund + orange Schrift/Border
   - Hover: Button wird grün mit weißer Schrift
   - Tab 1 (Zeile 291): Shortcut-Button ist UNVERÄNDERT

4. **Bug 6 testen:**
   - Tabelle zeigt 6 Spalten: POS | Artikelnr. | Herstellerartikelnr. | Beschreibung | Menge | Aktueller Lagerort
   - "Artikelnr." zeigt Falmec-Nummer (oder "—" wenn null)
   - "Beschreibung" zeigt deutsche Beschreibung (oder IT-Fallback)
   - Klick auf "Artikelnr." sortiert numerisch korrekt (99 vor 100)
   - Sortierung funktioniert für alle 3 Keys (POS, Artikelnr., Lagerort)

5. **Abschluss:** `npx tsc --noEmit` im Bash-Terminal → 0 Fehler

---

## Sonnet-Regeln (Zwingend bei Durchführung)

1. **IMMER** vorher in den Plan-Modus gehen (`/plan`) und Plan bestätigen lassen
2. **IMMER** Ergebnisse in Projektdaten schreiben (`MEMORY.md` für Logging)
3. **Am Ende** selbstständig `npx tsc --noEmit` über das Bash-Terminal ausführen und Fehler fixen
4. **Am Ende** die Datei `features/INDEX.md` mit PROJ-44-BUGFIX-R2 aktualisieren
5. **NIEMALS** Dateien außerhalb der 3 Zieldateien ändern (SettingsPopup, IssueDialog, WarehouseLocations)

---

## Nützliche Hinweise für Sonnet bei der Durchführung des Plans um Fehler zu vermeiden

### Fallstricke

1. **SettingsPopup.tsx — `getStoredEmailSlots` ohne Klammern:** Die Lazy-Initialisierung von `useState` erwartet eine Funktionsreferenz, NICHT einen Funktionsaufruf. `useState(getStoredEmailSlots)` ≠ `useState(getStoredEmailSlots())`. Ersteres ist korrekt und wird von React lazy evaluiert.

2. **SettingsPopup.tsx — `useRef` Import:** `useRef` ist bereits importiert (Zeile 312 nutzt `fileInputRef`). Keinen doppelten Import hinzufügen!

3. **SettingsPopup.tsx — `saveEmailAddresses` Import:** Diese Funktion ist bereits importiert und wird in `handleSaveEmails` (Zeile 342) verwendet. Kein zusätzlicher Import nötig.

4. **IssueDialog.tsx — Zeile 291 vs. Zeile 388:** Beide Buttons heißen "Lösung erzwingen". Zeile 291 ist der Shortcut-Button in Tab 1 (Übersicht) und hat BEREITS das korrekte Styling. Nur Zeile 388 (Tab 3) muss geändert werden. Finger weg von Zeile 291!

5. **IssueDialog.tsx — Bug 3 + Bug 4 interagieren:** Änderung 3c (Button-Pinning in Tab 3) und Änderung 4a (Button-Styling) betreffen denselben Button. Beide Änderungen in einem Schritt durchführen, nicht separat.

6. **WarehouseLocations.tsx — `falmecArticleNo` kann `null` sein:** Typ ist `string | null`. In der Anzeige `?? '—'` verwenden, in der Sortierung `?? ''` verwenden. Nicht vergessen!

7. **WarehouseLocations.tsx — `descriptionDE` kann `null` sein:** Typ ist `string | null`. Fallback `?? line.descriptionIT` nicht vergessen.

8. **WarehouseLocations.tsx — Sticky-Header-Pattern kopieren:** Die neue "Artikelnr." Spalte muss dasselbe `className`-Pattern wie die bestehenden Spalten verwenden (conditional sticky + z-20). Am besten die Pos-Spalte als Template nehmen und `cursor-pointer select-none` hinzufügen.

9. **DRY-Sortierung:** Es darf am Ende nur EINE `sortLines`-Funktion geben. Keine zweite Hilfsfunktion erstellen.

10. **TypeScript-Typen:** `SortKey` ist ein lokaler Typ in WarehouseLocations.tsx (Zeile 21). Die Erweiterung um `'falmecArticleNo'` hat keine Auswirkungen auf andere Dateien.

### Zustand des Codes (Stand 2026-03-13)

- `sonner.tsx` hat bereits `zIndex: 9999` → keine Änderung nötig
- `emailSaved`-State und "Gespeichert!"-Feedback sind bereits implementiert → keine Änderung nötig
- `useEffect([open])` zum Laden der E-Mails funktioniert korrekt → BEHALTEN, nicht entfernen
- Die Export-Spalten in `exportService.ts` referenzieren `falmecArticleNo`, `manufacturerArticleNo`, `descriptionDE`, `descriptionIT` direkt als InvoiceLine-Felder → diese Felder werden NICHT umbenannt, nur die UI-Spaltenüberschriften in WarehouseLocations
