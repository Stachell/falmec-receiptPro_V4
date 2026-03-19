# PROJ-44-ADD-ON Serialpflicht Fehlerhandling - IST-Diagnose

**Datum:** 2026-03-19  
**Status:** Analyse abgeschlossen (kein Code geaendert)

## 1) Auftrag und Scope

Diese Diagnose beantwortet vier Kernfragen fuer PROJ-44-ADD-ON-round5:

1. Woher kommt die S/N-Pflicht-Anzeige in Artikelliste und RE-Positionen?
2. Schreibt `setManualArticleByPosition` das Formularfeld `serialRequired` korrekt?
3. Was macht Step 3 mit bereits vorhandenen `line.serialNumbers`?
4. Gibt es ein Datenmodell-Flag, das manuelle S/N vor Step 3 schuetzt?

## 2) Kurzfazit (Management-View)

1. **Anzeige-Bug sitzt nicht in der Anzeige-Komponente.**  
   Die UI liest korrekt aus `InvoiceLine.serialRequired`. Der Wert wird vorher im Store ueberschrieben.
2. **`serialRequired` wird nur im `!matched`-Pfad aus dem Formular uebernommen.**  
   Bei Stammdaten-Treffer (`matched`) gewinnt immer `matched.serialRequirement`.
3. **Step 3 hat aktuell keinen Schutz fuer manuelle S/N-Werte.**  
   Im Hauptpfad werden vorhandene `serialNumbers` ersetzt, nicht gemerged.
4. **Es gibt kein Schutzfeld wie `serialNumberManual` / `serialNumbersLocked`.**  
   Dadurch kann Step 3 manuelle Eingaben nicht gezielt respektieren.

## 3) Detailbefunde

### 3.1 Frage 1: Anzeige-Bug (ItemsTable / InvoicePreview)

**Befund A - Artikelliste (`ItemsTable.tsx`)**

- Quelle fuer S/N-Pflicht: `line.serialRequired`
- Quelle fuer S/N-zugewiesen: `!!line.serialNumber`
- Rendering: `SerialStatusDot`

Referenzen:

- `src/components/run-detail/ItemsTable.tsx:435-451`
- `src/components/run-detail/SerialStatusDot.tsx:14-31`

**Befund B - RE-Positionen (`InvoicePreview.tsx`)**

- `positionStatusMap` setzt `serialRequired` aus `representativeLine.serialRequired`
- `serialAssigned` aus `!!representativeLine.serialNumber`
- Rendering ebenfalls ueber `SerialStatusDot`

Referenzen:

- `src/components/run-detail/InvoicePreview.tsx:165-179`
- `src/components/run-detail/InvoicePreview.tsx:575-585`

**Root Cause fuer "JA wird ignoriert"**

Die Anzeige liest korrekt den Store-Zustand.  
Der Store-Zustand wird bei manuellem Artikel-Fix im `matched`-Pfad auf Stammdatenwert zurueckgesetzt (siehe 3.2).

---

### 3.2 Frage 2: Store-Action `setManualArticleByPosition`

**Befund**

- Formular liefert `serialRequired` sauber in die Action.
- Bei `matched` (Stammdaten-Treffer):  
  `serialRequired: matched.serialRequirement` (Formularwert wird ignoriert)
- Bei `!matched`:  
  `serialRequired: data.serialRequired ?? line.serialRequired` (Formularwert wird uebernommen)

Referenzen:

- `src/components/run-detail/IssueDialog.tsx:147-158`
- `src/store/runStore.ts:2830-2847` (`matched`-Pfad)
- `src/store/runStore.ts:2848-2863` (`!matched`-Pfad)

**Ergebnis**

Ja, bei fehlenden Stammdaten (`!matched`) ist das Schreiben korrekt.  
Der beobachtete Bug entsteht im Gegenfall (`matched`), nicht im `!matched`-Pfad.

---

### 3.3 Frage 3: Step 3 Verhalten bei bereits vorhandenen `serialNumbers`

Step 3 laeuft ueber `executeMatcherSerialExtract` mit zwei Pfaden.

#### Pfad A: `preFilteredSerials` (Hauptpfad)

- Fuer `serialRequired`-Zeilen wird neu zugewiesen:
  - `serialNumbers: assigned`
  - `serialNumber: assigned[0] ?? null`
  - `serialSource: 'serialList'`
- Kein Merge, kein Protect-Flag, kein "manuell behalten".

Referenz:

- `src/store/runStore.ts:3615-3635`

**Folge:** Vorhandene manuelle `serialNumbers` werden bei Treffer ersetzt.

#### Pfad B: Legacy `matcher.serialExtract`

- Rueckgabe wird komplett in den Store geschrieben: `invoiceLines: [...result.lines, ...otherLines]`
- Interne Legacy-Logik setzt nur `serialNumber` + `serialSource`, nicht `serialNumbers[]`

Referenzen:

- `src/store/runStore.ts:3761-3797`
- `src/services/matchers/modules/FalmecMatcher_Master.ts:546-560`

**Folge:** Kein sauberer Manual-Schutz; Verhalten ist nicht konsistent zum Hauptpfad.

#### Wichtiger Step-4-Hinweis

Run 3 Expansion verteilt Seriennummern aus `line.serialNumbers[i]` (nicht primaer aus `line.serialNumber`).

Referenz:

- `src/services/matching/runs/run3ExpandFifo.ts:97-109`

Das fuehrt zu einem Konflikt, wenn UI "zugewiesen" auf Basis `serialNumber` zeigt, aber Step 4 auf `serialNumbers[]` basiert.

---

### 3.4 Frage 4: Datenmodell-Schutzfeld

**Befund**

- `InvoiceLine` enthaelt:
  - `serialNumber: string | null`
  - `serialNumbers: string[]`
  - `serialRequired: boolean`
  - `serialSource: 'serialList' | 'openWE' | 'manual' | 'none'`
- Kein Schutzfeld wie `serialNumberManual`, `serialNumbersManual`, `serialNumbersLocked`.

Referenzen:

- `src/types/index.ts:46`
- `src/types/index.ts:276-325`

**Andockpunkt (architektonisch)**

Ein Schutz muss direkt an `InvoiceLine` andocken, weil:

1. Step 3 genau dort schreibt.
2. Step 4 genau dort liest.
3. UI-Status genau dort visualisiert wird.

## 4) Zusatzbefund fuer Round5 (Preisfeld)

Im manuellen Artikel-Formular fehlt aktuell ein Feld fuer manuellen Sage-Netto-Preis.

- `ArticleFormData` hat kein Preisfeld.
- `ManualArticleData` hat kein Preisfeld.
- `setManualArticleByPosition` kennt kein `unitPriceSage` aus Formular.

Referenzen:

- `src/components/run-detail/IssueDialog.tsx:113-120`
- `src/store/runStore.ts:411-420`

## 5) Risiko-Matrix (wenn unveraendert weitergebaut wird)

1. **High:** Manuelle S/N kann durch Step 3 verloren gehen (Pfad A ueberschreibt).  
2. **High:** UI kann "S/N vorhanden" anzeigen, waehrend `serialNumbers[]` fuer Step 4 leer/abweichend ist.  
3. **Medium:** User-Eingabe "S/N-Pflicht = Ja" wirkt inkonsistent, wenn Stammdatenwert abweicht.  
4. **Medium:** Ohne manuelles Preisfeld bleibt manueller Artikel-Fix fachlich unvollstaendig.

## 6) Planungsleitplanken fuer Architektur-Phase

1. **SSOT-Regel fuer Serialdaten festlegen:** `serialNumbers[]` ist fachliche Quelle fuer Expansion/Export; UI darf nicht gegenlaeufig nur `serialNumber` bewerten.
2. **Manual-Schutz im Modell verankern:** Feld(er) auf `InvoiceLine`, die Step 3 respektiert.
3. **Policy bei `matched` klaeren:**  
   Soll Formularwert `serialRequired` Stammdaten uebersteuern duerfen oder nicht?
4. **Preisfeld end-to-end definieren:**  
   Formular -> Action -> `unitPriceSage`/`priceCheckStatus` inklusive Toleranzlogik.
5. **Step-3-Merge-Strategie festlegen:**  
   Ueberschreiben vs. Ergaenzen vs. "manual wins" je Zeile.

## 7) Entscheidungspunkte vor Implementierung

1. Darf ein User-Stammdatenkonflikt `serialRequired` bewusst uebersteuern?
2. Soll manual S/N zeilenweise locken oder nur "prefer manual, fill missing" erlauben?
3. Soll Legacy-Path an Hauptpfad angeglichen werden oder mittelfristig entfernt werden?
4. Welche Quelle bestimmt den SN-Status in der UI final: `serialNumber` oder `serialNumbers[]`?

