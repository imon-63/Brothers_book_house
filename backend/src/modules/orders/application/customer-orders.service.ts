import { Injectable } from '@nestjs/common';
import { skipTake, toPage, type PageQueryDto } from '@/common/dto/pagination.dto';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { toNumber } from '@/common/utils/money';
import { normalizeBdPhone } from '@/common/utils/text';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { normalizeOrderNo } from '../domain/order-filters';
import { STATUS_LABEL_BN } from '../domain/order-status';
import { buildTimeline } from '../domain/order-timeline';
import { ORDER_DETAIL_INCLUDE, toCustomerOrder, toTrackedOrder } from '../mappers/order.mapper';
import { OrderTransitionService } from './order-transition.service';

/** আমার অর্ডার + public tracking. */
@Injectable()
export class CustomerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: OrderTransitionService,
  ) {}

  async list(user: AuthUser, q: PageQueryDto) {
    if (!user.customerId) return toPage([], 0, q);
    const where = { customerId: user.customerId };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { placedAt: 'desc' },
        ...skipTake(q),
        include: { items: { select: { title: true, quantity: true, kind: true, productId: true, bundleId: true } }, history: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.order.count({ where }),
    ]);
    return toPage(
      rows.map((o) => {
        const t = buildTimeline({ status: o.status, cancelledFrom: o.cancelledFrom, placedAt: o.placedAt, cancelledAt: o.cancelledAt, history: o.history.map((h) => ({ toStatus: h.toStatus, at: h.createdAt })) });
        return {
          orderNo: o.orderNo,
          status: o.status,
          statusLabel: STATUS_LABEL_BN[o.status],
          placedAt: o.placedAt,
          items: o.items,
          grandTotal: toNumber(o.grandTotal),
          paymentMethod: o.paymentMethod,
          paymentStatus: o.paymentStatus,
          glance: { title: t.title, sub: t.sub, chip: t.chip, kind: t.kind },
        };
      }),
      total,
      q,
    );
  }

  async detail(user: AuthUser, orderNo: string) {
    const no = normalizeOrderNo(orderNo);
    const o = no && user.customerId ? await this.prisma.order.findFirst({ where: { orderNo: no, customerId: user.customerId }, include: ORDER_DETAIL_INCLUDE }) : null;
    if (!o) throw new NotFoundError('Order', orderNo);
    return toCustomerOrder(o);
  }

  /** A shopper may cancel their own order while it is still pending. */
  @Traced('orders.customer_cancel')
  async cancel(user: AuthUser, orderNo: string, reason?: string) {
    const no = normalizeOrderNo(orderNo);
    const o = no && user.customerId ? await this.prisma.order.findFirst({ where: { orderNo: no, customerId: user.customerId }, select: { id: true } }) : null;
    if (!o) throw new NotFoundError('Order', orderNo);
    await this.transitions.transition(o.id, { to: 'CANCELLED', note: reason ? `কাস্টমার বাতিল: ${reason}` : 'কাস্টমার বাতিল করেছেন' }, { id: user.id, name: user.name, type: 'CUSTOMER' });
    return this.detail(user, orderNo);
  }

  /** orderNo + phone → that order; phone only → the 5 latest orders on that number. */
  @Traced('orders.track')
  async track(phoneRaw: string, orderNo?: string) {
    const phone = normalizeBdPhone(phoneRaw);
    if (!phone) throw new BusinessRuleError('order.phone_invalid', 'সঠিক মোবাইল নম্বর দিন');
    if (orderNo) {
      const no = normalizeOrderNo(orderNo);
      const o = no ? await this.prisma.order.findFirst({ where: { orderNo: no, contactPhone: phone }, include: ORDER_DETAIL_INCLUDE }) : null;
      if (!o) throw new NotFoundError('Order', orderNo);
      return { orders: [toTrackedOrder(o)] };
    }
    const rows = await this.prisma.order.findMany({ where: { contactPhone: phone }, orderBy: { placedAt: 'desc' }, take: 5, include: ORDER_DETAIL_INCLUDE });
    return { orders: rows.map(toTrackedOrder) };
  }
}
