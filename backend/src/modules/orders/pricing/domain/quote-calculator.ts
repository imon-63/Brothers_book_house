import { allocate, percentOf, round2, sum, ZERO, type Money } from '@/common/utils/money';
import { evaluateCoupon, type CouponLine, type CouponRejection, type CouponRule, type CouponUsage } from '../../promotions/domain/coupon-rules';
import { resolveShipping, type FreeShippingRule, type ShippingOutcome, type ZoneInfo } from '../../shipping/domain/shipping-fee';

/** A product as it sells right now (deal applied), ready for pricing. */
export type PricedProduct = {
  id: string;
  title: string;
  sku: string;
  sectionId: string;
  sectionCode: string;
  categoryId: string;
  subcategoryId: string | null;
  categoryName: string | null;
  /** effective price (deal applied) */
  unitPrice: Money;
  /** regular price */
  listPrice: Money;
  compareAt: Money | null;
  unitCost: Money | null;
  taxRate: Money;
  freeShipping: boolean;
  /** units that can still be sold; null = untracked / backorder allowed */
  available: number | null;
  dealEndsAt: Date | null;
};

export type PricedBundle = {
  id: string;
  title: string;
  sectionId: string;
  sectionCode: string;
  unitPrice: Money;
  /** bundle compare-at; null → Σ component list prices */
  compareAt: Money | null;
  freeShipping: boolean;
  components: { product: PricedProduct; quantity: number }[];
};

export type QuoteLineInput = { kind: 'PRODUCT'; product: PricedProduct; quantity: number } | { kind: 'BUNDLE'; bundle: PricedBundle; quantity: number };

export type QuoteInput = {
  lines: QuoteLineInput[];
  coupon: { rule: CouponRule; usage: CouponUsage } | null;
  zone: ZoneInfo | null;
  shippingRules: FreeShippingRule[];
  now: Date;
};

export type QuotedComponent = {
  productId: string;
  title: string;
  /** units for the whole line (bundle qty × per-bundle qty) */
  quantity: number;
  unitCost: Money | null;
  allocatedRevenue: Money;
  taxAmount: Money;
};

export type QuotedLine = {
  kind: 'PRODUCT' | 'BUNDLE';
  productId: string | null;
  bundleId: string | null;
  title: string;
  sku: string | null;
  sectionId: string;
  sectionCode: string;
  categoryName: string | null;
  quantity: number;
  unitPrice: Money;
  listPrice: Money;
  /** per unit; null → at least one cost unknown */
  unitCost: Money | null;
  gross: Money;
  discount: Money;
  taxAmount: Money;
  lineTotal: Money;
  freeShipping: boolean;
  couponEligible: boolean;
  components: QuotedComponent[];
};

export type Quote = {
  lines: QuotedLine[];
  itemsSubtotal: Money;
  discountTotal: Money;
  netSubtotal: Money;
  taxTotal: Money;
  shippingFee: Money | null;
  shipping: ShippingOutcome;
  grandTotal: Money;
  itemsCost: Money | null;
  coupon: { code: string; type: CouponRule['type']; discount: Money; freeShipping: boolean } | null;
  couponRejection: CouponRejection | null;
  /** product units that must be reserved (bundles expanded) */
  stockUnits: { productId: string; qty: number }[];
};

function bundleListPrice(b: PricedBundle): Money {
  return b.compareAt ?? sum(b.components.map((c) => c.product.listPrice.times(c.quantity)));
}

function bundleUnitCost(b: PricedBundle): Money | null {
  if (!b.components.length || b.components.some((c) => c.product.unitCost == null)) return null;
  return round2(sum(b.components.map((c) => (c.product.unitCost as Money).times(c.quantity))));
}

function toCouponLine(l: QuoteLineInput, gross: Money): CouponLine {
  if (l.kind === 'PRODUCT') {
    const p = l.product;
    return { kind: 'PRODUCT', productId: p.id, bundleId: null, sectionCode: p.sectionCode, categoryIds: [p.categoryId, p.subcategoryId].filter((x): x is string => !!x), gross };
  }
  return { kind: 'BUNDLE', productId: null, bundleId: l.bundle.id, sectionCode: l.bundle.sectionCode, categoryIds: [], gross };
}

/**
 * The single price calculation for cart, checkout quote and order placement.
 * Every amount is 2dp Decimal; totals are sums of line amounts, so
 *   grandTotal = itemsSubtotal − discountTotal + shippingFee + taxTotal
 * holds exactly (the orders_total_math CHECK).
 */
export function calculateQuote(input: QuoteInput): Quote {
  const grosses = input.lines.map((l) => round2((l.kind === 'PRODUCT' ? l.product.unitPrice : l.bundle.unitPrice).times(l.quantity)));
  const couponLines = input.lines.map((l, i) => toCouponLine(l, grosses[i]));

  let coupon: Quote['coupon'] = null;
  let couponRejection: CouponRejection | null = null;
  let allocations = input.lines.map(() => ZERO);
  let eligible = input.lines.map(() => false);
  if (input.coupon && input.lines.length) {
    const res = evaluateCoupon(input.coupon.rule, couponLines, input.coupon.usage, input.now);
    if (res.ok) {
      coupon = { code: res.code, type: res.type, discount: res.discount, freeShipping: res.freeShipping };
      allocations = res.allocations;
      eligible = res.eligible;
    } else {
      couponRejection = res;
    }
  }

  const lines: QuotedLine[] = input.lines.map((l, i) => {
    const gross = grosses[i];
    const discount = round2(allocations[i]);
    const net = gross.minus(discount);
    if (l.kind === 'PRODUCT') {
      const p = l.product;
      const taxAmount = percentOf(net, p.taxRate);
      return {
        kind: 'PRODUCT',
        productId: p.id,
        bundleId: null,
        title: p.title,
        sku: p.sku,
        sectionId: p.sectionId,
        sectionCode: p.sectionCode,
        categoryName: p.categoryName,
        quantity: l.quantity,
        unitPrice: round2(p.unitPrice),
        listPrice: round2(p.listPrice),
        unitCost: p.unitCost == null ? null : round2(p.unitCost),
        gross,
        discount,
        taxAmount,
        lineTotal: net.plus(taxAmount),
        freeShipping: p.freeShipping,
        couponEligible: eligible[i],
        components: [],
      };
    }
    const b = l.bundle;
    const weights = b.components.map((c) => c.product.listPrice.times(c.quantity));
    const shares = b.components.length ? allocate(net, weights) : [];
    const components: QuotedComponent[] = b.components.map((c, k) => ({
      productId: c.product.id,
      title: c.product.title,
      quantity: c.quantity * l.quantity,
      unitCost: c.product.unitCost == null ? null : round2(c.product.unitCost),
      allocatedRevenue: shares[k],
      taxAmount: percentOf(shares[k], c.product.taxRate),
    }));
    const taxAmount = sum(components.map((c) => c.taxAmount));
    return {
      kind: 'BUNDLE',
      productId: null,
      bundleId: b.id,
      title: b.title,
      sku: null,
      sectionId: b.sectionId,
      sectionCode: b.sectionCode,
      categoryName: null,
      quantity: l.quantity,
      unitPrice: round2(b.unitPrice),
      listPrice: round2(bundleListPrice(b)),
      unitCost: bundleUnitCost(b),
      gross,
      discount,
      taxAmount,
      lineTotal: net.plus(taxAmount),
      freeShipping: b.freeShipping,
      couponEligible: eligible[i],
      components,
    };
  });

  const itemsSubtotal = sum(lines.map((l) => l.gross));
  const discountTotal = sum(lines.map((l) => l.discount));
  const taxTotal = sum(lines.map((l) => l.taxAmount));
  const netSubtotal = itemsSubtotal.minus(discountTotal);
  const shipping = resolveShipping({
    zone: input.zone,
    lines: lines.map((l) => ({ kind: l.kind, sectionId: l.sectionId, freeShipping: l.freeShipping })),
    netSubtotal,
    couponFreeShipping: coupon?.freeShipping ?? false,
    rules: input.shippingRules,
    now: input.now,
  });
  const shippingFee = shipping.fee == null ? null : round2(shipping.fee);
  const grandTotal = netSubtotal.plus(shippingFee ?? ZERO).plus(taxTotal);

  const costs = lines.map((l) => (l.unitCost == null ? null : l.unitCost.times(l.quantity)));
  const itemsCost = lines.length && costs.every((c) => c != null) ? round2(sum(costs as Money[])) : null;

  const units = new Map<string, number>();
  for (const l of lines) {
    if (l.kind === 'PRODUCT' && l.productId) units.set(l.productId, (units.get(l.productId) ?? 0) + l.quantity);
    for (const c of l.components) units.set(c.productId, (units.get(c.productId) ?? 0) + c.quantity);
  }

  return {
    lines,
    itemsSubtotal,
    discountTotal,
    netSubtotal,
    taxTotal,
    shippingFee,
    shipping,
    grandTotal,
    itemsCost,
    coupon,
    couponRejection,
    stockUnits: [...units.entries()].map(([productId, qty]) => ({ productId, qty })),
  };
}

/** Units short per product given availability (null = unlimited). */
export function stockShortfalls(quote: Quote, available: Map<string, number | null>) {
  return quote.stockUnits
    .map((u) => ({ ...u, available: available.get(u.productId) ?? null }))
    .filter((u) => u.available != null && u.available < u.qty)
    .map((u) => ({ productId: u.productId, requested: u.qty, available: Math.max(0, u.available as number) }));
}
