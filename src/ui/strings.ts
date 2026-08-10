// All user-facing German strings, keyed by message code.
// Kept in one module so the copy is reviewable and translatable later.

import { formatCentsEur } from '../core/money.ts';

// ---------------------------------------------------------------------------
// Issue messages (§6.2). One builder per stable issue code.
// ---------------------------------------------------------------------------

export const issueMessages = {
  missing_required_column: (p: { column: string; section: 'summary' | 'transactions' }) =>
    `Pflichtspalte „${p.column}“ fehlt im ${
      p.section === 'summary' ? 'Abrechnungszusammenfassungsbereich' : 'Transaktionsbereich'
    }. Bitte prüfen Sie die Klarna-Berichtskonfiguration (siehe Hilfe unten).`,

  no_transaction_section: () =>
    'Keine Transaktionsliste gefunden. Die Datei muss den Abrechnungszusammenfassungsbereich und die Transaktionsliste enthalten – bitte prüfen Sie die Klarna-Berichtskonfiguration (siehe Hilfe unten).',

  no_payouts: () =>
    'Der Bericht enthält keine Auszahlungszeile im Abrechnungszusammenfassungsbereich.',

  bad_amount: (p: { value: string; line: number }) =>
    `Betrag „${p.value}“ in Zeile ${p.line} konnte nicht gelesen werden.`,

  bad_date: (p: { value: string; line: number }) =>
    `Datum „${p.value}“ in Zeile ${p.line} wird nicht unterstützt (erwartet TT.MM.JJJJ oder JJJJ-MM-TT).`,

  mixed_decimals: () =>
    'Die Datei mischt Punkt- und Komma-Dezimaltrennzeichen – Beträge können nicht sicher gelesen werden.',

  duplicate_payment_reference: (p: { ref: string; firstFile: string; secondFile: string }) =>
    `Auszahlung mit Zahlungsreferenz „${p.ref}“ ist doppelt vorhanden (zuerst in „${p.firstFile}“, erneut in „${p.secondFile}“). Die spätere Auszahlung wird nicht exportiert.`,

  balance_mismatch: (p: { ref: string; diffCents: number }) =>
    `Summenprüfung fehlgeschlagen für Auszahlung „${p.ref}“: Die Zeilen ergeben ${formatCentsEur(
      p.diffCents,
    )} statt 0,00 €. Mögliche Ursachen: falsche Vorzeichen-Einstellung im Klarna-Bericht, fehlende Zeilen oder Abweichungen bei Ratenzahlung.`,

  non_eur_currency: (p: { ref: string; currencies: string }) =>
    `Auszahlung „${p.ref}“ enthält Zeilen in anderer Währung als EUR (${p.currencies}). Beträge werden nicht umgerechnet – bitte prüfen.`,

  positive_fees: (p: { ref: string; amountCents: number }) =>
    `Die Gebührenzeile der Auszahlung „${p.ref}“ ist positiv (${formatCentsEur(
      p.amountCents,
    )}), erwartet wird ein negativer Betrag – bitte prüfen.`,

  positive_commission: (p: { ref: string; amountCents: number }) =>
    `Die Kommissionszeile der Auszahlung „${p.ref}“ ist positiv (${formatCentsEur(
      p.amountCents,
    )}), erwartet wird ein negativer Betrag – bitte prüfen.`,

  orphan_transactions: (p: { ref: string; count: number }) =>
    `${p.count} Transaktionszeile(n) mit Zahlungsreferenz „${p.ref}“ gehören zu keiner Auszahlung im Zusammenfassungsbereich und werden nicht exportiert.`,

  unknown_type: (p: { type: string; lines: string }) =>
    `Unbekannte Auftragsart „${p.type}“ in Zeile(n) ${p.lines} – die Zeilen werden mit unverändertem Vorzeichen übernommen.`,

  missing_optional_column: (p: { column: string; effect: string }) =>
    `Optionale Spalte „${p.column}“ fehlt – ${p.effect}.`,
} as const;

export type IssueCode = keyof typeof issueMessages;

/** Effects for missing optional columns, per column name. */
export const missingColumnEffects: Record<string, string> = {
  order_id: 'der Buchungstext bleibt leer',
  merchant_reference1: 'Empfänger/Zahlungspflichtiger bleibt leer',
  posting_currency: 'als Währung wird EUR angenommen',
  total_commission_amount: 'Kommissionen werden als 0,00 € angenommen',
  total_tax_amount: 'der Steuerbetrag wird als 0,00 € angenommen',
};

// ---------------------------------------------------------------------------
// General UI strings
// ---------------------------------------------------------------------------

export const ui = {
  appTitle: 'Klarna → BuchhaltungsButler Konverter',
  appTagline: 'Ihre Daten bleiben im Browser – kein Upload, kein Server, keine Speicherung.',
  appUnofficial: 'Inoffizielles, kostenloses Tool',
  sourceLink: 'Quellcode auf GitHub',

  dropzoneTitle: 'Klarna-Abrechnungsberichte (CSV) hier ablegen',
  dropzoneHint: 'oder klicken, um Dateien auszuwählen – mehrere Dateien möglich',

  filesHeading: 'Dateien',
  removeFile: 'Entfernen',
  payoutCount: (n: number) => (n === 1 ? '1 Auszahlung' : `${n} Auszahlungen`),

  payoutsHeading: 'Auszahlungen',
  cardPayoutDate: 'Auszahlungsdatum',
  cardReference: 'Zahlungsreferenz',
  cardSettlement: 'Auszahlungsbetrag',
  cardFees: 'Gebühren',
  cardFeesWithTax: 'Gebühren (inkl. Steuer, §13b)',
  cardCommission: 'Kommissionen',
  cardTransactions: 'Transaktionen',
  cardBalance: 'Summenprüfung',
  balanceOk: '✓ 0,00 €',
  balanceFail: (diff: string) => `✗ Differenz ${diff}`,

  taxNoticeTitle: 'Hinweis: Schwedische Steuer ohne USt-ID (§13b UStG)',
  taxNotice: (refs: string) =>
    `Dieser Bericht enthält von Klarna einbehaltene schwedische Steuern (total_tax_amount), weil Klarna keine USt-ID hinterlegt hat (betroffen: ${refs}). Der Steuerbetrag wurde den Gebühren zugerechnet. Die Gebührenzeile muss in der Buchhaltung nach §13b UStG verbucht werden. Tipp: Hinterlegen Sie Ihre USt-ID im Klarna-Händlerportal, damit dieser Abzug künftig entfällt.`,

  warningsHeading: 'Warnungen',
  errorsHeading: 'Fehler',
  infosHeading: 'Hinweise',
  overrideLabel: 'Ich habe die Warnungen geprüft – trotzdem exportieren',

  previewHeading: 'Vorschau der Exportdatei',
  previewMore: (n: number) => `… ${n} weitere Zeilen (im Export enthalten)`,
  previewColumns: [
    'Datum',
    'Auftragsart',
    'Zahlungsreferenz',
    'Buchungstext',
    'Empfänger/Zahlungspflichtiger',
    'Betrag',
    'Währung',
  ],

  downloadButton: 'CSV herunterladen',
  resetButton: 'Zurücksetzen',

  importHintTitle: 'So importieren Sie die Datei in BuchhaltungsButler',

  helpHeading: 'Hilfe',
  footerDisclaimer:
    'Inoffizielles, kostenloses Tool. Nicht verbunden mit Klarna oder BuchhaltungsButler. Alle Angaben ohne Gewähr – Buchungen bitte prüfen.',
  footerImpressum: 'Impressum',
  footerDatenschutz: 'Datenschutz',
  backToApp: '← Zurück zum Konverter',
} as const;

// ---------------------------------------------------------------------------
// Long-form help content (static German HTML blocks)
// ---------------------------------------------------------------------------

export const helpHtml = {
  klarnaConfig: `
    <h3 id="hilfe-klarna-konfiguration">Klarna-Bericht richtig konfigurieren</h3>
    <p>
      Dieses Tool verarbeitet den <strong>Abrechnungsbericht</strong> (Settlement Report) aus dem
      Klarna-Händlerportal, der Zusammenfassungsbereich und Transaktionsliste in einer Datei
      kombiniert. So richten Sie ihn ein (einmalig):
    </p>
    <ol>
      <li>Im Klarna-Händlerportal: <strong>Abrechnungen&nbsp;→&nbsp;Berichte konfigurieren</strong>.</li>
      <li>
        Unter „Berichtpräferenzen und -formatierung“:
        <ul>
          <li><strong>„Negativ-Zeichen verwenden“ aktivieren</strong> – negative Beträge erhalten ein Minus-Zeichen.</li>
          <li>Datumsformat <strong>31.12.1970</strong> (TT.MM.JJJJ) wählen. Das Klarna-Standardformat JJJJ-MM-TT wird ebenfalls erkannt.</li>
          <li>Betragsformat mit <strong>Komma</strong> als Dezimaltrenner („100 SEK → 100,00“). Punkt-Format wird ebenfalls erkannt.</li>
          <li>Trennzeichen: Standard (Semikolon-getrennte Datei).</li>
        </ul>
      </li>
      <li>
        Unter „Berichtlayout“:
        <ul>
          <li><strong>„Spaltenüberschriften anzeigen“ aktivieren</strong> – ohne Überschriften kann das Tool die Spalten nicht zuordnen.</li>
          <li><strong>„Abrechnungs-Zusammenfassungs-Bereich miteinbeziehen“ aktivieren</strong> – die ersten Zeilen des Berichts.</li>
        </ul>
      </li>
      <li>
        Spalten des <strong>Zusammenfassungsbereichs</strong> (Pflicht):
        <code>payout_date</code>, <code>total_settlement_amount</code>, <code>total_fee_amount</code>,
        <code>payment_reference</code>; empfohlen zusätzlich <code>total_commission_amount</code> und
        <code>total_tax_amount</code>.
      </li>
      <li>
        Spalten der <strong>Transaktionsliste</strong> (Pflicht):
        <code>payout_date</code>, <code>type</code>, <code>payment_reference</code>, <code>amount</code>;
        empfohlen zusätzlich <code>order_id</code> (wird zum Buchungstext),
        <code>merchant_reference1</code> (wird zu Empfänger/Zahlungspflichtiger) und
        <code>posting_currency</code>. Die Reihenfolge der Spalten ist egal – die Zuordnung erfolgt
        über die Überschriften; zusätzliche Spalten werden ignoriert.
      </li>
      <li>
        Export: <strong>Abrechnungs-Berichte</strong> → Zeitraum wählen → Bericht erstellen →
        <strong>CSV</strong> in der Spalte „Download“.
      </li>
    </ol>`,

  importGuide: `
    <ol>
      <li>
        Einmalig: In der <strong>Kontenverwaltung</strong> ein eigenes Bankkonto
        <strong>„Klarna Payments“</strong> anlegen.
      </li>
      <li>
        Unter <strong>Zahlungen</strong> → Kontextmenü → <strong>„Kontoauszug importieren“</strong>
        die heruntergeladene Datei hochladen.
      </li>
      <li>
        Feldzuweisung beim ersten Import (BuchhaltungsButler merkt sie sich danach) – die Zuordnung
        ist 1:1 anhand der Spaltentitel:
        <ul>
          <li>Datum → Buchungsdatum</li>
          <li>Auftragsart → Auftragsart</li>
          <li>Zahlungsreferenz → Zahlungsreferenz</li>
          <li>Buchungstext → Buchungstext</li>
          <li>Empfänger/Zahlungspflichtiger → Empfänger/Zahlungspflichtiger</li>
          <li>Betrag → Betrag</li>
          <li>Währung → Währung</li>
        </ul>
      </li>
      <li>„Starte Import ab Zeile (erste Buchung)“: <strong>2</strong>.</li>
    </ol>
    <p>
      Hinweis: Wer bisher das alte manuelle 9-Spalten-Layout importiert hat, muss die Feldzuweisung
      einmalig neu vornehmen (siehe FAQ).
    </p>`,

  faq: `
    <h3 id="faq">FAQ</h3>
    <details>
      <summary>Was bedeutet der §13b-Hinweis (schwedische Steuer)?</summary>
      <p>
        Wenn bei Klarna keine USt-ID hinterlegt ist, behandelt Klarna den Händler als Privatverkäufer
        und führt schwedische Steuern ab (Spalte <code>total_tax_amount</code>). Dieses Tool rechnet
        den Steuerbetrag automatisch den Gebühren zu – die Gebührenzeile muss dann in der Buchhaltung
        nach <strong>§13b UStG</strong> verbucht werden. Tipp: USt-ID im Klarna-Händlerportal
        hinterlegen, dann entfällt der Abzug künftig.
      </p>
    </details>
    <details>
      <summary>Kann ich mehrere Dateien auf einmal umwandeln?</summary>
      <p>
        Ja. Alle gültigen Auszahlungen aus allen Dateien werden in <strong>eine</strong> Exportdatei
        zusammengeführt, sortiert nach Auszahlungsdatum. Doppelte Auszahlungen (gleiche
        Zahlungsreferenz, z.&nbsp;B. dieselbe Datei zweimal hinzugefügt) werden erkannt und
        abgelehnt.
      </p>
    </details>
    <details>
      <summary>Warum ist der Download manchmal blockiert?</summary>
      <p>
        Vor dem Export prüft das Tool jede Auszahlung: Alle Zeilen (Zahlungen, Gebühren,
        Kommissionen, Auszahlung) müssen sich exakt auf 0,00&nbsp;€ saldieren. Schlägt diese
        Summenprüfung fehl oder enthält der Bericht Fremdwährungen bzw. unerwartete Vorzeichen,
        wird der Download blockiert, bis Sie die Warnungen geprüft und „trotzdem exportieren“
        bestätigt haben. So landen keine stillen Fehler in Ihrer Buchhaltung.
      </p>
    </details>
    <details>
      <summary>Ich habe bisher das alte 9-Spalten-Layout importiert – was ändert sich?</summary>
      <p>
        Die von diesem Tool erzeugte Datei nutzt ein sauberes 7-Spalten-Layout, bei dem alle Spalten
        beschriftet sind. Beim ersten Import müssen Sie die Feldzuweisung in BuchhaltungsButler
        einmalig neu vornehmen (siehe Import-Anleitung oben) – danach merkt BuchhaltungsButler sich
        die Zuordnung wieder.
      </p>
    </details>
    <details>
      <summary>Warum ist das sicher? Wo landen meine Daten?</summary>
      <p>
        Nirgendwo. Die Konvertierung läuft vollständig in Ihrem Browser (JavaScript, Open Source).
        Es gibt keinen Server, keinen Upload, keine Cookies, kein Tracking. Sie können das
        überprüfen: Öffnen Sie die Entwicklertools Ihres Browsers (Netzwerk-Tab) – nach dem Laden
        der Seite finden keine weiteren Netzwerkzugriffe statt. Die Seite funktioniert sogar weiter,
        wenn die Internetverbindung nach dem Laden getrennt wird.
      </p>
    </details>`,
} as const;

export const impressumHtml = `
  <h2>Impressum</h2>
  <p>
    Cem Altay<br />
    Hauptstraße 46<br />
    22967 Tremsbüttel<br />
    E-Mail: cem@rnd1.de
  </p>`;

export const datenschutzHtml = `
  <h2>Datenschutz</h2>
  <p>
    Diese Website verarbeitet Ihre CSV-Dateien ausschließlich lokal in Ihrem Browser. Es findet
    <strong>keine Übertragung Ihrer Daten</strong> an einen Server statt – weder der Inhalt Ihrer
    Dateien noch sonstige Nutzungsdaten. Die Website setzt <strong>keine Cookies</strong>, nutzt
    <strong>kein Tracking</strong> und keine Analysedienste, speichert nichts und lädt nach dem
    Seitenaufruf keine weiteren Inhalte von Dritten nach.
  </p>
  <p>
    Beim Aufruf der Seite liefert der Hosting-Anbieter (z.&nbsp;B. GitHub Pages) die statischen
    Dateien der Website aus; dabei kann der Anbieter technisch bedingt Ihre IP-Adresse in
    Server-Protokollen verarbeiten. Auf diese Verarbeitung hat der Betreiber dieser Seite keinen
    Einfluss; es werden keine Inhalte Ihrer CSV-Dateien übertragen.
  </p>`;
