import { Injectable } from '@nestjs/common';
import { PrismaService, type Db, type Tx } from '@/infrastructure/prisma/prisma.service';
import { normalizeCouponCode, type CouponRule, type CouponUsage } from '../domain/coupon-rules';

const RULE_SELECT = {
  id: true, code: true, type: true, value: true, maxDiscount: true, minSubtotal: true, scope: true, usageLimit: true, perCustomerLimit: true,
  usedCount: true, firstOrderOnly: true, isActive: true, startsAt: true, endsAt: true, deletedAt: true,
  targets: { select: { sectionCode: true, categoryId: true, productId: true, bundleId: true } },
} as const;

/**
 * Coupon read/write primitives other sub-domains (pricing, checkout, order
 * transitions) use inside their own transactions.
 */
@Injectable()
export class CouponLookupService {
  constructor(private readonly prisma: PrismaService) {}

  /** Find by code (case-insensitive — citext). With `lock`, row-locks it until commit. */
  async findRule(code: string, db: Db = this.prisma, opts: { lock?: boolean } = {}): Promise<CouponRule | null> {
    const c = normalizeCouponCode(code);
    if (!c) return null;
    if (opts.lock) {
      const rows = await (db as Tx).$queryRaw<{ id: string }[]>`SELECT id FROM coupons WHERE code = ${c}::citext FOR UPDATE`;
      if (!rows.length) return null;
      return db.coupon.findUnique({ where: { id: rows[0].id }, select: RULE_SELECT });
    }
    return db.coupon.findFirst({ where: { code: c }, select: RULE_SELECT });
  }

  /** Per-customer usage figures; unknown customer → nulls (re-checked at placement). */
  async usage(couponId: string, customerId: string | null, db: Db = this.prisma): Promise<CouponUsage> {
    if (!customerId) return { customerRedemptions: null, customerPriorOrders: null };
    const [customerRedemptions, customerPriorOrders] = await Promise.all([
      db.couponRedemption.count({ where: { couponId, customerId, revokedAt: null } }),
      db.order.count({ where: { customerId, status: { notIn: ['CANCELLED'] } } }),
    ]);
    return { customerRedemptions, customerPriorOrders };
  }

  /** Record a redemption and bump used_count (caller holds the row lock). */
  async redeem(tx: Tx, input: { couponId: string; orderId: string; customerId: string; discount: string }) {
    await tx.couponRedemption.create({ data: input });
    await tx.coupon.update({ where: { id: input.couponId }, data: { usedCount: { increment: 1 } } });
  }

  /** Order cancelled/returned → usage given back. Idempotent. */
  async revoke(tx: Tx, orderId: string): Promise<boolean> {
    const r = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (!r || r.revokedAt) return false;
    await tx.couponRedemption.update({ where: { id: r.id }, data: { revokedAt: new Date() } });
    await tx.$executeRaw`UPDATE coupons SET used_count = GREATEST(used_count - 1, 0), updated_at = now() WHERE id = ${r.couponId}::uuid`;
    return true;
  }

  /** Undo `revoke` when a cancelled order is reopened (usage counted again). */
  async restore(tx: Tx, orderId: string): Promise<boolean> {
    const r = await tx.couponRedemption.findUnique({ where: { orderId } });
    if (!r || !r.revokedAt) return false;
    await tx.couponRedemption.update({ where: { id: r.id }, data: { revokedAt: null } });
    await tx.$executeRaw`UPDATE coupons SET used_count = used_count + 1, updated_at = now() WHERE id = ${r.couponId}::uuid`;
    return true;
  }
}
