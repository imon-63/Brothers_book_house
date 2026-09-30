import { normalizeBdPhone } from '@/common/utils/text';

/** BD SMS gateways (BulkSMSBD & co.) want 8801XXXXXXXXX without "+". */
export function toBdSmsNumber(input: string): string | null {
  const e164 = normalizeBdPhone(input);
  return e164 ? e164.slice(1) : null;
}
