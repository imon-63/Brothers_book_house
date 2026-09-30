const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** "০১৭১১" → "01711" */
export function asciiDigits(s: string): string {
  return s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

/**
 * Normalise any Bangladeshi mobile input to E.164.
 *   "01711-111111", "+880 1711111111", "৮৮০১৭১১১১১১১১" → "+8801711111111"
 * Returns null when it is not a valid BD mobile number.
 */
export function normalizeBdPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = asciiDigits(input).replace(/\D/g, '');
  if (d.startsWith('880')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^1[3-9]\d{8}$/.test(d) ? `+880${d}` : null;
}

/** "+8801711111111" → "01711111111" (display / courier APIs). */
export function localPhone(e164: string): string {
  return e164.startsWith('+880') ? `0${e164.slice(4)}` : e164;
}

/**
 * URL slug that keeps Bangla letters (browsers show them fine) and makes
 * everything else kebab-case: "নবম-দশম পদার্থবিজ্ঞান" → "নবম-দশম-পদার্থবিজ্ঞান".
 */
export function slugify(input: string): string {
  return input
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export function padNo(prefix: string, n: number | bigint, width: number): string {
  return `${prefix}${String(n).padStart(width, '0')}`;
}
