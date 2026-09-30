import type { ShippingRuleType } from '@prisma/client';
import { D, type Money, type MoneyLike } from '@/common/utils/money';
import { takaBn } from '../../domain/bangla';

export type ZoneInfo = {
  id: number;
  code: string;
  nameBn: string;
  fee: MoneyLike;
  courierCost: MoneyLike;
  etaMinDays: number;
  etaMaxDays: number;
};

export type FreeShippingRule = {
  id: string;
  type: ShippingRuleType;
  label: string;
  minSubtotal: MoneyLike | null;
  sectionId: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  priority: number;
};

export type ShippingLine = { kind: 'PRODUCT' | 'BUNDLE'; sectionId: string; freeShipping: boolean };

export type ShippingInput = {
  zone: ZoneInfo | null;
  lines: ShippingLine[];
  /** items subtotal after coupon discount (the storefront's `net`) */
  netSubtotal: MoneyLike;
  couponFreeShipping?: boolean;
  rules: FreeShippingRule[];
  now: Date;
};

export type ShippingBasis = 'ITEM_FLAGS' | 'ANY_BUNDLE' | 'SECTION_ONLY' | 'COUPON' | 'CAMPAIGN_ALL' | 'MIN_SUBTOTAL' | 'ZONE' | 'UNKNOWN_DISTRICT';

export type ShippingOutcome = {
  /** charged to the customer; null → district not chosen yet */
  fee: Money | null;
  free: boolean;
  reason: string;
  basis: ShippingBasis;
  ruleId: string | null;
  zoneCode: string | null;
  /** what the courier will likely bill us (zone.courierCost) */
  expectedCourierCost: Money | null;
  /** lowest live "৳X+ free" threshold, for "add ৳Y more" hints */
  freeAbove: Money | null;
  amountToFree: Money | null;
  campaign: boolean;
};

export const REASON = {
  free: 'ফ্রি ডেলিভারি',
  coupon: 'কুপন · ফ্রি ডেলিভারি',
  campaign: 'ক্যাম্পেইন · সবার জন্য ফ্রি',
  minSubtotal: (min: MoneyLike) => `${takaBn(min)}+ অর্ডারে ফ্রি`,
  unknown: 'জেলা বাছুন — ঢাকা/বাইরের রেট বসবে',
};

export function ruleIsLive(r: Pick<FreeShippingRule, 'isActive' | 'startsAt' | 'endsAt'>, now: Date): boolean {
  return r.isActive && (!r.startsAt || r.startsAt <= now) && (!r.endsAt || r.endsAt > now);
}

/**
 * Delivery fee with the storefront's precedence:
 *   1. every item flagged free / a bundle rule / a single-section rule → "ফ্রি ডেলিভারি"
 *   2. FREE_SHIPPING coupon
 *   3. time-boxed campaign for everyone
 *   4. net subtotal ≥ threshold
 *   5. no district yet → fee unknown
 *   6. the district's zone fee ("ঢাকার ভিতর" / "ঢাকার বাইরে")
 */
export function resolveShipping(input: ShippingInput): ShippingOutcome {
  const live = input.rules.filter((r) => ruleIsLive(r, input.now)).sort((a, b) => b.priority - a.priority);
  const net = D(input.netSubtotal);
  const zone = input.zone;
  const minRules = live.filter((r) => r.type === 'MIN_SUBTOTAL' && r.minSubtotal != null && D(r.minSubtotal).greaterThan(0));
  const lowest = minRules.reduce<FreeShippingRule | null>((m, r) => (!m || D(r.minSubtotal).lessThan(D(m.minSubtotal)) ? r : m), null);
  const freeAbove = lowest ? D(lowest.minSubtotal) : null;
  const campaignRule = live.find((r) => r.type === 'CAMPAIGN_ALL') ?? null;

  const outcome = (basis: ShippingBasis, reason: string, ruleId: string | null, fee: Money | null): ShippingOutcome => ({
    fee,
    free: fee != null && fee.isZero(),
    reason,
    basis,
    ruleId,
    zoneCode: zone?.code ?? null,
    expectedCourierCost: zone ? D(zone.courierCost) : null,
    freeAbove,
    amountToFree: freeAbove && net.lessThan(freeAbove) && basis === 'ZONE' ? freeAbove.minus(net) : null,
    campaign: !!campaignRule,
  });
  const zero = D(0);
  const lines = input.lines;

  if (lines.length) {
    if (lines.every((l) => l.freeShipping)) return outcome('ITEM_FLAGS', REASON.free, null, zero);
    const bundleRule = live.find((r) => r.type === 'ANY_BUNDLE');
    if (bundleRule && lines.some((l) => l.kind === 'BUNDLE')) return outcome('ANY_BUNDLE', REASON.free, bundleRule.id, zero);
    const sectionRule = live.find((r) => r.type === 'SECTION_ONLY' && r.sectionId && lines.every((l) => l.sectionId === r.sectionId));
    if (sectionRule) return outcome('SECTION_ONLY', REASON.free, sectionRule.id, zero);
  }
  if (input.couponFreeShipping) return outcome('COUPON', REASON.coupon, null, zero);
  if (campaignRule) return outcome('CAMPAIGN_ALL', REASON.campaign, campaignRule.id, zero);
  if (lowest && freeAbove && lines.length && net.greaterThanOrEqualTo(freeAbove)) return outcome('MIN_SUBTOTAL', REASON.minSubtotal(freeAbove), lowest.id, zero);
  if (!zone) return outcome('UNKNOWN_DISTRICT', REASON.unknown, null, null);
  return outcome('ZONE', zone.nameBn, null, D(zone.fee));
}

/** "হোম ডেলিভারি · ঢাকার ভিতর ৳৬০ · ঢাকার বাইরে ৳১২০ · ৳৫০০+ ফ্রি" (storefront shipNote). */
export function shippingNote(zones: Pick<ZoneInfo, 'nameBn' | 'fee'>[], opts: { freeAbove: MoneyLike | null; campaign: boolean }): string {
  const base = ['হোম ডেলিভারি', ...zones.map((z) => `${z.nameBn} ${takaBn(z.fee)}`)].join(' · ');
  if (opts.campaign) return `${base} · ক্যাম্পেইনে ফ্রি`;
  if (opts.freeAbove != null && D(opts.freeAbove).greaterThan(0)) return `${base} · ${takaBn(opts.freeAbove)}+ ফ্রি`;
  return base;
}
