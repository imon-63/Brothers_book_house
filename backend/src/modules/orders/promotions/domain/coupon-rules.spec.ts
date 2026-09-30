import { sum } from '@/common/utils/money';
import { evaluateCoupon, lineEligible, normalizeCouponCode, type CouponApplied, type CouponLine, type CouponRule, type CouponUsage } from './coupon-rules';

const now = new Date('2026-09-29T10:00:00Z');
const rule = (p: Partial<CouponRule> = {}): CouponRule => ({
  id: 'c1', code: 'cholo10', type: 'PERCENT', value: 10, maxDiscount: null, minSubtotal: 0, scope: 'ALL', targets: [],
  usageLimit: null, perCustomerLimit: null, usedCount: 0, firstOrderOnly: false, isActive: true, startsAt: null, endsAt: null, ...p,
});
const L = (p: Partial<CouponLine>): CouponLine => ({ kind: 'PRODUCT', productId: 'p1', bundleId: null, sectionCode: 'book', categoryIds: ['cat1'], gross: 100, ...p });
const lines = [L({ productId: 'p1', gross: 333 }), L({ productId: 'p2', gross: 333, sectionCode: 'food', categoryIds: ['cat2'] }), L({ kind: 'BUNDLE', productId: null, bundleId: 'b1', gross: 334, categoryIds: [] })];
const usage: CouponUsage = { customerRedemptions: 0, customerPriorOrders: 0 };

function applied(r: CouponRule, l = lines, u = usage): CouponApplied {
  const res = evaluateCoupon(r, l, u, now);
  if (!res.ok) throw new Error(res.code);
  return res;
}
const codeOf = (r: CouponRule, l = lines, u = usage) => {
  const res = evaluateCoupon(r, l, u, now);
  return res.ok ? 'ok' : res.code;
};

describe('coupon rules', () => {
  it('normalises codes', () => expect(normalizeCouponCode(' cholo10 ')).toBe('CHOLO10'));

  it('PERCENT rounds to whole taka and allocates exactly', () => {
    const r = applied(rule());
    expect(r.discount.toNumber()).toBe(100);
    expect(sum(r.allocations).toNumber()).toBe(100);
    expect(r.allocations.map((a) => a.toNumber())).toEqual([33.3, 33.3, 33.4]);
  });

  it('PERCENT respects maxDiscount', () => {
    expect(applied(rule({ value: 50, maxDiscount: 120 })).discount.toNumber()).toBe(120);
  });

  it('FIXED is capped at the eligible subtotal', () => {
    expect(applied(rule({ type: 'FIXED', value: 50 })).discount.toNumber()).toBe(50);
    const r = applied(rule({ type: 'FIXED', value: 5000, scope: 'PRODUCT', targets: [{ productId: 'p1', sectionCode: null, categoryId: null, bundleId: null }] }));
    expect(r.discount.toNumber()).toBe(333);
    expect(r.allocations.map((a) => a.toNumber())).toEqual([333, 0, 0]);
  });

  it('FREE_SHIPPING gives no item discount', () => {
    const r = applied(rule({ type: 'FREE_SHIPPING', value: 0 }));
    expect(r.discount.toNumber()).toBe(0);
    expect(r.freeShipping).toBe(true);
    expect(r.allocations.every((a) => a.isZero())).toBe(true);
  });

  it('scopes apply to eligible lines only', () => {
    const t = { sectionCode: null, categoryId: null, productId: null, bundleId: null };
    const section = applied(rule({ scope: 'SECTION', targets: [{ ...t, sectionCode: 'book' }] }));
    expect(section.eligible).toEqual([true, false, true]);
    expect(section.discount.toNumber()).toBe(67); // 10% of 667 = 66.7 → 67
    expect(section.allocations[1].toNumber()).toBe(0);
    expect(sum(section.allocations).toNumber()).toBe(67);
    expect(applied(rule({ scope: 'CATEGORY', targets: [{ ...t, categoryId: 'cat2' }] })).eligible).toEqual([false, true, false]);
    expect(applied(rule({ scope: 'BUNDLE', targets: [{ ...t, bundleId: 'b1' }] })).eligible).toEqual([false, false, true]);
    expect(lineEligible({ scope: 'CATEGORY', targets: [{ ...t, categoryId: 'x' }] }, L({ kind: 'BUNDLE', categoryIds: [] }))).toBe(false);
    expect(codeOf(rule({ scope: 'PRODUCT', targets: [{ ...t, productId: 'nope' }] }))).toBe('coupon.not_applicable');
  });

  it('minSubtotal uses the cart subtotal', () => {
    expect(codeOf(rule({ minSubtotal: 1001 }))).toBe('coupon.min_subtotal');
    expect(codeOf(rule({ minSubtotal: 1000 }))).toBe('ok');
  });

  it('enforces the window and activity', () => {
    expect(codeOf(rule({ isActive: false }))).toBe('coupon.inactive');
    expect(codeOf(rule({ deletedAt: now }))).toBe('coupon.inactive');
    expect(codeOf(rule({ startsAt: new Date('2026-10-01') }))).toBe('coupon.not_started');
    expect(codeOf(rule({ endsAt: now }))).toBe('coupon.expired');
  });

  it('enforces usage limits and first-order-only', () => {
    expect(codeOf(rule({ usageLimit: 5, usedCount: 5 }))).toBe('coupon.exhausted');
    expect(codeOf(rule({ usageLimit: 5, usedCount: 4 }))).toBe('ok');
    expect(codeOf(rule({ perCustomerLimit: 1 }), lines, { customerRedemptions: 1, customerPriorOrders: 3 })).toBe('coupon.customer_limit');
    expect(codeOf(rule({ perCustomerLimit: 1 }), lines, { customerRedemptions: null, customerPriorOrders: null })).toBe('ok');
    expect(codeOf(rule({ firstOrderOnly: true }), lines, { customerRedemptions: 0, customerPriorOrders: 1 })).toBe('coupon.first_order_only');
    expect(codeOf(rule({ firstOrderOnly: true }), lines, { customerRedemptions: 0, customerPriorOrders: 0 })).toBe('ok');
  });
});

describe('coupon shape validation', () => {
  const { validateCouponShape } = jest.requireActual('./coupon-rules') as typeof import('./coupon-rules');
  const ok = { type: 'PERCENT' as const, value: 10, scope: 'ALL' as const, targets: [] };
  const codeOf = (p: Partial<Parameters<typeof validateCouponShape>[0]>) => validateCouponShape({ ...ok, ...p })?.code ?? 'ok';
  it('checks value by type', () => {
    expect(codeOf({})).toBe('ok');
    expect(codeOf({ value: 100 })).toBe('coupon.value_invalid');
    expect(codeOf({ type: 'FIXED', value: 0 })).toBe('coupon.value_invalid');
    expect(codeOf({ type: 'FREE_SHIPPING', value: 0 })).toBe('ok');
    expect(codeOf({ type: 'FIXED', value: 50, maxDiscount: 10 })).toBe('coupon.max_discount_invalid');
  });
  it('checks window and targets', () => {
    expect(codeOf({ startsAt: new Date('2026-10-02'), endsAt: new Date('2026-10-01') })).toBe('coupon.window_invalid');
    expect(codeOf({ targets: [{ sectionCode: 'book' }] })).toBe('coupon.targets_invalid');
    expect(codeOf({ scope: 'SECTION' })).toBe('coupon.targets_required');
    expect(codeOf({ scope: 'SECTION', targets: [{ sectionCode: 'book' }] })).toBe('ok');
    expect(codeOf({ scope: 'SECTION', targets: [{ productId: 'p' }] })).toBe('coupon.targets_invalid');
    expect(codeOf({ scope: 'PRODUCT', targets: [{ productId: 'p', bundleId: 'b' }] })).toBe('coupon.targets_invalid');
  });
});
