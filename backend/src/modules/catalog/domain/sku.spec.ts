import { generateSku } from './sku';

describe('generateSku', () => {
  it('uses the section prefix + base36 time + random tail', () => {
    expect(generateSku('book', 1_700_000_000_000, () => 0)).toBe(`BK-${(1_700_000_000_000).toString(36).toUpperCase()}-0000`);
    expect(generateSku('food', 1, () => 0.5)).toMatch(/^FD-1-[0-9A-Z]{4}$/);
  });
  it('derives a prefix for unknown sections', () => {
    expect(generateSku('toys', 1, () => 0)).toMatch(/^TO-/);
    expect(generateSku('৳৳', 1, () => 0)).toMatch(/^PR-/);
  });
  it('fits the 60-char column', () => {
    expect(generateSku('gadget').length).toBeLessThanOrEqual(60);
  });
});
