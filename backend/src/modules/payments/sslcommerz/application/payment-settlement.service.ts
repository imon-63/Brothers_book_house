import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Payment, PaymentStatus } from '@prisma/client';
import { Events, type PaymentFailedEvent, type PaymentSucceededEvent } from '@/common/events/domain-events';
import { D } from '@/common/utils/money';
import { withRetry } from '@/common/utils/retry';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';
import { annotate, Traced } from '@/infrastructure/telemetry/traced.decorator';
import { CashLedgerService } from '@/modules/finance/cashbook/application/cash-ledger.service';
import { FinanceSettings } from '@/modules/finance/shared/application/finance-settings.service';
import { computeGatewayFee, evaluateValidation, interpretTransactionQuery, sanitizeGatewayPayload } from '../domain/validation';
import { SSLCOMMERZ_GATEWAY, SslGatewayError, type SslCommerzGateway } from '../gateway/sslcommerz.gateway';

export type Source = 'callback' | 'ipn' | 'reconcile';
type Failable = Extract<PaymentStatus, 'FAILED' | 'CANCELLED' | 'EXPIRED'>;

const OPEN: PaymentStatus[] = ['INITIATED', 'PENDING'];
const FINAL_OK: PaymentStatus[] = ['SUCCESS', 'REFUNDED'];

/**
 * The one place a gateway payment changes state. Every transition is a
 * conditional UPDATE (… WHERE status IN (…)), so a success callback, the IPN
 * and the reconciler racing each other produce exactly one SUCCESS and one
 * event. Nothing is marked paid without the server-side validation API.
 */
@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SSLCOMMERZ_GATEWAY) private readonly gateway: SslCommerzGateway,
    private readonly ledger: CashLedgerService,
    private readonly settings: FinanceSettings,
    private readonly events: EventEmitter2,
    private readonly metrics: BusinessMetrics,
  ) {}

  /** Validate `valId` with SSLCOMMERZ and settle the payment. Returns the resulting status. */
  @Traced('payments.ssl.confirm')
  async confirm(tranId: string, valId: string, source: Source): Promise<PaymentStatus | null> {
    const payment = await this.prisma.payment.findUnique({ where: { tranId }, include: { order: { select: { orderNo: true } } } });
    if (!payment) {
      this.logger.warn(`confirm: unknown tran_id ${tranId} (${source})`);
      return null;
    }
    annotate({ 'payment.tran_id': tranId, 'payment.source': source });
    if (FINAL_OK.includes(payment.status)) return payment.status;

    let validation;
    try {
      validation = await this.gateway.validate(valId);
    } catch (err) {
      this.logger.warn(`validation API unavailable for ${tranId}: ${(err as Error).message}`);
      await this.markPending(payment.id, 'validation_unavailable');
      return this.statusOf(payment.id);
    }

    const decision = evaluateValidation({ tranId, amount: payment.amount, currency: payment.currency }, validation);
    switch (decision.kind) {
      case 'foreign':
        // forged / wrong val_id: never let it touch a real payment
        this.logger.warn(`validation for ${tranId} does not match (${decision.reason}) — ignored`);
        this.count('invalid', source);
        return payment.status;
      case 'pending':
        await this.markPending(payment.id, decision.reason);
        return this.statusOf(payment.id);
      case 'mismatch':
        this.logger.error(`SSLCOMMERZ ${tranId}: paid but ${decision.reason} — needs manual review/refund`);
        await this.fail(payment, 'FAILED', `mismatch: ${decision.reason}`, source);
        return this.statusOf(payment.id);
      case 'not_paid':
        await this.fail(payment, decision.status, decision.reason, source);
        return this.statusOf(payment.id);
      case 'success':
        break;
    }

    const feePct = await this.settings.gatewayFeePct();
    const fee = computeGatewayFee(payment.amount, validation.store_amount as string | undefined, feePct);
    const at = new Date();
    const won = await withRetry(() =>
      this.prisma.tx(async (tx) => {
        const n = await tx.payment.updateMany({
          where: { id: payment.id, status: { notIn: FINAL_OK } },
          data: {
            status: 'SUCCESS',
            valId: decision.valId,
            bankTranId: decision.bankTranId,
            cardType: decision.cardType,
            cardBrand: decision.cardBrand,
            riskLevel: decision.riskLevel,
            fee,
            succeededAt: at,
            failureReason: null,
            gatewayPayload: sanitizeGatewayPayload(validation as Record<string, unknown>),
          },
        });
        if (!n.count) return false;
        // atomic with SUCCESS: money in the gateway balance, fee out
        await this.ledger.recordGatewayCapture(tx, { orderId: payment.orderId, orderNo: payment.order.orderNo, tranId, amount: payment.amount, fee, at });
        return true;
      }),
    );
    if (!won) return this.statusOf(payment.id);

    if (payment.status !== 'INITIATED' && payment.status !== 'PENDING') {
      this.logger.warn(`SSLCOMMERZ ${tranId}: late success after ${payment.status}`);
    }
    if (decision.riskLevel === 1) this.logger.warn(`SSLCOMMERZ ${tranId}: risk_level=1 — verify before shipping`);
    this.count('success', source);
    this.metrics.paymentValue.record(D(payment.amount).toNumber(), { provider: 'sslcommerz' });
    const evt: PaymentSucceededEvent = { paymentId: payment.id, orderId: payment.orderId, amount: D(payment.amount).toFixed(2), fee: fee.toFixed(2), tranId };
    this.events.emit(Events.PaymentSucceeded, evt);
    return 'SUCCESS';
  }

  /** Close an open attempt as FAILED / CANCELLED / EXPIRED and tell orders. */
  async fail(payment: Pick<Payment, 'id' | 'orderId' | 'tranId'>, status: Failable, reason: string, source: Source): Promise<boolean> {
    const n = await this.prisma.payment.updateMany({ where: { id: payment.id, status: { in: OPEN } }, data: { status, failureReason: reason.slice(0, 500) } });
    if (!n.count) return false;
    this.count(status.toLowerCase(), source);
    const evt: PaymentFailedEvent = { paymentId: payment.id, orderId: payment.orderId, reason: `${status.toLowerCase()}: ${reason}`.slice(0, 300) };
    this.events.emit(Events.PaymentFailed, evt);
    return true;
  }

  /**
   * Ask SSLCOMMERZ what happened to a tran_id (transaction-status API) and act
   * on it. `fallback` is applied when the gateway has no record of an attempt
   * (customer never paid) — e.g. EXPIRED from the reconciler, CANCELLED from a
   * signed cancel callback.
   */
  @Traced('payments.ssl.reconcile')
  async reconcile(payment: Pick<Payment, 'id' | 'orderId' | 'tranId' | 'status'>, source: Source, fallback?: { status: Failable; reason: string }): Promise<PaymentStatus | null> {
    if (!payment.tranId) return payment.status;
    let q;
    try {
      q = await this.gateway.queryByTranId(payment.tranId);
    } catch (err) {
      if (!(err instanceof SslGatewayError)) throw err;
      this.logger.warn(`status API unavailable for ${payment.tranId}: ${err.message}`);
      return payment.status;
    }
    const out = interpretTransactionQuery(q, payment.tranId);
    switch (out.kind) {
      case 'paid':
        return this.confirm(payment.tranId, out.valId, source);
      case 'not_paid':
        await this.fail(payment, out.status, out.reason, source);
        break;
      case 'none':
        if (fallback) await this.fail(payment, fallback.status, fallback.reason, source);
        break;
      case 'pending':
        if (fallback?.status === 'EXPIRED' && payment.status === 'PENDING') await this.fail(payment, 'EXPIRED', fallback.reason, source);
        else await this.markPending(payment.id, 'gateway_pending');
        break;
    }
    return this.statusOf(payment.id);
  }

  private async markPending(id: string, reason: string) {
    await this.prisma.payment.updateMany({ where: { id, status: 'INITIATED' }, data: { status: 'PENDING', failureReason: reason.slice(0, 200) } });
  }

  private async statusOf(id: string) {
    return (await this.prisma.payment.findUnique({ where: { id }, select: { status: true } }))?.status ?? null;
  }

  private count(outcome: string, source: Source) {
    this.metrics.count(this.metrics.payments, { provider: 'sslcommerz', outcome, source });
  }
}
