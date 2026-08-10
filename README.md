# Klarna → BuchhaltungsButler Konverter

Ein kostenloses, inoffizielles Browser-Tool, das Klarna-Abrechnungsberichte (CSV) in
importfertige CSV-Dateien für BuchhaltungsButler („Kontoauszug importieren“) umwandelt –
und damit die manuelle Excel-Aufbereitung aus der offiziellen Anleitung automatisiert.

**100 % client-seitig:** kein Server, kein Upload, keine Cookies, kein Tracking.
Finanzdaten verlassen den Rechner nicht.

Nicht verbunden mit Klarna oder BuchhaltungsButler. Alle Angaben ohne Gewähr –
Buchungen bitte prüfen.

## Funktionsumfang

- Ein oder mehrere Klarna-Settlement-Reports per Drag & Drop einlesen; alle Auszahlungen
  werden in **eine** Exportdatei zusammengeführt (Duplikate werden erkannt und abgelehnt).
- Spaltenerkennung über Überschriften (inkl. Aliasse), automatische Erkennung von
  Encoding, Dezimaltrennzeichen und Datumsformat.
- FEE-/COMMISSION-Einzelzeilen werden entfernt und durch Sammelzeilen („Gebühren“,
  „Kommissionen“, „Auszahlung“) aus dem Zusammenfassungsbereich ersetzt.
- Optional: Shopify-Bestellexport zusätzlich ablegen – zugeordnete Zeilen zeigen dann
  Kundenname und Bestellnummer statt der Klarna-Zahlungs-ID.
- §13b-Fall (schwedische Steuer ohne USt-ID): Steuerbetrag wird automatisch den Gebühren
  zugerechnet, mit deutlichem Hinweis.
- Sicherheitsnetz: Pro Auszahlung müssen sich alle Zeilen exakt auf 0,00 € saldieren,
  sonst wird der Download blockiert (mit explizitem Override).

Die zugrunde liegende offizielle Anleitung steht in
[docs/klarna-import-anleitung.md](docs/klarna-import-anleitung.md).

## Entwicklung

```bash
npm install
npm run dev      # Dev-Server
npm test         # Vitest (Unit- + Golden-Tests gegen samples/)
npm run build    # Typecheck + Produktions-Build nach dist/
```

Stack: Vite + TypeScript, kein UI-Framework, keine Runtime-Dependencies.
`src/core/` ist reine, DOM-freie Logik und vollständig getestet;
`samples/` enthält synthetische Beispiel-Exporte, die die Struktur echter
Klarna-Reports exakt nachbilden (keine echten Geschäftsdaten).

## Veröffentlichung

GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)) testet jeden Push
und deployt `main` nach GitHub Pages. Nach dem Anlegen des GitHub-Repos:

1. In den Repo-Einstellungen unter **Pages** als Source „GitHub Actions“ wählen.
2. Die Konstante `SOURCE_URL` in [src/main.ts](src/main.ts) auf die Repo-URL setzen.
3. Impressum-Platzhalter in [src/ui/strings.ts](src/ui/strings.ts) ausfüllen.

## Lizenz

[MIT](LICENSE)
