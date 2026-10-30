# Klarna → BuchhaltungsButler Konverter

[![CI](https://github.com/cem-rnd1/klarna-buchhaltungsbutler-konverter/actions/workflows/ci.yml/badge.svg)](https://github.com/cem-rnd1/klarna-buchhaltungsbutler-konverter/actions/workflows/ci.yml)

**▶ Live-Version: [cem-rnd1.github.io/klarna-buchhaltungsbutler-konverter](https://cem-rnd1.github.io/klarna-buchhaltungsbutler-konverter/)**

> **English summary:** A free, browser-only tool that converts Klarna settlement reports (CSV)
> into bank-statement CSVs ready for import into the German accounting software
> BuchhaltungsButler, replacing a manual spreadsheet process. Everything runs client-side —
> no server, no uploads, no tracking — and every payout is checked to balance to exactly 0.00 €
> before export.

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
- Umsatzsteuer auf Klarna-Gebühren (`total_tax_amount`): Steuerbetrag wird automatisch den
  Gebühren zugerechnet, mit deutlichem Hinweis zur Verbuchung.
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
und deployt `main` automatisch nach GitHub Pages.

## Lizenz

[MIT](LICENSE)
