import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import { scrub } from '../domain/templates';
import type { OutboxQueryDto } from '../dto/notifications.dto';

const mask = (r: string) => (r.includes('@') ? r.replace(/^(.{2}).*@/, '$1***@') : r.replace(/\d(?=\d{3})/g, '•'));

/** Ops view of the outbox: inspect, retry a FAILED row, cancel a PENDING one. */
@Injectable()
export class OutboxAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: OutboxQueryDto) {
    const where: Prisma.NotificationOutboxWhereInput = { status: q.status, channel: q.channel, template: q.template };
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.notificationOutbox.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(q) }),
      this.prisma.notificationOutbox.count({ where }),
      this.prisma.notificationOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      counts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      ...toPage(rows.map((r) => ({ ...r, recipient: mask(r.recipient), payload: scrub(r.payload) })), total, q),
    };
  }

  async retry(actor: AuthUser, id: string) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.notificationOutbox.findUnique({ where: { id } });
      if (!r) throw new NotFoundError('OutboxMessage', id);
      if (r.status !== 'FAILED' && r.status !== 'CANCELLED') throw new BusinessRuleError('outbox.not_retryable', 'শুধু ব্যর্থ/বাতিল বার্তা আবার পাঠানো যায়');
      await tx.notificationOutbox.update({ where: { id }, data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), lastError: null } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'notification_outbox', entityId: id, summary: `বার্তা আবার পাঠানোর সারিতে: ${r.template}` }, tx);
      return { id, status: 'PENDING' };
    });
  }

  async cancel(actor: AuthUser, id: string) {
    return this.prisma.tx(async (tx) => {
      const r = await tx.notificationOutbox.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      if (!r.count) throw new BusinessRuleError('outbox.not_cancellable', 'শুধু অপেক্ষমাণ বার্তা বাতিল করা যায়');
      await this.audit.record({ actor, action: 'STATUS_CHANGE', area: 'settings', entityType: 'notification_outbox', entityId: id, summary: 'অপেক্ষমাণ বার্তা বাতিল করা হয়েছে' }, tx);
      return { id, status: 'CANCELLED' };
    });
  }
}
