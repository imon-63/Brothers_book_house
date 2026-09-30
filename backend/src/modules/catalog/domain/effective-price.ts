import type { Prisma } from '@prisma/client';
import { D } from '@/common/utils/money';

export type DealLike = { dealPrice: Prisma.Decimal; startsAt: Date; endsAt: Date; cancelledAt: Date | null };
export type PricedLike = { price: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null };

export type EffectivePrice = {
  /** what the customer pays now */
  price: Prisma.Decimal;
  /** struck-through price to show (regular price during a deal, else compare-at) */
  compareAt: Prisma.Decimal | null;
  /** regular price, for order snapshots */
  listPrice: Prisma.Decimal;
  deal: { endsAt: Date } | null;
};

/**
 * Single rule for "what does this product cost right now" — used by the
 * storefront, the cart and checkout so they can never disagree.
 * A live deal (started, not ended, not cancelled, cheaper than regular) wins.
 */
export function effectivePrice(p: PricedLike, deals: DealLike[] = [], now = new Date()): EffectivePrice {
  const live = deals
    .filter((d) => !d.cancelledAt && d.startsAt <= now && d.endsAt > now && D(d.dealPrice).lessThan(D(p.price)))
    .sort((a, b) => D(a.dealPrice).comparedTo(D(b.dealPrice)))[0];
  if (live) {
    return { price: D(live.dealPrice), compareAt: D(p.price), listPrice: D(p.price), deal: { endsAt: live.endsAt } };
  }
  const compare = p.compareAtPrice && D(p.compareAtPrice).greaterThan(D(p.price)) ? D(p.compareAtPrice) : null;
  return { price: D(p.price), compareAt: compare, listPrice: D(p.price), deal: null };
}

/** Prisma `where` for deals that may be live — include in product queries. */
export const liveDealsWhere = (now = new Date()) => ({ cancelledAt: null, startsAt: { lte: now }, endsAt: { gt: now } });
