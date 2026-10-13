import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { UserRole } from '@prisma/client';
import { AppConfig } from '@/config/app-config.service';
import { UnauthorizedError } from '@/common/errors/domain.error';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import type { AuthUser } from '@/common/types/auth-user';

export type AccessClaims = { sub: string; role: UserRole; name: string; cid: string | null; sid: string; mcp?: boolean };

const LIVE_TTL_MS = 10_000;

/**
 * Access-token check. The signature is verified statelessly; the session and the
 * account status are re-checked against the DB at most every few seconds, so
 * blocking a user or revoking a session takes effect almost immediately.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly live = new Map<string, { ok: boolean; at: number }>();

  constructor(
    config: AppConfig,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
      issuer: 'cholo-api',
      audience: 'cholo',
      algorithms: ['HS256'],
    });
  }

  async validate(claims: AccessClaims): Promise<AuthUser> {
    if (!(await this.isLive(claims.sid))) throw new UnauthorizedError('auth.session_revoked', 'অ্যাকাউন্টটি বন্ধ বা সেশন শেষ — আবার লগইন করুন');
    return { id: claims.sub, role: claims.role, name: claims.name, customerId: claims.cid, sessionId: claims.sid, mustChangePassword: !!claims.mcp };
  }

  private async isLive(sid: string): Promise<boolean> {
    const hit = this.live.get(sid);
    if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.ok;
    const s = await this.prisma.authSession.findUnique({ where: { id: sid }, select: { revokedAt: true, expiresAt: true, user: { select: { status: true, deletedAt: true } } } });
    const ok = !!s && !s.revokedAt && s.expiresAt > new Date() && s.user.status === 'ACTIVE' && !s.user.deletedAt;
    if (this.live.size > 5000) this.live.clear();
    this.live.set(sid, { ok, at: Date.now() });
    return ok;
  }
}
