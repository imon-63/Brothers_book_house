import { pickUniqueSlug, slugBase, tombstoneSlug } from './slug';

describe('slugBase', () => {
  it('keeps Bangla and kebab-cases the rest', () => {
    expect(slugBase('নবম-দশম পদার্থবিজ্ঞান')).toBe('নবম-দশম-পদার্থবিজ্ঞান');
    expect(slugBase('  Mini UPS 12V! ')).toBe('mini-ups-12v');
  });
  it('falls back when nothing usable remains', () => {
    expect(slugBase('—!!—', 'product')).toBe('product');
  });
  it('trims to max length without a trailing hyphen', () => {
    expect(slugBase('abc def', 'x', 4)).toBe('abc');
  });
});

describe('pickUniqueSlug', () => {
  it('returns the base when free', () => {
    expect(pickUniqueSlug('mini-ups', [])).toBe('mini-ups');
  });
  it('adds the first free numeric suffix', () => {
    expect(pickUniqueSlug('mini-ups', ['mini-ups'])).toBe('mini-ups-2');
    expect(pickUniqueSlug('mini-ups', ['mini-ups', 'mini-ups-2', 'mini-ups-4'])).toBe('mini-ups-3');
  });
  it('keeps the suffix within the max length', () => {
    const s = pickUniqueSlug('abcdefghij', ['abcdefghij'], 10);
    expect(s).toBe('abcdefgh-2');
    expect(s.length).toBeLessThanOrEqual(10);
  });
});

describe('tombstoneSlug', () => {
  it('parks a slug with an id-derived tag inside the length limit', () => {
    const t = tombstoneSlug('x'.repeat(200), '0190f3a0-1111-7000-8000-abcdef123456', 120);
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith('~del-ef123456')).toBe(true);
  });
});
