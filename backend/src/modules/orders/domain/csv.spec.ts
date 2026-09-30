import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });

  it('blocks formula injection but keeps negative numbers', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-5)).toBe('-5');
  });

  it('prefixes a BOM and uses CRLF', () => {
    expect(toCsv([['id', 'নাম'], ['CLO-1', 'রাফি']])).toBe('﻿id,নাম\r\nCLO-1,রাফি\r\n');
  });
});
