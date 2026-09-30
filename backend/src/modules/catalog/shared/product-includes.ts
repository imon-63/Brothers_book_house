import type { Prisma } from '@prisma/client';
import { liveDealsWhere } from '../domain/effective-price';

const dealSelect = { id: true, dealPrice: true, startsAt: true, endsAt: true, cancelledAt: true, label: true } satisfies Prisma.ProductDealSelect;
const mediaSelect = { id: true, url: true, alt: true, width: true, height: true, blurhash: true } satisfies Prisma.MediaAssetSelect;
const catSelect = { id: true, slug: true, nameBn: true, nameEn: true, isVisible: true, deletedAt: true } satisfies Prisma.CategorySelect;

/** What a product card needs: taxonomy labels, cover image, live deals. */
export const productCardInclude = (now = new Date()) =>
  ({
    section: { select: { id: true, code: true, nameBn: true, isVisible: true } },
    category: { select: catSelect },
    subcategory: { select: catSelect },
    images: {
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
      take: 1,
      include: { media: { select: mediaSelect } },
    },
    deals: { where: liveDealsWhere(now), select: dealSelect },
  }) satisfies Prisma.ProductInclude;

/** Product page: everything on the card plus gallery, people and spec data. */
export const productDetailInclude = (now = new Date()) =>
  ({
    ...productCardInclude(now),
    images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], include: { media: { select: mediaSelect } } },
    authors: {
      where: { author: { deletedAt: null } },
      orderBy: { sortOrder: 'asc' },
      include: { author: { select: { id: true, slug: true, nameBn: true, nameEn: true } } },
    },
    publisher: { select: { id: true, slug: true, name: true, deletedAt: true } },
    brand: { select: { id: true, slug: true, name: true, deletedAt: true } },
  }) satisfies Prisma.ProductInclude;

/** Admin table row: card data + authors/brand (CSV) + the live deal id (cancel button). */
export const adminProductInclude = (now = new Date()) =>
  ({
    ...productCardInclude(now),
    authors: {
      orderBy: { sortOrder: 'asc' },
      include: { author: { select: { id: true, slug: true, nameBn: true, nameEn: true } } },
    },
    brand: { select: { id: true, slug: true, name: true, deletedAt: true } },
  }) satisfies Prisma.ProductInclude;

/** Admin editor: detail + every deal (history) and the cost/stock internals. */
export const adminProductDetailInclude = (now = new Date()) =>
  ({
    ...productDetailInclude(now),
    deals: { orderBy: { startsAt: 'desc' }, take: 20, select: dealSelect },
  }) satisfies Prisma.ProductInclude;

export type ProductCardRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof productCardInclude> }>;
export type ProductDetailRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof productDetailInclude> }>;
export type AdminProductRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof adminProductInclude> }>;
export type AdminProductDetailRow = Prisma.ProductGetPayload<{ include: ReturnType<typeof adminProductDetailInclude> }>;
