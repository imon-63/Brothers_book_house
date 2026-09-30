import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { MeService } from '@/modules/customers/application/me.service';
import { decideReview, displayNameFor, summarize } from '../domain/review-rules';
import type { AdminReviewQueryDto, CreateReviewDto, PublicReviewQueryDto } from '../dto/reviews.dto';
import { adminReviewInclude, mapAdminReview, mapPublicReview, reviewInclude } from '../mappers/review.mapper';

const SORT: Record<PublicReviewQueryDto['sort'], Prisma.ProductReviewOrderByWithRelationInput[]> = {
  recent: [{ createdAt: 'desc' }],
  helpful: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
  rating_high: [{ rating: 'desc' }, { createdAt: 'desc' }],
  rating_low: [{ rating: 'asc' }, { createdAt: 'desc' }],
};

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly me: MeService,
  ) {}

  // ─── storefront ───

  async publicList(productId: string, q: PublicReviewQueryDto) {
    await this.mustProduct(productId);
    const where: Prisma.ProductReviewWhereInput = {
      productId,
      status: 'APPROVED',
      rating: q.rating,
      ...(q.verified === true ? { orderItemId: { not: null } } : {}),
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.productReview.findMany({ where, include: reviewInclude, orderBy: SORT[q.sort] ?? SORT.recent, ...skipTake(q) }),
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.groupBy({ by: ['rating'], where: { productId, status: 'APPROVED' }, _count: { _all: true } }),
    ]);
    return { summary: summarize(counts.map((c) => ({ rating: c.rating, count: c._count._all }))), ...toPage(rows.map(mapPublicReview), total, q) };
  }

  /** Can the logged-in customer review this product, and would it be verified? */
  async eligibility(user: AuthUser, productId: string) {
    await this.mustProduct(productId);
    const ctx = await this.context(user, productId);
    const d = decideReview(ctx);
    return d.ok ? { canReview: true, verified: d.verified } : { canReview: false, verified: false, reason: d.code, message: d.message };
  }

  @Traced('reviews.create')
  async create(user: AuthUser, productId: string, dto: CreateReviewDto) {
    await this.mustProduct(productId);
    const ctx = await this.context(user, productId);
    const d = decideReview(ctx);
    if (!d.ok) throw d.code === 'review.blocked' ? new BusinessRuleError(d.code, d.message) : new ConflictError(d.code, d.message);
    try {
      const r = await this.prisma.productReview.create({
        data: {
          productId,
          customerId: ctx.customerId,
          orderId: d.orderId,
          orderItemId: d.orderItemId,
          displayName: displayNameFor(ctx.name, dto.displayName),
          rating: dto.rating,
          title: dto.title?.trim() || null,
          body: dto.body?.trim() || null,
        },
        include: reviewInclude,
      });
      return { ...mapPublicReview(r), status: r.status, message: 'ধন্যবাদ! যাচাইয়ের পর রিভিউটি দেখা যাবে' };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('review.already_reviewed', 'এই কেনার জন্য আপনি আগেই রিভিউ দিয়েছেন');
      }
      throw err;
    }
  }

  // ─── moderation ───

  async adminList(q: AdminReviewQueryDto) {
    const needle = q.q?.trim();
    const where: Prisma.ProductReviewWhereInput = {
      status: q.status,
      productId: q.productId,
      rating: q.rating,
      ...(q.verified === true ? { orderItemId: { not: null } } : q.verified === false ? { orderItemId: null } : {}),
      ...(needle
        ? { OR: [{ body: { contains: needle, mode: 'insensitive' } }, { title: { contains: needle, mode: 'insensitive' } }, { displayName: { contains: needle, mode: 'insensitive' } }, { product: { title: { contains: needle, mode: 'insensitive' } } }] }
        : {}),
    };
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.productReview.findMany({ where, include: adminReviewInclude, orderBy: { createdAt: q.order }, ...skipTake(q) }),
      this.prisma.productReview.count({ where }),
      this.prisma.productReview.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const s of byStatus) counts[s.status] = s._count._all;
    return { counts, ...toPage(rows.map(mapAdminReview), total, q) };
  }

  @Traced('reviews.approve')
  approve(actor: AuthUser, id: string) {
    return this.moderate(actor, id, 'APPROVED');
  }

  @Traced('reviews.reject')
  reject(actor: AuthUser, id: string, reason?: string) {
    return this.moderate(actor, id, 'REJECTED', reason);
  }

  async reply(actor: AuthUser, id: string, reply: string) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.productReview.findUnique({ where: { id } });
      if (!r) throw new NotFoundError('Review', id);
      const text = reply.trim() || null;
      const row = await tx.productReview.update({ where: { id }, data: { staffReply: text }, include: adminReviewInclude });
      await this.audit.record({ actor, action: 'UPDATE', area: 'product', entityType: 'review', entityId: id, summary: text ? `রিভিউতে উত্তর দেওয়া হয়েছে (${row.product.title})` : `রিভিউয়ের উত্তর সরানো হয়েছে (${row.product.title})`, before: { reply: r.staffReply }, after: { reply: text } }, tx);
      return mapAdminReview(row);
    });
  }

  // ─── internals ───

  private async moderate(actor: AuthUser, id: string, status: 'APPROVED' | 'REJECTED', reason?: string) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.productReview.findUnique({ where: { id } });
      if (!r) throw new NotFoundError('Review', id);
      if (r.status === status) throw new BusinessRuleError('review.same_status', status === 'APPROVED' ? 'রিভিউটি আগেই অনুমোদিত' : 'রিভিউটি আগেই বাতিল');
      const row = await tx.productReview.update({ where: { id }, data: { status, moderatedById: actor.id, moderatedAt: new Date() }, include: adminReviewInclude });
      await this.recomputeRating(tx, r.productId);
      await this.audit.record({
        actor, action: 'STATUS_CHANGE', area: 'product', entityType: 'review', entityId: id,
        summary: `${row.product.title}-এর রিভিউ ${status === 'APPROVED' ? 'অনুমোদিত' : 'বাতিল'}${reason ? `: ${reason}` : ''}`,
        before: { status: r.status }, after: { status, reason: reason ?? null },
      }, tx);
      return mapAdminReview(row);
    });
  }

  /** Full recompute (not ±) so moderation flips can never drift the cached rating. */
  private recomputeRating(tx: Tx, productId: string) {
    return tx.$executeRaw`
      UPDATE products p
         SET rating_avg = COALESCE(s.avg, 0), rating_count = s.n
        FROM (SELECT round(avg(rating)::numeric, 2) AS avg, count(*)::int AS n
                FROM product_reviews WHERE product_id = ${productId}::uuid AND status = 'APPROVED') s
       WHERE p.id = ${productId}::uuid`;
  }

  private async context(user: AuthUser, productId: string) {
    const customerId = await this.me.customerId(user);
    const [customer, delivered, existing] = await Promise.all([
      this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { name: true, isBlocked: true } }),
      this.prisma.orderItem.findMany({
        // Only direct product lines: a bundle line can carry just one review (unique order_item_id+customer).
        where: { order: { customerId, status: 'DELIVERED' }, productId },
        select: { id: true, orderId: true, order: { select: { deliveredAt: true } } },
      }),
      this.prisma.productReview.findMany({ where: { customerId, productId }, select: { orderItemId: true } }),
    ]);
    return {
      customerId,
      name: customer.name,
      blocked: customer.isBlocked,
      delivered: delivered.map((d) => ({ orderItemId: d.id, orderId: d.orderId, deliveredAt: d.order.deliveredAt })),
      existing,
    };
  }

  private async mustProduct(id: string) {
    const p = await this.prisma.product.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!p) throw new NotFoundError('Product', id);
  }
}
