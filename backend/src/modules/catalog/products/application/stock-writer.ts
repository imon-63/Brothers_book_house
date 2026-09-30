import { Injectable } from '@nestjs/common';
import type { StockMovementType } from '@prisma/client';
import { NotFoundError } from '@/common/errors/domain.error';
import type { Tx } from '@/infrastructure/prisma/prisma.service';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { DEFAULT_LOW_STOCK } from '../../domain/stock';
import type { StockChange } from '../../shared/stock-events.service';

type Locked = { id: string; title: string; stock_on_hand: number; low_stock_threshold: number | null };

/**
 * Catalog-side stock writes. Always goes through InventoryService (atomic
 * update + ledger row) and reports the before/after on-hand so the caller can
 * publish StockLow / StockRestocked after commit.
 */
@Injectable()
export class StockWriter {
  constructor(private readonly inventory: InventoryService) {}

  /** Set an absolute on-hand figure (count correction, opening stock). */
  async setOnHand(
    tx: Tx,
    productId: string,
    onHand: number,
    ctx: { actorId: string | null; note?: string; type: StockMovementType },
  ): Promise<StockChange | null> {
    const cur = await this.lock(tx, productId);
    if (cur.stock_on_hand === onHand) return null;
    await this.inventory.setOnHand(tx, productId, onHand, ctx);
    return this.change(cur, onHand);
  }

  /** +N units without a purchase (bulk restock / manual receipt), also growing আসল কপি. */
  async add(tx: Tx, productId: string, units: number, ctx: { actorId: string | null; note?: string }): Promise<StockChange> {
    const cur = await this.lock(tx, productId);
    const after = cur.stock_on_hand + units;
    await this.inventory.setOnHand(tx, productId, after, { ...ctx, type: 'ADJUSTMENT' });
    await tx.$executeRaw`UPDATE products SET initial_copies = COALESCE(initial_copies, 0) + ${units} WHERE id = ${productId}::uuid`;
    return this.change(cur, after);
  }

  private async lock(tx: Tx, productId: string): Promise<Locked> {
    const rows = await tx.$queryRaw<Locked[]>`
      SELECT id, title, stock_on_hand, low_stock_threshold FROM products WHERE id = ${productId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (!rows.length) throw new NotFoundError('Product', productId);
    return rows[0];
  }

  private change(cur: Locked, after: number): StockChange {
    return { productId: cur.id, title: cur.title, before: cur.stock_on_hand, after, threshold: cur.low_stock_threshold ?? DEFAULT_LOW_STOCK };
  }
}
