import { Injectable } from '@nestjs/common';
import type { OrderStatus, Prisma } from '@prisma/client';
import { BusinessRuleError, DomainError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { orderRef } from '../domain/order-filters';
import { nextStatus } from '../domain/order-status';
import type { BulkStatusDto } from '../dto/admin-orders.dto';
import { OrderPaymentService } from './order-payment.service';
import { OrderTransitionService } from './order-transition.service';

export type BulkResult = { id: string; orderNo?: string; ok: boolean; status?: OrderStatus; error?: { code: string; message: string } };

/** Bulk actions: each order in its own transaction → partial success with per-order results. */
@Injectable()
export class OrderBulkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: OrderTransitionService,
    private readonly payments: OrderPaymentService,
  ) {}

  @Traced('orders.bulk.status')
  async status(dto: BulkStatusDto, user: AuthUser) {
    if (dto.action === 'set' && !dto.to) throw new BusinessRuleError('bulk.to_required', 'কোন ধাপে নেবেন, সেটি দিন');
    return this.run(dto.ids, async (id) => {
      const where = orderRef(id);
      const cur = where ? await this.prisma.order.findUnique({ where: where as Prisma.OrderWhereUniqueInput, select: { status: true } }) : null;
      if (!cur) throw new BusinessRuleError('order.not_found', 'অর্ডার পাওয়া যায়নি');
      const to = dto.action === 'confirm' ? 'CONFIRMED' : dto.action === 'advance' ? nextStatus(cur.status) : dto.to!;
      if (dto.action === 'confirm' && cur.status !== 'PENDING') throw new BusinessRuleError('order.not_pending', 'অর্ডারটি অপেক্ষমাণ নয়');
      if (!to) throw new BusinessRuleError('order.no_next_step', 'এর পরে আর ধাপ নেই');
      const r = await this.transitions.transition(id, { to, note: dto.note, credit: dto.credit }, { id: user.id, name: user.name, type: 'STAFF' });
      return { orderNo: r.orderNo, status: r.plan.to };
    });
  }

  @Traced('orders.bulk.mark_paid')
  async markPaid(ids: string[], user: AuthUser) {
    return this.run(ids, async (id) => {
      const r = await this.payments.markPaid(id, user);
      return { orderNo: r.orderNo };
    });
  }

  private async run(ids: string[], fn: (id: string) => Promise<{ orderNo: string; status?: OrderStatus }>) {
    const results: BulkResult[] = [];
    for (const id of [...new Set(ids)]) {
      try {
        results.push({ id, ok: true, ...(await fn(id)) });
      } catch (err) {
        const e = err instanceof DomainError ? { code: err.code, message: err.message } : { code: 'error', message: 'অপ্রত্যাশিত সমস্যা' };
        results.push({ id, ok: false, error: e });
      }
    }
    const ok = results.filter((r) => r.ok).length;
    return { total: results.length, succeeded: ok, failed: results.length - ok, results };
  }
}
