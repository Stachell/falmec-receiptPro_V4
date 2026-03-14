# PROJ-44-ADD-ON: Settings-Lock (Blinder Speichern-Button)

Stand: 2026-03-14

## Problem

`saveEmailAddresses()` in `src/lib/errorHandlingConfig.ts` rief `localStorage.setItem()` ohne try/catch auf (Zeile 113).

Wenn localStorage voll oder blockiert war (Quota Exceeded, Private Browsing, etc.), warf `setItem` eine unhandled Exception. Diese propagierte durch beide Caller:

1. **`handleSaveEmails`** (SettingsPopup, manueller Save-Button):
   - Funktion brach vor `toast.success()` ab
   - User sah keine Reaktion — kein Toast, kein "Gespeichert!"-Label
   - Symptom: "Blinder Button"

2. **Auto-Save Debounce** (handleUpdateAddress, 500ms Timer):
   - setTimeout-Callback crashte still
   - Emails wurden nicht persistiert
   - Symptom: Eintraege verschwanden beim Schliessen/Oeffnen des Popups

## Loesung

### 1. try/catch um localStorage.setItem (`errorHandlingConfig.ts`)

```typescript
try {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
} catch {
  return {
    ok: false,
    code: 'storage_error',
    message: 'Speichern fehlgeschlagen — localStorage nicht verfuegbar oder voll.',
    indices: [],
  };
}
return { ok: true, addresses: slots };
```

### 2. Type-Extension (`SaveEmailAddressesResult`)

`code`-Union erweitert um `'storage_error'`:
```typescript
code: 'invalid_email' | 'duplicate_email' | 'storage_error';
```

### Caller-Impact

- **`handleSaveEmails`**: Prueft bereits `result.ok` und zeigt `toast.error(result.message)` — funktioniert automatisch mit neuem Error-Code.
- **Auto-Save Debounce**: Ignoriert Return-Value — bei Storage-Error wird still uebersprungen, naechster manueller Save zeigt den Fehler via Toast.

## Geaenderte Dateien

| Datei | Aenderung |
|---|---|
| `src/lib/errorHandlingConfig.ts` | try/catch + `storage_error` Code |
