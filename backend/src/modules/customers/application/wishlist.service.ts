import { Injectable, Logger } from '@nestjs/common';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { toNumber } from '@/common/utils/money';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { OutboxService } from '@/platform/outbox/outbox.service';
import { bundleStock, productStock } from '../domain/stock-status';
import type { AddWishlistDto } from '../dto/me.dto';
import { MeService } from './me.service';

const MAX_ITEMS = 100;
const stockSelect = { trackInventory: true, allowBackorder: true, stockOnHand: true, stockReserved: true, lowStockThreshold: true } as const;

/** ভবিষ্যৎ অর্ডার — "tell me when it's back" list, with live stock. */
@Injectable()
export class WishlistService {
  private readonly logger = new Logger(WishlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
    private readonly outbox: OutboxService,
  ) {}

  async list(user: AuthUser) {
    const customerId = await this.me.customerId(user);
    const rows = await this.prisma.wishlistItem.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, slug: true, title: true, subtitle: true, price: true, compareAtPrice: true, status: true, deletedAt: true, coverColor: true, ...stockSelect, images: { where: { isPrimary: true }, take: 1, select: { media: { select: { url: true } } } } } },
        bundle: { select: { id: true, slug: true, title: true, price: true, status: true, deletedAt: true, cover: { select: { url: true } }, items: { select: { quantity: true, product: { select: stockSelect } } } } },
      },
    });
    return rows.map((w) => {
      const target = w.product ?? w.bundle;
      const gone = !target || target.deletedAt !== null || target.status !== 'ACTIVE';
      const stock = gone ? { state: 'unavailable' as const, available: 0 } : w.product ? productStock(w.product) : bundleStock(w.bundle!.items);
      return {
        id: w.id,
        kind: w.productId ? 'product' : 'bundle',
        refId: w.productId ?? w.bundleId,
        slug: target?.slug ?? null,
        title: target?.title ?? '',
        subtitle: w.product?.subtitle ?? null,
        imageUrl: w.product?.images[0]?.media.url ?? w.bundle?.cover?.url ?? null,
        coverColor: w.product?.coverColor ?? null,
        price: toNumber(target?.price),
        stock,
        canOrder: stock.state === 'in_stock' || stock.state === 'low',
        notifyOnRestock: w.notifyOnRestock,
        notifiedAt: w.notifiedAt,
        createdAt: w.createdAt,
      };
    });
  }

  @Traced('wishlist.add')
  async add(user: AuthUser, dto: AddWishlistDto) {
    if (!!dto.productId === !!dto.bundleId) throw new BusinessRuleError('wishlist.target_invalid', 'একটি পণ্য অথবা একটি প্যাকেজ বেছে নিন');
    const customerId = await this.me.customerId(user);
    const target = dto.productId
      ? await this.prisma.product.findFirst({ where: { id: dto.productId, deletedAt: null }, select: { id: true } })
      : await this.prisma.bundle.findFirst({ where: { id: dto.bundleId, deletedAt: null }, select: { id: true } });
    if (!target) throw new NotFoundError(dto.productId ? 'Product' : 'Bundle', dto.productId ?? dto.bundleId);

    await this.prisma.tx(async (tx) => {
      const where = dto.productId ? { customerId, productId: dto.productId } : { customerId, bundleId: dto.bundleId };
      const existing = await tx.wishlistItem.findFirst({ where });
      if (existing && !existing.notifiedAt) {
        await tx.wishlistItem.update({ where: { id: existing.id }, data: { notifyOnRestock: dto.notifyOnRestock ?? true } });
        return;
      }
      // Re-adding after a restock alert starts a fresh watch (new id → new SMS dedupe key).
      if (existing) await tx.wishlistItem.delete({ where: { id: existing.id } });
      else if ((await tx.wishlistItem.count({ where: { customerId } })) >= MAX_ITEMS) {
        throw new BusinessRuleError('wishlist.limit', `সর্বোচ্চ ${MAX_ITEMS}টি পণ্য রাখা যায়`);
      }
      await tx.wishlistItem.create({ data: { ...where, notifyOnRestock: dto.notifyOnRestock ?? true } });
      if (dto.productId) await this.syncCount(tx, dto.productId);
    });
    return this.list(user);
  }

  async remove(user: AuthUser, id: string) {
    const customerId = await this.me.customerId(user);
    await this.prisma.tx(async (tx) => {
      const w = await tx.wishlistItem.findFirst({ where: { id, customerId } });
      if (!w) throw new NotFoundError('WishlistItem', id);
      await tx.wishlistItem.delete({ where: { id } });
      if (w.productId) await this.syncCount(tx, w.productId);
    });
  }

  /**
   * A product came back: SMS every watcher of it (and of bundles that are now
   * complete again). Claiming rows with `notifiedAt = null` in the same tx as
   * the outbox insert + per-item dedupe key makes replays harmless.
   */
  @Traced('wishlist.notify_restocked')
  async notifyRestocked(productId: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true, title: true, slug: true, status: true, deletedAt: true, ...stockSelect } });
    if (!product || product.deletedAt || product.status !== 'ACTIVE') return 0;

    const candidates: { id: string; title: string; slug: string; kind: 'product' | 'bundle' }[] = [];
    if (productStock(product).state !== 'out_of_stock') {
      const items = await this.prisma.wishlistItem.findMany({ where: { productId, notifyOnRestock: true, notifiedAt: null }, select: { id: true } });
      candidates.push(...items.map((i) => ({ id: i.id, title: product.title, slug: product.slug, kind: 'product' as const })));
    }
    const bundles = await this.prisma.bundle.findMany({
      where: { deletedAt: null, status: 'ACTIVE', items: { some: { productId } }, wishlist: { some: { notifyOnRestock: true, notifiedAt: null } } },
      select: { id: true, title: true, slug: true, items: { select: { quantity: true, product: { select: stockSelect } } } },
    });
    for (const b of bundles) {
      if (bundleStock(b.items).state === 'out_of_stock') continue;
      const items = await this.prisma.wishlistItem.findMany({ where: { bundleId: b.id, notifyOnRestock: true, notifiedAt: null }, select: { id: true } });
      candidates.push(...items.map((i) => ({ id: i.id, title: b.title, slug: b.slug, kind: 'bundle' as const })));
    }

    let sent = 0;
    for (const c of candidates) {
      try {
        const ok = await this.prisma.tx(async (tx) => {
          const claimed = await tx.wishlistItem.updateMany({ where: { id: c.id, notifiedAt: null }, data: { notifiedAt: new Date() } });
          if (!claimed.count) return false;
          const w = await tx.wishlistItem.findUniqueOrThrow({ where: { id: c.id }, select: { customer: { select: { name: true, phone: true, isBlocked: true, deletedAt: true } } } });
          if (w.customer.isBlocked || w.customer.deletedAt) return false;
          await this.outbox.enqueue(
            {
              channel: 'SMS',
              recipient: w.customer.phone,
              template: 'wishlist.restocked',
              payload: { name: w.customer.name, title: c.title, slug: c.slug, kind: c.kind },
              dedupeKey: `wishlist-restock:${c.id}`,
            },
            tx,
          );
          return true;
        });
        if (ok) sent += 1;
      } catch (err) {
        this.logger.error({ err, wishlistItemId: c.id }, 'Restock notification failed');
      }
    }
    return sent;
  }

  private syncCount(tx: Tx, productId: string) {
    return tx.$executeRaw`UPDATE products SET wishlist_count = (SELECT count(*) FROM wishlist_items WHERE product_id = ${productId}::uuid) WHERE id = ${productId}::uuid`;
  }
}
