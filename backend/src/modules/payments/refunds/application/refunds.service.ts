import { Inject, Injectable } from '@nestjs/common';
import type { PaymentMethod } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D, sum, toNumber } from '@/common/utils/money';
import { withRetry } from '@/common/utils/retry';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { CashLedgerService } from '@/modules/finance/cashbook/application/cash-ledger.service';
import { AuditService } from '@/platform/audit/audit.service';
import { SSLCOMMERZ_GATEWAY, type SslCommerzGateway } from '../../sslcommerz/gateway/sslcommerz.gateway';
import { checkRefund, mapGatewayRefundStatus, paymentStatusAfterRefund } from '../domain/refund-math';

export type RefundInput = { amount: number; reason: string; method?: PaymentMethod; paymentId?: string };

/**
 * Money back to the customer. Manual methods (cash/bKash/Nagad/bank) complete
 * immediately; SSLCOMMERZ refunds go through the gateway and may stay
 * PROCESSING until the bank confirms. Order paid/refunded totals, the cash
 * ledger and the audit row change in one transaction (payments owns these
 * order payment columns — documented in the module).
 */
@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SSLCOMMERZ_GATEWAY) private readonly gateway: SslCommerzGateway,
    private readonly ledger: CashLedgerService,
    private readonly audit: AuditService,
  ) {}

  list(orderId: string) {
    return this.prisma.refund.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  @Traced('payments.refund')
  async create(orderId: string, input: RefundInput, actor: AuthUser) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payments: { where: { status: 'SUCCESS' } } } });
    if (!order) throw new NotFoundError('Order', orderId);
    const gatewayPayment = input.paymentId ? order.payments.find((p) => p.id === input.paymentId) : order.payments.find((p) => p.method === 'SSLCOMMERZ');
    const method: PaymentMethod = input.method ?? (gatewayPayment ? 'SSLCOMMERZ' : order.paymentMethod === 'COD' ? 'CASH' : order.paymentMethod);

    const refund = await withRetry(() =>
      this.prisma.tx(
        async (tx) => {
          const inFlight = sum((await tx.refund.findMany({ where: { orderId, status: { in: ['REQUESTED', 'PROCESSING'] } }, select: { amount: true } })).map((r) => r.amount));
          const check = checkRefund({ amount: input.amount, amountPaid: order.amountPaid, amountRefunded: order.amountRefunded, inFlight, paymentLimit: method === 'SSLCOMMERZ' ? gatewayPayment?.amount ?? 0 : null });
          if (!check.ok) throw new BusinessRuleError(check.code, check.message, check.details);
          if (method === 'SSLCOMMERZ' && !gatewayPayment?.bankTranId) throw new BusinessRuleError('refund.no_gateway_payment', 'অনলাইন পেমেন্টের ব্যাংক রেফারেন্স পাওয়া যায়নি');

          const row = await tx.refund.create({
            data: { orderId, paymentId: gatewayPayment?.id ?? null, amount: check.amount, method, reason: input.reason.trim(), status: method === 'SSLCOMMERZ' ? 'PROCESSING' : 'COMPLETED', processedById: actor.id, processedAt: method === 'SSLCOMMERZ' ? null : new Date() },
          });
          if (row.status === 'COMPLETED') await this.applyCompleted(tx, order.id, order.orderNo, row.id, method, check.amount, actor.id);
          await this.audit.record({ actor, action: 'CREATE', area: 'finance', entityType: 'refund', entityId: row.id, summary: `${order.orderNo} · ৳${check.amount.toFixed(2)} ফেরত (${method}) — ${input.reason.trim()}` }, tx);
          return row;
        },
        { serializable: true },
      ),
    );

    if (refund.method !== 'SSLCOMMERZ' || !gatewayPayment?.bankTranId) return this.view(refund.id);
    // gateway call happens outside the tx (never hold a DB tx over a network call)
    try {
      const res = await this.gateway.refund({ bankTranId: gatewayPayment.bankTranId, amount: D(refund.amount).toFixed(2), remarks: refund.reason, referenceId: refund.id.slice(0, 30) });
      const status = mapGatewayRefundStatus(res.status);
      await this.settleGateway(refund.id, status, String(res.refund_ref_id ?? ''), actor);
    } catch (err) {
      await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
      throw new BusinessRuleError('refund.gateway_failed', 'গেটওয়েতে ফেরত পাঠানো যায়নি', { reason: (err as Error).message });
    }
    return this.view(refund.id);
  }

  /** Poll a PROCESSING gateway refund (admin "refresh" button / job). */
  async refresh(refundId: string, actor: AuthUser) {
    const r = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!r) throw new NotFoundError('Refund', refundId);
    if (r.status !== 'PROCESSING' || !r.providerRef) return this.view(r.id);
    const res = await this.gateway.refundStatus(r.providerRef);
    await this.settleGateway(r.id, mapGatewayRefundStatus(res.status), r.providerRef, actor);
    return this.view(r.id);
  }

  private async settleGateway(refundId: string, status: 'COMPLETED' | 'PROCESSING' | 'FAILED', providerRef: string, actor: AuthUser) {
    await this.prisma.tx(async (tx) => {
      const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { order: { select: { orderNo: true } } } });
      if (r.status === 'COMPLETED') return;
      await tx.refund.update({ where: { id: r.id }, data: { status, providerRef: providerRef || r.providerRef, processedAt: status === 'COMPLETED' ? new Date() : null } });
      if (status === 'COMPLETED') await this.applyCompleted(tx, r.orderId, r.order.orderNo, r.id, r.method, r.amount, actor.id);
    });
  }

  private async applyCompleted(tx: Parameters<Parameters<PrismaService['tx']>[0]>[0], orderId: string, orderNo: string, refundId: string, method: PaymentMethod, amount: ReturnType<typeof D>, actorId: string) {
    const o = await tx.order.update({ where: { id: orderId }, data: { amountRefunded: { increment: amount } }, select: { amountPaid: true, amountRefunded: true } });
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: paymentStatusAfterRefund(o.amountPaid, o.amountRefunded) } });
    await this.ledger.recordRefund(tx, { orderId, orderNo, refundId, method, amount, actorId });
  }

  private async view(id: string) {
    const r = await this.prisma.refund.findUniqueOrThrow({ where: { id } });
    return { ...r, amount: toNumber(r.amount) };
  }
}
