import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { skipTake, toPage, type PageQueryDto } from '@/common/dto/pagination.dto';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { normalizeBdPhone } from '@/common/utils/text';
import { D, toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import type { CreateSupplierDto, UpdateSupplierDto } from '../dto/purchasing.dto';
import { toSupplier } from '../mappers/purchasing.mapper';

function phoneOrNull(input?: string): string | null | undefined {
  if (input === undefined) return undefined;
  if (!input.trim()) return null;
  const p = normalizeBdPhone(input);
  if (!p) throw new BusinessRuleError('supplier.phone_invalid', 'ফোন নম্বর সঠিক নয়');
  return p;
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PageQueryDto) {
    const where: Prisma.SupplierWhereInput = { deletedAt: null };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }];
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, orderBy: { name: q.order }, ...skipTake(q) }),
      this.prisma.supplier.count({ where }),
    ]);
    const dues = await this.duesFor(rows.map((r) => r.id));
    return toPage(rows.map((r) => toSupplier(r, dues.get(r.id) ?? 0)), total, q);
  }

  async get(id: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, deletedAt: null } });
    if (!s) throw new NotFoundError('Supplier', id);
    const dues = await this.duesFor([id]);
    return toSupplier(s, dues.get(id) ?? 0);
  }

  /** সাপ্লায়ার বকেয়া — Σ(total − paid) of non-cancelled bills, biggest first. */
  async dues() {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; bills: bigint; due: Prisma.Decimal }[]>`
      SELECT s.id, s.name, COUNT(p.id) AS bills, SUM(p.total - p.amount_paid) AS due
        FROM purchases p JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.status <> 'CANCELLED' AND p.amount_paid < p.total
    GROUP BY s.id, s.name
    ORDER BY due DESC`;
    const items = rows.map((r) => ({ supplierId: r.id, name: r.name, openBills: Number(r.bills), due: toNumber(r.due) }));
    return { items, total: toNumber(items.reduce((s, r) => s.plus(r.due), D(0))) };
  }

  private async duesFor(ids: string[]) {
    const map = new Map<string, number>();
    if (!ids.length) return map;
    const rows = await this.prisma.purchase.groupBy({
      by: ['supplierId'],
      where: { supplierId: { in: ids }, status: { not: 'CANCELLED' } },
      _sum: { total: true, amountPaid: true },
    });
    for (const r of rows) map.set(r.supplierId, toNumber(D(r._sum.total).minus(D(r._sum.amountPaid))));
    return map;
  }

  async create(dto: CreateSupplierDto, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const s = await tx.supplier.create({
        data: { name: dto.name.trim(), phone: phoneOrNull(dto.phone) ?? null, email: dto.email ?? null, address: dto.address ?? null, note: dto.note ?? null },
      });
      await this.audit.record({ actor, action: 'CREATE', area: 'finance', entityType: 'Supplier', entityId: s.id, summary: `নতুন সাপ্লায়ার "${s.name}"` }, tx);
      return toSupplier(s);
    });
  }

  async update(id: string, dto: UpdateSupplierDto, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.supplier.findFirst({ where: { id, deletedAt: null } });
      if (!cur) throw new NotFoundError('Supplier', id);
      const patch = { name: dto.name?.trim(), phone: phoneOrNull(dto.phone), email: dto.email, address: dto.address, note: dto.note };
      const diff = AuditService.diff(cur as unknown as Record<string, unknown>, patch);
      if (!diff.changed.length) return toSupplier(cur);
      const s = await tx.supplier.update({ where: { id }, data: patch });
      await this.audit.record(
        { actor, action: 'UPDATE', area: 'finance', entityType: 'Supplier', entityId: id, summary: `সাপ্লায়ার "${s.name}" হালনাগাদ`, before: diff.before, after: diff.after },
        tx,
      );
      return toSupplier(s);
    });
  }

  /** Soft delete; bills and history stay. */
  async remove(id: string, actor: AuthUser) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.supplier.findFirst({ where: { id, deletedAt: null } });
      if (!cur) throw new NotFoundError('Supplier', id);
      const due = (await this.duesFor([id])).get(id) ?? 0;
      if (due > 0) throw new BusinessRuleError('supplier.has_due', `এই সাপ্লায়ারের ৳${due} বকেয়া আছে — আগে পরিশোধ করুন`);
      await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.record({ actor, action: 'DELETE', area: 'finance', entityType: 'Supplier', entityId: id, summary: `সাপ্লায়ার "${cur.name}" মুছে ফেলা হয়েছে` }, tx);
      return { id, deleted: true };
    });
  }
}
