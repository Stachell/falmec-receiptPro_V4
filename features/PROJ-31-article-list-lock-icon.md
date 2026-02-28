# PROJ-31: Artikelliste Lock/Unlock Icon

## Ziel

Rein visuelles Status-Icon im Header der Artikelliste (`ItemsTable.tsx`), das anzeigt, ob Schritt 4 (OrderMapper) abgeschlossen ist und die Liste zur Bearbeitung freigegeben ist.

Der bisherige Zaehler-Text `{filteredLines.length} von {invoiceLines.length} Positionen` wird vollstaendig entfernt und durch das Icon ersetzt.

## Trigger-Bedingung (Step 4)

Schritt 4 gilt als abgeschlossen, wenn:

```typescript
const step4 = currentRun?.steps.find(s => s.stepNo === 4);
const isStep4Done = step4?.status === 'ok' || step4?.status === 'soft-fail';
```

| Status | Bedeutung |
|--------|-----------|
| `'ok'` | Alle Artikel haben Bestellungen - vollstaendig |
| `'soft-fail'` | OrderMapper abgeschlossen, aber Restmenge ohne Match |
| `'not-started'` / `'running'` / `'failed'` / `'paused'` | Noch nicht bereit -> gesperrt |

## Design-Vorgaben (finale Version nach ADD-ONs)

| Zustand | Icon | Tooltip |
|---------|------|---------|
| Gesperrt (Step 4 nicht fertig) | `Lock_CLOSE_STEP4.ico` | "Gesperrt/locked: Artikelliste wird nach Abschluss von Schritt 4 ausgerollt und ist ab dann verfuegbar." |
| Freigegeben (Step 4 fertig) | `Lock_OPEN_STEP4.ico` | "Artikelliste zur Bearbeitung freigegeben" |

- **Position:** Direkt links vor dem Titel-Block ("Artikel Liste" / "/article list"), mit 10px Abstand zum Text (`mr-[10px]`), innerhalb des `ml-auto`-Containers
- **Icon:** Lokale `.ico`-Assets aus `src/assets/icons/` (`Lock_CLOSE_STEP4.ico` / `Lock_OPEN_STEP4.ico`), Groesse `2.156rem`
- **Tooltip:** Natives `title`-Attribut auf dem Icon-Wrapper-Div (kein shadcn Tooltip)
- **Keine Klick-Funktion:** Kein `<Button>`, kein `onClick`
- **Chevron-Button:** Allein im `w-24`-Wrapper, identisch zu `InvoicePreview.tsx` (RE-Positionen)

## Markup-Struktur

```tsx
import lockClosedIcon from '@/assets/icons/Lock_CLOSE_STEP4.ico';
import lockOpenIcon from '@/assets/icons/Lock_OPEN_STEP4.ico';

<div className="ml-auto flex items-stretch">
  <div className="flex items-center">
    <div
      className="mr-[10px] flex items-center"
      title={isStep4Done
        ? 'Artikelliste zur Bearbeitung freigegeben'
        : 'Gesperrt/locked: Artikelliste wird nach Abschluss von Schritt 4 ausgerollt und ist ab dann verfuegbar.'}
    >
      {isStep4Done ? (
        <img src={lockOpenIcon} alt="Artikelliste freigegeben" className="h-[2.156rem] w-[2.156rem] select-none" />
      ) : (
        <img src={lockClosedIcon} alt="Artikelliste gesperrt" className="h-[2.156rem] w-[2.156rem] select-none" />
      )}
    </div>
    <div className="text-right">
      <h3 className="text-2xl font-semibold leading-none tracking-tight">Artikel Liste</h3>
      <p className="text-sm text-muted-foreground">/article list ({packageCount})</p>
    </div>
  </div>
  {/* Chevron-Button im w-24-Wrapper ... */}
</div>
```

## Betroffene Dateien

- `src/components/run-detail/ItemsTable.tsx` - einzige Code-Aenderung

## Dependencies

- Kein neuer State, kein Store-Eingriff
- Nutzt bestehende `currentRun.steps[]` aus `useRunStore()` (bereits im Component vorhanden)
- Nutzt lokale Asset-Imports: `@/assets/icons/Lock_CLOSE_STEP4.ico`, `@/assets/icons/Lock_OPEN_STEP4.ico`

## ADD-ON Aenderungshistorie

| Version | Aenderung |
|---------|----------|
| Initial | Lock/Unlock im rechten Separator-Wrapper (w-24) neben Chevron-Button |
| ADD-ON 1 | Position in Filter-Bereich verschoben (ml-5 nach Filter), Chevron-Wrapper wiederhergestellt, Icon-Groesse h-9 w-9, Lock `text-foreground` |
| ADD-ON 2 | Icons auf Emoji 🔒/🔓 umgestellt (`text-3xl`), Tooltip-Text angepasst, lucide-react Lock/Unlock Imports entfernt |
| ADD-ON 3 | Position geaendert: Icon vor Titel-Block (15px Abstand rechts), aus Filter-Bereich entfernt; Icon-Groesse auf 120% (`2.16rem`) erhoeht |
| ADD-ON 4 | Icon-Groesse auf 115% (`2.156rem`) angepasst, Abstand zum Titel von 15px auf 10px verringert |
| ADD-ON 5 | Schwarzer Hintergrund entfernt, Emoji-Icons (`🔒` / `🔓`) explizit beibehalten (beide Zustaende). |
| ADD-ON 6 | Emoji-Icons durch lokale `.ico`-Assets ersetzt (`Lock_CLOSE_STEP4.ico` / `Lock_OPEN_STEP4.ico`), Hintergrund weiterhin entfernt. |
