import { Injectable } from '@nestjs/common';
import { toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { toProductCard, type NextDeal, type ProductCard } from '../mappers/product.mapper';
import { productCardInclude, type ProductCardRow } from './product-includes';

/** How far ahead an upcoming ("আসছে") deal is announced on cards. */
export const UPCOMING_DAYS = 7;

/** Hydrate ordered ids (from ProductListRepository) into cards, keeping the order. */
@Injectable()
export class ProductCardLoader {
  constructor(private readonly prisma: PrismaService) {}

  async rows(ids: string[], now = new Date()): Promise<ProductCardRow[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: productCardInclude(now) });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ProductCardRow => !!r);
  }

  async cards(ids: string[], now = new Date()): Promise<ProductCard[]> {
    return this.withNextDeal((await this.rows(ids, now)).map((r) => toProductCard(r, now)), now);
  }

  /** The soonest scheduled (not yet started) deal per product within UPCOMING_DAYS. */
  async nextDeals(productIds: string[], now = new Date()): Promise<Map<string, NextDeal>> {
    const out = new Map<string, NextDeal>();
    if (!productIds.length) return out;
    const until = new Date(now.getTime() + UPCOMING_DAYS * 86_400_000);
    const deals = await this.prisma.productDeal.findMany({
      where: { productId: { in: productIds }, cancelledAt: null, startsAt: { gt: now, lte: until } },
      orderBy: { startsAt: 'asc' },
      select: { productId: true, dealPrice: true, startsAt: true, endsAt: true, product: { select: { price: true } } },
    });
    for (const d of deals) {
      if (out.has(d.productId) || !d.dealPrice.lessThan(d.product.price)) continue;
      out.set(d.productId, { dealPrice: toNumber(d.dealPrice), startsAt: d.startsAt.toISOString(), endsAt: d.endsAt.toISOString() });
    }
    return out;
  }

  /** Attach `nextDeal` to any card-like objects (lists, related, author pages…). */
  async withNextDeal<T extends { id: string }>(cards: T[], now = new Date()): Promise<(T & { nextDeal: NextDeal | null })[]> {
    const next = await this.nextDeals(cards.map((c) => c.id), now);
    return cards.map((c) => ({ ...c, nextDeal: next.get(c.id) ?? null }));
  }
}
