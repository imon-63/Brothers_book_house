import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma, type NotificationChannel } from '@prisma/client';
import { AppConfig } from '@/config/app-config.service';
import { localPhone } from '@/common/utils/text';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { StoreSettingsService } from '@/modules/content/application/store-settings.service';
import { afterFailure, OUTBOX_POLICY } from '../domain/backoff';
import { render, scrub, TemplateError, type RenderContext } from '../domain/templates';
import { EMAIL_PROVIDER, ProviderError, SMS_PROVIDER, type EmailProvider, type SmsProvider } from '../providers/providers';

type Claimed = { id: string; channel: NotificationChannel; recipient: string; template: string; payload: Prisma.JsonValue; attempts: number };

const BATCH = 50;
const CONCURRENCY = 5;

/**
 * Delivers notification_outbox rows.
 *
 * Claiming is ONE statement: `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP
 * LOCKED) RETURNING *`. Concurrent replicas skip each other's rows, so a
 * message is never picked twice. The claim also sets a lease
 * (next_attempt_at = now + 10 min): if a process dies mid-send, the row
 * becomes claimable again once the lease expires (at-least-once delivery).
 */
@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: BusinessMetrics,
    private readonly appConfig: AppConfig,
    private readonly rawConfig: ConfigService,
    private readonly settings: StoreSettingsService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(EMAIL_PROVIDER) private readonly email: EmailProvider,
  ) {}

  get enabled() {
    const flag = String(this.rawConfig.get('OUTBOX_WORKER_ENABLED') ?? 'true').toLowerCase();
    return !this.appConfig.isTest && flag !== 'false' && flag !== '0';
  }

  @Cron('*/15 * * * * *', { name: 'outbox-deliver' })
  async tick() {
    if (!this.enabled || this.running) return; // no overlap inside one process
    this.running = true;
    try {
      let n: number;
      let rounds = 0;
      do {
        n = await this.runOnce();
        rounds += 1;
      } while (n === BATCH && rounds < 10); // drain bursts, but yield every ~500 rows
    } catch (err) {
      this.logger.error({ err }, 'Outbox tick failed');
    } finally {
      this.running = false;
    }
  }

  /** Claim and deliver one batch. Returns how many rows were claimed. */
  @Traced('notifications.outbox_batch')
  async runOnce(limit = BATCH): Promise<number> {
    const leaseMs = OUTBOX_POLICY.stuckAfterMs;
    const rows = await this.prisma.$queryRaw<Claimed[]>`
      UPDATE notification_outbox o
         SET status = 'SENDING', attempts = o.attempts + 1,
             next_attempt_at = now() + (${leaseMs}::int * interval '1 millisecond')
       WHERE o.id IN (
             SELECT id FROM notification_outbox
              WHERE status IN ('PENDING', 'SENDING') AND next_attempt_at <= now()
              ORDER BY next_attempt_at
              LIMIT ${limit}
              FOR UPDATE SKIP LOCKED)
   RETURNING o.id, o.channel, o.recipient, o.template, o.payload, o.attempts`;
    if (!rows.length) return 0;

    const ctx = await this.context();
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      await Promise.all(rows.slice(i, i + CONCURRENCY).map((r) => this.deliver(r, ctx)));
    }
    return rows.length;
  }

  private async deliver(row: Claimed, ctx: RenderContext) {
    try {
      const msg = render(row.template, row.payload, ctx);
      const res = await this.send(row.channel, row.recipient, msg);
      await this.prisma.notificationOutbox.updateMany({
        where: { id: row.id, status: 'SENDING' },
        data: { status: 'SENT', sentAt: new Date(), providerRef: res.providerRef, lastError: null, payload: scrub(row.payload) as Prisma.InputJsonValue },
      });
      this.metrics.count(this.metrics.outbox, { channel: row.channel, result: 'sent' });
    } catch (err) {
      const retryable = err instanceof ProviderError ? err.retryable : !(err instanceof TemplateError);
      const decision = afterFailure(row.attempts, retryable);
      const message = (err as Error)?.message?.slice(0, 500) ?? 'unknown error';
      await this.prisma.notificationOutbox.updateMany({
        where: { id: row.id, status: 'SENDING' },
        data: decision.status === 'FAILED' ? { status: 'FAILED', lastError: message } : { status: 'PENDING', nextAttemptAt: decision.nextAttemptAt, lastError: message },
      });
      this.metrics.count(this.metrics.outbox, { channel: row.channel, result: decision.status === 'FAILED' ? 'failed' : 'retry' });
      const log = decision.status === 'FAILED' ? 'error' : 'warn';
      this.logger[log]({ outboxId: row.id, template: row.template, attempts: row.attempts, err: message }, decision.status === 'FAILED' ? 'Outbox message failed permanently' : 'Outbox message will be retried');
    }
  }

  private send(channel: NotificationChannel, recipient: string, msg: { subject: string; text: string }) {
    switch (channel) {
      case 'SMS':
        return this.sms.send(recipient, msg.text);
      case 'EMAIL':
        return this.email.send({ to: recipient, subject: msg.subject, text: msg.text });
      default:
        throw new ProviderError(`channel ${channel} has no provider yet`, false);
    }
  }

  private async context(): Promise<RenderContext> {
    const s = await this.settings.all().catch(() => ({}) as Record<string, unknown>);
    const helpline = typeof s.helpline === 'string' ? localPhone(s.helpline) : null;
    return { storeName: String(s.store_name ?? 'চলো'), webUrl: this.appConfig.get('PUBLIC_WEB_URL').replace(/\/$/, ''), helpline };
  }
}
