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
import type { StockAdjustDto, StockMovementsQueryDto } from '../dto/product-ops.dto';
import { StockWriter } from './stock-writer';

/** স্টক ইতিহাস + manual count corrections for one product. */
@Injectable()
export class ProductStockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockWriter,
    private readonly stockEvents: StockEventsService,
    private readonly audit: AuditService,
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
}
