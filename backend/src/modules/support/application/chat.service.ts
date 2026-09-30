import { Injectable } from '@nestjs/common';
import { Prisma, type Conversation } from '@prisma/client';
import { BusinessRuleError, ForbiddenError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { MeService } from '@/modules/customers/application/me.service';
import { canAccess, hashGuestToken, newGuestToken, type Caller } from '../domain/conversation-rules';
import type { MessagesQueryDto, StartConversationDto } from '../dto/support.dto';
import { mapMessage, MessageWriter } from './message-writer.service';

export type ChatCaller = { user?: AuthUser; guestToken?: string | null };

const view = (c: Conversation) => ({ id: c.id, status: c.status, unread: c.unreadByCustomer, lastMessageAt: c.lastMessageAt, createdAt: c.createdAt });

/** Storefront chat bubble — registered customers and guests (x-chat-token). */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly me: MeService,
    private readonly writer: MessageWriter,
  ) {}

  @Traced('chat.start')
  async start(who: ChatCaller, dto: StartConversationDto) {
    const caller = await this.caller(who);
    let token: string | undefined;
    let conv: Conversation | null = null;
    let name = dto.name?.trim() || 'গেস্ট';

    if (caller.customerId) {
      const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: caller.customerId }, select: { name: true, isBlocked: true } });
      if (c.isBlocked) throw new BusinessRuleError('chat.blocked', 'চ্যাট এই মুহূর্তে বন্ধ আছে — হেল্পলাইনে কল করুন');
      name = c.name;
      conv = await this.prisma.conversation.findFirst({ where: { customerId: caller.customerId, status: { in: ['OPEN', 'PENDING'] } } });
      if (!conv) {
        try {
          conv = await this.prisma.conversation.create({ data: { customerId: caller.customerId } });
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
          conv = await this.prisma.conversation.findFirstOrThrow({ where: { customerId: caller.customerId, status: { in: ['OPEN', 'PENDING'] } } });
        }
      }
    } else {
      // A guest who still holds a valid token continues their thread.
      if (caller.guestToken) conv = await this.findGuest(caller.guestToken);
      if (!conv) {
        const t = newGuestToken();
        token = t.token;
        conv = await this.prisma.conversation.create({ data: { guestToken: t.hash, guestName: name.slice(0, 120) } });
      } else {
        name = conv.guestName ?? name;
      }
    }
    const { message, conversation } = await this.writer.post(conv, 'CUSTOMER', dto.message, { customerName: name });
    return { conversation: view(conversation), message, ...(token ? { chatToken: token } : {}) };
  }

  /** The caller's active thread (or null). */
  async current(who: ChatCaller) {
    const caller = await this.caller(who);
    const conv = caller.customerId
      ? await this.prisma.conversation.findFirst({ where: { customerId: caller.customerId }, orderBy: { lastMessageAt: 'desc' } })
      : caller.guestToken
        ? await this.findGuest(caller.guestToken)
        : null;
    return conv ? view(conv) : null;
  }

  async messages(who: ChatCaller, id: string, q: MessagesQueryDto) {
    await this.mustAccess(who, id);
    const rows = await this.prisma.message.findMany({
      where: { conversationId: id, sender: { not: 'SYSTEM' }, ...(q.after ? { createdAt: { gt: new Date(q.after) } } : {}) },
      include: { senderUser: { select: { name: true } } },
      orderBy: { createdAt: q.after ? 'asc' : 'desc' },
      take: q.limit,
    });
    const list = q.after ? rows : rows.reverse();
    return list.map(mapMessage);
  }

  @Traced('chat.send')
  async send(who: ChatCaller, id: string, body: string) {
    const { conv, caller } = await this.mustAccess(who, id);
    let name = conv.guestName ?? 'গেস্ট';
    if (caller.customerId) {
      const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: caller.customerId }, select: { name: true, isBlocked: true } });
      if (c.isBlocked) throw new BusinessRuleError('chat.blocked', 'চ্যাট এই মুহূর্তে বন্ধ আছে — হেল্পলাইনে কল করুন');
      name = c.name;
    }
    const { message, conversation } = await this.writer.post(conv, 'CUSTOMER', body, { customerName: name });
    return { conversation: view(conversation), message };
  }

  async markRead(who: ChatCaller, id: string) {
    await this.mustAccess(who, id);
    await this.prisma.tx(async (tx) => {
      await tx.message.updateMany({ where: { conversationId: id, sender: { in: ['STAFF', 'SYSTEM'] }, readAt: null }, data: { readAt: new Date() } });
      await tx.conversation.update({ where: { id }, data: { unreadByCustomer: 0 } });
    });
    this.writer.emitRead(id, 'CUSTOMER');
    return { ok: true };
  }

  /** Ownership check used by the SSE endpoint too. */
  async mustAccess(who: ChatCaller, id: string) {
    const caller = await this.caller(who);
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundError('Conversation', id);
    if (!canAccess(conv, caller)) throw new ForbiddenError('chat.forbidden', 'এই কথোপকথন দেখার অনুমতি নেই');
    return { conv, caller };
  }

  private async caller(who: ChatCaller): Promise<Caller> {
    let customerId: string | null = null;
    if (who.user?.role === 'CUSTOMER') customerId = await this.me.customerId(who.user).catch(() => null);
    return { customerId, guestToken: who.guestToken ?? null };
  }

  private findGuest(token: string) {
    return this.prisma.conversation.findFirst({ where: { guestToken: hashGuestToken(token), customerId: null }, orderBy: { lastMessageAt: 'desc' } });
  }
}
