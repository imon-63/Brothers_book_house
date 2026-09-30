import type { OrderPaymentStatus, OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * Order lifecycle — pure rules, no I/O.
 *
 *   PENDING → CONFIRMED → PROCESSING → HANDED_TO_COURIER → OUT_FOR_DELIVERY → DELIVERED
 *      └──────────────┴───────────┴──────────────┴──────────────┘→ CANCELLED
 *                                     HANDED_TO_COURIER / OUT_FOR_DELIVERY / DELIVERED → RETURNED
 *
 * Forward moves may skip steps (the admin board drags cards across columns).
 * Backward moves only through an explicit one-step "regress" before the parcel
 * leaves the shelf. CANCELLED and RETURNED are terminal.
 */
export const ORDER_FLOW: readonly OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const OPEN_STATUSES: readonly OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY'];
/** the admin "চলমান" tab */
export const RUNNING_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY'];
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'RETURNED'];
export const RETURNABLE_FROM: readonly OrderStatus[] = ['HANDED_TO_COURIER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
export const ALL_STATUSES: readonly OrderStatus[] = [...ORDER_FLOW, 'CANCELLED', 'RETURNED'];

export const STATUS_LABEL_BN: Record<OrderStatus, string> = {
  PENDING: 'অপেক্ষমাণ',
  CONFIRMED: 'অর্ডার নিশ্চিত',
  PROCESSING: 'প্রস্তুত হচ্ছে',
  HANDED_TO_COURIER: 'কুরিয়ারে তোলা হয়েছে',
  OUT_FOR_DELIVERY: 'ডেলিভারিতে আছে',
  DELIVERED: 'ডেলিভারি সম্পন্ন',
  CANCELLED: 'বাতিল',
  RETURNED: 'ফেরত',
};

/** Button text for "move to the next step" (admin). */
export const NEXT_ACTION_BN: Partial<Record<OrderStatus, string>> = {
  PENDING: 'কনফার্ম করুন',
  CONFIRMED: 'প্যাকিং শুরু',
  PROCESSING: 'কুরিয়ারে তুলুন',
  HANDED_TO_COURIER: 'ডেলিভারিতে পাঠান',
  OUT_FOR_DELIVERY: 'ডেলিভারি সম্পন্ন',
};

/** The only backward moves allowed (staff, before shipping). */
export const REGRESS_TO: Partial<Record<OrderStatus, OrderStatus>> = {
  PROCESSING: 'CONFIRMED',
};

export const rank = (s: OrderStatus) => ORDER_FLOW.indexOf(s);
export const isOpen = (s: OrderStatus) => OPEN_STATUSES.includes(s);
export const isTerminal = (s: OrderStatus) => TERMINAL_STATUSES.includes(s);
export const isShippedStage = (s: OrderStatus) => rank(s) >= rank('HANDED_TO_COURIER');

export function nextStatus(s: OrderStatus): OrderStatus | null {
  const r = rank(s);
  return r >= 0 && r < ORDER_FLOW.length - 1 ? ORDER_FLOW[r + 1] : null;
}

export function regressTarget(s: OrderStatus): OrderStatus | null {
  return REGRESS_TO[s] ?? null;
}

export type TransitionActor = 'STAFF' | 'CUSTOMER' | 'SYSTEM' | 'WEBHOOK';

export type OrderSnapshot = {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: OrderPaymentStatus;
  /** units are held in products.stock_reserved */
  stockReserved: boolean;
  confirmedAt: Date | null;
  /** set the first time the order reached HANDED_TO_COURIER (stock fulfilled) */
  shippedAt: Date | null;
};

export type CreditInput = { reason: string; courierLoss: string };

export type TransitionRequest = {
  to: OrderStatus;
  mode: 'advance' | 'regress';
  actor: TransitionActor;
  credit?: CreditInput | null;
  now: Date;
};

export type StockEffect = 'NONE' | 'FULFIL' | 'RELEASE' | 'RESTOCK';

export type TransitionPlan = {
  from: OrderStatus;
  to: OrderStatus;
  stock: StockEffect;
  set: {
    confirmedAt?: Date;
    shippedAt?: Date;
    deliveredAt?: Date;
    cancelledAt?: Date;
    cancelledFrom?: OrderStatus;
    stockReserved?: boolean;
  };
  /** COD delivered → cash collected with the parcel */
  markPaid: boolean;
  /** give coupon usage back */
  revokeCoupon: boolean;
  /** order leaves the open set (liveOrders − 1) */
  closes: boolean;
  /** cancelled/returned → CRM cancelled counter, totalSpent reversal */
  voids: boolean;
  /** finance must issue a credit note (live order cancelled / returned) */
  credit: CreditInput | null;
};

export type TransitionResult = { ok: true; plan: TransitionPlan } | { ok: false; code: string; message: string };

const fail = (code: string, message: string): TransitionResult => ({ ok: false, code, message });

/** Decide whether a move is legal and what it must do. Never touches I/O. */
export function planTransition(order: OrderSnapshot, req: TransitionRequest): TransitionResult {
  const from = order.status;
  const to = req.to;
  if (isTerminal(from)) return fail('order.closed', 'বাতিল বা ফেরত হওয়া অর্ডারের স্ট্যাটাস বদলানো যায় না');
  if (from === to) return fail('order.status_unchanged', 'অর্ডার আগেই এই ধাপে আছে');

  if (req.mode === 'regress') {
    if (req.actor !== 'STAFF') return fail('order.regress_forbidden', 'শুধু স্টাফ আগের ধাপে ফেরাতে পারে');
    if (regressTarget(from) !== to) return fail('order.regress_not_allowed', 'এই ধাপ থেকে আগের ধাপে ফেরানো যায় না');
    return { ok: true, plan: basePlan(from, to) };
  }

  if (to === 'CANCELLED' || to === 'RETURNED') return planVoid(order, req);

  if (rank(to) < 0) return fail('order.transition_invalid', 'অজানা স্ট্যাটাস');
  if (rank(to) < rank(from)) return fail('order.transition_backwards', 'পেছনের ধাপে যেতে "আগের ধাপ" ব্যবহার করুন');
  if (req.actor === 'CUSTOMER') return fail('order.customer_forbidden', 'এই পরিবর্তন করার অনুমতি নেই');
  if (from === 'PENDING' && order.paymentMethod === 'SSLCOMMERZ' && order.paymentStatus === 'UNPAID') {
    return fail('order.awaiting_payment', 'অনলাইন পেমেন্ট এখনো হয়নি — পেমেন্টের পর কনফার্ম হবে');
  }

  const plan = basePlan(from, to);
  if (rank(to) >= rank('CONFIRMED') && !order.confirmedAt) plan.set.confirmedAt = req.now;
  if (isShippedStage(to) && !order.shippedAt) {
    plan.stock = 'FULFIL';
    plan.set.shippedAt = req.now;
    plan.set.stockReserved = false;
  }
  if (to === 'DELIVERED') {
    plan.set.deliveredAt = req.now;
    plan.closes = true;
    plan.markPaid = order.paymentStatus === 'UNPAID';
  }
  return { ok: true, plan };
}

function planVoid(order: OrderSnapshot, req: TransitionRequest): TransitionResult {
  const from = order.status;
  if (req.to === 'CANCELLED' && !isOpen(from)) return fail('order.cancel_not_allowed', 'ডেলিভারি হয়ে যাওয়া অর্ডার বাতিল নয়, ফেরত করুন');
  if (req.to === 'RETURNED' && !RETURNABLE_FROM.includes(from)) return fail('order.return_not_allowed', 'কুরিয়ারে ওঠার আগে ফেরত হয় না — বাতিল করুন');
  if (req.actor === 'CUSTOMER' && !(req.to === 'CANCELLED' && from === 'PENDING')) {
    return fail('order.customer_cancel_not_allowed', 'কনফার্ম হওয়া অর্ডার বাতিল করতে হেল্পলাইনে যোগাযোগ করুন');
  }
  const live = from !== 'PENDING';
  const reason = req.credit?.reason?.trim();
  if (live && !reason) return fail('order.credit_required', 'চলমান অর্ডার বাতিল/ফেরতে কারণ দিন — ক্রেডিট নোট কাটা হবে');

  const plan = basePlan(from, req.to);
  plan.stock = order.shippedAt ? 'RESTOCK' : order.stockReserved ? 'RELEASE' : 'NONE';
  plan.set.cancelledAt = req.now;
  plan.set.cancelledFrom = from;
  plan.set.stockReserved = false;
  plan.revokeCoupon = true;
  plan.closes = isOpen(from);
  plan.voids = true;
  plan.credit = live && reason ? { reason, courierLoss: req.credit?.courierLoss ?? '0' } : null;
  return { ok: true, plan };
}

function basePlan(from: OrderStatus, to: OrderStatus): TransitionPlan {
  return { from, to, stock: 'NONE', set: {}, markPaid: false, revokeCoupon: false, closes: false, voids: false, credit: null };
}

// ─── reopen (বাতিল/ফেরত থেকে ফিরিয়ে আনা) ───

export type ReopenTarget = Extract<OrderStatus, 'PENDING' | 'CONFIRMED'>;
export type ReopenPlan = { from: OrderStatus; to: ReopenTarget };

/**
 * A cancelled or returned order may be brought back as a fresh sale — never
 * silently: a reason is mandatory and the caller logs history + audit + note.
 * It restarts at PENDING (or CONFIRMED when staff already verified it); an
 * unpaid online order can only restart at PENDING (it still needs payment).
 */
export function planReopen(
  order: Pick<OrderSnapshot, 'status' | 'paymentMethod' | 'paymentStatus'> & { cancelledFrom: OrderStatus | null },
  req: { to?: ReopenTarget; reason: string; actor: TransitionActor },
): { ok: true; plan: ReopenPlan } | { ok: false; code: string; message: string } {
  if (req.actor !== 'STAFF') return { ok: false, code: 'order.reopen_forbidden', message: 'শুধু স্টাফ অর্ডার ফিরিয়ে আনতে পারে' };
  if (!isTerminal(order.status)) return { ok: false, code: 'order.reopen_not_closed', message: 'শুধু বাতিল বা ফেরত হওয়া অর্ডার ফিরিয়ে আনা যায়' };
  if (req.reason.trim().length < 3) return { ok: false, code: 'order.reopen_reason_required', message: 'ফিরিয়ে আনার কারণ লিখুন' };
  const awaitingPayment = order.paymentMethod === 'SSLCOMMERZ' && order.paymentStatus === 'UNPAID';
  const wanted: ReopenTarget = req.to ?? (order.cancelledFrom && order.cancelledFrom !== 'PENDING' && !awaitingPayment ? 'CONFIRMED' : 'PENDING');
  if (wanted === 'CONFIRMED' && awaitingPayment) {
    return { ok: false, code: 'order.awaiting_payment', message: 'অনলাইন পেমেন্ট হয়নি — অপেক্ষমাণ হিসেবে ফিরিয়ে আনুন' };
  }
  return { ok: true, plan: { from: order.status, to: wanted } };
}
