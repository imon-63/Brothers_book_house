import { Injectable } from '@nestjs/common';
import { Prisma, type PaymentEvent } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { sanitizeGatewayPayload } from '../domain/validation';

export const SSL_PROVIDER = 'sslcommerz';

/**
 * Raw gateway traffic log (payment_events). (provider, event_key) is unique,
 * so the same IPN / callback delivered twice is stored — and processed — once.
 */
@Injectable()
export class PaymentEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert the event. `duplicate` is true when the same key was already
   * processed; an earlier delivery that failed mid-way is handed back for
   * another attempt.
   */
  async record(e: { eventKey: string; eventType: string; payload: Record<string, unknown>; signatureOk: boolean; paymentId?: string | null }): Promise<{ event: PaymentEvent; duplicate: boolean }> {
    const eventKey = e.eventKey.slice(0, 120);
    try {
      const event = await this.prisma.paymentEvent.create({
        data: { provider: SSL_PROVIDER, eventKey, eventType: e.eventType.slice(0, 60), payload: sanitizeGatewayPayload(e.payload), signatureOk: e.signatureOk, paymentId: e.paymentId ?? null },
      });
      return { event, duplicate: false };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      const event = await this.prisma.paymentEvent.findUniqueOrThrow({ where: { provider_eventKey: { provider: SSL_PROVIDER, eventKey } } });
      return { event, duplicate: event.processedAt != null };
    }
  }

  async done(id: string, r: { paymentId?: string | null; error?: string | null } = {}) {
    await this.prisma.paymentEvent.update({
      where: { id },
      data: { processedAt: r.error ? null : new Date(), error: r.error?.slice(0, 500) ?? null, paymentId: r.paymentId ?? undefined },
    });
  }
}
