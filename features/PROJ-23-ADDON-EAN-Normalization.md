# PROJ-23 ADD-ON: EAN Normalization Wash

**Status:** PLAN
**Scope:** `src/services/matching/orderParser.ts` — ausschließlich
**Ticket-Kontext:** PROJ-23 (3-Run Engine / OrderPool)

---

## Problem

Excel-CSV-Exporte (Sage OpenWE) serialisieren 13-stellige EAN-Nummern als **wissenschaftliche Notation**:
- `8034122713656` → `8,03412E+12` (Komma-Dezimaltrenner)
- oder `8.03412E+12` (Punkt-Dezimaltrenner)

Zusätzlich können Artefakte wie trailing `#` auftreten.

`cellStr()` gibt diese Strings unverändert zurück → EAN-Match in der 2-von-3-Scoring-Logik (`orderPool.ts`) schlägt fehl → ~85% der Bestellpositionen werden verworfen.

---

## Lösung

Neue private Funktion `normalizeEan(raw: string): string` in `orderParser.ts`, die **vor** der Übergabe an `ParsedOrderPosition` greift.

**Callsite (einzige Änderungsstelle):**
```typescript
// Zeile ~317
const ean = mapping.ean >= 0 ? normalizeEan(cellStr(row[mapping.ean])) : '';
```

---

## Normalisierungs-Logik

```
1. trim() + trailing Artefakte (z. B. "#") entfernen
2. Wenn wissenschaftliche Notation erkannt (Regex: /^-?\d[\d,.]*(E|e)[+\-]?\d+$/):
   → Komma zu Punkt → parseFloat() → Math.round() → String()
3. Sonst: nur Ziffern behalten (replace(/[^0-9]/g, ''))
4. Länge < 8 oder > 14 → '' (ungültig)
5. Negatives Ergebnis → '' (ungültig)
```

---

## Edge-Cases

| Eingabe | Ausgabe |
|---------|---------|
| `"8034122713656"` | `"8034122713656"` ✓ Unverändert |
| `"8.03412E+12"` | `"8034120000000"` ✓ Rückgerechnet |
| `"8,03412E+12"` | `"8034120000000"` ✓ Komma→Punkt |
| `"8034122713656#"` | `"8034122713656"` ✓ Artefakt weg |
| `"8,03412E+12#"` | `"8034120000000"` ✓ Beides |
| `""` | `""` ✓ Leer bleibt leer |
| `"ABCDEF"` | `""` ✓ Müll → leer |
| `"12345"` | `""` ✓ Zu kurz → leer |

---

## Hinweis: Präzisionsverlust

Excel rundet vor dem CSV-Export auf ~6 signifikante Mantissenstellen. D. h. `8034122713656` wird zu `8.03412E+12` — die letzten Stellen sind **bereits verloren**. Die Rückrechnung ergibt `8034120000000`, nicht die Originalzahl.

Dieser Fix rettet den EAN-Match daher nur in Fällen, wo beide Seiten (Bestelldatei + Rechnungs-EAN) denselben Präzisionsverlust aufweisen. Bei vollständigen PDF-EANs hilft nur ein korrekt formatiertes Excel-Feld (Text-Format statt Zahl).

---

## Was NICHT geändert wird

- `orderPool.ts`, `matchingEngine.ts`, `orderMapper.ts` — unberührt
- `orderParserProfiles.ts` — unberührt
- Alle Matcher-Runs (`run1`, `run2`, `run3`) — unberührt

---

## Verifikation

1. Excel mit wissenschaftlichen EAN-Werten in Step 3 laden
2. Console: `[orderParser]` → geparste Positionsanzahl steigen
3. Console: `[OrderPool] 2-of-3 per-article filter:` → `filteredInCount` steigen
4. Mehr gematchte Rechnungszeilen im Ergebnis
