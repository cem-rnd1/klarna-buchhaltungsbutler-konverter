// Raw CSV bytes -> typed SettlementFile. All format auto-detection happens
// here (§3); any file-level error empties the result and is reported as Issue.

import { parseCsv } from './csv.ts';
import { decodeCsvBytes, detectDecimalSep, normalizeDate, splitBlocks } from './detect.ts';
import { parseAmountCents, type DecimalSep } from './money.ts';
import { makeIssue, type Issue } from './validate.ts';
import { missingColumnEffects } from '../ui/strings.ts';

export interface SummaryRow {
  payoutDate: string; // DD.MM.YYYY
  settlementCents: number;
  feeCents: number;
  commissionCents: number;
  taxCents: number;
  paymentReference: string;
}

export interface TransactionRow {
  payoutDate: string; // DD.MM.YYYY
  type: string;
  paymentReference: string;
  amountCents: number;
  orderId: string;
  merchantReference1: string;
  /**
   * Only used for the optional Shopify matching (§4.5) — its content is swapped
   * with reference1 in some exports (§3.4). Read silently: a missing column is
   * not worth a warning, since it never affects the output on its own.
   */
  merchantReference2: string;
  postingCurrency: string;
  lineNumber: number;
}

export interface SettlementFile {
  fileName: string;
  payouts: SummaryRow[];
  transactions: TransactionRow[];
  issues: Issue[];
  /** false ⇒ file-level error; payouts/transactions are empty. */
  ok: boolean;
}

// Header aliases seen in real exports (§3.2).
const ALIASES: Record<string, string> = {
  settlement_merchant_id: 'merchant_id',
};

const REQUIRED_SUMMARY = ['payout_date', 'total_settlement_amount', 'total_fee_amount', 'payment_reference'];
const OPTIONAL_SUMMARY = ['total_commission_amount', 'total_tax_amount'];
const REQUIRED_TX = ['payout_date', 'type', 'payment_reference', 'amount'];
const OPTIONAL_TX = ['order_id', 'merchant_reference1', 'posting_currency'];

function headerMap(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, i) => {
    const canonical = name.trim().toLowerCase();
    map.set(ALIASES[canonical] ?? canonical, i);
  });
  return map;
}

class FileError extends Error {
  constructor(public issue: Issue) {
    super(issue.messageDe);
  }
}

export function parseSettlementFile(bytes: Uint8Array, fileName: string): SettlementFile {
  const issues: Issue[] = [];
  const fail = (file?: string): SettlementFile => ({
    fileName: file ?? fileName,
    payouts: [],
    transactions: [],
    issues,
    ok: false,
  });

  try {
    const rows = parseCsv(decodeCsvBytes(bytes));
    const split = rows.length >= 2 ? splitBlocks(rows) : null;
    if (!split) {
      issues.push(makeIssue('error', 'no_transaction_section', undefined, { fileName }));
      return fail();
    }
    // A block carries its own header rows; in the combined report (§3.1.1) they
    // repeat per payout, so column issues are reported once per file, not per block.
    const blocks = split.blocks.map((sections) => ({
      sections,
      sumMap: headerMap(sections.summaryHeader),
      txMap: headerMap(sections.txHeader),
    }));

    if (blocks.every((b) => b.sections.summaryValues.length === 0)) {
      issues.push(makeIssue('error', 'no_payouts', undefined, { fileName }));
      return fail();
    }

    const reported = new Set<string>();
    const reportColumn = (severity: 'error' | 'info', col: string, section: 'summary' | 'transactions') => {
      if (reported.has(`${section}:${col}`)) return;
      reported.add(`${section}:${col}`);
      issues.push(
        severity === 'error'
          ? makeIssue('error', 'missing_required_column', { column: col, section }, { fileName })
          : makeIssue(
              'info',
              'missing_optional_column',
              { column: col, effect: missingColumnEffects[col] },
              { fileName },
            ),
      );
    };

    for (const { sumMap, txMap } of blocks) {
      for (const col of REQUIRED_SUMMARY) if (!sumMap.has(col)) reportColumn('error', col, 'summary');
      for (const col of REQUIRED_TX) if (!txMap.has(col)) reportColumn('error', col, 'transactions');
    }
    if (issues.some((i) => i.severity === 'error')) return fail();

    for (const { sumMap, txMap } of blocks) {
      for (const col of OPTIONAL_SUMMARY) if (!sumMap.has(col)) reportColumn('info', col, 'summary');
      for (const col of OPTIONAL_TX) if (!txMap.has(col)) reportColumn('info', col, 'transactions');
    }

    const get = (row: string[], map: Map<string, number>, col: string): string => {
      const idx = map.get(col);
      return idx === undefined ? '' : (row[idx] ?? '').trim();
    };

    // Decimal separator detection over every amount value in the file (§3.3),
    // across all blocks — the convention is a property of the file, not a block.
    const amountValues: string[] = [];
    for (const { sections, sumMap, txMap } of blocks) {
      for (const row of sections.summaryValues) {
        for (const col of ['total_settlement_amount', 'total_fee_amount', ...OPTIONAL_SUMMARY]) {
          const v = get(row, sumMap, col);
          if (v !== '') amountValues.push(v);
        }
      }
      for (const row of sections.txRows) {
        const v = get(row, txMap, 'amount');
        if (v !== '') amountValues.push(v);
      }
    }
    const decimalSep = detectDecimalSep(amountValues);
    if (decimalSep === 'mixed') {
      issues.push(makeIssue('error', 'mixed_decimals', undefined, { fileName }));
      return fail();
    }

    const parseAmount = (raw: string, line: number, sep: DecimalSep): number => {
      const cents = parseAmountCents(raw, sep);
      if (cents === null) throw new FileError(makeIssue('error', 'bad_amount', { value: raw, line }, { fileName }));
      return cents;
    };
    const parseDate = (raw: string, line: number): string => {
      const date = normalizeDate(raw);
      if (date === null) throw new FileError(makeIssue('error', 'bad_date', { value: raw, line }, { fileName }));
      return date;
    };

    const payouts: SummaryRow[] = [];
    const transactions: TransactionRow[] = [];

    for (const { sections, sumMap, txMap } of blocks) {
      const blockPayouts: SummaryRow[] = sections.summaryValues.map((row, i) => {
        const line = sections.summaryRowNumbers[i];
        const optional = (col: string): number => {
          const v = get(row, sumMap, col);
          return v === '' ? 0 : parseAmount(v, line, decimalSep);
        };
        return {
          payoutDate: parseDate(get(row, sumMap, 'payout_date'), line),
          settlementCents: parseAmount(get(row, sumMap, 'total_settlement_amount'), line, decimalSep),
          feeCents: parseAmount(get(row, sumMap, 'total_fee_amount'), line, decimalSep),
          commissionCents: optional('total_commission_amount'),
          taxCents: optional('total_tax_amount'),
          paymentReference: get(row, sumMap, 'payment_reference'),
        };
      });

      // §3.1.1: in the combined report the transaction rows carry no date —
      // it comes from the summary row of their own block.
      const blockDate = (paymentReference: string): string => {
        const match = blockPayouts.find((p) => p.paymentReference === paymentReference);
        if (match) return match.payoutDate;
        return blockPayouts.length === 1 ? blockPayouts[0].payoutDate : '';
      };

      for (const [i, row] of sections.txRows.entries()) {
        const line = sections.txRowNumbers[i];
        const paymentReference = get(row, txMap, 'payment_reference');
        const rawDate = get(row, txMap, 'payout_date');
        const inherited = rawDate === '' ? blockDate(paymentReference) : '';
        transactions.push({
          payoutDate: inherited !== '' ? inherited : parseDate(rawDate, line),
          type: get(row, txMap, 'type'),
          paymentReference,
          amountCents: parseAmount(get(row, txMap, 'amount'), line, decimalSep),
          orderId: get(row, txMap, 'order_id'),
          merchantReference1: get(row, txMap, 'merchant_reference1'),
          merchantReference2: get(row, txMap, 'merchant_reference2'),
          postingCurrency: get(row, txMap, 'posting_currency') || 'EUR',
          lineNumber: line,
        });
      }

      payouts.push(...blockPayouts);
    }

    return { fileName, payouts, transactions, issues, ok: true };
  } catch (e) {
    if (e instanceof FileError) {
      issues.push(e.issue);
      return fail();
    }
    throw e;
  }
}
