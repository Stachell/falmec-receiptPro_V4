# PROJ-17 — Error-Center & Deep-Logging

**Status:** Implementation abgeschlossen (Phasen A–F + Artikelstamm-Klärung)
**Letzte Änderung:** 2026-02-20

---

## Übersicht

PROJ-17 erweitert den bestehenden PROJ-16-Matcher-Stack um:
- Granulares Fehler-Logging auf Issue-Ebene (statt nur Warnings)
- KPI-Navigation: Klick auf Fehler-KPI → direkt in den gefilterten Issues-Tab
- Issues-Center UI: Schritt-Gruppierung, neue Labels, Quick-Fix-Banner

---

## Phasen

### Phase A–C — Bereits in PROJ-16 gelegt (Matcher-Architektur)
- `MatcherModule`-Interface mit `crossMatch()` + `serialExtract()`
- `FalmecMatcher_Master` als erste konkrete Implementierung

### Phase A — `src/types/index.ts`
Neue `IssueType`-Literale:

```typescript
// Step 2 subtypes
| 'match-artno-not-found'   // ArtNo/EAN nicht im Stamm (kein Konflikt)
| 'match-ean-not-found'     // reserviert für EAN-only-Fehlschläge
| 'match-conflict-id'       // ArtNo → Artikel A, EAN → Artikel B (Konflikt)
// Step 3 subtypes
| 'sn-invoice-ref-missing'  // 5-stellige Rechnungsreferenz nicht im S/N-Dok
| 'sn-regex-failed'         // Regex /K[0-2]\d{10}K/ kein Treffer (reserviert)
| 'sn-insufficient-count'   // zu wenige S/N für Pflicht-Zeilen
```

### Phase B — `src/services/matchers/types.ts`
- `SerialExtractionResult.issues: Issue[]` hinzugefügt
- `SchemaFieldDef` erweitert um:
  - `validationPattern?: string` — Regex-String für UI-Anzeige
  - `validate?: (value: string) => boolean` — Runtime-Validierungsfunktion

### Phase C — `FalmecMatcher_Master.ts` — Deep-Logging

**`crossMatch()`:**
- `matchSingleLine()` gibt jetzt `{ line, reason, isConflict }` zurück
- Pro no-match-Zeile → `MATCH_TRACE`-Warning (sichtbar im Log-Tab)
- Drei Issues pro Lauf (wenn relevant):
  1. `no-article-match` — Rollup-Summary (rückwärtskompatibel)
  2. `match-artno-not-found` — granular: reine Nicht-Treffer
  3. `match-conflict-id` — granular: ArtNo/EAN-Konflikte

**`serialExtract()`:**
- Bei fehlendem Invoice-Ref: blocking Issue `sn-invoice-ref-missing`
- Pro Regex-Fehlschlag: Warning `SN_REGEX_FAILED`
- Bei unzureichenden S/N: soft-fail Issue `sn-insufficient-count`

### Phase D — `src/store/runStore.ts`
- `issuesStepFilter: string | null` — Store-State für KPI-Navigation
- `setIssuesStepFilter(filter)` — Action
- `executeMatcherSerialExtract()` fix:
  - `issuesCount: result.issues.length` (war: `result.warnings.length`)
  - `result.issues` wird jetzt in `state.issues` propagiert (mit `runId`-Injektion)

### Phase E — KPI-Navigation
**`KPITile.tsx`:**
- `onClick?: () => void` Prop hinzugefügt
- Kachel wird bei gesetztem `onClick` zu `cursor-pointer hover:opacity-80`

**`RunDetail.tsx`:**
- Kachel 2 (Artikel): klickbar wenn `noMatchCount > 0` → Filter `'2'` + Tab `'issues'`
- Kachel 3 (Serial): klickbar wenn Step-3-`issuesCount > 0` → Filter `'3'` + Tab `'issues'`

### Phase F — `IssuesCenter.tsx` UI-Überarbeitung
- **Label-Map** für alle 16 IssueTypes inkl. PROJ-17-Subtypen
- **Store-Sync**: `useEffect` konsumiert `issuesStepFilter` (KPI-Klick) → lokaler State
- **Step-Gruppierung**: offene Issues nach `stepNo` sortiert, mit Sektionsheadern
- **Issue-Farbe**: `blocking` → rot, `soft-fail` → orange (beide Seiten)
- **Quick-Fix-Banner** (Lightbulb-Icon): erscheinen für jeden Issue-Typ mit hinterlegtem Hinweis

---

## Artikelstamm-Feldklärung (Punkt 1–3 Nacharbeit)

### Terminologie

| Feld | Code-Name | Beschreibung | Format |
|------|-----------|--------------|--------|
| **Art-# (DE)** | `falmecArticleNo` | ERP-Nummer Sage Deutschland. Primärer interner Schlüssel. | `^1\d{5}$` — 6 Ziffern, beginnt mit "1" |
| **Art-# (IT)** | `manufacturerArticleNo` | Herstellerartikelnummer Falmec-Hauptwerk (Italien). Steht auf der Eingangsrechnung. | Variabel (z. B. "FIM988IT", "KHFI120") |

### Schema-Änderungen in `FalmecMatcher_Master.ts`

#### Alt (ein generisches artNo-Feld):
```typescript
{ fieldId: 'artNo', label: 'Artikelnummer', aliases: ['Artikelnummer', 'Art.-Nr.', ...] }
```

#### Neu (klare DE/IT-Trennung):
```typescript
{
  fieldId: 'artNoDE',
  label: 'Art-# (DE)',
  aliases: ['Art.-Nr. DE', 'Artikelnummer DE', 'Falmec Art.-Nr.', ...],
  validationPattern: '^1\\d{5}$',
  validate: (v) => /^1\d{5}$/.test(v.trim()),
},
{
  fieldId: 'artNoIT',
  label: 'Art-# (IT)',
  aliases: ['Artikelnummer', 'Art.-Nr.', 'Article No', 'Codice Articolo', 'Herstellerartikelnummer', ...],
},
```

#### EAN — neues Alias "EAN-NUMMER":
```typescript
{ fieldId: 'ean', aliases: ['EAN', 'EAN-Code', 'EAN-NUMMER', 'Barcode', 'GTIN'] }
```

### Validierungsregel Art-# (DE)
- **Regex:** `^1\d{5}$`
- **Bedeutung:** Genau 6 Stellen, erste Stelle zwingend `"1"`, alle Stellen Ziffern
- **Gültig:** `100001`, `123456`, `187654`
- **Ungültig:** `99999` (5-stellig), `200001` (beginnt nicht mit 1), `ABC123` (Buchstaben)
- **Implementiert in:** `SchemaFieldDef.validate` + `SchemaFieldDef.validationPattern`
- **Angezeigt in:** Settings-UI (Matcher Schema → Art-# (DE) Alias-Zeile als gelbes Regex-Tag)

### Settings-UI-Update (`SettingsPopup.tsx`)
Das `validationPattern` wird in der Schema-Ansicht als gelbes Mono-Tag angezeigt:
```
Art-# (DE):  [Art.-Nr. DE] [Artikelnummer DE] ... [/^1\d{5}$/]
```

---

## System-Analyse: Step-2-Matching-Logik (Punkt 4)

### Wie funktioniert Step 2 aktuell?

Das `crossMatch()` in `FalmecMatcher_Master.ts` baut zwei Hash-Maps aus dem Artikelstamm:

```
byArtNo: Map<normArt_IT, ArticleMaster>   // manufacturerArticleNo → Artikel
byEan:   Map<normEan,    ArticleMaster>   // ean                   → Artikel
```

Dann wird jede Invoice-Zeile gegen BEIDE Maps geprüft:

| Ergebnis | MatchStatus |
|----------|-------------|
| ArtNo-IT-Treffer UND EAN-Treffer → gleicher Artikel | `full-match` |
| ArtNo-IT-Treffer UND EAN-Treffer → **verschiedene Artikel** | `no-match` + Issue `match-conflict-id` |
| Nur ArtNo-IT-Treffer | `code-it-only` |
| Nur EAN-Treffer | `ean-only` |
| Kein Treffer | `no-match` + Issue `match-artno-not-found` |

### Trennung Step 2 / Step 3 — sauber?
**JA.** Step 2 (`crossMatch`) und Step 3 (`serialExtract`) sind vollständig getrennt:
- Step 2 arbeitet mit `InvoiceLine[]` und `ArticleMaster[]`
- Step 3 arbeitet mit `InvoiceLine[]` und `SerialDocument`
- Kein Datenaustausch, keine Seiteneffekte zwischen den Steps
- Der Store führt Step 3 erst aus, wenn Step 2 abgeschlossen ist

### Fallback-Verhalten: Was passiert, wenn Art-# (IT) fehlt?

**Kein automatischer Art-# (DE) → Art-# (IT) Fallback.**

Konkret:
- `line.manufacturerArticleNo` (Art-# IT) leer → `lineCode = ''` → `byArtNo`-Lookup entfällt
- Wenn auch `line.ean` leer → **Beide Identifiers fehlen** → sofort `no-match`, Reason: "ArtNo und EAN leer — kein Lookup moeglich"
- Wenn `line.ean` vorhanden → Nur `ean-only`-Matching, kein Rückgriff auf Art-# (DE)

**Art-# (DE) wird im Step-2-Matching nicht als Lookup-Schlüssel verwendet.** Sie wird nach erfolgreichem Match aus dem Artikelstamm ausgelesen (`matchedArticle.falmecArticleNo`) und in `line.falmecArticleNo` gespeichert, aber nicht für den Lookup genutzt.

**Konsequenz für die Praxis:** Wenn auf der Rechnung nur Art-# (IT) steht, ist das Standard-Szenario. Fehlt Art-# (IT) auf der Rechnung, muss EAN als Identifier vorhanden sein, sonst entsteht ein `no-match`-Issue.

---

## Offene Punkte für Folge-PRs

- [ ] ArticleMaster-Import aus CSV/XLSX: `validate()`-Funktion des Schemas bei Import aufrufen und ungültige Zeilen als Warnings melden
- [ ] `match-ean-not-found` als eigenständiges Issue (aktuell wird EAN-Fehler unter `match-artno-not-found` subsumiert)
- [ ] Fallback-Logik Art-# (DE) als optionaler Lookup-Schlüssel (wenn Art-# IT leer)

---

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `src/types/index.ts` | 6 neue `IssueType`-Literale |
| `src/services/matchers/types.ts` | `SerialExtractionResult.issues`, `SchemaFieldDef.validate`, `SchemaFieldDef.validationPattern` |
| `src/services/matchers/modules/FalmecMatcher_Master.ts` | Schema DE/IT-Split, EAN-Alias, Regex-Validierung, MATCH_TRACE, granulare Issues |
| `src/store/runStore.ts` | `issuesStepFilter` State, Step-3-Issues-Propagation fix |
| `src/components/KPITile.tsx` | `onClick`-Prop |
| `src/pages/RunDetail.tsx` | KPI-Tile-Navigation zu Issues-Tab |
| `src/components/run-detail/IssuesCenter.tsx` | Step-Gruppierung, Quick-Fix-Banner, Store-Sync |
| `src/components/SettingsPopup.tsx` | `validationPattern` im Schema anzeigen |
