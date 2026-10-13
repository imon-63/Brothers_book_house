import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '@/common/errors/domain.error';
import { STAFF_ROLES, type AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import { OutboxService } from '@/platform/outbox/outbox.service';
import { AuthService } from '@/modules/auth/auth.service';

const STAFF_SELECT = { id: true, name: true, email: true, phone: true, role: true, status: true, mustChangePassword: true, lastLoginAt: true, createdAt: true } satisfies Prisma.UserSelect;
const ALL_STAFF: UserRole[] = ['OWNER', ...STAFF_ROLES];

/** Staff accounts: invite, role changes, disable (revokes sessions). OWNER/ADMIN only. */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  list() {
    return this.prisma.user.findMany({ where: { role: { in: ALL_STAFF }, deletedAt: null }, select: STAFF_SELECT, orderBy: [{ role: 'asc' }, { name: 'asc' }] });
  }

  async create(dto: { name: string; email: string; role: UserRole }, actor: AuthUser) {
    this.assertCanGrant(actor, dto.role);
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictError('staff.exists', 'এই ইমেইলে অ্যাকাউন্ট আছে');
    const temp = randomBytes(9).toString('base64url');
    return this.prisma.tx(async (tx) => {
      const u = await tx.user.create({ data: { name: dto.name.trim(), email, role: dto.role, passwordHash: await this.auth.hash(temp), mustChangePassword: true }, select: STAFF_SELECT });
      await this.outbox.enqueue({ channel: 'EMAIL', recipient: email, template: 'staff.invite', payload: { name: u.name, role: u.role, tempPassword: temp }, dedupeKey: `staff-invite:${u.id}` }, tx);
      await this.audit.record({ actor, action: 'CREATE', area: 'settings', entityType: 'user', entityId: u.id, summary: `নতুন স্টাফ ${u.name} (${u.role})` }, tx);
      return { ...u, tempPassword: temp };
    });
  }

  async changeRole(id: string, role: UserRole, actor: AuthUser) {
    this.assertCanGrant(actor, role);
    const u = await this.find(id);
    if (u.role === 'OWNER' && role !== 'OWNER') await this.assertNotLastOwner(id);
    return this.prisma.tx(async (tx) => {
      const out = await tx.user.update({ where: { id }, data: { role }, select: STAFF_SELECT });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'user', entityId: id, summary: `${u.name}: ${u.role} → ${role}`, before: { role: u.role }, after: { role } }, tx);
      return out;
    });
  }

  async setEnabled(id: string, enabled: boolean, actor: AuthUser) {
    if (id === actor.id) throw new BusinessRuleError('staff.self', 'নিজের অ্যাকাউন্ট বন্ধ করা যাবে না');
    const u = await this.find(id);
    if (!enabled && u.role === 'OWNER') await this.assertNotLastOwner(id);
    return this.prisma.tx(async (tx) => {
      const out = await tx.user.update({ where: { id }, data: { status: enabled ? 'ACTIVE' : 'DISABLED' }, select: STAFF_SELECT });
      if (!enabled) await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'user', entityId: id, summary: `${u.name} ${enabled ? 'চালু' : 'বন্ধ'} করা হয়েছে` }, tx);
      return out;
    });
  }

  async resetPassword(id: string, actor: AuthUser) {
    const u = await this.find(id);
    const temp = randomBytes(9).toString('base64url');
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash: await this.auth.hash(temp), failedLogins: 0, lockedUntil: null, mustChangePassword: true } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'user', entityId: id, summary: `${u.name} এর পাসওয়ার্ড রিসেট` }, tx);
    });
    return { tempPassword: temp };
  }

  // ─── every account (staff + customers): who can sign in ───

  async users(q: { role?: UserRole; status?: 'ACTIVE' | 'BLOCKED'; q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const take = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const term = q.q?.trim();
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(q.role ? { role: q.role } : {}),
      ...(q.status === 'BLOCKED' ? { status: { not: 'ACTIVE' } } : q.status === 'ACTIVE' ? { status: 'ACTIVE' } : {}),
      ...(term ? { OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }, { phone: { contains: term.replace(/^0/, '') } }] } : {}),
    };
    const [items, total, byRole, blocked] = await Promise.all([
      this.prisma.user.findMany({
        where, orderBy: [{ createdAt: 'desc' }], skip: (page - 1) * take, take,
        select: { ...STAFF_SELECT, customer: { select: { id: true, isBlocked: true, ordersCount: true } }, _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } } },
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.groupBy({ by: ['role'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.user.count({ where: { deletedAt: null, status: { not: 'ACTIVE' } } }),
    ]);
    return {
      items: items.map(({ _count, ...u }) => ({ ...u, activeSessions: _count.sessions })),
      total, page, pageSize: take,
      counts: { ...Object.fromEntries(byRole.map((r) => [r.role, r._count._all])), blocked },
    };
  }

  /** Block / unblock sign-in for any account. Revokes every session immediately. */
  async setAccess(id: string, blocked: boolean, reason: string | undefined, actor: AuthUser) {
    if (id === actor.id) throw new BusinessRuleError('access.self', 'নিজের অ্যাকাউন্ট ব্লক করা যাবে না');
    const u = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!u) throw new NotFoundError('User', id);
    if ((u.role === 'OWNER' || u.role === 'ADMIN') && actor.role !== 'OWNER') throw new ForbiddenError('access.owner_only', 'মালিক/অ্যাডমিনকে শুধু মালিক ব্লক করতে পারেন');
    if (blocked && u.role === 'OWNER') await this.assertNotLastOwner(id);
    return this.prisma.tx(async (tx) => {
      const out = await tx.user.update({ where: { id }, data: { status: blocked ? 'SUSPENDED' : 'ACTIVE', ...(blocked ? {} : { failedLogins: 0, lockedUntil: null }) }, select: STAFF_SELECT });
      if (blocked) await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record(
        {
          actor, action: 'UPDATE', area: u.role === 'CUSTOMER' ? 'customer' : 'settings', entityType: 'user', entityId: id,
          summary: `${u.name} (${u.role}) — লগইন ${blocked ? 'ব্লক' : 'চালু'}${reason ? ` · ${reason}` : ''}`,
          before: { status: u.status }, after: { status: blocked ? 'SUSPENDED' : 'ACTIVE', reason: reason ?? null },
        },
        tx,
      );
      return out;
    });
  }

  async preferences(userId: string) {
    return (await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } })).preferences;
  }

  async updatePreferences(userId: string, patch: Record<string, unknown>) {
    const cur = (await this.preferences(userId)) as Record<string, unknown>;
    const next = { ...cur, ...patch } as Prisma.InputJsonObject;
    await this.prisma.user.update({ where: { id: userId }, data: { preferences: next } });
    return next;
  }

  private async find(id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, role: { in: ALL_STAFF } } });
    if (!u) throw new NotFoundError('Staff', id);
    return u;
  }

  private assertCanGrant(actor: AuthUser, role: UserRole) {
    if (!ALL_STAFF.includes(role)) throw new BusinessRuleError('staff.role_invalid', 'স্টাফের জন্য সঠিক রোল দিন');
    if ((role === 'OWNER' || role === 'ADMIN') && actor.role !== 'OWNER') throw new ForbiddenError('staff.owner_only', 'শুধু মালিক অ্যাডমিন/মালিক বানাতে পারেন');
  }

  private async assertNotLastOwner(id: string) {
    const owners = await this.prisma.user.count({ where: { role: 'OWNER', status: 'ACTIVE', deletedAt: null, NOT: { id } } });
    if (!owners) throw new BusinessRuleError('staff.last_owner', 'শেষ মালিক অ্যাকাউন্ট সরানো যাবে না');
  }
}
