# PROJ-13 — Log-Toolbar Export-Buttons & Follow-Redesign

**Status:** Done
**Datum:** 2026-02-17
**Commit:** `e99911c`
**Baut auf:** PROJ-12

---

## Ziel

Erweiterung der Log-Toolbar um Export-Funktionen (Kopieren/Download) und Redesign des Follow-Mode-Buttons.

---

## Umgesetzte Änderungen

### 1. Log-Text-Helper (`buildLogText()`)
- Neue Hilfsfunktion `buildLogText()` zum Aufbereiten des Log-Inhalts als plain-text String.
- Wird von beiden neuen Export-Buttons verwendet.

### 2. Kopieren-Button
- Neuer Button in der Log-Toolbar: Kopiert den gesamten Log-Inhalt via `navigator.clipboard.writeText()` in die Zwischenablage.
- Nutzt `buildLogText()` für konsistente Formatierung.

### 3. Download-Button
- Neuer Button in der Log-Toolbar: Lädt den Log-Inhalt als `.log`-Datei herunter.
- Dateiname enthält Run-ID und Zeitstempel.
- Nutzt `buildLogText()` für konsistente Formatierung.

### 4. Follow-Mode-Button Redesign
- Follow-Button von Text-/Icon-Variante auf `Circle`-Icon umgestellt.
- Aktiver Follow-Mode: rotes Pulse-Effekt (`animate-pulse`, rote Farbe).
- Inaktiver Follow-Mode: gedimmtes Icon ohne Pulse.
- Visuell klarer erkennbar ob Auto-Scroll aktiv ist.

---

## Technische Details

**Betroffene Dateien:**
- `src/components/LogToolbar.tsx` (oder äquivalente Log-Komponente) — Button-Ergänzungen, Follow-Redesign
- `buildLogText()` Helper integriert

**Commit-Beschreibung:**
```
feat(PROJ-13): Phase 1 - Log-Toolbar Export-Buttons & Follow-Redesign

Kopieren/Download-Buttons mit buildLogText()-Helper hinzugefügt,
Follow-Button auf Circle-Icon mit rotem Pulse-Effekt umgestellt.
```
