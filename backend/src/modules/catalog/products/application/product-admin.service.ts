import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D, toNumber } from '@/common/utils/money';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { generateSku } from '../../domain/sku';
import { toAdminProductDetail, toAdminProductRow } from '../../mappers/product.mapper';
import { isUniqueViolation } from '../../shared/db-errors';
import { adminProductDetailInclude, adminProductInclude } from '../../shared/product-includes';
import { ProductListRepository } from '../../shared/product-list.repository';
import { SlugService } from '../../shared/slug.service';
import type { AdminProductQueryDto } from '../dto/product-query.dto';
import type { CreateProductDto, ProductAuthorRefDto, UpdateProductDto } from '../dto/product-write.dto';
import { ProductGuards } from './product-guards';
import { StockWriter } from './stock-writer';

const COPY_SUFFIX = ' (কপি)';

@Injectable()
export class ProductAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly list: ProductListRepository,
    private readonly slugs: SlugService,
    private readonly guards: ProductGuards,
    private readonly stock: StockWriter,
    private readonly audit: AuditService,
  ) {}

  // ─── reads ───

  @Traced('catalog.admin.products.list')
  async search(q: AdminProductQueryDto) {
    const now = new Date();
    const { ids, total } = await this.list.findIds(
      {
        scope: 'admin',
        section: q.section,
        category: q.category,
        subcategory: q.subcategory,
        q: q.q,
        quick: q.quick,
        lowStock: q.lowStock,
        status: q.status,
        deleted: q.deleted,
        freeShipping: q.freeShipping,
        sort: q.sort,
        order: q.order,
        ...skipTake(q),
      },
      now,
    );
    const rows = await this.rows(ids, now);
    return toPage(rows.map((r) => toAdminProductRow(r, now, q.lowStock)), total, q);
  }

  async rows(ids: string[], now = new Date()) {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: adminProductInclude(now) });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r);
  }

  async summary(section?: string, lowStock?: number) {
    const s = await this.list.adminSummary(section, lowStock);
    return {
      counts: { all: s.all, low: s.low, out: s.out, deal: s.deal, nocost: s.nocost, free: s.free, hidden: s.hidden },
      units: s.units,
      stockValue: toNumber(s.stock_value),
      retailValue: toNumber(s.retail_value),
    };
  }

  async get(id: string) {
    const now = new Date();
    const p = await this.prisma.product.findUnique({ where: { id }, include: adminProductDetailInclude(now) });
    if (!p) throw new NotFoundError('Product', id);
    return toAdminProductDetail(p, now);
  }

  async priceHistory(id: string, page = 1, pageSize = 25) {
    const [items, total] = await Promise.all([
      this.prisma.productPriceHistory.findMany({
        where: { productId: id },
        orderBy: { changedAt: 'desc' },
        ...skipTake({ page, pageSize }),
        include: { changedBy: { select: { id: true, name: true } } },
      }),
      this.prisma.productPriceHistory.count({ where: { productId: id } }),
    ]);
    return toPage(
      items.map((h) => ({
        id: h.id,
        price: toNumber(h.price),
        compareAtPrice: h.compareAtPrice ? toNumber(h.compareAtPrice) : null,
        costPrice: h.costPrice ? toNumber(h.costPrice) : null,
        reason: h.reason,
        changedBy: h.changedBy,
        changedAt: h.changedAt.toISOString(),
      })),
      total,
      { page, pageSize },
    );
  }

  // ─── writes ───

  @Traced('catalog.admin.products.create')
  async create(dto: CreateProductDto, actor: AuthUser) {
    const run = () =>
      this.prisma.tx(async (tx) => {
        const place = await this.guards.placement(tx, dto.categoryId, dto.subcategoryId);
        this.guards.compareAt(dto.price, dto.compareAtPrice);
        await this.guards.relations(tx, { publisherId: dto.publisherId, brandId: dto.brandId, authorIds: dto.authors?.map((a) => a.authorId), mediaIds: dto.imageIds });

        const slug = dto.slug ?? (await this.slugs.unique('product', dto.title, { db: tx }));
        const sku = dto.sku ?? generateSku(place.sectionCode);
        const { authors, imageIds, initialCopies, categoryId: _c, subcategoryId: _s, attributes, ...scalars } = dto;
        const p = await tx.product.create({
          data: {
            ...scalars,
            attributes: (attributes ?? {}) as Prisma.InputJsonValue,
            slug,
            sku,
            sectionId: place.sectionId,
            categoryId: place.categoryId,
            subcategoryId: place.subcategoryId,
            price: D(dto.price),
            compareAtPrice: dto.compareAtPrice == null ? null : D(dto.compareAtPrice),
            costPrice: dto.costPrice == null ? null : D(dto.costPrice),
            taxRate: dto.taxRate == null ? undefined : D(dto.taxRate),
            initialCopies: initialCopies ?? null,
            publishedAt: dto.publishedAt ?? (dto.status === 'DRAFT' ? null : new Date()),
          },
        });
        if (authors?.length) await this.writeAuthors(tx, p.id, authors);
        if (imageIds?.length) {
          await tx.productImage.createMany({ data: imageIds.map((mediaId, i) => ({ productId: p.id, mediaId, sortOrder: i, isPrimary: i === 0 })) });
        }
        await this.guards.priceHistory(tx, p.id, null, { price: dto.price, compareAtPrice: dto.compareAtPrice ?? null, costPrice: dto.costPrice ?? null }, actor.id, 'প্রথম দাম');
        if (initialCopies && initialCopies > 0) {
          await this.stock.setOnHand(tx, p.id, initialCopies, { actorId: actor.id, type: 'OPENING', note: 'শুরুর স্টক' });
        }
        await this.audit.record(
          {
            actor,
            action: 'CREATE',
            area: 'product',
            entityType: 'Product',
            entityId: p.id,
            summary: `নতুন পণ্য «${p.title}» যোগ হয়েছে · ৳${toNumber(p.price)}${initialCopies ? ` · ${initialCopies} কপি` : ''}`,
            after: { sku, slug, price: dto.price, costPrice: dto.costPrice ?? null, initialCopies: initialCopies ?? 0 },
          },
          tx,
        );
        return p.id;
      });
    const id = await this.retryOnAutoKey(run, !dto.slug || !dto.sku);
    return this.get(id);
  }

  @Traced('catalog.admin.products.update')
  async update(id: string, dto: UpdateProductDto, actor: AuthUser) {
    try {
      await this.prisma.tx(async (tx) => {
        const cur = await tx.product.findFirst({ where: { id, deletedAt: null } });
        if (!cur) throw new NotFoundError('Product', id);
        if (cur.version !== dto.version) throw this.stale(cur.version);

        const { version, priceReason, authors, categoryId, subcategoryId, attributes, price, compareAtPrice, costPrice, taxRate, ...scalars } = dto;
        const data: Prisma.ProductUncheckedUpdateManyInput = { ...scalars };

        // placement
        if (categoryId !== undefined || subcategoryId !== undefined) {
          const nextCat = categoryId ?? cur.categoryId;
          let nextSub = subcategoryId !== undefined ? subcategoryId : cur.subcategoryId;
          if (categoryId && categoryId !== cur.categoryId && subcategoryId === undefined) nextSub = null; // old sub belongs to the old category
          const place = await this.guards.placement(tx, nextCat, nextSub);
          Object.assign(data, { sectionId: place.sectionId, categoryId: place.categoryId, subcategoryId: place.subcategoryId });
        }

        // pricing
        const nextPrice = price != null ? D(price) : cur.price;
        let nextCompare = compareAtPrice !== undefined ? (compareAtPrice == null ? null : D(compareAtPrice)) : cur.compareAtPrice;
        if (compareAtPrice !== undefined) this.guards.compareAt(nextPrice, nextCompare);
        else if (nextCompare && !nextCompare.greaterThan(nextPrice)) nextCompare = null; // price raised past the old struck price
        const nextCost = costPrice !== undefined ? (costPrice == null ? null : D(costPrice)) : cur.costPrice;
        Object.assign(data, { price: nextPrice, compareAtPrice: nextCompare, costPrice: nextCost });
        if (taxRate != null) data.taxRate = D(taxRate);
        if (attributes !== undefined) data.attributes = attributes as Prisma.InputJsonValue;
        if (dto.status === 'ACTIVE' && !cur.publishedAt && dto.publishedAt === undefined) data.publishedAt = new Date();

        await this.guards.relations(tx, { publisherId: dto.publisherId, brandId: dto.brandId, authorIds: authors?.map((a) => a.authorId) });

        const r = await tx.product.updateMany({ where: { id, version }, data: { ...data, version: { increment: 1 } } });
        if (r.count === 0) throw this.stale(null);

        if (authors) await this.writeAuthors(tx, id, authors);
        const priced = await this.guards.priceHistory(tx, id, cur, { price: nextPrice, compareAtPrice: nextCompare, costPrice: nextCost }, actor.id, priceReason);

        const diff = AuditService.diff(cur as unknown as Record<string, unknown>, {
          ...data,
          ...(attributes !== undefined ? { attributes: JSON.stringify(attributes) } : {}),
        } as Record<string, unknown>);
        if (authors) diff.changed.push('authors');
        if (diff.changed.length) {
          await this.audit.record(
            {
              actor,
              action: 'UPDATE',
              area: 'product',
              entityType: 'Product',
              entityId: id,
              summary: `«${cur.title}» আপডেট · ${diff.changed.join(', ')}${priced ? ` · দাম ৳${toNumber(nextPrice)}` : ''}`,
              before: diff.before,
              after: diff.after,
            },
            tx,
          );
        }
      });
    } catch (err) {
      throw this.mapUnique(err);
    }
    return this.get(id);
  }

  @Traced('catalog.admin.products.set_authors')
  async setAuthors(id: string, authors: ProductAuthorRefDto[], actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const p = await tx.product.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true } });
      if (!p) throw new NotFoundError('Product', id);
      await this.guards.relations(tx, { authorIds: authors.map((a) => a.authorId) });
      await this.writeAuthors(tx, id, authors);
      await tx.product.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.audit.record(
        { actor, action: 'UPDATE', area: 'product', entityType: 'Product', entityId: id, summary: `«${p.title}» এর লেখক তালিকা বদলানো হয়েছে`, after: { authors: authors.map((a) => a.authorId) } },
        tx,
      );
    });
    return this.get(id);
  }

  /** Copy as a DRAFT with zero stock (physical stock cannot be duplicated), same images/authors. */
  @Traced('catalog.admin.products.duplicate')
  async duplicate(id: string, actor: AuthUser) {
    const run = () =>
      this.prisma.tx(async (tx) => {
        const src = await tx.product.findFirst({
          where: { id, deletedAt: null },
          include: { authors: true, images: true, section: { select: { code: true } } },
        });
        if (!src) throw new NotFoundError('Product', id);
        const title = `${src.title}${COPY_SUFFIX}`.slice(0, 240);
        const {
          id: _id, legacyId: _l, sku: _sku, slug: _slug, createdAt: _ca, updatedAt: _ua, deletedAt: _da, version: _v, section, authors, images,
          stockOnHand: _oh, stockReserved: _sr, soldCount: _sc, ratingAvg: _ra, ratingCount: _rc, wishlistCount: _wc, initialCopies: _ic, publishedAt: _pa,
          attributes, ...rest
        } = src;
        const copy = await tx.product.create({
          data: {
            ...rest,
            attributes: attributes as Prisma.InputJsonValue,
            title,
            status: 'DRAFT',
            sku: generateSku(section.code),
            slug: await this.slugs.unique('product', title, { db: tx }),
          },
        });
        if (authors.length) await tx.productAuthor.createMany({ data: authors.map((a) => ({ ...a, productId: copy.id })) });
        if (images.length) {
          await tx.productImage.createMany({ data: images.map((i) => ({ productId: copy.id, mediaId: i.mediaId, sortOrder: i.sortOrder, isPrimary: i.isPrimary })) });
        }
        await this.guards.priceHistory(tx, copy.id, null, copy, actor.id, 'কপি থেকে');
        await this.audit.record(
          { actor, action: 'CREATE', area: 'product', entityType: 'Product', entityId: copy.id, summary: `«${src.title}» এর কপি তৈরি হয়েছে (খসড়া)`, after: { sourceId: src.id } },
          tx,
        );
        return copy.id;
      });
    return this.get(await this.retryOnAutoKey(run, true));
  }

  @Traced('catalog.admin.products.delete')
  async remove(id: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const p = await tx.product.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true, stockReserved: true } });
      if (!p) throw new NotFoundError('Product', id);
      await tx.product.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await this.audit.record(
        { actor, action: 'DELETE', area: 'product', entityType: 'Product', entityId: id, summary: `«${p.title}» মুছে ফেলা হয়েছে${p.stockReserved ? ` · ${p.stockReserved}টি চলমান অর্ডারে আটকানো` : ''}` },
        tx,
      );
    });
    return { ok: true };
  }

  @Traced('catalog.admin.products.restore')
  async restore(id: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const p = await tx.product.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true, title: true, category: { select: { deletedAt: true } } } });
      if (!p) throw new NotFoundError('Product', id);
      if (p.category.deletedAt) throw new BusinessRuleError('product.category_deleted', 'পণ্যের ক্যাটাগরি মুছে ফেলা হয়েছে — আগে ক্যাটাগরি বদলান');
      await tx.product.update({ where: { id }, data: { deletedAt: null, version: { increment: 1 } } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'product', entityType: 'Product', entityId: id, summary: `«${p.title}» ফিরিয়ে আনা হয়েছে` }, tx);
    });
    return this.get(id);
  }

  // ─── internals ───

  private async writeAuthors(tx: Tx, productId: string, authors: ProductAuthorRefDto[]) {
    await tx.productAuthor.deleteMany({ where: { productId } });
    const seen = new Set<string>();
    const rows = authors
      .map((a, i) => ({ productId, authorId: a.authorId, role: a.role ?? 'author', sortOrder: i }))
      .filter((r) => (seen.has(`${r.authorId}:${r.role}`) ? false : (seen.add(`${r.authorId}:${r.role}`), true)));
    if (rows.length) await tx.productAuthor.createMany({ data: rows });
  }

  private stale(current: number | null) {
    return new ConflictError('product.version_conflict', 'অন্য কেউ এই পণ্যটি এইমাত্র বদলেছেন — রিফ্রেশ করে আবার চেষ্টা করুন', current != null ? { currentVersion: current } : undefined);
  }

  private mapUnique(err: unknown) {
    if (isUniqueViolation(err, 'sku')) return new ConflictError('product.sku_taken', 'এই SKU আগেই আছে');
    if (isUniqueViolation(err, 'slug')) return new ConflictError('product.slug_taken', 'এই স্লাগ আগেই আছে');
    return err;
  }

  /** Auto slug/sku can race another create — one retry picks the next free value. */
  private async retryOnAutoKey<T>(run: () => Promise<T>, auto: boolean): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (auto && isUniqueViolation(err)) {
        try {
          return await run();
        } catch (again) {
          throw this.mapUnique(again);
        }
      }
      throw this.mapUnique(err);
    }
  }
}
