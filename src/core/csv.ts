// RFC-4180-ish CSV parser and serializer. Klarna reports use the semicolon
// dialect; Shopify order exports are comma-separated, hence the `sep` parameter.

const SEP = ';';

/**
 * Parse separated CSV (semicolon by default). Handles double-quoted fields,
 * `""` escapes, separators and line breaks inside quotes, and CRLF/LF endings.
 */
export function parseCsv(text: string, sep: string = SEP): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
    } else if (ch === sep) {
      endField();
      i++;
    } else if (ch === '\r' && text[i + 1] === '\n') {
      endRow();
      i += 2;
    } else if (ch === '\n' || ch === '\r') {
      endRow();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== '' || row.length > 0) endRow();

  // Drop rows that are entirely empty (e.g. trailing blank lines).
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** Serialize rows as semicolon-separated CSV: all fields quoted, CRLF endings. */
export function serializeCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((f) => `"${f.replace(/"/g, '""')}"`).join(SEP) + '\r\n')
    .join('');
}
