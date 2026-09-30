/**
 * Calendar maths in Asia/Dhaka. Bangladesh has had a fixed UTC+06:00 offset
 * (no DST) since 2009, so a constant offset is exact and needs no tz database.
 * All report boundaries are half-open: [start, end).
 */
export const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

export type Range = { start: Date; end: Date };
export type Tenure = 'day' | 'month' | 'year';

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDay(s: string): boolean {
  const m = ISO_DAY.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

function parts(iso: string): [number, number, number] {
  const m = ISO_DAY.exec(iso);
  if (!m || !isIsoDay(iso)) throw new RangeError(`invalid ISO day: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Dhaka midnight of y-m-d as a UTC instant. */
function dhakaMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d) - DHAKA_OFFSET_MS);
}

/** The Dhaka calendar day an instant falls on: "2026-09-29". */
export function dhakaDay(at: Date = new Date()): string {
  const local = new Date(at.getTime() + DHAKA_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dayRange(iso: string): Range {
  const [y, m, d] = parts(iso);
  return { start: dhakaMidnight(y, m, d), end: dhakaMidnight(y, m, d + 1) };
}

/** Inclusive day span → half-open instant range. */
export function daySpan(fromIso: string, toIso: string): Range {
  return { start: dayRange(fromIso).start, end: dayRange(toIso).end };
}

/** Day / month / year that contains `anchorIso` (defaults to today in Dhaka). */
export function tenureRange(kind: Tenure, anchorIso: string = dhakaDay()): Range {
  const [y, m] = parts(anchorIso);
  if (kind === 'day') return dayRange(anchorIso);
  if (kind === 'month') return { start: dhakaMidnight(y, m, 1), end: dhakaMidnight(y, m + 1, 1) };
  return { start: dhakaMidnight(y, 1, 1), end: dhakaMidnight(y + 1, 1, 1) };
}

/** Every Dhaka day in [fromIso, toIso], inclusive. */
export function eachDay(fromIso: string, toIso: string, max = 400): string[] {
  const out: string[] = [];
  let cur = dayRange(fromIso).start.getTime();
  const last = dayRange(toIso).start.getTime();
  while (cur <= last && out.length < max) {
    out.push(dhakaDay(new Date(cur)));
    cur += 24 * 60 * 60 * 1000;
  }
  return out;
}

/** A date-only input means "noon that day in Dhaka" (mirrors the admin UI's `noon(day)`). */
export function noonOf(iso: string): Date {
  return new Date(dayRange(iso).start.getTime() + 12 * 60 * 60 * 1000);
}

/**
 * Parse a user-supplied "when": YYYY-MM-DD → noon that Dhaka day, an ISO
 * instant → itself, empty → now. Returns null when unparseable.
 */
export function parseWhen(input: string | undefined | null, now: Date = new Date()): Date | null {
  if (!input) return now;
  if (isIsoDay(input)) return noonOf(input);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input)) return null;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}
