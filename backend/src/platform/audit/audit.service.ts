import { Injectable } from '@nestjs/common';
import type { ActorType, AuditAction, Prisma } from '@prisma/client';
import { trace } from '@opentelemetry/api';
import { PrismaService, type Db } from '@/infrastructure/prisma/prisma.service';
import type { AuthUser } from '@/common/types/auth-user';

export type AuditArea = 'order' | 'product' | 'finance' | 'settings' | 'customer' | 'chat' | 'auth' | 'inventory';

export type AuditEntry = {
  actor?: Pick<AuthUser, 'id' | 'name'> | null;
  actorType?: ActorType;
  action: AuditAction;
  area: AuditArea;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

/**
 * অ্যাক্টিভিটি লগ writer. Call it with the SAME `db` (transaction) as the
 * change it describes so the audit row commits or rolls back with it.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(entry: AuditEntry, db: Db = this.prisma) {
    return db.auditLog.create({
      data: {
        actorType: entry.actorType ?? (entry.actor ? 'STAFF' : 'SYSTEM'),
        actorId: entry.actor?.id ?? null,
        actorName: entry.actor?.name ?? null,
        action: entry.action,
        area: entry.area,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
        before: entry.before,
        after: entry.after,
        requestId: trace.getActiveSpan()?.spanContext().traceId ?? null,
      },
    });
  }

  /** Return only the keys that changed — keeps audit rows small and readable. */
  static diff<T extends Record<string, unknown>>(before: T, patch: Partial<T>) {
    const b: Record<string, unknown> = {};
    const a: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const prev = before[k];
      if (String(prev) !== String(v)) {
        b[k] = prev ?? null;
        a[k] = v ?? null;
      }
    }
    return { before: b as Prisma.InputJsonValue, after: a as Prisma.InputJsonValue, changed: Object.keys(a) };
  }
}
