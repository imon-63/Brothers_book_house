import { nextStatus, planTransition, regressTarget, type OrderSnapshot, type TransitionPlan, type TransitionRequest } from './order-status';

const now = new Date('2026-09-29T10:00:00Z');
const base: OrderSnapshot = { status: 'PENDING', paymentMethod: 'COD', paymentStatus: 'UNPAID', stockReserved: true, confirmedAt: null, shippedAt: null };
const req = (to: TransitionRequest['to'], extra: Partial<TransitionRequest> = {}): TransitionRequest => ({ to, mode: 'advance', actor: 'STAFF', now, ...extra });

function ok(o: Partial<OrderSnapshot>, r: TransitionRequest): TransitionPlan {
  const res = planTransition({ ...base, ...o }, r);
  if (!res.ok) throw new Error(`expected ok, got ${res.code}`);
  return res.plan;
}
function code(o: Partial<OrderSnapshot>, r: TransitionRequest) {
  const res = planTransition({ ...base, ...o }, r);
  return res.ok ? 'ok' : res.code;
}

describe('order state machine', () => {
  it('walks the happy path one step at a time', () => {
    expect(nextStatus('PENDING')).toBe('CONFIRMED');
    expect(nextStatus('OUT_FOR_DELIVERY')).toBe('DELIVERED');
    expect(nextStatus('DELIVERED')).toBeNull();
    expect(nextStatus('CANCELLED')).toBeNull();
  });

  it('confirm stamps confirmedAt and keeps the hold', () => {
    const p = ok({}, req('CONFIRMED'));
    expect(p.set.confirmedAt).toEqual(now);
    expect(p.stock).toBe('NONE');
    expect(p.closes).toBe(false);
  });

  it('allows skipping forward and fulfils stock the first time it ships', () => {
    const p = ok({}, req('OUT_FOR_DELIVERY'));
    expect(p.stock).toBe('FULFIL');
    expect(p.set.confirmedAt).toEqual(now);
    expect(p.set.shippedAt).toEqual(now);
    expect(p.set.stockReserved).toBe(false);
  });

  it('does not fulfil twice', () => {
    const p = ok({ status: 'HANDED_TO_COURIER', shippedAt: now, stockReserved: false, confirmedAt: now }, req('OUT_FOR_DELIVERY'));
    expect(p.stock).toBe('NONE');
    expect(p.set.shippedAt).toBeUndefined();
    expect(p.set.confirmedAt).toBeUndefined();
  });

  it('delivered closes the order and marks COD paid', () => {
    const p = ok({ status: 'OUT_FOR_DELIVERY', shippedAt: now, confirmedAt: now }, req('DELIVERED'));
    expect(p.set.deliveredAt).toEqual(now);
    expect(p.closes).toBe(true);
    expect(p.markPaid).toBe(true);
    const paid = ok({ status: 'OUT_FOR_DELIVERY', shippedAt: now, confirmedAt: now, paymentStatus: 'PAID' }, req('DELIVERED'));
    expect(paid.markPaid).toBe(false);
  });

  it('rejects backwards moves and no-ops', () => {
    expect(code({ status: 'PROCESSING' }, req('CONFIRMED'))).toBe('order.transition_backwards');
    expect(code({ status: 'CONFIRMED' }, req('CONFIRMED'))).toBe('order.status_unchanged');
    expect(code({ status: 'CONFIRMED' }, req('PENDING'))).toBe('order.transition_backwards');
  });

  it('terminal states are closed', () => {
    expect(code({ status: 'CANCELLED' }, req('CONFIRMED'))).toBe('order.closed');
    expect(code({ status: 'RETURNED' }, req('DELIVERED'))).toBe('order.closed');
  });

  it('regress is one step, staff only, before shipping', () => {
    expect(regressTarget('PROCESSING')).toBe('CONFIRMED');
    expect(ok({ status: 'PROCESSING' }, req('CONFIRMED', { mode: 'regress' })).stock).toBe('NONE');
    expect(code({ status: 'CONFIRMED' }, req('PENDING', { mode: 'regress' }))).toBe('order.regress_not_allowed');
    expect(code({ status: 'HANDED_TO_COURIER' }, req('PROCESSING', { mode: 'regress' }))).toBe('order.regress_not_allowed');
    expect(code({ status: 'PROCESSING' }, req('CONFIRMED', { mode: 'regress', actor: 'SYSTEM' }))).toBe('order.regress_forbidden');
  });

  it('SSL orders cannot be confirmed before payment', () => {
    expect(code({ paymentMethod: 'SSLCOMMERZ' }, req('CONFIRMED'))).toBe('order.awaiting_payment');
    expect(code({ paymentMethod: 'SSLCOMMERZ', paymentStatus: 'PAID' }, req('CONFIRMED'))).toBe('ok');
  });

  describe('cancel / return side-effects table', () => {
    const cases: [Partial<OrderSnapshot>, 'CANCELLED' | 'RETURNED', string][] = [
      [{ status: 'PENDING' }, 'CANCELLED', 'RELEASE'],
      [{ status: 'PENDING', stockReserved: false }, 'CANCELLED', 'NONE'],
      [{ status: 'PROCESSING', confirmedAt: now }, 'CANCELLED', 'RELEASE'],
      [{ status: 'HANDED_TO_COURIER', shippedAt: now, stockReserved: false }, 'CANCELLED', 'RESTOCK'],
      [{ status: 'OUT_FOR_DELIVERY', shippedAt: now, stockReserved: false }, 'RETURNED', 'RESTOCK'],
      [{ status: 'DELIVERED', shippedAt: now, stockReserved: false }, 'RETURNED', 'RESTOCK'],
    ];
    it.each(cases)('%o → %s = %s', (o, to, stock) => {
      const p = ok(o, req(to, { credit: { reason: 'কাস্টমার ফেরত দিয়েছে', courierLoss: '0' } }));
      expect(p.stock).toBe(stock);
      expect(p.set.cancelledAt).toEqual(now);
      expect(p.set.cancelledFrom).toBe(o.status);
      expect(p.revokeCoupon).toBe(true);
      expect(p.voids).toBe(true);
      expect(p.closes).toBe(o.status !== 'DELIVERED');
    });
  });

  it('pending cancel needs no credit; live cancel requires a reason', () => {
    expect(ok({}, req('CANCELLED')).credit).toBeNull();
    expect(code({ status: 'CONFIRMED' }, req('CANCELLED'))).toBe('order.credit_required');
    expect(code({ status: 'CONFIRMED' }, req('CANCELLED', { credit: { reason: '  ', courierLoss: '0' } }))).toBe('order.credit_required');
    const p = ok({ status: 'CONFIRMED' }, req('CANCELLED', { credit: { reason: 'ভুল ঠিকানা', courierLoss: '20' } }));
    expect(p.credit).toEqual({ reason: 'ভুল ঠিকানা', courierLoss: '20' });
  });

  it('delivered cannot be cancelled, pre-courier cannot be returned', () => {
    expect(code({ status: 'DELIVERED' }, req('CANCELLED', { credit: { reason: 'x', courierLoss: '0' } }))).toBe('order.cancel_not_allowed');
    expect(code({ status: 'PROCESSING' }, req('RETURNED', { credit: { reason: 'x', courierLoss: '0' } }))).toBe('order.return_not_allowed');
  });

  it('customers may only cancel their own pending order', () => {
    expect(code({}, req('CANCELLED', { actor: 'CUSTOMER' }))).toBe('ok');
    expect(code({ status: 'CONFIRMED' }, req('CANCELLED', { actor: 'CUSTOMER', credit: { reason: 'x', courierLoss: '0' } }))).toBe('order.customer_cancel_not_allowed');
    expect(code({}, req('CONFIRMED', { actor: 'CUSTOMER' }))).toBe('order.customer_forbidden');
  });
});
