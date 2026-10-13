import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, type ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { AppConfig } from '@/config/app-config.service';

/**
 * Rate limits the way real stores do it:
 *  • signed-in callers get their OWN budget, keyed by account — not by IP, so
 *    staff in one office or a family on one Wi-Fi never starve each other;
 *  • anonymous traffic is keyed by client IP (behind nginx, `trust proxy` = 1);
 *  • a token is only trusted for the key when its signature checks out, so a
 *    forged "sub" cannot be used to dodge the per-IP limit;
 *  • 429s carry Retry-After so clients can back off instead of hammering.
 * Brute-force-sensitive routes (login, register, password reset) keep their own
 * tight per-IP @Throttle limits, plus the account lockout in AuthService.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {
    super(options, storage, reflector);
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const auth = req.headers?.authorization as string | undefined;
    if (auth?.startsWith('Bearer ')) {
      try {
        const claims = await this.jwt.verifyAsync<{ sub: string }>(auth.slice(7), {
          secret: this.config.get('JWT_ACCESS_SECRET'),
          issuer: 'cholo-api',
          audience: 'cholo',
        });
        if (claims?.sub) return `u:${claims.sub}`;
      } catch {
        /* invalid/expired token → treat as anonymous */
      }
    }
    return `ip:${req.ip ?? req.ips?.[0] ?? 'unknown'}`;
  }
}
