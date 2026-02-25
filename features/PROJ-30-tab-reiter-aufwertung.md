# PROJ-30 – Optische Aufwertung Tab-Reiter-Auswahl

## Beschreibung

Die Tab-Leiste im Run-Detail-Cockpit (7 Reiter) erhält einen 3D-Relief-Effekt:

1. **Tab-Bar (Container):** Erhabener Schatten — die Leiste wirkt, als stünde sie aus der Seitenoberfläche hervor.
2. **Aktiver Tab (Button):** Inset-Relief — der aktive Reiter wirkt eingedrückt, liegt optisch auf gleicher Höhe wie die umgebende Seite ("auf einer Linie").
3. **Inaktive Tabs:** Kein zusätzlicher Effekt — bleiben flach auf der erhabenen Bar.

Rein CSS-basiert. Keine Änderungen an Farben, Schriftart, Badges, Hover-Effekten oder Logik.

## Abhängigkeiten

- Baut auf: PROJ-22 (Enterprise UI/UX Polish — Tab-Farben `#c9c3b6` / `#666666`)
- Kein nachgelagertes Feature abhängig

---

## Acceptance Criteria

### AC-1: Tab-Bar erhaben
- [ ] `TabsList` Container erhält CSS-Klasse `tab-bar-raised`
- [ ] Sichtbarer äußerer Schatten (outset): Bar wirkt 3D-erhaben
- [ ] Dezenter oberer Lichtreflex für Plastizität

### AC-2: Aktiver Tab eingedrückt
- [ ] Alle 7 `TabsTrigger` erhalten CSS-Klasse `tab-trigger-pressed`
- [ ] Bei `data-state="active"`: Inset-Schatten (eingedrückt in die Bar)
- [ ] Bei `data-state="inactive"`: Kein Inset-Schatten

### AC-3: Keine visuellen Nebenwirkungen
- [ ] Alle Farben unverändert: `#c9c3b6` (Bar), `#666666` (aktiv), `#008C99` (Hover)
- [ ] Badges (Zahlen-Chips) unverändert
- [ ] Kein Layout-Shift
- [ ] Hover-Effekt funktioniert weiterhin

### AC-4: Keine Logik-Änderungen
- [ ] Kein Einfluss auf Tab-Wechsel, State, oder andere Komponenten

---

## Technische Hinweise

- **CSS-Klassen:** `.tab-bar-raised` (outset shadow) + `.tab-trigger-pressed[data-state="active"]` (inset shadow)
- **Platzierung:** `src/index.css` im `@layer components` Block
- **Anwendung:** `src/pages/RunDetail.tsx` — Klassen an TabsList und alle 7 TabsTrigger

## Changelog

| Datum | Änderung |
|---|---|
| 2026-02-25 | Initiale Implementierung: 2 CSS-Klassen, Tab-Bar + 7 Trigger angepasst |

## Status

Done
