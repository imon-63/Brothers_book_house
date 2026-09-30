export type CsvCell = string | number | boolean | null | undefined;

/** RFC 4180 cell: quote when needed; neutralise spreadsheet formula injection. */
export function csvCell(v: CsvCell): string {
  if (v == null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV with a UTF-8 BOM so Excel shows Bangla correctly. */
export function toCsv(rows: CsvCell[][]): string {
  return `\uFEFF${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
