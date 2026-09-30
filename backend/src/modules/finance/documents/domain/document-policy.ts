import type { OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * Which accounting papers an order needs right now. Mirrors the storefront's
 * `bookOrder` (frontend/lib/books/ledger.ts):
 *
 *   • INVOICE  when the order becomes live (confirmed … delivered).
 *   • RECEIPT  prepaid (SSLCOMMERZ, bKash, Nagad, bank): once the order is live AND paid
 *              → normally together with the invoice at confirm/payment time.
 *              COD / cash: when the money is in (marked paid) or the order is delivered.
 *   • CREDIT_NOTE when a live (invoiced) order is cancelled or returned. It reverses the
 *              invoice; `reverseCourier` is true when the parcel never reached the courier
 *              (so the courier cost was never incurred), exactly like the frontend's
 *              `reverseCourier = prev < HANDED_TO_COURIER`.
 *
 * The decision is STATE based — it is recomputed from the database on every event,
 * so events arriving out of order or twice converge on the same set of papers
 * and never produce a duplicate. A new invoice is only possible when every earlier
 * invoice has been credited (an order re-opened after cancellation is a new sale).
 */
export const LIVE_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const DEAD_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'RETURNED'];
export const SHIPPED_STATUSES: readonly OrderStatus[] = ['HANDED_TO_COURIER', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const PREPAID: readonly PaymentMethod[] = ['SSLCOMMERZ', 'BKASH', 'NAGAD', 'BANK_TRANSFER'];

export function isLive(s: OrderStatus) {
  return LIVE_STATUSES.includes(s);
}

export function isPrepaid(method: PaymentMethod) {
  return PREPAID.includes(method);
}

export type BooksState = {
  method: PaymentMethod;
  status: OrderStatus;
  /** stage the order was cancelled from (orders.cancelled_from), when known */
  cancelledFrom: OrderStatus | null;
  /** money received: payment status ≠ UNPAID */
  paid: boolean;
  /** an invoice exists that no credit note reverses yet */
  liveInvoice: boolean;
  /** a receipt exists for the order */
  receipt: boolean;
  /** COD cash-in already posted to the cashbook for this order */
  codCashBooked: boolean;
};

export type BooksPlan = {
  invoice: boolean;
  receipt: boolean;
  credit: { reverseCourier: boolean } | null;
  /** post the COD collection into the `cash` account (with the receipt) */
  codCashIn: boolean;
};

export const NOTHING: BooksPlan = { invoice: false, receipt: false, credit: null, codCashIn: false };

export function planBooks(s: BooksState, hint: { from?: OrderStatus } = {}): BooksPlan {
  const live = isLive(s.status);
  const prepaid = isPrepaid(s.method);

  const invoice = live && !s.liveInvoice;
  const invoiced = s.liveInvoice || invoice;

  const moneyIn = prepaid ? s.paid : s.paid || s.status === 'DELIVERED';
  const receipt = live && invoiced && !s.receipt && moneyIn;

  let credit: BooksPlan['credit'] = null;
  if (DEAD_STATUSES.includes(s.status) && s.liveInvoice) {
    credit = { reverseCourier: reverseCourier(s.status, s.cancelledFrom ?? hint.from ?? null) };
  }

  const codCashIn = !prepaid && live && (receipt || s.receipt) && !s.codCashBooked;

  return { invoice, receipt, credit, codCashIn };
}

/** Courier cost is reversed only if the parcel never left our hands. */
export function reverseCourier(status: OrderStatus, from: OrderStatus | null): boolean {
  if (status === 'RETURNED') return false;
  if (!from) return true;
  return !SHIPPED_STATUSES.includes(from);
}

export function isEmptyPlan(p: BooksPlan) {
  return !p.invoice && !p.receipt && !p.credit && !p.codCashIn;
}
