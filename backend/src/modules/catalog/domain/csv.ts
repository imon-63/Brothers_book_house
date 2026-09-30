export type CsvCell = string | number | boolean | null | undefined;

/** UTF-8 BOM so Excel opens Bangla text correctly. */
export const CSV_BOM = '﻿';

/**
 * RFC 4180 CSV (CRLF, quoted when needed) with a BOM. Text cells that start
 * with = + - @ are prefixed with ' so spreadsheets never run them as formulas
 * (CSV injection); numbers are left alone.
 */
export function toCsv(rows: CsvCell[][]): string {
  return CSV_BOM + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

function cell(v: CsvCell): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
