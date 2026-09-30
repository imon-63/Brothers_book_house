import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { OrderStatus } from '@prisma/client';
import { Events, type OrderPlacedEvent, type OrderStatusChangedEvent } from '@/common/events/domain-events';
import { toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { OutboxService } from '@/platform/outbox/outbox.service';

/** Which status changes text the customer, and with which template. */
export const STATUS_TEMPLATES: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'order.confirmed',
  HANDED_TO_COURIER: 'order.shipped',
  DELIVERED: 'order.delivered',
  CANCELLED: 'order.cancelled',
};

/**
 * Customer SMS on the order lifecycle. Dedupe key `order-<template>:<orderNo>`
 * makes duplicate/replayed events harmless (one SMS per milestone per order).
 */
@Injectable()
export class CustomerSmsListener {
  private readonly logger = new Logger(CustomerSmsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  @OnEvent(Events.OrderPlaced, { async: true, promisify: true })
  async onPlaced(e: OrderPlacedEvent) {
    await this.safe(e.orderNo, async () => {
      const o = await this.prisma.order.findUnique({ where: { id: e.orderId }, select: { contactName: true, contactPhone: true } });
      if (!o) return;
      await this.outbox.enqueue({
        channel: 'SMS', recipient: o.contactPhone, template: 'order.placed',
        payload: { name: o.contactName, orderNo: e.orderNo, total: toNumber(e.grandTotal), paymentMethod: e.paymentMethod },
        dedupeKey: `order-placed:${e.orderNo}`, // same key as OrderPlacementService → sent once
      });
    });
  }

  @OnEvent(Events.OrderStatusChanged, { async: true, promisify: true })
  async onStatus(e: OrderStatusChangedEvent) {
    const template = STATUS_TEMPLATES[e.to];
    if (!template) return;
    await this.safe(e.orderNo, async () => {
      const o = await this.prisma.order.findUnique({
        where: { id: e.orderId },
        select: {
          contactName: true, contactPhone: true, cancelReason: true,
          shipments: { where: { status: { notIn: ['CANCELLED', 'RETURNED'] } }, orderBy: { createdAt: 'desc' }, take: 1, select: { trackingNo: true, courier: { select: { name: true, trackingUrl: true } } } },
        },
      });
      if (!o) return;
      const s = o.shipments[0];
      const trackingUrl = s?.trackingNo && s.courier.trackingUrl ? s.courier.trackingUrl.replace('{tracking}', encodeURIComponent(s.trackingNo)) : null;
      await this.outbox.enqueue({
        channel: 'SMS',
        recipient: o.contactPhone,
        template,
        payload: {
          name: o.contactName,
          orderNo: e.orderNo,
          ...(template === 'order.shipped' ? { courier: s?.courier.name ?? null, trackingNo: s?.trackingNo ?? null, trackingUrl } : {}),
          ...(template === 'order.cancelled' ? { reason: o.cancelReason ?? e.credit?.reason ?? null } : {}),
        },
        dedupeKey: `order-${template}:${e.orderNo}`,
      });
    });
  }

  private async safe(orderNo: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      this.logger.error({ err, orderNo }, 'Could not enqueue customer SMS');
    }
  }
}
