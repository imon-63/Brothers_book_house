import { resolveShipping, ruleIsLive, shippingNote, type FreeShippingRule, type ShippingInput, type ZoneInfo } from './shipping-fee';

const now = new Date('2026-09-29T10:00:00Z');
const inside: ZoneInfo = { id: 1, code: 'inside_dhaka', nameBn: 'ঢাকার ভিতর', fee: 60, courierCost: 55, etaMinDays: 1, etaMaxDays: 2 };
const outside: ZoneInfo = { id: 2, code: 'outside_dhaka', nameBn: 'ঢাকার বাইরে', fee: 120, courierCost: 110, etaMinDays: 2, etaMaxDays: 4 };
const rule = (p: Partial<FreeShippingRule>): FreeShippingRule => ({
  id: p.type ?? 'r', type: 'MIN_SUBTOTAL', label: '', minSubtotal: null, sectionId: null, startsAt: null, endsAt: null, isActive: true, priority: 0, ...p,
});
const min500 = rule({ id: 'min', type: 'MIN_SUBTOTAL', minSubtotal: 500 });
const book = { kind: 'PRODUCT' as const, sectionId: 'book', freeShipping: false };
const food = { kind: 'PRODUCT' as const, sectionId: 'food', freeShipping: false };
const input = (p: Partial<ShippingInput>): ShippingInput => ({ zone: inside, lines: [book], netSubtotal: 300, rules: [min500], now, ...p });

describe('shipping fee', () => {
  it('charges the zone fee with the zone name as reason', () => {
    const s = resolveShipping(input({}));
    expect(s.fee?.toNumber()).toBe(60);
    expect(s.reason).toBe('ঢাকার ভিতর');
    expect(s.basis).toBe('ZONE');
    expect(s.expectedCourierCost?.toNumber()).toBe(55);
    expect(s.amountToFree?.toNumber()).toBe(200);
    expect(resolveShipping(input({ zone: outside })).fee?.toNumber()).toBe(120);
  });

  it('frees on net subtotal ≥ threshold with the storefront text', () => {
    const s = resolveShipping(input({ netSubtotal: 500 }));
    expect(s.fee?.toNumber()).toBe(0);
    expect(s.free).toBe(true);
    expect(s.reason).toBe('৳৫০০+ অর্ডারে ফ্রি');
    expect(resolveShipping(input({ netSubtotal: 499.99 })).fee?.toNumber()).toBe(60);
  });

  it('unknown district → fee null unless a free rule applies', () => {
    const s = resolveShipping(input({ zone: null }));
    expect(s.fee).toBeNull();
    expect(s.reason).toBe('জেলা বাছুন — ঢাকা/বাইরের রেট বসবে');
    expect(resolveShipping(input({ zone: null, netSubtotal: 800 })).fee?.toNumber()).toBe(0);
  });

  it('campaign wins over threshold and respects its window', () => {
    const camp = rule({ id: 'camp', type: 'CAMPAIGN_ALL', startsAt: new Date('2026-09-01'), endsAt: new Date('2026-10-01') });
    expect(resolveShipping(input({ rules: [min500, camp] })).reason).toBe('ক্যাম্পেইন · সবার জন্য ফ্রি');
    const over = rule({ id: 'old', type: 'CAMPAIGN_ALL', startsAt: new Date('2026-08-01'), endsAt: new Date('2026-09-01') });
    expect(resolveShipping(input({ rules: [over] })).basis).toBe('ZONE');
    expect(ruleIsLive({ ...over, endsAt: null }, now)).toBe(true);
    expect(ruleIsLive({ ...over, isActive: false, endsAt: null }, now)).toBe(false);
  });

  it('bundle rule, section rule and item flags', () => {
    const anyBundle = rule({ id: 'b', type: 'ANY_BUNDLE' });
    expect(resolveShipping(input({ rules: [anyBundle], lines: [book] })).basis).toBe('ZONE');
    expect(resolveShipping(input({ rules: [anyBundle], lines: [book, { kind: 'BUNDLE', sectionId: 'book', freeShipping: false }] })).basis).toBe('ANY_BUNDLE');
    const books = rule({ id: 's', type: 'SECTION_ONLY', sectionId: 'book' });
    expect(resolveShipping(input({ rules: [books], lines: [book, book] })).reason).toBe('ফ্রি ডেলিভারি');
    expect(resolveShipping(input({ rules: [books], lines: [book, food] })).basis).toBe('ZONE');
    expect(resolveShipping(input({ rules: [], lines: [{ ...book, freeShipping: true }, { ...food, freeShipping: true }] })).basis).toBe('ITEM_FLAGS');
    expect(resolveShipping(input({ rules: [], lines: [{ ...book, freeShipping: true }, food] })).basis).toBe('ZONE');
  });

  it('free-shipping coupon', () => {
    const s = resolveShipping(input({ couponFreeShipping: true, zone: outside }));
    expect(s.fee?.toNumber()).toBe(0);
    expect(s.basis).toBe('COUPON');
  });

  it('builds the delivery note', () => {
    expect(shippingNote([inside, outside], { freeAbove: 500, campaign: false })).toBe('হোম ডেলিভারি · ঢাকার ভিতর ৳৬০ · ঢাকার বাইরে ৳১২০ · ৳৫০০+ ফ্রি');
    expect(shippingNote([inside], { freeAbove: null, campaign: true })).toBe('হোম ডেলিভারি · ঢাকার ভিতর ৳৬০ · ক্যাম্পেইনে ফ্রি');
    expect(shippingNote([inside], { freeAbove: null, campaign: false })).toBe('হোম ডেলিভারি · ঢাকার ভিতর ৳৬০');
  });
});
