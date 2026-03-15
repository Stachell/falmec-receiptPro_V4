# PROJ-27-ADDON-3: SettingsPopup Horizontal Tab-Leiste + Breiteres Popup

## Context

Das SettingsPopup hatte eine vertikale Sidebar-Tab-Navigation (8 Tabs untereinander, `w-44` = 176px). Optisch inkonsistent mit IssueDialog und RunDetail, die beide horizontale 3D-Relief-Tab-Leisten verwenden. Popup von 600px auf 800px verbreitert, alle Tabs horizontal in einer Zeile mit Icons und 3D-Relief-Standard.

## Aenderungen

### 1. Icon-Imports (Zeile 42)
7 neue Icons: `Settings`, `AlertTriangle`, `FileText`, `Search`, `Fingerprint`, `PackageOpen`, `Download` — alle bereits anderswo im Projekt verwendet.

### 2. DialogContent verbreitert
`max-w-[600px]` → `max-w-[800px]`

### 3. Tabs-Container
- `orientation="vertical"` ENTFERNT (Radix Default = horizontal)
- `flex gap-4` → `flex flex-col` (Tab-Leiste oben, Content unten)

### 4. TabsList — 3D-Relief-Leiste
```
Alt:  flex flex-col h-fit self-start items-start justify-start gap-0.5 p-1 w-44 shrink-0
      + inline style backgroundColor/borderRadius
Neu:  flex flex-row h-fit bg-[#c9c3b6] border border-border tab-bar-raised p-1 gap-1 rounded-md mb-3 shrink-0
```

### 5. TabsTrigger — Labels gekuerzt + Icons + 3D-Relief
Einheitliches className:
```
text-xs px-3 py-1.5 gap-1 tab-trigger-pressed data-[state=active]:bg-[#666666] data-[state=active]:text-white hover:bg-[#008C99] hover:text-[#E3E0CF] transition-colors
```

| Alt | Neu | Icon |
|-----|-----|------|
| Allgemein | Allgemein | Settings |
| Fehlerhandling | Fehler | AlertTriangle |
| PDF-Parser | Parser | FileText |
| Artikel extrahieren | Matcher | Search |
| Serial parsen | Serial | Fingerprint |
| Bestellung mappen | Bestellung | PackageOpen |
| Export | Export | Download |
| Speicher/Cache | Speicher | Archive |

### 6. Content-Wrapper
`min-h-0` ergaenzt — kritisch fuer Flex-Children, damit `overflow-y-auto` korrekt greift.

### 7. Fehlerhandling — 2-Spalten-Grid
Neuer Wrapper `<div className="grid grid-cols-2 gap-x-6 gap-y-2">` um die 10 E-Mail-Inputs. Innere Elemente 100% identisch (gleiche Handler, Klassen, Indizes). Layout: 2 Spalten à 5 Felder.

## Sicherheits-Checkliste

Folgende Elemente wurden NICHT angefasst:
- `activeTab` State + `SettingsTabKey` Typ
- Alle `TabsContent` classNames
- `ExportConfigTab` Komponente
- `emailAddresses` + Debounce-Refs + Timer-Cleanup
- Parser-Import, Archiv-Export, Override-Modal
- `FooterButton`, `DiagnosticsBlock`
- `initialTab` Prop + Deep-Link-Logik
- Alle `Select`, `Switch`, `Input` Handler

## Verifikation
```bash
npx tsc --noEmit
# 0 Errors — bestaetigt
```
