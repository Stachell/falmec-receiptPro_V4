# ORDER Mapper – Details und Lösungsgrundlage

**Datum:** 26.02.2026  
**Projekt:** falmec-reicptpro_v3  
**Dokument:** ORDER.MAPPER-Details_NEW_26022026.md

## 1) Formal überarbeitete Anforderungsbeschreibung

Im Bereich **Sidebar-Footer > Einstellungen > Bestellung mappen** betrifft die Anpassung den Abschnitt:

**„Custom Override aktiv – Aliaslisten fuer geaenderte Excel-/CSV-Strukturen manuell anpassen.“**

Der aktuelle Aufbau mit Schieberegler (Toggle) und bedingt sichtbarem Button **„Anpassen“** ist funktional unzureichend, da manuell eingetragene Werte nach einem Refresh nicht konsistent erhalten bleiben und erneut eingepflegt werden müssen.

### Gewünschtes Zielbild

1. Der Schieberegler **„Custom Override aktiv“** soll entfernt werden.
2. Der Button **„Anpassen“** soll dauerhaft sichtbar sein.
3. Die Zeile soll visuell klar strukturiert sein:
   - linksbündig Kurzbeschreibung, z. B.  
     **„Schlagwortsuche (Header-Feld) anpassen:“**
   - rechtsbündig Button **„Anpassen“**.
4. Bei Klick auf **„Anpassen“** soll die bestehende Eingabemaske (Popup) wie bisher geöffnet werden.
5. Beim Öffnen des Popups sollen immer die **fest hinterlegten bzw. aktuell gespeicherten Werte** angezeigt werden.
6. Mit **„Speichern“** sollen diese Werte verbindlich überschrieben und refresh-konsistent erhalten bleiben.
7. Zusätzlich soll ein Button **„Standardwerte einfügen“** ergänzt werden.
8. Dazu ist ein klarer Warnhinweis erforderlich:  
   **„Achtung: Aktueller Inhalt wird überschrieben.“**
9. Bei Klick auf **„Standardwerte einfügen“** sollen die aktuell systemseitig hinterlegten Standardwerte als Reset-Funktion eingetragen werden.

---

## 2) Technischer Bericht zur aktuellen Struktur (Ist-Analyse)

## 2.1 UI-Struktur in den Einstellungen

- Im Tab **Bestellung mappen** wird aktuell ein Toggle **„Custom Override aktiv“** angezeigt.
- Nur wenn dieser aktiv ist, erscheint der Button **„Anpassen“**.

Referenz:
- `src/components/SettingsPopup.tsx:788`
- `src/components/SettingsPopup.tsx:801`

## 2.2 Aktuelle Toggle-Logik

- Aktivieren (`true`): Erzeugt bei Bedarf `orderParserProfileOverrides` auf Basis des effektiven Profils.
- Deaktivieren (`false`): Setzt `orderParserProfileOverrides` auf `undefined`.

Referenz:
- `src/components/SettingsPopup.tsx:345`
- `src/components/SettingsPopup.tsx:363`

## 2.3 Override-Modal (Popup) für Step 4

- Das Popup lädt bei `stepNo === 4`:
  - Basiswerte aus `orderParserProfile.aliases` (effektives Profil)
  - Overlay aus `orderParserOverrides.aliases`
  - Regex-Werte aus `orderParserOverrides`
- Speichern schreibt zurück nach `globalConfig.orderParserProfileOverrides`.

Referenz:
- `src/components/OverrideEditorModal.tsx:144`
- `src/components/OverrideEditorModal.tsx:211`
- `src/components/SettingsPopup.tsx:382`

## 2.4 Warum Werte nach Refresh verloren gehen

- `globalConfig` ist aktuell nur im zustand-Store im Speicher gehalten.
- Es gibt keine Persistenz dieser Einstellungen über Reload hinweg.
- Beim Refresh wird `globalConfig` aus Defaultwerten neu initialisiert.

Referenz:
- `src/store/runStore.ts:510`
- `src/store/runStore.ts:560`

## 2.5 Relevanz für die Fachlogik (Order Parsing / Mapping)

- Die Mapping-/Parser-Logik nutzt Overrides korrekt, **wenn sie vorhanden sind**.
- Übergabe erfolgt über `run.config` bzw. `globalConfig` an `parseOrderFile(...)`.

Referenz:
- `src/store/runStore.ts:1463`
- `src/store/runStore.ts:1466`
- `src/services/matching/orderParser.ts:247`

---

## 3) Risiko- und Auswirkungsbewertung

1. **Niedriges Risiko in der Parsing-Engine**, sofern nur UI + Persistenz angepasst werden.
2. **Hauptursache des Problems ist fehlende Persistenz**, nicht die Parserlogik.
3. **Toggle-Entfernung ist fachlich vertretbar**, wenn weiterhin mit vorhandenen/Default-Werten gearbeitet wird.
4. **Reset-Funktion mit Standardwerten** ist sicher, wenn sie auf dasselbe Defaultprofil referenziert wie bisher.

---

## 4) Lösungsansatz (soll als Umsetzungsbasis dienen)

## 4.1 UI-Anpassung

- Entfernen des Schalters **„Custom Override aktiv“** im Tab „Bestellung mappen“.
- Ersetzen durch dauerhafte Aktionszeile:
  - Links: **„Schlagwortsuche (Header-Feld) anpassen:“**
  - Rechts: Button **„Anpassen“** (immer sichtbar).

## 4.2 Modal-Verhalten

- Der bestehende `OverrideEditorModal` für Step 4 bleibt erhalten.
- Beim Öffnen immer Felder mit:
  - persistiertem Override-Wert (falls vorhanden), sonst
  - den hinterlegten Standardwerten des aktiven Profils.
- **Speichern** überschreibt den persistierten Wert verbindlich.

## 4.3 Persistenz für Refresh-Konsistenz

- Persistieren mindestens folgender Konfigurationswerte in localStorage:
  - `activeOrderParserProfileId`
  - `orderParserProfileOverrides`
- Beim App-Start Hydration dieser Werte in `globalConfig`.

## 4.4 Reset-Funktion

- Ergänzung im Modal um Button **„Standardwerte einfügen“**.
- Warnhinweis direkt sichtbar:  
  **„Achtung: Aktueller Inhalt wird überschrieben.“**
- Klick setzt Eingabefelder auf die hinterlegten Standardwerte zurück (noch ohne sofortiges Speichern).
- Persistenz erfolgt weiterhin explizit über **„Speichern“**.

---

## 5) Hinweise zur Codehygiene

In `SettingsPopup.tsx` existiert nicht mehr genutzter Alt-Code aus der früheren Inline-Override-Variante (`ORDER_ALIAS_INPUTS`, `updateOrderParserAliasOverride`, CSV-Helfer). Dieser sollte im Zuge der Umsetzung bereinigt werden.

Referenz:
- `src/components/SettingsPopup.tsx:109`
- `src/components/SettingsPopup.tsx:328`

---

## 6) Fazit

Die gewünschte Anpassung ist technisch sauber umsetzbar und kann ohne Gefährdung der bestehenden Order-Mapping-Funktionalität erfolgen, wenn die Persistenz von `orderParserProfileOverrides` ergänzt wird. Der größte Mehrwert entsteht durch die dauerhaft sichtbare Bedienlogik, konsistente Werte nach Refresh sowie eine explizite Reset-Möglichkeit auf Standardwerte.
