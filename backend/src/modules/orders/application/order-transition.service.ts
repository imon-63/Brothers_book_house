import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ActorType, OrderStatus, Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import { Events, type OrderPaidEvent, type OrderStatusChangedEvent, type StockLowEvent } from '@/common/events/domain-events';
import { D } from '@/common/utils/money';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';
import { annotate, Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { InventoryService, type LowStockHit, type StockLine } from '@/modules/inventory/inventory.service';
import { CouponLookupService } from '../promotions/application/coupon-lookup.service';
import { orderRef } from '../domain/order-filters';
import { STATUS_LABEL_BN, isOpen, planReopen, planTransition, regressTarget, type ReopenTarget, type TransitionActor, type TransitionPlan } from '../domain/order-status';

export type Actor = { id: string | null; name: string | null; type: TransitionActor };

export type TransitionCommand = {
  to: OrderStatus;
  mode?: 'advance' | 'regress';
  note?: string | null;
  credit?: { reason: string; courierLoss?: number | string } | null;
  expectedVersion?: number;
};

/** Everything to publish once the transaction has committed. */
export type PendingEvents = { statusChanged: OrderStatusChangedEvent; paid: OrderPaidEvent | null; lowStock: LowStockHit[] };

const LOAD = {
  items: { select: { kind: true, productId: true, quantity: true, components: { select: { productId: true, quantity: true } } } },
} satisfies Prisma.OrderInclude;

type LoadedOrder = Prisma.OrderGetPayload<{ include: typeof LOAD }>;

export function stockLinesOf(o: Pick<LoadedOrder, 'items'>): StockLine[] {
  const out: StockLine[] = [];
  for (const i of o.items) {
    if (i.kind === 'PRODUCT' && i.productId) out.push({ productId: i.productId, qty: i.quantity });
    for (const c of i.components) out.push({ productId: c.productId, qty: c.quantity });
  }
  return out;
}

const ACTOR_TYPE: Record<TransitionActor, ActorType> = { STAFF: 'STAFF', CUSTOMER: 'CUSTOMER', SYSTEM: 'SYSTEM', WEBHOOK: 'WEBHOOK' };

/**
 * Applies the order state machine: plan (pure) → optimistic-locked update →
 * stock side effect → coupon/CRM bookkeeping → history + audit, all in one
 * transaction. Events are published by the caller after commit via `publish`.
 */
@Injectable()
export class OrderTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly coupons: CouponLookupService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly metrics: BusinessMetrics,
  ) {}

  /** Stand-alone use case: own transaction + publish. */
  @Traced('orders.transition')
  async transition(ref: string, cmd: TransitionCommand, actor: Actor) {
    const res = await this.prisma.tx((tx) => this.apply(tx, ref, cmd, actor));
    this.publish(res.events);
    annotate({ 'order.no': res.orderNo, 'order.to': cmd.to });
    return res;
  }

  /** One step back (PROCESSING → CONFIRMED) — target derived from the current status. */
  @Traced('orders.regress')
  async regress(ref: string, cmd: { note?: string; expectedVersion?: number }, actor: Actor) {
    const res = await this.prisma.tx(async (tx) => {
      const where = orderRef(ref);
      const cur = where ? await tx.order.findUnique({ where: where as Prisma.OrderWhereUniqueInput, select: { status: true } }) : null;
      if (!cur) throw new NotFoundError('Order', ref);
      const to = regressTarget(cur.status);
      if (!to) throw new BusinessRuleError('order.regress_not_allowed', 'এই ধাপ থেকে আগের ধাপে ফেরানো যায় না');
      return this.apply(tx, ref, { to, mode: 'regress', note: cmd.note, expectedVersion: cmd.expectedVersion }, actor);
    });
    this.publish(res.events);
    return res;
  }

  /**
   * বাতিল/ফেরত → আবার চালু. Re-reserves stock (fails if it is gone), gives the
   * coupon usage back, fixes CRM counters and clears the cancel fields. The
   * previous cancel reason is preserved in history + audit, and an internal
   * order note makes the reopen visible in the admin drawer.
   */
  @Traced('orders.reopen')
  async reopen(ref: string, cmd: { reason: string; to?: ReopenTarget; expectedVersion?: number }, actor: Actor) {
    const res = await this.prisma.tx(async (tx) => {
      const where = orderRef(ref);
      const order = where ? await tx.order.findUnique({ where: where as Prisma.OrderWhereUniqueInput, include: LOAD }) : null;
      if (!order) throw new NotFoundError('Order', ref);
      if (cmd.expectedVersion != null && cmd.expectedVersion !== order.version) {
        throw new ConflictError('order.version_conflict', 'অর্ডারটি এইমাত্র অন্য কেউ বদলেছে — রিফ্রেশ করে আবার চেষ্টা করুন', { version: order.version });
      }
      const result = planReopen(order, { to: cmd.to, reason: cmd.reason, actor: actor.type });
      if (!result.ok) throw new BusinessRuleError(result.code, result.message, { status: order.status });
      const { from, to } = result.plan;
      const reason = cmd.reason.trim();
      const now = new Date();
      const previous = { status: order.status, cancelReason: order.cancelReason, cancelledAt: order.cancelledAt, cancelledFrom: order.cancelledFrom, courierLoss: D(order.courierLoss).toFixed(2) };

      const upd = await tx.order.updateMany({
        where: { id: order.id, version: order.version },
        data: {
          status: to,
          version: { increment: 1 },
          cancelledAt: null,
          cancelReason: null,
          cancelledFrom: null,
          courierLoss: 0,
          shippedAt: null,
          deliveredAt: null,
          confirmedAt: to === 'CONFIRMED' ? now : null,
          stockReserved: true,
        },
      });
      if (upd.count === 0) throw new ConflictError('order.version_conflict', 'অর্ডারটি এইমাত্র অন্য কেউ বদলেছে — রিফ্রেশ করে আবার চেষ্টা করুন');

      const lines = stockLinesOf(order);
      if (lines.length) await this.inventory.reserve(tx, lines, { orderId: order.id, actorId: actor.id, note: `${order.orderNo} · পুনরায় চালু` });
      const couponBack = await this.coupons.restore(tx, order.id);
      await tx.customer.update({ where: { id: order.customerId }, data: { liveOrders: { increment: 1 }, totalSpent: { increment: order.grandTotal } } });
      await tx.$executeRaw`UPDATE customers SET cancelled_orders = GREATEST(cancelled_orders - 1, 0) WHERE id = ${order.customerId}::uuid`;

      const note = `পুনরায় চালু (${STATUS_LABEL_BN[from]} → ${STATUS_LABEL_BN[to]}) · কারণ: ${reason}${previous.cancelReason ? ` · আগের বাতিলের কারণ: ${previous.cancelReason}` : ''}`;
      await tx.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: from, toStatus: to, actorType: ACTOR_TYPE[actor.type], changedById: actor.id, note } });
      await tx.orderNote.create({ data: { orderId: order.id, authorId: actor.id, body: `🔄 ${note}`, isPinned: true } });
      await this.audit.record(
        {
          actor: actor.id ? { id: actor.id, name: actor.name ?? '' } : null,
          action: 'STATUS_CHANGE',
          area: 'order',
          entityType: 'Order',
          entityId: order.id,
          summary: `${order.orderNo} · ${STATUS_LABEL_BN[from]} থেকে ফিরিয়ে আনা → ${STATUS_LABEL_BN[to]} · কারণ: ${reason}`,
          before: { ...previous, cancelledAt: previous.cancelledAt?.toISOString() ?? null },
          after: { status: to, reason, stock: 'RESERVE', couponRestored: couponBack },
        },
        tx,
      );
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        event: { orderId: order.id, orderNo: order.orderNo, customerId: order.customerId, from, to, actorId: actor.id, at: now } satisfies OrderStatusChangedEvent,
      };
    });
    this.metrics.count(this.metrics.orderTransitions, { from: res.event.from, to: res.event.to });
    this.metrics.openOrders.add(1);
    // finance re-issues an invoice (the old one is already credited) when it goes live again
    this.events.emit(Events.OrderStatusChanged, res.event);
    annotate({ 'order.no': res.orderNo, 'order.reopened': true });
    return res;
  }

  /** Transition inside a caller's transaction. */
  async apply(tx: Tx, ref: string, cmd: TransitionCommand, actor: Actor): Promise<{ orderId: string; orderNo: string; plan: TransitionPlan; events: PendingEvents }> {
    const where = orderRef(ref);
    if (!where) throw new NotFoundError('Order', ref);
    const order = await tx.order.findUnique({ where: where as Prisma.OrderWhereUniqueInput, include: LOAD });
    if (!order) throw new NotFoundError('Order', ref);
    if (cmd.expectedVersion != null && cmd.expectedVersion !== order.version) {
      throw new ConflictError('order.version_conflict', 'অর্ডারটি এইমাত্র অন্য কেউ বদলেছে — রিফ্রেশ করে আবার চেষ্টা করুন', { version: order.version });
    }
    const now = new Date();
    const courierLoss = D(cmd.credit?.courierLoss ?? 0);
    const result = planTransition(order, {
      to: cmd.to,
      mode: cmd.mode ?? 'advance',
      actor: actor.type,
      credit: cmd.credit ? { reason: cmd.credit.reason, courierLoss: courierLoss.toFixed(2) } : null,
      now,
    });
    if (!result.ok) throw new BusinessRuleError(result.code, result.message, { from: order.status, to: cmd.to });
    const plan = result.plan;

    const data: Prisma.OrderUpdateManyMutationInput = {
      status: plan.to,
      ...plan.set,
      version: { increment: 1 },
      ...(plan.voids ? { cancelReason: plan.credit?.reason ?? cmd.note ?? null, courierLoss: plan.credit ? courierLoss : undefined } : {}),
      ...(plan.markPaid ? { paymentStatus: 'PAID', amountPaid: order.grandTotal, paidAt: now } : {}),
    };
    const upd = await tx.order.updateMany({ where: { id: order.id, version: order.version }, data });
    if (upd.count === 0) throw new ConflictError('order.version_conflict', 'অর্ডারটি এইমাত্র অন্য কেউ বদলেছে — রিফ্রেশ করে আবার চেষ্টা করুন');

    const lines = stockLinesOf(order);
    const ctx = { orderId: order.id, actorId: actor.id, note: `${order.orderNo} · ${STATUS_LABEL_BN[plan.to]}` };
    let lowStock: LowStockHit[] = [];
    if (lines.length) {
      if (plan.stock === 'FULFIL') lowStock = await this.inventory.fulfill(tx, lines, ctx);
      else if (plan.stock === 'RELEASE') await this.inventory.release(tx, lines, ctx);
      else if (plan.stock === 'RESTOCK') await this.inventory.restock(tx, lines, ctx);
    }
    if (plan.revokeCoupon) await this.coupons.revoke(tx, order.id);
    if (plan.closes || plan.voids) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          ...(plan.closes ? { liveOrders: { decrement: 1 } } : {}),
          ...(plan.voids ? { cancelledOrders: { increment: 1 }, totalSpent: { decrement: order.grandTotal } } : {}),
        },
      });
      if (plan.closes) await tx.$executeRaw`UPDATE customers SET live_orders = GREATEST(live_orders, 0) WHERE id = ${order.customerId}::uuid`;
    }
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: plan.from, toStatus: plan.to, actorType: ACTOR_TYPE[actor.type], changedById: actor.id, note: cmd.note ?? plan.credit?.reason ?? null },
    });
    if (actor.type === 'STAFF') {
      await this.audit.record(
        {
          actor: actor.id ? { id: actor.id, name: actor.name ?? '' } : null,
          action: 'STATUS_CHANGE',
          area: 'order',
          entityType: 'Order',
          entityId: order.id,
          summary: `${order.orderNo} · ${STATUS_LABEL_BN[plan.from]} → ${STATUS_LABEL_BN[plan.to]}${cmd.mode === 'regress' ? ' (আগের ধাপে)' : ''}`,
          before: { status: plan.from },
          after: { status: plan.to, stock: plan.stock, credit: plan.credit, markPaid: plan.markPaid },
        },
        tx,
      );
    }

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      plan,
      events: {
        statusChanged: {
          orderId: order.id,
          orderNo: order.orderNo,
          customerId: order.customerId,
          from: plan.from,
          to: plan.to,
          actorId: actor.id,
          credit: plan.credit ?? undefined,
          at: now,
        },
        paid: plan.markPaid
          ? { orderId: order.id, orderNo: order.orderNo, amount: D(order.grandTotal).toFixed(2), method: order.paymentMethod, actorId: actor.id, at: now }
          : null,
        lowStock,
      },
    };
  }

  publish(e: PendingEvents) {
    this.metrics.count(this.metrics.orderTransitions, { from: e.statusChanged.from, to: e.statusChanged.to });
    if (isOpen(e.statusChanged.from) && !isOpen(e.statusChanged.to)) this.metrics.openOrders.add(-1);
    this.events.emit(Events.OrderStatusChanged, e.statusChanged);
    if (e.paid) this.events.emit(Events.OrderPaid, e.paid);
    for (const hit of e.lowStock) this.events.emit(Events.StockLow, hit satisfies StockLowEvent);
  }
}
