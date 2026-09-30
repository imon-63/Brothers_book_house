import { Prisma } from '@prisma/client';
import { bulkAdjustedPrice, bundleSummary, compareAtForDiscount, discountPct, marginPct, normaliseCompareAt, offerOf } from './pricing';

const d = (v: number | string) => new Prisma.Decimal(v);

describe('discountPct', () => {
  it('rounds (1 - price/old) × 100', () => {
    expect(discountPct(350, 450)).toBe(22);
    expect(discountPct(d('299.00'), d('399.00'))).toBe(25);
  });
  it('is 0 without a higher struck price', () => {
    expect(discountPct(350, null)).toBe(0);
    expect(discountPct(350, 350)).toBe(0);
    expect(discountPct(350, 300)).toBe(0);
    expect(discountPct(350, 0)).toBe(0);
  });
});

describe('offerOf', () => {
  const now = new Date('2026-09-29T10:00:00Z');
  const product = { price: d(500), compareAtPrice: d(600) };
  it('uses compare-at when no deal is live', () => {
    const o = offerOf(product, [], now);
    expect(o.price.toNumber()).toBe(500);
    expect(o.compareAt?.toNumber()).toBe(600);
    expect(o.discountPct).toBe(17);
    expect(o.deal).toBeNull();
  });
  it('a live cheaper deal wins and strikes the regular price', () => {
    const endsAt = new Date('2026-09-30T00:00:00Z');
    const o = offerOf(product, [{ dealPrice: d(400), startsAt: new Date('2026-09-28T00:00:00Z'), endsAt, cancelledAt: null }], now);
    expect(o.price.toNumber()).toBe(400);
    expect(o.compareAt?.toNumber()).toBe(500);
    expect(o.discountPct).toBe(20);
    expect(o.deal?.endsAt).toBe(endsAt);
  });
  it('ignores cancelled, future, ended and not-cheaper deals', () => {
    const base = { startsAt: new Date('2026-09-28T00:00:00Z'), endsAt: new Date('2026-10-01T00:00:00Z'), cancelledAt: null };
    const deals = [
      { ...base, dealPrice: d(300), cancelledAt: new Date('2026-09-28T01:00:00Z') },
      { ...base, dealPrice: d(300), startsAt: new Date('2026-09-30T00:00:00Z') },
      { ...base, dealPrice: d(300), endsAt: new Date('2026-09-29T09:00:00Z') },
      { ...base, dealPrice: d(550) },
    ];
    expect(offerOf(product, deals, now).price.toNumber()).toBe(500);
  });
});

describe('marginPct', () => {
  it('is (price - cost) / price, whole percent', () => {
    expect(marginPct(350, 240)).toBe(31);
    expect(marginPct(d('100'), d('90'))).toBe(10);
  });
  it('can be negative when selling at a loss', () => {
    expect(marginPct(100, 120)).toBe(-20);
  });
  it('is null when cost is unknown or price is zero', () => {
    expect(marginPct(350, null)).toBeNull();
    expect(marginPct(350, 0)).toBeNull();
    expect(marginPct(0, 100)).toBeNull();
  });
});

describe('bulkAdjustedPrice', () => {
  it('raises by % and rounds to the nearest ৳5', () => {
    expect(bulkAdjustedPrice(350, 10, 'up').toNumber()).toBe(385);
    expect(bulkAdjustedPrice(333, 10, 'up').toNumber()).toBe(365); // 366.3 → 365
    expect(bulkAdjustedPrice(347, 1, 'up').toNumber()).toBe(350); // 350.47 → 350
  });
  it('lowers by % and rounds half up', () => {
    expect(bulkAdjustedPrice(350, 10, 'down').toNumber()).toBe(315);
    expect(bulkAdjustedPrice(125, 10, 'down').toNumber()).toBe(115); // 112.5 → 115
  });
  it('never goes below ৳5', () => {
    expect(bulkAdjustedPrice(6, 90, 'down').toNumber()).toBe(5);
  });
});

describe('compareAtForDiscount', () => {
  it('derives the struck price from the discount', () => {
    expect(compareAtForDiscount(300, 25)?.toNumber()).toBe(400);
    expect(compareAtForDiscount(350, 15)?.toNumber()).toBe(412); // 411.76 → 412
  });
  it('0 or ≥100 removes it', () => {
    expect(compareAtForDiscount(300, 0)).toBeNull();
    expect(compareAtForDiscount(300, 100)).toBeNull();
  });
  it('drops a compare-at that would not be above the price', () => {
    expect(compareAtForDiscount(1, 0.1)).toBeNull();
  });
});

describe('normaliseCompareAt', () => {
  it('keeps only a strictly higher compare-at', () => {
    expect(normaliseCompareAt(100, 120)?.toNumber()).toBe(120);
    expect(normaliseCompareAt(100, 100)).toBeNull();
    expect(normaliseCompareAt(100, null)).toBeNull();
  });
});

describe('bundleSummary', () => {
  const lines = [
    { unitPrice: 300, listPrice: 350, quantity: 1, inStock: true },
    { unitPrice: 200, listPrice: 200, quantity: 2, inStock: true },
  ];
  it('Σ separate price, saving, % and compare-at default to Σ list prices', () => {
    const s = bundleSummary(600, null, lines);
    expect(s.separatePrice.toNumber()).toBe(700);
    expect(s.compareAt.toNumber()).toBe(750);
    expect(s.saving.toNumber()).toBe(100);
    expect(s.savingPct).toBe(14);
    expect(s.allInStock).toBe(true);
  });
  it('uses the stored compare-at, never negative saving, flags stock-outs', () => {
    const s = bundleSummary(800, 900, [{ ...lines[0], inStock: false }, lines[1]]);
    expect(s.compareAt.toNumber()).toBe(900);
    expect(s.saving.toNumber()).toBe(0);
    expect(s.savingPct).toBe(0);
    expect(s.allInStock).toBe(false);
  });
  it('an empty bundle is not in stock', () => {
    expect(bundleSummary(0, null, []).allInStock).toBe(false);
  });
});
