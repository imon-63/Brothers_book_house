import { Injectable } from '@nestjs/common';
import type { Prisma, ShipmentStatus } from '@prisma/client';
import { toPage, skipTake } from '@/common/dto/pagination.dto';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D, round2, sum } from '@/common/utils/money';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { orderRef } from '../../domain/order-filters';
import type { AssignShipmentDto, ShipmentListQueryDto, UpdateShipmentDto } from '../dto/shipping.dto';
import { toShipment } from '../mappers/shipping.mapper';

type Actor = Pick<AuthUser, 'id' | 'name'>;
const CLOSED: ShipmentStatus[] = ['CANCELLED', 'RETURNED'];
const INCLUDE = { courier: true, order: { select: { orderNo: true } } } as const;

/** Timestamp column each courier status stamps (first time only). */
const STAMP: Partial<Record<ShipmentStatus, 'bookedAt' | 'pickedUpAt' | 'deliveredAt' | 'returnedAt'>> = {
  BOOKED: 'bookedAt',
  PICKED_UP: 'pickedUpAt',
  DELIVERED: 'deliveredAt',
  RETURNED: 'returnedAt',
};

/**
 * Courier consignments. One active shipment per order (partial unique index);
 * the actual courier bill flows into orders.courier_cost for profit reports.
 */
@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: ShipmentListQueryDto) {
    const where: Prisma.ShipmentWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.codStatus ? { codStatus: q.codStatus } : {}),
      ...(q.courierId ? { courierId: q.courierId } : {}),
      ...(q.q ? { OR: [{ trackingNo: { contains: q.q, mode: 'insensitive' } }, { order: { orderNo: { contains: q.q, mode: 'insensitive' } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.shipment.findMany({ where, include: INCLUDE, orderBy: { createdAt: q.order }, ...skipTake(q) }),
      this.prisma.shipment.count({ where }),
    ]);
    return toPage(rows.map(toShipment), total, q);
  }

  /** Assign courier + tracking. Same courier → update in place; other courier → old one cancelled. */
  @Traced('shipping.shipment.assign')
  async assign(dto: AssignShipmentDto, actor: Actor) {
    const ref = orderRef(dto.order);
    if (!ref) throw new NotFoundError('Order', dto.order);
    return this.prisma.tx(async (tx) => {
      const order = await tx.order.findUnique({
        where: ref as Prisma.OrderWhereUniqueInput,
        select: { id: true, orderNo: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, amountPaid: true, shipZoneCode: true },
      });
      if (!order) throw new NotFoundError('Order', dto.order);
      if (order.status === 'CANCELLED' || order.status === 'RETURNED') throw new BusinessRuleError('shipment.order_closed', 'বাতিল/ফেরত অর্ডারে কুরিয়ার দেওয়া যায় না');
      const courier = await tx.courier.findFirst({ where: /^[0-9a-f-]{36}$/i.test(dto.courier) ? { id: dto.courier } : { code: dto.courier.toLowerCase() } });
      if (!courier) throw new NotFoundError('Courier', dto.courier);
      if (!courier.isActive) throw new BusinessRuleError('courier.inactive', 'এই কুরিয়ার বন্ধ করা আছে');
      if (dto.trackingNo) {
        const dup = await tx.shipment.findFirst({ where: { courierId: courier.id, trackingNo: dto.trackingNo, orderId: { not: order.id } }, select: { order: { select: { orderNo: true } } } });
        if (dup) throw new ConflictError('shipment.tracking_taken', `এই ট্র্যাকিং নম্বর ${dup.order.orderNo}-এ আছে`);
      }

      const active = await tx.shipment.findFirst({ where: { orderId: order.id, status: { notIn: CLOSED } } });
      const zone = await tx.shippingZone.findUnique({ where: { code: order.shipZoneCode }, select: { courierCost: true } });
      const due = order.paymentStatus === 'UNPAID' ? round2(D(order.grandTotal).minus(order.amountPaid)) : D(0);
      const cod = { codAmount: due.greaterThan(0) ? due : D(0), codStatus: due.greaterThan(0) ? ('PENDING' as const) : ('NOT_APPLICABLE' as const) };

      let shipment;
      if (active && active.courierId === courier.id) {
        shipment = await tx.shipment.update({
          where: { id: active.id },
          data: {
            trackingNo: dto.trackingNo ?? active.trackingNo,
            consignmentId: dto.consignmentId ?? active.consignmentId,
            ...(dto.deliveryCharge != null ? { deliveryCharge: dto.deliveryCharge } : {}),
            ...(dto.weightGrams != null ? { weightGrams: dto.weightGrams } : {}),
            ...(dto.trackingNo && !active.bookedAt ? { status: 'BOOKED', bookedAt: new Date() } : {}),
          },
          include: INCLUDE,
        });
      } else {
        if (active) await tx.shipment.update({ where: { id: active.id }, data: { status: 'CANCELLED' } });
        shipment = await tx.shipment.create({
          data: {
            orderId: order.id,
            courierId: courier.id,
            trackingNo: dto.trackingNo ?? null,
            consignmentId: dto.consignmentId ?? null,
            status: dto.trackingNo ? 'BOOKED' : 'PENDING',
            bookedAt: dto.trackingNo ? new Date() : null,
            deliveryCharge: dto.deliveryCharge ?? zone?.courierCost ?? 0,
            weightGrams: dto.weightGrams ?? null,
            ...cod,
          },
          include: INCLUDE,
        });
      }
      await this.syncCourierCost(tx, order.id);
      await this.audit.record(
        {
          actor,
          action: active ? 'UPDATE' : 'CREATE',
          area: 'order',
          entityType: 'Shipment',
          entityId: shipment.id,
          summary: `${order.orderNo} · কুরিয়ার: ${courier.name}${shipment.trackingNo ? ` · ${shipment.trackingNo}` : ''}`,
          after: { courier: courier.code, trackingNo: shipment.trackingNo, replaced: active && active.courierId !== courier.id ? active.id : null },
        },
        tx,
      );
      return toShipment(shipment);
    });
  }

  @Traced('shipping.shipment.update')
  async update(id: string, dto: UpdateShipmentDto, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.shipment.findUnique({ where: { id }, include: INCLUDE });
      if (!cur) throw new NotFoundError('Shipment', id);
      if (CLOSED.includes(cur.status) && dto.status && dto.status !== cur.status) {
        throw new BusinessRuleError('shipment.closed', 'বাতিল/ফেরত শিপমেন্টের স্ট্যাটাস বদলানো যায় না');
      }
      if (dto.codStatus && dto.codStatus !== 'NOT_APPLICABLE' && D(cur.codAmount).isZero()) {
        throw new BusinessRuleError('shipment.no_cod', 'এই শিপমেন্টে COD নেই');
      }
      const now = new Date();
      const stamp = dto.status ? STAMP[dto.status] : undefined;
      const data: Prisma.ShipmentUpdateInput = {
        ...(dto.status ? { status: dto.status } : {}),
        ...(stamp && !cur[stamp] ? { [stamp]: now } : {}),
        ...(dto.codStatus ? { codStatus: dto.codStatus } : {}),
        ...(dto.codStatus === 'COLLECTED' && !cur.codCollectedAt ? { codCollectedAt: now } : {}),
        ...(dto.codStatus === 'REMITTED' ? { codRemittedAt: cur.codRemittedAt ?? now, codCollectedAt: cur.codCollectedAt ?? now } : {}),
        ...(dto.deliveryCharge != null ? { deliveryCharge: dto.deliveryCharge } : {}),
        ...(dto.returnCharge != null ? { returnCharge: dto.returnCharge } : {}),
        ...(dto.trackingNo !== undefined ? { trackingNo: dto.trackingNo } : {}),
        ...(dto.consignmentId !== undefined ? { consignmentId: dto.consignmentId } : {}),
      };
      const s = await tx.shipment.update({ where: { id }, data, include: INCLUDE });
      await this.syncCourierCost(tx, cur.orderId);
      const d = AuditService.diff(
        { status: cur.status, codStatus: cur.codStatus, deliveryCharge: cur.deliveryCharge.toString(), returnCharge: cur.returnCharge.toString(), trackingNo: cur.trackingNo },
        { status: dto.status, codStatus: dto.codStatus, deliveryCharge: dto.deliveryCharge?.toString(), returnCharge: dto.returnCharge?.toString(), trackingNo: dto.trackingNo ?? undefined },
      );
      await this.audit.record({ actor, action: 'UPDATE', area: 'order', entityType: 'Shipment', entityId: id, summary: `${cur.order.orderNo} · শিপমেন্ট আপডেট (${d.changed.join(', ') || '—'})`, before: d.before, after: d.after }, tx);
      return toShipment(s);
    });
  }

  /** orders.courier_cost = Σ (delivery + return charge) of shipments that were not cancelled. */
  private async syncCourierCost(tx: Tx, orderId: string) {
    const rows = await tx.shipment.findMany({ where: { orderId, status: { not: 'CANCELLED' } }, select: { deliveryCharge: true, returnCharge: true } });
    if (!rows.length) return;
    await tx.order.update({ where: { id: orderId }, data: { courierCost: sum(rows.flatMap((r) => [r.deliveryCharge, r.returnCharge])) } });
  }
}
