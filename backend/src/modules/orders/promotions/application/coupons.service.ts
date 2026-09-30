import { Injectable } from '@nestjs/common';
import { Prisma, type CouponScope } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { toNumber } from '@/common/utils/money';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { validateCouponShape } from '../domain/coupon-rules';
import type { CouponListQueryDto, CouponTargetDto, CreateCouponDto, ReplaceTargetsDto, UpdateCouponDto } from '../dto/coupon.dto';
import { toCoupon, toHeaderCoupon, type CouponStats } from '../mappers/coupon.mapper';

type Actor = Pick<AuthUser, 'id' | 'name'>;

/** কুপন admin: CRUD, activation, targets, redemption stats. */
@Injectable()
export class CouponsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: CouponListQueryDto) {
    const now = new Date();
    const where: Prisma.CouponWhereInput = {
      deletedAt: null,
      ...(q.q ? { OR: [{ code: { contains: q.q.trim(), mode: 'insensitive' } }, { description: { contains: q.q.trim(), mode: 'insensitive' } }] } : {}),
      ...(q.state === 'active' ? { isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } : {}),
      ...(q.state === 'inactive' ? { isActive: false } : {}),
      ...(q.state === 'expired' ? { endsAt: { lte: now } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.coupon.findMany({ where, include: { targets: true }, orderBy: [{ isActive: 'desc' }, { createdAt: q.order }], ...skipTake(q) }),
      this.prisma.coupon.count({ where }),
    ]);
    const stats = await this.stats(rows.map((r) => r.id));
    return toPage(rows.map((r) => toCoupon(r, stats.get(r.id))), total, q);
  }

  async get(id: string) {
    const c = await this.prisma.coupon.findFirst({ where: { id, deletedAt: null }, include: { targets: true } });
    if (!c) throw new NotFoundError('Coupon', id);
    const stats = await this.stats([id]);
    const recent = await this.prisma.couponRedemption.findMany({
      where: { couponId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { discount: true, revokedAt: true, createdAt: true, order: { select: { orderNo: true, grandTotal: true, status: true, contactName: true } } },
    });
    return {
      ...toCoupon(c, stats.get(id)),
      recentRedemptions: recent.map((r) => ({
        orderNo: r.order.orderNo,
        customer: r.order.contactName,
        status: r.order.status,
        grandTotal: toNumber(r.order.grandTotal),
        discount: toNumber(r.discount),
        revoked: !!r.revokedAt,
        at: r.createdAt,
      })),
    };
  }

  /** Active, in-window, not exhausted, flagged for the nav chips. */
  async header() {
    const now = new Date();
    const rows = await this.prisma.coupon.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        showInHeader: true,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: [{ endsAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 20,
    });
    return rows.filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit).slice(0, 6).map(toHeaderCoupon);
  }

  @Traced('coupons.create')
  async create(dto: CreateCouponDto, actor: Actor) {
    const scope = dto.scope ?? 'ALL';
    const targets = dto.targets ?? [];
    this.assertShape({ ...dto, scope, targets });
    return this.prisma.tx(async (tx) => {
      const existing = await tx.coupon.findFirst({ where: { code: dto.code } });
      if (existing && !existing.deletedAt) throw new ConflictError('coupon.code_taken', 'এই কোড আগেই আছে');
      if (existing) await tx.coupon.update({ where: { id: existing.id }, data: { code: `${existing.code}~${existing.id.slice(0, 8)}` } }); // free the code of a deleted coupon
      await this.assertTargetsExist(tx, targets);
      const c = await tx.coupon.create({
        data: {
          code: dto.code,
          description: dto.description ?? null,
          type: dto.type,
          value: dto.value,
          maxDiscount: dto.maxDiscount ?? null,
          minSubtotal: dto.minSubtotal ?? 0,
          scope,
          usageLimit: dto.usageLimit ?? null,
          perCustomerLimit: dto.perCustomerLimit ?? null,
          firstOrderOnly: dto.firstOrderOnly ?? false,
          isActive: dto.isActive ?? true,
          showInHeader: dto.showInHeader ?? true,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          targets: { create: targets.map(targetData) },
        },
        include: { targets: true },
      });
      await this.audit.record({ actor, action: 'CREATE', area: 'settings', entityType: 'Coupon', entityId: c.id, summary: `কুপন তৈরি: ${c.code}`, after: dto as unknown as Prisma.InputJsonValue }, tx);
      return toCoupon(c);
    });
  }

  @Traced('coupons.update')
  async update(id: string, dto: UpdateCouponDto, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.coupon.findFirst({ where: { id, deletedAt: null }, include: { targets: true } });
      if (!cur) throw new NotFoundError('Coupon', id);
      const merged = {
        type: dto.type ?? cur.type,
        value: dto.value ?? cur.value.toNumber(),
        maxDiscount: dto.maxDiscount !== undefined ? dto.maxDiscount : cur.maxDiscount?.toNumber() ?? null,
        scope: dto.scope ?? cur.scope,
        targets: cur.targets.map((t) => ({ sectionCode: t.sectionCode ?? undefined, categoryId: t.categoryId ?? undefined, productId: t.productId ?? undefined, bundleId: t.bundleId ?? undefined })),
        startsAt: dto.startsAt !== undefined ? (dto.startsAt ? new Date(dto.startsAt) : null) : cur.startsAt,
        endsAt: dto.endsAt !== undefined ? (dto.endsAt ? new Date(dto.endsAt) : null) : cur.endsAt,
      };
      if (dto.scope && dto.scope !== cur.scope) throw new BusinessRuleError('coupon.scope_change', 'ধরন বদলাতে টার্গেটসহ আপডেট করুন (PUT /targets)');
      this.assertShape(merged);
      if (dto.code && dto.code !== cur.code.toUpperCase()) {
        if (cur.usedCount > 0) throw new BusinessRuleError('coupon.code_locked', 'ব্যবহৃত কুপনের কোড বদলানো যায় না');
        if (await tx.coupon.findFirst({ where: { code: dto.code, id: { not: id } } })) throw new ConflictError('coupon.code_taken', 'এই কোড আগেই আছে');
      }
      const c = await tx.coupon.update({
        where: { id },
        data: {
          ...dto,
          startsAt: merged.startsAt,
          endsAt: merged.endsAt,
          maxDiscount: merged.maxDiscount,
        },
        include: { targets: true },
      });
      const d = AuditService.diff(cur as unknown as Record<string, unknown>, dto as Record<string, unknown>);
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'Coupon', entityId: id, summary: `কুপন বদলেছে: ${c.code} (${d.changed.join(', ') || '—'})`, before: d.before, after: d.after }, tx);
      return toCoupon(c);
    });
  }

  async setActive(id: string, isActive: boolean, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.coupon.findFirst({ where: { id, deletedAt: null } });
      if (!cur) throw new NotFoundError('Coupon', id);
      const c = await tx.coupon.update({ where: { id }, data: { isActive }, include: { targets: true } });
      await this.audit.record({ actor, action: 'STATUS_CHANGE', area: 'settings', entityType: 'Coupon', entityId: id, summary: isActive ? `${c.code} চালু হয়েছে` : `${c.code} বন্ধ করা হয়েছে` }, tx);
      return toCoupon(c);
    });
  }

  @Traced('coupons.targets')
  async replaceTargets(id: string, dto: ReplaceTargetsDto, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.coupon.findFirst({ where: { id, deletedAt: null } });
      if (!cur) throw new NotFoundError('Coupon', id);
      this.assertShape({ type: cur.type, value: cur.value.toNumber(), maxDiscount: cur.maxDiscount?.toNumber() ?? null, scope: dto.scope, targets: dto.targets });
      await this.assertTargetsExist(tx, dto.targets);
      await tx.couponTarget.deleteMany({ where: { couponId: id } });
      const c = await tx.coupon.update({ where: { id }, data: { scope: dto.scope, targets: { create: dto.targets.map(targetData) } }, include: { targets: true } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'Coupon', entityId: id, summary: `${c.code} · টার্গেট বদলেছে (${dto.scope}, ${dto.targets.length}টি)`, after: dto as unknown as Prisma.InputJsonValue }, tx);
      return toCoupon(c);
    });
  }

  async remove(id: string, actor: Actor) {
    await this.prisma.tx(async (tx) => {
      const cur = await tx.coupon.findFirst({ where: { id, deletedAt: null } });
      if (!cur) throw new NotFoundError('Coupon', id);
      await tx.coupon.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await this.audit.record({ actor, action: 'DELETE', area: 'settings', entityType: 'Coupon', entityId: id, summary: `কুপন মুছেছে: ${cur.code}` }, tx);
    });
  }

  /** uses, discount given and revenue of orders that used each coupon (revoked redemptions excluded). */
  async stats(ids: string[]): Promise<Map<string, CouponStats>> {
    const map = new Map<string, CouponStats>();
    if (!ids.length) return map;
    const rows = await this.prisma.$queryRaw<{ coupon_id: string; uses: bigint; discount: Prisma.Decimal | null; revenue: Prisma.Decimal | null }[]>`
      SELECT r.coupon_id, count(*) AS uses, sum(r.discount) AS discount, sum(o.grand_total) AS revenue
        FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id
       WHERE r.revoked_at IS NULL AND r.coupon_id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
       GROUP BY r.coupon_id`;
    for (const id of ids) map.set(id, { uses: 0, discountGiven: 0, revenue: 0 });
    for (const r of rows) map.set(r.coupon_id, { uses: Number(r.uses), discountGiven: toNumber(r.discount), revenue: toNumber(r.revenue) });
    return map;
  }

  private assertShape(c: { type: CreateCouponDto['type']; value: number; maxDiscount?: number | null; scope: CouponScope; targets: Partial<CouponTargetDto>[]; startsAt?: Date | string | null; endsAt?: Date | string | null }) {
    const bad = validateCouponShape({
      ...c,
      startsAt: c.startsAt ? new Date(c.startsAt) : null,
      endsAt: c.endsAt ? new Date(c.endsAt) : null,
    });
    if (bad) throw new BusinessRuleError(bad.code, bad.message, bad.details);
  }

  private async assertTargetsExist(tx: Tx, targets: CouponTargetDto[]) {
    const ids = (k: keyof CouponTargetDto) => [...new Set(targets.map((t) => t[k]).filter((x): x is string => !!x))];
    const [sections, cats, prods, bundles] = [ids('sectionCode'), ids('categoryId'), ids('productId'), ids('bundleId')];
    const checks: [string, number, Promise<number>][] = [
      ['Section', sections.length, sections.length ? tx.section.count({ where: { code: { in: sections } } }) : Promise.resolve(0)],
      ['Category', cats.length, cats.length ? tx.category.count({ where: { id: { in: cats }, deletedAt: null } }) : Promise.resolve(0)],
      ['Product', prods.length, prods.length ? tx.product.count({ where: { id: { in: prods }, deletedAt: null } }) : Promise.resolve(0)],
      ['Bundle', bundles.length, bundles.length ? tx.bundle.count({ where: { id: { in: bundles }, deletedAt: null } }) : Promise.resolve(0)],
    ];
    for (const [name, want, got] of checks) if ((await got) !== want) throw new BusinessRuleError('coupon.target_missing', `কিছু ${name} পাওয়া যায়নি`);
  }
}

function targetData(t: CouponTargetDto) {
  return { sectionCode: t.sectionCode ?? null, categoryId: t.categoryId ?? null, productId: t.productId ?? null, bundleId: t.bundleId ?? null };
}
