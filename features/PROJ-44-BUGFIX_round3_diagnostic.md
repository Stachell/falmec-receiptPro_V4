# PROJ-44 BUGFIX Round 3 - IST-Diagnose

Stand: 2026-03-14
Codebase: `falmec-reicptpro_v3`

## 1) Settings-Lock (`SettingsPopup.tsx`)

Datei: `src/components/SettingsPopup.tsx`

### `handleUpdateAddress` (aktuell)

Zeilen 333-339:
```tsx
333:   const handleUpdateAddress = (index: number, value: string) => {
334:     setEmailAddresses(prev => {
335:       const next = [...prev];
336:       next[index] = value;
337:       return next;
338:     });
339:   };
```

### `handleSaveEmails` (aktuell)

Zeilen 340-350:
```tsx
340:   const handleSaveEmails = () => {
341:     const result = saveEmailAddresses(emailAddresses);
342:     if (!result.ok) {
343:       toast.error(result.message);
344:       return;
345:     }
346:     setEmailAddresses(result.addresses);
347:     toast.success('E-Mail-Adressen gespeichert');
348:     setEmailSaved(true);
349:     setTimeout(() => setEmailSaved(false), 2000);
350:   };
```

### JSX der E-Mail-`<Input>`-Felder (aktuell)

Zeilen 1008-1023:
```tsx
1008:                   {Array.from({ length: ERROR_HANDLING_EMAIL_SLOT_COUNT }, (_, i) => (
1009:                     <div key={i} className="flex items-center justify-between gap-4">
1010:                       <Label className="text-sm whitespace-nowrap">Adresse {i + 1}</Label>
1011:                       <Input
1012:                         type="email"
1013:                         value={emailAddresses[i] ?? ''}
1014:                         onChange={(e) => handleUpdateAddress(i, e.target.value)}
1015:                         placeholder="name@firma.de"
1016:                         className={`h-8 flex-1 max-w-[280px] text-sm bg-white ${
1017:                           (emailAddresses[i] && !isValidEmail(emailAddresses[i])) || duplicateEmailIndices.has(i)
1018:                             ? 'border-amber-400'
1019:                             : ''
1020:                         }`}
1021:                       />
1022:                     </div>
1023:                   ))}
```

### Die zwei E-Mail-`useEffect`-Hooks (aktuell)

Zeilen 359-363:
```tsx
359:   useEffect(() => {
360:     if (open) {
361:       setEmailAddresses(getStoredEmailSlots());
362:     }
363:   }, [open]);
```

Zeilen 366-375:
```tsx
366:   useEffect(() => {
367:     if (isInitialMountRef.current) {
368:       isInitialMountRef.current = false;
369:       return;
370:     }
371:     const timer = setTimeout(() => {
372:       saveEmailAddresses(emailAddresses);
373:     }, 500);
374:     return () => clearTimeout(timer);
375:   }, [emailAddresses]);
```

### Diagnose zum Lock

- In den gezeigten `<Input>`-Feldern gibt es **kein** `disabled` und **kein** `readOnly`.
- `emailSaved` wird nur fuer den Button-Status verwendet (`Gespeichert!`) und triggert **keine** Input-Sperre.
- Auf IST-Basis ist in `SettingsPopup.tsx` kein direkter UI-Lock ueber `emailSaved` implementiert.

## 2) Fehlendes Dropdown (`IssueDialog.tsx`)

Datei: `src/components/run-detail/IssueDialog.tsx`

### Exaktes JSX in `<TabsContent value="email">`

Zeilen 400-460:
```tsx
400:           <TabsContent value="email" className="flex-1 flex flex-col overflow-y-auto mt-0 space-y-3 h-full">
401:             <Label className="text-sm font-semibold">E-Mail erzeugen</Label>
402: 
403:             {/* Email recipient selection */}
404:             {storedEmails.length > 0 && (
405:               <div className="space-y-1">
406:                 <Label className="text-xs">Gespeicherte Adressen:</Label>
407:                 <Select value={selectedEmail} onValueChange={setSelectedEmail}>
408:                   <SelectTrigger className="bg-white/40 text-sm h-8">
409:                     <SelectValue placeholder="Empfaenger auswaehlen..." />
410:                   </SelectTrigger>
411:                   <SelectContent className="bg-popover">
412:                     {storedEmails.map(addr => (
413:                       <SelectItem key={addr} value={addr}>{addr}</SelectItem>
414:                     ))}
415:                   </SelectContent>
416:                 </Select>
417:               </div>
418:             )}
419: 
420:             <div className="space-y-1">
421:               <Label className="text-xs">
422:                 {storedEmails.length > 0 ? 'Oder manuelle Eingabe:' : 'E-Mail-Adresse:'}
423:               </Label>
424:               <input
425:                 type="email"
426:                 className="w-full h-8 rounded border border-border bg-white/40 px-2 text-sm"
427:                 placeholder="empfaenger@beispiel.de"
428:                 value={manualEmail}
429:                 onChange={e => setManualEmail(e.target.value)}
430:               />
431:             </div>
432: 
433:             <div className="rounded border border-border bg-white/20 p-2 text-xs space-y-1">
434:               <p className="font-semibold text-muted-foreground">Vorschau:</p>
435:               <p className="font-mono truncate">
436:                 Betreff: [FALMEC-ReceiptPro] {issue.severity === 'error' ? 'Fehler' : issue.severity === 'warning' ? 'Warnung' : 'Info'}: {issue.message}
437:               </p>
438:               <p className="text-muted-foreground">Body: Fehlertyp, Details, betroffene Positionen (max. 10) ...</p>
439:             </div>
440: 
441:             <p className="text-xs text-muted-foreground">
442:               Die E-Mail wird in Ihrem Standard-Mail-Programm geoeffnet. Der vollstaendige Text
443:               wird zusaetzlich in die Zwischenablage kopiert. Der Issue-Status wechselt zu &bdquo;In Klaerung&ldquo;.
444:             </p>
445: 
446:             {isCopied && (
447:               <p className="text-xs text-green-600">Text in Zwischenablage kopiert.</p>
448:             )}
449: 
450:             <div className="mt-auto pt-2">
451:               <Button
452:                 onClick={handleSendMail}
453:                 disabled={!canSendMail}
454:                 className="gap-1 text-xs"
455:               >
456:                 <Mail className="w-3.5 h-3.5" />
457:                 E-Mail erzeugen
458:               </Button>
459:             </div>
460:           </TabsContent>
```

### State fuer E-Mail in derselben Datei

Zeilen 124-125:
```tsx
124:   const [selectedEmail, setSelectedEmail] = useState('');
125:   const [manualEmail, setManualEmail] = useState('');
```

Zusatz-IST:
- Hier ist aktuell **kein** `<Input>`-Component genutzt, sondern ein natives `<input>`.
- Das Dropdown (`<Select>`) wird nur gerendert, wenn `storedEmails.length > 0`.

## 3) Platzende linke Leiste (`IssueDialog.tsx`)

Datei: `src/components/run-detail/IssueDialog.tsx`

### Genaue Klassen des `<TabsList>`-Wrappers

Zeilen 207-210:
```tsx
207:           <TabsList
208:             className="flex flex-col h-auto items-start justify-start gap-0.5 p-1 w-44 shrink-0"
209:             style={{ backgroundColor: '#c9c3b6', borderRadius: '0.5rem' }}
210:           >
```

IST-Hinweis:
- Der beige Hintergrund liegt hier nicht in Tailwind-Klassen, sondern inline per `style`.
