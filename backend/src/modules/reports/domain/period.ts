export type Period = 'today' | '7d' | '30d' | '90d';
export const PERIODS: Period[] = ['today', '7d', '30d', '90d'];

const DAY = 86_400_000;
/** Dhaka is UTC+6 with no DST. */
const DHAKA_OFFSET = 6 * 3_600_000;

/** Start of the Dhaka calendar day containing `at`, as a UTC Date. */
export function dhakaDayStart(at: Date): Date {
  const local = at.getTime() + DHAKA_OFFSET;
  return new Date(Math.floor(local / DAY) * DAY - DHAKA_OFFSET);
}

export type Range = { from: Date; to: Date; prevFrom: Date; prevTo: Date; bucket: 'hour' | 'day'; days: number };

/**
 * Current window and the equal-length window before it.
 * "today" compares with yesterday up to the same clock time (fair delta);
 * N-day periods end now and include today.
 */
export function rangeFor(period: Period, now = new Date()): Range {
  if (period === 'today') {
    const from = dhakaDayStart(now);
    const elapsed = now.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - DAY);
    return { from, to: now, prevFrom, prevTo: new Date(prevFrom.getTime() + elapsed), bucket: 'hour', days: 1 };
  }
  const days = Number(period.replace('d', ''));
  const from = new Date(dhakaDayStart(now).getTime() - (days - 1) * DAY);
  const span = now.getTime() - from.getTime();
  return { from, to: now, prevFrom: new Date(from.getTime() - span), prevTo: from, bucket: 'day', days };
}

/** % change; null when there is nothing to compare with (avoid ±Infinity). */
export function delta(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}
