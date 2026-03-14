# PROJ-44 BUGFIX Round 2 - IST-Analyse

Stand: 2026-03-13

## 1) Funktionierendes Original-Maß (`SettingsPopup.tsx`)

Datei: `src/components/SettingsPopup.tsx`

Fundstelle: Zeilen 770-773 (`<DialogContent>` Wrapper)

```tsx
<DialogContent
  className="max-w-[600px] w-full"
  style={{ backgroundColor: '#D8E6E7' }}
>
```

Befund:
- Aktuelle maximale Breite ist `max-w-[600px]`.
- Weitere relevante Klasse: `w-full`.
- Inline-Style: `backgroundColor: '#D8E6E7'`.

Hinweis (abgeleitet):
- Wenn ein anderes Fenster relativ dazu um `+35%` verbreitert werden soll, entspricht das rechnerisch `600px * 1.35 = 810px`.

## 2) Geister-Dropdown der E-Mails (`SettingsPopup.tsx`)

### 2.1 Exaktes JSX im Tab `Fehlerhandling`

Datei: `src/components/SettingsPopup.tsx`

Fundstelle: Zeilen 989-1030

```tsx
<TabsContent value="errorhandling" className="mt-0 space-y-3">
  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Fehlerhandling</div>
  <div className="border-t border-border pt-3 space-y-3">
    <Label className="text-sm font-semibold">Fehlerhandling</Label>
    <p className="text-xs text-muted-foreground">
      E-Mail-Adressen fuer Fehlerweiterleitung
    </p>

    {Array.from({ length: ERROR_HANDLING_EMAIL_SLOT_COUNT }, (_, i) => (
      <div key={i} className="flex items-center justify-between gap-4">
        <Label className="text-sm whitespace-nowrap">Adresse {i + 1}</Label>
        <Input
          type="email"
          value={emailAddresses[i] ?? ''}
          onChange={(e) => handleUpdateAddress(i, e.target.value)}
          placeholder="name@firma.de"
          className={`h-8 flex-1 max-w-[280px] text-sm bg-white ${
            (emailAddresses[i] && !isValidEmail(emailAddresses[i])) || duplicateEmailIndices.has(i)
              ? 'border-amber-400'
              : ''
          }`}
        />
      </div>
    ))}

    <div className="flex items-center gap-3">
      <Button size="sm" onClick={handleSaveEmails} className="gap-1.5 min-w-[110px]">
        {emailSaved ? (
          <>
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            Gespeichert!
          </>
        ) : (
          'Speichern'
        )}
      </Button>
      <p className="text-xs text-muted-foreground">
        Gespeicherte Adressen erscheinen im Fehler-Popup als Empfaenger.
      </p>
    </div>
  </div>
</TabsContent>
```

Befund:
- Im `Fehlerhandling`-Tab gibt es **kein** `<Select>`-Dropdown fuer gespeicherte E-Mails.
- Es werden ausschließlich feste `<Input type="email" ... />` Slots gerendert.

### 2.2 Initialisierung/Hook: Laden aus Storage beim Öffnen

Datei: `src/components/SettingsPopup.tsx`

Fundstelle: Zeilen 359-364

```tsx
// PROJ-39-ADDON: Load stored emails (fixed slots) when popup opens
useEffect(() => {
  if (open) {
    setEmailAddresses(getStoredEmailSlots());
  }
}, [open]);
```

Befund:
- Ja, es existiert ein `useEffect`, der beim Öffnen (`open === true`) die Daten via `getStoredEmailSlots()` lädt und in `emailAddresses` schreibt.
