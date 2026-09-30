import { Module } from '@nestjs/common';
import { CustomerAggregatesService } from './application/customer-aggregates.service';
import { CustomerCrmService } from './application/customer-crm.service';
import { CustomersQueryService } from './application/customers-query.service';
import { MeService } from './application/me.service';
import { WishlistService } from './application/wishlist.service';
import { CustomersAdminController } from './controllers/customers.admin.controller';
import { MeController } from './controllers/me.controller';
import { OrderAggregatesListener } from './listeners/order-aggregates.listener';
import { RestockListener } from './listeners/restock.listener';

/**
 * CRM (admin customers, segments, notes, tags, block) and customer
 * self-service (/me profile, addresses, wishlist). Aggregates follow order
 * events; restocks notify wishlist watchers through the outbox.
 */
@Module({
  controllers: [CustomersAdminController, MeController],
  providers: [CustomerAggregatesService, CustomersQueryService, CustomerCrmService, MeService, WishlistService, OrderAggregatesListener, RestockListener],
  exports: [CustomerAggregatesService, MeService],
})
export class CustomersModule {}
