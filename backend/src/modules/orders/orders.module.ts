import { Module } from '@nestjs/common';
import { AdminOrdersService } from './application/admin-orders.service';
import { CustomerOrdersService } from './application/customer-orders.service';
import { IdempotencyService } from './application/idempotency.service';
import { OrderBulkService } from './application/order-bulk.service';
import { OrderMetaService } from './application/order-meta.service';
import { OrderPaymentService } from './application/order-payment.service';
import { OrderPlacementService } from './application/order-placement.service';
import { OrderTransitionService } from './application/order-transition.service';
import { CartModule } from './cart/cart.module';
import { CheckoutController } from './controllers/checkout.controller';
import { CustomerOrdersController } from './controllers/customer-orders.controller';
import { OrdersAdminController } from './controllers/orders.admin.controller';
import { GeoModule } from './geo/geo.module';
import { PaymentListener } from './listeners/payment.listener';
import { PricingModule } from './pricing/pricing.module';
import { PromotionsModule } from './promotions/promotions.module';
import { ShippingModule } from './shipping/shipping.module';

/**
 * Orders feature: checkout, order lifecycle, customer tracking and the admin
 * orders desk. Sub-domains (cart, pricing, promotions, shipping, geo) are
 * their own modules. Exports OrderTransitionService for other modules that
 * must move an order inside their own transaction.
 */
@Module({
  imports: [GeoModule, ShippingModule, PromotionsModule, PricingModule, CartModule],
  controllers: [CheckoutController, CustomerOrdersController, OrdersAdminController],
  providers: [
    IdempotencyService,
    OrderTransitionService,
    OrderPaymentService,
    OrderPlacementService,
    AdminOrdersService,
    OrderMetaService,
    OrderBulkService,
    CustomerOrdersService,
    PaymentListener,
  ],
  exports: [OrderTransitionService, PricingModule],
})
export class OrdersModule {}
