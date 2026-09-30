import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { AuditService } from '@/platform/audit/audit.service';
import { DocumentCounterService } from '@/platform/counters/document-counter.service';
import { OutboxService } from '@/platform/outbox/outbox.service';
import { OrderPlacementService } from './application/order-placement.service';
import { OrderTransitionService } from './application/order-transition.service';
import { CartService } from './cart/application/cart.service';
import { OrdersModule } from './orders.module';
import { PricingService } from './pricing/application/pricing.service';

/** Stand-ins for the global infrastructure modules (no database needed). */
@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: {} },
    BusinessMetrics,
    { provide: InventoryService, useValue: {} },
    { provide: AuditService, useValue: {} },
    { provide: DocumentCounterService, useValue: {} },
    { provide: OutboxService, useValue: {} },
  ],
  exports: [PrismaService, BusinessMetrics, InventoryService, AuditService, DocumentCounterService, OutboxService],
})
class FakeInfraModule {}

describe('OrdersModule wiring', () => {
  it('resolves every provider and controller', async () => {
    const mod = await Test.createTestingModule({ imports: [FakeInfraModule, EventEmitterModule.forRoot(), OrdersModule] }).compile();
    expect(mod.get(OrderPlacementService)).toBeDefined();
    expect(mod.get(OrderTransitionService)).toBeDefined();
    expect(mod.get(PricingService)).toBeDefined();
    expect(mod.get(CartService)).toBeDefined();
    await mod.close();
  });
});
