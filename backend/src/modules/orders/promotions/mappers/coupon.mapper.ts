import type { Coupon, CouponTarget } from '@prisma/client';
import { toNumber } from '@/common/utils/money';

export type CouponStats = { uses: number; discountGiven: number; revenue: number };

export function toCoupon(c: Coupon & { targets?: CouponTarget[] }, stats?: CouponStats) {
  const now = new Date();
  const expired = !!c.endsAt && c.endsAt <= now;
  const exhausted = c.usageLimit != null && c.usedCount >= c.usageLimit;
  return {
    id: c.id,
    code: c.code.toUpperCase(),
    description: c.description,
    type: c.type,
    value: toNumber(c.value),
    maxDiscount: c.maxDiscount == null ? null : toNumber(c.maxDiscount),
    minSubtotal: toNumber(c.minSubtotal),
    scope: c.scope,
    targets: c.targets?.map((t) => ({ id: t.id, sectionCode: t.sectionCode, categoryId: t.categoryId, productId: t.productId, bundleId: t.bundleId })),
    usageLimit: c.usageLimit,
    perCustomerLimit: c.perCustomerLimit,
    usedCount: c.usedCount,
    firstOrderOnly: c.firstOrderOnly,
    isActive: c.isActive,
    showInHeader: c.showInHeader,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    live: c.isActive && !expired && !exhausted && (!c.startsAt || c.startsAt <= now),
    expired,
    exhausted,
    stats,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Nav chip shape for the storefront header. */
export function toHeaderCoupon(c: Coupon) {
  return {
    code: c.code.toUpperCase(),
    type: c.type,
    value: toNumber(c.value),
    maxDiscount: c.maxDiscount == null ? null : toNumber(c.maxDiscount),
    minSubtotal: toNumber(c.minSubtotal),
    scope: c.scope,
    description: c.description,
    endsAt: c.endsAt,
  };
}
