import { D, type MoneyLike } from '@/common/utils/money';

const BN = '০১২৩৪৫৬৭৮৯';

/** 500 → "৫০০" (same as the storefront's `bn()`). */
export function bnDigits(v: number | string): string {
  return String(v).replace(/\d/g, (d) => BN[Number(d)] ?? d);
}

/** 500 → "৳৫০০", 49.5 → "৳৪৯.৫০" (whole taka print without paisa). */
export function takaBn(v: MoneyLike): string {
  const d = D(v);
  const txt = d.isInteger() ? d.toFixed(0) : d.toFixed(2);
  return `৳${bnDigits(txt)}`;
}
