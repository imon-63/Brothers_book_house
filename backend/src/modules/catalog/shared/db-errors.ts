import { Prisma } from '@prisma/client';

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : '';
}

/** A Postgres exclusion/check constraint (by name) raised through Prisma. */
export function isConstraintViolation(err: unknown, constraint: string): boolean {
  const meta = err instanceof Prisma.PrismaClientKnownRequestError ? JSON.stringify(err.meta ?? {}) : '';
  return messageOf(err).includes(constraint) || meta.includes(constraint);
}

/** Unique violation (P2002), optionally on a given column. */
export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  if (!field) return true;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? '').includes(field);
}
