# Product Requirements Document: Falmec ReceiptPro

## Vision

Falmec ReceiptPro ist eine lokale Desktop-Web-Anwendung fuer den strukturierten Wareneingang von Falmec-Lieferungen. Sie ersetzt den bisherigen manuellen Prozess (PDF-Rechnung lesen, Positionen in Excel abgleichen, Sage100-Buchung haendisch anlegen) durch einen gefuehrten Workflow: PDF hochladen, automatisch parsen, mit offenen Bestellungen abgleichen, Probleme loesen, Lagerplaetze zuweisen und einen fertigen Sage100-XML-Import erzeugen.

## Target Users

| Rolle | Beduerfnisse | Pain Points |
| :--- | :--- | :--- |
| **Lager / Wareneingang** | Lieferung annehmen, Positionen pruefen, Lagerplaetze zuweisen, Einlagerung dokumentieren | Manuelles Abtippen von Rechnungspositionen, fehleranfaellige Zuordnung, kein Audit-Trail |
| **Einkauf / Backoffice** | Rechnungspruefung, Preisabgleich, Bestellzuordnung, Sage100-Buchung vorbereiten | Zeitaufwaendiger Abgleich zwischen PDF-Rechnung, offenen Bestellungen und Artikelstamm |

**Hinweis:** Kein Login-System noetig. Der Windows-Benutzername wird automatisch im Log erfasst, damit nachvollziehbar ist, wer einen Run durchgefuehrt hat.

## Core Features (Roadmap)

| Prio | ID | Feature | Status | Beschreibung |
| :--- | :--- | :--- | :--- | :--- |
| P0 | PROJ-0 | Base Setup & Onboarding | Done | Vite/React/TS Grundgeruest, shadcn/ui, Projektstruktur |
| P0 | PROJ-1 | Dashboard & Run Archive | In Progress | Dashboard-Tabelle mit Status, Issues, Downloads, Archiv-Dialog, Run-Log-Zugang |
| P0 | PROJ-2 | New Run Intake & File Upload | In Progress | Upload der Quelldateien (Rechnung/offene Bestellungen/Serienliste/Artikelstamm), Run starten |
| P0 | PROJ-3 | Run Detail Workflow Cockpit | In Progress | Stepper, KPIs, Tabs (Details, Rechnungsvorschau, Positionen, Issues, Lager, Export) |
| P0 | PROJ-4 | Invoice PDF Parsing Engine | In Progress | TypeScript PDF-Parser mit pdfjs, Warning-Modell, optionaler devlogic-API-Fallback |
| P0 | PROJ-5 | Issue Management & Resolution | In Progress | Filtern, Loesen und CSV-Export von Issues mit blocking/warning Severity |
| P0 | PROJ-6 | Warehouse Location Assignment | In Progress | Globale und positionsbezogene Lagerplatz-Zuweisung mit Validierung |
| P0 | PROJ-7 | Export Generation (XML/CSV/JSON) | In Progress | XML-Vorschau/Export plus CSV/JSON-Download fuer Sage100-Import |
| P0 | PROJ-8 | Logging, Archiving, and Snapshots | In Progress | Run-/System-Logs, Archiv-Modell, Snapshot-Generierung, Datei-Download |
| P0 | PROJ-9 | Local Persistence & Filesystem | In Progress | localStorage + IndexedDB, File System Access API fuer lokales Arbeitsverzeichnis |
| P1 | PROJ-10 | QA Baseline (Unit Tests) | In Progress | Vitest-Baseline mit Parser-/Config-/Order-Tracker-Tests |
| P1 | PROJ-11 | Data-Matching-Update | Open | Neue Feldstruktur, Bestellparser mit Matching-/Fallback-Logik, Export-Mapping |
| P1 | PROJ-12 | Advanced Logging & File-System Brain | In Progress | Hybride Logging-Architektur: Run-Logfile, Home-Logfile, Archivierungspaket |
| P1 | PROJ-13 | Log-Toolbar Export & Follow-Redesign | Done | Export-Buttons und Follow-Mode fuer Log-Toolbar |
| P1 | PROJ-14 | Parser-Modularisierung & UI-Bereinigung | In Progress | Modulare Parser-Architektur (V1/V2/V3), Settings-Popup, Parser-Dropdown, Umlaut-Korrektur |
| P1 | PROJ-28 | Unification of Settings & Workflow Mechanics | Done | Einheitliche Tab-Struktur (A–F), Block-Step-Toggles, OverrideEditorModal, StepDiagnostics-Unifizierung |
| P1 | PROJ-29 | Run-Detail KPI Double-Check Logic & Line 3 Remapping | In Progress | Neue Zeile-3-Inhalte für Kacheln 1,2,4,5 + reaktive Verified-Logik (grüne Kachel `bg-emerald-100/90` + Check-Icon) für alle 5 Kacheln |
| P2 | PROJ-30 | Optische Aufwertung Tab-Reiter-Auswahl | Done | 3D-Relief-Effekt für Tab-Leiste: Bar erhaben, aktiver Tab eingedrückt. Rein CSS. |

## Success Metrics

| Metrik | Ziel | Messmethode |
| :--- | :--- | :--- |
| **Zeitersparnis pro Lieferung** | >= 50% schneller als manueller Prozess | Vergleich Run-Dauer vs. bisheriger manueller Aufwand |
| **Fehlerreduktion** | >= 80% weniger Buchungsfehler | Anzahl Issues vom Typ price-mismatch, serial-mismatch, order-assignment nach Go-Live |
| **Durchsatz** | >= 10 Lieferungen/Tag verarbeitbar | Anzahl abgeschlossener Runs pro Arbeitstag |
| **Parser-Erfolgsrate** | >= 95% der Rechnungen fehlerfrei geparst | Anteil Runs ohne parser-error Issues |

## Constraints

| Bereich | Constraint |
| :--- | :--- |
| **Deployment** | Lokale Einzelplatz-App, laeuft im Browser (Vite dev-server oder statischer Build) |
| **Betriebssystem** | Windows 10/11 (File System Access API erfordert Chromium-Browser) |
| **Backend** | Kein Remote-Backend. Optional lokaler Parser-Service auf localhost:8090 |
| **Datenbank** | Kein Cloud-DB. Persistenz via localStorage + IndexedDB |
| **ERP-Integration** | Sage100 XML-Import-Format (kein direkter API-Zugriff auf Sage) |
| **Team** | Ein-Personen-Entwicklung mit KI-Unterstuetzung |
| **Timeline** | Kein fester Go-Live-Termin, fortlaufende Entwicklung |

## Non-Goals

- **Kein Multi-User / Login-System** -- Einzelplatz-Anwendung ohne Benutzerverwaltung. Windows-Benutzername wird fuer Audit-Trail im Log erfasst.
- **Keine Cloud-Datenbank** -- Keine Supabase, Firebase oder sonstige Remote-Persistenz.
- **Kein direkter Sage100-API-Zugriff** -- Export erfolgt als XML-Datei, Import in Sage ist ein separater manueller Schritt.
- **Keine mobile Nutzung** -- Optimiert fuer Desktop-Browser (min. 1280px Breite).
- **Kein Lieferanten-Portal** -- Keine externe Schnittstelle fuer Falmec oder andere Lieferanten.
