// Raw CSV bytes -> typed SettlementFile. All format auto-detection happens
// here (§3); any file-level error empties the result and is reported as Issue.

import { parseCsv } from './csv.ts';
import { decodeCsvBytes, detectDecimalSep, normalizeDate, splitSections } from './detect.ts';
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
    const sections = rows.length >= 2 ? splitSections(rows) : null;
    if (!sections) {
      issues.push(makeIssue('error', 'no_transaction_section', undefined, { fileName }));
      return fail();
    }
    if (sections.summaryValues.length === 0) {
      issues.push(makeIssue('error', 'no_payouts', undefined, { fileName }));
      return fail();
    }

    const sumMap = headerMap(sections.summaryHeader);
    const txMap = headerMap(sections.txHeader);

    for (const col of REQUIRED_SUMMARY) {
      if (!sumMap.has(col)) {
        issues.push(makeIssue('error', 'missing_required_column', { column: col, section: 'summary' }, { fileName }));
      }
    }
    for (const col of REQUIRED_TX) {
      if (!txMap.has(col)) {
        issues.push(
          makeIssue('error', 'missing_required_column', { column: col, section: 'transactions' }, { fileName }),
        );
      }
    }
    if (issues.some((i) => i.severity === 'error')) return fail();

    for (const col of [...OPTIONAL_SUMMARY, ...OPTIONAL_TX]) {
      const map = OPTIONAL_SUMMARY.includes(col) ? sumMap : txMap;
      if (!map.has(col)) {
        issues.push(
          makeIssue(
            'info',
            'missing_optional_column',
            { column: col, effect: missingColumnEffects[col] },
            { fileName },
          ),
        );
      }
    }

    const get = (row: string[], map: Map<string, number>, col: string): string => {
      const idx = map.get(col);
      return idx === undefined ? '' : (row[idx] ?? '').trim();
    };

    // Decimal separator detection over every amount value in the file (§3.3).
    const amountValues: string[] = [];
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

    const payouts: SummaryRow[] = sections.summaryValues.map((row, i) => {
      const line = i + 2; // row 1 is the summary header
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

    const transactions: TransactionRow[] = sections.txRows.map((row, i) => {
      const line = sections.txRowNumbers[i];
      return {
        payoutDate: parseDate(get(row, txMap, 'payout_date'), line),
        type: get(row, txMap, 'type'),
        paymentReference: get(row, txMap, 'payment_reference'),
        amountCents: parseAmount(get(row, txMap, 'amount'), line, decimalSep),
        orderId: get(row, txMap, 'order_id'),
        merchantReference1: get(row, txMap, 'merchant_reference1'),
        postingCurrency: get(row, txMap, 'posting_currency') || 'EUR',
        lineNumber: line,
      };
    });

    return { fileName, payouts, transactions, issues, ok: true };
  } catch (e) {
    if (e instanceof FileError) {
      issues.push(e.issue);
      return fail();
    }
    throw e;
  }
}
