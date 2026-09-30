import { delta, dhakaDayStart, rangeFor } from './period';

describe('reports period math', () => {
  const now = new Date('2026-09-30T08:30:00.000Z'); // 14:30 in Dhaka

  it('finds the Dhaka day start', () => {
    expect(dhakaDayStart(now).toISOString()).toBe('2026-09-29T18:00:00.000Z');
    // 23:30 UTC is already the next day in Dhaka
    expect(dhakaDayStart(new Date('2026-09-30T19:30:00Z')).toISOString()).toBe('2026-09-30T18:00:00.000Z');
  });

  it('compares today with yesterday up to the same time', () => {
    const r = rangeFor('today', now);
    expect(r.bucket).toBe('hour');
    expect(r.to.getTime() - r.from.getTime()).toBe(r.prevTo.getTime() - r.prevFrom.getTime());
    expect(r.prevTo.toISOString()).toBe('2026-09-29T08:30:00.000Z');
  });

  it('makes N-day windows that include today and abut the previous window', () => {
    const r = rangeFor('7d', now);
    expect(r.days).toBe(7);
    expect(r.from.toISOString()).toBe('2026-09-23T18:00:00.000Z');
    expect(r.prevTo.getTime()).toBe(r.from.getTime());
  });

  it('never returns Infinity for deltas', () => {
    expect(delta(10, 0)).toBeNull();
    expect(delta(0, 0)).toBe(0);
    expect(delta(150, 100)).toBe(50);
    expect(delta(50, 100)).toBe(-50);
  });
});
