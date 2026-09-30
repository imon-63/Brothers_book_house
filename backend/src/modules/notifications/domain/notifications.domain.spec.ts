import { afterFailure, backoffDelayMs, OUTBOX_POLICY } from './backoff';
import { bnDigits, render, scrub, taka, TemplateError } from './templates';
import { toBdSmsNumber } from './sms-number';

const ctx = { storeName: 'চলো', webUrl: 'https://cholo.test', helpline: '01700000000' };

describe('backoff schedule', () => {
  it('doubles from 30s and caps at 6h (no jitter at random=0.5)', () => {
    expect([1, 2, 3, 4, 5].map((a) => backoffDelayMs(a))).toEqual([30_000, 60_000, 120_000, 240_000, 480_000]);
    expect(backoffDelayMs(30)).toBe(OUTBOX_POLICY.maxDelayMs);
  });

  it('jitter stays within ±20%', () => {
    expect(backoffDelayMs(1, () => 0)).toBe(24_000);
    expect(backoffDelayMs(1, () => 1)).toBe(36_000);
  });

  it('retries until max attempts, then FAILED; non-retryable fails at once', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(afterFailure(1, true, now)).toEqual({ status: 'PENDING', nextAttemptAt: new Date(now.getTime() + 30_000) });
    expect(afterFailure(OUTBOX_POLICY.maxAttempts, true, now)).toEqual({ status: 'FAILED', nextAttemptAt: null });
    expect(afterFailure(1, false, now)).toEqual({ status: 'FAILED', nextAttemptAt: null });
  });
});

describe('templates', () => {
  it('money and digits in Bangla', () => {
    expect(bnDigits(2041)).toBe('২০৪১');
    expect(taka(1234567)).toBe('৳১২,৩৪,৫৬৭');
    expect(taka(1200)).toBe('৳১,২০০');
    expect(taka('99.5')).toBe('৳৯৯.৫০');
  });

  it('order.placed', () => {
    const r = render('order.placed', { name: 'রাফি', orderNo: 'CLO-2041', total: '1250.00' }, ctx);
    expect(r.text).toContain('প্রিয় রাফি');
    expect(r.text).toContain('CLO-2041');
    expect(r.text).toContain('৳১,২৫০');
    expect(r.text).toContain('https://cholo.test/track?order=CLO-2041');
  });

  it('order.shipped with and without tracking', () => {
    expect(render('order.shipped', { orderNo: 'CLO-1', courier: 'Pathao', trackingNo: 'PX9', trackingUrl: 'https://p/PX9' }, ctx).text).toBe(
      'অর্ডার CLO-1 Pathao-এ তুলে দেওয়া হয়েছে (ট্র্যাকিং: PX9)। ট্র্যাক: https://p/PX9 — চলো',
    );
    expect(render('order.shipped', { orderNo: 'CLO-1' }, ctx).text).toContain('কুরিয়ারে তুলে দেওয়া হয়েছে');
  });

  it('confirmed / delivered / cancelled / reset / restocked / invite', () => {
    expect(render('order.confirmed', { orderNo: 'CLO-1' }, ctx).text).toContain('নিশ্চিত');
    expect(render('order.delivered', { orderNo: 'CLO-1' }, ctx).text).toContain('পৌঁছে গেছে');
    expect(render('order.cancelled', { orderNo: 'CLO-1', reason: 'স্টক নেই' }, ctx).text).toContain('(স্টক নেই)');
    expect(render('auth.password_reset', { code: '123456', minutes: 10 }, ctx).text).toContain('123456');
    expect(render('auth.password_reset', { code: '123456', minutes: 10 }, ctx).text).toContain('১০ মিনিট');
    expect(render('wishlist.restocked', { title: 'বই', slug: 'boi', kind: 'product' }, ctx).text).toContain('https://cholo.test/product/boi');
    expect(render('staff.invite', { name: 'A', email: 'a@x.com', tempPassword: 'T3mp', role: 'SUPPORT' }, ctx).subject).toContain('অ্যাডমিন');
  });

  it('unknown template or missing fields → TemplateError', () => {
    expect(() => render('nope', {}, ctx)).toThrow(TemplateError);
    expect(() => render('order.confirmed', {}, ctx)).toThrow(TemplateError);
  });

  it('scrubs secrets after delivery', () => {
    expect(scrub({ code: '1', name: 'x', tempPassword: 'p' })).toEqual({ code: '[redacted]', name: 'x', tempPassword: '[redacted]' });
  });
});

describe('toBdSmsNumber', () => {
  it('formats for BD gateways', () => {
    expect(toBdSmsNumber('+8801711111111')).toBe('8801711111111');
    expect(toBdSmsNumber('01711-111111')).toBe('8801711111111');
    expect(toBdSmsNumber('123')).toBeNull();
  });
});
