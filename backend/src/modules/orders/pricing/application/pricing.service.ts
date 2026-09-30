import { Injectable } from '@nestjs/common';
import type { ContentStatus, Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/common/errors/domain.error';
import { D } from '@/common/utils/money';
import { normalizeBdPhone } from '@/common/utils/text';
import { PrismaService, type Db } from '@/infrastructure/prisma/prisma.service';
import { effectivePrice, liveDealsWhere, type DealLike } from '@/modules/catalog/domain/effective-price';
import { GeoService, type ResolvedDistrict } from '../../geo/application/geo.service';
import { CouponLookupService } from '../../promotions/application/coupon-lookup.service';
import type { CouponRule } from '../../promotions/domain/coupon-rules';
import { ShippingLookupService } from '../../shipping/application/shipping-lookup.service';
import { calculateQuote, stockShortfalls, type PricedBundle, type PricedProduct, type Quote, type QuoteLineInput } from '../domain/quote-calculator';

export type LineRef = { kind: 'PRODUCT' | 'BUNDLE'; productId?: string | null; bundleId?: string | null; quantity: number };

export type UnavailableLine = { index: number; kind: 'PRODUCT' | 'BUNDLE'; id: string; reason: 'not_found' | 'inactive' | 'component_unavailable' };

export type QuoteRequest = {
  lines: LineRef[];
  couponCode?: string | null;
  district?: { id?: number | null; name?: string | null } | null;
  customerId?: string | null;
  phone?: string | null;
  now?: Date;
  /** placement: lock the coupon row and require every line to be sellable */
  strict?: boolean;
};

export type PricedQuote = {
  quote: Quote;
  district: ResolvedDistrict | null;
  coupon: CouponRule | null;
  unavailable: UnavailableLine[];
  shortfalls: { productId: string; title: string; requested: number; available: number }[];
};

type ProductRow = {
  id: string;
  title: string;
  sku: string;
  sectionId: string;
  categoryId: string;
  subcategoryId: string | null;
  price: Prisma.Decimal;
  compareAtPrice: Prisma.Decimal | null;
  costPrice: Prisma.Decimal | null;
  taxRate: Prisma.Decimal;
  freeShipping: boolean;
  trackInventory: boolean;
  allowBackorder: boolean;
  stockOnHand: number;
  stockReserved: number;
  status: ContentStatus;
  deletedAt: Date | null;
  section: { code: string };
  category: { nameBn: string };
  deals: DealLike[];
};

const productSelect = (now: Date) =>
  ({
    id: true, title: true, sku: true, sectionId: true, categoryId: true, subcategoryId: true, price: true, compareAtPrice: true, costPrice: true,
    taxRate: true, freeShipping: true, trackInventory: true, allowBackorder: true, stockOnHand: true, stockReserved: true, status: true, deletedAt: true,
    section: { select: { code: true } },
    category: { select: { nameBn: true } },
    deals: { where: liveDealsWhere(now), select: { dealPrice: true, startsAt: true, endsAt: true, cancelledAt: true } },
  }) satisfies Prisma.ProductSelect;

const sellable = (p: { status: ContentStatus; deletedAt: Date | null }) => p.status === 'ACTIVE' && !p.deletedAt;

export function toPricedProduct(p: ProductRow, now: Date): PricedProduct {
  const eff = effectivePrice(p, p.deals, now);
  return {
    id: p.id,
    title: p.title,
    sku: p.sku,
    sectionId: p.sectionId,
    sectionCode: p.section.code,
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId,
    categoryName: p.category.nameBn,
    unitPrice: eff.price,
    listPrice: eff.listPrice,
    compareAt: eff.compareAt,
    unitCost: p.costPrice && D(p.costPrice).greaterThan(0) ? D(p.costPrice) : null,
    taxRate: D(p.taxRate),
    freeShipping: p.freeShipping,
    available: p.trackInventory && !p.allowBackorder ? p.stockOnHand - p.stockReserved : null,
    dealEndsAt: eff.deal?.endsAt ?? null,
  };
}

/**
 * Turns cart lines into a server-side quote: live catalog prices (deals via
 * the catalog's effectivePrice), coupon rules, zone fee and free-delivery
 * rules. The single entry point for cart, checkout quote and placement.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponLookupService,
    private readonly shipping: ShippingLookupService,
    private readonly geo: GeoService,
  ) {}

  /** Merge duplicate refs so the same product twice becomes one line. */
  static mergeLines(lines: LineRef[]): LineRef[] {
    const map = new Map<string, LineRef>();
    for (const l of lines) {
      const id = l.kind === 'PRODUCT' ? l.productId : l.bundleId;
      if (!id) throw new BusinessRuleError('cart.line_invalid', l.kind === 'PRODUCT' ? 'পণ্যের আইডি দিন' : 'প্যাকেজের আইডি দিন');
      const key = `${l.kind}:${id}`;
      const prev = map.get(key);
      map.set(key, { kind: l.kind, productId: l.kind === 'PRODUCT' ? id : null, bundleId: l.kind === 'BUNDLE' ? id : null, quantity: (prev?.quantity ?? 0) + l.quantity });
    }
    for (const l of map.values()) if (l.quantity > 99) throw new BusinessRuleError('cart.qty_limit', 'একটি পণ্য সর্বোচ্চ ৯৯টি');
    return [...map.values()];
  }

  async loadLines(lines: LineRef[], now: Date, db: Db = this.prisma): Promise<{ inputs: QuoteLineInput[]; unavailable: UnavailableLine[]; titles: Map<string, string> }> {
    const productIds = lines.filter((l) => l.kind === 'PRODUCT').map((l) => l.productId as string);
    const bundleIds = lines.filter((l) => l.kind === 'BUNDLE').map((l) => l.bundleId as string);
    const [products, bundles] = await Promise.all([
      productIds.length ? db.product.findMany({ where: { id: { in: productIds } }, select: productSelect(now) }) : Promise.resolve([]),
      bundleIds.length
        ? db.bundle.findMany({
            where: { id: { in: bundleIds } },
            select: {
              id: true, title: true, sectionId: true, price: true, compareAtPrice: true, freeShipping: true, status: true, deletedAt: true,
              section: { select: { code: true } },
              items: { orderBy: { sortOrder: 'asc' }, select: { quantity: true, product: { select: productSelect(now) } } },
            },
          })
        : Promise.resolve([]),
    ]);
    const pMap = new Map(products.map((p) => [p.id, p]));
    const bMap = new Map(bundles.map((b) => [b.id, b]));
    const titles = new Map<string, string>();
    const inputs: QuoteLineInput[] = [];
    const unavailable: UnavailableLine[] = [];

    lines.forEach((l, index) => {
      if (l.kind === 'PRODUCT') {
        const p = pMap.get(l.productId as string);
        if (!p) return unavailable.push({ index, kind: 'PRODUCT', id: l.productId as string, reason: 'not_found' });
        titles.set(p.id, p.title);
        if (!sellable(p)) return unavailable.push({ index, kind: 'PRODUCT', id: p.id, reason: 'inactive' });
        inputs.push({ kind: 'PRODUCT', product: toPricedProduct(p, now), quantity: l.quantity });
        return;
      }
      const b = bMap.get(l.bundleId as string);
      if (!b) return unavailable.push({ index, kind: 'BUNDLE', id: l.bundleId as string, reason: 'not_found' });
      if (!sellable(b)) return unavailable.push({ index, kind: 'BUNDLE', id: b.id, reason: 'inactive' });
      if (!b.items.length || b.items.some((i) => i.product.deletedAt)) return unavailable.push({ index, kind: 'BUNDLE', id: b.id, reason: 'component_unavailable' });
      for (const i of b.items) titles.set(i.product.id, i.product.title);
      const bundle: PricedBundle = {
        id: b.id,
        title: b.title,
        sectionId: b.sectionId,
        sectionCode: b.section.code,
        unitPrice: D(b.price),
        compareAt: b.compareAtPrice ? D(b.compareAtPrice) : null,
        freeShipping: b.freeShipping,
        components: b.items.map((i) => ({ product: toPricedProduct(i.product, now), quantity: i.quantity })),
      };
      inputs.push({ kind: 'BUNDLE', bundle, quantity: l.quantity });
    });
    return { inputs, unavailable, titles };
  }

  async quote(req: QuoteRequest, db: Db = this.prisma): Promise<PricedQuote> {
    const now = req.now ?? new Date();
    const lines = PricingService.mergeLines(req.lines);
    const hasDistrict = !!(req.district?.id || req.district?.name?.trim());
    const [{ inputs, unavailable, titles }, district, rules] = await Promise.all([
      this.loadLines(lines, now, db),
      hasDistrict ? this.geo.resolveDistrict(req.district as { id?: number; name?: string }, db) : Promise.resolve(null),
      this.shipping.activeRules(db),
    ]);
    if (req.strict && unavailable.length) {
      throw new BusinessRuleError('order.item_unavailable', 'কিছু পণ্য এখন বিক্রি হচ্ছে না — কার্ট আপডেট করুন', { unavailable });
    }

    let coupon: CouponRule | null = null;
    let couponInput: Parameters<typeof calculateQuote>[0]['coupon'] = null;
    if (req.couponCode?.trim()) {
      coupon = await this.coupons.findRule(req.couponCode, db, { lock: req.strict });
      if (coupon) {
        const customerId = req.customerId ?? (await this.customerIdByPhone(req.phone, db));
        couponInput = { rule: coupon, usage: await this.coupons.usage(coupon.id, customerId, db) };
      }
    }
    const quote = calculateQuote({ lines: inputs, coupon: couponInput, zone: district?.zone ?? null, shippingRules: rules, now });
    if (req.couponCode?.trim() && !coupon) {
      quote.couponRejection = { ok: false, code: 'coupon.not_found', message: 'কুপন সঠিক নয়' };
    }

    const available = new Map<string, number | null>();
    for (const l of inputs) {
      if (l.kind === 'PRODUCT') available.set(l.product.id, l.product.available);
      else for (const c of l.bundle.components) available.set(c.product.id, c.product.available);
    }
    const shortfalls = stockShortfalls(quote, available).map((s) => ({ ...s, title: titles.get(s.productId) ?? '' }));
    return { quote, district, coupon, unavailable, shortfalls };
  }

  private async customerIdByPhone(phone: string | null | undefined, db: Db): Promise<string | null> {
    const e164 = normalizeBdPhone(phone);
    if (!e164) return null;
    const c = await db.customer.findUnique({ where: { phone: e164 }, select: { id: true } });
    return c?.id ?? null;
  }
}
