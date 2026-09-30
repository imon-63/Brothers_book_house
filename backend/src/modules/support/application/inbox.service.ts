import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/common/errors/domain.error';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { STAFF_ROLES, type AuthUser } from '@/common/types/auth-user';
import { toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { nextStatus, preview, type StaffAction } from '../domain/conversation-rules';
import type { CannedReplyDto, InboxQueryDto, UpdateCannedReplyDto } from '../dto/support.dto';
import { mapMessage, MessageWriter } from './message-writer.service';

const listInclude = {
  customer: { select: { id: true, name: true, phone: true, userId: true } },
  assignee: { select: { id: true, name: true } },
  messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, sender: true, createdAt: true } },
} as const;

const ACTION_BN: Record<StaffAction, string> = { resolve: 'সমাধান হয়েছে', close: 'বন্ধ করা হয়েছে', reopen: 'আবার খোলা হয়েছে', pending: 'অপেক্ষমাণ করা হয়েছে' };

/** Staff inbox (/admin/support). */
@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly writer: MessageWriter,
  ) {}

  async list(user: AuthUser, q: InboxQueryDto) {
    const needle = q.q?.trim();
    const where: Prisma.ConversationWhereInput = {
      ...(q.status === 'active' ? { status: { in: ['OPEN', 'PENDING'] } } : q.status ? { status: q.status } : {}),
      ...(q.unread ? { unreadByStaff: { gt: 0 } } : {}),
      ...(q.assignee === 'me' ? { assigneeId: user.id } : q.assignee === 'none' ? { assigneeId: null } : q.assignee ? { assigneeId: q.assignee } : {}),
      ...(needle
        ? {
            OR: [
              { guestName: { contains: needle, mode: 'insensitive' } },
              { customer: { name: { contains: needle, mode: 'insensitive' } } },
              { customer: { phone: { contains: needle.replace(/\D/g, '') || needle } } },
              { messages: { some: { body: { contains: needle, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({ where, include: listInclude, orderBy: [{ lastMessageAt: 'desc' }], ...skipTake(q) }),
      this.prisma.conversation.count({ where }),
    ]);
    return toPage(
      rows.map((c) => ({
        id: c.id,
        name: c.customer?.name ?? c.guestName ?? 'গেস্ট',
        registered: !!c.customer?.userId,
        customer: c.customer ? { id: c.customer.id, name: c.customer.name, phone: c.customer.phone } : null,
        status: c.status,
        channel: c.channel,
        assignee: c.assignee,
        unread: c.unreadByStaff,
        needsReply: c.lastMessageFrom === 'CUSTOMER' && (c.status === 'OPEN' || c.status === 'PENDING'),
        last: c.messages[0] ? { preview: preview(c.messages[0].body), sender: c.messages[0].sender, at: c.messages[0].createdAt } : null,
        lastMessageAt: c.lastMessageAt,
        createdAt: c.createdAt,
      })),
      total,
      q,
    );
  }

  async counts(user: AuthUser) {
    const active: Prisma.ConversationWhereInput = { status: { in: ['OPEN', 'PENDING'] } };
    const [open, pending, unread, needsReply, mine, unassigned, unreadMessages] = await Promise.all([
      this.prisma.conversation.count({ where: { status: 'OPEN' } }),
      this.prisma.conversation.count({ where: { status: 'PENDING' } }),
      this.prisma.conversation.count({ where: { unreadByStaff: { gt: 0 } } }),
      this.prisma.conversation.count({ where: { ...active, lastMessageFrom: 'CUSTOMER' } }),
      this.prisma.conversation.count({ where: { ...active, assigneeId: user.id } }),
      this.prisma.conversation.count({ where: { ...active, assigneeId: null } }),
      this.prisma.conversation.aggregate({ _sum: { unreadByStaff: true } }),
    ]);
    return { open, pending, unreadThreads: unread, unreadMessages: unreadMessages._sum.unreadByStaff ?? 0, needsReply, mine, unassigned };
  }

  async thread(id: string, limit = 200) {
    const c = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true, userId: true, isBlocked: true, ordersCount: true, liveOrders: true, totalSpent: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    if (!c) throw new NotFoundError('Conversation', id);
    const [messages, orders] = await Promise.all([
      this.prisma.message.findMany({ where: { conversationId: id }, include: { senderUser: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: limit }),
      c.customerId
        ? this.prisma.order.findMany({ where: { customerId: c.customerId }, orderBy: { placedAt: 'desc' }, take: 3, select: { id: true, orderNo: true, status: true, grandTotal: true, placedAt: true } })
        : Promise.resolve([]),
    ]);
    return {
      id: c.id,
      name: c.customer?.name ?? c.guestName ?? 'গেস্ট',
      status: c.status,
      channel: c.channel,
      assignee: c.assignee,
      unread: c.unreadByStaff,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      customer: c.customer
        ? {
            id: c.customer.id, name: c.customer.name, phone: c.customer.phone, email: c.customer.email, registered: !!c.customer.userId,
            blocked: c.customer.isBlocked, ordersCount: c.customer.ordersCount, liveOrders: c.customer.liveOrders, totalSpent: toNumber(c.customer.totalSpent),
            recentOrders: orders.map((o) => ({ ...o, grandTotal: toNumber(o.grandTotal) })),
          }
        : null,
      messages: messages.reverse().map(mapMessage),
    };
  }

  @Traced('support.reply')
  async reply(user: AuthUser, id: string, body: string) {
    const conv = await this.mustGet(id);
    // Replies are themselves the record (sender_user_id); not duplicated into audit_logs.
    const { message, conversation } = await this.writer.post(conv, 'STAFF', body, { senderUserId: user.id, assignTo: conv.assigneeId ? undefined : user.id });
    return { message, status: conversation.status };
  }

  async markRead(id: string) {
    await this.mustGet(id);
    await this.prisma.tx(async (tx) => {
      await tx.message.updateMany({ where: { conversationId: id, sender: 'CUSTOMER', readAt: null }, data: { readAt: new Date() } });
      await tx.conversation.update({ where: { id }, data: { unreadByStaff: 0 } });
    });
    this.writer.emitRead(id, 'STAFF');
    return { ok: true };
  }

  async assign(actor: AuthUser, id: string, assigneeId: string | null) {
    const conv = await this.mustGet(id);
    let name = 'কেউ না';
    if (assigneeId) {
      const u = await this.prisma.user.findFirst({ where: { id: assigneeId, role: { in: STAFF_ROLES }, status: 'ACTIVE', deletedAt: null }, select: { name: true } });
      if (!u) throw new BusinessRuleError('chat.assignee_invalid', 'এই স্টাফকে দায়িত্ব দেওয়া যাবে না');
      name = u.name;
    }
    const updated = await this.prisma.tx(async (tx) => {
      const c = await tx.conversation.update({ where: { id }, data: { assigneeId } });
      await this.audit.record({ actor, action: 'UPDATE', area: 'chat', entityType: 'conversation', entityId: id, summary: `চ্যাটের দায়িত্ব: ${name}`, before: { assigneeId: conv.assigneeId }, after: { assigneeId } }, tx);
      return c;
    });
    this.writer.emitConversation(updated);
    return { id, assigneeId };
  }

  @Traced('support.transition')
  async transition(actor: AuthUser, id: string, action: StaffAction) {
    const conv = await this.mustGet(id);
    const to = nextStatus(conv.status, action);
    if (!to) throw new BusinessRuleError('chat.bad_transition', 'এই অবস্থায় কাজটি করা যাবে না', { from: conv.status, action });
    const updated = await this.prisma.tx(async (tx) => {
      const c = await tx.conversation.update({
        where: { id },
        data: { status: to, closedAt: to === 'CLOSED' || to === 'RESOLVED' ? new Date() : to === 'OPEN' ? null : undefined, ...(to === 'CLOSED' || to === 'RESOLVED' ? { unreadByStaff: 0 } : {}) },
      });
      await this.audit.record({ actor, action: 'STATUS_CHANGE', area: 'chat', entityType: 'conversation', entityId: id, summary: `চ্যাট ${ACTION_BN[action]}`, before: { status: conv.status }, after: { status: to } }, tx);
      return c;
    });
    this.writer.emitConversation(updated);
    return { id, status: to };
  }

  // ─── canned replies ───

  cannedList() {
    return this.prisma.cannedReply.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  }

  async cannedCreate(actor: AuthUser, dto: CannedReplyDto) {
    return this.prisma.tx(async (tx) => {
      const sortOrder = dto.sortOrder ?? (await tx.cannedReply.count());
      const r = await tx.cannedReply.create({ data: { title: dto.title.trim(), body: dto.body.trim(), sortOrder } });
      await this.audit.record({ actor, action: 'CREATE', area: 'chat', entityType: 'canned_reply', entityId: r.id, summary: `দ্রুত উত্তর যোগ: ${r.title}` }, tx);
      return r;
    });
  }

  async cannedUpdate(actor: AuthUser, id: string, dto: UpdateCannedReplyDto) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.cannedReply.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('CannedReply', id);
      const patch = { title: dto.title?.trim(), body: dto.body?.trim(), sortOrder: dto.sortOrder };
      const diff = AuditService.diff(cur as unknown as Record<string, unknown>, patch);
      const r = await tx.cannedReply.update({ where: { id }, data: patch });
      await this.audit.record({ actor, action: 'UPDATE', area: 'chat', entityType: 'canned_reply', entityId: id, summary: `দ্রুত উত্তর বদলানো: ${r.title}`, before: diff.before, after: diff.after }, tx);
      return r;
    });
  }

  async cannedDelete(actor: AuthUser, id: string) {
    await this.prisma.tx(async (tx) => {
      const cur = await tx.cannedReply.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('CannedReply', id);
      await tx.cannedReply.delete({ where: { id } });
      await this.audit.record({ actor, action: 'DELETE', area: 'chat', entityType: 'canned_reply', entityId: id, summary: `দ্রুত উত্তর মুছে ফেলা: ${cur.title}`, before: { title: cur.title, body: cur.body } }, tx);
    });
  }

  private async mustGet(id: string) {
    const c = await this.prisma.conversation.findUnique({ where: { id } });
    if (!c) throw new NotFoundError('Conversation', id);
    return c;
  }
}
