import { createHash, timingSafeEqual } from 'node:crypto';

const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

/**
 * SSLCOMMERZ IPN / callback hash check (same algorithm as their PHP/Node SDKs):
 *
 *   keys   = verify_key.split(',')
 *   data   = { k: payload[k] for k in keys } + { store_passwd: md5(store_passwd) }
 *   string = sorted(data).map(k => `${k}=${data[k]}`).join('&')
 *   valid  = md5(string) === verify_sign
 *
 * A missing field hashes as an empty string (PHP null concatenation).
 */
export function computeSslSignature(payload: Record<string, unknown>, storePassword: string): string | null {
  const verifyKey = str(payload.verify_key);
  if (!verifyKey) return null;
  const data: Record<string, string> = {};
  for (const k of verifyKey.split(',')) {
    const key = k.trim();
    if (key) data[key] = str(payload[key]);
  }
  data.store_passwd = md5(storePassword);
  const hashString = Object.keys(data)
    .sort()
    .map((k) => `${k}=${data[k]}`)
    .join('&');
  return md5(hashString);
}

export function verifySslSignature(payload: Record<string, unknown>, storePassword: string): boolean {
  const sign = str(payload.verify_sign).toLowerCase();
  const expected = computeSslSignature(payload, storePassword);
  if (!sign || !expected || sign.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sign), Buffer.from(expected));
}

function str(v: unknown): string {
  if (v == null) return '';
  return typeof v === 'string' ? v : String(v);
}
