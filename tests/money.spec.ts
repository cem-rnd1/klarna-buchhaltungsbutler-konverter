import { describe, expect, it } from 'vitest';
import { formatCents, formatCentsEur, parseAmountCents } from '../src/core/money.ts';

describe('parseAmountCents', () => {
  it('parses comma-decimal amounts', () => {
    expect(parseAmountCents('172,30', ',')).toBe(17230);
    expect(parseAmountCents('-20,00', ',')).toBe(-2000);
    expect(parseAmountCents('0,00', ',')).toBe(0);
    expect(parseAmountCents('5,5', ',')).toBe(550);
  });

  it('parses comma-decimal amounts with point thousands separator', () => {
    expect(parseAmountCents('1.234,56', ',')).toBe(123456);
    expect(parseAmountCents('-1.234.567,89', ',')).toBe(-123456789);
  });

  it('parses point-decimal amounts', () => {
    expect(parseAmountCents('172.30', '.')).toBe(17230);
    expect(parseAmountCents('1,234.56', '.')).toBe(123456);
    expect(parseAmountCents('-0.35', '.')).toBe(-35);
  });

  it('parses integer amounts', () => {
    expect(parseAmountCents('100', ',')).toBe(10000);
    expect(parseAmountCents('-7', '.')).toBe(-700);
  });

  it('rejects invalid amounts', () => {
    expect(parseAmountCents('', ',')).toBeNull();
    expect(parseAmountCents('abc', ',')).toBeNull();
    expect(parseAmountCents('1,2,3', ',')).toBeNull();
    expect(parseAmountCents('12,345', ',')).toBeNull(); // 3 decimal digits
    expect(parseAmountCents('--5', ',')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats with decimal comma, two decimals, no thousands separator', () => {
    expect(formatCents(17230)).toBe('172,30');
    expect(formatCents(-17230)).toBe('-172,30');
    expect(formatCents(123456)).toBe('1234,56');
    expect(formatCents(0)).toBe('0,00');
    expect(formatCents(5)).toBe('0,05');
    expect(formatCents(-5)).toBe('-0,05');
  });

  it('formats EUR for the UI', () => {
    expect(formatCentsEur(-1639)).toBe('-16,39 €');
  });
});
