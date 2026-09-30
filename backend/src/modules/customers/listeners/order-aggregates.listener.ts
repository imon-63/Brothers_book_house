import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, type OrderPlacedEvent, type OrderStatusChangedEvent } from '@/common/events/domain-events';
import { CustomerAggregatesService } from '../application/customer-aggregates.service';

/** CRM totals follow the order lifecycle (recompute ⇒ idempotent, replay-safe). */
@Injectable()
export class OrderAggregatesListener {
  constructor(private readonly aggregates: CustomerAggregatesService) {}

  @OnEvent(Events.OrderPlaced, { async: true, promisify: true })
  async onPlaced(e: OrderPlacedEvent) {
    await this.aggregates.recomputeQuietly(e.customerId);
  }

  @OnEvent(Events.OrderStatusChanged, { async: true, promisify: true })
  async onStatus(e: OrderStatusChangedEvent) {
    await this.aggregates.recomputeQuietly(e.customerId);
  }
}
