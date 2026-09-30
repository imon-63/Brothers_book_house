import { Injectable, Logger } from '@nestjs/common';
import type { FinancialDocument, OrderStatus, Prisma } from '@prisma/client';
import { D } from '@/common/utils/money';
import { withRetry } from '@/common/utils/retry';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { DocumentCounterService } from '@/platform/counters/document-counter.service';
import { CashLedgerService } from '../../cashbook/application/cash-ledger.service';
import { FinanceSettings } from '../../shared/application/finance-settings.service';
import { lockOrderBooks } from '../../shared/application/order-books-lock';
import { isEmptyPlan, planBooks } from '../domain/document-policy';
import { addressLine, buildLines, gatewayFeeFor, PAYMENT_LABEL, type SnapshotItem } from '../domain/document-snapshot';

export type SyncHint = {
  from?: OrderStatus;
  credit?: { reason: string; courierLoss: string };
  actorId?: string | null;
};

export type SyncResult = { issued: { id: string; docNo: string; kind: string }[]; codCashIn: boolean };

const orderInclude = {
  items: { include: { components: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderInclude;

/**
 * Brings an order's papers (and COD cash-in) up to date with its current
 * state. Safe to call any number of times, concurrently, from any event:
 * a per-order advisory lock serialises callers and the state-based policy
 * (domain/document-policy.ts) never issues a paper that already exists.
 */
@Injectable()
export class DocumentIssuerService {
  private readonly logger = new Logger(DocumentIssuerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counters: DocumentCounterService,
    private readonly ledger: CashLedgerService,
    private readonly settings: FinanceSettings,
    private readonly audit: AuditService,
  ) {}

  @Traced('finance.documents.sync')
  sync(orderId: string, hint: SyncHint = {}): Promise<SyncResult> {
    return withRetry(() => this.prisma.tx((tx) => this.syncIn(tx, orderId, hint), { timeoutMs: 20_000 }));
  }

  private async syncIn(tx: Tx, orderId: string, hint: SyncHint): Promise<SyncResult> {
    await lockOrderBooks(tx, orderId);
    const order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!order) {
      this.logger.warn(`books sync: order ${orderId} not found`);
      return { issued: [], codCashIn: false };
    }
    const docs = await tx.financialDocument.findMany({ where: { orderId }, orderBy: { issuedAt: 'asc' } });
    const credited = new Set(docs.filter((d) => d.kind === 'CREDIT_NOTE' && d.creditsDocId).map((d) => d.creditsDocId as string));
    const liveInvoice = [...docs].reverse().find((d) => d.kind === 'INVOICE' && !credited.has(d.id)) ?? null;
    const hasReceipt = docs.some((d) => d.kind === 'RECEIPT');
    const codCashBooked = await this.ledger.has(tx, { orderId, kind: 'COD_REMITTANCE', direction: 'IN' });

    const plan = planBooks(
      {
        method: order.paymentMethod,
        status: order.status,
        cancelledFrom: order.cancelledFrom,
        paid: order.paymentStatus !== 'UNPAID',
        liveInvoice: Boolean(liveInvoice),
        receipt: hasReceipt,
        codCashBooked,
      },
      { from: hint.from },
    );
    if (isEmptyPlan(plan)) return { issued: [], codCashIn: false };

    const issued: FinancialDocument[] = [];
    const base = await this.snapshotBase(tx, order);

    if (plan.invoice) issued.push(await this.issue(tx, 'INVOICE', { ...base, issuedById: hint.actorId ?? null }));
    if (plan.receipt) issued.push(await this.issue(tx, 'RECEIPT', { ...base, issuedById: hint.actorId ?? null }));
    if (plan.credit && liveInvoice) {
      const reason = hint.credit?.reason?.trim() || order.cancelReason?.trim() || (order.status === 'RETURNED' ? 'ফেরত' : 'বাতিল');
      const loss = hint.credit ? D(hint.credit.courierLoss) : D(order.courierLoss);
      issued.push(
        await this.issue(tx, 'CREDIT_NOTE', {
          // a credit note reverses exactly what the invoice billed
          orderId,
          customerName: liveInvoice.customerName,
          customerPhone: liveInvoice.customerPhone,
          address: liveInvoice.address,
          paymentLabel: liveInvoice.paymentLabel,
          lines: liveInvoice.lines as Prisma.InputJsonValue,
          subtotal: liveInvoice.subtotal,
          couponCode: liveInvoice.couponCode,
          discount: liveInvoice.discount,
          shippingFee: liveInvoice.shippingFee,
          shippingCost: liveInvoice.shippingCost,
          gatewayFee: hasReceipt ? liveInvoice.gatewayFee : D(0),
          taxTotal: liveInvoice.taxTotal,
          total: liveInvoice.total,
          reason,
          courierLoss: loss.isNegative() ? D(0) : loss,
          reverseCourier: plan.credit.reverseCourier,
          creditsDocId: liveInvoice.id,
          issuedById: hint.actorId ?? null,
        }),
      );
    }
    if (plan.codCashIn) {
      await this.ledger.post(tx, {
        accountCode: 'cash',
        direction: 'IN',
        kind: 'COD_REMITTANCE',
        amount: order.grandTotal,
        memo: `ক্যাশ অন ${order.orderNo}`,
        orderId,
        actorId: hint.actorId ?? null,
      });
    }

    const actor = hint.actorId ? await tx.user.findUnique({ where: { id: hint.actorId }, select: { id: true, name: true } }) : null;
    for (const d of issued) {
      await this.audit.record(
        {
          actorType: actor ? 'STAFF' : 'SYSTEM',
          actor,
          action: 'CREATE',
          area: 'finance',
          entityType: 'FinancialDocument',
          entityId: d.id,
          summary: `${d.kind === 'INVOICE' ? 'ইনভয়েস' : d.kind === 'RECEIPT' ? 'রিসিট' : 'ক্রেডিট নোট'} ${d.docNo} — ${order.orderNo}`,
        },
        tx,
      );
    }
    if (issued.length) this.logger.log(`books ${order.orderNo}: ${issued.map((d) => d.docNo).join(', ')}${plan.codCashIn ? ' + COD cash' : ''}`);
    return { issued: issued.map((d) => ({ id: d.id, docNo: d.docNo, kind: d.kind })), codCashIn: plan.codCashIn };
  }

  private async snapshotBase(tx: Tx, order: Prisma.OrderGetPayload<{ include: typeof orderInclude }>) {
    const componentIds = order.items.flatMap((i) => i.components.map((c) => c.productId));
    const cats = componentIds.length
      ? await tx.product.findMany({ where: { id: { in: componentIds } }, select: { id: true, category: { select: { nameBn: true } } } })
      : [];
    const catOf = new Map(cats.map((p) => [p.id, p.category?.nameBn ?? null]));
    const items: SnapshotItem[] = order.items.map((i) => ({
      kind: i.kind,
      productId: i.productId,
      bundleId: i.bundleId,
      title: i.title,
      sectionCode: i.sectionCode,
      categoryName: i.categoryName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      unitCost: i.unitCost,
      discount: i.discount,
      lineTotal: i.lineTotal,
      components: i.components.map((c) => ({
        productId: c.productId,
        title: c.title,
        categoryName: catOf.get(c.productId) ?? null,
        quantity: c.quantity,
        unitCost: c.unitCost,
        allocatedRevenue: c.allocatedRevenue,
      })),
    }));
    const fees =
      order.paymentMethod === 'SSLCOMMERZ'
        ? (await tx.payment.findMany({ where: { orderId: order.id, status: { in: ['SUCCESS', 'REFUNDED'] } }, select: { fee: true } })).map((p) => p.fee)
        : [];
    const feePct = order.paymentMethod === 'SSLCOMMERZ' && !fees.length ? await this.settings.gatewayFeePct(tx) : D(0);
    return {
      orderId: order.id,
      customerName: order.contactName,
      customerPhone: order.contactPhone,
      address: addressLine(order),
      paymentLabel: PAYMENT_LABEL[order.paymentMethod],
      lines: buildLines(items) as unknown as Prisma.InputJsonValue,
      subtotal: order.itemsSubtotal,
      couponCode: order.couponCode,
      discount: order.discountTotal,
      shippingFee: order.shippingFee,
      shippingCost: order.courierCost,
      gatewayFee: D(gatewayFeeFor(order.paymentMethod, order.grandTotal, fees, feePct)),
      taxTotal: order.taxTotal,
      total: order.grandTotal,
    };
  }

  private async issue(tx: Tx, kind: 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE', data: Omit<Prisma.FinancialDocumentUncheckedCreateInput, 'docNo' | 'kind'>) {
    const scope = kind === 'INVOICE' ? 'invoice' : kind === 'RECEIPT' ? 'receipt' : 'credit_note';
    const docNo = await this.counters.next(tx, scope);
    return tx.financialDocument.create({ data: { ...data, kind, docNo } });
  }
}
