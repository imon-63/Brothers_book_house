/**
 * Outbox retry policy: exponential backoff 30s · 1m · 2m · 4m … capped at 6h,
 * with optional ±20 % jitter so a provider outage doesn't produce a
 * synchronized retry storm. After MAX_ATTEMPTS the row is FAILED for good.
 */
export const OUTBOX_POLICY = {
  maxAttempts: 8,
  baseDelayMs: 30_000,
  maxDelayMs: 6 * 3_600_000,
  jitter: 0.2,
  /** a row stuck in SENDING longer than this is assumed orphaned (crash) and retried */
  stuckAfterMs: 10 * 60_000,
} as const;

/** Delay before retry number `attempt` (1 = first retry after the first failure). */
export function backoffDelayMs(attempt: number, random: () => number = () => 0.5): number {
  const exp = OUTBOX_POLICY.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exp, OUTBOX_POLICY.maxDelayMs);
  const factor = 1 + OUTBOX_POLICY.jitter * (random() * 2 - 1);
  return Math.round(Math.min(capped * factor, OUTBOX_POLICY.maxDelayMs));
}

export type FailureDecision = { status: 'FAILED'; nextAttemptAt: null } | { status: 'PENDING'; nextAttemptAt: Date };

/**
 * What to do after attempt number `attempts` failed. Non-retryable errors
 * (bad number, unknown template, 4xx) fail immediately.
 */
export function afterFailure(attempts: number, retryable: boolean, now: Date = new Date(), random?: () => number): FailureDecision {
  if (!retryable || attempts >= OUTBOX_POLICY.maxAttempts) return { status: 'FAILED', nextAttemptAt: null };
  return { status: 'PENDING', nextAttemptAt: new Date(now.getTime() + backoffDelayMs(attempts, random)) };
}
