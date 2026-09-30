import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D, min, toNumber } from '@/common/utils/money';
import { withRetry } from '@/common/utils/retry';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { DocumentCounterService } from '@/platform/counters/document-counter.service';
import { InventoryService } from '@/modules/inventory/inventory.service';
import { CashLedgerService } from '../../cashbook/application/cash-ledger.service';
import { dayRange, parseWhen } from '../../shared/domain/dhaka-time';
import { checkPayment, mergeLines, purchaseTotals, settlementStatus } from '../domain/purchase-math';
import type { CreatePurchaseDto, PurchasePaymentDto, PurchaseQueryDto } from '../dto/purchasing.dto';
import { toPurchase } from '../mappers/purchasing.mapper';

const detailInclude = {
  supplier: { select: { id: true, name: true } },
  items: true,
  payments: {
    select: { id: true, amount: true, direction: true, occurredAt: true, memo: true, account: { select: { name: true } } },
    orderBy: { occurredAt: 'asc' },
  },
} satisfies Prisma.PurchaseInclude;

function when(input?: string) {
  const d = parseWhen(input);
  if (!d) throw new BusinessRuleError('purchase.date_invalid', 'তারিখ সঠিক নয়');
  if (d.getTime() > Date.now() + 5 * 60_000) throw new BusinessRuleError('purchase.date_future', 'ভবিষ্যতের তারিখ দেওয়া যাবে না');
  return d;
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly counters: DocumentCounterService,
    private readonly ledger: CashLedgerService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PurchaseQueryDto) {
    const where: Prisma.PurchaseWhereInput = { supplierId: q.supplierId, paymentStatus: q.paymentStatus };
    if (q.from || q.to) where.purchasedAt = { gte: q.from ? dayRange(q.from).start : undefined, lt: q.to ? dayRange(q.to).end : undefined };
    if (q.q) where.OR = [{ purchaseNo: { contains: q.q, mode: 'insensitive' } }, { invoiceRef: { contains: q.q, mode: 'insensitive' } }, { supplier: { name: { contains: q.q, mode: 'insensitive' } } }];
    const [rows, total] = await Promise.all([
      this.prisma.purchase.findMany({ where, include: { supplier: { select: { id: true, name: true } }, items: true }, orderBy: [{ purchasedAt: q.order }, { createdAt: q.order }], ...skipTake(q) }),
      this.prisma.purchase.count({ where }),
    ]);
    return toPage(rows.map(toPurchase), total, q);
  }

  async get(id: string) {
    const p = await this.prisma.purchase.findUnique({ where: { id }, include: detailInclude });
    if (!p) throw new NotFoundError('Purchase', id);
    return toPurchase(p);
  }

  /**
   * ক্রয় বিল: one transaction → purchase no. (counter), bill + lines, stock in
   * via InventoryService.receive (weighted-average cost), optional payment now
   * (cash OUT PURCHASE_PAYMENT), audit.
   */
  @Traced('finance.purchase.create')
  async create(dto: CreatePurchaseDto, actor: AuthUser) {
    const purchasedAt = when(dto.purchasedAt);
    const lines = mergeLines(dto.lines);
    const totals = purchaseTotals(lines, dto.otherCharges ?? 0);

    const created = await withRetry(() =>
      this.prisma.tx(async (tx) => {
        const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId, deletedAt: null }, select: { id: true, name: true } });
        if (!supplier) throw new NotFoundError('Supplier', dto.supplierId);
        const products = await tx.product.findMany({ where: { id: { in: lines.map((l) => l.productId) }, deletedAt: null }, select: { id: true, title: true } });
        const title = new Map(products.map((p) => [p.id, p.title]));
        const missing = lines.find((l) => !title.has(l.productId));
        if (missing) throw new NotFoundError('Product', missing.productId);

        const paid = dto.payment ? D(dto.payment.amount ?? totals.total) : D(0);
        if (paid.greaterThan(totals.total)) throw new BusinessRuleError('purchase.overpayment', 'বিলের চেয়ে বেশি পরিশোধ দেখানো যাবে না');

        const purchaseNo = await this.counters.next(tx, 'purchase');
        const purchase = await tx.purchase.create({
          data: {
            purchaseNo,
            supplierId: supplier.id,
            status: 'RECEIVED',
            paymentStatus: settlementStatus(totals.total, paid),
            subtotal: totals.subtotal,
            otherCharges: totals.otherCharges,
            total: totals.total,
            amountPaid: paid,
            invoiceRef: dto.invoiceRef ?? null,
            note: dto.note ?? null,
            purchasedAt,
            receivedAt: purchasedAt,
            createdById: actor.id,
            items: {
              create: totals.lines.map((l) => ({ productId: l.productId, title: title.get(l.productId)!, quantity: l.quantity, unitCost: l.unitCost, lineTotal: l.lineTotal })),
            },
          },
        });
        for (const l of totals.lines) {
          await this.inventory.receive(tx, l.productId, l.quantity, l.unitCost, { purchaseId: purchase.id, actorId: actor.id, note: `ক্রয় ${purchaseNo}` });
        }
        if (dto.payment && paid.greaterThan(0)) {
          await this.ledger.post(tx, {
            accountId: dto.payment.accountId,
            direction: 'OUT',
            kind: 'PURCHASE_PAYMENT',
            amount: paid,
            memo: `ক্রয় ${purchaseNo} · ${supplier.name}`,
            purchaseId: purchase.id,
            occurredAt: purchasedAt,
            actorId: actor.id,
          });
        }
        await this.audit.record(
          {
            actor,
            action: 'CREATE',
            area: 'finance',
            entityType: 'Purchase',
            entityId: purchase.id,
            summary: `ক্রয় বিল ${purchaseNo} · ${supplier.name} · ৳${toNumber(totals.total)} · ${paid.greaterThan(0) ? `পরিশোধ ৳${toNumber(paid)}` : 'বকেয়া'}`,
            after: { lines: totals.lines.length, total: toNumber(totals.total), paid: toNumber(paid) },
          },
          tx,
        );
        return purchase.id;
      }, { timeoutMs: 30_000 }),
    );
    return this.get(created);
  }

  /** Pay (part of) an open supplier bill later. */
  @Traced('finance.purchase.pay')
  async pay(id: string, dto: PurchasePaymentDto, actor: AuthUser) {
    const occurredAt = when(dto.occurredAt);
    await withRetry(() =>
      this.prisma.tx(async (tx) => {
        const [p] = await tx.$queryRaw<{ id: string; purchase_no: string; total: Prisma.Decimal; amount_paid: Prisma.Decimal; status: string }[]>`
          SELECT id, purchase_no, total, amount_paid, status::text AS status FROM purchases WHERE id = ${id}::uuid FOR UPDATE`;
        if (!p) throw new NotFoundError('Purchase', id);
        if (p.status === 'CANCELLED') throw new BusinessRuleError('purchase.cancelled', 'বাতিল বিলে পরিশোধ হয় না');
        const check = checkPayment(p.total, p.amount_paid, dto.amount);
        if (!check.ok) throw new BusinessRuleError(check.code, check.message);
        const paid = min(D(p.amount_paid).plus(dto.amount), p.total);
        await tx.purchase.update({ where: { id }, data: { amountPaid: paid, paymentStatus: settlementStatus(p.total, paid) } });
        const t = await this.ledger.post(tx, {
          accountId: dto.accountId,
          direction: 'OUT',
          kind: 'PURCHASE_PAYMENT',
          amount: dto.amount,
          memo: dto.memo?.trim() || `ক্রয় ${p.purchase_no} পরিশোধ`,
          purchaseId: id,
          occurredAt,
          actorId: actor.id,
        });
        await this.audit.record(
          { actor, action: 'UPDATE', area: 'finance', entityType: 'Purchase', entityId: id, summary: `ক্রয় ${p.purchase_no} পরিশোধ ৳${toNumber(t.amount)} (${t.account.name})`, before: { amountPaid: toNumber(p.amount_paid) }, after: { amountPaid: toNumber(paid) } },
          tx,
        );
      }),
    );
    return this.get(id);
  }
}
