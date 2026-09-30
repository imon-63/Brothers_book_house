import { Injectable } from '@nestjs/common';
import type { CashAccount, CashDirection, CashTxnKind, PaymentMethod } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import { D, round2, type MoneyLike } from '@/common/utils/money';
import type { Tx } from '@/infrastructure/prisma/prisma.service';
import { accountForMethod, SYSTEM_ACCOUNTS, type SystemAccountCode } from '../domain/cash-math';

export type AccountRef = { accountId: string } | { accountCode: SystemAccountCode | string };

export type PostEntry = AccountRef & {
  direction: CashDirection;
  kind: CashTxnKind;
  amount: MoneyLike;
  memo: string;
  expenseCategory?: string | null;
  orderId?: string | null;
  purchaseId?: string | null;
  transferGroupId?: string | null;
  reversesId?: string | null;
  occurredAt?: Date;
  actorId?: string | null;
};

/**
 * The only writer of cash_transactions (append-only). Exported so other
 * modules (payments → refunds / gateway captures) can post inside THEIR
 * transaction and commit atomically with the business change.
 */
@Injectable()
export class CashLedgerService {
  /** Resolve an account; the five system accounts are created on first use. */
  async account(tx: Tx, ref: AccountRef, opts: { allowInactive?: boolean } = {}): Promise<CashAccount> {
    let acc: CashAccount | null;
    if ('accountId' in ref) {
      acc = await tx.cashAccount.findUnique({ where: { id: ref.accountId } });
      if (!acc) throw new NotFoundError('CashAccount', ref.accountId);
    } else {
      const sys = SYSTEM_ACCOUNTS[ref.accountCode as SystemAccountCode];
      acc = sys
        ? await tx.cashAccount.upsert({ where: { code: ref.accountCode }, update: {}, create: { code: ref.accountCode, name: sys.name, type: sys.type } })
        : await tx.cashAccount.findUnique({ where: { code: ref.accountCode } });
      if (!acc) throw new NotFoundError('CashAccount', ref.accountCode);
    }
    if (!acc.isActive && !opts.allowInactive) {
      throw new BusinessRuleError('cash.account_inactive', `${acc.name} খাতটি বন্ধ — এতে এন্ট্রি দেওয়া যাবে না`);
    }
    return acc;
  }

  async post(tx: Tx, e: PostEntry) {
    const amount = round2(e.amount);
    if (amount.lessThanOrEqualTo(0)) throw new BusinessRuleError('cash.amount_invalid', 'টাকার পরিমাণ শূন্যের বেশি দিন');
    const acc = await this.account(tx, e, { allowInactive: Boolean(e.reversesId) });
    return tx.cashTransaction.create({
      data: {
        accountId: acc.id,
        direction: e.direction,
        kind: e.kind,
        amount,
        memo: e.memo.slice(0, 500),
        expenseCategory: e.expenseCategory ?? null,
        orderId: e.orderId ?? null,
        purchaseId: e.purchaseId ?? null,
        transferGroupId: e.transferGroupId ?? null,
        reversesId: e.reversesId ?? null,
        occurredAt: e.occurredAt ?? new Date(),
        createdById: e.actorId ?? null,
      },
      include: { account: { select: { id: true, code: true, name: true } } },
    });
  }

  /** Is there a live (not reversed, not itself a reversal) entry matching? */
  async has(tx: Tx, where: { orderId?: string; purchaseId?: string; kind: CashTxnKind; direction?: CashDirection; memo?: string }) {
    const hit = await tx.cashTransaction.findFirst({
      where: { ...where, reversesId: null, reversedBy: { is: null } },
      select: { id: true },
    });
    return Boolean(hit);
  }

  /** Σ live amounts matching (reversals netted out by excluding both legs). */
  async total(tx: Tx, where: { orderId?: string; kind: CashTxnKind; direction?: CashDirection }) {
    const agg = await tx.cashTransaction.aggregate({ where: { ...where, reversesId: null, reversedBy: { is: null } }, _sum: { amount: true } });
    return D(agg._sum.amount);
  }

  /**
   * SSLCOMMERZ captured a payment: IN to the gateway balance (GATEWAY_SETTLEMENT)
   * and OUT its fee (GATEWAY_FEE). Idempotent per tran_id.
   */
  async recordGatewayCapture(tx: Tx, p: { orderId: string; orderNo: string; tranId: string; amount: MoneyLike; fee: MoneyLike; at?: Date }) {
    const memo = `SSL ${p.orderNo} · ${p.tranId}`;
    if (await this.has(tx, { orderId: p.orderId, kind: 'GATEWAY_SETTLEMENT', direction: 'IN', memo })) return;
    await this.post(tx, { accountCode: 'sslcommerz', direction: 'IN', kind: 'GATEWAY_SETTLEMENT', amount: p.amount, memo, orderId: p.orderId, occurredAt: p.at });
    if (D(p.fee).greaterThan(0)) {
      await this.post(tx, { accountCode: 'sslcommerz', direction: 'OUT', kind: 'GATEWAY_FEE', amount: p.fee, memo: `SSL ফি ${p.orderNo} · ${p.tranId}`, orderId: p.orderId, occurredAt: p.at });
    }
  }

  /** Money returned to the customer: OUT REFUND from the account the method uses. */
  async recordRefund(tx: Tx, p: { orderId: string; orderNo: string; refundId: string; method: PaymentMethod; amount: MoneyLike; at?: Date; actorId?: string | null }) {
    const memo = `ফেরত ${p.orderNo} · ${p.refundId.slice(0, 8)}`;
    if (await this.has(tx, { orderId: p.orderId, kind: 'REFUND', memo })) return;
    await this.post(tx, {
      accountCode: accountForMethod(p.method),
      direction: 'OUT',
      kind: 'REFUND',
      amount: p.amount,
      memo,
      orderId: p.orderId,
      occurredAt: p.at,
      actorId: p.actorId,
    });
  }
}
