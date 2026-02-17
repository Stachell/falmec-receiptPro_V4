# Projektstand falmec-receiptPro_V4 — 16.02.2026

Analyse erstellt von Claude Code auf Basis der Projektdateien, Dokumentationen und DL_ÄNDERUNGEN.

---

## 1. Fehlende Features zur Projektrealisierung

### Steps 2–6: Business-Logik fehlt

Steps 2–6 haben aktuell **keine Business-Logik** — nur UI-Status-Toggles.

| Step | Was fehlt |
|------|-----------|
| **2 – Artikel extrahieren** | Abgleich der geparsten Positionen gegen die hochgeladene Artikelstammliste (Excel). Status-Icons ("match"/"Code-IT"/"fail") |
| **3 – Seriennummern anfügen** | Zuordnung aus der hochgeladenen Seriennummern-Excel zu den Positionen |
| **4 – Preise checken** | Vergleich Rechnungspreis vs. Sage-Preis mit Toleranz-Logik aus `globalConfig` |
| **5 – Bestellungen mappen** | Abgleich mit OpenWE-Excel, PO-Zuordnung pro Position |
| **6 – Export** | XML-Generierung aus angereicherten Daten (UI existiert, Logik fehlt) |

### Offene Punkte aus DL_ÄNDERUNGEN

- **Tab-Reihenfolge und -Umbenennung:** Artikelliste → Positionen → Hauptlagerplatz → Fehler → Details → Protokoll → Export
- **Dynamische Status-Icons pro Artikel:** "folgt" / "match" / "Code-IT" / "fail"
- **Checkbox-Gates** als Freigabe-Prüfung zwischen Steps
- **Details-Popup** pro Artikel mit allen angereicherten Feldern
- **Preis-Dynamik-Feld:** Rechnungspreis + Sage-Preis + Status-Badge
- **KPI-Counter-Logik:** Aktuell teils Mock-Daten
- **Audit-Log:** Zeigt noch Mock-Daten statt echte Einträge
- **Run-Isolation:** Daten sind nicht run-spezifisch isoliert (Parsing-Daten liegen global im Store)

### Zusammenfassung

Step 1 (PDF-Parsing) funktioniert. Für ein vollständiges Produkt fehlen die **Kernlogiken der Steps 2–6** plus die **UI-Anpassungen aus den DL_ÄNDERUNGEN**.

---

## 2. Sicherheitsbestimmungen für lokalen Server-/Client-Betrieb

Da die App **nur lokal im Netzwerk** läuft und keine externe Anbindung hat, entfallen viele klassische Web-Security-Themen. Trotzdem relevant:

### Muss beachtet werden

- **Netzwerk-Segmentierung:** Der Server sollte nur aus dem internen Netzwerk erreichbar sein (Firewall-Regel: kein Zugriff von außen auf den Port)
- **HTTPS auch lokal:** Selbstsigniertes Zertifikat oder internes CA-Zertifikat, damit Daten im LAN nicht im Klartext fliegen — besonders wenn WLAN-Clients zugreifen
- **Windows-Berechtigungen:** Der Ordner mit den Rechnungsdaten sollte nur für den Service-Account lesbar sein (NTFS-ACLs)
- **Input-Validierung:** PDF- und Excel-Dateien können bösartig sein — die Parser sollten Timeouts haben (vorhanden: 30s) und keine Shell-Befehle ausführen
- **XSS-Schutz:** Auch lokal relevant, falls ein Nutzer ein manipuliertes PDF hochlädt, dessen geparster Text Script-Injection enthält. React escaped standardmäßig, aber `dangerouslySetInnerHTML` vermeiden
- **DSGVO/Datenschutz:** Rechnungsdaten sind geschäftskritisch. Zugangsprotokollierung (wer hat wann zugegriffen) ist empfehlenswert — das Audit-Log ist ein guter Ansatz, muss aber mit echten Daten befüllt werden
- **Backup-Strategie:** Da alles lokal liegt — regelmäßige Backups der Datenordner

### Nicht nötig

- OAuth/JWT-Auth-System (optional, wenn nur wenige vertrauenswürdige Nutzer)
- CORS-Konfiguration (kein externer API-Zugriff)
- Rate-Limiting, DDoS-Schutz

---

## 3. Dateisystem vs. Datenbank (z.B. Supabase)

### Empfehlung: Beim Dateisystem bleiben — aber mit Struktur

### Dateisystem ist die bessere Wahl für diesen Fall

| Argument | Begründung |
|----------|------------|
| **Einfachheit** | Keine zusätzliche Infrastruktur nötig. Kein DB-Server, keine Migrations, kein Wartungsaufwand |
| **Transparenz** | Jeder kann die Dateien im Explorer sehen, manuell prüfen, verschieben, backuppen |
| **Performance** | Für das Volumen (einzelne Rechnungen, nicht Millionen) ist Dateisystem-IO schneller als DB-Overhead |
| **Offline/Lokal** | Passt perfekt zum Konzept — keine Netzwerkabhängigkeit |
| **Backup** | Einfaches Kopieren des Ordners reicht — kein DB-Dump nötig |
| **Kein Vendor Lock-in** | Keine Abhängigkeit von einem DB-Anbieter |

### Warum NICHT Supabase

| Argument | Begründung |
|----------|------------|
| **Externe Abhängigkeit** | Supabase ist ein Cloud-Service — widerspricht dem "nur lokal"-Konzept |
| **Overengineering** | Keine Multi-User-Konkurrenz, keine komplexen Queries, keine Relationen die JOINs brauchen |
| **Zusätzliche Komplexität** | Auth, RLS-Policies, Migrations — alles Aufwand ohne Mehrwert |
| **Kosten** | Supabase Free-Tier hat Limits, Pro kostet ~25$/Monat — unnötig |

### Empfohlene Dateisystem-Struktur

```
/falmec-data/
  /runs/
    /Fattura-12345-20260216-143022/
      invoice.pdf
      openwe.xlsx
      serials.xlsx
      masterlist.xlsx
      parsed-result.json      ← Parser-Output
      enriched-data.json      ← Angereicherte Daten (Steps 2-6)
      export.xml              ← Finaler Export
      audit-log.json          ← Protokoll pro Run
      /issues/
        issue-001.json
  /archive/
    /2026-02/
      ...abgeschlossene Runs
  /config/
    global-settings.json
```

**Vorteile dieser Struktur:**

- Run-Isolation (jeder Run hat seinen eigenen Ordner)
- Einfaches Archivieren (Ordner verschieben)
- JSON als "Datenbank" pro Run — leicht lesbar, leicht zu debuggen
- Kein zusätzlicher Service nötig

### Einziger Fall für eine DB

Wenn später hunderte Runs gleichzeitig durchsucht werden sollen (z.B. "zeige alle Rechnungen mit Preis-Abweichung > 5%"), wäre **SQLite** (lokal, serverlos, eine Datei) die richtige Wahl — nicht Supabase. Aber das ist Zukunftsmusik.

---

## Anhang: Aktueller Techstack

| Layer | Technologie |
|-------|-------------|
| Frontend Framework | React 18.3 + TypeScript 5.8 |
| State Management | Zustand 5.0 |
| Routing | React Router 6.30 |
| Styling | Tailwind CSS 3.4 + shadcn/ui |
| Build Tool | Vite 5.4 |
| PDF Processing | pdfjs-dist 5.4 (Browser-basiert) |
| Form Handling | React Hook Form 7.61 + Zod |
| Data Persistence | LocalStorage + IndexedDB |
| Testing | Vitest 3.2 + React Testing Library |
| Charting | Recharts 2.15 |

---

*Erstellt am 16.02.2026 — Claude Code Analyse*
