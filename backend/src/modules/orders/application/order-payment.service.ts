import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import { Events, type OrderPaidEvent, type PaymentFailedEvent, type PaymentSucceededEvent } from '@/common/events/domain-events';
import { D } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { orderRef } from '../domain/order-filters';
import { OrderTransitionService, type PendingEvents } from './order-transition.service';

type Staff = { id: string; name: string };

/** Money-in on an order: COD cash received (staff) and gateway outcomes (events). */
@Injectable()
export class OrderPaymentService {
  private readonly logger = new Logger(OrderPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: OrderTransitionService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** "টাকা পেয়েছি" — cash/COD received for a live or delivered order. */
  @Traced('orders.mark_paid')
  async markPaid(ref: string, staff: Staff, opts: { note?: string; version?: number } = {}) {
    const where = orderRef(ref);
    if (!where) throw new NotFoundError('Order', ref);
    const now = new Date();
    const event = await this.prisma.tx(async (tx) => {
      const o = await tx.order.findUnique({ where: where as Prisma.OrderWhereUniqueInput });
      if (!o) throw new NotFoundError('Order', ref);
      if (opts.version != null && opts.version !== o.version) throw new ConflictError('order.version_conflict', 'অর্ডারটি এইমাত্র অন্য কেউ বদলেছে — রিফ্রেশ করে আবার চেষ্টা করুন');
      if (o.status === 'CANCELLED' || o.status === 'RETURNED') throw new BusinessRuleError('order.closed', 'বাতিল/ফেরত অর্ডারে টাকা নেওয়া যায় না');
      if (o.paymentStatus !== 'UNPAID') throw new BusinessRuleError('order.already_paid', 'এই অর্ডারের টাকা আগেই পাওয়া গেছে');
      const upd = await tx.order.updateMany({
        where: { id: o.id, version: o.version },
        data: { paymentStatus: 'PAID', amountPaid: o.grandTotal, paidAt: now, version: { increment: 1 } },
      });
      if (!upd.count) throw new ConflictError('order.version_conflict', 'অর্ডারটি এইমাত্র অন্য কেউ বদলেছে — রিফ্রেশ করে আবার চেষ্টা করুন');
      await this.audit.record(
        { actor: staff, action: 'UPDATE', area: 'order', entityType: 'Order', entityId: o.id, summary: `${o.orderNo} · টাকা পাওয়া গেছে ৳${D(o.grandTotal).toFixed(0)}${opts.note ? ` · ${opts.note}` : ''}`, after: { paymentStatus: 'PAID' } },
        tx,
      );
      return { orderId: o.id, orderNo: o.orderNo, amount: D(o.grandTotal).toFixed(2), method: o.paymentMethod, actorId: staff.id, at: now } satisfies OrderPaidEvent;
    });
    this.events.emit(Events.OrderPaid, event);
    return { orderNo: event.orderNo, paymentStatus: 'PAID', amountPaid: Number(event.amount), paidAt: now };
  }

  /** Gateway captured the money → mark paid and auto-confirm a pending order. Idempotent. */
  @Traced('orders.payment_succeeded')
  async onGatewaySuccess(e: PaymentSucceededEvent) {
    const now = new Date();
    const out = await this.prisma.tx(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: e.orderId } });
      if (!o) {
        this.logger.warn(`payment.succeeded for unknown order ${e.orderId}`);
        return null;
      }
      if (o.paymentStatus !== 'UNPAID') return null;
      const amount = D(e.amount);
      if (amount.lessThan(o.grandTotal)) this.logger.warn(`${o.orderNo}: gateway amount ${e.amount} < grand total ${o.grandTotal.toString()}`);
      await tx.order.update({
        where: { id: o.id },
        data: { paymentStatus: 'PAID', amountPaid: amount, paidAt: now, gatewayFee: { increment: D(e.fee) }, version: { increment: 1 } },
      });
      const paid: OrderPaidEvent = { orderId: o.id, orderNo: o.orderNo, amount: amount.toFixed(2), method: o.paymentMethod, actorId: null, at: now };
      let transition: PendingEvents | null = null;
      if (o.status === 'PENDING') {
        const r = await this.transitions.apply(tx, o.id, { to: 'CONFIRMED', note: `অনলাইন পেমেন্ট সফল · ${e.tranId}` }, { id: null, name: null, type: 'WEBHOOK' });
        transition = r.events;
      } else if (o.status === 'CANCELLED') {
        this.logger.warn(`${o.orderNo}: payment arrived after cancellation — refund needed`);
      }
      return { paid, transition };
    });
    if (!out) return;
    this.events.emit(Events.OrderPaid, out.paid);
    if (out.transition) this.transitions.publish(out.transition);
  }

  /** Gateway attempt failed: cancel the SSL order if it never paid and no other attempt is alive. */
  @Traced('orders.payment_failed')
  async onGatewayFailure(e: PaymentFailedEvent) {
    const events = await this.prisma.tx(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: e.orderId } });
      if (!o || o.paymentMethod !== 'SSLCOMMERZ' || o.status !== 'PENDING' || o.paymentStatus !== 'UNPAID') return null;
      const alive = await tx.payment.count({ where: { orderId: o.id, id: { not: e.paymentId }, status: { in: ['INITIATED', 'PENDING', 'SUCCESS'] } } });
      if (alive) return null;
      const r = await this.transitions.apply(tx, o.id, { to: 'CANCELLED', note: `পেমেন্ট হয়নি: ${e.reason}`.slice(0, 500) }, { id: null, name: null, type: 'WEBHOOK' });
      return r.events;
    });
    if (events) this.transitions.publish(events);
  }

  /** Sweeper: SSL orders left unpaid for too long. */
  async cancelStaleUnpaid(olderThanMinutes: number) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
    const stale = await this.prisma.order.findMany({
      where: { paymentMethod: 'SSLCOMMERZ', status: 'PENDING', paymentStatus: 'UNPAID', placedAt: { lt: cutoff }, payments: { none: { status: { in: ['SUCCESS', 'PENDING'] } } } },
      select: { id: true, orderNo: true },
      take: 100,
    });
    let cancelled = 0;
    for (const o of stale) {
      try {
        await this.transitions.transition(o.id, { to: 'CANCELLED', note: 'অনলাইন পেমেন্ট হয়নি — স্বয়ংক্রিয় বাতিল' }, { id: null, name: null, type: 'SYSTEM' });
        cancelled++;
      } catch (err) {
        this.logger.warn(`could not auto-cancel ${o.orderNo}: ${(err as Error).message}`);
      }
    }
    return cancelled;
  }
}
