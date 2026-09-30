import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { UserRole } from '@prisma/client';
import { AppConfig } from '@/config/app-config.service';
import type { AuthUser } from '@/common/types/auth-user';

export type AccessClaims = { sub: string; role: UserRole; name: string; cid: string | null; sid: string };

/**
 * Stateless access-token check (no DB hit per request). Revocation is handled
 * by the short TTL + refresh rotation; disabling a user revokes their sessions.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: AppConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
      issuer: 'cholo-api',
      audience: 'cholo',
      algorithms: ['HS256'],
    });
  }

  validate(claims: AccessClaims): AuthUser {
    return { id: claims.sub, role: claims.role, name: claims.name, customerId: claims.cid, sessionId: claims.sid };
  }
}
