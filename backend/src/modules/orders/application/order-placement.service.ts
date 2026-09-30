import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { OrderPriority, OrderSource, PaymentMethod } from '@prisma/client';
import { BusinessRuleError, DomainError } from '@/common/errors/domain.error';
import { Events, type OrderPlacedEvent } from '@/common/events/domain-events';
import type { AuthUser } from '@/common/types/auth-user';
import { D } from '@/common/utils/money';
import { withRetry } from '@/common/utils/retry';
import { localPhone, normalizeBdPhone } from '@/common/utils/text';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';
import { annotate, Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { DocumentCounterService } from '@/platform/counters/document-counter.service';
import { OutboxService } from '@/platform/outbox/outbox.service';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { CartService, type CartOwner } from '../cart/application/cart.service';
import { GeoService } from '../geo/application/geo.service';
import { PricingService, type QuoteRequest } from '../pricing/application/pricing.service';
import { toQuoteResponse } from '../pricing/mappers/quote.mapper';
import { CouponLookupService } from '../promotions/application/coupon-lookup.service';
import type { PlaceOrderDto } from '../dto/place-order.dto';
import { toPlacedOrder } from '../mappers/order.mapper';
import { IdempotencyService } from './idempotency.service';

const SSL_MIN = 10;

export type PlacementContext = {
  user?: AuthUser;
  cart?: CartOwner | null;
  ip?: string | null;
  userAgent?: string | null;
  idempotencyKey?: string;
};

export type StaffOrderOptions = { source: OrderSource; priority?: OrderPriority; staffNote?: string };

/**
 * চেকআউট: quote + place. Placement is one SERIALIZABLE transaction (retried
 * on serialization failures) that re-prices everything server-side.
 */
@Injectable()
export class OrderPlacementService {
  private readonly logger = new Logger(OrderPlacementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly geo: GeoService,
    private readonly coupons: CouponLookupService,
    private readonly inventory: InventoryService,
    private readonly counters: DocumentCounterService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly cart: CartService,
    private readonly events: EventEmitter2,
    private readonly metrics: BusinessMetrics,
  ) {}

  async quote(req: QuoteRequest) {
    return toQuoteResponse(await this.pricing.quote(req));
  }

  /** Storefront / admin placement with Idempotency-Key semantics. */
  @Traced('orders.place')
  async place(dto: PlaceOrderDto, ctx: PlacementContext, staff?: StaffOrderOptions) {
    const scope = staff ? 'order.admin' : 'order.place';
    const caller = ctx.user?.id ?? (ctx.cart?.token ? `cart:${ctx.cart.token}` : 'guest');
    const idem = staff && !ctx.idempotencyKey ? null : this.idempotency.prepare(scope, ctx.idempotencyKey, caller, dto);
    if (idem) {
      const replay = await this.idempotency.lookup(idem);
      if (replay) return { ...replay, body: replay.body as ReturnType<typeof toPlacedOrder> };
    }
    try {
      const placed = await withRetry(() => this.prisma.tx((tx) => this.placeInTx(tx, dto, ctx, staff, idem), { serializable: true, timeoutMs: 20_000 }));
      this.afterCommit(placed.event, placed.sections, dto.paymentMethod, staff?.source ?? 'WEB');
      annotate({ 'order.no': placed.body.orderNo, 'order.payment_method': dto.paymentMethod });
      return { replayed: false, code: 201, body: placed.body };
    } catch (err) {
      if (idem && IdempotencyService.isKeyCollision(err)) {
        const replay = await this.idempotency.lookup(idem);
        if (replay) return { ...replay, body: replay.body as ReturnType<typeof toPlacedOrder> };
      }
      this.metrics.count(this.metrics.checkoutFailures, { reason: err instanceof DomainError ? err.code : 'error', payment_method: dto.paymentMethod });
      throw err;
    }
  }

  private async placeInTx(tx: Tx, dto: PlaceOrderDto, ctx: PlacementContext, staff: StaffOrderOptions | undefined, idem: { scope: string; key: string; hash: string } | null) {
    if (idem) await this.idempotency.claim(tx, idem);
    const now = new Date();
    const phone = normalizeBdPhone(dto.contact.phone);
    if (!phone) throw new BusinessRuleError('order.phone_invalid', 'সঠিক মোবাইল নম্বর দিন', { field: 'contact.phone' });
    const email = dto.contact.email?.toLowerCase() ?? null;

    // 1. address from geo tables
    const district = await this.geo.resolveDistrict({ id: dto.address.districtId, name: dto.address.district }, tx);
    await this.geo.checkLocality(district.id, dto.address.upazila, dto.address.union, tx);

    // 2. customer (CRM identity = phone)
    const customer = await this.upsertCustomer(tx, { phone, name: dto.contact.name, email }, staff ? undefined : ctx.user);
    if (customer.isBlocked && dto.paymentMethod === 'COD') {
      throw new BusinessRuleError('order.customer_blocked', 'এই নম্বরে ক্যাশ অন ডেলিভারি বন্ধ আছে — অনলাইনে পেমেন্ট করুন বা হেল্পলাইনে যোগাযোগ করুন');
    }

    // 3. price everything server-side (coupon row locked)
    const priced = await this.pricing.quote(
      { lines: dto.lines, couponCode: dto.couponCode, district: { id: district.id }, customerId: customer.id, now, strict: true },
      tx,
    );
    const q = priced.quote;
    if (q.couponRejection) throw new BusinessRuleError(q.couponRejection.code, q.couponRejection.message, q.couponRejection.details);
    if (!q.lines.length) throw new BusinessRuleError('cart.empty', 'কার্ট খালি');
    if (q.shippingFee == null) throw new BusinessRuleError('geo.district_required', 'জেলা বাছুন — তাহলে ডেলিভারি খরচ বসবে');
    if (dto.paymentMethod === 'SSLCOMMERZ' && q.grandTotal.lessThan(SSL_MIN)) throw new BusinessRuleError('payment.min_amount', 'SSLCOMMERZ-এ সর্বনিম্ন ৳১০');

    // 4. number + order + lines
    const orderNo = await this.counters.next(tx, 'order');
    const order = await tx.order.create({
      data: {
        orderNo,
        customerId: customer.id,
        createdById: staff ? (ctx.user?.id ?? null) : null,
        source: staff?.source ?? 'WEB',
        status: 'PENDING',
        paymentMethod: dto.paymentMethod,
        paymentStatus: 'UNPAID',
        priority: staff?.priority ?? 'NORMAL',
        contactName: dto.contact.name,
        contactPhone: phone,
        contactEmail: email,
        shipDistrictId: district.id,
        shipDivision: district.division.nameBn,
        shipDistrict: district.nameBn,
        shipUpazila: dto.address.upazila ?? null,
        shipUnion: dto.address.union ?? null,
        shipLine: dto.address.line,
        shipLandmark: dto.address.landmark ?? null,
        shipZoneCode: district.zone.code,
        itemsSubtotal: q.itemsSubtotal,
        discountTotal: q.discountTotal,
        couponCode: q.coupon?.code ?? null,
        shippingFee: q.shippingFee,
        shippingFeeReason: q.shipping.reason,
        taxTotal: q.taxTotal,
        grandTotal: q.grandTotal,
        itemsCost: q.itemsCost,
        courierCost: q.shipping.expectedCourierCost ?? 0,
        customerNote: dto.customerNote ?? null,
        stockReserved: true,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent?.slice(0, 500) ?? null,
        placedAt: now,
        items: {
          create: q.lines.map((l) => ({
            kind: l.kind,
            productId: l.productId,
            bundleId: l.bundleId,
            title: l.title,
            sku: l.sku,
            sectionCode: l.sectionCode,
            categoryName: l.categoryName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            listPrice: l.listPrice,
            unitCost: l.unitCost,
            discount: l.discount,
            taxAmount: l.taxAmount,
            lineTotal: l.lineTotal,
            components: { create: l.components.map((c) => ({ productId: c.productId, title: c.title, quantity: c.quantity, unitCost: c.unitCost, allocatedRevenue: c.allocatedRevenue })) },
          })),
        },
        history: {
          create: { fromStatus: null, toStatus: 'PENDING', actorType: staff ? 'STAFF' : 'CUSTOMER', changedById: ctx.user?.id ?? null, note: staff ? `${staff.source === 'PHONE' ? 'ফোন অর্ডার' : 'অ্যাডমিন অর্ডার'}` : null },
        },
        ...(staff?.staffNote && ctx.user ? { notes: { create: { authorId: ctx.user.id, body: staff.staffNote } } } : {}),
      },
    });

    // 5. stock hold (atomic, per product)
    await this.inventory.reserve(tx, q.stockUnits, { orderId: order.id, actorId: ctx.user?.id ?? null, note: `${orderNo} · রিজার্ভ` });

    // 6. coupon redemption
    if (q.coupon && priced.coupon) {
      await this.coupons.redeem(tx, { couponId: priced.coupon.id, orderId: order.id, customerId: customer.id, discount: q.coupon.discount.toFixed(2) });
    }

    // 7. CRM aggregates
    await tx.customer.update({
      where: { id: customer.id },
      data: { ordersCount: { increment: 1 }, liveOrders: { increment: 1 }, totalSpent: { increment: q.grandTotal }, lastOrderAt: now, ...(customer.firstOrderAt ? {} : { firstOrderAt: now }) },
    });

    // 8. SMS via outbox, audit, cart
    await this.outbox.enqueue(
      {
        channel: 'SMS',
        recipient: phone,
        template: 'order.placed',
        payload: { orderNo, name: dto.contact.name, total: q.grandTotal.toFixed(2), paymentMethod: dto.paymentMethod, phone: localPhone(phone) },
        dedupeKey: `order-placed:${orderNo}`,
      },
      tx,
    );
    if (staff && ctx.user) {
      await this.audit.record(
        {
          actor: ctx.user,
          action: 'CREATE',
          area: 'order',
          entityType: 'Order',
          entityId: order.id,
          summary: `${staff.source === 'PHONE' ? 'ফোন' : 'অ্যাডমিন'} অর্ডার তৈরি: ${orderNo} · ${dto.contact.name} · ৳${q.grandTotal.toFixed(0)}`,
          after: { source: staff.source, paymentMethod: dto.paymentMethod, grandTotal: q.grandTotal.toFixed(2) },
        },
        tx,
      );
    }
    if (!staff && dto.clearCart !== false) await this.cart.clearForOrder(tx, ctx.cart ?? null);

    const body = toPlacedOrder(order);
    if (idem) await this.idempotency.complete(tx, idem.key, 201, body);
    const event: OrderPlacedEvent = { orderId: order.id, orderNo, customerId: customer.id, grandTotal: q.grandTotal.toFixed(2), paymentMethod: dto.paymentMethod, placedAt: now };
    return { body, event, sections: [...new Set(q.lines.map((l) => l.sectionCode))] };
  }

  private async upsertCustomer(tx: Tx, c: { phone: string; name: string; email: string | null }, user?: AuthUser) {
    // a logged-in shopper keeps their own CRM row even if they order with another phone
    if (user?.customerId) {
      const mine = await tx.customer.findUnique({ where: { id: user.customerId } });
      if (mine && !mine.deletedAt) {
        return tx.customer.update({ where: { id: mine.id }, data: { name: mine.name || c.name, ...(c.email && !mine.email ? { email: c.email } : {}) } });
      }
    }
    const linkUser = user && user.role === 'CUSTOMER' ? user.id : null;
    const existing = await tx.customer.findUnique({ where: { phone: c.phone } });
    if (existing) {
      const canLink = linkUser && !existing.userId && !(await tx.customer.findUnique({ where: { userId: linkUser }, select: { id: true } }));
      return tx.customer.update({
        where: { id: existing.id },
        data: { name: c.name, ...(c.email ? { email: c.email } : {}), ...(canLink ? { userId: linkUser } : {}), ...(existing.deletedAt ? { deletedAt: null } : {}) },
      });
    }
    const userTaken = linkUser ? await tx.customer.findUnique({ where: { userId: linkUser }, select: { id: true } }) : null;
    return tx.customer.create({ data: { phone: c.phone, name: c.name, email: c.email, userId: linkUser && !userTaken ? linkUser : null } });
  }

  private afterCommit(event: OrderPlacedEvent, sections: string[], method: PaymentMethod, source: OrderSource) {
    const section = sections.length === 1 ? sections[0] : 'mixed';
    this.metrics.count(this.metrics.ordersPlaced, { payment_method: method, section, source });
    this.metrics.orderValue.record(D(event.grandTotal).toNumber(), { payment_method: method });
    this.metrics.openOrders.add(1);
    this.events.emit(Events.OrderPlaced, event);
    this.logger.log(`order placed ${event.orderNo} (${method}, ৳${event.grandTotal})`);
  }
}
