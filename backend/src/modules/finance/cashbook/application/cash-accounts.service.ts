import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { round2, toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import type { CreateCashAccountDto, UpdateCashAccountDto } from '../dto/cashbook.dto';
import { toAccount, toAccountWithBalance, type BalanceRow } from '../mappers/cash.mapper';

@Injectable()
export class CashAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Accounts with live balances (v_cash_balances = opening + Σ IN − Σ OUT). */
  async list(opts: { includeInactive?: boolean } = {}) {
    const rows = await this.balances();
    const items = rows.filter((r) => opts.includeInactive || r.is_active).map(toAccountWithBalance);
    const total = items.filter((a) => a.isActive).reduce((s, a) => s + a.balance, 0);
    return { items, totalBalance: Math.round(total * 100) / 100 };
  }

  balances() {
    return this.prisma.$queryRaw<BalanceRow[]>`
      SELECT b.id, b.code, b.name, b.type::text AS type, a.account_no, a.is_active, a.opening_balance, b.balance
        FROM v_cash_balances b JOIN cash_accounts a ON a.id = b.id
    ORDER BY a.created_at, a.code`;
  }

  async create(dto: CreateCashAccountDto, actor: AuthUser) {
    try {
      return await this.prisma.tx(async (tx) => {
        const acc = await tx.cashAccount.create({
          data: { code: dto.code, name: dto.name.trim(), type: dto.type, accountNo: dto.accountNo ?? null, openingBalance: round2(dto.openingBalance ?? 0) },
        });
        await this.audit.record(
          { actor, action: 'CREATE', area: 'finance', entityType: 'CashAccount', entityId: acc.id, summary: `নতুন খাত "${acc.name}" খোলা হয়েছে`, after: { code: acc.code, type: acc.type, openingBalance: toNumber(acc.openingBalance) } },
          tx,
        );
        return toAccount(acc);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictError('cash.account_code_taken', `"${dto.code}" কোডের খাত আগেই আছে`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCashAccountDto, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.cashAccount.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('CashAccount', id);
      if (dto.openingBalance !== undefined && !round2(dto.openingBalance).equals(cur.openingBalance)) {
        const used = await tx.cashTransaction.count({ where: { accountId: id } });
        if (used) throw new BusinessRuleError('cash.opening_locked', 'লেনদেন হয়ে গেছে — অপেনিং ব্যালান্স বদলানো যাবে না, সমন্বয় এন্ট্রি দিন');
      }
      const patch = {
        name: dto.name?.trim(),
        accountNo: dto.accountNo,
        isActive: dto.isActive,
        openingBalance: dto.openingBalance === undefined ? undefined : round2(dto.openingBalance),
      };
      const diff = AuditService.diff(cur as unknown as Record<string, unknown>, patch);
      if (!diff.changed.length) return toAccount(cur);
      const acc = await tx.cashAccount.update({ where: { id }, data: patch });
      await this.audit.record(
        { actor, action: 'UPDATE', area: 'finance', entityType: 'CashAccount', entityId: id, summary: `খাত "${acc.name}" হালনাগাদ (${diff.changed.join(', ')})`, before: diff.before, after: diff.after },
        tx,
      );
      return toAccount(acc);
    });
  }

  setActive(id: string, isActive: boolean, actor: AuthUser) {
    return this.update(id, { isActive }, actor);
  }
}
