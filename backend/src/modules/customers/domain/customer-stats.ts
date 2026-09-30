import type { OrderStatus } from '@prisma/client';
import { D, round2, type MoneyLike } from '@/common/utils/money';

/** Purchases that count (confirmed, not cancelled/returned). Pending is not a purchase yet. */
export const LIVE_STATUSES: OrderStatus[] = ['CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
/** Orders that went bad — both feed the "at risk" cancel rate. */
export const CANCELLED_STATUSES: OrderStatus[] = ['CANCELLED', 'RETURNED'];

export const isLiveStatus = (s: OrderStatus) => LIVE_STATUSES.includes(s);
export const isCancelledStatus = (s: OrderStatus) => CANCELLED_STATUSES.includes(s);

export type OrderFact = { status: OrderStatus; grandTotal: MoneyLike; placedAt: Date };

export type CustomerAggregates = {
  ordersCount: number;
  liveOrders: number;
  cancelledOrders: number;
  totalSpent: string;
  firstOrderAt: Date | null;
  lastOrderAt: Date | null;
};

/**
 * Recompute a customer's cached CRM numbers from their orders. Pure and
 * total — replaying it any number of times gives the same answer, which is
 * what makes the order-event listeners idempotent.
 */
export function aggregateOrders(orders: OrderFact[]): CustomerAggregates {
  let live = 0;
  let cancelled = 0;
  let spent = D(0);
  let first: Date | null = null;
  let last: Date | null = null;
  for (const o of orders) {
    if (isLiveStatus(o.status)) {
      live += 1;
      spent = spent.plus(D(o.grandTotal));
    } else if (isCancelledStatus(o.status)) {
      cancelled += 1;
    }
    if (!first || o.placedAt < first) first = o.placedAt;
    if (!last || o.placedAt > last) last = o.placedAt;
  }
  return { ordersCount: orders.length, liveOrders: live, cancelledOrders: cancelled, totalSpent: round2(spent).toFixed(2), firstOrderAt: first, lastOrderAt: last };
}

/** Whole-number percentage, 0 when the whole is 0. */
export function share(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Highest-amount key with its share of the total, or null when there is nothing. */
export function favourite<K extends string>(rows: { key: K | null; amount: number }[]): { key: K; share: number } | null {
  const valid = rows.filter((r): r is { key: K; amount: number } => !!r.key && r.amount > 0);
  if (!valid.length) return null;
  const total = valid.reduce((s, r) => s + r.amount, 0);
  const top = [...valid].sort((a, b) => b.amount - a.amount)[0];
  return { key: top.key, share: share(top.amount, total) };
}

const DHAKA_OFFSET_MS = 6 * 3_600_000; // Asia/Dhaka is UTC+6, no DST

/** "YYYY-MM" of an instant in Dhaka time. */
export function dhakaMonthKey(at: Date): string {
  return new Date(at.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 7);
}

/** The last `n` Dhaka months, oldest first, with zero-filled values. */
export function monthlySeries(rows: { month: string; amount: number; orders?: number }[], n: number, now: Date = new Date()) {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const out: { month: string; amount: number; orders: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - i, 1));
    const key = d.toISOString().slice(0, 7);
    const hit = byMonth.get(key);
    out.push({ month: key, amount: hit?.amount ?? 0, orders: hit?.orders ?? 0 });
  }
  return out;
}

/** Start of the Dhaka calendar month containing `now`, shifted by `offset` months, as a UTC instant. */
export function dhakaMonthStart(now: Date = new Date(), offset = 0): Date {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1) - DHAKA_OFFSET_MS);
}
