import { Injectable } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D, toNumber } from '@/common/utils/money';
import { localPhone } from '@/common/utils/text';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { toCsv } from '../domain/csv';
import { dhakaDayStart, orderRef, tabCounts } from '../domain/order-filters';
import { ALL_STATUSES, OPEN_STATUSES, STATUS_LABEL_BN } from '../domain/order-status';
import { buildPickList } from '../domain/pick-list';
import type { BoardQueryDto, OrderFilterDto } from '../dto/admin-orders.dto';
import { addressText, ORDER_DETAIL_INCLUDE, ORDER_SUMMARY_INCLUDE, toOrderDetail, toOrderSummary } from '../mappers/order.mapper';
import { baseWhere, listWhere, orderBy, statusesFor } from './order-query.builder';

const EXPORT_LIMIT = 5000;

/** Read side of the admin orders screen. */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Traced('orders.admin.list')
  async list(f: OrderFilterDto) {
    const where = listWhere(f);
    const [rows, total, counts] = await Promise.all([
      this.prisma.order.findMany({ where, include: ORDER_SUMMARY_INCLUDE, orderBy: orderBy(f.sort), ...skipTake(f) }),
      this.prisma.order.count({ where }),
      this.counts(f),
    ]);
    return { ...toPage(rows.map(toOrderSummary), total, f), counts };
  }

  /** Tab badges + per-status counts/value for the same filters. */
  async counts(f: OrderFilterDto) {
    const groups = await this.prisma.order.groupBy({ by: ['status'], where: baseWhere(f), _count: { _all: true }, _sum: { grandTotal: true } });
    const byStatus: Partial<Record<OrderStatus, number>> = {};
    const value: Partial<Record<OrderStatus, number>> = {};
    for (const g of groups) {
      byStatus[g.status] = g._count._all;
      value[g.status] = toNumber(g._sum.grandTotal);
    }
    return { tabs: tabCounts(byStatus), byStatus, value };
  }

  /** Kanban: one column per status with count, value and the first N cards. */
  @Traced('orders.admin.board')
  async board(f: BoardQueryDto) {
    const statuses = statusesFor(f);
    const base = baseWhere(f);
    const [groups, ...cols] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true }, _sum: { grandTotal: true } }),
      ...statuses.map((s) => this.prisma.order.findMany({ where: { AND: [base, { status: s }] }, include: ORDER_SUMMARY_INCLUDE, orderBy: orderBy(f.sort), take: Math.min(f.perColumn, 100) })),
    ]);
    const g = new Map(groups.map((x) => [x.status, x]));
    return {
      columns: statuses.map((s, i) => ({
        status: s,
        label: STATUS_LABEL_BN[s],
        count: g.get(s)?._count._all ?? 0,
        value: toNumber(g.get(s)?._sum.grandTotal ?? 0),
        orders: cols[i].map(toOrderSummary),
      })),
    };
  }

  async detail(ref: string) {
    const where = orderRef(ref);
    const o = where ? await this.prisma.order.findUnique({ where: where as Prisma.OrderWhereUniqueInput, include: ORDER_DETAIL_INCLUDE }) : null;
    if (!o) throw new NotFoundError('Order', ref);
    return toOrderDetail(o);
  }

  /** Same columns as the storefront admin CSV. */
  @Traced('orders.admin.export')
  async exportCsv(f: OrderFilterDto, actor: Pick<AuthUser, 'id' | 'name'>) {
    const rows = await this.prisma.order.findMany({ where: listWhere(f), include: ORDER_SUMMARY_INCLUDE, orderBy: orderBy(f.sort), take: EXPORT_LIMIT });
    const csv = toCsv([
      ['id', 'date', 'customer', 'phone', 'address', 'items', 'vertical', 'payment', 'paid', 'status', 'subtotal', 'discount', 'shipping', 'total', 'priority', 'tags', 'tracking'],
      ...rows.map((o) => [
        o.orderNo,
        o.placedAt.toISOString(),
        o.contactName,
        localPhone(o.contactPhone),
        addressText(o),
        o.items.map((i) => `${i.title} × ${i.quantity}`).join(', '),
        [...new Set(o.items.map((i) => i.sectionCode))].join(' / '),
        o.paymentMethod,
        o.paymentStatus === 'UNPAID' ? 'no' : 'yes',
        STATUS_LABEL_BN[o.status],
        D(o.itemsSubtotal).toFixed(2),
        D(o.discountTotal).toFixed(2),
        D(o.shippingFee).toFixed(2),
        D(o.grandTotal).toFixed(2),
        o.priority,
        o.tags.map((t) => t.tag.name).join(' / '),
        o.shipments[0]?.trackingNo ?? '',
      ]),
    ]);
    await this.audit.record({ actor, action: 'EXPORT', area: 'order', entityType: 'Order', summary: `${rows.length}টি অর্ডার CSV-তে নামানো হয়েছে`, after: { filters: { ...f } as unknown as Prisma.InputJsonValue } });
    return csv;
  }

  /** Items to pick grouped by product (bundles expanded) with stock shortfalls. */
  @Traced('orders.admin.pick_list')
  async pickList(ids?: string[]) {
    const where: Prisma.OrderWhereInput = ids?.length
      ? { OR: ids.map(orderRef).filter((r): r is NonNullable<ReturnType<typeof orderRef>> => !!r) }
      : { status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] } };
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { placedAt: 'asc' },
      take: 200,
      select: {
        orderNo: true, contactName: true, contactPhone: true, shipLine: true, shipLandmark: true, shipUnion: true, shipUpazila: true, shipDistrict: true,
        items: { select: { kind: true, productId: true, title: true, quantity: true, components: { select: { productId: true, title: true, quantity: true } } } },
      },
    });
    const productIds = [...new Set(orders.flatMap((o) => o.items.flatMap((i) => (i.kind === 'BUNDLE' ? i.components.map((c) => c.productId) : i.productId ? [i.productId] : []))))];
    const stock = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true, stockOnHand: true, stockReserved: true } });
    return buildPickList(
      orders.map((o) => ({ orderNo: o.orderNo, contactName: o.contactName, contactPhone: localPhone(o.contactPhone), address: addressText(o), items: o.items })),
      new Map(stock.map((s) => [s.id, s])),
    );
  }

  /** Header KPIs like the storefront admin (today, pending value, COD to collect). */
  async kpis() {
    const now = new Date();
    const dayStart = dhakaDayStart(now);
    const [today, pending, due, oldest] = await Promise.all([
      this.prisma.order.aggregate({ where: { placedAt: { gte: dayStart }, status: { notIn: ['CANCELLED', 'RETURNED'] } }, _count: { _all: true }, _sum: { grandTotal: true } }),
      this.prisma.order.aggregate({ where: { status: 'PENDING' }, _count: { _all: true }, _sum: { grandTotal: true } }),
      this.prisma.order.aggregate({ where: { paymentMethod: 'COD', paymentStatus: 'UNPAID', status: { in: [...OPEN_STATUSES.filter((s) => s !== 'PENDING'), 'DELIVERED'] } }, _count: { _all: true }, _sum: { grandTotal: true } }),
      this.prisma.order.findFirst({ where: { status: 'PENDING' }, orderBy: { placedAt: 'asc' }, select: { placedAt: true } }),
    ]);
    return {
      today: { orders: today._count._all, value: toNumber(today._sum.grandTotal) },
      pending: { orders: pending._count._all, value: toNumber(pending._sum.grandTotal), oldestAt: oldest?.placedAt ?? null },
      codToCollect: { orders: due._count._all, value: toNumber(due._sum.grandTotal) },
      statuses: ALL_STATUSES,
    };
  }
}
