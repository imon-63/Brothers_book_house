import { CSV_BOM, toCsv } from './csv';

describe('toCsv', () => {
  it('starts with a BOM and uses CRLF', () => {
    const out = toCsv([['a', 'b'], [1, 2]]);
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out.slice(1)).toBe('a,b\r\n1,2\r\n');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['x,y', 'say "hi"', 'l1\nl2']]).slice(1)).toBe('"x,y","say ""hi""","l1\nl2"\r\n');
  });
  it('renders null as empty, booleans as yes/no, keeps Bangla', () => {
    expect(toCsv([[null, undefined, true, false, 'বই']]).slice(1)).toBe(',,yes,no,বই\r\n');
  });
  it('neutralises formula injection in text but not numbers', () => {
    expect(toCsv([['=HYPERLINK("x")', '-5', -5]]).slice(1)).toBe(`"'=HYPERLINK(""x"")",'-5,-5\r\n`);
  });
});
