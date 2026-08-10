// Synthetic fixtures for cases the real samples do not cover (SPEC §9.1).

import { describe, expect, it } from 'vitest';
import { convert, issueCodes } from './helpers.ts';

const SUMMARY_HEADER =
  'payout_date;total_settlement_amount;total_fee_amount;total_commission_amount;total_tax_amount;payment_reference';
const TX_HEADER = 'payout_date;type;payment_reference;order_id;merchant_reference1;amount;posting_currency';

function file(lines: string[]): string {
  return lines.join('\r\n') + '\r\n';
}

function rowsOf(csv: string): string[][] {
  return csv
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n')
    .map((line) => line.split(';').map((f) => f.replace(/^"|"$/g, '')));
}

describe('sign normalization (§4.2)', () => {
  it('negates RETURN exported in the positive convention', () => {
    // settlement 95 = 120 (SALE) - 20 (RETURN) - 5 (fees)
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;95,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;120,00;EUR',
          '01.01.2026;RETURN;R1;o2;m2;20,00;EUR',
        ]),
      },
    ]);
    const betraege = r.payouts[0].outputRows.map((row) => row.betragCents);
    expect(betraege).toEqual([12000, -2000, -500, -9500]);
    expect(r.payouts[0].balanceCents).toBe(0);
    expect(issueCodes(r)).toEqual([]);
  });

  it('keeps REVERSAL negative when already exported negative', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;105,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;120,00;EUR',
          '01.01.2026;REVERSAL;R1;o2;m2;-10,00;EUR',
        ]),
      },
    ]);
    expect(r.payouts[0].outputRows[1].betragCents).toBe(-1000);
    expect(r.payouts[0].balanceCents).toBe(0);
  });

  it('keeps unknown types with original sign and reports an info issue', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;94,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
          '01.01.2026;ADJUSTMENT;R1;o2;m2;-1,00;EUR',
        ]),
      },
    ]);
    expect(r.payouts[0].outputRows[1].betragCents).toBe(-100);
    const unknown = r.issues.find((i) => i.code === 'unknown_type');
    expect(unknown?.severity).toBe('info');
    expect(unknown?.messageDe).toContain('ADJUSTMENT');
    expect(r.payouts[0].balanceCents).toBe(0);
  });
});

describe('generated rows (§4.3, §4.4)', () => {
  it('drops FEE and COMMISSION rows, adds Kommissionen from the summary', () => {
    // settlement 92 = 100 - 5 (fees) - 3 (commission)
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;92,00;-5,00;-3,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
          '01.01.2026;FEE;R1;o1;m1;-5,00;EUR',
          '01.01.2026;COMMISSION;R1;o1;m1;-3,00;EUR',
        ]),
      },
    ]);
    const arten = r.payouts[0].outputRows.map((row) => row.auftragsart);
    expect(arten).toEqual(['SALE', 'Gebühren', 'Kommissionen', 'Auszahlung']);
    const kommission = r.payouts[0].outputRows[2];
    expect(kommission.betragCents).toBe(-300);
    expect(kommission.empfaenger).toBe('Klarna Kommissionen');
    expect(kommission.buchungstext).toBe('');
    expect(r.payouts[0].balanceCents).toBe(0);
    expect(issueCodes(r)).toEqual([]);
  });

  it('omits the Kommissionen row when total_commission_amount is 0', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;95,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    expect(r.payouts[0].outputRows.map((row) => row.auftragsart)).toEqual([
      'SALE',
      'Gebühren',
      'Auszahlung',
    ]);
  });

  it('omits the Gebühren row when fees plus tax are exactly 0', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;100,00;0,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    expect(r.payouts[0].outputRows.map((row) => row.auftragsart)).toEqual(['SALE', 'Auszahlung']);
    expect(r.payouts[0].balanceCents).toBe(0);
  });

  it('merges tax into the Gebühren row (§13b) and flags the payout', () => {
    // fees -5,71 + tax -1,09 = -6,80; settlement 172,30 = 179,10 - 6,80
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;172,30;-5,71;0,00;-1,09;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;179,10;EUR',
        ]),
      },
    ]);
    const fees = r.payouts[0].outputRows.find((row) => row.auftragsart === 'Gebühren')!;
    expect(fees.betragCents).toBe(-680);
    expect(r.payouts[0].taxMerged).toBe(true);
    expect(r.payouts[0].balanceCents).toBe(0);
  });

  it('does not flag §13b when tax is 0', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;95,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    expect(r.payouts[0].taxMerged).toBe(false);
  });

  it('always emits the Auszahlung row negative', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;95,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    const auszahlung = r.payouts[0].outputRows.at(-1)!;
    expect(auszahlung.auftragsart).toBe('Auszahlung');
    expect(auszahlung.betragCents).toBe(-9500);
    expect(auszahlung.empfaenger).toBe('Klarna Auszahlung');
  });
});

describe('multi-file handling (§5)', () => {
  const fileA = file([
    SUMMARY_HEADER,
    '04.06.2026;95,00;-5,00;0,00;0,00;REF-A',
    TX_HEADER,
    '04.06.2026;SALE;REF-A;o1;m1;100,00;EUR',
  ]);
  const fileB = file([
    SUMMARY_HEADER,
    '01.01.2026;47,00;-3,00;0,00;0,00;REF-B',
    TX_HEADER,
    '01.01.2026;SALE;REF-B;o2;m2;50,00;EUR',
  ]);

  it('supports multiple payouts in one file, matched by payment_reference', () => {
    const r = convert([
      {
        name: 'multi.csv',
        content: file([
          SUMMARY_HEADER,
          '04.06.2026;95,00;-5,00;0,00;0,00;REF-A',
          '01.01.2026;47,00;-3,00;0,00;0,00;REF-B',
          TX_HEADER,
          '04.06.2026;SALE;REF-A;o1;m1;100,00;EUR',
          '01.01.2026;SALE;REF-B;o2;m2;50,00;EUR',
        ]),
      },
    ]);
    expect(r.payouts).toHaveLength(2);
    // sorted by payout_date ascending
    expect(r.payouts.map((p) => p.paymentReference)).toEqual(['REF-B', 'REF-A']);
    expect(r.payouts.every((p) => p.balanceCents === 0)).toBe(true);
    expect(r.filename).toBe('klarna-buchhaltungsbutler_2026-01-01_2026-06-04.csv');
  });

  it('merges payouts of several files sorted by date', () => {
    const r = convert([
      { name: 'a.csv', content: fileA },
      { name: 'b.csv', content: fileB },
    ]);
    expect(r.payouts.map((p) => p.paymentReference)).toEqual(['REF-B', 'REF-A']);
    expect(issueCodes(r)).toEqual([]);
  });

  it('rejects the later duplicate payment_reference and names both files', () => {
    const r = convert([
      { name: 'a.csv', content: fileA },
      { name: 'copy-of-a.csv', content: fileA },
    ]);
    expect(r.payouts).toHaveLength(1);
    const dup = r.issues.find((i) => i.code === 'duplicate_payment_reference')!;
    expect(dup.severity).toBe('error');
    expect(dup.messageDe).toContain('a.csv');
    expect(dup.messageDe).toContain('copy-of-a.csv');
    expect(dup.messageDe).toContain('REF-A');
  });

  it('excludes a broken file but keeps converting the valid ones', () => {
    const r = convert([
      { name: 'broken.csv', content: 'not;a;settlement\r\nreport;at;all\r\n' },
      { name: 'b.csv', content: fileB },
    ]);
    expect(r.files[0].ok).toBe(false);
    expect(r.payouts).toHaveLength(1);
    expect(r.payouts[0].paymentReference).toBe('REF-B');
    expect(issueCodes(r)).toEqual(['no_transaction_section']);
  });

  it('blocks transactions that match no payout (orphans)', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;95,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
          '01.01.2026;SALE;OTHER;o2;m2;50,00;EUR',
        ]),
      },
    ]);
    const orphan = r.issues.find((i) => i.code === 'orphan_transactions')!;
    expect(orphan.severity).toBe('blocking');
    expect(orphan.messageDe).toContain('OTHER');
    // the orphan row is not exported
    expect(r.payouts[0].outputRows).toHaveLength(3);
  });
});

describe('combined settlement report (§3.1.1)', () => {
  const OVERALL_HEADER =
    'summary_total_sale_amount;summary_total_fee_amount;summary_total_settlement_amount;summary_total_tax_amount;summary_settlement_currency;summary_payout_date_start;summary_payout_date_end';

  // Two payout blocks, transaction rows without their own date, preceded by the
  // overall summary section covering the whole period.
  const combined = file([
    OVERALL_HEADER,
    '150,00;-8,00;142,00;0,00;EUR;01.01.2026;04.06.2026',
    SUMMARY_HEADER,
    '04.06.2026;95,00;-5,00;0,00;0,00;REF-A',
    TX_HEADER,
    ';SALE;REF-A;o1;m1;100,00;EUR',
    ';FEE;REF-A;o1;m1;-5,00;EUR',
    SUMMARY_HEADER,
    '01.01.2026;47,00;-3,00;0,00;0,00;REF-B',
    TX_HEADER,
    ';SALE;REF-B;o2;m2;50,00;EUR',
  ]);

  it('parses every payout block and skips the overall summary section', () => {
    const r = convert([{ name: 'combined.csv', content: combined }]);
    expect(r.files[0].ok).toBe(true);
    expect(r.payouts).toHaveLength(2);
    // sorted by payout_date ascending, overall section contributes nothing
    expect(r.payouts.map((p) => p.paymentReference)).toEqual(['REF-B', 'REF-A']);
    expect(r.payouts.every((p) => p.balanceCents === 0)).toBe(true);
    expect(issueCodes(r)).toEqual([]);
    // header + REF-B (SALE, Gebühren, Auszahlung) + REF-A (SALE, Gebühren, Auszahlung);
    // the FEE row is dropped (§4.1) and the overall summary section contributes nothing.
    expect(rowsOf(r.csv)).toHaveLength(1 + 3 + 3);
  });

  it('gives transaction rows the payout date of their own block', () => {
    const r = convert([{ name: 'combined.csv', content: combined }]);
    const dates = r.payouts.flatMap((p) => p.outputRows.map((row) => row.datum));
    expect(dates).toEqual(['01.01.2026', '01.01.2026', '01.01.2026', '04.06.2026', '04.06.2026', '04.06.2026']);
  });

  it('produces the same output as the equivalent individual reports', () => {
    const asCombined = convert([{ name: 'combined.csv', content: combined }]);
    const asIndividuals = convert([
      {
        name: 'b.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;47,00;-3,00;0,00;0,00;REF-B',
          TX_HEADER,
          '01.01.2026;SALE;REF-B;o2;m2;50,00;EUR',
        ]),
      },
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '04.06.2026;95,00;-5,00;0,00;0,00;REF-A',
          TX_HEADER,
          '04.06.2026;SALE;REF-A;o1;m1;100,00;EUR',
          '04.06.2026;FEE;REF-A;o1;m1;-5,00;EUR',
        ]),
      },
    ]);
    expect(asCombined.csv).toBe(asIndividuals.csv);
    expect(asCombined.filename).toBe(asIndividuals.filename);
  });

  it('reports a column missing from every block only once', () => {
    const r = convert([
      {
        name: 'combined.csv',
        content: file([
          OVERALL_HEADER,
          '150,00;-8,00;142,00;0,00;EUR;01.01.2026;04.06.2026',
          'payout_date;total_settlement_amount;total_fee_amount;payment_reference',
          '04.06.2026;95,00;-5,00;REF-A',
          TX_HEADER,
          ';SALE;REF-A;o1;m1;100,00;EUR',
          'payout_date;total_settlement_amount;total_fee_amount;payment_reference',
          '01.01.2026;47,00;-3,00;REF-B',
          TX_HEADER,
          ';SALE;REF-B;o2;m2;50,00;EUR',
        ]),
      },
    ]);
    expect(issueCodes(r)).toEqual(['missing_optional_column', 'missing_optional_column']);
    expect(r.issues[0].messageDe).toContain('total_commission_amount');
    expect(r.issues[1].messageDe).toContain('total_tax_amount');
  });

  it('still detects duplicates and orphans across blocks', () => {
    const r = convert([
      {
        name: 'combined.csv',
        content: file([
          SUMMARY_HEADER,
          '04.06.2026;95,00;-5,00;0,00;0,00;REF-A',
          TX_HEADER,
          ';SALE;REF-A;o1;m1;100,00;EUR',
          SUMMARY_HEADER,
          '01.01.2026;95,00;-5,00;0,00;0,00;REF-A',
          TX_HEADER,
          ';SALE;OTHER;o2;m2;100,00;EUR',
        ]),
      },
    ]);
    expect(issueCodes(r)).toContain('orphan_transactions');
    const dup = r.issues.find((i) => i.code === 'duplicate_payment_reference')!;
    expect(dup.messageDe).toContain('REF-A');
    expect(r.payouts).toHaveLength(1);
  });
});

describe('validation (§6)', () => {
  it('reports a broken balance as blocking with the difference', () => {
    // settlement claims 90 but rows sum to 95 ⇒ difference +5,00
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;90,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    const issue = r.issues.find((i) => i.code === 'balance_mismatch')!;
    expect(issue.severity).toBe('blocking');
    expect(issue.messageDe).toContain('5,00 €');
    expect(r.payouts[0].balanceCents).toBe(500);
  });

  it('flags non-EUR rows as blocking', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;95,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;SEK',
        ]),
      },
    ]);
    const issue = r.issues.find((i) => i.code === 'non_eur_currency')!;
    expect(issue.severity).toBe('blocking');
    expect(issue.messageDe).toContain('SEK');
    expect(r.payouts[0].outputRows[0].waehrung).toBe('SEK');
  });

  it('flags positive Gebühren as blocking but emits them as-is', () => {
    // fees positive: 100 + 5 - 105 = 0 keeps the balance intact
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;105,00;5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    const fees = r.payouts[0].outputRows.find((row) => row.auftragsart === 'Gebühren')!;
    expect(fees.betragCents).toBe(500);
    expect(r.issues.find((i) => i.code === 'positive_fees')?.severity).toBe('blocking');
  });

  it('flags positive Kommissionen as blocking but emits them as-is', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;98,00;-5,00;3,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    const kommission = r.payouts[0].outputRows.find((row) => row.auftragsart === 'Kommissionen')!;
    expect(kommission.betragCents).toBe(300);
    expect(r.issues.find((i) => i.code === 'positive_commission')?.severity).toBe('blocking');
  });
});

describe('column handling (§3.2)', () => {
  it('reports a missing required column as file-level error', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          'payout_date;total_settlement_amount;total_fee_amount;payment_reference',
          '01.01.2026;95,00;-5,00;R1',
          'payout_date;type;amount', // no payment_reference column
          '01.01.2026;SALE;100,00',
        ]),
      },
    ]);
    expect(r.files[0].ok).toBe(false);
    const err = r.issues.find((i) => i.code === 'missing_required_column')!;
    expect(err.severity).toBe('error');
    expect(err.messageDe).toContain('payment_reference');
    expect(r.payouts).toHaveLength(0);
  });

  it('reports a transaction list without amount column as missing section', () => {
    // Without `amount` the transaction header cannot even be recognized (§3.1).
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          'payout_date;total_settlement_amount;total_fee_amount;payment_reference',
          '01.01.2026;95,00;-5,00;R1',
          'payout_date;type;payment_reference',
          '01.01.2026;SALE;R1',
        ]),
      },
    ]);
    expect(r.files[0].ok).toBe(false);
    expect(issueCodes(r)).toEqual(['no_transaction_section']);
  });

  it('treats missing optional columns as info and fills defaults', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          'payout_date;total_settlement_amount;total_fee_amount;payment_reference',
          '01.01.2026;95,00;-5,00;R1',
          'payout_date;type;payment_reference;amount',
          '01.01.2026;SALE;R1;100,00',
        ]),
      },
    ]);
    expect(r.files[0].ok).toBe(true);
    const codes = issueCodes(r);
    // total_commission_amount, total_tax_amount, order_id, merchant_reference1, posting_currency
    expect(codes.filter((c) => c === 'missing_optional_column')).toHaveLength(5);
    expect(r.issues.every((i) => i.code !== 'missing_optional_column' || i.severity === 'info')).toBe(true);
    const sale = r.payouts[0].outputRows[0];
    expect(sale.buchungstext).toBe('');
    expect(sale.empfaenger).toBe('');
    expect(sale.waehrung).toBe('EUR');
    expect(r.payouts[0].balanceCents).toBe(0);
  });

  it('matches headers case-insensitively and via aliases', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          'Payout_Date;TOTAL_SETTLEMENT_AMOUNT;total_fee_amount;total_commission_amount;total_tax_amount;payment_reference',
          '01.01.2026;95,00;-5,00;0,00;0,00;R1',
          'payout_date;type;payment_reference;settlement_merchant_id;order_id;merchant_reference1;amount;posting_currency',
          '01.01.2026;SALE;R1;K123;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    expect(r.files[0].ok).toBe(true);
    expect(r.payouts[0].balanceCents).toBe(0);
  });
});

describe('value formats (§3.3)', () => {
  it('parses point-decimal files', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '2026-01-01;1,200.00;-34.56;0.00;0.00;R1',
          TX_HEADER,
          '2026-01-01;SALE;R1;o1;m1;1,234.56;EUR',
        ]),
      },
    ]);
    expect(r.files[0].ok).toBe(true);
    expect(r.payouts[0].outputRows[0].betragCents).toBe(123456);
    expect(r.payouts[0].outputRows[0].datum).toBe('01.01.2026');
    expect(r.payouts[0].balanceCents).toBe(0);
    expect(rowsOf(r.csv)[1][5]).toBe('1234,56');
  });

  it('rejects files mixing decimal conventions', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;95.00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    expect(r.files[0].ok).toBe(false);
    expect(issueCodes(r)).toEqual(['mixed_decimals']);
  });

  it('rejects unparseable dates as file-level error', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01/01/2026;95,00;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    expect(r.files[0].ok).toBe(false);
    expect(issueCodes(r)).toEqual(['bad_date']);
  });

  it('rejects unparseable amounts as file-level error', () => {
    const r = convert([
      {
        name: 'a.csv',
        content: file([
          SUMMARY_HEADER,
          '01.01.2026;abc;-5,00;0,00;0,00;R1',
          TX_HEADER,
          '01.01.2026;SALE;R1;o1;m1;100,00;EUR',
        ]),
      },
    ]);
    expect(r.files[0].ok).toBe(false);
    expect(issueCodes(r)).toEqual(['bad_amount']);
  });
});
