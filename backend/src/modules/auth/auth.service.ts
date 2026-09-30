import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AppConfig } from '@/config/app-config.service';
import { BusinessRuleError, ConflictError, UnauthorizedError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { normalizeBdPhone } from '@/common/utils/text';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { BusinessMetrics } from '@/infrastructure/telemetry/metrics.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { OutboxService } from '@/platform/outbox/outbox.service';
import type { AccessClaims } from './jwt.strategy';
import type { LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

export type SessionMeta = { ip?: string; userAgent?: string };
export type Tokens = { accessToken: string; refreshToken: string; expiresIn: number; tokenType: 'Bearer' };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly metrics: BusinessMetrics,
  ) {}

  /** First boot: create the OWNER from env so the admin panel is reachable. */
  async onApplicationBootstrap() {
    const email = this.config.get('ADMIN_BOOTSTRAP_EMAIL');
    const password = this.config.get('ADMIN_BOOTSTRAP_PASSWORD');
    if (!email || !password || this.config.isTest) return;
    const owner = await this.prisma.user.findFirst({ where: { role: 'OWNER' }, select: { id: true } }).catch(() => null);
    if (owner) return;
    await this.prisma.user.upsert({
      where: { email },
      update: { role: 'OWNER' },
      create: { email, name: 'অ্যাডমিন', role: 'OWNER', passwordHash: await this.hash(password), emailVerified: new Date() },
    });
    this.logger.warn(`Bootstrapped OWNER account ${email} — change its password`);
  }

  @Traced('auth.register')
  async register(dto: RegisterDto, meta: SessionMeta): Promise<Tokens> {
    const phone = normalizeBdPhone(dto.phone);
    if (!phone) throw new BusinessRuleError('auth.phone_invalid', 'সঠিক মোবাইল নম্বর দিন');
    const email = dto.email?.trim().toLowerCase() || null;

    const clash = await this.prisma.user.findFirst({ where: { OR: [{ phone }, ...(email ? [{ email }] : [])] }, select: { phone: true } });
    if (clash) throw new ConflictError('auth.account_exists', clash.phone === phone ? 'এই নম্বরে অ্যাকাউন্ট আছে' : 'এই ইমেইলে অ্যাকাউন্ট আছে');

    const user = await this.prisma.tx(async (tx) => {
      const u = await tx.user.create({ data: { name: dto.name.trim(), phone, email, passwordHash: await this.hash(dto.password), role: 'CUSTOMER' } });
      // A guest who ordered before keeps their history: link the existing CRM row.
      await tx.customer.upsert({
        where: { phone },
        update: { userId: u.id, name: u.name, email: email ?? undefined },
        create: { phone, name: u.name, email, userId: u.id },
      });
      await this.audit.record({ actor: { id: u.id, name: u.name }, actorType: 'CUSTOMER', action: 'CREATE', area: 'auth', entityType: 'user', entityId: u.id, summary: `নতুন অ্যাকাউন্ট: ${u.name}` }, tx);
      return u;
    });
    this.metrics.count(this.metrics.authEvents, { event: 'register' });
    return this.issue(user, meta);
  }

  @Traced('auth.login')
  async login(dto: LoginDto, meta: SessionMeta): Promise<Tokens> {
    const user = await this.findByIdentifier(dto.identifier);
    // same error for unknown user and bad password → no account enumeration
    const fail = new UnauthorizedError('auth.invalid_credentials', 'ইমেইল/মোবাইল অথবা পাসওয়ার্ড ভুল');
    if (!user || !user.passwordHash || user.deletedAt) {
      this.metrics.count(this.metrics.authEvents, { event: 'login_failed' });
      throw fail;
    }
    if (user.status !== 'ACTIVE') throw new UnauthorizedError('auth.disabled', 'অ্যাকাউন্টটি বন্ধ আছে');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError('auth.locked', 'বারবার ভুল চেষ্টার কারণে কিছুক্ষণের জন্য লক করা হয়েছে');
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null },
      });
      this.metrics.count(this.metrics.authEvents, { event: 'login_failed' });
      throw fail;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    if (user.role !== 'CUSTOMER') {
      await this.audit.record({ actor: { id: user.id, name: user.name }, action: 'LOGIN', area: 'auth', entityType: 'user', entityId: user.id, summary: `${user.name} লগইন করেছেন` });
    }
    this.metrics.count(this.metrics.authEvents, { event: 'login', role: user.role });
    return this.issue(user, meta);
  }

  /** Rotate: old refresh token dies, a new pair is issued. Reuse ⇒ revoke all. */
  @Traced('auth.refresh')
  async refresh(refreshToken: string | undefined, meta: SessionMeta): Promise<Tokens> {
    if (!refreshToken) throw new UnauthorizedError('auth.refresh_missing', 'সেশন শেষ, আবার লগইন করুন');
    const session = await this.prisma.authSession.findUnique({ where: { refreshTokenHash: sha256(refreshToken) }, include: { user: true } });
    if (!session) throw new UnauthorizedError('auth.refresh_invalid', 'সেশন শেষ, আবার লগইন করুন');
    if (session.revokedAt) {
      // A rotated token came back → it was stolen. Kill every session of this user.
      await this.prisma.authSession.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      this.metrics.count(this.metrics.authEvents, { event: 'refresh_reuse' });
      this.logger.warn({ userId: session.userId }, 'Refresh token reuse detected — all sessions revoked');
      throw new UnauthorizedError('auth.refresh_reused', 'নিরাপত্তার জন্য সব ডিভাইস থেকে লগআউট করা হয়েছে');
    }
    if (session.expiresAt < new Date() || session.user.status !== 'ACTIVE') throw new UnauthorizedError('auth.refresh_expired', 'সেশন শেষ, আবার লগইন করুন');
    await this.prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
    this.metrics.count(this.metrics.authEvents, { event: 'refresh' });
    return this.issue(session.user, meta);
  }

  async logout(user: AuthUser | undefined, refreshToken?: string) {
    const now = new Date();
    if (refreshToken) await this.prisma.authSession.updateMany({ where: { refreshTokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: now } });
    if (user) await this.prisma.authSession.updateMany({ where: { id: user.sessionId, revokedAt: null }, data: { revokedAt: now } });
    this.metrics.count(this.metrics.authEvents, { event: 'logout' });
  }

  async logoutEverywhere(user: AuthUser) {
    await this.prisma.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async me(user: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, avatarUrl: true, preferences: true, lastLoginAt: true, customer: { select: { id: true, ordersCount: true, totalSpent: true } } },
    });
    return u;
  }

  /** Always answers the same way so it can't be used to probe accounts. */
  @Traced('auth.password_forgot')
  async forgotPassword(identifier: string) {
    const user = await this.findByIdentifier(identifier);
    if (user && user.status === 'ACTIVE') {
      const code = String(randomInt(100000, 1000000));
      const target = user.phone ?? user.email!;
      await this.prisma.tx(async (tx) => {
        await tx.verificationCode.create({
          data: { userId: user.id, target, purpose: 'PASSWORD_RESET', codeHash: sha256(code), expiresAt: new Date(Date.now() + OTP_TTL_MIN * 60_000) },
        });
        await this.outbox.enqueue(
          { channel: user.phone ? 'SMS' : 'EMAIL', recipient: target, template: 'auth.password_reset', payload: { name: user.name, code, minutes: OTP_TTL_MIN } },
          tx,
        );
      });
    }
    return { ok: true, message: 'অ্যাকাউন্ট থাকলে কোড পাঠানো হয়েছে' };
  }

  @Traced('auth.password_reset')
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.findByIdentifier(dto.identifier);
    const bad = new BusinessRuleError('auth.code_invalid', 'কোড ভুল বা মেয়াদ শেষ');
    if (!user) throw bad;
    const code = await this.prisma.verificationCode.findFirst({
      where: { userId: user.id, purpose: 'PASSWORD_RESET', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!code || code.attempts >= OTP_MAX_ATTEMPTS) throw bad;
    if (code.codeHash !== sha256(dto.code.trim())) {
      await this.prisma.verificationCode.update({ where: { id: code.id }, data: { attempts: { increment: 1 } } });
      throw bad;
    }
    await this.prisma.tx(async (tx) => {
      await tx.verificationCode.update({ where: { id: code.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: user.id }, data: { passwordHash: await this.hash(dto.password), failedLogins: 0, lockedUntil: null } });
      await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { ok: true, message: 'পাসওয়ার্ড বদলেছে, আবার লগইন করুন' };
  }

  async changePassword(user: AuthUser, current: string, next: string) {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!u.passwordHash || !(await argon2.verify(u.passwordHash, current))) throw new BusinessRuleError('auth.password_wrong', 'বর্তমান পাসওয়ার্ড ভুল');
    await this.prisma.tx(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { passwordHash: await this.hash(next) } });
      await tx.authSession.updateMany({ where: { userId: u.id, revokedAt: null, NOT: { id: user.sessionId } }, data: { revokedAt: new Date() } });
    });
    return { ok: true };
  }

  hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  }

  // ─── internals ───

  private async findByIdentifier(identifier: string): Promise<User | null> {
    const id = identifier.trim();
    if (id.includes('@')) return this.prisma.user.findUnique({ where: { email: id.toLowerCase() } });
    const phone = normalizeBdPhone(id);
    return phone ? this.prisma.user.findUnique({ where: { phone } }) : null;
  }

  private async issue(user: User, meta: SessionMeta): Promise<Tokens> {
    const refreshToken = randomBytes(48).toString('base64url');
    const customer = user.role === 'CUSTOMER' ? await this.prisma.customer.findUnique({ where: { userId: user.id }, select: { id: true } }) : null;
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 400),
        expiresAt: new Date(Date.now() + this.config.get('JWT_REFRESH_TTL_DAYS') * 86_400_000),
      },
    });
    const claims: AccessClaims = { sub: user.id, role: user.role, name: user.name, cid: customer?.id ?? null, sid: session.id };
    const accessToken = await this.jwt.signAsync(claims, { issuer: 'cholo-api', audience: 'cholo' });
    const decoded = this.jwt.decode<{ exp: number; iat: number }>(accessToken);
    return { accessToken, refreshToken, expiresIn: decoded.exp - decoded.iat, tokenType: 'Bearer' };
  }
}
