import type { CashAccount, CashTransaction, Prisma } from '@prisma/client';
import { toNumber } from '@/common/utils/money';
import { KIND_LABEL, signed } from '../domain/cash-math';

type TxnRow = CashTransaction & {
  account?: { id: string; code: string; name: string } | null;
  reversedBy?: { id: string } | null;
};

export function toCashTxn(t: TxnRow) {
  return {
    id: t.id,
    account: t.account ? { id: t.account.id, code: t.account.code, name: t.account.name } : { id: t.accountId },
    direction: t.direction,
    kind: t.kind,
    kindLabel: KIND_LABEL[t.kind],
    amount: toNumber(t.amount),
    signedAmount: toNumber(signed(t.direction, t.amount)),
    memo: t.memo,
    expenseCategory: t.expenseCategory,
    orderId: t.orderId,
    purchaseId: t.purchaseId,
    transferGroupId: t.transferGroupId,
    reversesId: t.reversesId,
    reversedById: t.reversedBy?.id ?? null,
    occurredAt: t.occurredAt,
    createdById: t.createdById,
    createdAt: t.createdAt,
  };
}

export type BalanceRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  account_no: string | null;
  is_active: boolean;
  opening_balance: Prisma.Decimal;
  balance: Prisma.Decimal;
};

export function toAccountWithBalance(r: BalanceRow) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    accountNo: r.account_no,
    isActive: r.is_active,
    openingBalance: toNumber(r.opening_balance),
    balance: toNumber(r.balance),
  };
}

export function toAccount(a: CashAccount) {
  return {
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    accountNo: a.accountNo,
    isActive: a.isActive,
    openingBalance: toNumber(a.openingBalance),
    createdAt: a.createdAt,
  };
}
