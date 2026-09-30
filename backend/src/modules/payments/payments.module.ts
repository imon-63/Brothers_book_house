import { Module } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import { FinanceModule } from '@/modules/finance/finance.module';
import { PaymentsAdminController, SslCommerzController } from './controllers/payments.controller';
import { RefundsService } from './refunds/application/refunds.service';
import { PaymentCallbacksService } from './sslcommerz/application/payment-callbacks.service';
import { PaymentCheckoutService } from './sslcommerz/application/payment-checkout.service';
import { PaymentEventsService } from './sslcommerz/application/payment-events.service';
import { PaymentReconcilerService } from './sslcommerz/application/payment-reconciler.service';
import { PaymentSettlementService } from './sslcommerz/application/payment-settlement.service';
import { SslCommerzHttpGateway } from './sslcommerz/gateway/sslcommerz-http.gateway';
import { SSLCOMMERZ_GATEWAY } from './sslcommerz/gateway/sslcommerz.gateway';

/**
 * পেমেন্ট — SSLCOMMERZ hosted checkout, callbacks, IPN, reconciliation and
 * refunds. Emits payment.succeeded / payment.failed; the orders module marks
 * the order paid / cancels unpaid SSL orders in response.
 *
 * Ownership note: refunds update orders.amount_refunded / payment_status
 * directly inside the refund transaction (payment columns belong here).
 */
@Module({
  imports: [FinanceModule],
  controllers: [SslCommerzController, PaymentsAdminController],
  providers: [
    { provide: SSLCOMMERZ_GATEWAY, inject: [AppConfig], useFactory: (config: AppConfig) => new SslCommerzHttpGateway(config) },
    PaymentEventsService,
    PaymentSettlementService,
    PaymentCheckoutService,
    PaymentCallbacksService,
    PaymentReconcilerService,
    RefundsService,
  ],
  exports: [PaymentCheckoutService],
})
export class PaymentsModule {}
