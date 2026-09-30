import { Prisma, type CouponScope, type CouponType } from '@prisma/client';
import { allocate, D, min, sum, ZERO, type Money, type MoneyLike } from '@/common/utils/money';
import { takaBn } from '../../domain/bangla';

export type CouponTargetRule = { sectionCode: string | null; categoryId: string | null; productId: string | null; bundleId: string | null };

export type CouponRule = {
  id: string;
  code: string;
  type: CouponType;
  value: MoneyLike;
  maxDiscount: MoneyLike | null;
  minSubtotal: MoneyLike;
  scope: CouponScope;
  targets: CouponTargetRule[];
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  deletedAt?: Date | null;
};

export type CouponLine = {
  kind: 'PRODUCT' | 'BUNDLE';
  productId: string | null;
  bundleId: string | null;
  sectionCode: string;
  /** category + sub-category of a product line (empty for bundles) */
  categoryIds: string[];
  /** unit price × qty */
  gross: MoneyLike;
};

/** null = unknown (guest quote before a phone is given) → checked again at placement */
export type CouponUsage = { customerRedemptions: number | null; customerPriorOrders: number | null };

export type CouponRejection = { ok: false; code: string; message: string; details?: Record<string, unknown> };
export type CouponApplied = {
  ok: true;
  code: string;
  type: CouponType;
  discount: Money;
  /** per input line, same order; sums exactly to `discount` */
  allocations: Money[];
  eligible: boolean[];
  eligibleSubtotal: Money;
  freeShipping: boolean;
};
export type CouponEvaluation = CouponApplied | CouponRejection;

export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

const reject = (code: string, message: string, details?: Record<string, unknown>): CouponRejection => ({ ok: false, code, message, details });

/** Is a single cart line inside the coupon's scope? */
export function lineEligible(rule: Pick<CouponRule, 'scope' | 'targets'>, line: CouponLine): boolean {
  const t = rule.targets;
  switch (rule.scope) {
    case 'ALL':
      return true;
    case 'SECTION':
      return t.some((x) => x.sectionCode != null && x.sectionCode === line.sectionCode);
    case 'CATEGORY':
      return line.kind === 'PRODUCT' && t.some((x) => x.categoryId != null && line.categoryIds.includes(x.categoryId));
    case 'PRODUCT':
      return line.kind === 'PRODUCT' && t.some((x) => x.productId != null && x.productId === line.productId);
    case 'BUNDLE':
      return line.kind === 'BUNDLE' && t.some((x) => x.bundleId != null && x.bundleId === line.bundleId);
    default:
      return false;
  }
}

/** Window / activity / usage checks that do not depend on the cart. */
export function couponAvailability(rule: CouponRule, usage: CouponUsage, now: Date): CouponRejection | null {
  if (!rule.isActive || rule.deletedAt) return reject('coupon.inactive', 'কুপনটি এখন চালু নেই');
  if (rule.startsAt && rule.startsAt > now) return reject('coupon.not_started', 'কুপনটি এখনো শুরু হয়নি', { startsAt: rule.startsAt });
  if (rule.endsAt && rule.endsAt <= now) return reject('coupon.expired', 'কুপনের মেয়াদ শেষ', { endsAt: rule.endsAt });
  if (rule.usageLimit != null && rule.usedCount >= rule.usageLimit) return reject('coupon.exhausted', 'কুপনটি সর্বোচ্চ বার ব্যবহার হয়ে গেছে');
  if (rule.perCustomerLimit != null && usage.customerRedemptions != null && usage.customerRedemptions >= rule.perCustomerLimit) {
    return reject('coupon.customer_limit', 'আপনি এই কুপন সর্বোচ্চ বার ব্যবহার করেছেন', { limit: rule.perCustomerLimit });
  }
  if (rule.firstOrderOnly && usage.customerPriorOrders != null && usage.customerPriorOrders > 0) {
    return reject('coupon.first_order_only', 'কুপনটি শুধু প্রথম অর্ডারে প্রযোজ্য');
  }
  return null;
}

/**
 * Apply a coupon to cart lines.
 *  • PERCENT: % of eligible subtotal, rounded to whole taka (storefront `Math.round`), capped by maxDiscount
 *  • FIXED:   value, capped at the eligible subtotal
 *  • FREE_SHIPPING: no item discount, delivery becomes free
 * `minSubtotal` is checked against the whole cart subtotal ("৳X+ অর্ডারে").
 * The discount is allocated over eligible lines by their gross (largest remainder).
 */
export function evaluateCoupon(rule: CouponRule, lines: CouponLine[], usage: CouponUsage, now: Date): CouponEvaluation {
  const unavailable = couponAvailability(rule, usage, now);
  if (unavailable) return unavailable;
  const subtotal = sum(lines.map((l) => l.gross));
  if (subtotal.lessThan(D(rule.minSubtotal))) {
    return reject('coupon.min_subtotal', `কুপনটি ${takaBn(rule.minSubtotal)}-এর বেশি অর্ডারে প্রযোজ্য`, { minSubtotal: D(rule.minSubtotal).toNumber() });
  }
  const eligible = lines.map((l) => lineEligible(rule, l));
  const eligibleSubtotal = sum(lines.filter((_, i) => eligible[i]).map((l) => l.gross));
  if (!eligible.some(Boolean) || eligibleSubtotal.isZero()) return reject('coupon.not_applicable', 'কার্টের পণ্যে এই কুপন প্রযোজ্য নয়');

  let discount = ZERO;
  if (rule.type === 'PERCENT') {
    discount = eligibleSubtotal.times(D(rule.value)).dividedBy(100).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    if (rule.maxDiscount != null) discount = min(discount, rule.maxDiscount);
    discount = min(discount, eligibleSubtotal);
  } else if (rule.type === 'FIXED') {
    discount = min(rule.value, eligibleSubtotal);
  }
  discount = discount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

  const weights = lines.map((l, i) => (eligible[i] ? D(l.gross) : ZERO));
  const allocations = discount.isZero() ? lines.map(() => ZERO) : allocate(discount, weights);
  return {
    ok: true,
    code: normalizeCouponCode(rule.code),
    type: rule.type,
    discount,
    allocations,
    eligible,
    eligibleSubtotal,
    freeShipping: rule.type === 'FREE_SHIPPING',
  };
}

export type CouponShape = {
  type: CouponType;
  value: number;
  maxDiscount?: number | null;
  scope: CouponScope;
  targets: Partial<CouponTargetRule>[];
  startsAt?: Date | null;
  endsAt?: Date | null;
};

const SCOPE_FIELD: Record<Exclude<CouponScope, 'ALL'>, keyof CouponTargetRule> = {
  SECTION: 'sectionCode',
  CATEGORY: 'categoryId',
  PRODUCT: 'productId',
  BUNDLE: 'bundleId',
};

/** Admin-side validation mirroring the coupons_value / coupons_window / coupon_targets CHECKs. */
export function validateCouponShape(c: CouponShape): CouponRejection | null {
  if (c.type === 'PERCENT' && !(c.value > 0 && c.value < 100)) return reject('coupon.value_invalid', 'শতাংশ ০-এর বেশি ও ১০০-এর কম দিন');
  if (c.type === 'FIXED' && !(c.value > 0)) return reject('coupon.value_invalid', 'ছাড়ের টাকা ০-এর বেশি দিন');
  if (c.type !== 'PERCENT' && c.maxDiscount != null) return reject('coupon.max_discount_invalid', 'সর্বোচ্চ ছাড় শুধু শতাংশ কুপনে প্রযোজ্য');
  if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) return reject('coupon.window_invalid', 'শেষের সময় শুরুর পরে দিন');
  if (c.scope === 'ALL') return c.targets.length ? reject('coupon.targets_invalid', 'সব পণ্যের কুপনে টার্গেট লাগে না') : null;
  if (!c.targets.length) return reject('coupon.targets_required', 'কোন পণ্য/বিভাগে প্রযোজ্য, সেটি বাছুন');
  const field = SCOPE_FIELD[c.scope];
  for (const t of c.targets) {
    const set = (Object.keys(SCOPE_FIELD) as (keyof typeof SCOPE_FIELD)[]).map((k) => SCOPE_FIELD[k]).filter((f) => t[f] != null);
    if (set.length !== 1 || set[0] !== field) return reject('coupon.targets_invalid', 'টার্গেট কুপনের ধরনের সাথে মিলছে না', { scope: c.scope });
  }
  return null;
}
