import { describe, expect, it } from 'vitest';
import {
  decodeCsvBytes,
  detectDecimalSep,
  normalizeDate,
  splitBlocks,
  splitSections,
  toIsoDate,
} from '../src/core/detect.ts';

describe('decodeCsvBytes', () => {
  it('decodes UTF-8 and strips the BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Gebühren')]);
    expect(decodeCsvBytes(bytes)).toBe('Gebühren');
  });

  it('falls back to windows-1252 when UTF-8 decoding fails', () => {
    // 0xE4 is 'ä' in windows-1252 but invalid standalone in UTF-8.
    const bytes = new Uint8Array([0x47, 0x65, 0x62, 0xe4, 0x68, 0x72]); // "Gebähr"... "Geb\xE4hr"
    expect(decodeCsvBytes(bytes)).toBe('Gebähr');
  });
});

describe('detectDecimalSep', () => {
  it('uses the right-most separator when both appear', () => {
    expect(detectDecimalSep(['1.234,56'])).toBe(',');
    expect(detectDecimalSep(['1,234.56'])).toBe('.');
  });

  it('uses a single separator with 1-2 trailing digits', () => {
    expect(detectDecimalSep(['172,30', '-5,71'])).toBe(',');
    expect(detectDecimalSep(['172.30', '-5.71'])).toBe('.');
    expect(detectDecimalSep(['5,5'])).toBe(',');
  });

  it('ignores separators with 3 trailing digits (thousands) and defaults to comma', () => {
    expect(detectDecimalSep(['1.234'])).toBe(',');
    expect(detectDecimalSep(['1.234', '12,50'])).toBe(',');
  });

  it('defaults to comma when there is no evidence', () => {
    expect(detectDecimalSep(['100', '-7'])).toBe(',');
    expect(detectDecimalSep([])).toBe(',');
  });

  it('reports mixed conventions', () => {
    expect(detectDecimalSep(['1,50', '2.50'])).toBe('mixed');
  });
});

describe('normalizeDate', () => {
  it('accepts DD.MM.YYYY', () => {
    expect(normalizeDate('01.01.2026')).toBe('01.01.2026');
    expect(normalizeDate(' 30.07.2026 ')).toBe('30.07.2026');
  });

  it('accepts YYYY-MM-DD and converts it', () => {
    expect(normalizeDate('2026-06-04')).toBe('04.06.2026');
  });

  it('rejects other formats and impossible dates', () => {
    expect(normalizeDate('1.1.2026')).toBeNull();
    expect(normalizeDate('2026/01/01')).toBeNull();
    expect(normalizeDate('32.01.2026')).toBeNull();
    expect(normalizeDate('01.13.2026')).toBeNull();
    expect(normalizeDate('')).toBeNull();
  });
});

describe('toIsoDate', () => {
  it('converts DD.MM.YYYY to YYYY-MM-DD', () => {
    expect(toIsoDate('04.06.2026')).toBe('2026-06-04');
  });
});

describe('splitSections', () => {
  it('finds the transaction header by type+amount', () => {
    const rows = [
      ['payout_date', 'total_settlement_amount', 'payment_reference'],
      ['01.01.2026', '100,00', 'ref1'],
      ['02.01.2026', '50,00', 'ref2'],
      ['payout_date', 'type', 'payment_reference', 'amount'],
      ['01.01.2026', 'SALE', 'ref1', '100,00'],
    ];
    const s = splitSections(rows)!;
    expect(s.summaryValues).toHaveLength(2);
    expect(s.txRows).toHaveLength(1);
    expect(s.txHeader[1]).toBe('type');
    expect(s.txRowNumbers).toEqual([5]);
  });

  it('returns null when no transaction header exists', () => {
    expect(
      splitSections([
        ['payout_date', 'total_settlement_amount'],
        ['01.01.2026', '100,00'],
      ]),
    ).toBeNull();
  });
});

describe('splitBlocks', () => {
  const SUMMARY = ['payout_date', 'total_settlement_amount', 'payment_reference'];
  const TX = ['payout_date', 'type', 'payment_reference', 'amount'];

  it('reads an individual report as a single block', () => {
    const split = splitBlocks([SUMMARY, ['01.01.2026', '100,00', 'ref1'], TX, ['01.01.2026', 'SALE', 'ref1', '100,00']])!;
    expect(split.hasOverallSummary).toBe(false);
    expect(split.blocks).toHaveLength(1);
    expect(split.blocks[0].summaryValues).toEqual([['01.01.2026', '100,00', 'ref1']]);
    expect(split.blocks[0].summaryRowNumbers).toEqual([2]);
    expect(split.blocks[0].txRowNumbers).toEqual([4]);
  });

  it('splits repeated summary + transaction sections into one block per payout', () => {
    const split = splitBlocks([
      SUMMARY,
      ['01.01.2026', '100,00', 'ref1'],
      TX,
      ['', 'SALE', 'ref1', '100,00'],
      ['', 'SALE', 'ref1', '50,00'],
      SUMMARY,
      ['02.02.2026', '20,00', 'ref2'],
      TX,
      ['', 'SALE', 'ref2', '20,00'],
    ])!;
    expect(split.blocks).toHaveLength(2);
    expect(split.blocks[0].txRows).toHaveLength(2);
    expect(split.blocks[0].txRowNumbers).toEqual([4, 5]);
    expect(split.blocks[1].summaryValues).toEqual([['02.02.2026', '20,00', 'ref2']]);
    expect(split.blocks[1].summaryRowNumbers).toEqual([7]);
    expect(split.blocks[1].txRowNumbers).toEqual([9]);
  });

  it('recognizes and skips the leading summary_-prefixed overall section', () => {
    const split = splitBlocks([
      ['summary_total_settlement_amount', 'summary_payout_date_start', 'summary_payout_date_end'],
      ['100,00', '01.01.2026', '02.02.2026'],
      SUMMARY,
      ['01.01.2026', '100,00', 'ref1'],
      TX,
      ['', 'SALE', 'ref1', '100,00'],
    ])!;
    expect(split.hasOverallSummary).toBe(true);
    expect(split.blocks).toHaveLength(1);
    expect(split.blocks[0].summaryHeader).toEqual(SUMMARY);
    expect(split.blocks[0].summaryRowNumbers).toEqual([4]);
  });

  it('returns null when no block has a transaction list', () => {
    expect(splitBlocks([SUMMARY, ['01.01.2026', '100,00', 'ref1']])).toBeNull();
    expect(splitBlocks([])).toBeNull();
  });
});
