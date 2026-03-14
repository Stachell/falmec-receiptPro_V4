# PROJ-44-ADD-ON: IssueDialog Horizontal Tab Layout

## Kontext & Ziel
Der IssueDialog nutzte bisher ein vertikales Sidebar-Layout (TabsList als linke Spalte, `flex-row` Tabs-Wrapper, `w-44` Sidebar mit `#c9c3b6` Hintergrund). Das zerquetscht den Inhaltsbereich auf einem 810px-Dialog. Umbau auf horizontale Kopfzeilen-Tabs — identisch zum Run-Detail-Muster. **Reines CSS/Tailwind-Refactoring, null Logik-Änderungen.**

---

## Änderungen in `src/components/run-detail/IssueDialog.tsx`

### 1. DialogContent
```
Alt:  className="max-w-[810px] w-full max-h-[85vh] flex flex-col"
Neu:  className="max-w-[800px] w-full h-[600px] flex flex-col"
```
- Feste Höhe 600px statt fluider max-h-[85vh]
- Breite auf 800px korrigiert (war 810px)
- `style={{ backgroundColor: '#D8E6E7' }}` bleibt unverändert

### 2. Tabs
```
Alt:  orientation="vertical"  className="flex flex-row gap-4 mt-2 flex-1 overflow-hidden"
Neu:  (kein orientation-Prop)  className="flex flex-col flex-1 overflow-hidden w-full"
```
- Richtung kippt: row → col (Tab-Leiste oben, Inhalt darunter)

### 3. TabsList
```
Alt:  className="flex flex-col h-fit shrink-0 w-44 p-1 gap-0.5 self-start"
      style={{ backgroundColor: '#c9c3b6', borderRadius: '0.5rem', height: 'fit-content', alignSelf: 'flex-start' }}
Neu:  className="flex flex-row h-12 items-center justify-start bg-transparent border-b border-border w-full p-0 gap-6 mb-4"
      (inline style komplett entfernt)
```
- Horizontale Kopfzeile, volle Breite, border-bottom Trennlinie
- Kein Sidebar-Hintergrund, kein festes w-44

### 4. TabsTrigger (alle 5)
Sidebar-Klassen `w-full text-left justify-start` entfernt. Icons + Textgröße bleiben.
```
overview:  "text-xs px-3 py-1.5"
report:    "text-xs px-3 py-1.5"
resolve:   "text-xs px-3 py-1.5 gap-1"
email:     "text-xs px-3 py-1.5 gap-1"
pending:   "text-xs px-3 py-1.5 gap-1"
```

### 5. TabsContent — differenziert (Scroll-Falle vermeiden!)

**Tab 1 (overview), Tab 2 (report), Tab 5 (pending):**
```
className="flex-1 w-full overflow-y-auto outline-none"
```
Kein fixierter Button am Boden → voller Scroll-Container OK.

**Tab 3 (resolve) — AUSNAHME:**
```
className="flex flex-col h-full overflow-hidden w-full outline-none"
```
Äußerer Container ist NICHT scrollbar. Innerer `<div className="flex-1 overflow-y-auto ...">` scrollt den Inhalt, `<div className="pt-2 shrink-0">` hält den Button "Loesung anwenden" am Boden fixiert.

**Tab 4 (email) — AUSNAHME:**
```
className="flex flex-col h-full overflow-hidden w-full outline-none"
```
`<div className="mt-auto pt-2">` mit dem "E-Mail erzeugen"-Button muss am Boden bleiben.

---

## Verifikation
```bash
npx tsc --noEmit
# Erwartet: 0 Errors
```
Visuell: IssueDialog öffnen → Tabs erscheinen als horizontale Zeile oben, Inhalt füllt verbleibende Höhe, Buttons in Tab 3+4 kleben am Boden.
