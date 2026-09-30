import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Events, type StockRestockedEvent } from '@/common/events/domain-events';
import { WishlistService } from '../application/wishlist.service';

@Injectable()
export class RestockListener {
  private readonly logger = new Logger(RestockListener.name);

  constructor(private readonly wishlist: WishlistService) {}

  @OnEvent(Events.StockRestocked, { async: true, promisify: true })
  async onRestocked(e: StockRestockedEvent) {
    try {
      const n = await this.wishlist.notifyRestocked(e.productId);
      if (n) this.logger.log({ productId: e.productId, notified: n }, 'Wishlist restock alerts queued');
    } catch (err) {
      this.logger.error({ err, productId: e.productId }, 'Restock listener failed');
    }
  }
}
