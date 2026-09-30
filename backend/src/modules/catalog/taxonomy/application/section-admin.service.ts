import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { toAdminSectionView } from '../../mappers/taxonomy.mapper';
import type { CreateSectionDto, UpdateSectionDto } from '../dto/taxonomy.dto';

@Injectable()
export class SectionAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const [sections, cats, hidden, products] = await Promise.all([
      this.prisma.section.findMany({ orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      this.prisma.category.groupBy({ by: ['sectionId'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.category.groupBy({ by: ['sectionId'], where: { deletedAt: null, isVisible: false }, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['sectionId'], where: { deletedAt: null }, _count: { _all: true } }),
    ]);
    const n = (rows: { sectionId: string; _count: { _all: number } }[], id: string) => rows.find((r) => r.sectionId === id)?._count._all ?? 0;
    return sections.map((s) => toAdminSectionView(s, { categories: n(cats, s.id), hiddenCategories: n(hidden, s.id), products: n(products, s.id) }));
  }

  @Traced('catalog.section.update')
  async update(id: string, dto: UpdateSectionDto, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      // lock every section so two managers cannot hide the last two visible ones at once
      await tx.$queryRaw`SELECT id FROM sections ORDER BY id FOR UPDATE`;
      const cur = await tx.section.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('Section', id);

      if (dto.isVisible === false && cur.isVisible) {
        const others = await tx.section.count({ where: { isVisible: true, id: { not: id } } });
        if (others === 0) throw new BusinessRuleError('section.last_visible', 'অন্তত একটা বিভাগ খোলা রাখুন');
      }

      const { content, ...fields } = dto;
      const data: Prisma.SectionUpdateInput = { ...fields };
      if (content) data.content = { ...((cur.content as Record<string, unknown>) ?? {}), ...content } as Prisma.InputJsonValue;
      const next = await tx.section.update({ where: { id }, data });

      const diff = AuditService.diff(cur as unknown as Record<string, unknown>, { ...fields, ...(content ? { content: JSON.stringify(next.content) } : {}) });
      if (diff.changed.length) {
        const visibility = dto.isVisible === undefined || dto.isVisible === cur.isVisible ? '' : dto.isVisible ? ' · দোকানে দেখাচ্ছে' : ' · ক্রেতার কাছ থেকে লুকানো';
        await this.audit.record(
          { actor, action: 'UPDATE', area: 'settings', entityType: 'Section', entityId: id, summary: `বিভাগ «${next.nameBn}» আপডেট${visibility}`, before: diff.before, after: diff.after },
          tx,
        );
      }
      return toAdminSectionView(next, {
        categories: await tx.category.count({ where: { sectionId: id, deletedAt: null } }),
        hiddenCategories: await tx.category.count({ where: { sectionId: id, deletedAt: null, isVisible: false } }),
        products: await tx.product.count({ where: { sectionId: id, deletedAt: null } }),
      });
    });
  }

  /** নতুন বিভাগ. Starts hidden by default so staff can add categories/products first. */
  @Traced('catalog.section.create')
  async create(dto: CreateSectionDto, actor: AuthUser) {
    const code = dto.code.trim().toLowerCase();
    return this.prisma.tx(async (tx) => {
      if (await tx.section.findUnique({ where: { code } })) throw new ConflictError('section.code_taken', `«${code}» কোডে আগেই একটা বিভাগ আছে`);
      if (await tx.section.findFirst({ where: { nameBn: dto.nameBn.trim() } })) throw new ConflictError('section.name_taken', `«${dto.nameBn}» নামে আগেই একটা বিভাগ আছে`);
      const last = await tx.section.aggregate({ _max: { sortOrder: true } });
      const s = await tx.section.create({
        data: {
          code,
          nameBn: dto.nameBn.trim(),
          nameEn: dto.nameEn.trim(),
          searchHint: dto.searchHint,
          heroKicker: dto.heroKicker,
          heroTitle: dto.heroTitle,
          heroSub: dto.heroSub,
          heroLead: dto.heroLead,
          content: (dto.content ?? {}) as Prisma.InputJsonValue,
          isVisible: dto.isVisible ?? false,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
      });
      await this.audit.record(
        { actor, action: 'CREATE', area: 'settings', entityType: 'Section', entityId: s.id, summary: `নতুন বিভাগ «${s.nameBn}» (${s.code})${s.isVisible ? ' · দোকানে দেখাচ্ছে' : ' · লুকানো অবস্থায়'}`, after: { code: s.code, nameBn: s.nameBn, nameEn: s.nameEn, isVisible: s.isVisible } },
        tx,
      );
      return toAdminSectionView(s, { categories: 0, hiddenCategories: 0, products: 0 });
    });
  }

  /** Delete an EMPTY section only — anything with categories/products/bundles/orders must be hidden instead. */
  @Traced('catalog.section.delete')
  async remove(id: string, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sections ORDER BY id FOR UPDATE`;
      const s = await tx.section.findUnique({ where: { id } });
      if (!s) throw new NotFoundError('Section', id);
      const [cats, products, bundles, sold] = await Promise.all([
        tx.category.count({ where: { sectionId: id, deletedAt: null } }),
        tx.product.count({ where: { sectionId: id } }),
        tx.bundle.count({ where: { sectionId: id } }),
        tx.orderItem.count({ where: { sectionCode: s.code } }),
      ]);
      if (cats || products || bundles || sold) {
        throw new BusinessRuleError('section.not_empty', 'এই বিভাগে ক্যাটাগরি/পণ্য/বিক্রি আছে — মোছা যাবে না, লুকিয়ে রাখুন', { categories: cats, products, bundles, orderItems: sold });
      }
      if (s.isVisible && (await tx.section.count({ where: { isVisible: true, id: { not: id } } })) === 0) {
        throw new BusinessRuleError('section.last_visible', 'অন্তত একটা বিভাগ খোলা রাখুন');
      }
      // soft-deleted categories were emptied before deletion (no products) — remove them for real
      await tx.category.deleteMany({ where: { sectionId: id, deletedAt: { not: null }, parentId: { not: null } } });
      await tx.category.deleteMany({ where: { sectionId: id, deletedAt: { not: null } } });
      await tx.heroSlide.deleteMany({ where: { sectionId: id } });
      await tx.shippingRule.deleteMany({ where: { sectionId: id } });
      await tx.section.delete({ where: { id } });
      await this.audit.record({ actor, action: 'DELETE', area: 'settings', entityType: 'Section', entityId: id, summary: `বিভাগ «${s.nameBn}» (${s.code}) মুছে ফেলা হয়েছে`, before: { code: s.code, nameBn: s.nameBn } }, tx);
      return { ok: true };
    });
  }
}
