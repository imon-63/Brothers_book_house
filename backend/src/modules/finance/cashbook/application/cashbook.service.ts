import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { toPage, skipTake } from '@/common/dto/pagination.dto';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D, round2, sum, toNumber, ZERO } from '@/common/utils/money';
import { withRetry } from '@/common/utils/retry';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { lockOrderBooks } from '../../shared/application/order-books-lock';
import { dayRange, dhakaDay, eachDay, daySpan, parseWhen } from '../../shared/domain/dhaka-time';
import { kindAllowsDirection, opposite, rollDays, type DayTotals } from '../domain/cash-math';
import { settlementStatus } from '../../purchasing/domain/purchase-math';
import type { CashbookQueryDto, CodRemittanceDto, CourierPaymentDto, ManualEntryDto, ReverseEntryDto, TransferDto } from '../dto/cashbook.dto';
import { toCashTxn } from '../mappers/cash.mapper';
import { CashLedgerService } from './cash-ledger.service';

const include = { account: { select: { id: true, code: true, name: true } }, reversedBy: { select: { id: true } } } as const;

function when(input?: string) {
  const d = parseWhen(input);
  if (!d) throw new BusinessRuleError('cash.date_invalid', 'তারিখ সঠিক নয় (YYYY-MM-DD বা ISO সময় দিন)');
  if (d.getTime() > Date.now() + 5 * 60_000) throw new BusinessRuleError('cash.date_future', 'ভবিষ্যতের তারিখে এন্ট্রি দেওয়া যাবে না');
  return d;
}

@Injectable()
export class CashbookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: CashLedgerService,
    private readonly audit: AuditService,
  ) {}

  // ─────────── reads ───────────

  async list(q: CashbookQueryDto) {
    const where: Prisma.CashTransactionWhereInput = {
      accountId: q.accountId,
      kind: q.kind,
      direction: q.direction,
      orderId: q.orderId,
    };
    if (q.from || q.to) {
      where.occurredAt = {
        gte: q.from ? dayRange(q.from).start : undefined,
        lt: q.to ? dayRange(q.to).end : undefined,
      };
    }
    if (q.q) where.memo = { contains: q.q, mode: 'insensitive' };
    const [rows, total] = await Promise.all([
      this.prisma.cashTransaction.findMany({ where, include, orderBy: [{ occurredAt: q.order }, { createdAt: q.order }], ...skipTake(q) }),
      this.prisma.cashTransaction.count({ where }),
    ]);
    return toPage(rows.map(toCashTxn), total, q);
  }

  /** Opening (opening balances + everything before `start`) for one or all accounts. */
  private async openingBefore(start: Date, accountId?: string) {
    const acc = accountId ? Prisma.sql`AND a.id = ${accountId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ opening: Prisma.Decimal | null; moved: Prisma.Decimal | null }[]>`
      SELECT (SELECT COALESCE(SUM(a.opening_balance), 0) FROM cash_accounts a WHERE TRUE ${acc}) AS opening,
             (SELECT COALESCE(SUM(CASE WHEN t.direction = 'IN' THEN t.amount ELSE -t.amount END), 0)
                FROM cash_transactions t JOIN cash_accounts a ON a.id = t.account_id
               WHERE t.occurred_at < ${start} ${acc}) AS moved`;
    return D(rows[0]?.opening).plus(D(rows[0]?.moved));
  }

  private async perDay(start: Date, end: Date, accountId?: string) {
    const acc = accountId ? Prisma.sql`AND account_id = ${accountId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ day: string; in_amt: Prisma.Decimal | null; out_amt: Prisma.Decimal | null }[]>`
      SELECT to_char((occurred_at AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD') AS day,
             SUM(amount) FILTER (WHERE direction = 'IN')  AS in_amt,
             SUM(amount) FILTER (WHERE direction = 'OUT') AS out_amt
        FROM cash_transactions
       WHERE occurred_at >= ${start} AND occurred_at < ${end} ${acc}
    GROUP BY 1`;
    const map = new Map<string, DayTotals>();
    for (const r of rows) map.set(r.day, { in: D(r.in_amt), out: D(r.out_amt) });
    return map;
  }

  /** দিনের ক্লোজ: opening, in, out, closing — overall and per account — plus the day's entries. */
  @Traced('finance.cashbook.day_close')
  async dayClose(date = dhakaDay(), accountId?: string) {
    const { start, end } = dayRange(date);
    const accounts = await this.prisma.cashAccount.findMany({ where: accountId ? { id: accountId } : {}, orderBy: [{ createdAt: 'asc' }] });
    if (accountId && !accounts.length) throw new NotFoundError('CashAccount', accountId);
    const perAccount = await Promise.all(
      accounts.map(async (a) => {
        const [opening, days] = await Promise.all([this.openingBefore(start, a.id), this.perDay(start, end, a.id)]);
        const [row] = rollDays([date], opening, days);
        return { account: { id: a.id, code: a.code, name: a.name, isActive: a.isActive }, ...this.rowView(row) };
      }),
    );
    const entries = await this.prisma.cashTransaction.findMany({
      where: { occurredAt: { gte: start, lt: end }, accountId },
      include,
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
    const total = {
      opening: round2(sum(perAccount.map((a) => a.opening))).toNumber(),
      in: round2(sum(perAccount.map((a) => a.in))).toNumber(),
      out: round2(sum(perAccount.map((a) => a.out))).toNumber(),
      closing: round2(sum(perAccount.map((a) => a.closing))).toNumber(),
    };
    return { date, ...total, accounts: perAccount, entries: entries.map(toCashTxn), payables: await this.payables() };
  }

  /** Day-by-day close for a span (max ~400 days). */
  async daily(from: string, to: string, accountId?: string) {
    if (from > to) throw new BusinessRuleError('cash.range_invalid', 'শুরুর তারিখ শেষের পরে হতে পারে না');
    const span = daySpan(from, to);
    const [opening, days] = await Promise.all([this.openingBefore(span.start, accountId), this.perDay(span.start, span.end, accountId)]);
    return { from, to, accountId: accountId ?? null, days: rollDays(eachDay(from, to), opening, days).map((r) => this.rowView(r)) };
  }

  private rowView(r: { day: string; opening: Prisma.Decimal; in: Prisma.Decimal; out: Prisma.Decimal; closing: Prisma.Decimal }) {
    return { day: r.day, opening: toNumber(r.opening), in: toNumber(r.in), out: toNumber(r.out), closing: toNumber(r.closing) };
  }

  /** সাপ্লায়ার ও কুরিয়ার বকেয়া — shown under the day close, not counted in cash. */
  async payables() {
    const [sup] = await this.prisma.$queryRaw<{ due: Prisma.Decimal | null }[]>`
      SELECT COALESCE(SUM(total - amount_paid), 0) AS due FROM purchases WHERE status <> 'CANCELLED'`;
    const [cour] = await this.prisma.$queryRaw<{ accrued: Prisma.Decimal | null }[]>`
      SELECT COALESCE(SUM(CASE WHEN kind = 'INVOICE' THEN shipping_cost
                               WHEN kind = 'CREDIT_NOTE' AND reverse_courier THEN -shipping_cost ELSE 0 END), 0) AS accrued
        FROM financial_documents`;
    const [paid] = await this.prisma.$queryRaw<{ paid: Prisma.Decimal | null }[]>`
      SELECT COALESCE(SUM(CASE WHEN direction = 'OUT' THEN amount ELSE -amount END), 0) AS paid
        FROM cash_transactions WHERE kind = 'COURIER_PAYMENT'`;
    const courier = D(cour?.accrued).minus(D(paid?.paid));
    return { supplierDue: toNumber(sup?.due), courierDue: toNumber(courier.isNegative() ? ZERO : courier) };
  }

  // ─────────── commands ───────────

  @Traced('finance.cashbook.manual')
  async manualEntry(dto: ManualEntryDto, actor: AuthUser) {
    if (!kindAllowsDirection(dto.kind, dto.direction)) {
      throw new BusinessRuleError('cash.kind_direction', 'এই ধরনের এন্ট্রির দিক সঠিক নয়');
    }
    if (dto.kind === 'EXPENSE' && !dto.expenseCategory?.trim()) {
      throw new BusinessRuleError('cash.expense_category_required', 'খরচের খাত (প্যাকিং, বিজ্ঞাপন…) দিন');
    }
    const occurredAt = when(dto.occurredAt);
    return this.prisma.tx(async (tx) => {
      const t = await this.ledger.post(tx, {
        accountId: dto.accountId,
        direction: dto.direction,
        kind: dto.kind,
        amount: dto.amount,
        memo: dto.memo.trim(),
        expenseCategory: dto.expenseCategory?.trim() || null,
        occurredAt,
        actorId: actor.id,
      });
      await this.audit.record(
        { actor, action: 'CREATE', area: 'finance', entityType: 'CashTransaction', entityId: t.id, summary: `ক্যাশবুক: ${t.account.name} ${dto.direction === 'IN' ? 'ঢুকেছে' : 'বেরিয়েছে'} ৳${toNumber(t.amount)} — ${t.memo}`, after: { kind: t.kind, amount: toNumber(t.amount) } },
        tx,
      );
      return toCashTxn(t);
    });
  }

  @Traced('finance.cashbook.transfer')
  async transfer(dto: TransferDto, actor: AuthUser) {
    if (dto.fromAccountId === dto.toAccountId) throw new BusinessRuleError('cash.transfer_same', 'একই খাতে ট্রান্সফার হয় না');
    const occurredAt = when(dto.occurredAt);
    return this.prisma.tx(async (tx) => {
      const [from, to] = await Promise.all([this.ledger.account(tx, { accountId: dto.fromAccountId }), this.ledger.account(tx, { accountId: dto.toAccountId })]);
      const group = randomUUID();
      const memo = dto.memo?.trim() || `${from.name} → ${to.name}`;
      const out = await this.ledger.post(tx, { accountId: from.id, direction: 'OUT', kind: 'TRANSFER', amount: dto.amount, memo, transferGroupId: group, occurredAt, actorId: actor.id });
      const inn = await this.ledger.post(tx, { accountId: to.id, direction: 'IN', kind: 'TRANSFER', amount: dto.amount, memo, transferGroupId: group, occurredAt, actorId: actor.id });
      await this.audit.record(
        { actor, action: 'CREATE', area: 'finance', entityType: 'CashTransfer', entityId: group, summary: `ট্রান্সফার ৳${toNumber(out.amount)}: ${from.name} → ${to.name}` },
        tx,
      );
      return { transferGroupId: group, out: toCashTxn(out), in: toCashTxn(inn) };
    });
  }

  /** Corrections are new opposite entries (never edits). A transfer is reversed as a pair. */
  @Traced('finance.cashbook.reverse')
  async reverse(id: string, dto: ReverseEntryDto, actor: AuthUser) {
    const occurredAt = when(dto.occurredAt);
    try {
      return await withRetry(() =>
        this.prisma.tx(async (tx) => {
          const orig = await tx.cashTransaction.findUnique({ where: { id }, include });
          if (!orig) throw new NotFoundError('CashTransaction', id);
          if (orig.reversesId) throw new BusinessRuleError('cash.reverse_of_reversal', 'এটা নিজেই একটা উল্টো এন্ট্রি — আবার উল্টানো যাবে না');
          if (orig.reversedBy) throw new ConflictError('cash.already_reversed', 'এই এন্ট্রি আগেই উল্টানো হয়েছে');

          const legs = orig.transferGroupId
            ? await tx.cashTransaction.findMany({ where: { transferGroupId: orig.transferGroupId, reversesId: null }, include })
            : [orig];
          if (legs.some((l) => l.reversedBy)) throw new ConflictError('cash.already_reversed', 'এই ট্রান্সফার আগেই উল্টানো হয়েছে');
          const group = orig.transferGroupId ? randomUUID() : null;
          const created = [];
          for (const leg of legs) {
            created.push(
              await this.ledger.post(tx, {
                accountId: leg.accountId,
                direction: opposite(leg.direction),
                kind: leg.kind,
                amount: leg.amount,
                memo: `উল্টো: ${leg.memo} — ${dto.reason.trim()}`,
                expenseCategory: leg.expenseCategory,
                orderId: leg.orderId,
                purchaseId: leg.purchaseId,
                transferGroupId: group,
                reversesId: leg.id,
                occurredAt,
                actorId: actor.id,
              }),
            );
            if (leg.kind === 'PURCHASE_PAYMENT' && leg.purchaseId) await this.unpayPurchase(tx, leg.purchaseId, leg.direction === 'OUT' ? leg.amount : D(leg.amount).negated());
          }
          await this.audit.record(
            { actor, action: 'CREATE', area: 'finance', entityType: 'CashTransaction', entityId: orig.id, summary: `ক্যাশবুক এন্ট্রি উল্টানো: ${orig.memo} (৳${toNumber(orig.amount)}) — ${dto.reason.trim()}` },
            tx,
          );
          return { reversed: legs.map((l) => l.id), entries: created.map(toCashTxn) };
        }),
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictError('cash.already_reversed', 'এই এন্ট্রি আগেই উল্টানো হয়েছে');
      throw e;
    }
  }

  /** Reversing a supplier payment puts the amount back on the bill. */
  private async unpayPurchase(tx: Tx, purchaseId: string, amount: Prisma.Decimal) {
    const [p] = await tx.$queryRaw<{ total: Prisma.Decimal; amount_paid: Prisma.Decimal }[]>`
      SELECT total, amount_paid FROM purchases WHERE id = ${purchaseId}::uuid FOR UPDATE`;
    if (!p) return;
    let paid = D(p.amount_paid).minus(amount);
    if (paid.isNegative()) paid = ZERO;
    if (paid.greaterThan(p.total)) paid = D(p.total);
    await tx.purchase.update({ where: { id: purchaseId }, data: { amountPaid: paid, paymentStatus: settlementStatus(p.total, paid) } });
  }

  /** কুরিয়ার পরিশোধ for one order (OUT COURIER_PAYMENT). */
  @Traced('finance.cashbook.courier_payment')
  async courierPayment(dto: CourierPaymentDto, actor: AuthUser) {
    const occurredAt = when(dto.occurredAt);
    return this.prisma.tx(async (tx) => {
      await lockOrderBooks(tx, dto.orderId);
      const order = await tx.order.findUnique({ where: { id: dto.orderId }, select: { id: true, orderNo: true, courierCost: true, status: true } });
      if (!order) throw new NotFoundError('Order', dto.orderId);
      if (order.status === 'PENDING') throw new BusinessRuleError('cash.courier_order_pending', 'অর্ডার এখনো নিশ্চিত হয়নি');
      if (await this.ledger.has(tx, { orderId: order.id, kind: 'COURIER_PAYMENT', direction: 'OUT' })) {
        throw new ConflictError('cash.courier_already_paid', `${order.orderNo} — কুরিয়ার আগেই পরিশোধ হয়েছে`);
      }
      const amount = dto.amount != null ? D(dto.amount) : D(order.courierCost);
      if (amount.lessThanOrEqualTo(0)) throw new BusinessRuleError('cash.courier_cost_missing', 'এই অর্ডারে কুরিয়ার খরচ নেই — টাকার পরিমাণ দিন');
      const t = await this.ledger.post(tx, {
        accountId: dto.accountId,
        direction: 'OUT',
        kind: 'COURIER_PAYMENT',
        amount,
        memo: dto.memo?.trim() || `কুরিয়ার ${order.orderNo}`,
        orderId: order.id,
        occurredAt,
        actorId: actor.id,
      });
      await this.audit.record(
        { actor, action: 'CREATE', area: 'finance', entityType: 'CashTransaction', entityId: t.id, summary: `কুরিয়ার পরিশোধ ${order.orderNo} ৳${toNumber(amount)}` },
        tx,
      );
      return toCashTxn(t);
    });
  }

  /**
   * The courier paid us collected COD.
   *
   * Without shipments: a plain IN (COD_REMITTANCE) to the chosen account.
   *
   * With shipments: COD money is booked into the `cash` account when the order
   * is delivered/paid (see the documents listener), so the settlement must not
   * count it twice. For each shipment we (1) book its COD into `cash` if that
   * has not happened yet, (2) move the money received from `cash` to the chosen
   * account as a TRANSFER pair (skipped when it IS the cash account), (3) book
   * what the courier kept (Σ COD − received) as COURIER_PAYMENT from `cash`,
   * and (4) mark the shipments' COD REMITTED (only the cod_* fields are touched).
   */
  @Traced('finance.cashbook.cod_remittance')
  async codRemittance(dto: CodRemittanceDto, actor: AuthUser) {
    const occurredAt = when(dto.occurredAt);
    return withRetry(() =>
      this.prisma.tx(async (tx) => {
        const dest = await this.ledger.account(tx, { accountId: dto.accountId });
        const received = round2(dto.amount);
        const memoBase = dto.memo?.trim() || 'কুরিয়ার COD সেটলমেন্ট';

        if (!dto.shipmentIds?.length) {
          const t = await this.ledger.post(tx, { accountId: dest.id, direction: 'IN', kind: 'COD_REMITTANCE', amount: received, memo: memoBase, occurredAt, actorId: actor.id });
          await this.audit.record({ actor, action: 'CREATE', area: 'finance', entityType: 'CashTransaction', entityId: t.id, summary: `COD সেটলমেন্ট ৳${toNumber(received)} → ${dest.name}` }, tx);
          return { entries: [toCashTxn(t)], shipments: [] as string[], deducted: 0 };
        }

        const shipments = await tx.$queryRaw<{ id: string; order_id: string; order_no: string; cod_amount: Prisma.Decimal; cod_status: string; courier_id: string }[]>`
          SELECT s.id, s.order_id, o.order_no, s.cod_amount, s.cod_status::text AS cod_status, s.courier_id
            FROM shipments s JOIN orders o ON o.id = s.order_id
           WHERE s.id = ANY(${dto.shipmentIds}::uuid[])
             FOR UPDATE OF s`;
        const missing = dto.shipmentIds.filter((id) => !shipments.some((s) => s.id === id));
        if (missing.length) throw new NotFoundError('Shipment', missing[0]);
        const bad = shipments.find((s) => s.cod_status === 'REMITTED' || s.cod_status === 'NOT_APPLICABLE' || D(s.cod_amount).lessThanOrEqualTo(0));
        if (bad) throw new BusinessRuleError('cash.cod_not_remittable', `${bad.order_no} — COD নেই বা আগেই সেটল হয়েছে`, { shipmentId: bad.id });

        const due = sum(shipments.map((s) => s.cod_amount));
        if (received.greaterThan(due)) {
          throw new BusinessRuleError('cash.cod_overpaid', `এই চালানগুলোর COD ৳${due.toFixed(2)} — এর বেশি দেখানো যাবে না`);
        }
        const entries = [];
        for (const s of shipments) {
          await lockOrderBooks(tx, s.order_id);
          if (!(await this.ledger.has(tx, { orderId: s.order_id, kind: 'COD_REMITTANCE', direction: 'IN' }))) {
            entries.push(await this.ledger.post(tx, { accountCode: 'cash', direction: 'IN', kind: 'COD_REMITTANCE', amount: s.cod_amount, memo: `ক্যাশ অন ${s.order_no}`, orderId: s.order_id, occurredAt, actorId: actor.id }));
          }
        }
        const cash = await this.ledger.account(tx, { accountCode: 'cash' }, { allowInactive: true });
        if (dest.id !== cash.id) {
          const group = randomUUID();
          const memo = `${memoBase} · ক্যাশ → ${dest.name}`;
          entries.push(await this.ledger.post(tx, { accountId: cash.id, direction: 'OUT', kind: 'TRANSFER', amount: received, memo, transferGroupId: group, occurredAt, actorId: actor.id }));
          entries.push(await this.ledger.post(tx, { accountId: dest.id, direction: 'IN', kind: 'TRANSFER', amount: received, memo, transferGroupId: group, occurredAt, actorId: actor.id }));
        }
        const deducted = due.minus(received);
        if (deducted.greaterThan(0)) {
          entries.push(await this.ledger.post(tx, { accountId: cash.id, direction: 'OUT', kind: 'COURIER_PAYMENT', amount: deducted, memo: `${memoBase} · কুরিয়ার চার্জ কাটা`, occurredAt, actorId: actor.id }));
        }
        const now = new Date();
        await tx.shipment.updateMany({ where: { id: { in: dto.shipmentIds } }, data: { codStatus: 'REMITTED', codRemittedAt: occurredAt } });
        await tx.shipment.updateMany({ where: { id: { in: dto.shipmentIds }, codCollectedAt: null }, data: { codCollectedAt: now } });
        await this.audit.record(
          {
            actor,
            action: 'CREATE',
            area: 'finance',
            entityType: 'CodRemittance',
            entityId: dto.shipmentIds[0],
            summary: `COD সেটলমেন্ট ৳${toNumber(received)} (${shipments.length}টি চালান) → ${dest.name}${deducted.greaterThan(0) ? ` · কুরিয়ার কেটেছে ৳${toNumber(deducted)}` : ''}`,
            after: { shipments: dto.shipmentIds, received: toNumber(received), due: toNumber(due) },
          },
          tx,
        );
        return { entries: entries.map(toCashTxn), shipments: dto.shipmentIds, deducted: toNumber(deducted) };
      }),
    );
  }
}

