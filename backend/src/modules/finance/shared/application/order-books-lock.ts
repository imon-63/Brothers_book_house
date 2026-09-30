import type { Tx } from '@/infrastructure/prisma/prisma.service';

/**
 * Serialise all book-keeping for one order (documents, COD cash, courier
 * payments, refunds) with a transaction-scoped advisory lock. Using an
 * advisory lock instead of `SELECT … FOR UPDATE` on orders keeps us out of
 * the orders module's own row locks / optimistic versioning.
 */
export async function lockOrderBooks(tx: Tx, orderId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'books:' + orderId}))`;
}
