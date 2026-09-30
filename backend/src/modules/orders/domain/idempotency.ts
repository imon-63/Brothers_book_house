import { createHash } from 'node:crypto';

/**
 * Deterministic JSON: object keys sorted, `undefined` dropped, arrays kept in
 * order. Two semantically equal requests always serialise the same way.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : stableStringify(v))).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** sha256 over scope + caller + body — a replayed key with a different body is rejected. */
export function hashRequest(scope: string, caller: string, body: unknown): string {
  return createHash('sha256').update(`${scope}\n${caller}\n${stableStringify(body)}`).digest('hex');
}

/** Keys are client supplied: keep them printable and bounded (column is varchar(80)). */
export function isValidIdempotencyKey(key: string | undefined | null): key is string {
  return !!key && /^[A-Za-z0-9._:-]{8,80}$/.test(key);
}
