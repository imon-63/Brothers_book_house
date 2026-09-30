import { Injectable } from '@nestjs/common';
import type { OrderPriority, Prisma } from '@prisma/client';
import { NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { AuditService } from '@/platform/audit/audit.service';
import { orderRef } from '../domain/order-filters';

type Actor = Pick<AuthUser, 'id' | 'name'>;
const PRIORITY_BN: Record<OrderPriority, string> = { NORMAL: 'সাধারণ', HIGH: 'উঁচু', URGENT: 'জরুরি' };

/** Priority, tags and internal notes on an order (all audited). */
@Injectable()
export class OrderMetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async find(tx: Tx, ref: string) {
    const where = orderRef(ref);
    const o = where ? await tx.order.findUnique({ where: where as Prisma.OrderWhereUniqueInput, select: { id: true, orderNo: true, priority: true } }) : null;
    if (!o) throw new NotFoundError('Order', ref);
    return o;
  }

  async setPriority(ref: string, priority: OrderPriority, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const o = await this.find(tx, ref);
      if (o.priority === priority) return { orderNo: o.orderNo, priority };
      await tx.order.update({ where: { id: o.id }, data: { priority } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'order', entityType: 'Order', entityId: o.id, summary: `${o.orderNo} · প্রায়োরিটি: ${PRIORITY_BN[priority]}`, before: { priority: o.priority }, after: { priority } }, tx);
      return { orderNo: o.orderNo, priority };
    });
  }

  async listTags() {
    const tags = await this.prisma.tag.findMany({ where: { scope: 'ORDER' }, orderBy: { name: 'asc' }, include: { _count: { select: { orders: true } } } });
    return tags.map((t) => ({ id: t.id, name: t.name, color: t.color, orders: t._count.orders }));
  }

  async addTag(ref: string, name: string, color: string | undefined, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const o = await this.find(tx, ref);
      const tag = await tx.tag.upsert({ where: { scope_name: { scope: 'ORDER', name } }, create: { scope: 'ORDER', name, color: color ?? null }, update: color ? { color } : {} });
      await tx.orderTag.upsert({ where: { orderId_tagId: { orderId: o.id, tagId: tag.id } }, create: { orderId: o.id, tagId: tag.id }, update: {} });
      await this.audit.record({ actor, action: 'UPDATE', area: 'order', entityType: 'Order', entityId: o.id, summary: `${o.orderNo} · ট্যাগ যোগ: ${name}` }, tx);
      return this.tagsOf(tx, o.id);
    });
  }

  async removeTag(ref: string, tagId: string, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const o = await this.find(tx, ref);
      const link = await tx.orderTag.findUnique({ where: { orderId_tagId: { orderId: o.id, tagId } }, include: { tag: true } });
      if (link) {
        await tx.orderTag.delete({ where: { orderId_tagId: { orderId: o.id, tagId } } });
        await this.audit.record({ actor, action: 'UPDATE', area: 'order', entityType: 'Order', entityId: o.id, summary: `${o.orderNo} · ট্যাগ সরানো: ${link.tag.name}` }, tx);
      }
      return this.tagsOf(tx, o.id);
    });
  }

  private async tagsOf(tx: Tx, orderId: string) {
    const rows = await tx.orderTag.findMany({ where: { orderId }, include: { tag: true } });
    return rows.map((r) => ({ id: r.tag.id, name: r.tag.name, color: r.tag.color }));
  }

  async addNote(ref: string, body: string, isPinned: boolean, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const o = await this.find(tx, ref);
      const n = await tx.orderNote.create({ data: { orderId: o.id, authorId: actor.id, body, isPinned } });
      await this.audit.record({ actor, action: 'CREATE', area: 'order', entityType: 'OrderNote', entityId: n.id, summary: `${o.orderNo} · নোট যোগ` }, tx);
      return { id: n.id, body: n.body, isPinned: n.isPinned, by: { id: actor.id, name: actor.name }, at: n.createdAt };
    });
  }

  async deleteNote(ref: string, noteId: string, actor: Actor) {
    await this.prisma.tx(async (tx) => {
      const o = await this.find(tx, ref);
      const n = await tx.orderNote.findFirst({ where: { id: noteId, orderId: o.id, deletedAt: null } });
      if (!n) throw new NotFoundError('OrderNote', noteId);
      await tx.orderNote.update({ where: { id: n.id }, data: { deletedAt: new Date() } });
      await this.audit.record({ actor, action: 'DELETE', area: 'order', entityType: 'OrderNote', entityId: n.id, summary: `${o.orderNo} · নোট মুছেছে`, before: { body: n.body } }, tx);
    });
  }
}
