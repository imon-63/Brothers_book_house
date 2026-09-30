import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { verifySslSignature } from '../domain/signature';
import { PaymentEventsService } from './payment-events.service';
import { PaymentSettlementService } from './payment-settlement.service';

export type CallbackKind = 'success' | 'fail' | 'cancel';
type Body = Record<string, unknown>;

const str = (v: unknown) => (v == null ? '' : String(v));

/**
 * Browser redirects (success/fail/cancel) and the server-to-server IPN.
 * Nothing here trusts the POST body: the body only tells us WHICH transaction
 * to look at; the validation / status APIs decide what happened.
 */
@Injectable()
export class PaymentCallbacksService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly events: PaymentEventsService,
    private readonly settlement: PaymentSettlementService,
  ) {}

  /** Returns where to 302 the shopper's browser. */
  @Traced('payments.ssl.callback')
  async callback(kind: CallbackKind, body: Body): Promise<string> {
    const tranId = str(body.tran_id);
    const valId = str(body.val_id);
    const signed = verifySslSignature(body, this.config.get('SSLCOMMERZ_STORE_PASSWORD'));
    const { event, duplicate } = await this.events.record({ eventKey: `${kind}:${tranId}:${valId || str(body.status)}`, eventType: `callback.${kind}`, payload: body, signatureOk: signed });

    let outcome: 'success' | 'fail' | 'cancel' = kind;
    try {
      const payment = tranId ? await this.prisma.payment.findUnique({ where: { tranId } }) : null;
      if (payment && !duplicate) {
        if (kind === 'success' && valId) {
          const status = await this.settlement.confirm(tranId, valId, 'callback');
          outcome = status === 'SUCCESS' ? 'success' : status === 'CANCELLED' ? 'cancel' : 'fail';
        } else {
          // never fail a payment from an unsigned body: ask the gateway instead
          const status = await this.settlement.reconcile(payment, 'callback', signed ? { status: kind === 'cancel' ? 'CANCELLED' : 'FAILED', reason: str(body.error) || kind } : undefined);
          outcome = status === 'SUCCESS' ? 'success' : kind;
        }
      } else if (payment) {
        outcome = payment.status === 'SUCCESS' ? 'success' : kind;
      }
      await this.events.done(event.id, { paymentId: payment?.id });
    } catch (err) {
      await this.events.done(event.id, { error: (err as Error).message });
      this.logger.error({ err, tranId }, 'SSLCOMMERZ callback processing failed');
    }
    const web = this.config.get('PUBLIC_WEB_URL');
    return `${web}/orders?ssl=${outcome}&tran_id=${encodeURIComponent(tranId)}`;
  }

  /** IPN: idempotent, signature-checked, validated; always answers fast. */
  @Traced('payments.ssl.ipn')
  async ipn(body: Body): Promise<{ ok: boolean }> {
    const tranId = str(body.tran_id);
    const valId = str(body.val_id);
    const signed = verifySslSignature(body, this.config.get('SSLCOMMERZ_STORE_PASSWORD'));
    const { event, duplicate } = await this.events.record({ eventKey: `ipn:${tranId}:${valId || str(body.status)}`, eventType: `ipn.${str(body.status).toLowerCase() || 'unknown'}`, payload: body, signatureOk: signed });
    if (duplicate) return { ok: true };
    if (!signed) {
      this.logger.warn(`IPN with bad signature for ${tranId} — ignored`);
      await this.events.done(event.id, { error: 'bad_signature' });
      return { ok: false };
    }
    try {
      const payment = tranId ? await this.prisma.payment.findUnique({ where: { tranId } }) : null;
      if (payment) {
        if (valId) await this.settlement.confirm(tranId, valId, 'ipn');
        else await this.settlement.reconcile(payment, 'ipn');
      }
      await this.events.done(event.id, { paymentId: payment?.id });
      return { ok: true };
    } catch (err) {
      await this.events.done(event.id, { error: (err as Error).message });
      throw err;
    }
  }
}
