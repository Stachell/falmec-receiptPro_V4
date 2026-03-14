# Bericht: Run-Detail Fehlerhandling / Fehlermanagement

## Summary
- Verbindliche Grundlage ist die **aktuelle App-Logik**: Step 1 Rechnung, Step 2 Artikel plus Preise, Step 3 Seriennummern, Step 4 Bestellungen, Step 5 Export.
- Der Bericht wird als **Diagnose plus Umsetzungsgrundlage** aufgebaut, nicht als bloße Bestandsliste.
- Primäre Truth-Quellen sind [runStore.ts](c:/0WERKBANK0/falmec-reicptpro_v3/src/store/runStore.ts), [IssuesCenter.tsx](c:/0WERKBANK0/falmec-reicptpro_v3/src/components/run-detail/IssuesCenter.tsx) und [RunDetail.tsx](c:/0WERKBANK0/falmec-reicptpro_v3/src/pages/RunDetail.tsx).
- Bereits vorhandene Feature-/Diagnose-Dokus aus `features` werden als Kontext genutzt, vor allem das bestehende Fehlercenter-/Log-Diagnostic und PROJ-39.

## Berichtsinhalte
- Einleitung mit deinem Original-Prompt als unveränderte Kontextpassage.
- Big-Picture-Abschnitt: Zweck des Fehlercenters im Gesamtworkflow, aktuelle Step-Zuordnung, Trennung zwischen technischem Zustand, fachlichem Zustand und Exportfähigkeit.
- Step-Matrix 1 bis 5 mit je:
  - Zweck des Steps
  - bereits erzeugte Fehlertypen
  - im Code mögliche, aber noch nicht modellierte Fehlerbilder
  - heutige Severity/Status-Logik
  - vorgeschlagene Hard-Fail/Soft-Fail-Klassifizierung
  - sinnvoller Lösungsweg pro Fehlerbild
  - aktuelle Log-Abdeckung
  - konkrete Lücken oder Widersprüche
- Aufgabenkapitel 1 bis 7, jeweils mit IST-Zustand, Bug-/Risiko-Befund, Workflow-Sinnhaftigkeit und präziser Korrekturempfehlung.

## Wichtige Festlegungen für die spätere Behebung
- **Hard-Fail/Soft-Fail** wird im Bericht als **fachliche Schicht** definiert und nicht blind auf die aktuelle `IssueSeverity` projiziert, weil die App intern `error/warning/info` und parallel `ok/soft-fail/failed` nutzt.
- Der geplante Button **„aktualisieren“** im Fehler-Tab darf nur das Fehlercenter **neu aus aktuellem Run-State ableiten**; er darf keine Parser, keinen Import und keine Step-Ausführung erneut starten.
- Der Popup-Workflow wird auf zwei legitime Wege begrenzt:
  - Klärung im Hintergrund per E-Mail
  - bewusste manuelle/fachliche Erzwingung
- „Erledigt“, „in Klärung“ und „wieder aktivieren“ müssen als nachvollziehbare Zustandskette beschrieben werden, ohne bestehende Export- und Guard-Logik zu umgehen.
- Teilweise Fehlerbehebung wird als **Issue-Splitting** geplant: geänderte Zeilen werden separat dokumentiert, der Restfehler bleibt offen.
- KISS-Handschellen:
  - kein globaler Severity-Umbau ohne Not
  - kein neuer komplexer Workflow-State, wenn Substatus auf bestehendem offenen Issue ausreichen
  - keine Dopplung von Lösungswegen zwischen Popup, Tabellen und Kacheln

## Bereits identifizierte Kernbefunde, die im Bericht verbindlich behandelt werden
- Preislogik liegt aktuell fachlich in Step 2, nicht sauber dort, wo dein Prompt sie teilweise verortet.
- Das aktuelle Popup ist funktional nur ein Block-Dialog; es erfüllt die gewünschte Tab-/Pending-/Antwort-/Reopen-Logik nicht.
- Einige Issue-Typen sind vorhanden, aber im UI-/Mail-Mapping unvollständig, z. B. `pool-empty-mismatch` und `supplier-missing`.
- Manuelle Änderungen aktualisieren das Fehlercenter nicht durchgehend konsistent; besonders Preis-/Eigenschaftsänderungen sind kritisch.
- Der Guard `blockStep2OnPriceMismatch` ist derzeit fachlich wirkungsschwach, weil auf `severity === 'error'` geprüft wird, Preisabweichungen aber aktuell als `warning` erzeugt werden.
- Step 5 hat Export-Blocker in der UI, aber kein vollständig angebundenes Issue-Modell im Fehlercenter.
- Logisch wichtige Nutzeraktionen sind nur teilweise im Run-Log und allgemeinen Log sichtbar.

## Test- und Abnahmeplan für die spätere Umsetzung
- Pro Step mindestens ein Positiv-, ein Soft-Fail- und ein Hard-Fail-Szenario.
- Preisänderung, Bestellzuweisung und Lagerortänderung außerhalb des Fehler-Tabs müssen das Fehlercenter nach Refresh korrekt verändern.
- „Senden“ muss sauber zwischen offen, in Klärung, erledigt und reaktiviert unterscheiden.
- Teilweise Fehlerbehebung muss einen Fehler korrekt splitten, ohne Historie zu verlieren.
- Step-5-Blocker müssen im Fehlercenter, Exportpanel und Logsystem konsistent erscheinen.
- Run-Log und allgemeines Log müssen klar getrennt zeigen:
  - Run-interne Schritte und Bearbeitungen im Run-Log
  - Uploads, Einstellungen, Archivierung und systemweite Technikereignisse im allgemeinen Log

## Assumptions
- Die spätere Berichtsausgabe bleibt deutschsprachig und pragmatisch, mit klarer Bug-Priorisierung.
- Der lokale Zielpfad ist `features/Fehlerhandling-Fehlermanagement_diagnostic.md`.
- Weil wir aktuell in Plan Mode sind, wird **noch keine Datei geschrieben**; im nächsten Ausführungsturn wird genau diese Datei erzeugt und mit Prompt plus Bericht befüllt.
