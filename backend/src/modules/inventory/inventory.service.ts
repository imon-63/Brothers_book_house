import { Injectable } from '@nestjs/common';
import { Prisma, type StockMovementType } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import { D, round2, type MoneyLike } from '@/common/utils/money';
import type { Tx } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';

export type StockLine = { productId: string; qty: number };
export type StockContext = { orderId?: string; purchaseId?: string; actorId?: string | null; note?: string };
export type LowStockHit = { productId: string; title: string; stockOnHand: number; threshold: number };
export type LotSource = 'OPENING' | 'PURCHASE' | 'RESTOCK' | 'RETURN' | 'ADJUST';

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
      const used = await this.consume(tx, l.productId, l.qty, ctx.orderId ?? null);
      if (ctx.orderId) await this.stampOrderCost(tx, ctx.orderId, l.productId, used);
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
      if (rows.length) {
        await this.log(tx, rows[0], 'RETURN_RESTOCK', l.qty, 0, ctx);
        await this.unconsume(tx, l.productId, l.qty, ctx);
      }
    }
  }

  /**
   * Goods received from a supplier: a new batch at this purchase's cost. The
   * product's cost price becomes the average of what is still on the shelf.
   */
  async receive(tx: Tx, productId: string, qty: number, unitCost: MoneyLike, ctx: StockContext) {
    return this.addBatch(tx, productId, qty, { unitCost, source: 'PURCHASE' }, ctx);
  }

  /**
   * +qty copies as one batch with its own কেনা দাম (and optionally the selling
   * price they arrived at). Used by purchases and the admin "নতুন স্টক" form.
   */
  async addBatch(
    tx: Tx,
    productId: string,
    qty: number,
    batch: { unitCost?: MoneyLike | null; salePrice?: MoneyLike | null; source: LotSource; receivedAt?: Date },
    ctx: StockContext,
  ) {
    if (!Number.isInteger(qty) || qty <= 0) throw new BusinessRuleError('stock.qty_invalid', 'কপি সংখ্যা শূন্যের বেশি দিন');
    const cur = await tx.product.findUnique({ where: { id: productId }, select: { price: true, costPrice: true } });
    if (!cur) throw new NotFoundError('Product', productId);
    const rows = await tx.$queryRaw<Row[]>`
      UPDATE products
         SET stock_on_hand = stock_on_hand + ${qty},
             initial_copies = COALESCE(initial_copies, 0) + ${qty},
             updated_at = now()
       WHERE id = ${productId}::uuid
   RETURNING id, title, stock_on_hand, stock_reserved, low_stock_threshold`;
    const cost = batch.unitCost != null ? round2(batch.unitCost) : cur.costPrice;
    await this.log(tx, rows[0], 'PURCHASE_RECEIPT', qty, 0, ctx, cost ?? undefined);
    const lot = await tx.stockLot.create({
      data: {
        productId, source: batch.source, qtyIn: qty, qtyLeft: qty,
        unitCost: cost, salePrice: batch.salePrice != null ? round2(batch.salePrice) : cur.price,
        purchaseId: ctx.purchaseId, note: ctx.note, createdById: ctx.actorId ?? null, receivedAt: batch.receivedAt,
      },
    });
    const costPrice = await this.refreshCost(tx, productId);
    return { stockOnHand: rows[0].stock_on_hand, costPrice, lotId: lot.id };
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
    if (delta > 0) {
      const p = await tx.product.findUnique({ where: { id: productId }, select: { price: true, costPrice: true } });
      await tx.stockLot.create({
        data: {
          productId, source: ctx.type === 'OPENING' ? 'OPENING' : 'ADJUST', qtyIn: delta, qtyLeft: delta,
          unitCost: p?.costPrice ?? null, salePrice: p?.price ?? null, note: ctx.note, createdById: ctx.actorId ?? null,
        },
      });
    } else {
      await this.consume(tx, productId, -delta, null);
    }
    await this.refreshCost(tx, productId);
    return rows[0];
  }

  // ─── batches (FIFO) ───

  /** Take qty from the oldest batches first. Returns what was used, at what cost. */
  private async consume(tx: Tx, productId: string, qty: number, orderId: string | null) {
    const lots = await tx.$queryRaw<{ id: string; qty_left: number; unit_cost: Prisma.Decimal | null }[]>`
      SELECT id, qty_left, unit_cost FROM stock_lots
       WHERE product_id = ${productId}::uuid AND qty_left > 0
       ORDER BY received_at, created_at, id
         FOR UPDATE`;
    const used: { lotId: string; qty: number; unitCost: Prisma.Decimal | null }[] = [];
    let need = qty;
    for (const lot of lots) {
      if (need <= 0) break;
      const take = Math.min(need, lot.qty_left);
      await tx.$executeRaw`UPDATE stock_lots SET qty_left = qty_left - ${take} WHERE id = ${lot.id}::uuid`;
      if (orderId) {
        await tx.stockLotConsumption.create({ data: { lotId: lot.id, productId, orderId, qty: take, unitCost: lot.unit_cost } });
      }
      used.push({ lotId: lot.id, qty: take, unitCost: lot.unit_cost });
      need -= take;
    }
    // shelf had more than the batches knew about (backorder / old data): cost at today's price
    if (need > 0) {
      const p = await tx.product.findUnique({ where: { id: productId }, select: { costPrice: true } });
      used.push({ lotId: '', qty: need, unitCost: p?.costPrice ?? null });
    }
    await this.refreshCost(tx, productId);
    return used;
  }

  /** A returned order: copies go back into the batches they left from (newest first). */
  private async unconsume(tx: Tx, productId: string, qty: number, ctx: StockContext) {
    let left = qty;
    if (ctx.orderId) {
      const uses = await tx.stockLotConsumption.findMany({
        where: { orderId: ctx.orderId, productId },
        orderBy: { createdAt: 'desc' },
      });
      for (const u of uses) {
        if (left <= 0) break;
        const back = Math.min(left, u.qty - u.returned);
        if (back <= 0) continue;
        await tx.stockLotConsumption.update({ where: { id: u.id }, data: { returned: { increment: back } } });
        await tx.$executeRaw`UPDATE stock_lots SET qty_left = LEAST(qty_left + ${back}, qty_in) WHERE id = ${u.lotId}::uuid`;
        left -= back;
      }
    }
    if (left > 0) {
      const p = await tx.product.findUnique({ where: { id: productId }, select: { price: true, costPrice: true } });
      await tx.stockLot.create({
        data: { productId, source: 'RETURN', qtyIn: left, qtyLeft: left, unitCost: p?.costPrice ?? null, salePrice: p?.price ?? null, note: ctx.note, createdById: ctx.actorId ?? null },
      });
    }
    await this.refreshCost(tx, productId);
  }

  /** Real (FIFO) cost of what left the shelf → the order's lines, so P&L is exact. */
  private async stampOrderCost(tx: Tx, orderId: string, productId: string, used: { qty: number; unitCost: Prisma.Decimal | null }[]) {
    if (!used.length || used.some((u) => u.unitCost == null)) return;
    const units = used.reduce((n, u) => n + u.qty, 0);
    const avg = round2(used.reduce((s, u) => s.plus(D(u.unitCost!).times(u.qty)), D(0)).dividedBy(units));
    await tx.$executeRaw`
      UPDATE order_items SET unit_cost = ${avg.toString()}::numeric
       WHERE order_id = ${orderId}::uuid AND product_id = ${productId}::uuid AND kind = 'PRODUCT'`;
    await tx.$executeRaw`
      UPDATE order_item_components oc SET unit_cost = ${avg.toString()}::numeric
        FROM order_items oi
       WHERE oc.order_item_id = oi.id AND oi.order_id = ${orderId}::uuid AND oc.product_id = ${productId}::uuid`;
  }

  /** Cost price shown everywhere = average cost of copies still on the shelf (unchanged when the shelf is empty). */
  private async refreshCost(tx: Tx, productId: string): Promise<Prisma.Decimal | null> {
    const rows = await tx.$queryRaw<{ avg: Prisma.Decimal | null }[]>`
      SELECT round(sum(unit_cost * qty_left) / NULLIF(sum(qty_left), 0), 2) AS avg
        FROM stock_lots WHERE product_id = ${productId}::uuid AND qty_left > 0 AND unit_cost IS NOT NULL`;
    const avg = rows[0]?.avg ?? null;
    if (avg != null) await tx.$executeRaw`UPDATE products SET cost_price = ${avg.toString()}::numeric WHERE id = ${productId}::uuid`;
    else {
      const p = await tx.product.findUnique({ where: { id: productId }, select: { costPrice: true } });
      return p?.costPrice ?? null;
    }
    return avg;
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
