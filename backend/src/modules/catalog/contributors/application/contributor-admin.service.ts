import { Injectable } from '@nestjs/common';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { searchTokens } from '../../domain/search';
import { tombstoneSlug } from '../../domain/slug';
import { toAdminAuthorView, toLabelView } from '../../mappers/contributor.mapper';
import { isUniqueViolation } from '../../shared/db-errors';
import { SlugService } from '../../shared/slug.service';
import type { AdminContributorQueryDto, CreateAuthorDto, CreateLabelDto, UpdateAuthorDto, UpdateLabelDto } from '../dto/contributor.dto';

export type LabelKind = 'publisher' | 'brand';

type LabelRow = { id: string; slug: string; name: string; createdAt: Date; deletedAt: Date | null; _count?: { products: number } };
/** The subset of the (structurally identical) publisher/brand delegates we use. */
type LabelDelegate = {
  findMany(args: object): Promise<LabelRow[]>;
  count(args: object): Promise<number>;
  findFirst(args: object): Promise<LabelRow | null>;
  create(args: object): Promise<LabelRow>;
  update(args: object): Promise<LabelRow>;
};

const LABEL_BN: Record<LabelKind, string> = { publisher: 'প্রকাশনী', brand: 'ব্র্যান্ড' };
const LABEL_ENTITY: Record<LabelKind, string> = { publisher: 'Publisher', brand: 'Brand' };

/** লেখক / প্রকাশনী / ব্র্যান্ড admin CRUD (soft delete; slug parked so it can be reused). */
@Injectable()
export class ContributorAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slugs: SlugService,
    private readonly audit: AuditService,
  ) {}

  // ─── authors ───

  async listAuthors(q: AdminContributorQueryDto) {
    const tokens = searchTokens(q.q);
    const where = {
      deletedAt: q.deleted ? { not: null } : null,
      ...(tokens.length
        ? { OR: [{ AND: tokens.map((t) => ({ nameBn: { contains: t, mode: 'insensitive' as const } })) }, { AND: tokens.map((t) => ({ nameEn: { contains: t, mode: 'insensitive' as const } })) }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.author.findMany({ where, orderBy: { nameBn: 'asc' }, ...skipTake(q), include: { photo: { select: { url: true } }, _count: { select: { products: true } } } }),
      this.prisma.author.count({ where }),
    ]);
    return toPage(rows.map(toAdminAuthorView), total, q);
  }

  @Traced('catalog.authors.create')
  async createAuthor(dto: CreateAuthorDto, actor: AuthUser) {
    return this.unique('author', !dto.slug, () =>
      this.prisma.tx(async (tx) => {
        await this.checkPhoto(tx, dto.photoId);
        const a = await tx.author.create({
          data: { ...dto, slug: dto.slug ?? (await this.slugs.unique('author', dto.nameEn || dto.nameBn, { db: tx })) },
          include: { photo: { select: { url: true } } },
        });
        await this.audit.record({ actor, action: 'CREATE', area: 'product', entityType: 'Author', entityId: a.id, summary: `লেখক «${a.nameBn}» যোগ হয়েছে`, after: { slug: a.slug } }, tx);
        return toAdminAuthorView(a);
      }),
    );
  }

  @Traced('catalog.authors.update')
  async updateAuthor(id: string, dto: UpdateAuthorDto, actor: AuthUser) {
    return this.unique('author', false, () =>
      this.prisma.tx(async (tx) => {
        const cur = await tx.author.findFirst({ where: { id, deletedAt: null } });
        if (!cur) throw new NotFoundError('Author', id);
        await this.checkPhoto(tx, dto.photoId);
        const a = await tx.author.update({ where: { id }, data: dto, include: { photo: { select: { url: true } }, _count: { select: { products: true } } } });
        const diff = AuditService.diff(cur as unknown as Record<string, unknown>, dto as Record<string, unknown>);
        if (diff.changed.length) {
          await this.audit.record({ actor, action: 'UPDATE', area: 'product', entityType: 'Author', entityId: id, summary: `লেখক «${a.nameBn}» আপডেট`, before: diff.before, after: diff.after }, tx);
        }
        return toAdminAuthorView(a);
      }),
    );
  }

  @Traced('catalog.authors.delete')
  async removeAuthor(id: string, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.author.findFirst({ where: { id, deletedAt: null }, include: { _count: { select: { products: true } } } });
      if (!cur) throw new NotFoundError('Author', id);
      await tx.author.update({ where: { id }, data: { deletedAt: new Date(), slug: tombstoneSlug(cur.slug, id, 160) } });
      await this.audit.record(
        { actor, action: 'DELETE', area: 'product', entityType: 'Author', entityId: id, summary: `লেখক «${cur.nameBn}» মুছে ফেলা হয়েছে${cur._count.products ? ` · ${cur._count.products}টি পণ্যে আর দেখাবে না` : ''}`, before: { slug: cur.slug } },
        tx,
      );
      return { ok: true };
    });
  }

  // ─── publishers / brands ───

  async listLabels(kind: LabelKind, q: AdminContributorQueryDto) {
    const tokens = searchTokens(q.q);
    const where = { deletedAt: q.deleted ? { not: null } : null, AND: tokens.map((t) => ({ name: { contains: t, mode: 'insensitive' as const } })) };
    const d = this.delegate(this.prisma, kind);
    const [rows, total] = await Promise.all([
      d.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(q), include: { _count: { select: { products: true } } } }),
      d.count({ where }),
    ]);
    return toPage(rows.map(toLabelView), total, q);
  }

  @Traced('catalog.labels.create')
  async createLabel(kind: LabelKind, dto: CreateLabelDto, actor: AuthUser) {
    return this.unique(kind, !dto.slug, () =>
      this.prisma.tx(async (tx) => {
        const row = await this.delegate(tx, kind).create({ data: { name: dto.name, slug: dto.slug ?? (await this.slugs.unique(kind, dto.name, { db: tx })) } });
        await this.audit.record({ actor, action: 'CREATE', area: 'product', entityType: LABEL_ENTITY[kind], entityId: row.id, summary: `${LABEL_BN[kind]} «${row.name}» যোগ হয়েছে` }, tx);
        return toLabelView(row);
      }),
    );
  }

  @Traced('catalog.labels.update')
  async updateLabel(kind: LabelKind, id: string, dto: UpdateLabelDto, actor: AuthUser) {
    return this.unique(kind, false, () =>
      this.prisma.tx(async (tx) => {
        const d = this.delegate(tx, kind);
        const cur = await d.findFirst({ where: { id, deletedAt: null } });
        if (!cur) throw new NotFoundError(LABEL_ENTITY[kind], id);
        const row = await d.update({ where: { id }, data: dto, include: { _count: { select: { products: true } } } });
        const diff = AuditService.diff(cur as unknown as Record<string, unknown>, dto as Record<string, unknown>);
        if (diff.changed.length) {
          await this.audit.record({ actor, action: 'UPDATE', area: 'product', entityType: LABEL_ENTITY[kind], entityId: id, summary: `${LABEL_BN[kind]} «${row.name}» আপডেট`, before: diff.before, after: diff.after }, tx);
        }
        return toLabelView(row);
      }),
    );
  }

  @Traced('catalog.labels.delete')
  async removeLabel(kind: LabelKind, id: string, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const d = this.delegate(tx, kind);
      const cur = await d.findFirst({ where: { id, deletedAt: null } });
      if (!cur) throw new NotFoundError(LABEL_ENTITY[kind], id);
      await d.update({ where: { id }, data: { deletedAt: new Date(), slug: tombstoneSlug(cur.slug, id, 160) } });
      await this.audit.record({ actor, action: 'DELETE', area: 'product', entityType: LABEL_ENTITY[kind], entityId: id, summary: `${LABEL_BN[kind]} «${cur.name}» মুছে ফেলা হয়েছে` }, tx);
      return { ok: true };
    });
  }

  // ─── internals ───

  private delegate(db: PrismaService | Tx, kind: LabelKind): LabelDelegate {
    return (kind === 'publisher' ? db.publisher : db.brand) as unknown as LabelDelegate;
  }

  private async checkPhoto(tx: Tx, photoId: string | null | undefined) {
    if (photoId && !(await tx.mediaAsset.findUnique({ where: { id: photoId }, select: { id: true } }))) throw new NotFoundError('MediaAsset', photoId);
  }

  /** Auto slugs retry once on a race; an explicit taken slug is a clean 409. */
  private async unique<T>(scope: string, auto: boolean, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (auto) {
        try {
          return await run();
        } catch (again) {
          if (!isUniqueViolation(again)) throw again;
        }
      }
      throw new ConflictError(`${scope}.slug_taken`, 'এই স্লাগ আগেই আছে');
    }
  }
}
