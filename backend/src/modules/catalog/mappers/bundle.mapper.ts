import type { Prisma } from '@prisma/client';
import { toNumber } from '@/common/utils/money';
import { bundleSummary, discountPct, offerOf } from '../domain/pricing';
import { availableUnits } from '../domain/stock';
import { productCardInclude } from '../shared/product-includes';
import { toProductCard, type ProductCard } from './product.mapper';

export const bundleInclude = (now = new Date()) =>
  ({
    section: { select: { id: true, code: true, nameBn: true, isVisible: true } },
    cover: { select: { id: true, url: true, alt: true } },
    items: { orderBy: { sortOrder: 'asc' }, include: { product: { include: productCardInclude(now) } } },
  }) satisfies Prisma.BundleInclude;

export type BundleRow = Prisma.BundleGetPayload<{ include: ReturnType<typeof bundleInclude> }>;

export type BundleView = {
  id: string;
  legacyId: number | null;
  slug: string;
  title: string;
  description: string | null;
  section: { id: string; code: string; name: string };
  cover: { url: string | null; alt: string | null };
  price: number;
  compareAt: number;
  discountPct: number;
  separatePrice: number;
  saving: number;
  savingPct: number;
  allInStock: boolean;
  freeShipping: boolean;
  soldCount: number;
  itemCount: number;
  items: (ProductCard & { quantity: number })[];
};

function itemInStock(p: BundleRow['items'][number]['product'], qty: number) {
  if (!p.trackInventory || p.allowBackorder) return true;
  return availableUnits(p) >= qty;
}

export function toBundle(b: BundleRow, now = new Date()): BundleView {
  const lines = b.items.map((i) => {
    const o = offerOf(i.product, i.product.deals, now);
    return { unitPrice: o.price, listPrice: o.listPrice, quantity: i.quantity, inStock: itemInStock(i.product, i.quantity) };
  });
  const s = bundleSummary(b.price, b.compareAtPrice, lines);
  const firstImage = b.items.find((i) => i.product.images[0])?.product.images[0]?.media;
  return {
    id: b.id,
    legacyId: b.legacyId,
    slug: b.slug,
    title: b.title,
    description: b.description,
    section: { id: b.section.id, code: b.section.code, name: b.section.nameBn },
    cover: { url: b.cover?.url ?? firstImage?.url ?? null, alt: b.cover?.alt ?? b.title },
    price: toNumber(b.price),
    compareAt: toNumber(s.compareAt),
    discountPct: discountPct(b.price, s.compareAt),
    separatePrice: toNumber(s.separatePrice),
    saving: toNumber(s.saving),
    savingPct: s.savingPct,
    allInStock: s.allInStock,
    freeShipping: b.freeShipping,
    soldCount: b.soldCount,
    itemCount: b.items.reduce((n, i) => n + i.quantity, 0),
    items: b.items.map((i) => ({ ...toProductCard(i.product, now), quantity: i.quantity })),
  };
}

export function toAdminBundle(b: BundleRow, now = new Date()) {
  return {
    ...toBundle(b, now),
    status: b.status,
    sortOrder: b.sortOrder,
    storedCompareAt: b.compareAtPrice ? toNumber(b.compareAtPrice) : null,
    coverId: b.coverId,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    deletedAt: b.deletedAt?.toISOString() ?? null,
  };
}
