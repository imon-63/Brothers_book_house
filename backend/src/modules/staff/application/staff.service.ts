import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '@/common/errors/domain.error';
import { STAFF_ROLES, type AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import { OutboxService } from '@/platform/outbox/outbox.service';
import { AuthService } from '@/modules/auth/auth.service';

const STAFF_SELECT = { id: true, name: true, email: true, phone: true, role: true, status: true, lastLoginAt: true, createdAt: true } satisfies Prisma.UserSelect;
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
      const u = await tx.user.create({ data: { name: dto.name.trim(), email, role: dto.role, passwordHash: await this.auth.hash(temp) }, select: STAFF_SELECT });
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
      await tx.user.update({ where: { id }, data: { passwordHash: await this.auth.hash(temp), failedLogins: 0, lockedUntil: null } });
      await tx.authSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'user', entityId: id, summary: `${u.name} এর পাসওয়ার্ড রিসেট` }, tx);
    });
    return { tempPassword: temp };
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
