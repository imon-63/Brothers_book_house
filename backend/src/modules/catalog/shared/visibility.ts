import type { Prisma } from '@prisma/client';

/**
 * A product the storefront may show: active, not deleted, published, and its
 * section, category and (if any) sub-category all visible and not deleted.
 */
export function publicProductWhere(now = new Date()): Prisma.ProductWhereInput {
  return {
    deletedAt: null,
    status: 'ACTIVE',
    section: { isVisible: true },
    category: { isVisible: true, deletedAt: null },
    AND: [
      { OR: [{ subcategoryId: null }, { subcategory: { isVisible: true, deletedAt: null } }] },
      { OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
    ],
  };
}

/** A bundle the storefront may show: active, visible section, and every item still sellable. */
export function publicBundleWhere(): Prisma.BundleWhereInput {
  return {
    deletedAt: null,
    status: 'ACTIVE',
    section: { isVisible: true },
    items: { none: { product: { OR: [{ deletedAt: { not: null } }, { status: { not: 'ACTIVE' } }] } } },
  };
}
