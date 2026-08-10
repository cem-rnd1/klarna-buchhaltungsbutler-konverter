import { describe, expect, it } from 'vitest';
import {
  buildShopifyIndex,
  extractSessionToken,
  extractSessionTokens,
  lookupShopifyOrder,
} from '../src/core/shopify.ts';
import { convert, issueCodes, type TestFile } from './helpers.ts';

// --- Fixtures ---------------------------------------------------------------
// Synthetic, anonymized: invented names, order numbers and payment tokens.

const TOK_A = 'rAn1aExAmPle0000000000001';
const TOK_B = 'rBn2bExAmPle0000000000002';
const TOK_C = 'rCn3cExAmPle0000000000003';
const TOK_REFUND_B = 'zBn2bRefUnd00000000000002';
const TOK_UNKNOWN = 'rZz9zUnKnoWn0000000000009';

const gid = (token: string) => `gid://shopify/PaymentSession/${token}`;

/**
 * A trimmed Shopify order export: comma-separated, quoted where needed, with
 * decoy columns and a line-item continuation row (all fields but "Name" empty).
 */
const SHOPIFY_HEADER =
  'Name,Email,Financial Status,Lineitem name,Billing Name,Billing City,Payment Method,Payment Reference,Payment ID,Payment References';

const shopifyExport = (lines: string[]): string => [SHOPIFY_HEADER, ...lines].join('\r\n') + '\r\n';

const SHOPIFY_CSV = shopifyExport([
  `SH-1001-DE,a@example.invalid,paid,"Artikel A, groß",Anna Beispiel,Berlin,Klarna,${TOK_A},${TOK_A},${TOK_A}`,
  'SH-1001-DE,,,Artikel B,,,,,,',
  `SH-1002-DE,b@example.invalid,refunded,Artikel C,Björn Mustermann,"Köln, Innenstadt",Klarna,${TOK_B},${TOK_B},${TOK_B} + ${TOK_REFUND_B}`,
  `SH-1003-DE,c@example.invalid,paid,Artikel D,Clara Probe,Hamburg,Klarna,${TOK_C},${TOK_C},${TOK_C}`,
  'SH-1004-DE,d@example.invalid,paid,Artikel E,Dana Test,Bremen,PayPal Express Checkout,,,',
]);

const SUMMARY_HEADER =
  'payout_date;total_settlement_amount;total_fee_amount;total_commission_amount;total_tax_amount;payment_reference';
const TX_HEADER =
  'payout_date;type;payment_reference;order_id;merchant_reference1;merchant_reference2;amount;posting_currency';

const file = (lines: string[]): string => lines.join('\r\n') + '\r\n';

// settlement 155 = 100 + 50 - 20 + 30 (transactions) - 5 (fees)
const KLARNA_CSV = file([
  SUMMARY_HEADER,
  '01.01.2026;155,00;-5,00;0,00;0,00;R1',
  TX_HEADER,
  // token in merchant_reference1 as gid, bare in reference2
  `01.01.2026;SALE;R1;order-a;${gid(TOK_A)};${TOK_A};100,00;EUR`,
  // swapped export (§3.4): bare token in reference1, gid in reference2
  `01.01.2026;SALE;R1;order-b;${TOK_B};${gid(TOK_B)};50,00;EUR`,
  `01.01.2026;RETURN;R1;order-c;${gid(TOK_C)};${TOK_C};-20,00;EUR`,
  // no Shopify counterpart
  `01.01.2026;SALE;R1;order-z;${gid(TOK_UNKNOWN)};${TOK_UNKNOWN};30,00;EUR`,
]);

const klarna: TestFile[] = [{ name: 'settlement.csv', content: KLARNA_CSV }];
const shopify: TestFile[] = [{ name: 'orders_export.csv', content: SHOPIFY_CSV }];

const encode = (s: string) => new TextEncoder().encode(s);
const indexOf = (...contents: string[]) =>
  buildShopifyIndex(contents.map((c, i) => ({ fileName: `s${i}.csv`, bytes: encode(c) })));

// --- Token extraction -------------------------------------------------------

describe('session token extraction (§4.5)', () => {
  it('returns a bare token unchanged', () => {
    expect(extractSessionToken(TOK_A)).toBe(TOK_A);
  });

  it('strips the gid://shopify/PaymentSession/ prefix', () => {
    expect(extractSessionToken(gid(TOK_A))).toBe(TOK_A);
  });

  it('trims surrounding whitespace', () => {
    expect(extractSessionToken(`  ${TOK_A} `)).toBe(TOK_A);
    expect(extractSessionToken(` ${gid(TOK_A)}\t`)).toBe(TOK_A);
  });

  it('returns null for empty or path-only values', () => {
    expect(extractSessionToken('')).toBeNull();
    expect(extractSessionToken('   ')).toBeNull();
    expect(extractSessionToken('gid://shopify/PaymentSession/')).toBeNull();
  });

  it('splits multi-valued cells on " + " and commas', () => {
    expect(extractSessionTokens(`${TOK_B} + ${TOK_REFUND_B}`)).toEqual([TOK_B, TOK_REFUND_B]);
    expect(extractSessionTokens(`${TOK_A},${TOK_B}`)).toEqual([TOK_A, TOK_B]);
    expect(extractSessionTokens('')).toEqual([]);
  });
});

// --- Index building ---------------------------------------------------------

describe('Shopify index (§3.5)', () => {
  it('indexes every payment column and counts distinct orders', () => {
    const { index, files, issues } = indexOf(SHOPIFY_CSV);
    expect(issues).toEqual([]);
    expect(files[0].ok).toBe(true);
    expect(files[0].orderCount).toBe(3); // SH-1004-DE has no payment reference
    expect(index.get(TOK_A)).toEqual({ orderName: 'SH-1001-DE', billingName: 'Anna Beispiel' });
    expect(index.get(TOK_REFUND_B)?.orderName).toBe('SH-1002-DE');
  });

  it('ignores line-item continuation rows', () => {
    // SH-1001-DE's second row carries no token, so it cannot overwrite anything.
    const { index } = indexOf(SHOPIFY_CSV);
    expect(index.get(TOK_A)?.billingName).toBe('Anna Beispiel');
  });

  it('merges several files into one lookup table, first occurrence wins', () => {
    const other = shopifyExport([
      `SH-9001-DE,x@example.invalid,paid,Artikel X,Späterer Name,Kiel,Klarna,${TOK_A},${TOK_A},${TOK_A}`,
      `SH-9002-DE,y@example.invalid,paid,Artikel Y,Yvonne Neu,Kiel,Klarna,${TOK_UNKNOWN},${TOK_UNKNOWN},${TOK_UNKNOWN}`,
    ]);
    const { index } = indexOf(SHOPIFY_CSV, other);
    expect(index.get(TOK_A)?.orderName).toBe('SH-1001-DE');
    expect(index.get(TOK_UNKNOWN)?.orderName).toBe('SH-9002-DE');
  });

  it('reads a semicolon-separated export (re-saved in Excel)', () => {
    const semi = SHOPIFY_CSV.replace(/,/g, ';').replace(/"[^"]*"/g, (m) => m.replace(/;/g, ','));
    const { index, issues } = indexOf(semi);
    expect(issues).toEqual([]);
    expect(index.get(TOK_A)?.billingName).toBe('Anna Beispiel');
  });

  it('rejects a file without order name or payment columns', () => {
    const { index, files } = indexOf('Vorname,Nachname\nAnna,Beispiel\n');
    expect(files[0].ok).toBe(false);
    expect(files[0].issues.map((i) => i.code)).toEqual(['shopify_unusable_file']);
    expect(index.size).toBe(0);
  });

  it('accepts an export without Billing Name, with an info notice', () => {
    const noBilling = ['Name,Payment ID', `SH-2001-DE,${TOK_A}`].join('\r\n');
    const { index, files } = indexOf(noBilling);
    expect(files[0].ok).toBe(true);
    expect(files[0].issues.map((i) => i.code)).toEqual(['shopify_missing_billing_column']);
    expect(index.get(TOK_A)).toEqual({ orderName: 'SH-2001-DE', billingName: '' });
  });

  it('looks up through both merchant references, in order', () => {
    const { index } = indexOf(SHOPIFY_CSV);
    expect(lookupShopifyOrder(index, gid(TOK_A), '')?.orderName).toBe('SH-1001-DE');
    expect(lookupShopifyOrder(index, TOK_UNKNOWN, gid(TOK_B))?.orderName).toBe('SH-1002-DE');
    expect(lookupShopifyOrder(index, '', TOK_UNKNOWN)).toBeUndefined();
  });
});

// --- End to end -------------------------------------------------------------

describe('Shopify matching end to end (§4.5)', () => {
  it('writes customer name and order number into matched rows', () => {
    const r = convert(klarna, shopify);
    const rows = r.payouts[0].outputRows;

    expect(rows.slice(0, 4).map((row) => [row.buchungstext, row.empfaenger])).toEqual([
      ['SH-1001-DE', 'Anna Beispiel'],
      ['SH-1002-DE', 'Björn Mustermann'],
      ['SH-1003-DE', 'Clara Probe'],
      ['order-z', gid(TOK_UNKNOWN)], // unmatched: unchanged
    ]);
    expect(r.csv).toContain('"SH-1001-DE";"Anna Beispiel"');
    expect(r.csv).toContain('"SH-1003-DE";"Clara Probe"');
    expect(r.payouts[0].balanceCents).toBe(0);
  });

  it('matches RETURN rows and leaves generated rows untouched', () => {
    const r = convert(klarna, shopify);
    const rows = r.payouts[0].outputRows;
    const ret = rows.find((row) => row.auftragsart === 'RETURN')!;
    expect([ret.buchungstext, ret.empfaenger, ret.betragCents]).toEqual([
      'SH-1003-DE',
      'Clara Probe',
      -2000,
    ]);
    expect(rows.slice(4).map((row) => [row.auftragsart, row.buchungstext, row.empfaenger])).toEqual([
      ['Gebühren', '', 'Klarna Gebühren'],
      ['Auszahlung', '', 'Klarna Auszahlung'],
    ]);
  });

  it('reports unmatched rows as a single info notice', () => {
    const r = convert(klarna, shopify);
    expect(issueCodes(r)).toEqual(['shopify_unmatched']);
    const notice = r.issues[0];
    expect(notice.severity).toBe('info');
    expect(notice.messageDe).toContain('1 von 4');
  });

  it('stays silent when every row matches', () => {
    const complete = shopifyExport([
      `SH-1001-DE,,paid,A,Anna Beispiel,Berlin,Klarna,${TOK_A},${TOK_A},${TOK_A}`,
      `SH-1002-DE,,paid,B,Björn Mustermann,Köln,Klarna,${TOK_B},${TOK_B},${TOK_B}`,
      `SH-1003-DE,,paid,C,Clara Probe,Hamburg,Klarna,${TOK_C},${TOK_C},${TOK_C}`,
      `SH-1004-DE,,paid,D,Dana Test,Bremen,Klarna,${TOK_UNKNOWN},${TOK_UNKNOWN},${TOK_UNKNOWN}`,
    ]);
    const r = convert(klarna, [{ name: 'orders.csv', content: complete }]);
    expect(issueCodes(r)).toEqual([]);
    expect(r.payouts[0].shopifyUnmatched).toBe(0);
  });

  it('keeps the Klarna reference when the matched order has no billing name', () => {
    const noBilling = shopifyExport([
      `SH-1001-DE,,paid,A,,Berlin,Klarna,${TOK_A},${TOK_A},${TOK_A}`,
    ]);
    const r = convert(klarna, [{ name: 'orders.csv', content: noBilling }]);
    const row = r.payouts[0].outputRows[0];
    expect(row.buchungstext).toBe('SH-1001-DE');
    expect(row.empfaenger).toBe(gid(TOK_A));
  });

  it('produces byte-identical output without a Shopify export', () => {
    const withoutShopify = convert(klarna);
    const withUnusable = convert(klarna, [{ name: 'irrelevant.csv', content: 'a,b\n1,2\n' }]);
    expect(withoutShopify.csv).toBe(withUnusable.csv);
    expect(withoutShopify.payouts[0].outputRows[0].empfaenger).toBe(gid(TOK_A));
    expect(issueCodes(withoutShopify)).toEqual([]);
    expect(withoutShopify.payouts[0].shopifyUnmatched).toBe(0);
  });

  it('matches unknown transaction types too', () => {
    const withUnknown = file([
      SUMMARY_HEADER,
      '01.01.2026;95,00;-5,00;0,00;0,00;R2',
      TX_HEADER,
      `01.01.2026;CHARGEBACK;R2;order-a;${gid(TOK_A)};${TOK_A};100,00;EUR`,
    ]);
    const r = convert([{ name: 'x.csv', content: withUnknown }], shopify);
    expect(r.payouts[0].outputRows[0].empfaenger).toBe('Anna Beispiel');
    expect(issueCodes(r)).toEqual(['unknown_type']);
  });
});
