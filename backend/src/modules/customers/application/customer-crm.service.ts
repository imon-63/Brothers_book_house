import { Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import type { AddNoteDto, BulkTagDto, UpdateCustomerDto } from '../dto/admin-customers.dto';
import { CustomerAggregatesService } from './customer-aggregates.service';

/** Staff-side CRM commands: notes, tags, block, admin note. Every one is audited. */
@Injectable()
export class CustomerCrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly aggregates: CustomerAggregatesService,
  ) {}

  @Traced('customers.update')
  async update(actor: AuthUser, id: string, dto: UpdateCustomerDto) {
    return this.prisma.tx(async (tx) => {
      const c = await this.mustGet(tx, id);
      const patch = { adminNote: dto.adminNote === undefined ? undefined : dto.adminNote?.trim() || null, marketingOptIn: dto.marketingOptIn, name: dto.name?.trim() };
      const diff = AuditService.diff(c as unknown as Record<string, unknown>, patch);
      if (!diff.changed.length) return { id, changed: [] };
      await tx.customer.update({ where: { id }, data: patch });
      await this.audit.record({ actor, action: 'UPDATE', area: 'customer', entityType: 'customer', entityId: id, summary: `কাস্টমার ${c.name}-এর তথ্য বদলানো হয়েছে (${diff.changed.join(', ')})`, before: diff.before, after: diff.after }, tx);
      return { id, changed: diff.changed };
    });
  }

  async addNote(actor: AuthUser, customerId: string, dto: AddNoteDto) {
    return this.prisma.tx(async (tx) => {
      const c = await this.mustGet(tx, customerId);
      const note = await tx.customerNote.create({ data: { customerId, authorId: actor.id, body: dto.body.trim(), isPinned: dto.isPinned ?? false } });
      await this.audit.record({ actor, action: 'CREATE', area: 'customer', entityType: 'customer_note', entityId: note.id, summary: `${c.name}-এর জন্য নোট যোগ হয়েছে`, after: { body: note.body.slice(0, 200) } }, tx);
      return { id: note.id, body: note.body, isPinned: note.isPinned, author: { id: actor.id, name: actor.name }, createdAt: note.createdAt };
    });
  }

  async pinNote(actor: AuthUser, customerId: string, noteId: string, isPinned: boolean) {
    return this.prisma.tx(async (tx) => {
      const note = await tx.customerNote.findFirst({ where: { id: noteId, customerId } });
      if (!note) throw new NotFoundError('Note', noteId);
      await tx.customerNote.update({ where: { id: noteId }, data: { isPinned } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'customer', entityType: 'customer_note', entityId: noteId, summary: isPinned ? 'কাস্টমার নোট পিন করা হয়েছে' : 'কাস্টমার নোট আনপিন করা হয়েছে' }, tx);
      return { id: noteId, isPinned };
    });
  }

  async deleteNote(actor: AuthUser, customerId: string, noteId: string) {
    await this.prisma.tx(async (tx) => {
      const note = await tx.customerNote.findFirst({ where: { id: noteId, customerId } });
      if (!note) throw new NotFoundError('Note', noteId);
      await tx.customerNote.delete({ where: { id: noteId } });
      await this.audit.record({ actor, action: 'DELETE', area: 'customer', entityType: 'customer_note', entityId: noteId, summary: 'কাস্টমার নোট মুছে ফেলা হয়েছে', before: { body: note.body.slice(0, 200) } }, tx);
    });
  }

  @Traced('customers.set_tags')
  async setTags(actor: AuthUser, customerId: string, names: string[]) {
    const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    return this.prisma.tx(async (tx) => {
      const c = await this.mustGet(tx, customerId);
      const before = await tx.customerTag.findMany({ where: { customerId }, include: { tag: true } });
      const tags = await Promise.all(wanted.map((name) => this.upsertTag(tx, name)));
      await tx.customerTag.deleteMany({ where: { customerId, tagId: { notIn: tags.map((t) => t.id) } } });
      if (tags.length) await tx.customerTag.createMany({ data: tags.map((t) => ({ customerId, tagId: t.id })), skipDuplicates: true });
      await this.audit.record({
        actor, action: 'UPDATE', area: 'customer', entityType: 'customer', entityId: customerId,
        summary: `${c.name}-এর ট্যাগ: ${wanted.join(', ') || 'কিছু নেই'}`,
        before: { tags: before.map((t) => t.tag.name) }, after: { tags: wanted },
      }, tx);
      return { tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color })) };
    });
  }

  @Traced('customers.bulk_tag')
  async bulkTag(actor: AuthUser, dto: BulkTagDto) {
    const ids = [...new Set(dto.customerIds)];
    return this.prisma.tx(async (tx) => {
      const tag = await this.upsertTag(tx, dto.tag.trim());
      const existing = await tx.customer.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } });
      const valid = existing.map((c) => c.id);
      let affected = 0;
      if (dto.action === 'add') {
        affected = (await tx.customerTag.createMany({ data: valid.map((customerId) => ({ customerId, tagId: tag.id })), skipDuplicates: true })).count;
      } else {
        affected = (await tx.customerTag.deleteMany({ where: { tagId: tag.id, customerId: { in: valid } } })).count;
      }
      await this.audit.record({
        actor, action: 'UPDATE', area: 'customer', entityType: 'tag', entityId: tag.id,
        summary: dto.action === 'add' ? `${affected} জনকে "${tag.name}" ট্যাগ দেওয়া হয়েছে` : `${affected} জনের "${tag.name}" ট্যাগ সরানো হয়েছে`,
        after: { customers: valid.length, affected },
      }, tx);
      return { tag: { id: tag.id, name: tag.name }, affected, notFound: ids.length - valid.length };
    });
  }

  @Traced('customers.block')
  async block(actor: AuthUser, id: string, reason: string) {
    return this.prisma.tx(async (tx) => {
      const c = await this.mustGet(tx, id);
      if (c.isBlocked) throw new BusinessRuleError('customer.already_blocked', 'কাস্টমার আগেই ব্লক করা আছে');
      await tx.customer.update({ where: { id }, data: { isBlocked: true, blockedReason: reason.trim(), blockedAt: new Date() } });
      await this.audit.record({ actor, action: 'STATUS_CHANGE', area: 'customer', entityType: 'customer', entityId: id, summary: `${c.name} ব্লক করা হয়েছে: ${reason.trim()}`, after: { blocked: true, reason } }, tx);
      return { id, blocked: true };
    });
  }

  @Traced('customers.unblock')
  async unblock(actor: AuthUser, id: string) {
    return this.prisma.tx(async (tx) => {
      const c = await this.mustGet(tx, id);
      if (!c.isBlocked) throw new BusinessRuleError('customer.not_blocked', 'কাস্টমার ব্লক করা নেই');
      await tx.customer.update({ where: { id }, data: { isBlocked: false, blockedReason: null, blockedAt: null } });
      await this.audit.record({ actor, action: 'STATUS_CHANGE', area: 'customer', entityType: 'customer', entityId: id, summary: `${c.name} আনব্লক করা হয়েছে`, before: { blocked: true, reason: c.blockedReason }, after: { blocked: false } }, tx);
      return { id, blocked: false };
    });
  }

  async recompute(actor: AuthUser, id: string) {
    const agg = await this.aggregates.recompute(id);
    if (!agg) throw new NotFoundError('Customer', id);
    await this.audit.record({ actor, action: 'OTHER', area: 'customer', entityType: 'customer', entityId: id, summary: 'কাস্টমারের হিসাব আবার গণনা করা হয়েছে' });
    return agg;
  }

  private async mustGet(tx: Tx, id: string) {
    const c = await tx.customer.findFirst({ where: { id, deletedAt: null } });
    if (!c) throw new NotFoundError('Customer', id);
    return c;
  }

  private upsertTag(tx: Tx, name: string) {
    return tx.tag.upsert({ where: { scope_name: { scope: 'CUSTOMER', name } }, create: { scope: 'CUSTOMER', name }, update: {} });
  }
}
