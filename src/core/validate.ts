// §6 checks and the structured Issue model shared by parse/transform.

import { issueMessages, type IssueCode } from '../ui/strings.ts';
import type { OutputRow } from './transform.ts';

export type Severity = 'error' | 'blocking' | 'info';

export interface Issue {
  severity: Severity;
  code: IssueCode;
  messageDe: string;
  fileName?: string;
  paymentReference?: string;
}

/** Build an Issue with its German message from the strings module. */
export function makeIssue<C extends IssueCode>(
  severity: Severity,
  code: C,
  params: Parameters<(typeof issueMessages)[C]>[0],
  scope: { fileName?: string; paymentReference?: string } = {},
): Issue {
  const build = issueMessages[code] as (p: unknown) => string;
  return { severity, code, messageDe: build(params), ...scope };
}

/**
 * §6.1.1: a payout of exactly 0 whose rows net negative is Klarna withholding
 * nothing because there was nothing to pay out — the shortfall stays open on
 * the Klarna account. Returns that open balance (negative), else 0.
 */
export function openBalanceCents(settlementCents: number, balanceCents: number): number {
  return settlementCents === 0 && balanceCents < 0 ? balanceCents : 0;
}

/**
 * §6.1 zero-sum balance check plus §6.2 row-level blocking checks
 * (non-EUR currency, positive Gebühren/Kommissionen), all computable from the
 * final output rows of one payout.
 */
export function validatePayout(
  paymentReference: string,
  outputRows: OutputRow[],
  settlementCents: number,
  fileName: string,
): Issue[] {
  const issues: Issue[] = [];
  const scope = { fileName, paymentReference };

  const balance = outputRows.reduce((sum, r) => sum + r.betragCents, 0);
  const open = openBalanceCents(settlementCents, balance);
  if (open !== 0) {
    issues.push(makeIssue('info', 'open_balance', { ref: paymentReference, amountCents: open }, scope));
  } else if (balance !== 0) {
    issues.push(
      makeIssue('blocking', 'balance_mismatch', { ref: paymentReference, diffCents: balance }, scope),
    );
  }

  const nonEur = [
    ...new Set(
      outputRows.map((r) => r.waehrung).filter((w) => w.toUpperCase() !== 'EUR'),
    ),
  ];
  if (nonEur.length > 0) {
    issues.push(
      makeIssue(
        'blocking',
        'non_eur_currency',
        { ref: paymentReference, currencies: nonEur.join(', ') },
        scope,
      ),
    );
  }

  for (const row of outputRows) {
    if (row.auftragsart === 'Gebühren' && row.betragCents > 0) {
      issues.push(
        makeIssue('blocking', 'positive_fees', { ref: paymentReference, amountCents: row.betragCents }, scope),
      );
    }
    if (row.auftragsart === 'Kommissionen' && row.betragCents > 0) {
      issues.push(
        makeIssue(
          'blocking',
          'positive_commission',
          { ref: paymentReference, amountCents: row.betragCents },
          scope,
        ),
      );
    }
  }

  return issues;
}
