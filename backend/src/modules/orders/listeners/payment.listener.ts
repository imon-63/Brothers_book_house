import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { Events, type PaymentFailedEvent, type PaymentSucceededEvent } from '@/common/events/domain-events';
import { OrderPaymentService } from '../application/order-payment.service';

const STALE_SSL_MINUTES = 45;

/** Reacts to the payments module: gateway success → paid + confirm; failure → cancel unpaid SSL order. */
@Injectable()
export class PaymentListener {
  private readonly logger = new Logger(PaymentListener.name);

  constructor(private readonly payments: OrderPaymentService) {}

  @OnEvent(Events.PaymentSucceeded, { async: true, promisify: true })
  async onSucceeded(e: PaymentSucceededEvent) {
    try {
      await this.payments.onGatewaySuccess(e);
    } catch (err) {
      this.logger.error(`payment.succeeded handling failed for order ${e.orderId}: ${(err as Error).message}`);
    }
  }

  @OnEvent(Events.PaymentFailed, { async: true, promisify: true })
  async onFailed(e: PaymentFailedEvent) {
    try {
      await this.payments.onGatewayFailure(e);
    } catch (err) {
      this.logger.error(`payment.failed handling failed for order ${e.orderId}: ${(err as Error).message}`);
    }
  }

  /** Safety net when the gateway never calls back. */
  @Interval('orders.ssl_sweeper', 10 * 60_000)
  async sweepStaleSsl() {
    try {
      const n = await this.payments.cancelStaleUnpaid(STALE_SSL_MINUTES);
      if (n) this.logger.log(`auto-cancelled ${n} unpaid SSLCOMMERZ orders`);
    } catch (err) {
      this.logger.warn(`ssl sweeper failed: ${(err as Error).message}`);
    }
  }
}
