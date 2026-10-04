/**
 * Customer segmentation — the exact rules of the admin CRM
 * (frontend/lib/admin/insights.ts → buildCustomers), evaluated in order:
 *
 *   0. vip     — tagged "VIP" by staff (a manual decision always wins)
 *   1. risk    — ≥2 orders and cancel rate ≥50 %
 *   2. vip     — ≥5 live orders or ≥৳5,000 spent
 *   3. sleep   — last order more than 60 days ago
 *   4. regular — ≥2 live orders
 *   5. new     — everyone else
 *
 * "live" = confirmed and not cancelled/returned (pending orders don't count
 * as purchases yet). The same rules are mirrored in SQL by `segmentSql` so
 * list filters/counts run in the database; the unit tests pin both.
 */
export const SEGMENTS = ['new', 'regular', 'vip', 'risk', 'sleep'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABEL: Record<Segment, { bn: string; en: string }> = {
  new: { bn: 'নতুন', en: 'New' },
  regular: { bn: 'নিয়মিত', en: 'Regular' },
  vip: { bn: 'VIP', en: 'VIP' },
  risk: { bn: 'ঝুঁকি', en: 'At risk' },
  sleep: { bn: 'ঘুমন্ত', en: 'Dormant' },
};

export const SEGMENT_RULES = {
  riskMinOrders: 2,
  riskCancelRate: 0.5,
  vipMinLive: 5,
  vipMinSpent: 5000,
  sleepDays: 60,
  regularMinLive: 2,
} as const;

const DAY_MS = 86_400_000;

export type SegmentInput = {
  ordersCount: number;
  liveOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  lastOrderAt: Date | null;
  /** staff gave this customer the "VIP" tag */
  vipTagged?: boolean;
};

/** Tag name that marks a customer VIP by hand (case-insensitive). */
export const VIP_TAG = 'VIP';

export function hasVipTag(names: string[]): boolean {
  return names.some((n) => n.trim().toUpperCase() === VIP_TAG);
}

export function segmentOf(c: SegmentInput, now: Date = new Date()): Segment {
  const r = SEGMENT_RULES;
  if (c.vipTagged) return 'vip';
  if (c.ordersCount >= r.riskMinOrders && c.cancelledOrders / c.ordersCount >= r.riskCancelRate) return 'risk';
  if (c.liveOrders >= r.vipMinLive || c.totalSpent >= r.vipMinSpent) return 'vip';
  if (c.lastOrderAt && now.getTime() - c.lastOrderAt.getTime() > r.sleepDays * DAY_MS) return 'sleep';
  if (c.liveOrders >= r.regularMinLive) return 'regular';
  return 'new';
}

export function cancelRate(ordersCount: number, cancelled: number): number {
  return ordersCount > 0 ? Math.round((cancelled / ordersCount) * 1000) / 10 : 0;
}

/**
 * SQL CASE expression producing the segment for a `customers` row aliased
 * `alias`. `$now` must be bound by the caller (Prisma.sql keeps it a parameter).
 * Integer arithmetic (cancelled*2 >= orders) avoids float rounding at 50 %.
 */
export function segmentCaseSql(alias = 'c'): string {
  const r = SEGMENT_RULES;
  const a = alias;
  return `CASE
    WHEN EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
                  WHERE ct.customer_id = ${a}.id AND upper(btrim(t.name)) = '${VIP_TAG}') THEN 'vip'
    WHEN ${a}.orders_count >= ${r.riskMinOrders} AND ${a}.cancelled_orders * ${1 / r.riskCancelRate} >= ${a}.orders_count THEN 'risk'
    WHEN ${a}.live_orders >= ${r.vipMinLive} OR ${a}.total_spent >= ${r.vipMinSpent} THEN 'vip'
    WHEN ${a}.last_order_at IS NOT NULL AND ${a}.last_order_at < (now() - interval '${r.sleepDays} days') THEN 'sleep'
    WHEN ${a}.live_orders >= ${r.regularMinLive} THEN 'regular'
    ELSE 'new' END`;
}
