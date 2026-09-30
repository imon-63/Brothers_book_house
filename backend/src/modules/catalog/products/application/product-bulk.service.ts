import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { toNumber } from '@/common/utils/money';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { bulkAdjustedPrice, compareAtForDiscount, normaliseCompareAt } from '../../domain/pricing';
import { StockEventsService, type StockChange } from '../../shared/stock-events.service';
import type { BulkDiscountDto, BulkFreeShippingDto, BulkIdsDto, BulkMoveDto, BulkPriceDto, BulkRestockDto } from '../dto/product-ops.dto';
import { ProductGuards } from './product-guards';
import { StockWriter } from './stock-writer';

export type BulkResult = { ok: true; count: number };

/**
 * Admin bulk actions over selected products. Each action is one transaction:
 * all rows change or none. One summary audit row carries per-product diffs.
 */
@Injectable()
export class ProductBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guards: ProductGuards,
    private readonly stock: StockWriter,
    private readonly stockEvents: StockEventsService,
    private readonly audit: AuditService,
  ) {}

  /** ±N% rounded to the nearest ৳5; a struck price that is no longer above the price is dropped. */
  @Traced('catalog.bulk.price')
  async price(dto: BulkPriceDto, actor: AuthUser): Promise<BulkResult> {
    return this.prisma.tx(async (tx) => {
      const rows = await this.load(tx, dto.ids);
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const p of rows) {
        const price = bulkAdjustedPrice(p.price, dto.percent, dto.direction);
        const compareAtPrice = normaliseCompareAt(price, p.compareAtPrice);
        await tx.product.update({ where: { id: p.id }, data: { price, compareAtPrice, version: { increment: 1 } } });
        const reason = `বাল্ক ${dto.direction === 'up' ? '+' : '−'}${dto.percent}%`;
        await this.guards.priceHistory(tx, p.id, p, { price, compareAtPrice, costPrice: p.costPrice }, actor.id, reason);
        before[p.id] = { price: toNumber(p.price), compareAtPrice: p.compareAtPrice ? toNumber(p.compareAtPrice) : null };
        after[p.id] = { price: toNumber(price), compareAtPrice: compareAtPrice ? toNumber(compareAtPrice) : null };
      }
      await this.record(tx, actor, `${rows.length}টির দাম ${dto.percent}% ${dto.direction === 'up' ? 'বাড়ানো' : 'কমানো'} হলো (নিকটতম ৳৫)`, before, after);
      return { ok: true, count: rows.length };
    });
  }

  /** Show N% off by setting the struck price from the current price; 0 removes it. */
  @Traced('catalog.bulk.discount')
  async discount(dto: BulkDiscountDto, actor: AuthUser): Promise<BulkResult> {
    return this.prisma.tx(async (tx) => {
      const rows = await this.load(tx, dto.ids);
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const p of rows) {
        const compareAtPrice = compareAtForDiscount(p.price, dto.percent);
        await tx.product.update({ where: { id: p.id }, data: { compareAtPrice, version: { increment: 1 } } });
        await this.guards.priceHistory(tx, p.id, p, { price: p.price, compareAtPrice, costPrice: p.costPrice }, actor.id, `বাল্ক ছাড় ${dto.percent}%`);
        before[p.id] = p.compareAtPrice ? toNumber(p.compareAtPrice) : null;
        after[p.id] = compareAtPrice ? toNumber(compareAtPrice) : null;
      }
      await this.record(tx, actor, dto.percent ? `${rows.length}টিতে ${dto.percent}% ছাড় দেখানো হচ্ছে` : `${rows.length}টির ছাড় সরানো হলো`, before, after);
      return { ok: true, count: rows.length };
    });
  }

  /** +N units each through the inventory ledger (ADJUSTMENT). */
  @Traced('catalog.bulk.restock')
  async restock(dto: BulkRestockDto, actor: AuthUser): Promise<BulkResult> {
    const changes: StockChange[] = [];
    const count = await this.prisma.tx(async (tx) => {
      const rows = await this.load(tx, [...dto.ids].sort()); // id order → no deadlocks with concurrent orders
      for (const p of rows) {
        changes.push(await this.stock.add(tx, p.id, dto.units, { actorId: actor.id, note: dto.note ?? 'বাল্ক রিস্টক' }));
      }
      const after = Object.fromEntries(changes.map((c) => [c.productId, { from: c.before, to: c.after }]));
      await this.record(tx, actor, `${rows.length}টিতে +${dto.units} ইউনিট যোগ হলো`, {}, after, 'inventory');
      return rows.length;
    });
    this.stockEvents.publish(changes);
    return { ok: true, count };
  }

  @Traced('catalog.bulk.free_shipping')
  async freeShipping(dto: BulkFreeShippingDto, actor: AuthUser): Promise<BulkResult> {
    return this.prisma.tx(async (tx) => {
      const rows = await this.load(tx, dto.ids);
      await tx.product.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { freeShipping: dto.freeShipping, version: { increment: 1 } } });
      await this.record(
        tx,
        actor,
        `${rows.length}টিতে ফ্রি ডেলিভারি ${dto.freeShipping ? 'চালু' : 'বন্ধ'}`,
        Object.fromEntries(rows.map((r) => [r.id, r.freeShipping])),
        Object.fromEntries(rows.map((r) => [r.id, dto.freeShipping])),
      );
      return { ok: true, count: rows.length };
    });
  }

  @Traced('catalog.bulk.move')
  async move(dto: BulkMoveDto, actor: AuthUser): Promise<BulkResult> {
    return this.prisma.tx(async (tx) => {
      const place = await this.guards.placement(tx, dto.categoryId, dto.subcategoryId);
      const rows = await this.load(tx, dto.ids);
      await tx.product.updateMany({
        where: { id: { in: rows.map((r) => r.id) } },
        data: { sectionId: place.sectionId, categoryId: place.categoryId, subcategoryId: place.subcategoryId, version: { increment: 1 } },
      });
      const target = await tx.category.findMany({ where: { id: { in: [place.categoryId, place.subcategoryId].filter((x): x is string => !!x) } }, select: { id: true, nameBn: true } });
      const label = [place.categoryId, place.subcategoryId].map((id) => target.find((t) => t.id === id)?.nameBn).filter(Boolean).join(' · ');
      await this.record(
        tx,
        actor,
        `${rows.length}টি «${label}» এ সরানো হলো`,
        Object.fromEntries(rows.map((r) => [r.id, { categoryId: r.categoryId, subcategoryId: r.subcategoryId }])),
        { categoryId: place.categoryId, subcategoryId: place.subcategoryId },
      );
      return { ok: true, count: rows.length };
    });
  }

  @Traced('catalog.bulk.delete')
  async remove(dto: BulkIdsDto, actor: AuthUser): Promise<BulkResult> {
    return this.prisma.tx(async (tx) => {
      const rows = await this.load(tx, dto.ids);
      await tx.product.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await this.audit.record(
        {
          actor,
          action: 'DELETE',
          area: 'product',
          entityType: 'Product',
          summary: `${rows.length}টি পণ্য মুছে ফেলা হয়েছে`,
          before: Object.fromEntries(rows.map((r) => [r.id, r.title])) as Prisma.InputJsonValue,
        },
        tx,
      );
      return { ok: true, count: rows.length };
    });
  }

  private async load(tx: Tx, ids: string[]) {
    const rows = await tx.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, title: true, price: true, compareAtPrice: true, costPrice: true, freeShipping: true, categoryId: true, subcategoryId: true },
    });
    if (rows.length !== ids.length) {
      const found = new Set(rows.map((r) => r.id));
      throw new NotFoundError('Product', ids.find((id) => !found.has(id)));
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    return rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  private record(tx: Tx, actor: AuthUser, summary: string, before: Record<string, unknown>, after: Record<string, unknown>, area: 'product' | 'inventory' = 'product') {
    return this.audit.record(
      { actor, action: 'UPDATE', area, entityType: 'Product', summary, before: before as Prisma.InputJsonValue, after: after as Prisma.InputJsonValue },
      tx,
    );
  }
}
