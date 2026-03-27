Befund

Die Bearbeitungsmoeglichkeit fuer Preisabweichung im Pop-up ist bereits eingebaut, aber sie wird nur unter einer harten Bedingung gerendert. In IssueDialog.tsx (line 534) erscheint der Block Preis korrigieren nur, wenn issue.type === 'price-mismatch' und currentRun.isExpanded === true sind. isExpanded wird erst nach der Expansion in Step 4 gesetzt, siehe runStore.ts (line 3217). Wenn du das Wahlmenue im Dialog nicht siehst, ist das sehr wahrscheinlich genau der Grund: Der Run ist noch nicht im expandierten Zustand.

Die eigentliche Preis-Auswahl ist technisch vorhanden und entspricht dem gewuenschten Muster. In PriceCell.tsx (line 138) oeffnet die PriceCell ein Popover mit Rechnungspreis, Sage-Preis (ERP) und Manuell eintragen. Der IssueDialog verwendet also bereits dieselbe Preis-Komponente wie die Tabellen, nur eben hinter dieser isExpanded-Schranke.

Workflow-Konsistenz

Hier ist die Verdrahtung nur teilweise konsistent. Im IssueDialog wird bei Preisabweichungen die PriceCell an setManualPriceByPosition(...) gebunden, siehe IssueDialog.tsx (line 552). Dasselbe Muster nutzt auch das Fehler-Center, siehe IssuesCenter.tsx (line 204). Diese Bulk-Action schreibt den Preis fuer alle expandierten Zeilen einer Position und triggert danach refreshIssues(runId), siehe runStore.ts (line 2761) und runStore.ts (line 2806). Dadurch werden Preisfehler dort sauber auto-resolved.

Die Tabellenpfade laufen aber anders: In InvoicePreview.tsx (line 246) und ItemsTable.tsx (line 193) wird setManualPrice(lineId, price) verwendet. Diese Action aktualisiert zwar Zeile und Preis-Statistiken, ruft aber kein refreshIssues() auf, siehe runStore.ts (line 2721). Das ist die eigentliche Inkonsistenz: Dialog/Fehler-Center und Tabellen benutzen nicht denselben Abschluss-Workflow fuer die Fehlerauflösung.

Kurzfazit

Die Funktion im Pop-up fehlt also nicht komplett, sondern ist aktuell nur nach Step-4-Expansion sichtbar. Gleichzeitig sind die Preis-Workflows nicht voll vereinheitlicht, weil IssueDialog/IssuesCenter den Bulk-Pfad mit Issue-Refresh nutzen, waehrend RE-Positionen/Artikelliste ueber einen Einzelzeilen-Pfad ohne direkten Issue-Refresh gehen. Ich habe nichts geaendert, nur die IST-Lage geprueft.

Wenn du willst, setze ich als naechsten Schritt die Preis-Bearbeitung im IssueDialog so um, dass sie auch vor isExpanded verfuegbar ist.
Ich kann danach den Preis-Workflow auf einen gemeinsamen Store-Pfad vereinheitlichen, damit Dialog, Fehler-Center und Tabellen identisch reagieren.

