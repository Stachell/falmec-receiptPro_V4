# STANDARDS.md (S.md) — Coding-Handwerksregeln

> **Was ist das hier?** Unantastbare UI-Leitplanken und Farb-Vorgaben für das Frontend.
> **Wer muss das lesen?** Jeder Agent (Opus, Sonnet, Codex) BEVOR er Frontend-Code plant oder codet.
> **Zusammenspiel:** INVARIANTS.md (Gesetze) + CIRCUIT.md (Verdrahtung) + STANDARDS.md (Design/UI).
> **Wichtig:** Nur Regeln in Sektion A sind aktiv. Sektion B enthält Vorschläge die noch geprüft werden.
> **Version:** 1.4

---

## Sektion A: BESTÄTIGTE REGELN (Unantastbar)
*Diese Regeln sind zwingend anzuwenden und dürfen nicht umgangen werden.*

**S1. Stack-Vorgabe: Vite (KEIN Next.js!)**
- Kein `/src/app/`, kein `use client`. Routing via `react-router-dom`. Dev-Server: `localhost:5173`. Imports via Alias: `import X from '@/...'`.

**S2. Zustand-Store: Reaktiv vs. Punktuell**
- Reaktiv: Nur für nötige Re-Renders `useRunStore(s => s.value)`.
- Punktuell: In `useEffect`/Callbacks IMMER `useRunStore.getState().value`.

**S3. Komponenten & Effekte**
- Single Responsibility pro Datei. Props ZWINGEND typisieren. Dependency-Arrays in `useEffect` sind Pflicht (inkl. Cleanups).

**S4. Styling (Tailwind & shadcn/ui)**
- Tailwind Only (keine Inline-Styles). Dynamische Klassen NUR via `cn()`. shadcn-Komponenten nicht verändern (Wrapper bauen).

**S5. Design-System & UI-Konsistenz (FOKUS: FARBEN)**
Harte Hex-Werte und inkonsistente Farb-Shades werden durch semantische Tokens ersetzt. 
*WICHTIG (Bestandsschutz für dieses Projekt): 
Alle nicht-farblichen Design-Vorgaben (Abstände, Padding, Margin, Flex-Layouts, Radien) sind ausgesetzt. Orientierte dich bei Anpassungen oder neuen Komponenten ZWINGEND am bestehenden Code der umliegenden UI und kopiere deren strukturellen Aufbau exakt!*

- **Pop-Ups, Modals & Inner Panels:**
  - **Haupt-Hintergrund (Dialog):** Ersetzt `#D8E6E7` komplett durch `bg-background-soft`.
  - **Standard-Inhaltsfelder:** Ersetzt wilde Opacities wie `bg-white/30` und `bg-white/40` durch ein sauberes, einheitliches `bg-white/50 border-border`.
  - **Hervorgehobene Felder (Teal-Panels):** Ersetzt `bg-teal-50/20 border-teal-400/60` durch `bg-primary/5 border-primary/30`.

- **Warn- und Info-Panels:** Container für Warnungen nutzen einheitlich `border-warning/50 bg-warning/10 text-warning-foreground`.

- **Buttons & Aktionen (Farben & States):**
  - **Primary (Typ A):** Ersetzt `#008C99` & `teal-600/700` → `bg-primary text-primary-foreground hover:bg-primary/90 transition-colors`
  - **Secondary (Typ B):** Ersetzt `#c9c3b6` / `#666666` → `bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors`
  - **Warning (Typ C):** Ersetzt `amber-400/500` → `bg-warning text-warning-foreground hover:bg-warning/90 transition-colors`
  - **Convert (Typ D):** Behält die Orange-zu-Grün Logik → `bg-background text-orange-600 border-orange-600 hover:bg-success hover:text-white transition-all`
  - **Destructive/Ghost (Typ E):** Ersetzt rote Hover-Icons → `text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors`
  - **Globale State-Regel:** Deaktivierte Buttons nutzen zwingend `disabled:opacity-40 disabled:cursor-not-allowed`.

---

## Sektion B: VORSCHLÄGE (Temporär)
*Erkenntnisse oder neue Patterns, die noch von Dom bestätigt werden müssen.*

- [Noch keine Einträge]