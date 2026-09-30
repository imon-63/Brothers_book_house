import { Injectable } from '@nestjs/common';
import { metrics, type Attributes, type Counter, type Histogram, type UpDownCounter } from '@opentelemetry/api';

/**
 * Business metrics (RED + domain KPIs). Exposed to Prometheus as e.g.
 *   cholo_orders_placed_total{payment_method="COD",section="book"}
 *   cholo_order_value_bdt_bucket{…}
 * Keep label cardinality LOW: never put ids, phones or free text in attributes.
 */
@Injectable()
export class BusinessMetrics {
  private readonly meter = metrics.getMeter('cholo.business', '1.0.0');

  readonly ordersPlaced: Counter = this.meter.createCounter('cholo_orders_placed_total', {
    description: 'Orders placed',
  });
  readonly orderValue: Histogram = this.meter.createHistogram('cholo_order_value_bdt', {
    description: 'Grand total of placed orders (BDT)',
    unit: 'BDT',
    advice: { explicitBucketBoundaries: [100, 250, 500, 750, 1000, 1500, 2500, 5000, 10000] },
  });
  readonly orderTransitions: Counter = this.meter.createCounter('cholo_order_status_transitions_total', {
    description: 'Order status changes',
  });
  readonly checkoutFailures: Counter = this.meter.createCounter('cholo_checkout_failures_total', {
    description: 'Checkout attempts rejected (stock, coupon, validation, blocked)',
  });
  readonly payments: Counter = this.meter.createCounter('cholo_payments_total', {
    description: 'Gateway payment outcomes',
  });
  readonly paymentValue: Histogram = this.meter.createHistogram('cholo_payment_value_bdt', {
    description: 'Successful gateway payment amounts',
    unit: 'BDT',
    advice: { explicitBucketBoundaries: [100, 250, 500, 1000, 2500, 5000, 10000] },
  });
  readonly stockMovements: Counter = this.meter.createCounter('cholo_stock_movements_total', {
    description: 'Inventory ledger entries',
  });
  readonly authEvents: Counter = this.meter.createCounter('cholo_auth_events_total', {
    description: 'Login / refresh / logout / failures',
  });
  readonly outbox: Counter = this.meter.createCounter('cholo_outbox_deliveries_total', {
    description: 'Notification outbox deliveries by channel and result',
  });
  readonly openOrders: UpDownCounter = this.meter.createUpDownCounter('cholo_orders_open', {
    description: 'Orders not yet delivered/cancelled (approximate, process-local)',
  });


  count(counter: Counter, attrs: Attributes = {}, by = 1) {
    counter.add(by, attrs);
  }
}
