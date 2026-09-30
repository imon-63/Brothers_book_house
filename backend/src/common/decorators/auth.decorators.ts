import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { AuthUser } from '@/common/types/auth-user';

export const IS_PUBLIC = 'auth:public';
export const ROLES = 'auth:roles';
export const OPTIONAL_AUTH = 'auth:optional';

/** Route needs no login. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route works for guests but attaches `req.user` when a valid token is sent (checkout, cart). */
export const OptionalAuth = () => SetMetadata(OPTIONAL_AUTH, true);

/** Restrict to roles. OWNER always passes. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES, roles);

/** Common role sets, so controllers read like policy. */
export const Staff = () => Roles('ADMIN', 'MANAGER', 'SUPPORT', 'ACCOUNTANT', 'WAREHOUSE');
export const Managers = () => Roles('ADMIN', 'MANAGER');
export const Finance = () => Roles('ADMIN', 'MANAGER', 'ACCOUNTANT');
export const Fulfilment = () => Roles('ADMIN', 'MANAGER', 'WAREHOUSE', 'SUPPORT');

/** Inject the authenticated user (or undefined on optional-auth routes). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest().user as AuthUser | undefined;
});
