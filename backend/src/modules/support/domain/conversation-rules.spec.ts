import { afterMessage, canAccess, hashGuestToken, newGuestToken, nextStatus, preview, tokenMatches } from './conversation-rules';

describe('guest tokens', () => {
  it('stores a 64-hex hash and matches only the right token', () => {
    const { token, hash } = newGuestToken();
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGuestToken(token)).toBe(hash);
    expect(tokenMatches(token, hash)).toBe(true);
    expect(tokenMatches('nope', hash)).toBe(false);
    expect(tokenMatches(undefined, hash)).toBe(false);
  });
});

describe('canAccess', () => {
  const { token, hash } = newGuestToken();
  it('customer threads by customer id only', () => {
    expect(canAccess({ customerId: 'c1', guestToken: null }, { customerId: 'c1' })).toBe(true);
    expect(canAccess({ customerId: 'c1', guestToken: null }, { customerId: 'c2' })).toBe(false);
    expect(canAccess({ customerId: 'c1', guestToken: hash }, { customerId: null, guestToken: token })).toBe(false);
  });
  it('guest threads by token', () => {
    expect(canAccess({ customerId: null, guestToken: hash }, { customerId: null, guestToken: token })).toBe(true);
    expect(canAccess({ customerId: null, guestToken: hash }, { customerId: 'c1' })).toBe(false);
  });
});

describe('status rules', () => {
  it('staff transitions', () => {
    expect(nextStatus('OPEN', 'resolve')).toBe('RESOLVED');
    expect(nextStatus('CLOSED', 'resolve')).toBeNull();
    expect(nextStatus('RESOLVED', 'reopen')).toBe('OPEN');
    expect(nextStatus('OPEN', 'reopen')).toBeNull();
    expect(nextStatus('PENDING', 'close')).toBe('CLOSED');
  });
  it('message effects', () => {
    expect(afterMessage('CLOSED', 'CUSTOMER')).toEqual({ status: 'OPEN', staffUnread: 1, customerUnread: 0, reopened: true });
    expect(afterMessage('PENDING', 'CUSTOMER')).toMatchObject({ status: 'OPEN', reopened: false });
    expect(afterMessage('OPEN', 'STAFF')).toEqual({ status: 'PENDING', staffUnread: 0, customerUnread: 1, reopened: false });
  });
  it('preview flattens and trims', () => {
    expect(preview('a\n\n b', 80)).toBe('a b');
    expect(preview('x'.repeat(100), 10)).toHaveLength(10);
  });
});
