import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { PaymentSettlementService } from './payment-settlement.service';

const EXPIRE_AFTER_MIN = 45;
const BATCH = 50;

/**
 * Safety net for lost callbacks/IPNs: every 10 minutes re-ask SSLCOMMERZ
 * about attempts that are still open, and expire those the shopper abandoned.
 * A Postgres advisory lock keeps multiple API replicas from doing it twice.
 */
@Injectable()
export class PaymentReconcilerService {
  private readonly logger = new Logger('PaymentReconciler');

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: PaymentSettlementService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'payments.reconcile' })
  async run() {
    const [{ locked }] = await this.prisma.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(hashtext('payments.reconcile')) AS locked`;
    if (!locked) return;
    try {
      const cutoff = new Date(Date.now() - EXPIRE_AFTER_MIN * 60_000);
      const open = await this.prisma.payment.findMany({
        where: { provider: 'sslcommerz', status: { in: ['INITIATED', 'PENDING'] }, initiatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
        orderBy: { initiatedAt: 'asc' },
        take: BATCH,
      });
      for (const p of open) {
        const stale = p.initiatedAt < cutoff;
        await this.settlement
          .reconcile(p, 'reconcile', stale ? { status: 'EXPIRED', reason: `no payment within ${EXPIRE_AFTER_MIN} min` } : undefined)
          .catch((err: unknown) => this.logger.warn(`reconcile ${p.tranId} failed: ${(err as Error).message}`));
      }
      if (open.length) this.logger.log(`reconciled ${open.length} open SSLCOMMERZ attempt(s)`);
    } finally {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(hashtext('payments.reconcile'))`;
    }
  }
}
