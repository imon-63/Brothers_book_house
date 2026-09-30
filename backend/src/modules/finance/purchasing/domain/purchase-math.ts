import type { Prisma, SettlementStatus } from '@prisma/client';
import { D, round2, sum, ZERO, type MoneyLike } from '@/common/utils/money';

type Dec = Prisma.Decimal;

export type PurchaseLineInput = { productId: string; quantity: number; unitCost: MoneyLike };

/** Line totals and bill total, exactly as the DB CHECKs expect (line_total = qty × unit_cost). */
export function purchaseTotals(lines: PurchaseLineInput[], otherCharges: MoneyLike = 0) {
  const priced = lines.map((l) => {
    const unitCost = round2(l.unitCost);
    return { ...l, unitCost, lineTotal: unitCost.times(l.quantity) };
  });
  const subtotal = sum(priced.map((l) => l.lineTotal));
  const charges = round2(otherCharges);
  return { lines: priced, subtotal, otherCharges: charges, total: subtotal.plus(charges) };
}

/** Merge repeated products into one line (the admin UI does the same). Last cost wins. */
export function mergeLines(lines: PurchaseLineInput[]): PurchaseLineInput[] {
  const map = new Map<string, PurchaseLineInput>();
  for (const l of lines) {
    const hit = map.get(l.productId);
    map.set(l.productId, hit ? { productId: l.productId, quantity: hit.quantity + l.quantity, unitCost: l.unitCost } : { ...l });
  }
  return [...map.values()];
}

export function settlementStatus(total: MoneyLike, paid: MoneyLike): SettlementStatus {
  const p = D(paid);
  if (p.lessThanOrEqualTo(0)) return 'UNPAID';
  return p.greaterThanOrEqualTo(D(total)) ? 'PAID' : 'PARTIAL';
}

export function outstanding(total: MoneyLike, paid: MoneyLike): Dec {
  const d = D(total).minus(D(paid));
  return d.isNegative() ? ZERO : d;
}

export type PayCheck = { ok: true } | { ok: false; code: string; message: string };

export function checkPayment(total: MoneyLike, paid: MoneyLike, amount: MoneyLike): PayCheck {
  const a = D(amount);
  if (a.lessThanOrEqualTo(0)) return { ok: false, code: 'purchase.payment_invalid', message: 'টাকার পরিমাণ শূন্যের বেশি দিন' };
  const due = outstanding(total, paid);
  if (due.isZero()) return { ok: false, code: 'purchase.already_paid', message: 'এই বিল আগেই পুরো পরিশোধ হয়েছে' };
  if (a.greaterThan(due)) return { ok: false, code: 'purchase.overpayment', message: `বকেয়া ৳${due.toFixed(2)} — এর বেশি দেওয়া যাবে না` };
  return { ok: true };
}
