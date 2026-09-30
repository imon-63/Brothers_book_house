import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { toProductCard, type ProductCard } from '../mappers/product.mapper';
import { productCardInclude, type ProductCardRow } from './product-includes';

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
    return (await this.rows(ids, now)).map((r) => toProductCard(r, now));
  }
}
