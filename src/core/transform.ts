// §4 transformation rules, §5 multi-file merge, §7 output building.

import { serializeCsv } from './csv.ts';
import { toIsoDate } from './detect.ts';
import { formatCents } from './money.ts';
import { parseSettlementFile, type SettlementFile, type SummaryRow, type TransactionRow } from './parse.ts';
import {
  buildShopifyIndex,
  lookupShopifyOrder,
  type ShopifyFileResult,
  type ShopifyIndex,
} from './shopify.ts';
import { makeIssue, validatePayout, type Issue } from './validate.ts';

export interface OutputRow {
  datum: string;
  auftragsart: string;
  zahlungsreferenz: string;
  buchungstext: string;
  empfaenger: string;
  betragCents: number;
  waehrung: string;
}

export interface Payout {
  fileName: string;
  paymentReference: string;
  payoutDate: string; // DD.MM.YYYY
  settlementCents: number;
  feeCents: number;
  commissionCents: number;
  taxCents: number;
  /** true ⇒ Klarna withheld VAT on the fees and it was merged into the Gebühren row (§4.4). */
  taxMerged: boolean;
  /** Number of kept transaction rows (after dropping FEE/COMMISSION). */
  transactionCount: number;
  /** Kept rows without a Shopify match (§4.5); 0 without a Shopify export. */
  shopifyUnmatched: number;
  outputRows: OutputRow[];
  balanceCents: number;
  issues: Issue[];
}

const DROPPED_TYPES = new Set(['FEE', 'COMMISSION']);
const NEGATED_TYPES = new Set(['RETURN', 'REVERSAL']);
const KNOWN_TYPES = new Set(['SALE', 'FEE', 'COMMISSION', 'RETURN', 'REVERSAL']);

export const OUTPUT_HEADER = [
  'Datum',
  'Auftragsart',
  'Zahlungsreferenz',
  'Buchungstext',
  'Empfänger/Zahlungspflichtiger',
  'Betrag',
  'Währung',
];

function transformPayout(
  summary: SummaryRow,
  transactions: TransactionRow[],
  fileName: string,
  shopify?: ShopifyIndex,
): Payout {
  const issues: Issue[] = [];
  const scope = { fileName, paymentReference: summary.paymentReference };
  const kept = transactions.filter((t) => !DROPPED_TYPES.has(t.type.toUpperCase()));

  // Unknown types are kept with original sign, one info issue per type (§4.2).
  const unknownLines = new Map<string, number[]>();
  for (const t of kept) {
    if (!KNOWN_TYPES.has(t.type.toUpperCase())) {
      const lines = unknownLines.get(t.type) ?? [];
      lines.push(t.lineNumber);
      unknownLines.set(t.type, lines);
    }
  }
  for (const [type, lines] of unknownLines) {
    issues.push(makeIssue('info', 'unknown_type', { type, lines: lines.join(', ') }, scope));
  }

  // §4.5: with a Shopify export loaded, matched rows show the customer name and
  // the Shopify order number instead of the payment-session id. A matched order
  // without a billing name keeps the Klarna value rather than blanking it.
  const matching = shopify !== undefined && shopify.size > 0;
  let shopifyUnmatched = 0;

  const outputRows: OutputRow[] = kept.map((t) => {
    const match = matching
      ? lookupShopifyOrder(shopify, t.merchantReference1, t.merchantReference2)
      : undefined;
    if (matching && match === undefined) shopifyUnmatched++;
    return {
      datum: t.payoutDate,
      auftragsart: t.type,
      zahlungsreferenz: t.paymentReference,
      buchungstext: match?.orderName || t.orderId,
      empfaenger: match?.billingName || t.merchantReference1,
      betragCents: NEGATED_TYPES.has(t.type.toUpperCase())
        ? -Math.abs(t.amountCents)
        : t.amountCents,
      waehrung: t.postingCurrency,
    };
  });

  const generated = (auftragsart: string, empfaenger: string, betragCents: number): OutputRow => ({
    datum: summary.payoutDate,
    auftragsart,
    zahlungsreferenz: summary.paymentReference,
    buchungstext: '',
    empfaenger,
    betragCents,
    waehrung: 'EUR',
  });

  // §4.4: tax merged into fees; §4.3: skip Gebühren/Kommissionen at exactly 0.
  const feesCents = summary.feeCents + summary.taxCents;
  if (feesCents !== 0) outputRows.push(generated('Gebühren', 'Klarna Gebühren', feesCents));
  if (summary.commissionCents !== 0) {
    outputRows.push(generated('Kommissionen', 'Klarna Kommissionen', summary.commissionCents));
  }
  outputRows.push(generated('Auszahlung', 'Klarna Auszahlung', -Math.abs(summary.settlementCents)));

  issues.push(...validatePayout(summary.paymentReference, outputRows, fileName));

  return {
    fileName,
    paymentReference: summary.paymentReference,
    payoutDate: summary.payoutDate,
    settlementCents: summary.settlementCents,
    feeCents: summary.feeCents,
    commissionCents: summary.commissionCents,
    taxCents: summary.taxCents,
    taxMerged: summary.taxCents !== 0,
    transactionCount: kept.length,
    shopifyUnmatched,
    outputRows,
    balanceCents: outputRows.reduce((sum, r) => sum + r.betragCents, 0),
    issues,
  };
}

/** Apply §4 to one parsed file: one Payout per summary row. */
export function transformFile(
  file: SettlementFile,
  shopify?: ShopifyIndex,
): { payouts: Payout[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const refs = new Set(file.payouts.map((p) => p.paymentReference));

  // Transactions not belonging to any payout would silently vanish — block.
  const orphanCounts = new Map<string, number>();
  for (const t of file.transactions) {
    if (!refs.has(t.paymentReference)) {
      orphanCounts.set(t.paymentReference, (orphanCounts.get(t.paymentReference) ?? 0) + 1);
    }
  }
  for (const [ref, count] of orphanCounts) {
    issues.push(
      makeIssue('blocking', 'orphan_transactions', { ref, count }, { fileName: file.fileName }),
    );
  }

  const payouts = file.payouts.map((summary) =>
    transformPayout(
      summary,
      file.transactions.filter((t) => t.paymentReference === summary.paymentReference),
      file.fileName,
      shopify,
    ),
  );
  return { payouts, issues };
}

/**
 * §5: merge payouts of all files (in add order), rejecting duplicate
 * payment_references (first occurrence wins), sorted by payout_date then
 * payment_reference.
 */
export function mergePayouts(files: { fileName: string; payouts: Payout[] }[]): {
  payouts: Payout[];
  issues: Issue[];
} {
  const issues: Issue[] = [];
  const seen = new Map<string, string>(); // payment_reference -> fileName
  const accepted: Payout[] = [];
  for (const file of files) {
    for (const payout of file.payouts) {
      const firstFile = seen.get(payout.paymentReference);
      if (firstFile !== undefined) {
        issues.push(
          makeIssue(
            'error',
            'duplicate_payment_reference',
            { ref: payout.paymentReference, firstFile, secondFile: file.fileName },
            { fileName: file.fileName, paymentReference: payout.paymentReference },
          ),
        );
      } else {
        seen.set(payout.paymentReference, file.fileName);
        accepted.push(payout);
      }
    }
  }
  accepted.sort((a, b) => {
    const dateCmp = toIsoDate(a.payoutDate).localeCompare(toIsoDate(b.payoutDate));
    return dateCmp !== 0 ? dateCmp : a.paymentReference.localeCompare(b.paymentReference);
  });
  return { payouts: accepted, issues };
}

export interface FileResult {
  file: SettlementFile;
  payouts: Payout[];
}

export interface ConversionResult {
  files: FileResult[];
  /** One entry per added Shopify order export (§3.5); empty without them. */
  shopifyFiles: ShopifyFileResult[];
  /** Accepted payouts, merged and sorted (§5). */
  payouts: Payout[];
  /** Every issue: file-level, transform-level, merge-level, accepted-payout-level. */
  issues: Issue[];
  csv: string;
  filename: string;
}

/**
 * The whole pipeline: bytes per file -> merged, validated conversion result.
 * Shopify order exports are optional (§4.5); without them nothing changes.
 */
export function convertFiles(
  inputs: { fileName: string; bytes: Uint8Array }[],
  shopifyInputs: { fileName: string; bytes: Uint8Array }[] = [],
): ConversionResult {
  const issues: Issue[] = [];
  const shopify = buildShopifyIndex(shopifyInputs);
  issues.push(...shopify.issues);

  const files: FileResult[] = inputs.map(({ fileName, bytes }) => {
    const file = parseSettlementFile(bytes, fileName);
    issues.push(...file.issues);
    if (!file.ok) return { file, payouts: [] };
    const t = transformFile(file, shopify.index);
    issues.push(...t.issues);
    return { file, payouts: t.payouts };
  });
  const merged = mergePayouts(files.map((f) => ({ fileName: f.file.fileName, payouts: f.payouts })));
  issues.push(...merged.issues);
  for (const p of merged.payouts) issues.push(...p.issues);

  // One info notice for all rows that stayed unmatched (§4.5) — never blocking.
  const unmatched = merged.payouts.reduce((sum, p) => sum + p.shopifyUnmatched, 0);
  if (unmatched > 0) {
    const total = merged.payouts.reduce((sum, p) => sum + p.transactionCount, 0);
    issues.push(makeIssue('info', 'shopify_unmatched', { count: unmatched, total }));
  }

  const { csv, filename } = buildOutput(merged.payouts);
  return { files, shopifyFiles: shopify.files, payouts: merged.payouts, issues, csv, filename };
}

/** §7: build the final CSV (BOM + all fields quoted + CRLF) and its filename. */
export function buildOutput(payouts: Payout[]): { csv: string; filename: string } {
  const rows: string[][] = [OUTPUT_HEADER];
  for (const payout of payouts) {
    for (const r of payout.outputRows) {
      rows.push([
        r.datum,
        r.auftragsart,
        r.zahlungsreferenz,
        r.buchungstext,
        r.empfaenger,
        formatCents(r.betragCents),
        r.waehrung,
      ]);
    }
  }
  const dates = payouts.map((p) => toIsoDate(p.payoutDate)).sort();
  const first = dates[0] ?? 'leer';
  const last = dates[dates.length - 1];
  const range = first === last || dates.length === 0 ? first : `${first}_${last}`;
  return {
    csv: '\uFEFF' + serializeCsv(rows),
    filename: `klarna-buchhaltungsbutler_${range}.csv`,
  };
}
