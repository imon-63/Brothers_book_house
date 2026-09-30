import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import { D, type MoneyLike } from '@/common/utils/money';
import type { Tx } from '@/infrastructure/prisma/prisma.service';

export type Placement = { sectionId: string; sectionCode: string; categoryId: string; subcategoryId: string | null };

/** Validation shared by create / update / bulk-move / duplicate. */
@Injectable()
export class ProductGuards {
  /** Main category must be a live root; sub-category must be a live child of it. Section follows the category. */
  async placement(tx: Tx, categoryId: string, subcategoryId: string | null | undefined): Promise<Placement> {
    const cat = await tx.category.findFirst({ where: { id: categoryId, deletedAt: null }, include: { section: { select: { code: true } } } });
    if (!cat) throw new NotFoundError('Category', categoryId);
    if (cat.parentId) throw new BusinessRuleError('product.category_not_root', 'মূল ক্যাটাগরি বাছুন — সাব-ক্যাটাগরি আলাদা ঘরে দিন');
    if (subcategoryId) {
      const sub = await tx.category.findFirst({ where: { id: subcategoryId, deletedAt: null } });
      if (!sub) throw new NotFoundError('Category', subcategoryId);
      if (sub.parentId !== cat.id) throw new BusinessRuleError('product.subcategory_mismatch', 'সাব-ক্যাটাগরিটি এই ক্যাটাগরির নয়');
    }
    return { sectionId: cat.sectionId, sectionCode: cat.section.code, categoryId: cat.id, subcategoryId: subcategoryId ?? null };
  }

  compareAt(price: MoneyLike, compareAt: MoneyLike | null | undefined) {
    if (compareAt != null && !D(compareAt).greaterThan(D(price))) {
      throw new BusinessRuleError('product.compare_below_price', 'পুরনো দাম নতুন দামের চেয়ে বেশি হতে হবে');
    }
  }

  async relations(tx: Tx, r: { publisherId?: string | null; brandId?: string | null; authorIds?: string[]; mediaIds?: string[] }) {
    if (r.publisherId && !(await tx.publisher.findFirst({ where: { id: r.publisherId, deletedAt: null }, select: { id: true } }))) {
      throw new NotFoundError('Publisher', r.publisherId);
    }
    if (r.brandId && !(await tx.brand.findFirst({ where: { id: r.brandId, deletedAt: null }, select: { id: true } }))) {
      throw new NotFoundError('Brand', r.brandId);
    }
    if (r.authorIds?.length) {
      const ids = [...new Set(r.authorIds)];
      const n = await tx.author.count({ where: { id: { in: ids }, deletedAt: null } });
      if (n !== ids.length) throw new NotFoundError('Author');
    }
    if (r.mediaIds?.length) {
      const n = await tx.mediaAsset.count({ where: { id: { in: r.mediaIds } } });
      if (n !== r.mediaIds.length) throw new NotFoundError('MediaAsset');
    }
  }

  /** Append a price-history row when any of price / compare-at / cost changed. */
  async priceHistory(
    tx: Tx,
    productId: string,
    before: { price: Prisma.Decimal; compareAtPrice: Prisma.Decimal | null; costPrice: Prisma.Decimal | null } | null,
    after: { price: MoneyLike; compareAtPrice: MoneyLike | null; costPrice: MoneyLike | null },
    actorId: string | null,
    reason?: string,
  ) {
    const same = (a: MoneyLike | null, b: MoneyLike | null) => (a == null && b == null) || (a != null && b != null && D(a).equals(D(b)));
    if (before && same(before.price, after.price) && same(before.compareAtPrice, after.compareAtPrice) && same(before.costPrice, after.costPrice)) return false;
    await tx.productPriceHistory.create({
      data: {
        productId,
        price: D(after.price),
        compareAtPrice: after.compareAtPrice == null ? null : D(after.compareAtPrice),
        costPrice: after.costPrice == null ? null : D(after.costPrice),
        changedById: actorId,
        reason: reason ?? null,
      },
    });
    return true;
  }
}
