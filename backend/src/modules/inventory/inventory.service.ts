import { Injectable } from '@nestjs/common';
import { Prisma, type StockMovementType } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import { D, round2, type MoneyLike } from '@/common/utils/money';
import type { Tx } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';

export type StockLine = { productId: string; qty: number };
export type StockContext = { orderId?: string; purchaseId?: string; actorId?: string | null; note?: string };
export type LowStockHit = { productId: string; title: string; stockOnHand: number; threshold: number };

const DEFAULT_LOW = 5;

type Row = { id: string; title: string; stock_on_hand: number; stock_reserved: number; low_stock_threshold: number | null };

/**
 * The only code allowed to change stock. Every change is:
 *   1. an atomic, conditional UPDATE on products (no read-modify-write race)
 *   2. an append-only stock_movements row with the resulting balance
 * Rows are locked in id order so concurrent multi-line orders cannot deadlock.
 * All methods require the caller's transaction.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly metrics: BusinessMetrics) {}

  /** Hold units for an order (on-hand unchanged, reserved += qty). */
  async reserve(tx: Tx, lines: StockLine[], ctx: StockContext) {
    for (const l of this.merge(lines)) {
      const rows = await tx.$queryRaw<Row[]>`
        UPDATE products
           SET stock_reserved = stock_reserved + ${l.qty}, updated_at = now()
         WHERE id = ${l.productId}::uuid AND deleted_at IS NULL
           AND (NOT track_inventory OR allow_backorder OR stock_on_hand - stock_reserved >= ${l.qty})
     RETURNING id, title, stock_on_hand, stock_reserved, low_stock_threshold`;
      if (!rows.length) {
        const p = await tx.product.findUnique({ where: { id: l.productId }, select: { title: true, stockOnHand: true, stockReserved: true } });
        if (!p) throw new NotFoundError('Product', l.productId);
        throw new BusinessRuleError('stock.insufficient', `${p.title} — স্টকে যথেষ্ট কপি নেই`, {
          productId: l.productId,
          requested: l.qty,
          available: Math.max(0, p.stockOnHand - p.stockReserved),
        });
      }
      await this.log(tx, rows[0], 'ORDER_RESERVE', 0, l.qty, ctx);
    }
  }

  /** Give a hold back (order cancelled before it left the shelf). */
  async release(tx: Tx, lines: StockLine[], ctx: StockContext) {
    for (const l of this.merge(lines)) {
      const rows = await tx.$queryRaw<Row[]>`
        UPDATE products
           SET stock_reserved = GREATEST(stock_reserved - ${l.qty}, 0), updated_at = now()
         WHERE id = ${l.productId}::uuid
     RETURNING id, title, stock_on_hand, stock_reserved, low_stock_threshold`;
      if (rows.length) await this.log(tx, rows[0], 'ORDER_RELEASE', 0, -l.qty, ctx);
    }
  }

  /** Units physically leave (handed to courier): on-hand −qty, reserved −qty. */
  async fulfill(tx: Tx, lines: StockLine[], ctx: StockContext): Promise<LowStockHit[]> {
    const low: LowStockHit[] = [];
    for (const l of this.merge(lines)) {
      const rows = await tx.$queryRaw<Row[]>`
        UPDATE products
           SET stock_on_hand = stock_on_hand - ${l.qty},
               stock_reserved = GREATEST(stock_reserved - ${l.qty}, 0),
               sold_count = sold_count + ${l.qty},
               updated_at = now()
         WHERE id = ${l.productId}::uuid AND (allow_backorder OR stock_on_hand >= ${l.qty})
     RETURNING id, title, stock_on_hand, stock_reserved, low_stock_threshold`;
      if (!rows.length) throw new BusinessRuleError('stock.fulfil_failed', 'শেলফে যথেষ্ট কপি নেই', { productId: l.productId });
      await this.log(tx, rows[0], 'ORDER_FULFILL', -l.qty, -l.qty, ctx);
      const hit = this.lowHit(rows[0]);
      if (hit) low.push(hit);
    }
    return low;
  }

  /** Returned goods back on the shelf. */
  async restock(tx: Tx, lines: StockLine[], ctx: StockContext) {
    for (const l of this.merge(lines)) {
      const rows = await tx.$queryRaw<Row[]>`
        UPDATE products
           SET stock_on_hand = stock_on_hand + ${l.qty},
               sold_count = GREATEST(sold_count - ${l.qty}, 0),
               updated_at = now()
         WHERE id = ${l.productId}::uuid
     RETURNING id, title, stock_on_hand, stock_reserved, low_stock_threshold`;
      if (rows.length) await this.log(tx, rows[0], 'RETURN_RESTOCK', l.qty, 0, ctx);
    }
  }

  /**
   * Goods received from a supplier. Updates cost price with a moving weighted
   * average so margin reports stay honest when purchase prices change.
   */
  async receive(tx: Tx, productId: string, qty: number, unitCost: MoneyLike, ctx: StockContext) {
    if (qty <= 0) throw new BusinessRuleError('stock.qty_invalid', 'কপি সংখ্যা শূন্যের বেশি দিন');
    const cur = await tx.product.findUnique({ where: { id: productId }, select: { stockOnHand: true, costPrice: true } });
    if (!cur) throw new NotFoundError('Product', productId);
    const onHand = Math.max(0, cur.stockOnHand);
    const avg = cur.costPrice && onHand > 0 ? round2(D(cur.costPrice).times(onHand).plus(D(unitCost).times(qty)).dividedBy(onHand + qty)) : round2(unitCost);
    const rows = await tx.$queryRaw<Row[]>`
      UPDATE products
         SET stock_on_hand = stock_on_hand + ${qty},
             cost_price = ${avg.toString()}::numeric,
             initial_copies = COALESCE(initial_copies, 0) + ${qty},
             updated_at = now()
       WHERE id = ${productId}::uuid
   RETURNING id, title, stock_on_hand, stock_reserved, low_stock_threshold`;
    await this.log(tx, rows[0], 'PURCHASE_RECEIPT', qty, 0, ctx, D(unitCost));
    return { stockOnHand: rows[0].stock_on_hand, costPrice: avg };
  }

  /** Manual count correction to an absolute on-hand figure. */
  async setOnHand(tx: Tx, productId: string, onHand: number, ctx: StockContext & { type?: StockMovementType }) {
    if (onHand < 0) throw new BusinessRuleError('stock.negative', 'স্টক ঋণাত্মক হতে পারে না');
    const cur = await tx.$queryRaw<Row[]>`SELECT id, title, stock_on_hand, stock_reserved, low_stock_threshold FROM products WHERE id = ${productId}::uuid FOR UPDATE`;
    if (!cur.length) throw new NotFoundError('Product', productId);
    const delta = onHand - cur[0].stock_on_hand;
    if (delta === 0) return cur[0];
    if (onHand < cur[0].stock_reserved) {
      throw new BusinessRuleError('stock.below_reserved', `চলমান অর্ডারে ${cur[0].stock_reserved}টি আটকানো — এর কম করা যাবে না`);
    }
    const rows = await tx.$queryRaw<Row[]>`
      UPDATE products SET stock_on_hand = ${onHand}, updated_at = now() WHERE id = ${productId}::uuid
   RETURNING id, title, stock_on_hand, stock_reserved, low_stock_threshold`;
    await this.log(tx, rows[0], ctx.type ?? 'ADJUSTMENT', delta, 0, ctx);
    return rows[0];
  }

  // ─── internals ───

  private merge(lines: StockLine[]): StockLine[] {
    const map = new Map<string, number>();
    for (const l of lines) {
      if (!Number.isInteger(l.qty) || l.qty <= 0) throw new BusinessRuleError('stock.qty_invalid', 'কপি সংখ্যা সঠিক নয়');
      map.set(l.productId, (map.get(l.productId) ?? 0) + l.qty);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([productId, qty]) => ({ productId, qty }));
  }

  private lowHit(r: Row): LowStockHit | null {
    const threshold = r.low_stock_threshold ?? DEFAULT_LOW;
    return r.stock_on_hand <= threshold ? { productId: r.id, title: r.title, stockOnHand: r.stock_on_hand, threshold } : null;
  }

  private async log(tx: Tx, r: Row, type: StockMovementType, onHandDelta: number, reservedDelta: number, ctx: StockContext, unitCost?: Prisma.Decimal) {
    await tx.stockMovement.create({
      data: {
        productId: r.id,
        type,
        qtyOnHandDelta: onHandDelta,
        qtyReservedDelta: reservedDelta,
        unitCost,
        balanceAfter: r.stock_on_hand,
        orderId: ctx.orderId,
        purchaseId: ctx.purchaseId,
        createdById: ctx.actorId ?? null,
        note: ctx.note,
      },
    });
    this.metrics.count(this.metrics.stockMovements, { type });
  }
}
