import { Prisma } from '@prisma/client';
import { D, max, roundTo, sum, type MoneyLike } from '@/common/utils/money';
import { effectivePrice, type DealLike, type PricedLike } from './effective-price';

/** Bulk price edits snap to the nearest ৳5 and never go below ৳5. */
export const PRICE_STEP = 5;

export type Offer = {
  /** what the customer pays now */
  price: Prisma.Decimal;
  /** struck-through price (regular price during a deal, else compare-at) */
  compareAt: Prisma.Decimal | null;
  listPrice: Prisma.Decimal;
  /** whole-number % shown on the badge (0 when there is nothing to strike) */
  discountPct: number;
  deal: { endsAt: Date } | null;
};

/** "−২০%" badge: rounded (1 − price / old) × 100, 0 when old is missing or not higher. */
export function discountPct(price: MoneyLike, compareAt: MoneyLike | null | undefined): number {
  if (compareAt == null) return 0;
  const old = D(compareAt);
  const now = D(price);
  if (old.lessThanOrEqualTo(0) || old.lessThanOrEqualTo(now)) return 0;
  return D(1).minus(now.dividedBy(old)).times(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/** Effective price + badge data for a product, given its (possibly) live deals. */
export function offerOf(p: PricedLike, deals: DealLike[] = [], now = new Date()): Offer {
  const e = effectivePrice(p, deals, now);
  return { ...e, discountPct: discountPct(e.price, e.compareAt) };
}

/**
 * Gross margin % on the selling price, rounded to a whole number.
 * null when the cost is unknown (no কেনা দাম) or the price is zero.
 */
export function marginPct(price: MoneyLike, cost: MoneyLike | null | undefined): number | null {
  if (cost == null) return null;
  const c = D(cost);
  const p = D(price);
  if (!p.greaterThan(0) || !c.greaterThan(0)) return null;
  return p.minus(c).dividedBy(p).times(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber();
}

/** Bulk "±N%" price change, rounded to the nearest ৳5 (never below ৳5). */
export function bulkAdjustedPrice(price: MoneyLike, percent: number, direction: 'up' | 'down'): Prisma.Decimal {
  const factor = D(100).plus(direction === 'up' ? percent : -percent).dividedBy(100);
  return max(PRICE_STEP, roundTo(D(price).times(factor), PRICE_STEP));
}

/**
 * Compare-at (পুরনো দাম) that makes `price` show `percent`% off:
 * round(price / (1 − p/100)). 0 or ≥100 → no compare-at.
 */
export function compareAtForDiscount(price: MoneyLike, percent: number): Prisma.Decimal | null {
  if (!(percent > 0 && percent < 100)) return null;
  const old = D(price)
    .dividedBy(D(1).minus(D(percent).dividedBy(100)))
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  return old.greaterThan(D(price)) ? old : null;
}

/** A compare-at that is not above the price is meaningless (and violates a DB CHECK). */
export function normaliseCompareAt(price: MoneyLike, compareAt: MoneyLike | null | undefined): Prisma.Decimal | null {
  if (compareAt == null) return null;
  return D(compareAt).greaterThan(D(price)) ? D(compareAt) : null;
}

export type BundleLine = {
  /** effective unit price of the product right now */
  unitPrice: MoneyLike;
  /** regular (list) unit price */
  listPrice: MoneyLike;
  quantity: number;
  inStock: boolean;
};

export type BundleSummary = {
  /** Σ what the items cost if bought one by one today */
  separatePrice: Prisma.Decimal;
  /** struck price: stored compare-at, else Σ regular item prices */
  compareAt: Prisma.Decimal;
  saving: Prisma.Decimal;
  savingPct: number;
  allInStock: boolean;
};

export function bundleSummary(price: MoneyLike, compareAt: MoneyLike | null | undefined, lines: BundleLine[]): BundleSummary {
  const separatePrice = sum(lines.map((l) => D(l.unitPrice).times(l.quantity)));
  const listTotal = sum(lines.map((l) => D(l.listPrice).times(l.quantity)));
  const strike = compareAt != null ? D(compareAt) : listTotal;
  const saving = max(0, separatePrice.minus(D(price)));
  const savingPct = separatePrice.greaterThan(0)
    ? saving.dividedBy(separatePrice).times(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber()
    : 0;
  return { separatePrice, compareAt: strike, saving, savingPct, allInStock: lines.length > 0 && lines.every((l) => l.inStock) };
}
