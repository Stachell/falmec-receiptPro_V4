# PROJ-46: 3-Stufen-Status-Flow — Entwurf & Bestätigung

**Confidence Score: 97%**
**Datum: 25.03.2026**
**Branch: master**

---

## Soll-Zustand (verifiziert)

### 3-Stufen-Modell der Checkbox/Status-Indikatoren

| Stufe | Farbe | Bedeutung | Verhalten |
|---|---|---|---|
| 1 — Fehler | Rot/Orange/Gelb | Parser hat Fehler erkannt | Unbearbeitet, Issue offen |
| 2 — Entwurf | **Blau** | User hat manuell Daten geändert | Issue bleibt OFFEN, "Neu-Verarbeiten" überschreibt |
| 3 — Bestätigt | **Grün** | User hat bewusst bestätigt | Issue erledigt, Felder gesperrt, geschützt |

### Zwei Wege von Blau → Grün

**Weg 1 — Einzelbearbeitung:**
1. Tab "Übersicht" → Daten ändern (ArticleMatchCard, PriceCell) → Entwurf (blau)
2. Button "Lösung erzwingen" → navigiert zu Tab "Lösung erzwingen"
3. Tab zeigt Readonly-Zusammenfassung was geschrieben wird
4. "Lösung anwenden" klicken → persistent, grün, gesperrt, Fehler erledigt

**Weg 2 — Bulk via "Aktualisieren":**
1. Stufe 1: Preisabweichung vorhanden? → "Bitte erst in Einzelbearbeitung lösen"
2. Stufe 2: Alle Entwürfe vollständig + REGEX valide?
3. Stufe 3: Ja → alle blau→grün, Issues resolved, Sperre

### Schutzfunktionen
- Tab-Wechsel zu "Lösung erzwingen" = bewusste Handlung (kein kopfloses Sperren)
- "Neu-Verarbeiten" überschreibt blaue Entwürfe → Rollback zum Ursprungszustand
- Bestätigte (grüne) Werte sind bei "Neu-Verarbeiten" geschützt
- Erledigte Fehler KÖNNEN im Fehlercenter wieder aktiviert werden

---

## Datenmodell

### Neuer Type
```typescript
export type ManualStatus = 'none' | 'draft' | 'confirmed';
```

### Neues Feld auf InvoiceLine
```typescript
manualStatus?: ManualStatus;
```

Orthogonal zu `articleSource` / `priceCheckStatus` — beschreibt redaktionelle Phase, nicht Datentyp.

**Initial-State Sicherheit:** `manualStatus` ist `undefined` bei allen bestehenden/neuen Lines aus dem Parser. Im gesamten Code gilt: `undefined` === `'none'` === kein manueller Eingriff. Alle Guards verwenden **Positiv-Prüfung** (`=== 'draft'`, `=== 'confirmed'`), niemals Negativ-Prüfung (`!== 'none'`). Dadurch ist `undefined` automatisch sicher.

---

## Betroffene Dateien

| Datei | Änderungstyp | Risiko |
|---|---|---|
| `src/types/index.ts` | Type + Feld hinzufügen | Minimal |
| `src/store/runStore.ts` | Draft-Guard, Protection-Anpassung, 2 neue Actions | Mittel |
| `src/components/run-detail/IssueDialog.tsx` | Tab 3 Redesign, Readonly-Summary | Mittel |
| `src/components/run-detail/IssuesCenter.tsx` | Bulk-Confirm in handleRefresh | Gering |
| `src/components/run-detail/SerialStatusDot.tsx` | `isConfirmed` Prop | Minimal |
| `src/components/run-detail/PriceCell.tsx` | Draft/Confirmed Badge | Gering |
| `src/components/run-detail/ItemsTable.tsx` | Display-Updates | Gering |

---

## Store-Änderungen (Detail)

### Modifizierte Funktionen — ALLE 4 Manual-Actions (Global + Skalpell)

**Global (Position-basiert):**
1. **`setManualArticleByPosition`** (~Z.2958, 2980) — `manualStatus: 'draft'`
2. **`setManualPriceByPosition`** (~Z.2869) — `manualStatus: 'draft'`

**Lokal/Skalpell (Line-basiert, PROJ-44-R11):**
3. **`setManualArticleByLine`** (~Z.3070, 3092) — `manualStatus: 'draft'`
4. **`setManualPrice`** (~Z.2828) — `manualStatus: 'draft'`

### Modifizierte Guards
5. **`executeMatcherCrossMatch`** — Protection nur für `confirmed`:
   - `articleSource === 'manual' && manualStatus === 'confirmed'` → geschützt
   - `priceCheckStatus === 'custom' && manualStatus === 'confirmed'` → geschützt
6. **`checkIssueStillActive`** — Draft-Guard: `|| l.manualStatus === 'draft'`
7. **`reopenIssue`** — `confirmed → draft` Rückstufe

### Neue Actions
8. **`confirmManualFix(issueId, note?)`** — draft→confirmed + resolve + refresh
9. **`bulkConfirmDraftIssues(runId)`** — 3-stufige Validierung:
   - Stufe 1: Preisabweichung offen? → Meldung
   - Stufe 2: Strikte Feld-Checkliste: `falmecArticleNo` + REGEX, `storageLocation` nicht leer, `serialRequired` → `serialNumbers.length >= qty`, `ean` nicht leer
   - Stufe 3: Alle valide → draft→confirmed + resolve

---

## Schutzliste (NICHT ändern)

- `reprocessCurrentRun` Grundlogik
- `autoResolveIssues` Struktur
- `generateStep5Issues`
- Step 1-4 Pipeline
- PriceCell Popover-Mechanik
- ArticleMatchCard Formular-Logik
- SerialFixPopup
- Export-Logik
- Audit-Log Struktur

---

## Verifikation

1. Dev-Server Screenshot nach jedem Schritt
2. Szenario: Artikel-Entwurf → Checkbox blau, Issue offen
3. Szenario: Lösung erzwingen → Summary angezeigt, Klick → grün, erledigt
4. Szenario: Neu-Verarbeiten → Blaue überschrieben, Grüne bleiben
5. Szenario: Aktualisieren → 3-Stufen-Prüfung funktional
6. Szenario: Wieder öffnen → Grün → Blau
7. Console-Logs fehlerfrei
