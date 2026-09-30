import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { isStaff } from '@/common/types/auth-user';
import { D } from '@/common/utils/money';
import { normalizeBdPhone } from '@/common/utils/text';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';
import { annotate, Traced } from '@/infrastructure/telemetry/traced.decorator';
import { buildSessionFields, makeTranId, SSL_MAX_AMOUNT, SSL_MIN_AMOUNT } from '../domain/session-fields';
import { SSLCOMMERZ_GATEWAY, SslGatewayError, type SslCommerzGateway } from '../gateway/sslcommerz.gateway';

export type InitResult = { paymentId: string; tranId: string; gatewayUrl: string; amount: number };

/**
 * Starts an SSLCOMMERZ hosted-checkout session for an unpaid order.
 * One Payment row per attempt (tran_id CLO-2042-1, -2 …) so retries after a
 * failed card never reuse a tran_id.
 */
@Injectable()
export class PaymentCheckoutService {
  private readonly logger = new Logger('Payments');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(SSLCOMMERZ_GATEWAY) private readonly gateway: SslCommerzGateway,
    private readonly metrics: BusinessMetrics,
  ) {}

  @Traced('payments.ssl.init')
  async init(ref: { orderId?: string; orderNo?: string; phone?: string }, user?: AuthUser): Promise<InitResult> {
    const order = await this.prisma.order.findFirst({
      where: ref.orderId ? { id: ref.orderId } : { orderNo: ref.orderNo },
      include: { items: { select: { title: true, quantity: true, sectionCode: true } } },
    });
    if (!order) throw new NotFoundError('Order', ref.orderNo ?? ref.orderId);
    annotate({ 'order.no': order.orderNo });

    // ownership: the customer themself, staff, or a guest who knows the phone
    const ownsByLogin = user?.customerId && user.customerId === order.customerId;
    const ownsByPhone = ref.phone && normalizeBdPhone(ref.phone) === order.contactPhone;
    if (!ownsByLogin && !ownsByPhone && !isStaff(user)) throw new ForbiddenError('payment.not_owner', 'এই অর্ডারের পেমেন্ট করার অনুমতি নেই');

    if (order.paymentMethod !== 'SSLCOMMERZ') throw new BusinessRuleError('payment.method_mismatch', 'এই অর্ডারটি অনলাইন পেমেন্টের নয়');
    if (order.status === 'CANCELLED' || order.status === 'RETURNED') throw new BusinessRuleError('payment.order_closed', 'অর্ডারটি বাতিল হয়েছে');
    if (order.paymentStatus !== 'UNPAID') throw new BusinessRuleError('payment.already_paid', 'এই অর্ডারের টাকা আগেই পরিশোধ হয়েছে');
    const amount = D(order.grandTotal).minus(D(order.amountPaid));
    if (amount.lessThan(SSL_MIN_AMOUNT) || amount.greaterThan(SSL_MAX_AMOUNT)) {
      throw new BusinessRuleError('payment.amount_out_of_range', `অনলাইনে ৳${SSL_MIN_AMOUNT}–৳${SSL_MAX_AMOUNT} পর্যন্ত পরিশোধ করা যায়`);
    }

    const attempt = (await this.prisma.payment.count({ where: { orderId: order.id } })) + 1;
    const tranId = makeTranId(order.orderNo, attempt);
    // a still-open earlier attempt is superseded by this one
    await this.prisma.payment.updateMany({ where: { orderId: order.id, status: { in: ['INITIATED', 'PENDING'] } }, data: { status: 'CANCELLED', failureReason: 'superseded' } });
    const payment = await this.prisma.payment.create({
      data: { orderId: order.id, method: 'SSLCOMMERZ', provider: 'sslcommerz', status: 'INITIATED', amount, currency: order.currency, tranId },
    });

    const api = `${this.config.get('PUBLIC_API_URL')}/${this.config.get('API_PREFIX')}/v1/payments/sslcommerz`;
    const fields = buildSessionFields(
      {
        orderId: order.id,
        orderNo: order.orderNo,
        paymentId: payment.id,
        tranId,
        amount,
        currency: order.currency,
        contactName: order.contactName,
        contactPhone: order.contactPhone,
        contactEmail: order.contactEmail,
        shipLine: order.shipLine,
        shipUpazila: order.shipUpazila,
        shipDistrict: order.shipDistrict,
        shipDivision: order.shipDivision,
        items: order.items,
      },
      { success: `${api}/success`, fail: `${api}/fail`, cancel: `${api}/cancel`, ipn: `${api}/ipn` },
    );

    let session;
    try {
      session = await this.gateway.createSession(fields);
    } catch (err) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: `session: ${(err as Error).message}`.slice(0, 500) } });
      this.metrics.count(this.metrics.payments, { provider: 'sslcommerz', outcome: 'session_error', source: 'init' });
      if (err instanceof SslGatewayError) throw new BusinessRuleError('payment.gateway_unavailable', 'পেমেন্ট গেটওয়ে এখন সাড়া দিচ্ছে না, একটু পরে চেষ্টা করুন');
      throw err;
    }
    if (String(session.status).toUpperCase() !== 'SUCCESS' || !session.GatewayPageURL) {
      const reason = String(session.failedreason ?? 'session_failed');
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: reason.slice(0, 500) } });
      this.logger.warn(`SSLCOMMERZ session refused for ${tranId}: ${reason}`);
      throw new BusinessRuleError('payment.session_failed', 'পেমেন্ট শুরু করা যায়নি', { reason });
    }
    await this.prisma.payment.update({ where: { id: payment.id }, data: { gatewayPayload: { sessionkey: String(session.sessionkey ?? '') } } });
    this.metrics.count(this.metrics.payments, { provider: 'sslcommerz', outcome: 'initiated', source: 'init' });
    return { paymentId: payment.id, tranId, gatewayUrl: session.GatewayPageURL, amount: amount.toNumber() };
  }
}
