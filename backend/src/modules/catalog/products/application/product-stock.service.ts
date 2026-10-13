import { Injectable } from '@nestjs/common';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { availableUnits, stockStatus, thresholdOf } from '../../domain/stock';
import { StockEventsService } from '../../shared/stock-events.service';
import type { RestockLotDto, StockAdjustDto, StockMovementsQueryDto } from '../dto/product-ops.dto';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { StockWriter } from './stock-writer';

/** স্টক ইতিহাস + manual count corrections for one product. */
@Injectable()
export class ProductStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockWriter,
    private readonly stockEvents: StockEventsService,
    private readonly audit: AuditService,
    private readonly inventory: InventoryService,
  ) {}

  async movements(productId: string, q: StockMovementsQueryDto) {
    const p = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, title: true, stockOnHand: true, stockReserved: true, lowStockThreshold: true, trackInventory: true, allowBackorder: true, initialCopies: true },
    });
    if (!p) throw new NotFoundError('Product', productId);
    const where = { productId };
    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ createdAt: q.order === 'asc' ? 'asc' : 'desc' }, { id: q.order === 'asc' ? 'asc' : 'desc' }],
        ...skipTake(q),
        include: { createdBy: { select: { id: true, name: true } }, order: { select: { id: true, orderNo: true } } },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);
    return {
      product: {
        id: p.id,
        title: p.title,
        onHand: p.stockOnHand,
        reserved: p.stockReserved,
        available: availableUnits(p),
        threshold: thresholdOf(p),
        initialCopies: p.initialCopies,
        status: stockStatus(p),
      },
      ...toPage(
        items.map((m) => ({
          id: m.id,
          type: m.type,
          onHandDelta: m.qtyOnHandDelta,
          reservedDelta: m.qtyReservedDelta,
          balanceAfter: m.balanceAfter,
          unitCost: m.unitCost ? toNumber(m.unitCost) : null,
          note: m.note,
          order: m.order ? { id: m.order.id, orderNo: m.order.orderNo } : null,
          purchaseId: m.purchaseId,
          createdBy: m.createdBy,
          createdAt: m.createdAt.toISOString(),
        })),
        total,
        q,
      ),
    };
  }

  @Traced('catalog.stock.adjust')
  async adjust(productId: string, dto: StockAdjustDto, actor: AuthUser) {
    const change = await this.prisma.tx(async (tx) => {
      const c = await this.stock.setOnHand(tx, productId, dto.onHand, { actorId: actor.id, note: dto.reason, type: dto.type ?? 'ADJUSTMENT' });
      if (c) {
        await this.audit.record(
          {
            actor,
            action: 'UPDATE',
            area: 'inventory',
            entityType: 'Product',
            entityId: productId,
            summary: `«${c.title}» স্টক ${c.before} → ${c.after} · ${dto.reason}`,
            before: { stockOnHand: c.before },
            after: { stockOnHand: c.after, type: dto.type ?? 'ADJUSTMENT' },
          },
          tx,
        );
      }
      return c;
    });
    if (change) this.stockEvents.publish([change]);
    return { ok: true, changed: !!change, onHand: dto.onHand };
  }

  /** স্টক লট — every batch with its own কেনা দাম, what is left, and the money tied up. */
  async lots(productId: string) {
    const p = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, title: true, price: true, costPrice: true, stockOnHand: true } });
    if (!p) throw new NotFoundError('Product', productId);
    const lots = await this.prisma.stockLot.findMany({
      where: { productId },
      orderBy: [{ receivedAt: 'desc' }, { createdAt: 'desc' }],
      include: { createdBy: { select: { id: true, name: true } }, purchase: { select: { id: true, purchaseNo: true } }, _count: { select: { uses: true } } },
    });
    const live = lots.filter((l) => l.qtyLeft > 0);
    const costs = live.map((l) => (l.unitCost != null ? toNumber(l.unitCost) : null)).filter((c): c is number => c != null);
    const value = live.reduce((s, l) => s + (l.unitCost != null ? toNumber(l.unitCost) * l.qtyLeft : 0), 0);
    const left = live.reduce((n, l) => n + l.qtyLeft, 0);
    const price = toNumber(p.price);
    return {
      product: { id: p.id, title: p.title, price, costPrice: p.costPrice ? toNumber(p.costPrice) : null, onHand: p.stockOnHand },
      summary: {
        batches: live.length,
        unitsInBatches: left,
        untracked: Math.max(0, p.stockOnHand - left),
        stockValue: Math.round(value * 100) / 100,
        retailValue: Math.round(price * p.stockOnHand * 100) / 100,
        avgCost: left && costs.length ? Math.round((value / left) * 100) / 100 : null,
        minCost: costs.length ? Math.min(...costs) : null,
        maxCost: costs.length ? Math.max(...costs) : null,
        mixedCost: new Set(costs).size > 1,
      },
      items: lots.map((l) => {
        const cost = l.unitCost != null ? toNumber(l.unitCost) : null;
        return {
          id: l.id,
          source: l.source,
          unitCost: cost,
          salePrice: l.salePrice != null ? toNumber(l.salePrice) : null,
          qtyIn: l.qtyIn,
          qtyLeft: l.qtyLeft,
          sold: l.qtyIn - l.qtyLeft,
          value: cost != null ? Math.round(cost * l.qtyLeft * 100) / 100 : null,
          marginNow: cost != null && price > 0 ? Math.round(((price - cost) / price) * 100) : null,
          note: l.note,
          purchase: l.purchase,
          createdBy: l.createdBy,
          receivedAt: l.receivedAt.toISOString(),
        };
      }),
    };
  }

  /** নতুন স্টক at a new কেনা দাম (and optionally a new selling price). */
  @Traced('catalog.stock.restock_lot')
  async restockLot(productId: string, dto: RestockLotDto, actor: AuthUser) {
    const res = await this.prisma.tx(async (tx) => {
      const before = await tx.product.findFirst({ where: { id: productId, deletedAt: null }, select: { title: true, price: true, stockOnHand: true, lowStockThreshold: true, costPrice: true } });
      if (!before) throw new NotFoundError('Product', productId);
      const changePrice = dto.salePrice != null && toNumber(before.price) !== dto.salePrice;
      if (changePrice) {
        await tx.product.update({ where: { id: productId }, data: { price: dto.salePrice } });
        await tx.productPriceHistory.create({ data: { productId, price: dto.salePrice!, compareAtPrice: null, costPrice: dto.unitCost, changedById: actor.id, reason: 'রিস্টক · নতুন দাম' } }).catch(() => undefined);
      }
      const r = await this.inventory.addBatch(tx, productId, dto.qty, { unitCost: dto.unitCost, salePrice: dto.salePrice ?? before.price, source: 'RESTOCK' }, { actorId: actor.id, note: dto.note || 'রিস্টক' });
      await this.audit.record(
        {
          actor, action: 'UPDATE', area: 'inventory', entityType: 'Product', entityId: productId,
          summary: `«${before.title}» +${dto.qty} কপি · কেনা ৳${dto.unitCost}${changePrice ? ` · দাম ৳${toNumber(before.price)} → ৳${dto.salePrice}` : ''}`,
          before: { stockOnHand: before.stockOnHand, price: toNumber(before.price), costPrice: before.costPrice ? toNumber(before.costPrice) : null },
          after: { stockOnHand: r.stockOnHand, price: dto.salePrice ?? toNumber(before.price), costPrice: r.costPrice ? toNumber(r.costPrice) : null, lotId: r.lotId },
        },
        tx,
      );
      return { before, after: r.stockOnHand };
    });
    this.stockEvents.publish([{ productId, title: res.before.title, before: res.before.stockOnHand, after: res.after, threshold: thresholdOf(res.before) }]);
    return this.lots(productId);
  }
}
