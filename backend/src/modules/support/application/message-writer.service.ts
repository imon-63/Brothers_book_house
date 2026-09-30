import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type Conversation, type MessageSender } from '@prisma/client';
import { ConflictError } from '@/common/errors/domain.error';
import { Events, type ChatMessageReceivedEvent } from '@/common/events/domain-events';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { afterMessage, preview } from '../domain/conversation-rules';
import { SUPPORT_STREAM_EVENT, type ChatStreamEvent } from './support-stream.service';

export type MessageView = { id: string; sender: MessageSender; senderName: string | null; body: string; readAt: Date | null; createdAt: Date };

export function mapMessage(m: { id: string; sender: MessageSender; body: string; readAt: Date | null; createdAt: Date; senderUser?: { name: string } | null }): MessageView {
  return { id: m.id, sender: m.sender, senderName: m.senderUser?.name ?? null, body: m.body, readAt: m.readAt, createdAt: m.createdAt };
}

/**
 * The one place a message is written: message row + conversation counters +
 * status in one transaction, then stream/domain events after commit.
 */
@Injectable()
export class MessageWriter {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async post(conv: Pick<Conversation, 'id' | 'status'>, sender: MessageSender, body: string, opts: { senderUserId?: string | null; senderName?: string | null; customerName?: string; assignTo?: string } = {}) {
    const text = body.trim();
    const effect = afterMessage(conv.status, sender);
    let result: { message: MessageView; conversation: Conversation };
    try {
      result = await this.prisma.tx(async (tx) => {
        const m = await tx.message.create({
          data: { conversationId: conv.id, sender, senderUserId: opts.senderUserId ?? null, body: text },
          include: { senderUser: { select: { name: true } } },
        });
        const updated = await tx.conversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: m.createdAt,
            lastMessageFrom: sender,
            status: effect.status,
            closedAt: effect.reopened ? null : undefined,
            unreadByStaff: effect.staffUnread ? { increment: effect.staffUnread } : undefined,
            unreadByCustomer: effect.customerUnread ? { increment: effect.customerUnread } : undefined,
            ...(opts.assignTo ? { assigneeId: opts.assignTo } : {}),
          },
        });
        return { message: mapMessage(m), conversation: updated };
      });
    } catch (err) {
      // Reopening would give the customer a second open thread (partial unique index).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('chat.other_open', 'আপনার আরেকটি চলমান কথোপকথন আছে — সেখানে লিখুন');
      }
      throw err;
    }

    const c = result.conversation;
    this.events.emit(SUPPORT_STREAM_EVENT, { type: 'message', conversationId: c.id, message: result.message } satisfies ChatStreamEvent);
    this.events.emit(SUPPORT_STREAM_EVENT, { type: 'conversation', conversationId: c.id, status: c.status, assigneeId: c.assigneeId, unreadByStaff: c.unreadByStaff, unreadByCustomer: c.unreadByCustomer } satisfies ChatStreamEvent);
    if (sender === 'CUSTOMER') {
      this.events.emit(Events.ChatMessageReceived, { conversationId: c.id, customerName: opts.customerName ?? 'গেস্ট', preview: preview(text) } satisfies ChatMessageReceivedEvent);
    }
    return result;
  }

  emitConversation(c: Conversation) {
    this.events.emit(SUPPORT_STREAM_EVENT, { type: 'conversation', conversationId: c.id, status: c.status, assigneeId: c.assigneeId, unreadByStaff: c.unreadByStaff, unreadByCustomer: c.unreadByCustomer } satisfies ChatStreamEvent);
  }

  emitRead(conversationId: string, by: 'STAFF' | 'CUSTOMER') {
    this.events.emit(SUPPORT_STREAM_EVENT, { type: 'read', conversationId, by } satisfies ChatStreamEvent);
  }
}
