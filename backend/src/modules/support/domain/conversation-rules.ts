import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ConversationStatus, MessageSender } from '@prisma/client';

/** Guest chat tokens: the client keeps the random token, we store only sha256 (64 hex = column width). */
export function newGuestToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashGuestToken(token) };
}

export function hashGuestToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatches(token: string | undefined | null, storedHash: string | null): boolean {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashGuestToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export type ConversationOwner = { customerId: string | null; guestToken: string | null };
export type Caller = { customerId: string | null; guestToken?: string | null };

/** A registered customer owns their conversations; a guest proves ownership with the token. */
export function canAccess(conv: ConversationOwner, caller: Caller): boolean {
  if (conv.customerId) return !!caller.customerId && caller.customerId === conv.customerId;
  return tokenMatches(caller.guestToken, conv.guestToken);
}

export type StaffAction = 'resolve' | 'close' | 'reopen' | 'pending';

const TRANSITIONS: Record<StaffAction, { from: ConversationStatus[]; to: ConversationStatus }> = {
  pending: { from: ['OPEN'], to: 'PENDING' },
  resolve: { from: ['OPEN', 'PENDING'], to: 'RESOLVED' },
  close: { from: ['OPEN', 'PENDING', 'RESOLVED'], to: 'CLOSED' },
  reopen: { from: ['RESOLVED', 'CLOSED'], to: 'OPEN' },
};

export function nextStatus(current: ConversationStatus, action: StaffAction): ConversationStatus | null {
  const t = TRANSITIONS[action];
  return t.from.includes(current) ? t.to : null;
}

/**
 * Counter/status effects of a new message.
 *  • customer → staff unread +1; a resolved/closed thread reopens.
 *  • staff    → customer unread +1; an OPEN thread becomes PENDING (waiting on customer).
 */
export function afterMessage(current: ConversationStatus, sender: MessageSender) {
  if (sender === 'CUSTOMER') {
    return { status: current === 'RESOLVED' || current === 'CLOSED' || current === 'PENDING' ? ('OPEN' as const) : current, staffUnread: 1, customerUnread: 0, reopened: current === 'RESOLVED' || current === 'CLOSED' };
  }
  return { status: current === 'OPEN' ? ('PENDING' as const) : current, staffUnread: 0, customerUnread: 1, reopened: false };
}

export function preview(body: string, max = 80): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
