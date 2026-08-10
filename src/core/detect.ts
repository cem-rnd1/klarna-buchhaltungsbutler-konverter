// Auto-detection at the input boundary: encoding, section split, decimal
// separator, date format. All per file, never global.

import type { DecimalSep } from './money.ts';

/**
 * Decode CSV bytes: UTF-8 first (BOM stripped); if that produces replacement
 * characters, fall back to windows-1252.
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf8;
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

export interface Sections {
  summaryHeader: string[];
  summaryValues: string[][];
  /** 1-based line numbers of the summary value rows (for messages). */
  summaryRowNumbers: number[];
  txHeader: string[];
  txRows: string[][];
  /** 1-based line numbers of the transaction rows (for messages). */
  txRowNumbers: number[];
}

export interface FileBlocks {
  /** One block per payout section; individual reports yield exactly one. */
  blocks: Sections[];
  /** true ⇒ a leading `summary_`-prefixed overall section was recognized and skipped (§3.1.1). */
  hasOverallSummary: boolean;
}

const norm = (f: string) => f.trim().toLowerCase();

/** The section boundary marker of §3.1: header row of a transaction list. */
function isTxHeader(row: string[]): boolean {
  const names = row.map(norm);
  return names.includes('type') && names.includes('amount');
}

/**
 * Header row of a per-payout summary section. `total_settlement_amount` may be
 * missing (that is a missing-required-column error, not a reason to misread the
 * row as data), hence the `payment_reference` fallback.
 */
function isSummaryHeader(row: string[]): boolean {
  const names = row.map(norm);
  return (
    names.includes('payout_date') &&
    (names.includes('total_settlement_amount') || names.includes('payment_reference'))
  );
}

/** Header row of the combined report's overall summary section (§3.1.1). */
function isOverallSummaryHeader(row: string[]): boolean {
  const names = row.map(norm).filter((n) => n !== '');
  return names.length > 0 && names.every((n) => n.startsWith('summary_'));
}

function isHeader(row: string[]): boolean {
  return isTxHeader(row) || isSummaryHeader(row) || isOverallSummaryHeader(row);
}

/**
 * Split parsed rows into payout blocks (§3.1, §3.1.1). Individual reports are
 * the single-block case; the combined report repeats summary + transaction
 * sections and is preceded by an overall `summary_`-prefixed section, which is
 * recognized and skipped. Returns null if no complete block is found.
 */
export function splitBlocks(rows: string[][]): FileBlocks | null {
  const blocks: Sections[] = [];
  let hasOverallSummary = false;
  let i = 0;

  // Skip the overall summary section and its value rows, if present.
  if (rows.length > 0 && isOverallSummaryHeader(rows[0])) {
    hasOverallSummary = true;
    i = 1;
    while (i < rows.length && !isHeader(rows[i])) i++;
  }

  // The first block's summary header is simply the first row (whatever its
  // columns are, so missing required columns stay reportable as such); every
  // further block must announce itself with a recognizable summary header.
  let first = true;

  while (i < rows.length) {
    if (isTxHeader(rows[i]) || (!first && !isSummaryHeader(rows[i]))) {
      i++;
      continue;
    }
    first = false;
    const summaryHeader = rows[i];
    const summaryStart = ++i;
    while (i < rows.length && !isHeader(rows[i])) i++;
    const summaryValues = rows.slice(summaryStart, i);
    if (i >= rows.length || !isTxHeader(rows[i])) continue; // no transaction list ⇒ not a block
    const txHeader = rows[i];
    const txStart = ++i;
    while (i < rows.length && !isHeader(rows[i])) i++;
    blocks.push({
      summaryHeader,
      summaryValues,
      summaryRowNumbers: summaryValues.map((_, n) => summaryStart + 1 + n),
      txHeader,
      txRows: rows.slice(txStart, i),
      txRowNumbers: rows.slice(txStart, i).map((_, n) => txStart + 1 + n),
    });
  }

  return blocks.length > 0 ? { blocks, hasOverallSummary } : null;
}

/**
 * Single-section variant of {@link splitBlocks}: the classic individual report
 * (one summary section followed by one transaction list).
 */
export function splitSections(rows: string[][]): Sections | null {
  const split = splitBlocks(rows);
  return split && split.blocks.length === 1 && !split.hasOverallSummary ? split.blocks[0] : null;
}

/**
 * Detect the decimal separator from all amount strings of a file.
 * Returns 'mixed' if the file uses conflicting conventions.
 * No evidence (integers only) defaults to comma (the documented setting).
 */
export function detectDecimalSep(values: string[]): DecimalSep | 'mixed' {
  let commaVotes = 0;
  let pointVotes = 0;
  for (const raw of values) {
    const v = raw.trim();
    const lastComma = v.lastIndexOf(',');
    const lastPoint = v.lastIndexOf('.');
    if (lastComma >= 0 && lastPoint >= 0) {
      // Both present: the right-most one is the decimal separator.
      if (lastComma > lastPoint) commaVotes++;
      else pointVotes++;
    } else if (lastComma >= 0 || lastPoint >= 0) {
      // Only one present: 1–2 trailing digits ⇒ decimal; otherwise no vote
      // (could be a thousands separator).
      const sep = lastComma >= 0 ? lastComma : lastPoint;
      const trailing = v.length - sep - 1;
      if (trailing >= 1 && trailing <= 2 && /^\d+$/.test(v.slice(sep + 1))) {
        if (lastComma >= 0) commaVotes++;
        else pointVotes++;
      }
    }
  }
  if (commaVotes > 0 && pointVotes > 0) return 'mixed';
  if (pointVotes > 0) return '.';
  return ',';
}

/**
 * Normalize a date to DD.MM.YYYY. Accepts DD.MM.YYYY and YYYY-MM-DD.
 * Returns null for anything else.
 */
export function normalizeDate(raw: string): string | null {
  const v = raw.trim();
  let day: string, month: string, year: string;
  let m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(v);
  if (m) {
    [, day, month, year] = m;
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return null;
    [, year, month, day] = m;
  }
  const mo = parseInt(month, 10);
  const d = parseInt(day, 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${day}.${month}.${year}`;
}

/** DD.MM.YYYY → YYYY-MM-DD (for sorting and the download filename). */
export function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split('.');
  return `${y}-${m}-${d}`;
}
