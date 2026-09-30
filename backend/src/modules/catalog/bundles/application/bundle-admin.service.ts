import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D } from '@/common/utils/money';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { searchTokens } from '../../domain/search';
import { bundleInclude, toAdminBundle } from '../../mappers/bundle.mapper';
import { isUniqueViolation } from '../../shared/db-errors';
import { isUuid } from '../../shared/query-transforms';
import { SlugService } from '../../shared/slug.service';
import type { AdminBundleQueryDto, BundleItemDto, CreateBundleDto, UpdateBundleDto } from '../dto/bundle.dto';

@Injectable()
export class BundleAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugs: SlugService,
    private readonly audit: AuditService,
  ) {}

  async list(q: AdminBundleQueryDto) {
    const now = new Date();
    const where: Prisma.BundleWhereInput = {
      deletedAt: q.deleted ? { not: null } : null,
      ...(q.status ? { status: q.status } : {}),
      ...(q.section ? (isUuid(q.section) ? { sectionId: q.section } : { section: { code: q.section } }) : {}),
      AND: searchTokens(q.q).map((t) => ({ title: { contains: t, mode: 'insensitive' as const } })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.bundle.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], ...skipTake(q), include: bundleInclude(now) }),
      this.prisma.bundle.count({ where }),
    ]);
    return toPage(rows.map((b) => toAdminBundle(b, now)), total, q);
  }

  async get(id: string) {
    const now = new Date();
    const b = await this.prisma.bundle.findUnique({ where: { id }, include: bundleInclude(now) });
    if (!b) throw new NotFoundError('Bundle', id);
    return toAdminBundle(b, now);
  }

  @Traced('catalog.bundles.create')
  async create(dto: CreateBundleDto, actor: AuthUser) {
    const run = () =>
      this.prisma.tx(async (tx) => {
        const section = await tx.section.findUnique({ where: { id: dto.sectionId } });
        if (!section) throw new NotFoundError('Section', dto.sectionId);
        await this.checkItems(tx, dto.sectionId, dto.items);
        this.checkCompare(dto.price, dto.compareAtPrice);
        await this.checkCover(tx, dto.coverId);
        const { items, ...fields } = dto;
        const b = await tx.bundle.create({
          data: {
            ...fields,
            price: D(dto.price),
            compareAtPrice: dto.compareAtPrice == null ? null : D(dto.compareAtPrice),
            slug: dto.slug ?? (await this.slugs.unique('bundle', dto.title, { db: tx })),
          },
        });
        await this.writeItems(tx, b.id, items);
        await this.audit.record(
          { actor, action: 'CREATE', area: 'product', entityType: 'Bundle', entityId: b.id, summary: `প্যাকেজ «${b.title}» তৈরি · ${items.length}টি পণ্য · ৳${dto.price}`, after: { price: dto.price, items: items.map((i) => i.productId) } },
          tx,
        );
        return b.id;
      });
    try {
      return this.get(await run());
    } catch (err) {
      if (!dto.slug && isUniqueViolation(err, 'slug')) return this.get(await run());
      if (isUniqueViolation(err, 'slug')) throw new ConflictError('bundle.slug_taken', 'এই স্লাগ আগেই আছে');
      throw err;
    }
  }

  @Traced('catalog.bundles.update')
  async update(id: string, dto: UpdateBundleDto, actor: AuthUser) {
    try {
      await this.prisma.tx(async (tx) => {
        const cur = await tx.bundle.findFirst({ where: { id, deletedAt: null } });
        if (!cur) throw new NotFoundError('Bundle', id);
        const sectionId = dto.sectionId ?? cur.sectionId;
        if (dto.sectionId && !(await tx.section.findUnique({ where: { id: dto.sectionId }, select: { id: true } }))) throw new NotFoundError('Section', dto.sectionId);
        if (dto.items) await this.checkItems(tx, sectionId, dto.items);
        else if (dto.sectionId && dto.sectionId !== cur.sectionId) {
          const items = await tx.bundleItem.findMany({ where: { bundleId: id }, select: { productId: true, quantity: true } });
          await this.checkItems(tx, sectionId, items);
        }
        const price = dto.price != null ? D(dto.price) : cur.price;
        const compareAtPrice = dto.compareAtPrice !== undefined ? (dto.compareAtPrice == null ? null : D(dto.compareAtPrice)) : cur.compareAtPrice;
        this.checkCompare(price, compareAtPrice);
        await this.checkCover(tx, dto.coverId);
        const { items, ...fields } = dto;
        await tx.bundle.update({ where: { id }, data: { ...fields, price, compareAtPrice } });
        if (items) {
          await tx.bundleItem.deleteMany({ where: { bundleId: id } });
          await this.writeItems(tx, id, items);
        }
        const diff = AuditService.diff(cur as unknown as Record<string, unknown>, { ...fields, price, compareAtPrice } as Record<string, unknown>);
        if (items) diff.changed.push('items');
        if (diff.changed.length) {
          await this.audit.record(
            { actor, action: 'UPDATE', area: 'product', entityType: 'Bundle', entityId: id, summary: `প্যাকেজ «${cur.title}» আপডেট · ${diff.changed.join(', ')}`, before: diff.before, after: diff.after },
            tx,
          );
        }
      });
    } catch (err) {
      if (isUniqueViolation(err, 'slug')) throw new ConflictError('bundle.slug_taken', 'এই স্লাগ আগেই আছে');
      throw err;
    }
    return this.get(id);
  }

  @Traced('catalog.bundles.delete')
  async remove(id: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const b = await tx.bundle.findFirst({ where: { id, deletedAt: null }, select: { id: true, title: true } });
      if (!b) throw new NotFoundError('Bundle', id);
      await tx.bundle.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record({ actor, action: 'DELETE', area: 'product', entityType: 'Bundle', entityId: id, summary: `প্যাকেজ «${b.title}» মুছে ফেলা হয়েছে` }, tx);
    });
    return { ok: true };
  }

  @Traced('catalog.bundles.restore')
  async restore(id: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const b = await tx.bundle.findFirst({ where: { id, deletedAt: { not: null } }, select: { id: true, title: true } });
      if (!b) throw new NotFoundError('Bundle', id);
      await tx.bundle.update({ where: { id }, data: { deletedAt: null } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'product', entityType: 'Bundle', entityId: id, summary: `প্যাকেজ «${b.title}» ফিরিয়ে আনা হয়েছে` }, tx);
    });
    return this.get(id);
  }

  // ─── rules ───

  /** ≥2 distinct, live products from the bundle's section. */
  private async checkItems(tx: Tx, sectionId: string, items: Pick<BundleItemDto, 'productId' | 'quantity'>[]) {
    const ids = [...new Set(items.map((i) => i.productId))];
    if (ids.length !== items.length) throw new BusinessRuleError('bundle.duplicate_item', 'একই পণ্য দুবার দেওয়া যাবে না — পরিমাণ বাড়ান');
    if (ids.length < 2) throw new BusinessRuleError('bundle.too_few_items', 'প্যাকেজে কমপক্ষে ২টি পণ্য দিন');
    const rows = await tx.product.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, sectionId: true } });
    if (rows.length !== ids.length) {
      const found = new Set(rows.map((r) => r.id));
      throw new NotFoundError('Product', ids.find((id) => !found.has(id)));
    }
    if (rows.some((r) => r.sectionId !== sectionId)) throw new BusinessRuleError('bundle.section_mismatch', 'প্যাকেজের সব পণ্য একই বিভাগের হতে হবে');
  }

  private checkCompare(price: Prisma.Decimal | number, compareAt: Prisma.Decimal | number | null | undefined) {
    if (compareAt != null && D(compareAt).lessThan(D(price))) {
      throw new BusinessRuleError('bundle.compare_below_price', 'পুরনো দাম প্যাকেজের দামের চেয়ে কম হতে পারে না');
    }
  }

  private async checkCover(tx: Tx, coverId: string | null | undefined) {
    if (coverId && !(await tx.mediaAsset.findUnique({ where: { id: coverId }, select: { id: true } }))) throw new NotFoundError('MediaAsset', coverId);
  }

  private writeItems(tx: Tx, bundleId: string, items: BundleItemDto[]) {
    return tx.bundleItem.createMany({ data: items.map((i, n) => ({ bundleId, productId: i.productId, quantity: i.quantity ?? 1, sortOrder: n })) });
  }
}
