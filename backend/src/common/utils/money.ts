import { Prisma } from '@prisma/client';

/**
 * Money helpers. All arithmetic uses Prisma.Decimal (decimal.js) — never JS
 * floats — and rounds half-up to 2 places (paisa) at the edges.
 */
export type Money = Prisma.Decimal;
export type MoneyLike = Prisma.Decimal | number | string;

export const ZERO = new Prisma.Decimal(0);

export function D(v: MoneyLike | null | undefined): Prisma.Decimal {
  if (v == null) return ZERO;
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

export function round2(v: MoneyLike): Prisma.Decimal {
  return D(v).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: MoneyLike[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((acc, v) => acc.plus(D(v)), ZERO);
}

/** `pct` of `amount`, e.g. percentOf(1000, 10) → 100.00 */
export function percentOf(amount: MoneyLike, pct: MoneyLike): Prisma.Decimal {
  return round2(D(amount).times(D(pct)).dividedBy(100));
}

export function min(a: MoneyLike, b: MoneyLike): Prisma.Decimal {
  return D(a).lessThan(D(b)) ? D(a) : D(b);
}

export function max(a: MoneyLike, b: MoneyLike): Prisma.Decimal {
  return D(a).greaterThan(D(b)) ? D(a) : D(b);
}

/** Round to the nearest `step` taka (bulk price edits → nearest ৳5). */
export function roundTo(v: MoneyLike, step: number): Prisma.Decimal {
  return D(v).dividedBy(step).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).times(step);
}

/**
 * Split `total` across `weights` proportionally so the parts add up exactly
 * (largest-remainder). Used to allocate a coupon over lines and a bundle
 * price over its books.
 */
export function allocate(total: MoneyLike, weights: MoneyLike[]): Prisma.Decimal[] {
  const t = round2(total);
  const w = weights.map(D);
  const wSum = sum(w);
  if (wSum.isZero()) return w.map((_, i) => (i === 0 ? t : ZERO));
  const raw = w.map((x) => t.times(x).dividedBy(wSum));
  const floored = raw.map((x) => x.toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN));
  let rest = t.minus(sum(floored)).times(100).toNumber();
  const order = raw
    .map((x, i) => ({ i, frac: x.minus(floored[i]).toNumber() }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floored[i] = floored[i].plus(0.01);
    rest -= 1;
  }
  return floored;
}

/** JSON-safe number for API responses (2dp). */
export function toNumber(v: MoneyLike | null | undefined): number {
  return v == null ? 0 : round2(v).toNumber();
}
