import { Injectable, Logger } from '@nestjs/common';
import { withRetry } from '@/common/utils/retry';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { aggregateOrders } from '../domain/customer-stats';

/**
 * Keeps customers.orders_count / live_orders / cancelled_orders / total_spent /
 * first_order_at / last_order_at in sync. Always a full recompute from the
 * customer's orders (never an increment), under a row lock, so replays,
 * duplicates and out-of-order events all converge on the right numbers.
 */
@Injectable()
export class CustomerAggregatesService {
  private readonly logger = new Logger(CustomerAggregatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Traced('customers.recompute_aggregates')
  async recompute(customerId: string) {
    return withRetry(() =>
      this.prisma.tx(async (tx) => {
        // Serialise concurrent recomputes of the same customer: the second one
        // reads orders only after the first commits (READ COMMITTED snapshot per statement).
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
        if (!locked.length) return null;
        const orders = await tx.order.findMany({ where: { customerId }, select: { status: true, grandTotal: true, placedAt: true } });
        const agg = aggregateOrders(orders);
        await tx.customer.update({ where: { id: customerId }, data: agg });
        return agg;
      }),
    );
  }

  /** Safe to call from event handlers: logs instead of throwing. */
  async recomputeQuietly(customerId: string) {
    try {
      await this.recompute(customerId);
    } catch (err) {
      this.logger.error({ err, customerId }, 'Customer aggregate recompute failed');
    }
  }
}
