import type { OrderStatus } from '@prisma/client';
import { asciiDigits } from '@/common/utils/text';
import { ALL_STATUSES, RUNNING_STATUSES } from './order-status';

export type StatusTab = 'all' | 'pending' | 'run' | 'done' | 'cancel';
export const STATUS_TABS: StatusTab[] = ['all', 'pending', 'run', 'done', 'cancel'];

export const TAB_STATUSES: Record<StatusTab, readonly OrderStatus[]> = {
  all: ALL_STATUSES,
  pending: ['PENDING'],
  run: RUNNING_STATUSES,
  done: ['DELIVERED'],
  cancel: ['CANCELLED', 'RETURNED'],
};

/** Count orders per admin tab from a status → count map. */
export function tabCounts(byStatus: Partial<Record<OrderStatus, number>>): Record<StatusTab, number> {
  const out = {} as Record<StatusTab, number>;
  for (const tab of STATUS_TABS) out[tab] = TAB_STATUSES[tab].reduce((s, st) => s + (byStatus[st] ?? 0), 0);
  return out;
}

export type DateRange = 'all' | 'today' | '7' | '30' | 'custom';

const DHAKA_OFFSET_MS = 6 * 3_600_000; // Asia/Dhaka is UTC+6, no DST
const DAY = 86_400_000;

/** Midnight in Dhaka for the day containing `now`, as a UTC instant. */
export function dhakaDayStart(now: Date): Date {
  const local = now.getTime() + DHAKA_OFFSET_MS;
  return new Date(Math.floor(local / DAY) * DAY - DHAKA_OFFSET_MS);
}

/** "2026-09-29" (a Dhaka calendar day) → its UTC start instant. */
export function dhakaDate(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00+06:00`);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Placed-at window for the admin date filter. `lt` is exclusive. */
export function dateWindow(range: DateRange, now: Date, from?: string, to?: string): { gte?: Date; lt?: Date } {
  switch (range) {
    case 'today':
      return { gte: dhakaDayStart(now) };
    case '7':
      return { gte: new Date(now.getTime() - 7 * DAY) };
    case '30':
      return { gte: new Date(now.getTime() - 30 * DAY) };
    case 'custom': {
      const a = from ? dhakaDate(from) : null;
      const b = to ? dhakaDate(to) : null;
      return { ...(a ? { gte: a } : {}), ...(b ? { lt: new Date(b.getTime() + DAY) } : {}) };
    }
    default:
      return {};
  }
}

/** "2042", "clo2042", "CLO-2042", "  clo-2042 " → "CLO-2042" (storefront orderKey). */
export function normalizeOrderNo(raw: string): string | null {
  const s = asciiDigits(raw).trim().toUpperCase().replace(/\s+/g, '').replace(/^(CLO|BBH)-?/, '');
  return /^\d{1,10}$/.test(s) ? `CLO-${s}` : null;
}

/** Digits a phone search should look for inside "+8801711111111". */
export function phoneNeedle(q: string): string | null {
  const d = asciiDigits(q).replace(/\D/g, '');
  if (d.length < 4) return null;
  return d.startsWith('0') ? d.slice(1) : d;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route param may be the uuid or the human number ("CLO-2042" / "2042"). */
export function orderRef(ref: string): { id: string } | { orderNo: string } | null {
  if (UUID.test(ref)) return { id: ref };
  const no = normalizeOrderNo(ref);
  return no ? { orderNo: no } : null;
}
