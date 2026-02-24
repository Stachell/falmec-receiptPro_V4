# Order_Mapper_Status_CODEX

## Status
Der umfassende Bericht wurde bereits erstellt unter:
- `features/ORDER.MAPPER-Details.md`

## Zusatz: Plan (wie angefordert)

### Ziel
Konsistenz und Klarheit im Step-4-Workflow herstellen, ohne Matching-Fachlogik zu aendern.

### Scope
- UI-/Benennungs-Konsistenz fuer Step 4
- Routing/Logging fuer `waterfall-4` vs `legacy-3` klarziehen
- Doku angleichen
- Tests fuer Branching + Gate-Verhalten erweitern

### Nicht im Scope
- Neue Matching-Regeln
- Neue Issue-Typen/Severity-Regeln
- Architektur-Refactor der Engine

### Umsetzungsschritte
1. Settings-Texte harmonisieren (`waterfall-4` sichtbar als `MatchingEngine (3 Runs, PROJ-23)`; interner Wert bleibt gleich).
2. Step-4-Branching in `runStore.ts` vereinheitlichen (Auto/Retry/Resume, nur Klarheit/Logs, kein Verhaltenswechsel).
3. Logging standardisieren (`OrderParserGate`-Kontext: profileId, confidence, selectedHeader).
4. Doku synchronisieren:
   - `features/PARSING-RULES/order-mapper.md`
   - `features/ORDER.MAPPER-Details.md`
5. Testabdeckung erweitern:
   - `waterfall-4` nutzt parse+gate+mapping
   - `legacy-3` bleibt Legacy-Verhalten
   - Gate blockiert bei `positions=0` / `confidence=low`
   - positiver Pfad triggert `executeOrderMapping`

### Akzeptanzkriterien
- UI ist semantisch eindeutig (kein "Waterfall"-Missverstaendnis mehr im Text).
- Step-4-Routing ist konsistent nachvollziehbar geloggt.
- Gate-Verhalten unveraendert.
- Dokumentation entspricht Ist-Code.
- Tests sind gruen.
