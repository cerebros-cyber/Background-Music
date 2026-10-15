# NGG Zeiterfassung

Web-App (PWA) für Lehrkräfte zum Erfassen der Arbeitszeit auf dem Handy.
Adresse nach dem Veröffentlichen: **https://cerebros-cyber.github.io/zeiterfassung/**

## Funktionen

- **Timer**: Label antippen, „Jetzt starten“. Beginn und Ende folgen der Uhr, lassen sich aber mit −15 / −5 / +5 oder direkt verstellen („Um 07:40 starten“). Der Beginn eines laufenden Timers lässt sich nachträglich ändern.
- **Zeiten nachtragen**: Datum, Beginn, Ende (oder Dauer per Schnellwahl), Label, Notiz.
- **Faktor**: Jede Zeit hat einen Haken „Faktor anrechnen“ (standardmäßig aus). Ist er gesetzt, zählt die Zeit × 1,6 (Wert unter „Mehr“ einstellbar). Auch für Stunden im Stundenplan einstellbar.
- **Stundenplan**: feste Stunden per Stundenraster oder freien Zeiten, optional mit Gültigkeit (z. B. Halbjahr). Automatisch bis heute oder für einen Zeitraum eintragen. Ferien (openholidaysapi.org), Feiertage (lokal berechnet) und eigene freie Tage werden übersprungen. Einzeln gelöschte Stunden kommen nicht wieder.
- **Labels**: Unterricht, Vertretung, Unterrichtsvor- und Nachbereitung, Korrekturen, Exkursionen – plus eigene mit Farbe.
- **Auswertung**: Woche, Monat, Schuljahr oder freier Zeitraum, Labels frei wählbar; Summe, Durchschnitte, Diagramm, Aufteilung nach Label, Faktor-Anteil, Unterrichtsstunden à 45 min; CSV-Export.
- **Speicher**: lokal im Browser, optional **Abgleich über OneDrive** (Datei `Apps/<App-Name>/zeiterfassung.json`). Zusätzlich Sicherung als Datei (z. B. in iCloud Drive).

## Auf dem Handy installieren

**iPhone / iPad (Safari):** Adresse öffnen → Teilen-Symbol (Quadrat mit Pfeil) → „Zum Home-Bildschirm“ → „Hinzufügen“.

**Android (Chrome):** Adresse öffnen → Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

## OneDrive einrichten (einmalig)

Die App braucht eine kostenlose App-Registrierung bei Microsoft:

1. Unter https://entra.microsoft.com (oder https://portal.azure.com) mit dem Microsoft-Konto anmelden → **App-Registrierungen** → **Neue Registrierung**.
2. Name: z. B. `NGG Zeiterfassung`. Kontotypen: **„Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten“**.
3. Umleitungs-URI: Plattform **„Single-Page-Anwendung (SPA)“**, Adresse `https://cerebros-cyber.github.io/zeiterfassung/`.
4. **Registrieren** → die **Anwendungs-ID (Client-ID)** kopieren.
5. Die ID in `index.html` bei `ONEDRIVE_CLIENT_ID` eintragen – oder in der App unter „Mehr → Speicherort & Abgleich → Erweitert“.

## Veröffentlichen

GitHub → Settings → Pages → Source: **GitHub Actions**. Jeder Push auf `main` veröffentlicht die App.
Bei Änderungen an Dateien `VERSION` in `sw.js` erhöhen.
