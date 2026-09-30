import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { buildCategoryTree } from '../../domain/category-tree';
import { tombstoneSlug } from '../../domain/slug';
import { toAdminCategoryTreeView } from '../../mappers/taxonomy.mapper';
import { isUniqueViolation } from '../../shared/db-errors';
import { SlugService } from '../../shared/slug.service';
import type { CategoryVisibilityDto, CreateCategoryDto, ReorderCategoriesDto, UpdateCategoryDto } from '../dto/taxonomy.dto';

@Injectable()
export class CategoryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly slugs: SlugService,
  ) {}

  /** Full tree for one section, hidden nodes included, with product counts (not deleted, any status). */
  async tree(sectionId: string) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) throw new NotFoundError('Section', sectionId);
    const [rows, byCat, bySub] = await Promise.all([
      this.prisma.category.findMany({ where: { sectionId, deletedAt: null }, include: { image: { select: { url: true } } } }),
      this.prisma.product.groupBy({ by: ['categoryId'], where: { sectionId, deletedAt: null }, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['subcategoryId'], where: { sectionId, deletedAt: null, subcategoryId: { not: null } }, _count: { _all: true } }),
    ]);
    const counts = new Map<string, number>();
    for (const r of byCat) counts.set(r.categoryId, r._count._all);
    for (const r of bySub) if (r.subcategoryId) counts.set(r.subcategoryId, r._count._all);
    return {
      section: { id: section.id, code: section.code, name: section.nameBn, isVisible: section.isVisible },
      categories: toAdminCategoryTreeView(buildCategoryTree(rows, { counts })),
    };
  }

  @Traced('catalog.category.create')
  async create(dto: CreateCategoryDto, actor: AuthUser) {
    const run = () =>
      this.prisma.tx(async (tx) => {
        const section = await tx.section.findUnique({ where: { id: dto.sectionId } });
        if (!section) throw new NotFoundError('Section', dto.sectionId);
        if (dto.parentId) {
          const parent = await tx.category.findFirst({ where: { id: dto.parentId, deletedAt: null } });
          if (!parent) throw new NotFoundError('Category', dto.parentId);
          if (parent.parentId) throw new BusinessRuleError('category.max_depth', 'সাব-ক্যাটাগরির নিচে আর স্তর করা যায় না (সর্বোচ্চ ২ স্তর)');
          if (parent.sectionId !== dto.sectionId) throw new BusinessRuleError('category.section_mismatch', 'সাব-ক্যাটাগরি মূল ক্যাটাগরির বিভাগেই হতে হবে');
        }
        await this.assertNameFree(tx, dto.sectionId, dto.parentId ?? null, dto.nameBn);
        const slug = dto.slug ?? (await this.slugs.uniqueCategory(dto.sectionId, dto.nameEn || dto.nameBn, { db: tx }));
        const sortOrder =
          dto.sortOrder ??
          ((await tx.category.aggregate({ where: { sectionId: dto.sectionId, parentId: dto.parentId ?? null, deletedAt: null }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
        const cat = await tx.category.create({
          data: {
            sectionId: dto.sectionId,
            parentId: dto.parentId ?? null,
            nameBn: dto.nameBn,
            nameEn: dto.nameEn,
            slug,
            description: dto.description,
            imageId: dto.imageId,
            isVisible: dto.isVisible ?? true,
            sortOrder,
          },
        });
        await this.audit.record(
          {
            actor,
            action: 'CREATE',
            area: 'product',
            entityType: 'Category',
            entityId: cat.id,
            summary: `${dto.parentId ? 'সাব-ক্যাটাগরি' : 'ক্যাটাগরি'} «${cat.nameBn}» যোগ হয়েছে · ${section.nameBn}`,
            after: { nameBn: cat.nameBn, slug: cat.slug, parentId: cat.parentId },
          },
          tx,
        );
        return cat;
      });
    try {
      return await run();
    } catch (err) {
      if (!dto.slug && isUniqueViolation(err)) return run(); // slug raced with another create
      if (isUniqueViolation(err)) throw new ConflictError('category.slug_taken', 'এই স্লাগ এই বিভাগে আগেই আছে');
      throw err;
    }
  }

  @Traced('catalog.category.update')
  async update(id: string, dto: UpdateCategoryDto, actor: AuthUser) {
    try {
      return await this.prisma.tx(async (tx) => {
        const cur = await this.get(tx, id);
        if (dto.nameBn && dto.nameBn !== cur.nameBn) await this.assertNameFree(tx, cur.sectionId, cur.parentId, dto.nameBn, id);
        const next = await tx.category.update({ where: { id }, data: dto });
        const diff = AuditService.diff(cur as unknown as Record<string, unknown>, dto as Record<string, unknown>);
        if (diff.changed.length) {
          const vis = dto.isVisible === undefined || dto.isVisible === cur.isVisible ? '' : dto.isVisible ? ' · আবার দেখা যাচ্ছে' : ' · ক্রেতার কাছ থেকে লুকানো';
          await this.audit.record(
            { actor, action: 'UPDATE', area: 'product', entityType: 'Category', entityId: id, summary: `ক্যাটাগরি «${next.nameBn}» আপডেট${vis}`, before: diff.before, after: diff.after },
            tx,
          );
        }
        return next;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('category.slug_taken', 'এই স্লাগ এই বিভাগে আগেই আছে');
      throw err;
    }
  }

  /** Reorder siblings: ids must all share the same parent (or all be roots of one section). */
  @Traced('catalog.category.reorder')
  async reorder(dto: ReorderCategoriesDto, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const rows = await tx.category.findMany({ where: { id: { in: dto.ids }, deletedAt: null } });
      if (rows.length !== dto.ids.length) throw new NotFoundError('Category');
      const key = (r: (typeof rows)[number]) => `${r.sectionId}:${r.parentId ?? ''}`;
      if (new Set(rows.map(key)).size !== 1) throw new BusinessRuleError('category.reorder_mixed', 'একই স্তরের ক্যাটাগরিগুলোই শুধু সাজানো যায়');
      await Promise.all(dto.ids.map((cid, i) => tx.category.update({ where: { id: cid }, data: { sortOrder: i } })));
      await this.audit.record({ actor, action: 'UPDATE', area: 'product', entityType: 'Category', summary: `${dto.ids.length}টি ক্যাটাগরির ক্রম বদলানো হয়েছে`, after: { ids: dto.ids } }, tx);
      return { ok: true, count: dto.ids.length };
    });
  }

  /** Soft delete — only when no live product uses it (or its sub-categories). */
  @Traced('catalog.category.delete')
  async remove(id: string, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const cur = await this.get(tx, id);
      const children = await tx.category.findMany({ where: { parentId: id, deletedAt: null }, select: { id: true, slug: true } });
      const ids = [id, ...children.map((c) => c.id)];
      const products = await tx.product.count({ where: { deletedAt: null, OR: [{ categoryId: { in: ids } }, { subcategoryId: { in: ids } }] } });
      if (products > 0) {
        throw new ConflictError('category.has_products', `এই ক্যাটাগরিতে ${products}টি পণ্য আছে — আগে অন্য ক্যাটাগরিতে সরান`, { productCount: products });
      }
      const now = new Date();
      for (const c of [{ id, slug: cur.slug }, ...children]) {
        // park the slug so the name can be reused by a new category
        await tx.category.update({ where: { id: c.id }, data: { deletedAt: now, slug: tombstoneSlug(c.slug, c.id) } });
      }
      await this.audit.record(
        { actor, action: 'DELETE', area: 'product', entityType: 'Category', entityId: id, summary: `ক্যাটাগরি «${cur.nameBn}» মুছে ফেলা হয়েছে${children.length ? ` (${children.length}টি সাব সহ)` : ''}`, before: { nameBn: cur.nameBn, slug: cur.slug } },
        tx,
      );
      return { ok: true, deleted: ids.length };
    });
  }

  /** সব দেখান / সব লুকান for one section. */
  @Traced('catalog.category.bulk_visibility')
  async bulkVisibility(sectionId: string, dto: CategoryVisibilityDto, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const section = await tx.section.findUnique({ where: { id: sectionId } });
      if (!section) throw new NotFoundError('Section', sectionId);
      const includeSubs = dto.includeSubcategories ?? true;
      const r = await tx.category.updateMany({
        where: { sectionId, deletedAt: null, ...(includeSubs ? {} : { parentId: null }) },
        data: { isVisible: dto.isVisible },
      });
      await this.audit.record(
        {
          actor,
          action: 'UPDATE',
          area: 'product',
          entityType: 'Section',
          entityId: sectionId,
          summary: `${section.nameBn}: ${r.count}টি ক্যাটাগরি ${dto.isVisible ? 'দেখানো হচ্ছে' : 'লুকানো হয়েছে'}`,
          after: { isVisible: dto.isVisible, includeSubs, count: r.count },
        },
        tx,
      );
      return { ok: true, count: r.count };
    });
  }

  private async get(tx: Tx, id: string) {
    const c = await tx.category.findFirst({ where: { id, deletedAt: null } });
    if (!c) throw new NotFoundError('Category', id);
    return c;
  }

  private async assertNameFree(tx: Tx, sectionId: string, parentId: string | null, nameBn: string, exceptId?: string) {
    const dup = await tx.category.findFirst({
      where: { sectionId, parentId, deletedAt: null, nameBn: { equals: nameBn, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (dup) throw new ConflictError('category.duplicate', 'এই ক্যাটাগরি আগেই আছে', { id: dup.id });
  }
}
