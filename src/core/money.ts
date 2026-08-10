// Integer-cent arithmetic and formatting. Amounts are never floats.

export type DecimalSep = ',' | '.';

/**
 * Parse an amount string to integer cents using the given decimal separator.
 * The other separator is treated as thousands separator. Returns null if the
 * string is not a valid amount.
 */
export function parseAmountCents(raw: string, decimalSep: DecimalSep): number | null {
  const thousandsSep = decimalSep === ',' ? '.' : ',';
  let s = raw.trim();
  if (s === '') return null;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  s = s.split(thousandsSep).join('');
  const parts = s.split(decimalSep);
  if (parts.length > 2) return null;
  const [intPart, fracPart = ''] = parts;
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;
  const cents = parseInt(intPart, 10) * 100 + parseInt(fracPart.padEnd(2, '0') || '0', 10);
  return negative ? -cents : cents;
}

/** Format integer cents as `-172,30`: decimal comma, two decimals, no thousands separator. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}${euros},${String(rest).padStart(2, '0')}`;
}

/** Format integer cents for the UI, e.g. `-172,30 €`. */
export function formatCentsEur(cents: number): string {
  return `${formatCents(cents)} €`;
}
