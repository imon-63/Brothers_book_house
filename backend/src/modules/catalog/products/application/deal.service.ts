import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D, toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { discountPct } from '../../domain/pricing';
import { isConstraintViolation } from '../../shared/db-errors';
import { isUuid } from '../../shared/query-transforms';
import type { CreateDealDto, DealsQueryDto } from '../dto/product-ops.dto';

const OVERLAP = 'product_deals_no_overlap';

type DealRow = Prisma.ProductDealGetPayload<{ include: { product: { select: { id: true; title: true; sku: true; price: true; section: { select: { code: true } } } } } }>;

/** সময়ের ছাড় — timed deal prices. Windows never overlap per product (DB exclusion constraint). */
@Injectable()
export class DealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Traced('catalog.deals.create')
  async create(productId: string, dto: CreateDealDto, actor: AuthUser) {
    const now = new Date();
    const startsAt = dto.startsAt ?? now;
    if (!(dto.endsAt > startsAt)) throw new BusinessRuleError('deal.window_invalid', 'শেষের সময় শুরুর পরে দিন');
    if (!(dto.endsAt > now)) throw new BusinessRuleError('deal.ends_in_past', 'শেষ হওয়ার সময় সামনে দিন');
    try {
      const deal = await this.prisma.tx(async (tx) => {
        const p = await tx.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true, title: true, price: true } });
        if (!p) throw new NotFoundError('Product', productId);
        if (!D(dto.dealPrice).lessThan(p.price)) throw new BusinessRuleError('deal.price_not_lower', 'ছাড়ের দাম আগের দামের চেয়ে কম দিন');

        const overlapping = await tx.productDeal.findMany({
          where: { productId, cancelledAt: null, startsAt: { lt: dto.endsAt }, endsAt: { gt: startsAt } },
          select: { id: true, startsAt: true, endsAt: true },
        });
        if (overlapping.length && !dto.replaceExisting) throw this.overlap(overlapping[0]);
        if (overlapping.length) {
          await tx.productDeal.updateMany({ where: { id: { in: overlapping.map((o) => o.id) } }, data: { cancelledAt: now } });
        }

        const d = await tx.productDeal.create({ data: { productId, dealPrice: D(dto.dealPrice), startsAt, endsAt: dto.endsAt, label: dto.label } });
        await this.audit.record(
          {
            actor,
            action: 'CREATE',
            area: 'product',
            entityType: 'ProductDeal',
            entityId: d.id,
            summary: `«${p.title}» এ টাইমার ছাড় ৳${dto.dealPrice} · ${dto.endsAt.toISOString()} পর্যন্ত${overlapping.length ? ' (আগের টাইমার বাতিল)' : ''}`,
            after: { productId, dealPrice: dto.dealPrice, startsAt: startsAt.toISOString(), endsAt: dto.endsAt.toISOString(), replaced: overlapping.map((o) => o.id) },
          },
          tx,
        );
        return d;
      });
      return this.view(await this.prisma.productDeal.findUniqueOrThrow({ where: { id: deal.id }, include: this.include() }), now);
    } catch (err) {
      // concurrent create slipped past the pre-check → the exclusion constraint answers
      if (isConstraintViolation(err, OVERLAP)) throw this.overlap(null);
      throw err;
    }
  }

  @Traced('catalog.deals.cancel')
  async cancel(dealId: string, actor: AuthUser) {
    const now = new Date();
    return this.prisma.tx(async (tx) => {
      const d = await tx.productDeal.findUnique({ where: { id: dealId }, include: this.include() });
      if (!d) throw new NotFoundError('ProductDeal', dealId);
      if (d.cancelledAt) throw new ConflictError('deal.already_cancelled', 'টাইমার আগেই বাতিল হয়েছে');
      if (d.endsAt <= now) throw new BusinessRuleError('deal.already_ended', 'এই টাইমার আগেই শেষ হয়ে গেছে');
      const next = await tx.productDeal.update({ where: { id: dealId }, data: { cancelledAt: now }, include: this.include() });
      await this.audit.record(
        { actor, action: 'UPDATE', area: 'product', entityType: 'ProductDeal', entityId: dealId, summary: `«${d.product.title}» এর টাইমার সরানো হয়েছে · আগের দাম`, before: { cancelledAt: null }, after: { cancelledAt: now.toISOString() } },
        tx,
      );
      return this.view(next, now);
    });
  }

  async list(q: DealsQueryDto) {
    const now = new Date();
    const soon = new Date(now.getTime() + q.withinHours * 3_600_000);
    const window: Prisma.ProductDealWhereInput =
      q.state === 'scheduled'
        ? { startsAt: { gt: now } }
        : q.state === 'ending_soon'
          ? { startsAt: { lte: now }, endsAt: { gt: now, lte: soon } }
          : { startsAt: { lte: now }, endsAt: { gt: now } };
    const section = q.section ? (isUuid(q.section) ? { sectionId: q.section } : { section: { code: q.section } }) : {};
    const where: Prisma.ProductDealWhereInput = { cancelledAt: null, ...window, product: { deletedAt: null, ...section } };
    const [items, total] = await Promise.all([
      this.prisma.productDeal.findMany({ where, orderBy: q.state === 'scheduled' ? { startsAt: 'asc' } : { endsAt: 'asc' }, ...skipTake(q), include: this.include() }),
      this.prisma.productDeal.count({ where }),
    ]);
    return toPage(items.map((d) => this.view(d, now)), total, q);
  }

  private include() {
    return { product: { select: { id: true, title: true, sku: true, price: true, section: { select: { code: true } } } } } as const;
  }

  private view(d: DealRow, now: Date) {
    const state = d.cancelledAt ? 'cancelled' : d.endsAt <= now ? 'ended' : d.startsAt > now ? 'scheduled' : 'live';
    return {
      id: d.id,
      product: { id: d.product.id, title: d.product.title, sku: d.product.sku, section: d.product.section.code, regularPrice: toNumber(d.product.price) },
      dealPrice: toNumber(d.dealPrice),
      discountPct: discountPct(d.dealPrice, d.product.price),
      label: d.label,
      startsAt: d.startsAt.toISOString(),
      endsAt: d.endsAt.toISOString(),
      cancelledAt: d.cancelledAt?.toISOString() ?? null,
      state,
      secondsLeft: state === 'live' ? Math.max(0, Math.round((d.endsAt.getTime() - now.getTime()) / 1000)) : null,
    };
  }

  private overlap(existing: { id: string; startsAt: Date; endsAt: Date } | null) {
    return new ConflictError(
      'deal.overlap',
      'এই সময়ে আরেকটি টাইমার ছাড় আছে — আগেরটি সরান বা replaceExisting দিন',
      existing ? { dealId: existing.id, startsAt: existing.startsAt.toISOString(), endsAt: existing.endsAt.toISOString() } : undefined,
    );
  }
}
