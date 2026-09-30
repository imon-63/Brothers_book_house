import type { ContentStatus, Prisma } from '@prisma/client';
import { toNumber } from '@/common/utils/money';
import { marginPct, offerOf } from '../domain/pricing';
import { availableUnits, stockStatus, thresholdOf, type StockStatus } from '../domain/stock';
import type { AdminProductDetailRow, AdminProductRow, ProductCardRow, ProductDetailRow } from '../shared/product-includes';

type Ref = { id: string; slug: string; name: string };
type CatRow = { id: string; slug: string; nameBn: string; isVisible: boolean; deletedAt: Date | null };
type MediaRow = { id: string; url: string; alt: string | null; width: number | null; height: number | null; blurhash: string | null };

export type ImageView = { id: string; url: string; alt: string | null; width: number | null; height: number | null; blurhash: string | null; isPrimary: boolean; sortOrder: number };

export type ProductCard = {
  id: string;
  legacyId: number | null;
  slug: string;
  title: string;
  subtitle: string | null;
  unit: string | null;
  section: { id: string; code: string; name: string };
  category: Ref;
  subcategory: Ref | null;
  cover: { url: string | null; alt: string | null; color: string | null };
  price: number;
  compareAt: number | null;
  discountPct: number;
  deal: { endsAt: string } | null;
  stockStatus: StockStatus;
  rating: { average: number; count: number };
  soldCount: number;
  freeShipping: boolean;
};

export type ProductDetail = ProductCard & {
  description: string | null;
  images: ImageView[];
  authors: { id: string; slug: string; name: string; nameEn: string | null; role: string }[];
  publisher: Ref | null;
  brand: Ref | null;
  book: { isbn: string | null; pages: number | null; edition: string | null; language: string | null } | null;
  specs: { weightGrams: number | null; warrantyMonths: number | null; attributes: Prisma.JsonValue };
  wishlistCount: number;
  seo: { title: string | null; description: string | null };
  related: ProductCard[];
};

export type AdminProductListItem = Omit<ProductCard, 'stockStatus' | 'deal'> & {
  sku: string;
  status: ContentStatus;
  regularPrice: number;
  storedCompareAt: number | null;
  costPrice: number | null;
  marginPct: number | null;
  deal: { id: string; dealPrice: number; startsAt: string; endsAt: string; label: string | null } | null;
  stock: { onHand: number; reserved: number; available: number; threshold: number; initialCopies: number | null; status: StockStatus; tracked: boolean };
  authorLine: string | null;
  categoryHidden: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

const ref = (c: CatRow | null): Ref | null => (c ? { id: c.id, slug: c.slug, name: c.nameBn } : null);
const named = (r: { id: string; slug: string; name: string; deletedAt: Date | null } | null): Ref | null =>
  r && !r.deletedAt ? { id: r.id, slug: r.slug, name: r.name } : null;

export function toImage(img: { sortOrder: number; isPrimary: boolean; media: MediaRow }): ImageView {
  return { id: img.media.id, url: img.media.url, alt: img.media.alt, width: img.media.width, height: img.media.height, blurhash: img.media.blurhash, isPrimary: img.isPrimary, sortOrder: img.sortOrder };
}

/** Storefront card. Never exposes cost, on-hand or reserved counts. */
export function toProductCard(p: ProductCardRow, now = new Date()): ProductCard {
  const offer = offerOf(p, p.deals, now);
  const cover = p.images[0]?.media;
  return {
    id: p.id,
    legacyId: p.legacyId,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    unit: p.unit,
    section: { id: p.section.id, code: p.section.code, name: p.section.nameBn },
    category: ref(p.category)!,
    subcategory: ref(p.subcategory),
    cover: { url: cover?.url ?? null, alt: cover?.alt ?? p.title, color: p.coverColor },
    price: toNumber(offer.price),
    compareAt: offer.compareAt ? toNumber(offer.compareAt) : null,
    discountPct: offer.discountPct,
    deal: offer.deal ? { endsAt: offer.deal.endsAt.toISOString() } : null,
    stockStatus: stockStatus(p),
    rating: { average: toNumber(p.ratingAvg), count: p.ratingCount },
    soldCount: p.soldCount,
    freeShipping: p.freeShipping,
  };
}

export function toProductDetail(p: ProductDetailRow, related: ProductCard[], now = new Date()): ProductDetail {
  const isBook = p.section.code === 'book';
  return {
    ...toProductCard(p, now),
    description: p.description,
    images: p.images.map(toImage),
    authors: p.authors.map((a) => ({ id: a.author.id, slug: a.author.slug, name: a.author.nameBn, nameEn: a.author.nameEn, role: a.role })),
    publisher: named(p.publisher),
    brand: named(p.brand),
    book: isBook || p.isbn || p.pages ? { isbn: p.isbn, pages: p.pages, edition: p.edition, language: p.language } : null,
    specs: { weightGrams: p.weightGrams, warrantyMonths: p.warrantyMonths, attributes: p.attributes },
    wishlistCount: p.wishlistCount,
    seo: { title: p.seoTitle, description: p.seoDescription },
    related,
  };
}

function isCategoryHidden(p: { category: CatRow; subcategory: CatRow | null }) {
  const off = (c: CatRow) => !c.isVisible || !!c.deletedAt;
  return off(p.category) || (!!p.subcategory && off(p.subcategory));
}

/** Admin table row: effective price, margin on it, and the full stock picture. */
export function toAdminProductRow(p: AdminProductRow, now = new Date(), lowOverride?: number): AdminProductListItem {
  const card = toProductCard(p, now);
  const offer = offerOf(p, p.deals, now);
  const live = offer.deal ? p.deals.find((d) => d.endsAt.getTime() === offer.deal!.endsAt.getTime() && !d.cancelledAt) : undefined;
  const threshold = lowOverride ?? thresholdOf(p);
  const authorLine = p.authors.length ? p.authors.map((a) => a.author.nameBn).join(', ') : (p.brand && !p.brand.deletedAt ? p.brand.name : p.subtitle);
  const { stockStatus: status, deal: _deal, ...rest } = card;
  return {
    ...rest,
    sku: p.sku,
    status: p.status,
    regularPrice: toNumber(p.price),
    storedCompareAt: p.compareAtPrice ? toNumber(p.compareAtPrice) : null,
    costPrice: p.costPrice ? toNumber(p.costPrice) : null,
    marginPct: marginPct(offer.price, p.costPrice),
    deal: live ? { id: live.id, dealPrice: toNumber(live.dealPrice), startsAt: live.startsAt.toISOString(), endsAt: live.endsAt.toISOString(), label: live.label } : null,
    stock: {
      onHand: p.stockOnHand,
      reserved: p.stockReserved,
      available: availableUnits(p),
      threshold,
      initialCopies: p.initialCopies,
      status: lowOverride != null ? stockStatus({ ...p, lowStockThreshold: lowOverride }) : status,
      tracked: p.trackInventory,
    },
    authorLine: authorLine ?? null,
    categoryHidden: isCategoryHidden(p),
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt?.toISOString() ?? null,
  };
}

/** Admin editor: every editable field + deal history. */
export function toAdminProductDetail(p: AdminProductDetailRow, now = new Date()) {
  const liveDeals = p.deals.filter((d) => !d.cancelledAt && d.startsAt <= now && d.endsAt > now);
  const offer = offerOf(p, liveDeals, now);
  return {
    ...toProductDetail({ ...p, deals: liveDeals }, [], now),
    related: undefined,
    sku: p.sku,
    status: p.status,
    sectionId: p.sectionId,
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId,
    publisherId: p.publisherId,
    brandId: p.brandId,
    regularPrice: toNumber(p.price),
    storedCompareAt: p.compareAtPrice ? toNumber(p.compareAtPrice) : null,
    costPrice: p.costPrice ? toNumber(p.costPrice) : null,
    taxRate: toNumber(p.taxRate),
    marginPct: marginPct(offer.price, p.costPrice),
    stock: {
      onHand: p.stockOnHand,
      reserved: p.stockReserved,
      available: availableUnits(p),
      threshold: thresholdOf(p),
      ownThreshold: p.lowStockThreshold,
      initialCopies: p.initialCopies,
      tracked: p.trackInventory,
      allowBackorder: p.allowBackorder,
      status: stockStatus(p),
    },
    deals: p.deals.map((d) => ({
      id: d.id,
      dealPrice: toNumber(d.dealPrice),
      startsAt: d.startsAt.toISOString(),
      endsAt: d.endsAt.toISOString(),
      label: d.label,
      cancelledAt: d.cancelledAt?.toISOString() ?? null,
      state: d.cancelledAt ? 'cancelled' : d.endsAt <= now ? 'ended' : d.startsAt > now ? 'scheduled' : 'live',
    })),
    categoryHidden: isCategoryHidden(p),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    version: p.version,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt?.toISOString() ?? null,
  };
}
