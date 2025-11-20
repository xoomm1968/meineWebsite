# Copilot Instructions for Hörbuch Studio Pro

## Überblick
Dieses Projekt ist eine Single-File-Webanwendung (`HHHoerbuch Prox20 Kkopie.html`) für die Erstellung von Hörbüchern mit mehreren Stimmen. Die Anwendung ist vollständig in einer HTML-Datei implementiert und nutzt moderne Webtechnologien (Tailwind CSS, SortableJS, Google Fonts) sowie verschiedene KI-APIs (OpenAI, Gemini, ElevenLabs, Polly) für Text-zu-Sprache und Textgenerierung.

## Architektur & Hauptkomponenten
- **UI/UX**: Komplett in HTML/CSS/JS, mit Tailwind für Styling und SortableJS für Drag & Drop.
- **Abschnitte**: Sprachwahl, API-Auswahl, Schnell-Vorlagen, Charaktere & Stimmen, Skript-Editor, Kostenrechner.
- **Datenfluss**: Nutzer wählt Sprache, API und Vorlage, definiert Charaktere und Stimmen, fügt Skript ein und startet die Umwandlung in Audio.
- **API-Integration**: Auswahl und Wechsel zwischen mehreren KI-Plattformen über Dropdown. API-spezifische Hinweise und Kosten werden dynamisch angezeigt.
- **Stimmenverwaltung**: Charaktere und Stimmen werden dynamisch hinzugefügt, sortiert und gelöscht. Stimmenvorschau für OpenAI-Stimmen direkt im UI.
- **Kostenkalkulation**: Echtzeit-Berechnung der Kosten und Dauer für verschiedene APIs und Projektgrößen.

## Entwickler-Workflows
- **Entwicklung**: Datei lokal öffnen, Änderungen speichern und im Browser (z.B. mit Live Server) neu laden.
- **Debugging**: Browser-DevTools verwenden. Keine Build- oder Test-Tools notwendig.
- **Styling**: Tailwind-Klassen direkt im HTML verwenden. Zusätzliche Styles im `<style>`-Block.
- **Internationalisierung**: Textelemente mit `data-i18n`-Attribut für spätere Übersetzbarkeit markieren.

## Konventionen & Besonderheiten
- **Single-File-Ansatz**: Alle Logik, Styles und Markup befinden sich in einer Datei. Externe Abhängigkeiten werden per CDN eingebunden.
- **Modularisierung**: UI-Abschnitte sind als "collapsible sections" mit IDs strukturiert (z.B. `section-lang`, `section-api`).
- **Skript-Format**: Skripteingabe im Format `Person: Text...` (wird für die Zuordnung von Stimmen verwendet).
- **Dynamische UI**: Viele UI-Elemente werden per JS dynamisch erzeugt und aktualisiert (z.B. Charakterlisten, Kosten, Vorschau).
- **Keine Backend-Logik**: Alle Funktionen laufen clientseitig, API-Keys und Endpunkte müssen ggf. im Code angepasst werden.

## Beispiele & Einstiegspunkte
- **Stimmen-Logik**: Suche nach `voice-card` oder `playVoiceSample` für die Stimmenvorschau.
- **API-Auswahl**: Suche nach `api-select` für die Integration und Umschaltung der KI-Plattformen.
- **Kostenrechner**: Suche nach `cost-estimate` oder `cost-calculator-modal` für Preisberechnung und UI.
- **Charakterverwaltung**: Suche nach `speakers-container` und zugehörigen Buttons für das Hinzufügen/Löschen von Charakteren.

## Hinweise für KI-Agenten
- Halte dich an den Single-File-Ansatz, wenn du neue Features hinzufügst.
- Nutze bestehende UI- und JS-Muster für neue Abschnitte oder Funktionen.
- Achte auf die Konsistenz der IDs und Klassen für dynamische Updates.
- Berücksichtige die Internationalisierung (`data-i18n`).
- Dokumentiere größere Änderungen im Kopf der HTML-Datei als Kommentar.
