import { dateWindow, dhakaDate, dhakaDayStart, normalizeOrderNo, phoneNeedle, tabCounts } from './order-filters';

describe('admin order filters', () => {
  it('counts tabs (cancel includes returned; run is the four live steps)', () => {
    const c = tabCounts({ PENDING: 2, CONFIRMED: 1, PROCESSING: 1, HANDED_TO_COURIER: 1, OUT_FOR_DELIVERY: 1, DELIVERED: 4, CANCELLED: 1, RETURNED: 2 });
    expect(c).toEqual({ all: 13, pending: 2, run: 4, done: 4, cancel: 3 });
  });

  it('computes Dhaka day starts', () => {
    // 2026-09-29 20:00 UTC = 2026-09-30 02:00 Dhaka → day starts 2026-09-29T18:00Z
    expect(dhakaDayStart(new Date('2026-09-29T20:00:00Z')).toISOString()).toBe('2026-09-29T18:00:00.000Z');
    expect(dhakaDayStart(new Date('2026-09-29T10:00:00Z')).toISOString()).toBe('2026-09-28T18:00:00.000Z');
    expect(dhakaDate('2026-09-29')?.toISOString()).toBe('2026-09-28T18:00:00.000Z');
    expect(dhakaDate('29/09/2026')).toBeNull();
  });

  it('builds date windows', () => {
    const now = new Date('2026-09-29T10:00:00Z');
    expect(dateWindow('all', now)).toEqual({});
    expect(dateWindow('7', now).gte?.toISOString()).toBe('2026-09-22T10:00:00.000Z');
    const w = dateWindow('custom', now, '2026-09-01', '2026-09-02');
    expect(w.gte?.toISOString()).toBe('2026-08-31T18:00:00.000Z');
    expect(w.lt?.toISOString()).toBe('2026-09-02T18:00:00.000Z');
    expect(dateWindow('custom', now, undefined, '2026-09-02').gte).toBeUndefined();
  });

  it('normalises order numbers like the storefront', () => {
    expect(normalizeOrderNo('2042')).toBe('CLO-2042');
    expect(normalizeOrderNo('clo-2042')).toBe('CLO-2042');
    expect(normalizeOrderNo(' CLO2042 ')).toBe('CLO-2042');
    expect(normalizeOrderNo('২০৪২')).toBe('CLO-2042');
    expect(normalizeOrderNo('hello')).toBeNull();
  });

  it('derives a phone needle', () => {
    expect(phoneNeedle('01711-111111')).toBe('1711111111');
    expect(phoneNeedle('+8801711')).toBe('8801711');
    expect(phoneNeedle('17')).toBeNull();
  });
});

describe('orderRef', () => {
  const { orderRef } = jest.requireActual('./order-filters') as typeof import('./order-filters');
  it('accepts uuids and order numbers', () => {
    expect(orderRef('0192f0a0-1111-7abc-8def-0123456789ab')).toEqual({ id: '0192f0a0-1111-7abc-8def-0123456789ab' });
    expect(orderRef('clo-2042')).toEqual({ orderNo: 'CLO-2042' });
    expect(orderRef('nope')).toBeNull();
  });
});
