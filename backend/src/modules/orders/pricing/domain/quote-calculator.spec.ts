import { D, sum } from '@/common/utils/money';
import type { CouponRule } from '../../promotions/domain/coupon-rules';
import type { FreeShippingRule, ZoneInfo } from '../../shipping/domain/shipping-fee';
import { calculateQuote, stockShortfalls, type PricedBundle, type PricedProduct, type Quote, type QuoteInput } from './quote-calculator';

const now = new Date('2026-09-29T10:00:00Z');
const P = (id: string, price: number, p: Partial<PricedProduct> = {}): PricedProduct => ({
  id, title: `বই ${id}`, sku: `SKU-${id}`, sectionId: 'sec-book', sectionCode: 'book', categoryId: 'cat', subcategoryId: null, categoryName: 'উপন্যাস',
  unitPrice: D(price), listPrice: D(price), compareAt: null, unitCost: D(price * 0.6), taxRate: D(0), freeShipping: false, available: 10, dealEndsAt: null, ...p,
});
const inside: ZoneInfo = { id: 1, code: 'inside_dhaka', nameBn: 'ঢাকার ভিতর', fee: 60, courierCost: 50, etaMinDays: 1, etaMaxDays: 2 };
const min500: FreeShippingRule = { id: 'min', type: 'MIN_SUBTOTAL', label: '৫০০+', minSubtotal: 500, sectionId: null, startsAt: null, endsAt: null, isActive: true, priority: 0 };
const coupon = (p: Partial<CouponRule>): QuoteInput['coupon'] => ({
  rule: { id: 'c', code: 'X', type: 'PERCENT', value: 10, maxDiscount: null, minSubtotal: 0, scope: 'ALL', targets: [], usageLimit: null, perCustomerLimit: null, usedCount: 0, firstOrderOnly: false, isActive: true, startsAt: null, endsAt: null, ...p },
  usage: { customerRedemptions: 0, customerPriorOrders: 0 },
});
const bundle = (p: Partial<PricedBundle> = {}): PricedBundle => ({
  id: 'b1', title: 'প্যাক', sectionId: 'sec-book', sectionCode: 'book', unitPrice: D(500), compareAt: null, freeShipping: false,
  components: [{ product: P('x', 300), quantity: 1 }, { product: P('y', 200), quantity: 2 }], ...p,
});
const q = (p: Partial<QuoteInput>): Quote => calculateQuote({ lines: [], coupon: null, zone: inside, shippingRules: [min500], now, ...p });

function assertIdentity(r: Quote) {
  const expected = r.itemsSubtotal.minus(r.discountTotal).plus(r.shippingFee ?? 0).plus(r.taxTotal);
  expect(r.grandTotal.equals(expected)).toBe(true);
  expect(sum(r.lines.map((l) => l.lineTotal)).plus(r.shippingFee ?? 0).equals(r.grandTotal)).toBe(true);
  expect(r.discountTotal.lessThanOrEqualTo(r.itemsSubtotal)).toBe(true);
  for (const l of r.lines) {
    expect(l.lineTotal.equals(l.gross.minus(l.discount).plus(l.taxAmount))).toBe(true);
    expect(l.lineTotal.greaterThanOrEqualTo(0)).toBe(true);
    if (l.kind === 'BUNDLE') expect(sum(l.components.map((c) => c.allocatedRevenue)).equals(l.gross.minus(l.discount))).toBe(true);
  }
}

describe('quote calculator', () => {
  it('prices product lines with zone shipping', () => {
    const r = q({ lines: [{ kind: 'PRODUCT', product: P('a', 150), quantity: 2 }] });
    expect(r.itemsSubtotal.toNumber()).toBe(300);
    expect(r.shippingFee?.toNumber()).toBe(60);
    expect(r.grandTotal.toNumber()).toBe(360);
    expect(r.itemsCost?.toNumber()).toBe(180);
    expect(r.shipping.reason).toBe('ঢাকার ভিতর');
    assertIdentity(r);
  });

  it('uses the effective (deal) price and keeps the list price', () => {
    const r = q({ lines: [{ kind: 'PRODUCT', product: P('a', 200, { unitPrice: D(150), listPrice: D(200) }), quantity: 1 }] });
    expect(r.lines[0].unitPrice.toNumber()).toBe(150);
    expect(r.lines[0].listPrice.toNumber()).toBe(200);
  });

  it('free shipping threshold is checked on net after discount', () => {
    const lines = [{ kind: 'PRODUCT' as const, product: P('a', 520), quantity: 1 }];
    expect(q({ lines }).shippingFee?.toNumber()).toBe(0);
    const r = q({ lines, coupon: coupon({ type: 'FIXED', value: 50 }) });
    expect(r.netSubtotal.toNumber()).toBe(470);
    expect(r.shippingFee?.toNumber()).toBe(60);
    expect(r.grandTotal.toNumber()).toBe(530);
    assertIdentity(r);
  });

  it('allocates a coupon over lines and sums exactly', () => {
    const r = q({
      lines: [
        { kind: 'PRODUCT', product: P('a', 99.99), quantity: 3 },
        { kind: 'PRODUCT', product: P('b', 33.33), quantity: 1 },
        { kind: 'BUNDLE', bundle: bundle(), quantity: 1 },
      ],
      coupon: coupon({ value: 15 }),
    });
    expect(r.coupon?.discount.toNumber()).toBe(r.discountTotal.toNumber());
    expect(r.discountTotal.toNumber()).toBe(Math.round((299.97 + 33.33 + 500) * 0.15));
    assertIdentity(r);
  });

  it('keeps a rejected coupon out of the totals but reports why', () => {
    const r = q({ lines: [{ kind: 'PRODUCT', product: P('a', 100), quantity: 1 }], coupon: coupon({ minSubtotal: 1000 }) });
    expect(r.coupon).toBeNull();
    expect(r.couponRejection?.code).toBe('coupon.min_subtotal');
    expect(r.discountTotal.toNumber()).toBe(0);
  });

  it('free-shipping coupon zeroes delivery only', () => {
    const r = q({ lines: [{ kind: 'PRODUCT', product: P('a', 100), quantity: 1 }], coupon: coupon({ type: 'FREE_SHIPPING', value: 0 }) });
    expect(r.shippingFee?.toNumber()).toBe(0);
    expect(r.shipping.basis).toBe('COUPON');
    expect(r.grandTotal.toNumber()).toBe(100);
  });

  it('bundles: list price, cost, components and stock units', () => {
    const r = q({ lines: [{ kind: 'BUNDLE', bundle: bundle(), quantity: 2 }, { kind: 'PRODUCT', product: P('x', 300), quantity: 1 }] });
    const line = r.lines[0];
    expect(line.listPrice.toNumber()).toBe(700);
    expect(line.unitCost?.toNumber()).toBe(420);
    expect(line.components.map((c) => c.quantity)).toEqual([2, 4]);
    // 1000 split by list weight 300 : 400
    expect(line.components.map((c) => c.allocatedRevenue.toNumber())).toEqual([428.57, 571.43]);
    expect(r.stockUnits).toEqual([{ productId: 'x', qty: 3 }, { productId: 'y', qty: 4 }]);
    assertIdentity(r);
  });

  it('itemsCost is null when any cost is unknown', () => {
    const r = q({ lines: [{ kind: 'PRODUCT', product: P('a', 100), quantity: 1 }, { kind: 'PRODUCT', product: P('b', 100, { unitCost: null }), quantity: 1 }] });
    expect(r.itemsCost).toBeNull();
    const b = q({ lines: [{ kind: 'BUNDLE', bundle: bundle({ components: [{ product: P('z', 100, { unitCost: null }), quantity: 1 }] }), quantity: 1 }] });
    expect(b.lines[0].unitCost).toBeNull();
    expect(b.itemsCost).toBeNull();
  });

  it('adds tax on the net line amount', () => {
    const r = q({
      lines: [{ kind: 'PRODUCT', product: P('g', 1000, { taxRate: D(5), sectionCode: 'gadget' }), quantity: 1 }, { kind: 'BUNDLE', bundle: bundle({ components: [{ product: P('t', 300, { taxRate: D(10) }), quantity: 1 }, { product: P('u', 200), quantity: 1 }] }), quantity: 1 }],
      coupon: coupon({ type: 'FIXED', value: 150 }),
    });
    expect(r.lines[0].discount.toNumber()).toBe(100);
    expect(r.lines[0].taxAmount.toNumber()).toBe(45);
    expect(r.lines[1].taxAmount.toNumber()).toBe(27); // 10% of 270 allocated to t
    expect(r.taxTotal.toNumber()).toBe(72);
    assertIdentity(r);
  });

  it('no district → fee null and grand excludes shipping', () => {
    const r = q({ zone: null, lines: [{ kind: 'PRODUCT', product: P('a', 100), quantity: 1 }] });
    expect(r.shippingFee).toBeNull();
    expect(r.grandTotal.toNumber()).toBe(100);
    assertIdentity(r);
  });

  it('empty cart is all zeros', () => {
    const r = q({});
    expect(r.itemsSubtotal.toNumber()).toBe(0);
    expect(r.itemsCost).toBeNull();
    assertIdentity(r);
  });

  it('property: random carts always satisfy the CHECK identity', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 200; i++) {
      const lines: QuoteInput['lines'] = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) =>
        rnd() < 0.3
          ? { kind: 'BUNDLE' as const, bundle: bundle({ id: `b${k}`, unitPrice: D((rnd() * 900 + 1).toFixed(2)) }), quantity: 1 + Math.floor(rnd() * 3) }
          : { kind: 'PRODUCT' as const, product: P(`p${k}`, Number((rnd() * 700 + 0.01).toFixed(2)), { taxRate: D(rnd() < 0.2 ? 7.5 : 0) }), quantity: 1 + Math.floor(rnd() * 4) },
      );
      const c = rnd() < 0.5 ? coupon({ type: 'PERCENT', value: Math.ceil(rnd() * 50), maxDiscount: rnd() < 0.5 ? 200 : null }) : coupon({ type: 'FIXED', value: Math.ceil(rnd() * 3000) });
      assertIdentity(q({ lines, coupon: c }));
    }
  });

  it('reports stock shortfalls', () => {
    const r = q({ lines: [{ kind: 'PRODUCT', product: P('a', 100), quantity: 3 }] });
    expect(stockShortfalls(r, new Map([['a', 2]]))).toEqual([{ productId: 'a', requested: 3, available: 2 }]);
    expect(stockShortfalls(r, new Map([['a', null]]))).toEqual([]);
  });
});
