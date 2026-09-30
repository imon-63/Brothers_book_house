import type { CashDirection, CashTxnKind, PaymentMethod, Prisma } from '@prisma/client';
import { D, ZERO, type MoneyLike } from '@/common/utils/money';

type Dec = Prisma.Decimal;

export function signed(direction: CashDirection, amount: MoneyLike): Dec {
  return direction === 'IN' ? D(amount) : D(amount).negated();
}

export function opposite(direction: CashDirection): CashDirection {
  return direction === 'IN' ? 'OUT' : 'IN';
}

export type DayTotals = { in: Dec; out: Dec };
export type DayCloseRow = { day: string; opening: Dec; in: Dec; out: Dec; closing: Dec };

/**
 * দিনের ক্লোজ over a run of days: each day's opening is the previous day's
 * closing. `openingBefore` = account opening balances + every entry before the
 * first day; `perDay` holds the IN/OUT sums keyed by Dhaka day.
 */
export function rollDays(days: string[], openingBefore: MoneyLike, perDay: Map<string, DayTotals>): DayCloseRow[] {
  let running = D(openingBefore);
  return days.map((day) => {
    const t = perDay.get(day) ?? { in: ZERO, out: ZERO };
    const opening = running;
    const closing = opening.plus(t.in).minus(t.out);
    running = closing;
    return { day, opening, in: t.in, out: t.out, closing };
  });
}

/** System account codes the automatic postings rely on. */
export type SystemAccountCode = 'cash' | 'bkash' | 'nagad' | 'bank' | 'sslcommerz';

export const SYSTEM_ACCOUNTS: Record<SystemAccountCode, { name: string; type: 'CASH' | 'MOBILE_WALLET' | 'BANK' | 'GATEWAY' }> = {
  cash: { name: 'ক্যাশ', type: 'CASH' },
  bkash: { name: 'বিকাশ', type: 'MOBILE_WALLET' },
  nagad: { name: 'নগদ', type: 'MOBILE_WALLET' },
  bank: { name: 'ব্যাংক', type: 'BANK' },
  sslcommerz: { name: 'SSLCOMMERZ', type: 'GATEWAY' },
};

/** Which account money for a payment method moves through (refunds, receipts). */
export function accountForMethod(method: PaymentMethod): SystemAccountCode {
  switch (method) {
    case 'SSLCOMMERZ':
      return 'sslcommerz';
    case 'BKASH':
      return 'bkash';
    case 'NAGAD':
      return 'nagad';
    case 'BANK_TRANSFER':
      return 'bank';
    default:
      return 'cash';
  }
}

/** Kinds staff may post by hand; the rest are written by the system flows. */
export const MANUAL_KINDS: readonly CashTxnKind[] = ['EXPENSE', 'MANUAL', 'OWNER_CAPITAL', 'OWNER_DRAW', 'COURIER_LOSS', 'GATEWAY_SETTLEMENT'];

export function kindAllowsDirection(kind: CashTxnKind, direction: CashDirection): boolean {
  if (kind === 'EXPENSE' || kind === 'OWNER_DRAW' || kind === 'COURIER_LOSS') return direction === 'OUT';
  if (kind === 'OWNER_CAPITAL') return direction === 'IN';
  return true;
}

export const KIND_LABEL: Record<CashTxnKind, string> = {
  GATEWAY_SETTLEMENT: 'গেটওয়ে',
  COD_REMITTANCE: 'ক্যাশ অন ডেলিভারি',
  GATEWAY_FEE: 'গেটওয়ে ফি',
  PURCHASE_PAYMENT: 'ক্রয় পরিশোধ',
  REFUND: 'ফেরত',
  COURIER_PAYMENT: 'কুরিয়ার পরিশোধ',
  COURIER_LOSS: 'কুরিয়ার লস',
  EXPENSE: 'খরচ',
  TRANSFER: 'ট্রান্সফার',
  OWNER_CAPITAL: 'মালিকের পুঁজি',
  OWNER_DRAW: 'মালিকের উত্তোলন',
  MANUAL: 'হাতে লেখা',
};
