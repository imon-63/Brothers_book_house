import type { UserRole } from '@prisma/client';

/** What the JWT guard attaches to `req.user`. */
export type AuthUser = {
  id: string;
  role: UserRole;
  name: string;
  customerId: string | null;
  sessionId: string;
  /** logged in with a temporary password — only auth routes until it is changed */
  mustChangePassword?: boolean;
};

export const STAFF_ROLES: UserRole[] = ['OWNER', 'ADMIN', 'MANAGER', 'SUPPORT', 'ACCOUNTANT', 'WAREHOUSE'];

export function isStaff(user?: Pick<AuthUser, 'role'> | null) {
  return !!user && STAFF_ROLES.includes(user.role);
}
