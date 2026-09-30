import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, type OrderPaidEvent, type OrderStatusChangedEvent, type PaymentSucceededEvent } from '@/common/events/domain-events';
import { DocumentIssuerService, type SyncHint } from '../application/document-issuer.service';

/**
 * Orders/payments → books. Every handler just asks the issuer to reconcile
 * the order's papers with its current state, in its own transaction, so the
 * handlers are idempotent and order-independent. Failures are logged and never
 * propagate to the emitter (the originating transaction has already committed);
 * the next event for the order (or a manual resync) catches up.
 */
@Injectable()
export class OrderBooksListener {
  private readonly logger = new Logger(OrderBooksListener.name);

  constructor(private readonly issuer: DocumentIssuerService) {}

  @OnEvent(Events.OrderStatusChanged, { async: true })
  async onStatusChanged(e: OrderStatusChangedEvent) {
    await this.run(e.orderId, { from: e.from, credit: e.credit, actorId: e.actorId }, `status ${e.from}→${e.to}`);
  }

  @OnEvent(Events.OrderPaid, { async: true })
  async onPaid(e: OrderPaidEvent) {
    await this.run(e.orderId, { actorId: e.actorId }, 'paid');
  }

  @OnEvent(Events.PaymentSucceeded, { async: true })
  async onPayment(e: PaymentSucceededEvent) {
    await this.run(e.orderId, {}, `payment ${e.tranId}`);
  }

  private async run(orderId: string, hint: SyncHint, why: string) {
    try {
      await this.issuer.sync(orderId, hint);
    } catch (err) {
      this.logger.error({ err, orderId }, `books sync failed (${why})`);
    }
  }
}
