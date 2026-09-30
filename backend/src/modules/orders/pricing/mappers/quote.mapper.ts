import { toNumber } from '@/common/utils/money';
import type { PricedQuote } from '../application/pricing.service';
import type { QuotedLine } from '../domain/quote-calculator';

const n = (v: Parameters<typeof toNumber>[0]) => toNumber(v);
const nOrNull = (v: Parameters<typeof toNumber>[0] | null) => (v == null ? null : toNumber(v));

function toQuoteLine(l: QuotedLine) {
  return {
    kind: l.kind,
    productId: l.productId,
    bundleId: l.bundleId,
    title: l.title,
    sectionCode: l.sectionCode,
    quantity: l.quantity,
    unitPrice: n(l.unitPrice),
    listPrice: n(l.listPrice),
    gross: n(l.gross),
    discount: n(l.discount),
    taxAmount: n(l.taxAmount),
    lineTotal: n(l.lineTotal),
    freeShipping: l.freeShipping,
    couponEligible: l.couponEligible,
    components: l.components.map((c) => ({ productId: c.productId, title: c.title, quantity: c.quantity })),
  };
}

/** Customer-facing quote. Costs never leave the server here. */
export function toQuoteResponse(p: PricedQuote) {
  const q = p.quote;
  const s = q.shipping;
  return {
    lines: q.lines.map(toQuoteLine),
    itemsSubtotal: n(q.itemsSubtotal),
    discountTotal: n(q.discountTotal),
    netSubtotal: n(q.netSubtotal),
    taxTotal: n(q.taxTotal),
    shippingFee: nOrNull(q.shippingFee),
    grandTotal: n(q.grandTotal),
    shipping: {
      fee: nOrNull(s.fee),
      free: s.free,
      reason: s.reason,
      basis: s.basis,
      zoneCode: s.zoneCode,
      freeAbove: nOrNull(s.freeAbove),
      amountToFree: nOrNull(s.amountToFree),
      campaign: s.campaign,
      eta: p.district ? { minDays: p.district.zone.etaMinDays, maxDays: p.district.zone.etaMaxDays } : null,
    },
    district: p.district ? { id: p.district.id, nameBn: p.district.nameBn, division: p.district.division.nameBn } : null,
    coupon: q.coupon ? { code: q.coupon.code, type: q.coupon.type, discount: n(q.coupon.discount), freeShipping: q.coupon.freeShipping } : null,
    couponError: q.couponRejection ? { code: q.couponRejection.code, message: q.couponRejection.message, details: q.couponRejection.details } : null,
    unavailable: p.unavailable,
    stockIssues: p.shortfalls,
  };
}

export type QuoteResponse = ReturnType<typeof toQuoteResponse>;
