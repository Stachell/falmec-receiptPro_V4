# PROJ-46-ADD-ON: Button "Uploads leeren" (NewRun.tsx)

## Context
Der User braucht einen schnellen Weg, alle 4 Upload-Slots auf der NewRun-Seite mit einem Klick zu leeren. Die Store-Funktion `clearUploadedFiles` existiert bereits und räumt IndexedDB + localStorage + Zustand-State auf. Wir wrappen sie nur in einen neuen Button.

## Änderungen

### 1. Code-Änderung: `src/pages/NewRun.tsx`

**a) Imports erweitern:**
- `Trash2` zu den lucide-react Imports hinzufügen (Zeile 4)
- `clearUploadedFiles` zum `useRunStore()` Destructuring hinzufügen (Zeile 25)

**b) Footer-Bereich umbauen (Zeile 219-229):**
- Den bestehenden `<Button>` "Verarbeitung starten" und den neuen Button in ein `<div className="flex items-center gap-3">` wrappen
- Neuer Button **links** neben "Verarbeitung starten":
  ```tsx
  {uploadedFiles.length > 0 && (
    <Button
      variant="outline"
      size="lg"
      onClick={clearUploadedFiles}
      className="bg-white text-black border-border hover:bg-[#008C99] hover:text-[#FFFFFF] transition-colors duration-200"
    >
      <Trash2 className="w-4 h-4" />
      Uploads leeren
    </Button>
  )}
  ```
- Render-Guard: `uploadedFiles.length > 0` — Button erscheint nur wenn Dateien vorhanden

### 2. Feature-Index
- `features/INDEX.md` — neuen Eintrag anfügen

## Betroffene Dateien
| Datei | Aktion |
|---|---|
| `src/pages/NewRun.tsx` | 2 Import-Zeilen + Footer-Umbau |
| `features/INDEX.md` | 1 Zeile anfügen |

## Wiederverwendete Funktionen
- `clearUploadedFiles()` aus `src/store/runStore.ts` (Zeile 804-814) — löscht IndexedDB + localStorage + setzt `uploadedFiles: []`
- `Trash2` Icon von lucide-react (bereits im Projekt verwendet in Index.tsx, SettingsPopup.tsx)

## Verification
1. `npx tsc --noEmit` — keine Type-Errors
2. Manuell: NewRun öffnen → kein "Uploads leeren" Button sichtbar → Dateien hochladen → Button erscheint → Klick → alle 4 Slots leer, Button verschwindet
