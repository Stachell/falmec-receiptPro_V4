# PROJ-46 ADD-ON: Clear Uploads Diagnostic

**Datum:** 2026-03-21
**Scope:** Reine IST-Analyse fuer geplantes ADD-ON "Upload leeren" auf `src/pages/NewRun.tsx`
**Ablagegrund:** `src/pages/NewRun.tsx` wurde zuletzt unter **PROJ-46-ADDON** bearbeitet.

## PROJ-Zuordnung

- `git log --follow -- src/pages/NewRun.tsx` zeigt als letzten einschlaegigen Bezug:
  - Commit `a337755` vom **2026-03-14**
  - Message: `test(PROJ-43-44-BUGFIX-R1+R2+PROJ-46-ADDON): ...`
- `features/INDEX.md` fuehrt dazu passend:
  - **PROJ-46-ADDON | Gedaechtnis-Start Bugfix (Klick-to-Mind)**
- Zusaetzlich bestaetigt `features/PROJ-46-ADDON-Gedaechtnis_Start_Bugfix.md`, dass `NewRun.tsx` dort fuer Fix C (`ensureFolderStructure().catch(...)`) angefasst wurde.

=> Passende neue Diagnose-Datei: `features/PROJ-46-ADD-ON_ClearUploads_diagnostic.md`

---

## 1. Hover-Effekt des "NEU" Buttons

**Fundstelle:** `src/components/AppSidebar.tsx`

### Farbkonstanten

Oben in der Datei definiert:

```ts
const HOVER_BG = '#008C99';
const HOVER_TEXT = '#FFFFFF';
const HOVER_BORDER = '#D8E6E7';
```

### Exaktes JSX des Buttons

**Zeilen 242-264** in `src/components/AppSidebar.tsx`:

```tsx
<div className="absolute right-6 flex items-center">
  <Link
    to="/new-run"
    onMouseEnter={() => setIsNeuHovered(true)}
    onMouseLeave={() => setIsNeuHovered(false)}
    className="h-[calc((4rem+4vh)*0.82)] aspect-square rounded-lg border transition-all duration-200 flex flex-col items-center justify-end p-[2px]"
    style={{
      backgroundColor: isNeuHovered ? HOVER_BG : '#c9c3b6',
      borderColor: isNeuHovered ? HOVER_BORDER : '#666666',
    }}
    title="Neuer Lauf"
  >
    <FilePenLine
      className="flex-1 w-full max-h-[141%]"
      style={{ color: isNeuHovered ? HOVER_TEXT : '#666666' }}
    />
    <span
      className="text-xs"
      style={{ color: isNeuHovered ? HOVER_TEXT : '#666666' }}
    >
      NEU
    </span>
  </Link>
</div>
```

### Exakte Klassen / Hover-Logik

- Wrapper-Container:
  - `absolute right-6 flex items-center`
- `Link`-Klassen:
  - `h-[calc((4rem+4vh)*0.82)]`
  - `aspect-square`
  - `rounded-lg`
  - `border`
  - `transition-all`
  - `duration-200`
  - `flex`
  - `flex-col`
  - `items-center`
  - `justify-end`
  - `p-[2px]`
- Icon-Klassen:
  - `flex-1 w-full max-h-[141%]`
- Text-Klasse:
  - `text-xs`

### Wichtige Diagnose

Der eigentliche Hover-Effekt kommt **nicht** aus Tailwind-`hover:*`-Klassen, sondern aus React-State + Inline-Styles:

- Normalzustand:
  - Hintergrund: `#c9c3b6`
  - Border: `#666666`
  - Icon/Text: `#666666`
- Hover:
  - Hintergrund: `#008C99`
  - Border: `#D8E6E7`
  - Icon/Text: `#FFFFFF`

---

## 2. Einfuegepunkt neben "Verarbeitung starten"

**Fundstelle:** `src/pages/NewRun.tsx`

### Exaktes JSX des umschliessenden Containers + Buttons

**Zeilen 207-230** in `src/pages/NewRun.tsx`:

```tsx
<div className="flex items-center justify-between pt-4 border-t border-border">
  <div className="flex flex-col gap-1">
    {!allFilesUploaded && (
      <p className="text-sm text-muted-foreground">
        Bitte laden Sie alle erforderlichen Dateien hoch
      </p>
    )}
    {allFilesUploaded && !canStartProcessing && (
      <p className="text-sm text-yellow-600 flex items-center gap-1.5">
        <AlertTriangle className="w-4 h-4" />
        Bitte waehlen Sie ein Datenverzeichnis im Footer
      </p>
    )}
  </div>
  <Button
    type="button"
    size="lg"
    className="gap-2"
    disabled={!allFilesUploaded || isLocked('start')}
    onClick={wrap('start', handleStartProcessing)}
  >
    <Play className="w-4 h-4" />
    Verarbeitung starten
  </Button>
</div>
```

### Diagnose fuer den geplanten Add-on-Button

- Der Footer-Block ist aktuell ein `flex items-center justify-between`.
- Links sitzt nur der Hinweistext-Container.
- Rechts sitzt **ein einzelner** CTA-Button.
- Ein neuer Button "Upload leeren" laesst sich logisch direkt **links neben** dem bestehenden Start-Button einhaengen, indem der rechte Bereich von einem Einzel-Button auf einen kleinen Button-Cluster erweitert wird.

---

## 3. Loesch-Logik der Uploads ("X")

### 3.1 Bestehende Store-Funktionen in `src/store/runStore.ts`

**Interface-Zeilen 497-500**:

```ts
addUploadedFile: (file: UploadedFile) => void;
removeUploadedFile: (type: UploadedFile['type']) => void;
clearUploadedFiles: () => void;
loadStoredFiles: () => Promise<void>;
```

### Diagnose

- **Vorhanden in `runStore.ts`:**
  - `removeUploadedFile(type)`
  - `clearUploadedFiles()`
- **Nicht vorhanden in `runStore.ts`:**
  - `clearAllFiles`
  - `resetUploads`
- **Wichtig:** `clearAllFiles()` existiert bereits, aber **nicht** im Store, sondern in `src/services/fileStorageService.ts`.

### 3.2 Exakte Implementierung in `runStore.ts`

**Zeilen 789-814**:

```ts
removeUploadedFile: (type) => {
  // Remove from IndexedDB (async, fire and forget)
  if (fileStorageService.isAvailable()) {
    fileStorageService.removeFile(type).catch((error) => {
      console.error('[RunStore] Failed to remove file from IndexedDB:', error);
    });
  }

  set((state) => {
    const newFiles = state.uploadedFiles.filter(f => f.type !== type);
    savePersistedFiles(newFiles);
    return { uploadedFiles: newFiles };
  });
},

clearUploadedFiles: () => {
  // Clear IndexedDB (async, fire and forget)
  if (fileStorageService.isAvailable()) {
    fileStorageService.clearAllFiles().catch((error) => {
      console.error('[RunStore] Failed to clear files from IndexedDB:', error);
    });
  }

  localStorage.removeItem(UPLOADED_FILES_KEY);
  set({ uploadedFiles: [] });
},
```

### 3.3 Technische Basis fuer "alle Uploads loeschen"

`src/services/fileStorageService.ts` besitzt bereits die Low-Level-Funktion:

```ts
async function clearAllFiles(): Promise<boolean> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.debug('[FileStorage] All files cleared');
        resolve(true);
      };

      request.onerror = () => {
        console.error('[FileStorage] Failed to clear files:', request.error);
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('[FileStorage] Error clearing files:', error);
    return false;
  }
}
```

### 3.4 Was passiert beim Klick auf das "X"?

**In `src/components/FileUploadZone.tsx`, Zeilen 85-95:**

```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={(e) => {
    e.stopPropagation();
    onFileRemoved();
  }}
  className="text-muted-foreground hover:text-foreground"
>
  <X className="w-4 h-4" />
</Button>
```

Der X-Button ruft also **nur** das Prop `onFileRemoved()` auf.

### 3.5 Welcher Funktionsaufruf wird von `NewRun.tsx` uebergeben?

**In `src/pages/NewRun.tsx`:**

```tsx
onFileRemoved={() => removeUploadedFile('invoice')}
onFileRemoved={() => removeUploadedFile('openWE')}
onFileRemoved={() => removeUploadedFile('serialList')}
onFileRemoved={() => removeUploadedFile('articleList')}
```

### Ergebnis der Kette

Beim Klick auf das X passiert heute:

1. `FileUploadZone` ruft `onFileRemoved()`
2. `NewRun.tsx` mapped das auf `removeUploadedFile('<type>')`
3. `runStore.removeUploadedFile(type)`:
   - entfernt die Datei aus IndexedDB via `fileStorageService.removeFile(type)`
   - filtert sie aus `uploadedFiles`
   - schreibt die verbleibenden Upload-Metadaten neu via `savePersistedFiles(newFiles)`

---

## Kurzfazit

- Der "NEU"-Hover ist ein **state-gesteuerter Inline-Style-Hover**, nicht Tailwind-`hover:*`.
- Der Einhaengepunkt fuer "Upload leeren" ist der Footer-Container in `NewRun.tsx` direkt rechts neben dem Hinweisblock und unmittelbar vor/nach dem bestehenden Start-CTA.
- Fuer die Gesamtloeschung existiert bereits eine brauchbare Store-Aktion: **`clearUploadedFiles()`**.
- Der bestehende X-Mechanismus nutzt bereits die korrekte Einzel-Loeschlogik ueber **`removeUploadedFile(type)`**.
