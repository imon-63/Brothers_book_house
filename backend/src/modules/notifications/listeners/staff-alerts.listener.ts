import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import { Events, type ChatMessageReceivedEvent, type OrderPlacedEvent, type StockLowEvent } from '@/common/events/domain-events';
import { toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { taka, bnDigits } from '../domain/templates';
import { StaffNotificationsService } from '../application/staff-notifications.service';

/** Bell alerts for staff (mirrors frontend components/admin/notify.tsx). */
@Injectable()
export class StaffAlertsListener {
  private readonly logger = new Logger(StaffAlertsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: StaffNotificationsService,
  ) {}

  @OnEvent(Events.OrderPlaced, { async: true, promisify: true })
  async onOrderPlaced(e: OrderPlacedEvent) {
    await this.safe('order.pending', async () => {
      const o = await this.prisma.order.findUnique({ where: { id: e.orderId }, select: { contactName: true, status: true } });
      if (!o || o.status !== 'PENDING') return;
      await this.alerts.notify(
        { type: 'order.pending', title: `নতুন অর্ডার ${e.orderNo}`, body: `${o.contactName} · ${taka(toNumber(e.grandTotal))} · কনফার্ম করুন`, link: `#orders/${e.orderNo}` },
        { collapse: true },
      );
    });
  }

  @OnEvent(Events.ChatMessageReceived, { async: true, promisify: true })
  async onChat(e: ChatMessageReceivedEvent) {
    await this.safe('chat.new', () =>
      this.alerts.notify({ type: 'chat.new', title: `${e.customerName} মেসেজ দিয়েছে`, body: e.preview.slice(0, 120), link: `#chat/${e.conversationId}` }, { collapse: true }).then(() => undefined),
    );
  }

  @OnEvent(Events.StockLow, { async: true, promisify: true })
  async onStockLow(e: StockLowEvent) {
    await this.safe('stock.low', () =>
      this.alerts
        .notify(
          {
            type: 'stock.low',
            title: e.stockOnHand <= 0 ? `${e.title} স্টক আউট` : `${e.title}-এর স্টক কম`,
            body: `${bnDigits(Math.max(0, e.stockOnHand))} কপি বাকি (সীমা ${bnDigits(e.threshold)})`,
            link: `#products/${e.productId}`,
          },
          { collapse: true },
        )
        .then(() => undefined),
    );
  }

  @Cron('0 30 3 * * *', { name: 'staff-notifications-purge', timeZone: 'Asia/Dhaka' })
  async purge() {
    try {
      const r = await this.alerts.purgeRead();
      if (r.count) this.logger.log({ removed: r.count }, 'Purged old read staff notifications');
    } catch (err) {
      this.logger.error({ err }, 'Staff notification purge failed');
    }
  }

  private async safe(type: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      this.logger.error({ err, type }, 'Staff alert failed');
    }
  }
}
