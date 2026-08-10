// Golden end-to-end tests: every sample in samples/ -> exact output CSV.
// The samples are synthetic but replicate the exact structure of real Klarna
// exports (column layout, quoting, swapped merchant_reference quirks, empty
// payout_date in combined-report transaction rows). Expected strings are
// hand-derived from SPEC §4/§7, not from the implementation.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { convert } from './helpers.ts';

const SAMPLES = fileURLToPath(new URL('../samples', import.meta.url));

function sample(name: string): { name: string; content: Uint8Array } {
  return { name, content: new Uint8Array(readFileSync(join(SAMPLES, name))) };
}

const BOM = '\uFEFF';
const HEADER =
  '"Datum";"Auftragsart";"Zahlungsreferenz";"Buchungstext";"Empfänger/Zahlungspflichtiger";"Betrag";"Währung"';

const q = (...fields: string[]) => fields.map((f) => `"${f}"`).join(';');

const expected910000001 = [
  q('01.01.2026', 'RETURN', '910000001', '00000000-0000-4000-8000-000000000101', 'gid://shopify/PaymentSession/rSynthPay0000000000000101', '-15,00', 'EUR'),
  q('01.01.2026', 'RETURN', '910000001', '00000000-0000-4000-8000-000000000102', 'gid://shopify/PaymentSession/rSynthPay0000000000000102', '-100,00', 'EUR'),
  q('01.01.2026', 'SALE', '910000001', '00000000-0000-4000-8000-000000000103', 'gid://shopify/PaymentSession/rSynthPay0000000000000103', '250,00', 'EUR'),
  q('01.01.2026', 'SALE', '910000001', '00000000-0000-4000-8000-000000000102', 'gid://shopify/PaymentSession/rSynthPay0000000000000102', '100,00', 'EUR'),
  q('01.01.2026', 'Gebühren', '910000001', '', 'Klarna Gebühren', '-12,50', 'EUR'),
  q('01.01.2026', 'Auszahlung', '910000001', '', 'Klarna Auszahlung', '-222,50', 'EUR'),
];

const expected910000002 = [
  q('04.06.2026', 'SALE', '910000002', '00000000-0000-4000-8000-000000000201', 'rSynthPay0000000000000201', '150,00', 'EUR'),
  q('04.06.2026', 'Gebühren', '910000002', '', 'Klarna Gebühren', '-6,00', 'EUR'),
  q('04.06.2026', 'Auszahlung', '910000002', '', 'Klarna Auszahlung', '-144,00', 'EUR'),
];

const expected910000004 = [
  q('16.07.2026', 'SALE', '910000004', '00000000-0000-4000-8000-000000000401', 'rSynthPay0000000000000401', '50,00', 'EUR'),
  q('16.07.2026', 'Gebühren', '910000004', '', 'Klarna Gebühren', '-2,00', 'EUR'),
  q('16.07.2026', 'Auszahlung', '910000004', '', 'Klarna Auszahlung', '-48,00', 'EUR'),
];

const expected910000005 = [
  q('30.07.2026', 'SALE', '910000005', '00000000-0000-4000-8000-000000000501', 'rSynthPay0000000000000501', '200,00', 'EUR'),
  q('30.07.2026', 'Gebühren', '910000005', '', 'Klarna Gebühren', '-7,20', 'EUR'),
  q('30.07.2026', 'Auszahlung', '910000005', '', 'Klarna Auszahlung', '-192,80', 'EUR'),
];

// Only payout in the combined report (§3.1.1) without an individual counterpart.
const expected910000003 = [
  q('02.07.2026', 'RETURN', '910000003', '00000000-0000-4000-8000-000000000401', 'rSynthPay0000000000000401', '-50,00', 'EUR'),
  q('02.07.2026', 'SALE', '910000003', '00000000-0000-4000-8000-000000000301', 'rSynthPay0000000000000301', '180,00', 'EUR'),
  q('02.07.2026', 'SALE', '910000003', '00000000-0000-4000-8000-000000000302', 'rSynthPay0000000000000302', '320,00', 'EUR'),
  q('02.07.2026', 'Gebühren', '910000003', '', 'Klarna Gebühren', '-18,50', 'EUR'),
  q('02.07.2026', 'Auszahlung', '910000003', '', 'Klarna Auszahlung', '-431,50', 'EUR'),
];

const COMBINED = 'settlements.K1234567.2026-06-01T00-00-00Z.2026-07-31T23-59-59Z.csv';

function csvOf(lines: string[]): string {
  return BOM + [HEADER, ...lines, ''].join('\r\n');
}

const cases: [string, string[], string][] = [
  ['settlement.910000001.csv', expected910000001, 'klarna-buchhaltungsbutler_2026-01-01.csv'],
  ['settlement.910000002.csv', expected910000002, 'klarna-buchhaltungsbutler_2026-06-04.csv'],
  ['settlement.910000004.csv', expected910000004, 'klarna-buchhaltungsbutler_2026-07-16.csv'],
  ['settlement.910000005.csv', expected910000005, 'klarna-buchhaltungsbutler_2026-07-30.csv'],
];

describe('golden: single samples', () => {
  for (const [name, lines, filename] of cases) {
    it(`converts ${name} exactly`, () => {
      const r = convert([sample(name)]);
      expect(r.files[0].ok).toBe(true);
      expect(r.csv).toBe(csvOf(lines));
      expect(r.filename).toBe(filename);
      expect(r.payouts).toHaveLength(1);
      expect(r.payouts[0].balanceCents).toBe(0);
      expect(r.payouts[0].taxMerged).toBe(true); // all samples carry VAT on Klarna fees
      expect(r.issues).toEqual([]);
    });
  }
});

describe('golden: all samples merged', () => {
  it('merges all payouts date-ascending into one CSV', () => {
    const names = cases.map(([name]) => name);
    const r = convert(names.map(sample));
    expect(r.csv).toBe(
      csvOf([...expected910000001, ...expected910000002, ...expected910000004, ...expected910000005]),
    );
    expect(r.filename).toBe('klarna-buchhaltungsbutler_2026-01-01_2026-07-30.csv');
    expect(r.payouts).toHaveLength(4);
    expect(r.issues).toEqual([]);
  });

  it('covers every file in samples/ (no sample left untested)', () => {
    const onDisk = readdirSync(SAMPLES)
      .filter((f: string) => f.endsWith('.csv'))
      .sort();
    expect(onDisk).toEqual([...cases.map(([name]) => name), COMBINED].sort());
  });
});

// The combined report (§3.1.1): four payout blocks in one file. Its payouts must
// convert exactly like the equivalent individual reports — hence the reuse of the
// expectations above for the three payouts that also exist as separate samples.
describe('golden: combined settlement report', () => {
  const expectedCombined = [
    ...expected910000002, // 04.06.2026
    ...expected910000003, // 02.07.2026
    ...expected910000004, // 16.07.2026
    ...expected910000005, // 30.07.2026
  ];

  it(`converts ${COMBINED} exactly`, () => {
    const r = convert([sample(COMBINED)]);
    expect(r.files[0].ok).toBe(true);
    expect(r.csv).toBe(csvOf(expectedCombined));
    expect(r.filename).toBe('klarna-buchhaltungsbutler_2026-06-04_2026-07-30.csv');
    expect(r.issues).toEqual([]);
  });

  it('yields four balanced payouts, newest last', () => {
    const r = convert([sample(COMBINED)]);
    expect(r.payouts.map((p) => p.payoutDate)).toEqual([
      '04.06.2026',
      '02.07.2026',
      '16.07.2026',
      '30.07.2026',
    ]);
    expect(r.payouts.map((p) => p.paymentReference)).toEqual([
      '910000002',
      '910000003',
      '910000004',
      '910000005',
    ]);
    for (const p of r.payouts) {
      expect(p.balanceCents).toBe(0);
      expect(p.taxMerged).toBe(true);
    }
  });

  it('produces the same rows as the equivalent individual reports', () => {
    const individually = convert([
      sample('settlement.910000002.csv'),
      sample('settlement.910000004.csv'),
      sample('settlement.910000005.csv'),
    ]);
    const combined = convert([sample(COMBINED)]);
    const withoutJulySecond = combined.payouts.filter((p) => p.paymentReference !== '910000003');
    expect(withoutJulySecond.flatMap((p) => p.outputRows)).toEqual(
      individually.payouts.flatMap((p) => p.outputRows),
    );
  });

  it('rejects a payout already present as an individual report', () => {
    const r = convert([sample(COMBINED), sample('settlement.910000004.csv')]);
    expect(r.payouts).toHaveLength(4);
    const dup = r.issues.find((i) => i.code === 'duplicate_payment_reference')!;
    expect(dup.severity).toBe('error');
    expect(dup.messageDe).toContain('910000004');
    expect(dup.messageDe).toContain(COMBINED);
  });
});
