import { D, round2, type MoneyLike } from '@/common/utils/money';

const BN = '০১২৩৪৫৬৭৮৯';

/** "1,250.50" → "১,২৫০.৫০" */
export function bnDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => BN[Number(d)]);
}

/** Money for people: whole taka without decimals, otherwise 2dp, Indian grouping, Bangla digits. */
export function bnMoney(v: MoneyLike): string {
  const r = round2(v);
  const neg = r.isNegative();
  const abs = r.abs();
  const whole = abs.isInteger();
  const [int, frac] = abs.toFixed(2).split('.');
  const grouped = groupIndian(int);
  return `${neg ? '−' : ''}${bnDigits(whole ? grouped : `${grouped}.${frac}`)}`;
}

export function bnTaka(v: MoneyLike): string {
  return `৳${bnMoney(v)}`;
}

/** 1234567 → "12,34,567" */
function groupIndian(int: string): string {
  if (int.length <= 3) return int;
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

export function bnDateTime(at: Date): string {
  return at.toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
}

export function isZero(v: MoneyLike | null | undefined): boolean {
  return v == null || D(v).isZero();
}
