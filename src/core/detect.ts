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

/**
 * Sniff the field separator of a foreign CSV (Shopify order exports are
 * comma-separated, but a re-save in a German Excel turns them into semicolons).
 * Counts both candidates on the first non-empty line, ignoring quoted parts;
 * comma only wins when it is strictly more frequent. Klarna reports are not
 * sniffed — their dialect is fixed by the report configuration.
 */
export function detectDelimiter(text: string): string {
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      continue;
    } else if (ch === ',') {
      commas++;
    } else if (ch === ';') {
      semicolons++;
    } else if (ch === '\n' || ch === '\r') {
      if (commas > 0 || semicolons > 0) break; // first non-empty line seen
    }
  }
  return commas > semicolons ? ',' : ';';
}

export interface Sections {
  summaryHeader: string[];
  summaryValues: string[][];
  txHeader: string[];
  txRows: string[][];
  /** 1-based line numbers of the transaction rows (for messages). */
  txRowNumbers: number[];
}

/**
 * Split parsed rows into summary section and transaction list. The transaction
 * header row is the first row containing both `type` and `amount` headers.
 * Returns null if no transaction header is found or the summary is malformed.
 */
export function splitSections(rows: string[][]): Sections | null {
  const norm = (f: string) => f.trim().toLowerCase();
  let txHeaderIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    const names = rows[i].map(norm);
    if (names.includes('type') && names.includes('amount')) {
      txHeaderIdx = i;
      break;
    }
  }
  if (txHeaderIdx < 1) return null;
  return {
    summaryHeader: rows[0],
    summaryValues: rows.slice(1, txHeaderIdx),
    txHeader: rows[txHeaderIdx],
    txRows: rows.slice(txHeaderIdx + 1),
    txRowNumbers: rows.slice(txHeaderIdx + 1).map((_, i) => txHeaderIdx + 2 + i),
  };
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
