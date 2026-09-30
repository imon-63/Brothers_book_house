import { planReopen } from './order-status';

const base = { paymentMethod: 'COD' as const, paymentStatus: 'UNPAID' as const, cancelledFrom: null };

describe('planReopen (বাতিল থেকে ফিরিয়ে আনা)', () => {
  it('only reopens cancelled or returned orders', () => {
    expect(planReopen({ ...base, status: 'CONFIRMED' }, { reason: 'আবার চাই', actor: 'STAFF' })).toMatchObject({ ok: false, code: 'order.reopen_not_closed' });
    expect(planReopen({ ...base, status: 'RETURNED' }, { reason: 'আবার চাই', actor: 'STAFF' })).toMatchObject({ ok: true });
  });

  it('requires staff and a reason', () => {
    expect(planReopen({ ...base, status: 'CANCELLED' }, { reason: 'x', actor: 'STAFF' })).toMatchObject({ ok: false, code: 'order.reopen_reason_required' });
    expect(planReopen({ ...base, status: 'CANCELLED' }, { reason: 'আবার চাই', actor: 'CUSTOMER' })).toMatchObject({ ok: false, code: 'order.reopen_forbidden' });
  });

  it('restarts where it makes sense', () => {
    expect(planReopen({ ...base, status: 'CANCELLED', cancelledFrom: 'PENDING' }, { reason: 'আবার চাই', actor: 'STAFF' })).toEqual({ ok: true, plan: { from: 'CANCELLED', to: 'PENDING' } });
    expect(planReopen({ ...base, status: 'CANCELLED', cancelledFrom: 'PROCESSING' }, { reason: 'আবার চাই', actor: 'STAFF' })).toEqual({ ok: true, plan: { from: 'CANCELLED', to: 'CONFIRMED' } });
    expect(planReopen({ ...base, status: 'CANCELLED', cancelledFrom: 'PROCESSING' }, { reason: 'আবার চাই', to: 'PENDING', actor: 'STAFF' })).toMatchObject({ ok: true, plan: { to: 'PENDING' } });
  });

  it('keeps unpaid online orders waiting for payment', () => {
    const ssl = { paymentMethod: 'SSLCOMMERZ' as const, paymentStatus: 'UNPAID' as const, cancelledFrom: 'CONFIRMED' as const, status: 'CANCELLED' as const };
    expect(planReopen(ssl, { reason: 'আবার চাই', actor: 'STAFF' })).toMatchObject({ ok: true, plan: { to: 'PENDING' } });
    expect(planReopen(ssl, { reason: 'আবার চাই', to: 'CONFIRMED', actor: 'STAFF' })).toMatchObject({ ok: false, code: 'order.awaiting_payment' });
  });
});
