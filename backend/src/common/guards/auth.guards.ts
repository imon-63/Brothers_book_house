import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import type { UserRole } from '@prisma/client';
import { IS_PUBLIC, OPTIONAL_AUTH, ROLES } from '@/common/decorators/auth.decorators';
import { ForbiddenError, UnauthorizedError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';

/**
 * Global JWT guard: every route is protected unless marked @Public().
 * @OptionalAuth() routes accept anonymous callers but still decode a token.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(ctx: ExecutionContext) {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    return super.canActivate(ctx);
  }

  override handleRequest<TUser = AuthUser>(err: unknown, user: TUser | false, _info: unknown, ctx: ExecutionContext): TUser {
    const optional = this.reflector.getAllAndOverride<boolean>(OPTIONAL_AUTH, [ctx.getHandler(), ctx.getClass()]);
    if (err) throw err;
    if (!user) {
      if (optional) return undefined as TUser;
      throw new UnauthorizedError();
    }
    return user;
  }
}

/** Role check after authentication. OWNER can do everything. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!required?.length) return true;
    const user = ctx.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new UnauthorizedError();
    if (user.role === 'OWNER' || required.includes(user.role)) return true;
    throw new ForbiddenError();
  }
}
