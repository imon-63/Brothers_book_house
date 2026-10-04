import { aggregateOrders, dhakaMonthKey, dhakaMonthStart, favourite, monthlySeries, share } from './customer-stats';
import { toCsv } from './csv';
import { cancelRate, segmentCaseSql, segmentOf, type SegmentInput } from './segment';
import { bundleStock, productStock } from './stock-status';

const NOW = new Date('2026-09-29T06:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const base: SegmentInput = { ordersCount: 0, liveOrders: 0, cancelledOrders: 0, totalSpent: 0, lastOrderAt: null };

describe('segmentOf (mirrors insights.ts)', () => {
  it('new when nothing special', () => {
    expect(segmentOf(base, NOW)).toBe('new');
    expect(segmentOf({ ...base, ordersCount: 1, liveOrders: 1, totalSpent: 500, lastOrderAt: daysAgo(3) }, NOW)).toBe('new');
  });

  it('regular with 2+ live orders', () => {
    expect(segmentOf({ ...base, ordersCount: 2, liveOrders: 2, totalSpent: 1200, lastOrderAt: daysAgo(10) }, NOW)).toBe('regular');
  });

  it('vip by live orders or spend', () => {
    expect(segmentOf({ ...base, ordersCount: 5, liveOrders: 5, totalSpent: 1000, lastOrderAt: daysAgo(1) }, NOW)).toBe('vip');
    expect(segmentOf({ ...base, ordersCount: 1, liveOrders: 1, totalSpent: 5000, lastOrderAt: daysAgo(1) }, NOW)).toBe('vip');
    expect(segmentOf({ ...base, ordersCount: 1, liveOrders: 1, totalSpent: 4999.99, lastOrderAt: daysAgo(1) }, NOW)).toBe('new');
    // staff-tagged VIP wins over every computed rule (even risk / dormant)
    expect(segmentOf({ ...base, ordersCount: 1, liveOrders: 1, totalSpent: 2620, lastOrderAt: daysAgo(3), vipTagged: true }, NOW)).toBe('vip');
    expect(segmentOf({ ...base, ordersCount: 2, liveOrders: 1, cancelledOrders: 1, totalSpent: 300, lastOrderAt: daysAgo(90), vipTagged: true }, NOW)).toBe('vip');
  });

  it('vip beats sleep (rule order)', () => {
    expect(segmentOf({ ...base, ordersCount: 6, liveOrders: 6, totalSpent: 9000, lastOrderAt: daysAgo(200) }, NOW)).toBe('vip');
  });

  it('risk at ≥2 orders and ≥50% cancelled, before vip', () => {
    expect(segmentOf({ ...base, ordersCount: 2, liveOrders: 1, cancelledOrders: 1, totalSpent: 300, lastOrderAt: daysAgo(1) }, NOW)).toBe('risk');
    expect(segmentOf({ ...base, ordersCount: 12, liveOrders: 6, cancelledOrders: 6, totalSpent: 9000, lastOrderAt: daysAgo(1) }, NOW)).toBe('risk');
    expect(segmentOf({ ...base, ordersCount: 1, cancelledOrders: 1, lastOrderAt: daysAgo(1) }, NOW)).toBe('new');
    expect(segmentOf({ ...base, ordersCount: 3, liveOrders: 2, cancelledOrders: 1, totalSpent: 800, lastOrderAt: daysAgo(1) }, NOW)).toBe('regular');
  });

  it('sleep after 60 days without an order', () => {
    expect(segmentOf({ ...base, ordersCount: 2, liveOrders: 2, totalSpent: 900, lastOrderAt: daysAgo(61) }, NOW)).toBe('sleep');
    expect(segmentOf({ ...base, ordersCount: 2, liveOrders: 2, totalSpent: 900, lastOrderAt: daysAgo(59) }, NOW)).toBe('regular');
  });

  it('SQL mirror uses the same thresholds', () => {
    const sql = segmentCaseSql('c');
    expect(sql).toContain('c.cancelled_orders * 2 >= c.orders_count');
    expect(sql).toContain('c.live_orders >= 5 OR c.total_spent >= 5000');
    expect(sql).toContain("interval '60 days'");
    expect(sql).toContain("upper(btrim(t.name)) = 'VIP'");
  });

  it('cancel rate in percent with one decimal', () => {
    expect(cancelRate(3, 1)).toBe(33.3);
    expect(cancelRate(0, 0)).toBe(0);
  });
});

describe('aggregateOrders', () => {
  it('counts live / cancelled / spent and first/last, ignoring pending in spend', () => {
    const a = aggregateOrders([
      { status: 'DELIVERED', grandTotal: '1000.50', placedAt: daysAgo(10) },
      { status: 'CONFIRMED', grandTotal: 200, placedAt: daysAgo(2) },
      { status: 'PENDING', grandTotal: 999, placedAt: daysAgo(1) },
      { status: 'CANCELLED', grandTotal: 400, placedAt: daysAgo(30) },
      { status: 'RETURNED', grandTotal: 400, placedAt: daysAgo(20) },
    ]);
    expect(a).toEqual({ ordersCount: 5, liveOrders: 2, cancelledOrders: 2, totalSpent: '1200.50', firstOrderAt: daysAgo(30), lastOrderAt: daysAgo(1) });
  });

  it('is replay-safe (same input → same output)', () => {
    const orders = [{ status: 'DELIVERED' as const, grandTotal: 10, placedAt: NOW }];
    expect(aggregateOrders(orders)).toEqual(aggregateOrders(orders));
    expect(aggregateOrders([])).toEqual({ ordersCount: 0, liveOrders: 0, cancelledOrders: 0, totalSpent: '0.00', firstOrderAt: null, lastOrderAt: null });
  });
});

describe('stats helpers', () => {
  it('share & favourite', () => {
    expect(share(1, 3)).toBe(33);
    expect(share(1, 0)).toBe(0);
    expect(favourite([{ key: 'book', amount: 300 }, { key: 'food', amount: 100 }, { key: null, amount: 900 }])).toEqual({ key: 'book', share: 75 });
    expect(favourite([])).toBeNull();
  });

  it('dhaka months', () => {
    // 2026-09-30T19:00Z is already 1 Oct in Dhaka
    expect(dhakaMonthKey(new Date('2026-09-30T19:00:00Z'))).toBe('2026-10');
    expect(dhakaMonthStart(NOW).toISOString()).toBe('2026-08-31T18:00:00.000Z');
    expect(dhakaMonthStart(NOW, -1).toISOString()).toBe('2026-07-31T18:00:00.000Z');
    const s = monthlySeries([{ month: '2026-08', amount: 50, orders: 1 }], 3, NOW);
    expect(s).toEqual([
      { month: '2026-07', amount: 0, orders: 0 },
      { month: '2026-08', amount: 50, orders: 1 },
      { month: '2026-09', amount: 0, orders: 0 },
    ]);
  });
});

describe('stock status', () => {
  const p = { trackInventory: true, allowBackorder: false, stockOnHand: 10, stockReserved: 2, lowStockThreshold: 5 };
  it('product', () => {
    expect(productStock(p)).toEqual({ state: 'in_stock', available: 8 });
    expect(productStock({ ...p, stockReserved: 6 })).toEqual({ state: 'low', available: 4 });
    expect(productStock({ ...p, stockOnHand: 2 })).toEqual({ state: 'out_of_stock', available: 0 });
    expect(productStock({ ...p, trackInventory: false, stockOnHand: 0 })).toEqual({ state: 'in_stock', available: null });
  });
  it('bundle takes the scarcest component', () => {
    expect(bundleStock([{ quantity: 2, product: p }, { quantity: 1, product: { ...p, stockOnHand: 3 } }])).toEqual({ state: 'low', available: 1 });
    expect(bundleStock([{ quantity: 1, product: { ...p, stockOnHand: 2 } }])).toEqual({ state: 'out_of_stock', available: 0 });
    expect(bundleStock([])).toEqual({ state: 'out_of_stock', available: 0 });
  });
});

describe('toCsv', () => {
  it('quotes, BOMs and neutralises formulas', () => {
    expect(toCsv([['a,b', 'x"y', '=SUM(A1)', 3, null]])).toBe('﻿"a,b","x""y",\'=SUM(A1),3,\r\n');
  });
});
