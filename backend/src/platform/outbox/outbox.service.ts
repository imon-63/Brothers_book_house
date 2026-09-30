import { Injectable } from '@nestjs/common';
import type { NotificationChannel, Prisma } from '@prisma/client';
import { PrismaService, type Db } from '@/infrastructure/prisma/prisma.service';

export type OutboxMessage = {
  channel: NotificationChannel;
  recipient: string;
  template: string;
  payload: Prisma.InputJsonValue;
  /** same key twice → stored once (e.g. `order-shipped:CLO-2042`) */
  dedupeKey?: string;
  sendAfter?: Date;
};

/**
 * Transactional outbox: enqueue in the same transaction as the business
 * change; the notifications worker delivers with retries. Guarantees "order
 * saved ⇒ SMS eventually sent" without distributed transactions.
 */
@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(msg: OutboxMessage, db: Db = this.prisma) {
    if (msg.dedupeKey) {
      const existing = await db.notificationOutbox.findUnique({ where: { dedupeKey: msg.dedupeKey } });
      if (existing) return existing;
    }
    return db.notificationOutbox.create({
      data: {
        channel: msg.channel,
        recipient: msg.recipient,
        template: msg.template,
        payload: msg.payload,
        dedupeKey: msg.dedupeKey,
        nextAttemptAt: msg.sendAfter ?? new Date(),
      },
    });
  }
}
