import { describe, expect, it } from 'vitest';
import { parseCsv, serializeCsv } from '../src/core/csv.ts';

describe('parseCsv', () => {
  it('parses unquoted semicolon-separated fields', () => {
    expect(parseCsv('a;b\r\nc;d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('parses quoted fields containing semicolons', () => {
    expect(parseCsv('"a;b";"c"')).toEqual([['a;b', 'c']]);
  });

  it('unescapes "" inside quoted fields', () => {
    expect(parseCsv('"say ""hi""";"x"')).toEqual([['say "hi"', 'x']]);
  });

  it('keeps line breaks inside quoted fields', () => {
    expect(parseCsv('"line1\nline2";"x"\r\n"y";"z"')).toEqual([
      ['line1\nline2', 'x'],
      ['y', 'z'],
    ]);
  });

  it('handles LF, CRLF and lone CR line endings', () => {
    expect(parseCsv('a;b\nc;d\r\ne;f\rg;h')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
      ['g', 'h'],
    ]);
  });

  it('preserves empty fields', () => {
    expect(parseCsv('a;;b')).toEqual([['a', '', 'b']]);
  });

  it('drops fully empty rows and trailing newlines', () => {
    expect(parseCsv('a;b\r\n\r\n;\r\nc;d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('treats quotes after field content as literal characters', () => {
    expect(parseCsv('ab"c";d')).toEqual([['ab"c"', 'd']]);
  });
});

describe('serializeCsv', () => {
  it('quotes all fields, escapes quotes, uses CRLF endings', () => {
    expect(serializeCsv([['a', 'b"c'], ['d;e', '']])).toBe('"a";"b""c"\r\n"d;e";""\r\n');
  });

  it('round-trips through parseCsv', () => {
    const rows = [['a;b', 'x"y', 'line1\nline2', '']];
    expect(parseCsv(serializeCsv(rows))).toEqual([['a;b', 'x"y', 'line1\nline2', '']]);
  });
});
