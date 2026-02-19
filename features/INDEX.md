| ID | Feature Name | Status | Description |
| :--- | :--- | :--- | :--- |
| PROJ-0 | Base Setup & Onboarding | Done | Initial import of Lovable codebase with local Vite/React workflow and project scaffolding. |
| PROJ-1 | Dashboard & Run Archive | In Progress | Dashboard table for runs with status, issue count, direct downloads, archive dialog, and run log access. |
| PROJ-2 | New Run Intake & File Upload | In Progress | Upload of required source files (invoice/open orders/serial list/article master) and start of a new processing run. |
| PROJ-3 | Run Detail Workflow Cockpit | In Progress | Stepper, KPIs, tabbed run analysis (details, invoice preview, items, issues, warehouse, export). |
| PROJ-4 | Invoice PDF Parsing Engine | In Progress | TypeScript invoice parser with pdfjs extraction, warning model, and optional devlogic API fallback parser. |
| PROJ-5 | Issue Management & Resolution | In Progress | Filtering, resolving, and CSV export of run issues with blocking vs warning severity handling. |
| PROJ-6 | Warehouse Location Assignment | In Progress | Global and per-line storage-location assignment with validation for missing locations before export. |
| PROJ-7 | Export Generation (XML/CSV/JSON) | In Progress | XML preview/export plus run-level CSV/XML/JSON download actions for downstream ERP import. |
| PROJ-8 | Logging, Archiving, and Snapshots | In Progress | Per-run/system logs, archive folder model, snapshot generation, and file download helpers. |
| PROJ-9 | Local Persistence & Filesystem Integration | In Progress | localStorage + IndexedDB persistence and File System Access API integration for local folder workflow. |
| PROJ-10 | QA Baseline (Unit Tests) | In Progress | Vitest baseline with parser/config/order-tracker tests and jsdom test setup for pdfjs. |
| PROJ-11 | Data-Matching-Update | Open | Neue Feldstruktur (Umbenennung, Checkbox 5-Zustaende, Preis-Konsolidierung), Bestellparser mit Matching-/Fallback-Logik, Invoiceline-Expansion, Export-Mapping 10 Spalten. |
| PROJ-12 | Advanced Logging & File-System Brain | In Progress | Hybride Logging-Architektur: Run-Logfile (tiefes Parser-Tracking), Home-Logfile (globales System-Log mit Rotation), Archivierungs-Paket (gebuendelter Run-Export auf Festplatte), localStorage-Cleanup. Baut auf PROJ-8/PROJ-9 auf. |
| PROJ-13 | Log-Toolbar Export-Buttons & Follow-Redesign | Done | Export-Buttons und Follow-Mode-Redesign fuer die Log-Toolbar-Komponente. |
| PROJ-14 | Parser-Modularisierung & UI-Bereinigung | In Progress | Modulare Parser-Architektur (Modul-Ordner, V1/V2, Import-Funktion), Settings-Popup (ausgelagerte Slider-Controls), Parser-Dropdown, Home-Log/Issue-Center fuer Parser-Events, systemweite Umlaut-Korrektur. Baut auf PROJ-4/PROJ-12 auf. **Phase A+B (UI) erledigt.** |
| PROJ-15 | Run-Detail UI & Logic Fixes | In Progress | Kachel-Label/Zaehler-Fixes, Tab-Umbenennung, Badge-Counter, Popup-Crash-Fix (shadcn Exit-Animation), Details-Tab Cleanup + LINK-Bereich, Toast Race-Condition KISS-Fix. Baut auf PROJ-14 auf. |
| PROJ-16 | ETL-Pipeline & S/N-Verifizierung | In Progress | Modulares Matcher-System (analog ParserRegistry) fuer Step 2 (Cross-Match) und Step 3 (S/N-Extraktion). FalmecMatcher_Master, Schema-Alias-System, S/N-Regex-Pipeline, Matcher-Dropdown + Settings-UI. Baut auf PROJ-14/PROJ-15 auf. |
