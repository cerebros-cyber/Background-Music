# Zeiterfassung für Lehrkräfte

Web-App (PWA) zum Erfassen der Arbeitszeit auf dem Handy. Alle Daten bleiben im Browser des Geräts.

## Funktionen

- **Timer**: Label antippen, „Jetzt starten“. Beginn und Ende folgen der Uhr, lassen sich aber mit −15 / −5 / +5 oder direkt verstellen („Um 07:40 starten“). Läuft der Timer, kann der Beginn nachträglich geändert werden.
- **Zeiten nachtragen**: Datum, Beginn, Ende (oder Dauer per Schnellwahl), Label, Notiz.
- **Stundenplan**: feste Stunden per Stundenraster (1.–10. Stunde, anpassbar) oder freie Zeiten, optional mit Gültigkeit (z. B. Halbjahr). Einträge automatisch bis heute oder für einen Zeitraum eintragen. Ferien (openholidaysapi.org), Feiertage (lokal berechnet) und eigene freie Tage werden übersprungen. Einzeln gelöschte Stunden kommen nicht wieder.
- **Labels**: Unterricht, Vertretung, Unterrichtsvor- und Nachbereitung, Korrekturen, Exkursionen – plus beliebige eigene, mit Farbe. Labels lassen sich ausblenden.
- **Auswertung**: Woche, Monat, Schuljahr oder freier Zeitraum; Labels frei wählbar; Summe, Durchschnitte, Diagramm, Aufteilung nach Label, Umrechnung in Unterrichtsstunden à 45 min; CSV-Export.
- **Datensicherung**: Sicherung als Datei speichern/teilen oder als Text kopieren und wieder einlesen.

## Installation aufs Handy

Nach dem Veröffentlichen über GitHub Pages die Adresse `…/zeiterfassung/` öffnen und
„Zum Home-Bildschirm“ (iPhone: Teilen-Menü in Safari; Android: Chrome-Menü) wählen.
