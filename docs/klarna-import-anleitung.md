# BuchhaltungsButler: Klarna-Zahlungen per CSV importieren (offizielle Anleitung)

Dies ist die offizielle BuchhaltungsButler-Anleitung für die manuelle Aufbereitung der Klarna-Abrechnungsberichte. Der Converter, der in diesem Projekt gebaut wird, soll genau diese manuelle Excel-Bearbeitung automatisieren. Die Screenshots der Original-Anleitung sind am Ende dieses Dokuments als Text transkribiert.

---

Zahlungen über Klarna können in BuchhaltungsButler mittels einem CSV-Datenimport importiert werden.

## Herangehensweise

Vor dem Import der Klarna Zahlungen in BuchhaltungsButler ist es notwendig, die von Klarna zur Verfügung gestellten Transaktionsberichte und Auszahlungsberichte anzupassen. Ziel der Bearbeitung der Datei ist, dass die fertige CSV-Datei eine Liste der Zahlungen, die angefallene Gebühren und Auszahlungen von Klarna abbildet, ist.

**Wichtige Information:** Mögliche Anpassungen der Exporte oder andere individuelle Einstellungsmöglichkeiten können zu einer abweichenden Ausgangssituation führen. Bei Ratenzahlungen kann es in den Betragsfeldern möglicherweise zu Abweichungen kommen.

## Manuelle Aufbereitung der Klarna Zahlungen

### 1.–4. Individualisierung und Export des Abrechnungsberichtes

Klarna bietet die Möglichkeit, den Abrechnungsbericht zu individualisieren (Händlerportal → Abrechnungen → Berichte konfigurieren). Die Reihenfolge der Spaltenbeschriftungen spielt eine wichtige Rolle. Die genaue Konfiguration steht in der Screenshot-Transkription am Ende.

Export: Abrechnungs-Berichte → Zeitraum filtern → Bericht erstellen → "CSV" in der Spalte "Download".

### 5. Wichtige Informationen zur exportierten Datei

Die exportierte Datei integriert den Auszahlungs- sowie den Transaktionsbericht in einer Datei:

- **Zeilen 1 & 2:** die exportierten Auszahlungen — der "Abrechnungszusammenfassungsbereich" (Zeile 1 = Spaltenüberschriften der Zusammenfassung, Zeile 2 = Werte).
- **Ab Zeile 3:** die einzelnen Zahlungen — die "Transaktionsliste" (Zeile 3 = Spaltenüberschriften der Transaktionsliste, ab Zeile 4 = Daten).

### 6. Text in Spalten

Die CSV ist **semikolon-getrennt**. In Excel wird sie per "Text in Spalten" (Trennzeichen: Semikolon) aufgeteilt.

### 7. Punkt und Komma

Ist bei Klarna der Punkt als Dezimaltrenner eingestellt, muss in der Spalte "amount" der Punkt durch ein Komma ersetzt werden (deutsche Zahlendarstellung). Ist bei Klarna bereits das Komma eingestellt, entfällt dieser Schritt.

### 8. Neue Zeilen anlegen — Auszahlung und Gebühren

**Auszahlungen:** Für jede Auszahlung (Spalte "total_settlement_amount" im Abrechnungszusammenfassungsbereich) muss am Ende der Transaktionsliste eine neue Zeile erstellt werden:

| Spalte | Inhalt |
|---|---|
| type | `Auszahlung` |
| capture_date | Auszahlungsdatum (= "payout_date" aus dem Zusammenfassungsbereich) |
| payment_reference | Zahlungsreferenz (= "payment_reference" aus dem Zusammenfassungsbereich) |
| merchant_reference1 | `Klarna Auszahlung` |
| amount | Wert aus "total_settlement_amount" |
| posting_currency | `EUR` |

Für jede Auszahlung eine eigene Zeile.

**Gebühren:** Für jede zusammengefasste Gebührenzahlung (Spalte "total_fee_amount") ebenso eine neue Zeile:

| Spalte | Inhalt |
|---|---|
| type | `Gebühren` |
| capture_date | Datum der Gebührenerhebung (= "payout_date" aus dem Zusammenfassungsbereich) |
| payment_reference | Zahlungsreferenz (= "payment_reference" aus dem Zusammenfassungsbereich) |
| merchant_reference1 | `Klarna Gebühren` |
| amount | Wert aus "total_fee_amount" |
| posting_currency | `EUR` |

**ACHTUNG — Steuer ohne USt-ID:** Wurde Klarna keine Umsatzsteuer-ID mitgeteilt, enthält der Zusammenfassungsbereich einen Wert für "total_tax_amount" (in Schweden abgeführte Steuern, da Klarna den Händler ohne USt-ID als Privatverkäufer einstuft). In diesem Fall muss der Steuerbetrag zu den gezahlten Gebühren **addiert** und der Gesamtbetrag mit §13b verbucht werden.

### 9. Neue Zeilen anlegen — Kommissionen

**Nur** wenn "total_commission_amount" im Zusammenfassungsbereich einen Wert ungleich 0 enthält (bei 0 die Zeile NICHT anlegen — es käme zu einem Importfehler):

| Spalte | Inhalt |
|---|---|
| type | `Kommissionen` |
| capture_date | Datum der Kommissionszahlung (= "payout_date" aus dem Zusammenfassungsbereich) |
| payment_reference | Zahlungsreferenz (= "payment_reference" aus dem Zusammenfassungsbereich) |
| merchant_reference1 | `Klarna Kommissionen` |
| amount | Wert aus "total_commission_amount" |
| posting_currency | `EUR` |

### 10. Zusammenfassungsbereich löschen

Alle Zeilen des Abrechnungszusammenfassungsbereiches werden gelöscht (in Excel vorher ggf. Formeln durch Werte ersetzen).

### 11. Negative Beträge in einer neuen Spalte "Betrag"

Returns und Reversals sind Zahlungsabgänge und müssen ein negatives Vorzeichen erhalten. Auch Auszahlungen erhalten ein negatives Vorzeichen. Alle anderen Beträge behalten ihr Vorzeichen. In Excel: neue Spalte links neben "amount" mit der Formel

```
=WENN(ODER(B2="REVERSAL";B2="RETURN";B2="Auszahlung");H2*(-1);H2)
```

Die neue Spalte heißt **"Betrag"**.

### 12. Spalten umbenennen

| Original | Neuer Titel |
|---|---|
| payout_date | Datum |
| type | Auftragsart |
| payment_reference | Zahlungsreferenz |
| order_id | Buchungstext |
| merchant_reference1 | Empfänger/Zahlungspflichtiger |
| posting_currency | Währung |

Alle übrigen Spalten (außer den erstellten Spalten "Buchungsdatum" und "Betrag") sind für den Import irrelevant — deren Titel werden **gelöscht** (Spalten ohne Titel werden beim Import nicht verarbeitet).

### 13.–14. Zeilen mit der Auftragsart "FEE" löschen

Alle Zeilen, deren Auftragsart "FEE" ist, werden gelöscht (die Einzelgebühren sind bereits über die Sammelzeile "Gebühren" abgedeckt). Die Kopfzeile darf dabei nicht gelöscht werden.

### 15. Datei speichern und importieren

Als "CSV (Trennzeichen getrennt)" speichern. Die Datei wird in BuchhaltungsButler als Kontoauszug importiert (eigenes Bankkonto "Klarna Payments" in der Kontenverwaltung anlegen; unter "Zahlungen" → Kontextmenü → "Kontoauszug importieren").

---

## Transkription der Screenshots

### Klarna Berichts-Konfiguration — "Berichtpräferenzen und -formatierung"

- ☑ **Negativ-Zeichen verwenden** (negative Beträge werden mit Minus-Zeichen angezeigt)
- ☐ Kunden-MwSt. beinhalten
- ☐ Schwedischer Händler mit Vertrieb im Ausland
- ☐ Deutscher Händler mit Vertrieb im Ausland
- **Datumsformat:** `31.12.1970`
- **Betragsformat:** `100 SEK -> 100,00` (Dezimalstellen durch KOMMA abgetrennt)
- Trennzeichen/Anführungszeichen: Standard (Semikolon-getrennte Datei)

### "Berichtlayout"

- ☑ **Spaltenüberschriften anzeigen**
- ☑ **Abrechnungs-Zusammenfassungs-Bereich miteinbeziehen** (erste zwei Zeilen im Bericht)

### "Abrechnungs-Zusammenfassungs-Bereich" (erste zwei Zeilen) — eingeschlossene Spalten, in dieser Reihenfolge

1. Auszahlungsdatum (payout_date)
2. Gesamter Abrechnungsbetrag (total_settlement_amount)
3. Gesamter Gebührenbetrag (total_fee_amount)
4. Gesamter Provisionsbetrag (total_commission_amount)
5. Gesamter Steuerbetrag (total_tax_amount)
6. Zahlungsreferenz (payment_reference)

Alle anderen Zusammenfassungs-Spalten sind ausgeschlossen (u.a. Gesamter Verkaufsbetrag, Retourenbetrag, Rückbelastungsbetrag, Währungskürzel, Händler ID etc.).

### "Transaktionsliste" (3. Zeile und folgende) — eingeschlossene Spalten, in dieser Reihenfolge

1. Auszahlungsdatum (payout_date)
2. Transaktionstyp (type)
3. Zahlungsreferenz (payment_reference)
4. Händler ID (merchant_id)
5. Bestellnummer 1 (merchant_reference1)
6. Bestellnummer 2 (merchant_reference2)
7. Betrag (amount)
8. Währungskürzel (posting_currency)
9. Erfassungs-ID (capture_id)
10. Händler-Rückerstattungsreferenz
11. Händler-Aktivierungsreferenz

Ausgeschlossen u.a.: Aktivierungsdatum, Verkaufsdatum, Bestell-ID, Detaillierter Transaktionstyp, MwSt.-Spalten.

*Hinweis: Im Beispiel-Screenshot der exportierten Datei erscheinen in der Transaktionsliste zusätzlich Spalten wie capture_date, sale_date, order_id, short_order_id — je nach Konfiguration kann die reale Spaltenstruktur abweichen. Der Converter sollte Spalten anhand ihrer Überschriften erkennen, nicht anhand fester Positionen.*

### Transaktionstypen, die in den Beispieldaten vorkommen

`SALE`, `FEE` (inkl. detaillierter Typen wie PURCHASE_FEE_FIXED, PURCHASE_FEE_PERCENTAGE), `RETURN`, `REVERSAL`, `COMMISSION`

### BuchhaltungsButler CSV-Import — Feldzuweisungen beim Upload

| Spalte in der Datei | Übernehmen als |
|---|---|
| Feld 1: Datum | Buchungsdatum |
| Feld 2: Auftragsart | Auftragsart |
| Feld 3: Zahlungsreferenz | Zahlungsreferenz |
| Feld 4: (ohne Titel) | wird nicht verarbeitet |
| Feld 5: Empfänger/Zahlungspflichtiger | Empfänger/Zahlungspflichtiger |
| Feld 6: (ohne Titel) | wird nicht verarbeitet |
| Feld 7: Betrag | Betrag |
| Feld 8: (ohne Titel) | wird nicht verarbeitet |
| Feld 9: Währung | Währung |

Import-Einstellung: "Starte Import ab Zeile (erste Buchung)": **2**

Pflichtfelder laut Import-Dialog: Buchungsdatum, Empfänger/Zahlungspflichtiger, Betrag.
