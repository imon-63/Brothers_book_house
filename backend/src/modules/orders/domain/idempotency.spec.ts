import { hashRequest, isValidIdempotencyKey, stableStringify } from './idempotency';

describe('idempotency hashing', () => {
  it('ignores key order and undefined fields', () => {
    const a = { b: 1, a: { y: [1, 2], x: 'ক' }, c: undefined };
    const b = { a: { x: 'ক', y: [1, 2] }, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(hashRequest('order.place', 'guest', a)).toBe(hashRequest('order.place', 'guest', b));
  });

  it('is sensitive to array order, values, scope and caller', () => {
    const h = hashRequest('order.place', 'guest', { lines: [1, 2] });
    expect(hashRequest('order.place', 'guest', { lines: [2, 1] })).not.toBe(h);
    expect(hashRequest('order.place', 'guest', { lines: [1, 3] })).not.toBe(h);
    expect(hashRequest('order.admin', 'guest', { lines: [1, 2] })).not.toBe(h);
    expect(hashRequest('order.place', 'user:1', { lines: [1, 2] })).not.toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('serialises dates and nulls stably', () => {
    expect(stableStringify({ d: new Date('2026-01-01T00:00:00Z'), n: null })).toBe('{"d":"2026-01-01T00:00:00.000Z","n":null}');
  });

  it('validates key shape', () => {
    expect(isValidIdempotencyKey('0f8c2c6e-1111-4d5e-9b1a-2e2f3a4b5c6d')).toBe(true);
    expect(isValidIdempotencyKey('short')).toBe(false);
    expect(isValidIdempotencyKey('has space in it')).toBe(false);
    expect(isValidIdempotencyKey(undefined)).toBe(false);
    expect(isValidIdempotencyKey('x'.repeat(81))).toBe(false);
  });
});
