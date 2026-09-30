import { Prisma } from '@prisma/client';

/** Retry serialization failures / deadlocks (P2034) with jittered backoff. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const retryable = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034';
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 30 * 2 ** i + Math.random() * 40));
    }
  }
  throw last;
}
