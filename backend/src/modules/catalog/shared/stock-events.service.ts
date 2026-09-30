import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Events, type StockLowEvent, type StockRestockedEvent } from '@/common/events/domain-events';
import { stockTransition } from '../domain/stock';

export type StockChange = { productId: string; title: string; before: number; after: number; threshold: number };

/**
 * Turns on-hand changes collected inside a transaction into alerts.
 * Call `publish` only AFTER the transaction has committed.
 */
@Injectable()
export class StockEventsService {
  private readonly logger = new Logger(StockEventsService.name);

  constructor(private readonly events: EventEmitter2) {}

  publish(changes: StockChange[]) {
    for (const c of changes) {
      const t = stockTransition(c.before, c.after, c.threshold);
      try {
        if (t.restocked) {
          this.events.emit(Events.StockRestocked, { productId: c.productId, stockOnHand: c.after } satisfies StockRestockedEvent);
        }
        if (t.becameLow) {
          this.events.emit(Events.StockLow, {
            productId: c.productId,
            title: c.title,
            stockOnHand: c.after,
            threshold: c.threshold,
          } satisfies StockLowEvent);
        }
      } catch (err) {
        // a failing listener must never turn a committed stock change into a 500
        this.logger.error({ err, productId: c.productId }, 'stock event listener failed');
      }
    }
  }
}
