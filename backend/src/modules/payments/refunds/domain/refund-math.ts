import type { OrderPaymentStatus, Prisma } from '@prisma/client';
import { D, round2, ZERO, type MoneyLike } from '@/common/utils/money';

type Dec = Prisma.Decimal;

export type RefundCheck = { ok: true; amount: Dec } | { ok: false; code: string; message: string; details?: Record<string, unknown> };

/**
 * How much can still be refunded: paid − already refunded − refunds in flight
 * (REQUESTED/PROCESSING), so two admins cannot refund the same money.
 */
export function refundable(amountPaid: MoneyLike, amountRefunded: MoneyLike, inFlight: MoneyLike = 0): Dec {
  const r = D(amountPaid).minus(D(amountRefunded)).minus(D(inFlight));
  return r.isNegative() ? ZERO : round2(r);
}

export function checkRefund(p: { amount: MoneyLike; amountPaid: MoneyLike; amountRefunded: MoneyLike; inFlight?: MoneyLike; paymentLimit?: MoneyLike | null }): RefundCheck {
  const amount = round2(p.amount);
  if (amount.lessThanOrEqualTo(0)) return { ok: false, code: 'refund.amount_invalid', message: 'ফেরতের পরিমাণ শূন্যের বেশি দিন' };
  if (D(p.amountPaid).lessThanOrEqualTo(0)) return { ok: false, code: 'refund.nothing_paid', message: 'এই অর্ডারে কোনো টাকা আসেনি — ফেরত দেওয়ার কিছু নেই' };
  const max = refundable(p.amountPaid, p.amountRefunded, p.inFlight);
  if (max.isZero()) return { ok: false, code: 'refund.fully_refunded', message: 'পুরো টাকা আগেই ফেরত দেওয়া হয়েছে' };
  if (amount.greaterThan(max)) {
    return { ok: false, code: 'refund.exceeds_paid', message: `সর্বোচ্চ ৳${max.toFixed(2)} ফেরত দেওয়া যায়`, details: { refundable: max.toNumber() } };
  }
  if (p.paymentLimit != null && amount.greaterThan(D(p.paymentLimit))) {
    return { ok: false, code: 'refund.exceeds_payment', message: `এই পেমেন্ট থেকে সর্বোচ্চ ৳${D(p.paymentLimit).toFixed(2)} ফেরত সম্ভব`, details: { refundable: D(p.paymentLimit).toNumber() } };
  }
  return { ok: true, amount };
}

/** Order payment status after refunds are applied. */
export function paymentStatusAfterRefund(amountPaid: MoneyLike, amountRefunded: MoneyLike): OrderPaymentStatus {
  const paid = D(amountPaid);
  const refunded = D(amountRefunded);
  if (paid.lessThanOrEqualTo(0)) return 'UNPAID';
  if (refunded.lessThanOrEqualTo(0)) return 'PAID';
  return refunded.greaterThanOrEqualTo(paid) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}

/** SSLCOMMERZ refund API status → our refund status. */
export function mapGatewayRefundStatus(status: string | undefined): 'COMPLETED' | 'PROCESSING' | 'FAILED' {
  switch (String(status ?? '').toLowerCase()) {
    case 'success':
    case 'refunded':
    case 'done':
      return 'COMPLETED';
    case 'processing':
    case 'initiated':
    case 'pending':
      return 'PROCESSING';
    default:
      return 'FAILED';
  }
}
