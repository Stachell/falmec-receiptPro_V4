# PROJ-39: Fehlerhandling — Popup-Neuaufbau, E-Mail-Erzeugung, Einstellungen & Konfliktmenü

**Status:** Planung
**Datum:** 2026-02-28
**Rev:** 2
**Baut auf:** PROJ-17, PROJ-21, PROJ-37 (Fehler-Center), PROJ-27 (Settings), PROJ-22-23 (PriceCheck)

---

> **Rev 1 — KISS-Korrekturen gegenueber Rev 0:**
>
> 1. **Kein neuer Status-Typ:** `Issue['status']` bleibt strikt `'open' | 'resolved'`.
>    Stattdessen zwei optionale Felder `escalatedAt?` / `escalatedTo?` fuer die UI-Markierung.
>    Alle App-Guards (Export, KPIs, Auto-Resolve) bleiben unangetastet.
>
> 2. **PriceCell wird NICHT angefasst:** Das PriceCheck-Popup ist seit PROJ-22/23 ADDON fertig.
>    Aufgabe 3 beschraenkt sich auf einen Button im Fehler-Popup, der prüft ob Preise
>    bereits manuell angepasst wurden.
>
> 3. **Keine neuen Issue-Generatoren:** `sn-insufficient-count`, `no-article-match`,
>    `match-artno-not-found`, `match-ean-not-found` existieren bereits und decken alle
>    geforderten Fehlerbilder ab. Aufgabe 4 ergaenzt lediglich fehlende UI-Texte
>    (quickFixHints) und stellt sicher, dass alle Typen durch den neuen Workflow laufen.

> **Rev 2 — Architektur-Prinzipien ergaenzt:**
>
> 4. **Strikte Design-Regeln** (KISS & UI-Konsistenz) hinzugefuegt.
> 5. **Iterative Implementierungs-Strategie** (TEIL 1 / TEIL 2 Phasenplanung) hinzugefuegt.

---

## Architektur-Prinzipien

### Strikte Design-Regeln (KISS & UI-Konsistenz)

> **VERBINDLICH fuer alle Aufgaben in PROJ-39.**

Beim Aufbau des neuen Popups (Aufgabe 1) und des Settings-Separators (Aufgabe 2) gelten
folgende Regeln OHNE Ausnahme:

1. **Nur bestehende shadcn-ui-Komponenten verwenden:**
   `Dialog`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogContent`, `DialogFooter`,
   `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`,
   `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`,
   `Button`, `Input`, `Label`, `Textarea`, `Separator`
   — KEINE eigenen Wrapper, KEINE neuen UI-Primitives.

2. **Nur etablierte Theme-Farben verwenden:**
   - Hintergruende: `bg-card`, `bg-muted`, `bg-surface-elevated`, `bg-popover`
   - Rahmen: `border-border`
   - Text: `text-foreground`, `text-muted-foreground`
   - Status-Farben (nur wo semantisch korrekt): `text-status-ok`, `text-amber-600` (Eskalation), `bg-red-600` (Override-Button)
   — KEINE willkuerlichen Hex-Werte, KEINE neuen Farbklassen.

3. **Bestehende Layout-Patterns uebernehmen:**
   - Settings-Felder: `flex items-center justify-between gap-4` (wie Feineinstellung)
   - Separator-Ueberschriften: `border-t border-border pt-3 space-y-3` + `Label text-sm font-semibold`
   - Dialog-Groesse: `max-w-2xl` (konsistent mit bestehenden Dialogen)
   - Input-Groessen: `h-8 text-sm bg-white` (Standard-Pattern)

4. **VERBOTEN:**
   - Neue CSS-Klassen oder Tailwind-Utilities die nicht bereits im Projekt verwendet werden
   - Bunte Rahmen, Schatten, Gradienten oder Animationen (ausser `animate-pulse` wo bereits etabliert)
   - Inline-Styles (`style={{}}`)
   - Eigene Farb-Definitionen in Komponenten

**Ziel:** Die neuen Elemente muessen sich nahtlos und unauffaellig in das bestehende App-Design einfuegen. Ein User darf beim Oeffnen des neuen Popups keinen visuellen Bruch zum Rest der App wahrnehmen.

### Iterative Implementierungs-Strategie (Phasen-Planung)

> **Die Code-Umsetzung erfolgt strikt in zwei Etappen.**

#### TEIL 1 — Fundament & UI (zuerst)

| Schritt | Beschreibung | Dateien |
|---------|-------------|---------|
| T1.1 | **Typen-Update:** `escalatedAt?` und `escalatedTo?` zum Issue-Interface hinzufuegen | `src/types/index.ts` |
| T1.2 | **Settings-Separator:** "Fehlerhandling" mit 5 E-Mail-Feldern + localStorage-Utility (Aufgabe 2) | `src/components/SettingsPopup.tsx`, `src/lib/errorHandlingConfig.ts` (NEU) |
| T1.3 | **Popup-UI-Aufbau:** Neuer "Fehler bearbeiten"-Dialog mit Fehleruebersicht, Positions-Anzeige, E-Mail-Dropdown, Loesungsnotiz-Textarea — OHNE Logik-Verdrahtung | `src/components/run-detail/IssuesCenter.tsx` |
| T1.4 | **Store-Action:** `escalateIssue()` Action im runStore | `src/store/runStore.ts` |

**Abnahme-Kriterium TEIL 1:** Settings speichern Adressen korrekt. Popup oeffnet sich, zeigt Fehlerinhalt und Dropdown mit gespeicherten Adressen. Buttons sind sichtbar aber noch nicht vollstaendig verdrahtet.

#### TEIL 2 — Logik & Verdrahtung (danach)

| Schritt | Beschreibung | Dateien |
|---------|-------------|---------|
| T2.1 | **E-Mail-Generierung:** `generateMailtoLink()` implementieren, `mailto:` oeffnen, `escalateIssue()` aufrufen, Clipboard-Fallback (Aufgabe 1 Logik) | `src/lib/issueLineFormatter.ts`, `src/components/run-detail/IssuesCenter.tsx` |
| T2.2 | **Eskalations-Anzeige:** IssueCard um "In Klaerung"-Zeile erweitern, amber-Markierung, "Erneut senden"-Button (Aufgabe 1 UI-Feinschliff) | `src/components/run-detail/IssuesCenter.tsx` |
| T2.3 | **Override-Workflow:** AlertDialog fuer "Konflikt handeln" mit Sicherheitshinweis und Pflicht-Begruendung (Aufgabe 5) | `src/components/run-detail/IssuesCenter.tsx` |
| T2.4 | **PriceCheck-Button:** "Manuelle Aenderung uebernehmen" Logik im Popup — pruefen ob `priceCheckStatus === 'custom'` (Aufgabe 3) | `src/components/run-detail/IssuesCenter.tsx` |
| T2.5 | **Fehlerbilder-Hints:** Fehlende `quickFixHints` und `popupHints` ergaenzen (Aufgabe 4) | `src/components/run-detail/IssuesCenter.tsx` |

**Abnahme-Kriterium TEIL 2:** Vollstaendiger Workflow funktioniert end-to-end. E-Mails werden erzeugt, Eskalationen angezeigt, Overrides mit Begruendung gespeichert, manuelle Preise erkannt.

**Warum diese Trennung?**
- TEIL 1 kann isoliert getestet werden (UI-Review ohne Seiteneffekte)
- Fehler in TEIL 2 gefaehrden nicht das UI-Fundament
- Ermoeglicht Zwischen-Review nach TEIL 1 bevor Logik verdrahtet wird

---

## Uebersicht

Dieses Projekt umfasst 5 Aufgaben, die den Fehlerhandling-Workflow erweitern:

1. **Popup-Neuaufbau** — "Senden"-Dialog wird zum Fehler-Bearbeitungsfenster mit E-Mail-Erzeugung
2. **Einstellungen: Fehlerhandling-Separator** — 5 Mailadress-Felder im Reiter "Allgemein"
3. **Manuelle Preisaenderung uebernehmen** — Button im Fehler-Popup (NICHT in PriceCell)
4. **Bestehende Fehlerbilder durchschleusen** — Fehlende UI-Texte ergaenzen, Workflow-Kompatibilitaet
5. **Konflikt handeln** — Override-Workflow mit Sicherheitsmeldung

---

## Bestandsaufnahme (IST-Zustand)

### Aktueller "Senden"-Dialog (`IssuesCenter.tsx:518-541`)

```
┌──────────────────────────────────────────────┐
│  Problem loesen                               │
│  ──────────────────────────────────────────── │
│  {issue.message}                              │
│  {issue.details}                              │
│                                               │
│  ┌──────────────────────────────────────────┐ │
│  │ Loesungsnotiz (optional)...              │ │
│  └──────────────────────────────────────────┘ │
│                                               │
│  [Abbrechen]          [Als geloest markieren] │
└──────────────────────────────────────────────┘
```

**Ablauf heute:**
- Klick auf "Senden" → oeffnet Dialog
- Textarea fuer Loesungsnotiz
- "Als geloest markieren" → `resolveIssue(id, note)` → Status wird `'resolved'`
- **Kein E-Mail-Versand, kein schwebender Zustand**

### Aktuelles Issue-Interface (`src/types/index.ts:342-362`)
```typescript
export interface Issue {
  id: string;
  runId?: string;
  severity: IssueSeverity;
  stepNo: number;
  type: IssueType;
  message: string;
  details: string;                 // 1-Zeiler Summary
  relatedLineIds: string[];
  affectedLineIds: string[];
  status: 'open' | 'resolved';    // BLEIBT UNVERAENDERT
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  context?: { positionIndex?; field?; expectedValue?; actualValue? };
}
```

### Aktuelle Settings: Allgemein-Tab (`SettingsPopup.tsx`)
```
Allgemein
├── Separator 1: Logfile Area
│   └── "Logfile (global) anzeigen:" + Logfile-Button
└── Separator 2: Feineinstellung
    ├── Maussperre (SEK.) — Select 0.0-3.0
    ├── Preisbasis — Select Netto/Brutto
    ├── Waehrung — Select EUR (disabled)
    └── Toleranz (EUR) — Input number
```

### Aktuelle PriceCell (`PriceCell.tsx`) — WIRD NICHT ANGEFASST
- Pre-Step-4 (RE-Positionen): Popover mit 3 Optionen (Rechnungspreis / Sage-Preis / Manuell)
- Post-Step-4 (Artikelliste): Popover aktiv, `readOnly=false` wenn `isExpanded`
- Post-Step-4 (RE-Positionen): Badge → Jump-Button zur Artikelliste
- **Fertiggestellt in PROJ-22/23 ADDON — keine Aenderungen in PROJ-39**

### Relevante bestehende Issue-Typen (bereits implementiert)
| IssueType | Label | QuickFixHint | Auto-Resolve |
|-----------|-------|-------------|--------------|
| `price-mismatch` | Preisabweichung | — | Ja |
| `price-missing` | Preis fehlt | — | — |
| `no-article-match` | Artikel nicht gefunden | **FEHLT** | Ja |
| `match-artno-not-found` | Artikelnr. nicht im Stamm | Vorhanden | Ja |
| `match-ean-not-found` | EAN nicht im Stamm | Vorhanden | Ja |
| `match-conflict-id` | Art.-Nr./EAN-Konflikt | Vorhanden | Ja |
| `sn-insufficient-count` | Zu wenige Seriennummern | Vorhanden | Ja |
| `serial-mismatch` | Seriennummer-Abweichung | — | Ja |
| `order-no-match` | Keine Bestellzuordnung | — | Ja |
| `order-incomplete` | Bestellung unvollstaendig | — | Ja |

---

## Aufgabe 1: Popup-Neuaufbau — Fehlerinhalt + E-Mail-Erzeugung + Schwebender Zustand

### Ziel
Das bisherige "Problem loesen"-Popup wird neu aufgebaut: Fehlerinhalt-Anzeige, E-Mail-Generierung via `mailto:` und eine visuelle Markierung fuer eskalierte Issues.

### 1.1 Eskalations-Felder (OHNE Status-Aenderung)

> **KISS-Regel:** `Issue['status']` bleibt `'open' | 'resolved'`. Kein neuer Enum-Wert.
> Alle App-Guards (Export-Sperre, KPI-Zaehler, Auto-Resolve) bleiben unangetastet.

**Erweiterung des Issue-Interface (`src/types/index.ts`):**
```typescript
export interface Issue {
  // ... alle bestehenden Felder UNVERAENDERT ...
  status: 'open' | 'resolved';         // KEINE AENDERUNG

  escalatedAt?: string;                 // NEU: ISO-Timestamp der Eskalation (optional)
  escalatedTo?: string;                 // NEU: Mailadresse des Empfaengers (optional)
}
```

**Logik:**
- `status === 'open' && !escalatedAt` → Offener Fehler (normal)
- `status === 'open' && escalatedAt` → Eskaliert / In Klaerung (visuell markiert)
- `status === 'resolved'` → Erledigt (wie bisher)

**Vorteile gegenueber Rev 0:**
- Null Seiteneffekte auf bestehende Guards (`issues.filter(i => i.status === 'open')` zaehlt eskalierte Issues korrekt mit)
- Auto-Resolve bleibt aktiv (ein eskaliertes Issue wird automatisch geloest wenn die Ursache behoben wird — das ist gewuenscht, denn dann ist die Klaerung hinfaellig)
- Export-Sperre bleibt korrekt (eskalierte Issues sind immer noch `'open'`)
- KPI-Zaehler bleiben korrekt

### 1.2 Neuer Dialog-Aufbau

**Datei:** `src/components/run-detail/IssuesCenter.tsx` (bestehender Dialog wird ersetzt)

```
┌───────────────────────────────────────────────────────────────┐
│  Fehler bearbeiten                                             │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─ Fehleruebersicht ────────────────────────────────────────┐ │
│  │ Typ:      [Severity Badge] [Type Badge]                    │ │
│  │ Meldung:  {issue.message}                                  │ │
│  │ Details:  {issue.details}                                  │ │
│  │                                                            │ │
│  │ Betroffene Positionen:                                     │ │
│  │ ┌────────────────────────────────────────────────────────┐ │ │
│  │ │ Pos.: 16 | Artikel: 102133 | EAN: 8034... | Preis: …  │ │ │
│  │ │ Pos.: 19 | Artikel: 204567 | EAN: 9012... | Preis: …  │ │ │
│  │ │ ... (+3 weitere Positionen)                            │ │ │
│  │ └────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ E-Mail erzeugen ─────────────────────────────────────────┐ │
│  │ Empfaenger: [▼ Dropdown: hinterlegte Mailadressen     ]   │ │
│  │                                                            │ │
│  │ Vorschau:                                                  │ │
│  │ ┌────────────────────────────────────────────────────────┐ │ │
│  │ │ Betreff: [FALMEC-ReceiptPro] Fehler: {issue.message}  │ │ │
│  │ │ ──────────────────────────────────────────────────────  │ │ │
│  │ │ Body: Fehlertyp, Details, betroffene Positionen, ...   │ │ │
│  │ └────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─ Aktionen ────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │ [Abbrechen]  [Konflikt handeln]  [E-Mail erzeugen]        │ │
│  │              (Aufg. 5)                                     │ │
│  │                                                            │ │
│  │ ── Oder direkt loesen: ──                                  │ │
│  │                                                            │ │
│  │ ┌──────────────────────────────────────────────────────┐  │ │
│  │ │ Loesungsnotiz (optional)...                          │  │ │
│  │ └──────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │ [Loesung anwenden]                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

**Bedingte Elemente im Dialog:**
- "Manuelle Aenderung uebernehmen" (Aufgabe 3): Nur sichtbar bei `price-mismatch` wenn manuelle Preise existieren
- "Konflikt handeln" (Aufgabe 5): Nur sichtbar bei `severity === 'error' || severity === 'warning'`
- "E-Mail erzeugen": Nur aktiv wenn Empfaenger ausgewaehlt

### 1.3 E-Mail-Erzeugung via `mailto:`

**Technik:** Reine SPA ohne Backend → `mailto:` oeffnet den Standard-Mail-Client.

**Implementierung:**
```typescript
const generateMailtoLink = (issue: Issue, recipient: string, lines: InvoiceLine[]): string => {
  const subject = encodeURIComponent(
    `[FALMEC-ReceiptPro] Fehler: ${issue.message}`
  );

  const affectedLines = getAffectedLines(issue, lines);
  const displayLines = affectedLines.slice(0, 10);  // Max 10 Zeilen (mailto-Limit)
  const overflow = affectedLines.length - displayLines.length;

  const bodyParts = [
    `Fehlertyp: ${issueTypeLabels[issue.type]}`,
    `Schweregrad: ${issue.severity}`,
    `Schritt: ${issue.stepNo}`,
    `Meldung: ${issue.message}`,
    `Details: ${issue.details}`,
    ``,
    `Betroffene Positionen:`,
    ...displayLines.map(l => formatLineForDisplay(l)),
    ...(overflow > 0 ? [`... und ${overflow} weitere Positionen`] : []),
    ``,
    `--- Automatisch generiert von FALMEC-ReceiptPro ---`,
  ];

  const body = encodeURIComponent(bodyParts.join('\n'));
  return `mailto:${recipient}?subject=${subject}&body=${body}`;
};
```

**Ablauf "E-Mail erzeugen":**
1. User waehlt Empfaenger aus Dropdown (Adressen aus Aufgabe 2)
2. Klick auf "E-Mail erzeugen"
3. `window.location.href = generateMailtoLink(...)` oeffnet Mail-Client
4. Issue bleibt `status: 'open'`, aber `escalatedAt` und `escalatedTo` werden gesetzt
5. Vollstaendigen Text zusaetzlich in Zwischenablage kopieren (Fallback fuer mailto-Limit)
6. Dialog schliesst sich

### 1.4 "Loesung anwenden" — Finales Aufloesen

**Ablauf:**
1. User traegt optional eine Loesungsnotiz ein
2. Klick auf "Loesung anwenden"
3. `resolveIssue(id, note)` wird aufgerufen → Status `'resolved'`
4. Dialog schliesst sich

### 1.5 Anzeige eskalierter Issues im IssuesCenter

Eskalierte Issues (`status === 'open' && escalatedAt`) werden INNERHALB der offenen Issues angezeigt, aber visuell unterschieden:

**IssueCard-Erweiterung (kein neuer Bereich, nur visuelles Upgrade):**
```
┌─────────────────────────────────────────────────────┐
│ [Severity Badge] [Type Badge] {issue.message}       │
│                                                      │
│ In Klaerung — Mail an max.mustermann@firma.de        │  ← NEU: Amber-Text wenn escalatedAt
│ Seit: 28.02.2026, 14:30 Uhr                         │  ← NEU: Timestamp
│                                                      │
│ [Betroffene Zeilen isolieren] [kopieren] [Senden]    │
│                                [Erneut senden]       │  ← NEU: Nur wenn bereits eskaliert
└─────────────────────────────────────────────────────┘
```

**Styling:**
- Amber-Rand (`border-l-4 border-amber-400`) wenn `escalatedAt` gesetzt
- Zusatz-Zeile mit `text-amber-600` fuer Eskalations-Info
- "Erneut senden" Button neben "Senden" (aktualisiert `escalatedAt` und `escalatedTo`)

**Badge im Fehler-Tab (optional):**
- Offene Issues (nicht eskaliert): Bestehendes rotes Badge
- Wenn eskalierte Issues vorhanden: Zusaetzliches amber Badge mit Anzahl

### 1.6 Store-Aenderungen (`src/store/runStore.ts`)

**Neue Action:**
```typescript
escalateIssue: (issueId: string, recipientEmail: string) => void;
// → Setzt escalatedAt = new Date().toISOString(), escalatedTo = recipientEmail
// → Status bleibt 'open' — KEINE Status-Aenderung!
```

**Bestehende Action — KEINE Aenderung:**
```typescript
resolveIssue: (issueId: string, resolutionNote: string) => void;
// → Bestehend, unveraendert. Setzt status='resolved', loescht damit implizit
//   den "In Klaerung"-Zustand (escalatedAt wird irrelevant bei resolved)
```

### 1.7 Auto-Resolve-Kompatibilitaet

**Kein Eingriff in `checkIssueStillActive()` noetig!**

Da eskalierte Issues weiterhin `status: 'open'` haben, greift die Auto-Resolve-Logik ganz normal. Wenn der User z.B. parallel den Preis manuell korrigiert, wird das `price-mismatch`-Issue auto-resolved — und die Eskalation ist damit hinfaellig.

Das ist **gewuenschtes Verhalten**: Wenn die Fehlerursache behoben wird, braucht es keine externe Klaerung mehr.

### 1.8 Betroffene Dateien

| Datei | Aenderung |
|-------|----------|
| `src/types/index.ts` | Issue-Interface um `escalatedAt?` und `escalatedTo?` erweitern (2 optionale Felder) |
| `src/store/runStore.ts` | `escalateIssue()` Action hinzufuegen |
| `src/components/run-detail/IssuesCenter.tsx` | Dialog neu aufbauen; IssueCard um Eskalations-Zeile erweitern |
| `src/lib/issueLineFormatter.ts` | `generateMailtoLink()` Hilfsfunktion hinzufuegen |

---

## Aufgabe 2: Einstellungen — Separator "Fehlerhandling" mit 5 Mailadress-Feldern

### Ziel
Im Reiter "Allgemein" der Einstellungen wird ein neuer Separator "Fehlerhandling" ergaenzt. Dieser enthaelt 5 Eingabezeilen fuer Mailadressen und einen Speichern-Button. Die Adressen werden persistent gespeichert und stehen im Dropdown (Aufgabe 1) zur Verfuegung.

### 2.1 Neuer Separator im Allgemein-Tab

**Position:** Unterhalb des bestehenden Separators "Feineinstellung"

```
Allgemein
├── Separator 1: Logfile Area           (bestehend)
├── Separator 2: Feineinstellung        (bestehend)
└── Separator 3: Fehlerhandling         (NEU)
    ├── "E-Mail-Adressen fuer Fehlerweiterleitung"
    ├── Adresse 1:  [________________________]
    ├── Adresse 2:  [________________________]
    ├── Adresse 3:  [________________________]
    ├── Adresse 4:  [________________________]
    ├── Adresse 5:  [________________________]
    ├── [Speichern]
    └── Hinweis: "Gespeicherte Adressen erscheinen im Fehler-Popup als Empfaenger."
```

### 2.2 Persistenz: localStorage

**Key:** `falmec-error-handling-emails`

**Format:**
```typescript
interface ErrorHandlingEmails {
  addresses: string[];  // Max 5, leere Strings erlaubt (werden gefiltert)
  savedAt: string;      // ISO Timestamp
}
```

**Warum NICHT im RunConfig/globalConfig?**
- RunConfig wird nicht persistent gespeichert (in-memory only via Zustand)
- Mailadressen muessen session-uebergreifend verfuegbar sein
- Eigener localStorage-Key haelt die Trennung sauber
- Analog zum Muster von `falmec-master-data-meta` (kleine Metadaten in localStorage)

### 2.3 Zugriff aus dem Popup (Aufgabe 1)

**Neuer Utility-Modul:** `src/lib/errorHandlingConfig.ts`
```typescript
export function getStoredEmailAddresses(): string[] {
  // Liest aus localStorage, filtert leere Eintraege
}

export function saveEmailAddresses(addresses: string[]): void {
  // Schreibt in localStorage mit Timestamp
}
```

### 2.4 UI-Pattern (konsistent mit bestehenden Feldern)

```typescript
<div className="border-t border-border pt-3 space-y-3">
  <Label className="text-sm font-semibold">Fehlerhandling</Label>
  <p className="text-xs text-muted-foreground">
    E-Mail-Adressen fuer Fehlerweiterleitung
  </p>

  {[0, 1, 2, 3, 4].map((i) => (
    <div key={i} className="flex items-center justify-between gap-4">
      <Label className="text-sm whitespace-nowrap">Adresse {i + 1}</Label>
      <Input
        type="email"
        value={emailAddresses[i] || ''}
        onChange={(e) => updateAddress(i, e.target.value)}
        placeholder="name@firma.de"
        className="h-8 flex-1 max-w-[280px] text-sm bg-white"
      />
    </div>
  ))}

  <Button size="sm" onClick={handleSaveEmails}>Speichern</Button>
</div>
```

### 2.5 Validierung
- Einfache E-Mail-Regex-Validierung (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`)
- Leere Felder werden ignoriert (kein Pflichtfeld)
- Doppelte Adressen werden beim Speichern dedupliziert
- Visuelles Feedback: Toast ("Adressen gespeichert") nach erfolgreichem Speichern

### 2.6 Betroffene Dateien

| Datei | Aenderung |
|-------|----------|
| `src/components/SettingsPopup.tsx` | Neuer Separator "Fehlerhandling" im Allgemein-Tab |
| `src/lib/errorHandlingConfig.ts` | **NEU** — localStorage-Utility fuer E-Mail-Adressen |

---

## Aufgabe 3: Manuelle Preisaenderung uebernehmen (NUR im Fehler-Popup)

### Ziel

> **KISS-Regel:** `PriceCell.tsx` wird NICHT angefasst. Das PriceCheck-Popup ist seit
> PROJ-22/23 ADDON fertiggestellt und funktioniert korrekt.

Aufgabe 3 beschraenkt sich AUSSCHLIESSLICH darauf, im neuen Fehler-Popup (Aufgabe 1) einen Button "Manuelle Aenderung uebernehmen" anzuzeigen. Dieser prüft, ob der User den Preis fuer betroffene Positionen bereits manuell angepasst hat (via PriceCell), und loest das Issue auf.

### 3.1 Bedingung fuer die Anzeige

Der Bereich "Manuelle Aenderung uebernehmen" erscheint NUR wenn:
- `issue.type === 'price-mismatch'`
- Mindestens eine Position in `issue.affectedLineIds` hat `priceCheckStatus === 'custom'`

### 3.2 Darstellung im Fehler-Popup

```
┌─ Manuelle Preisaenderungen erkannt ──────────────────┐
│                                                       │
│  Folgende Positionen wurden bereits angepasst:        │
│  Pos. 16: 1.450,00 EUR → 1.500,00 EUR (manuell)     │
│  Pos. 19: 890,00 EUR → 920,00 EUR (manuell)          │
│                                                       │
│  [Manuelle Aenderung uebernehmen]                     │
│                                                       │
│  Hinweis: Dies markiert den Fehler als geloest und    │
│  uebernimmt die manuell gesetzten Preise.             │
└───────────────────────────────────────────────────────┘
```

### 3.3 Klick-Logik

**"Manuelle Aenderung uebernehmen":**
1. Prüft ob ALLE betroffenen Positionen (`affectedLineIds`) `priceCheckStatus === 'custom'` haben
2. **Alle angepasst:** Issue wird `'resolved'` mit `resolutionNote: 'Manuelle Preisanpassung uebernommen'`
3. **Teilweise angepasst:** Button bleibt aktiv, aber zeigt Warnung: "X von Y Positionen noch nicht angepasst. Trotzdem uebernehmen?" (Confirmation-Dialog)

### 3.4 Betroffene Dateien

| Datei | Aenderung |
|-------|----------|
| `src/components/run-detail/IssuesCenter.tsx` | Bedingte Anzeige im Dialog; Prüf-Logik fuer `priceCheckStatus` |

**NICHT betroffen:**
- `PriceCell.tsx` — Keine Aenderung
- `ItemsTable.tsx` — Keine Aenderung
- `InvoicePreview.tsx` — Keine Aenderung
- `src/store/runStore.ts` — Kein neuer Helper noetig (Prüfung inline im Component)

---

## Aufgabe 4: Bestehende Fehlerbilder durchschleusen

### Ziel

> **KISS-Regel:** Keine neuen Issue-Generatoren. Keine neuen IssueTypes.
> Alle geforderten Fehlerbilder sind bereits durch bestehende Typen abgedeckt.

Aufgabe 4 stellt sicher, dass:
1. Alle bestehenden Fehlertypen durch den neuen Popup-Workflow (E-Mail / Konflikt handeln) laufen koennen
2. Fehlende `quickFixHints` ergaenzt werden
3. Typ-spezifische Loesungstexte im Popup angezeigt werden

### 4.1 Bestehende Abdeckung (Verifiziert)

| Gefordertes Fehlerbild | Bestehender IssueType | Erzeuger | Status |
|-------------------------|----------------------|----------|--------|
| S/N-pflichtiger Artikel ohne Seriennummer | `sn-insufficient-count` | `FalmecMatcher_Master.serialExtract()` | Existiert (deckt auch 0-von-X ab) |
| Nicht gefundener Artikel | `no-article-match` | `FalmecMatcher_Master.crossMatch()` | Existiert |
| Artikelnummer nicht im Stamm | `match-artno-not-found` | `FalmecMatcher_Master.crossMatch()` | Existiert |
| EAN nicht im Stamm | `match-ean-not-found` | `FalmecMatcher_Master.crossMatch()` | Existiert |
| Nicht gematchte Position | `no-article-match` | `FalmecMatcher_Master.crossMatch()` | Existiert |

### 4.2 Fehlende quickFixHints ergaenzen

**In `IssuesCenter.tsx` → `quickFixHints` Map:**

| IssueType | Aktuell | NEU ergaenzen |
|-----------|---------|---------------|
| `no-article-match` | **FEHLT** | "Artikel nicht im Stamm gefunden. Bitte Artikelstamm aktualisieren oder Artikelnummer/EAN in der Rechnung pruefen." |
| `price-mismatch` | **FEHLT** | "Der Rechnungspreis weicht vom Sage-Preis ab. Preis manuell anpassen oder Abweichung per E-Mail klaeren." |
| `order-no-match` | **FEHLT** | "Keine passende Bestellung gefunden. Bestelldaten pruefen oder manuell zuweisen." |

### 4.3 Typ-spezifische Loesungstexte im neuen Popup

Wenn der Popup-Dialog (Aufgabe 1) geoeffnet wird, erscheint pro Fehlertyp ein kontextbezogener Hinweis:

| IssueType | Hinweis im Popup |
|-----------|-----------------|
| `sn-insufficient-count` | "Bitte S/N-Dokument ergaenzen oder Seriennummer manuell in der Artikelliste eintragen." |
| `no-article-match` | "Artikel nicht im Stamm. Bitte Artikelstamm pruefen und ggf. aktualisieren." |
| `match-artno-not-found` | "Artikelnummer existiert nicht im Stamm. EAN oder Artikelnummer pruefen." |
| `match-ean-not-found` | "EAN nicht im Artikelstamm hinterlegt." |
| `price-mismatch` | "Preis weicht vom ERP ab. Manuell anpassen oder per E-Mail klaeren lassen." |
| `order-no-match` | "Keine Bestellung zugeordnet. Bestelldaten pruefen." |
| `order-incomplete` | "Position nicht vollstaendig zugeordnet. Bestellmengen pruefen." |

**Implementierung:** Einfaches Lookup-Objekt `popupHints: Record<IssueType, string>` neben dem bestehenden `quickFixHints`.

### 4.4 Betroffene Dateien

| Datei | Aenderung |
|-------|----------|
| `src/components/run-detail/IssuesCenter.tsx` | `quickFixHints` ergaenzen (3 fehlende Eintraege); `popupHints` Map hinzufuegen |

**NICHT betroffen:**
- `src/types/index.ts` — Kein neuer IssueType
- `src/store/runStore.ts` — Keine neuen Issue-Generatoren
- `src/services/matchers/` — Keine Aenderungen an Matchern
- `src/lib/issueLineFormatter.ts` — Keine Aenderungen

---

## Aufgabe 5: "Konflikt handeln" — Override-Workflow mit Sicherheitsmeldung

### Ziel
Ein Button "Konflikt handeln" wird im Fehler-Popup ergaenzt. Dieser oeffnet ein Konfliktmenü, das dem User ermoeglicht, Fehlerdaten bewusst zu ueberschreiben — mit einer expliziten Sicherheitsmeldung.

### 5.1 Hintergrund

Es kann Faelle geben, in denen ein Fehler nicht extern geloest werden kann (z.B. ERP-Daten sind korrekt, aber die Rechnung weicht ab). In diesen Faellen muss der User die Moeglichkeit haben, den Fehler bewusst zu ueberschreiben. Dies soll jedoch mit maximaler Transparenz geschehen.

### 5.2 Sichtbarkeit des Buttons

**"Konflikt handeln" wird NUR angezeigt wenn:**
- `issue.severity === 'error'` ODER `issue.severity === 'warning'`
- Bei `severity === 'info'` (z.B. `order-fifo-only`, `order-multi-split`) wird der Button ausgeblendet

### 5.3 Klick-Flow

```
[Konflikt handeln]
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│  SICHERHEITSHINWEIS                                        │
│  ──────────────────────────────────────────────────────────  │
│                                                             │
│  Sie sind dabei, einen Fehler manuell zu ueberschreiben.    │
│                                                             │
│  WICHTIG: Die Artikeldaten in dieser Anwendung muessen      │
│  mit den Daten im ERP-System (Sage) uebereinstimmen.        │
│  Wenn Sie diesen Fehler hier ueberschreiben, ohne die       │
│  Ursache im ERP zu beheben, kann ein Datenkonflikt          │
│  entstehen.                                                 │
│                                                             │
│  Bitte stellen Sie sicher, dass:                            │
│  * Die Abweichung bewusst und korrekt ist                   │
│  * Das ERP-System bei Bedarf aktualisiert wurde             │
│  * Die Aenderung dokumentiert werden soll                   │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Begruendung (Pflichtfeld)...                           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  [Zurueck]              [Konflikt bewusst ueberschreiben]   │
│                          (rot hinterlegt)                   │
└────────────────────────────────────────────────────────────┘
```

### 5.4 Technische Umsetzung

**Komponente:** AlertDialog (bestehendes Pattern aus SettingsPopup fuer destruktive Aktionen)

**Ablauf:**
1. User klickt "Konflikt handeln"
2. AlertDialog mit Sicherheitshinweis oeffnet sich
3. Begruendungs-Textarea ist **Pflichtfeld** (Button disabled wenn leer)
4. "Konflikt bewusst ueberschreiben" → `resolveIssue(id, 'KONFLIKT UEBERSCHRIEBEN: {Begruendung}')`
5. Issue wird `status: 'resolved'` (normaler resolveIssue-Aufruf, keine Sonderbehandlung)

**Styling des Override-Buttons:**
- `bg-red-600 hover:bg-red-700 text-white` (deutlich als destruktive Aktion erkennbar)
- Disabled solange Begruendung leer ist (`opacity-50 cursor-not-allowed`)

### 5.5 Typ-spezifisches Verhalten bei Override

| IssueType | Was passiert beim Override? |
|-----------|---------------------------|
| `price-mismatch` | Issue resolved, Preis bleibt wie er ist (kein auto-fix) |
| `no-article-match` | Issue resolved, Position bleibt `no-match` |
| `sn-insufficient-count` | Issue resolved, S/N bleibt leer |
| `order-no-match` | Issue resolved, Bestellung bleibt `not-ordered` |
| Alle anderen | Issue resolved mit Override-Begruendung |

**Wichtig:** Der Override loest NUR das Issue. Er aendert KEINE Daten an den InvoiceLines. Die Positionen behalten ihren fehlerhaften Zustand — der User hat lediglich bestaetigt, dass er den Fehler bewusst akzeptiert.

### 5.6 Audit-Trail

Die Override-Begruendung wird im `resolutionNote` gespeichert mit Prefix `KONFLIKT UEBERSCHRIEBEN:`. Dies ermoeglicht:
- Filterung in der CSV-Export-Funktion
- Sichtbarkeit in den "Erledigte Probleme" (strikethrough + rotes Prefix)
- Nachvollziehbarkeit bei spaeteren Reviews

### 5.7 Betroffene Dateien

| Datei | Aenderung |
|-------|----------|
| `src/components/run-detail/IssuesCenter.tsx` | AlertDialog fuer Override-Workflow; "Konflikt handeln" Button im Popup |

**NICHT betroffen:**
- `src/store/runStore.ts` — Kein neues Flag noetig; normaler `resolveIssue()` Aufruf mit Prefix im Text reicht

---

## Gesamtuebersicht: Betroffene Dateien

| # | Datei | Aufgaben | Aenderungstyp |
|---|-------|----------|-------------|
| 1 | `src/types/index.ts` | 1 | 2 optionale Felder zum Issue-Interface (`escalatedAt?`, `escalatedTo?`) |
| 2 | `src/store/runStore.ts` | 1 | 1 neue Action (`escalateIssue`) |
| 3 | `src/components/run-detail/IssuesCenter.tsx` | 1, 3, 4, 5 | Dialog-Neuaufbau, Eskalations-Zeile, Hints, Override-AlertDialog |
| 4 | `src/components/SettingsPopup.tsx` | 2 | Neuer Separator "Fehlerhandling" |
| 5 | `src/lib/issueLineFormatter.ts` | 1 | `generateMailtoLink()` Hilfsfunktion |
| 6 | `src/lib/errorHandlingConfig.ts` | 2 | **NEU** — localStorage-Utility |

**Dateien die NICHT veraendert werden:**
- `PriceCell.tsx` — Fertig seit PROJ-22/23 ADDON
- `ItemsTable.tsx` — Keine Aenderung
- `InvoicePreview.tsx` — Keine Aenderung
- `ManualOrderPopup.tsx` — Keine Aenderung
- `src/services/matchers/` — Keine neuen Generatoren
- `src/services/matching/` — Keine Aenderungen

---

## Umsetzungsreihenfolge

> Orientiert sich an der **Iterativen Implementierungs-Strategie** (siehe Architektur-Prinzipien).

### TEIL 1 — Fundament & UI

| Phase | Schritt | Aufgabe | Begruendung |
|-------|---------|---------|------------|
| 1.1 | T1.1 | Typen-Update (`escalatedAt?`, `escalatedTo?`) | Basis fuer alle weiteren Schritte |
| 1.2 | T1.2 | **Aufgabe 2** — Settings-Separator + localStorage-Utility | Grundlage fuer Dropdown-Daten im Popup |
| 1.3 | T1.3 | **Aufgabe 1 (UI)** — Popup-Aufbau ohne Logik | UI-Shell mit shadcn-Komponenten |
| 1.4 | T1.4 | Store-Action `escalateIssue()` | Minimale Store-Erweiterung |

**Zwischen-Review nach TEIL 1**

### TEIL 2 — Logik & Verdrahtung

| Phase | Schritt | Aufgabe | Begruendung |
|-------|---------|---------|------------|
| 2.1 | T2.1 | **Aufgabe 1 (Logik)** — `mailto:` + Clipboard + Eskalation | Kernfunktion E-Mail-Erzeugung |
| 2.2 | T2.2 | **Aufgabe 1 (Feinschliff)** — IssueCard Eskalations-Anzeige | Visuelles Feedback im IssuesCenter |
| 2.3 | T2.5 | **Aufgabe 4** — quickFixHints + popupHints ergaenzen | Leichtgewichtig, nur UI-Texte |
| 2.4 | T2.4 | **Aufgabe 3** — PriceCheck-Button im Popup | Baut auf fertigem Popup auf |
| 2.5 | T2.3 | **Aufgabe 5** — Override-AlertDialog "Konflikt handeln" | Baut auf fertigem Popup auf |

---

## Stolpersteine

### 1. `mailto:`-Limitierung bei langen E-Mail-Bodies
- **Problem:** Browser/OS limitieren `mailto:` URIs auf ca. 2000-2048 Zeichen (IE/Edge) bzw. bis zu 32 KB (Chrome). Bei Fehlern mit vielen betroffenen Positionen (30+) kann der Body abgeschnitten werden.
- **Loesung:** Body auf max. 10 Positionen + "... und X weitere" begrenzen. Vollstaendigen Text zusaetzlich in die Zwischenablage kopieren (bestehendes Pattern `useCopyToClipboard`).

### 2. Keine E-Mail-Validierung im Hintergrund
- **Problem:** Die App kann nicht pruefen, ob eine E-Mail tatsaechlich versendet wurde (`mailto:` gibt kein Feedback). `escalatedAt` wird gesetzt, auch wenn der User den Mail-Client wieder schliesst ohne zu senden.
- **Loesung:** Akzeptables Trade-Off fuer eine Offline-SPA. Im Popup einen Hinweis anzeigen: "Die E-Mail wird in Ihrem Standard-Mail-Programm geoeffnet. Bitte stellen Sie sicher, dass Sie die E-Mail tatsaechlich absenden."

### 3. localStorage-Quota fuer E-Mail-Adressen
- **Problem:** localStorage hat ein Limit von ~5-10 MB. 5 E-Mail-Adressen sind vernachlaessigbar (<1 KB).
- **Loesung:** Kein echtes Problem. 5 Adressen x ~50 Bytes = ~250 Bytes.

### 4. Datenintegritaet bei Override (Aufgabe 5)
- **Problem:** Wenn ein User einen `no-article-match` Fehler ueberschreibt, hat die Position weiterhin `matchStatus: 'no-match'`. Dies kann beim Export zu unvollstaendigen Daten fuehren.
- **Loesung:** Im Export-Schritt (Step 5) eine Warnung anzeigen: "X Positionen wurden mit ueberschriebenen Konflikten exportiert." Der User hat den Override aktiv bestaetigt.

### 5. E-Mail-Dropdown leer wenn keine Adressen hinterlegt
- **Problem:** Wenn der User noch keine Adressen in den Einstellungen gespeichert hat, ist das Dropdown im Popup leer.
- **Loesung:** Wenn keine Adressen vorhanden: Dropdown durch ein Textfeld + Hinweis ersetzen ("Keine gespeicherten Adressen. Adresse manuell eingeben oder in Einstellungen > Allgemein > Fehlerhandling hinterlegen.").

### 6. Mehrere Fehler fuer dieselbe Position
- **Problem:** Eine Position kann gleichzeitig `price-mismatch` UND `sn-insufficient-count` haben. Wenn der User einen davon ueberschreibt, bleibt der andere offen.
- **Loesung:** Im Popup klar kommunizieren: "Dieser Fehler wird einzeln behandelt." Keine Kaskaden-Logik.

### 7. Issue-Stabilitaet bei Re-Parsing
- **Problem:** Wenn der User die PDF neu parst (Step 1 wiederholt), werden alle Issues neu erzeugt. Eskalierte Issues (`escalatedAt` gesetzt) gehen verloren, weil neue Issue-IDs generiert werden.
- **Loesung:** Vor Re-Parse pruefen, ob Issues mit `escalatedAt` existieren. Falls ja: Warnung anzeigen ("Es gibt X eskalierte Fehler. Bei erneutem Parsen gehen diese Eskalationen verloren. Fortfahren?").

### 8. Kein Backend fuer E-Mail-Tracking
- **Problem:** Da die App kein Backend hat, gibt es keine Moeglichkeit, E-Mail-Versand serverseitig zu tracken.
- **Loesung:** Fundamentale Einschraenkung der SPA-Architektur. Fuer eine zukuenftige Version mit Backend waere ein E-Mail-Service (SMTP/n8n) denkbar. Fuer PROJ-39 reicht `mailto:`.

### 9. "Konflikt handeln" bei info-Severity Issues
- **Problem:** `order-fifo-only` und `order-multi-split` haben Severity `info`. Ein Override macht bei Info-Meldungen semantisch keinen Sinn.
- **Loesung:** Button nur anzeigen bei `severity === 'error' || severity === 'warning'`.

---

## Anhang: Issue-Lebenszyklus (Rev 1 — ohne Status-Aenderung)

```
                    ┌───────────────────────┐
                    │  status: 'open'       │
                    │  escalatedAt: null     │
                    └───────────┬───────────┘
                                │
               ┌────────────────┼────────────────┐
               │                │                │
               ▼                ▼                ▼
  ┌────────────────────┐  ┌──────────┐  ┌──────────────────┐
  │  status: 'open'    │  │ resolved │  │    resolved       │
  │  escalatedAt: set  │  │ (Loesung)│  │   (Override)      │
  │  escalatedTo: set  │  └──────────┘  │ note: KONFLIKT... │
  │  "In Klaerung"     │                └──────────────────┘
  └─────────┬──────────┘
            │
            │  Drei Wege zurueck zu 'resolved':
            │
            ├── "Loesung anwenden" (manuell)
            ├── "Manuelle Aenderung uebernehmen" (Aufg. 3)
            ├── Auto-Resolve (Fehlerursache wurde extern behoben)
            │
            ▼
     ┌──────────┐
     │ resolved │
     └──────────┘
```

**Kernprinzip:** `status` hat nur 2 Werte. Die Eskalation ist ein *Attribut* eines offenen Issues, kein eigener Status. Alle Guards, die auf `status === 'open'` pruefen, funktionieren weiterhin korrekt.
