# PROJ-44-BUGFIX_Layout — IssueDialog Flexbox-Reparatur

## Kontext
Nach Bugfix-Runden 1-3 war die Logik stabil, aber das Layout des IssueDialog (linke TabsList dehnte sich vertikal, Content platzte) war zerschossen.

## 4 CSS-Refactoring-Schritte

1. **`<DialogContent>`** — `max-w-[810px] w-full max-h-[85vh] flex flex-col`
   → Bereits korrekt aus R2.

2. **`<Tabs>` Container** — `flex flex-row gap-4 mt-2 flex-1 overflow-hidden`
   → `flex-row` ergänzt (fehlte, Flex-Default ist row aber explizit sauberer).

3. **`<TabsList>`** — `flex flex-col h-fit shrink-0 w-44 p-1 gap-0.5 self-start`
   → `items-start justify-start` entfernt (überflüssig bei flex-col, verursachte Stretch-Probleme). `h-fit` + `self-start` sind die essenziellen Anti-Stretch-Klassen.

4. **`<TabsContent>` (generisch)** — `flex-1 overflow-y-auto`
   → Bereits korrekt aus R2/R3.

## Ergebnis
TabsList bleibt kompakt am oberen linken Rand, Content scrollt im rechten Bereich.
