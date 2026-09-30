import { Injectable, type MessageEvent, type OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { filter, interval, map, merge, Subject, type Observable } from 'rxjs';

/** In-process event, emitted after the message transaction commits. */
export const SUPPORT_STREAM_EVENT = 'support.stream';

export type ChatStreamEvent =
  | { type: 'message'; conversationId: string; message: { id: string; sender: string; senderName: string | null; body: string; createdAt: Date } }
  | { type: 'conversation'; conversationId: string; status: string; assigneeId: string | null; unreadByStaff: number; unreadByCustomer: number }
  | { type: 'read'; conversationId: string; by: 'STAFF' | 'CUSTOMER' };

const HEARTBEAT_MS = 25_000;

/**
 * Fan-out for Server-Sent Events. The event emitter feeds one rxjs Subject;
 * each SSE connection subscribes with its own filter. Process-local: with
 * several API replicas, put Redis pub/sub or Postgres LISTEN/NOTIFY behind
 * `publish` (the controllers don't change).
 */
@Injectable()
export class SupportStreamService implements OnModuleDestroy {
  private readonly bus = new Subject<ChatStreamEvent>();

  @OnEvent(SUPPORT_STREAM_EVENT)
  publish(e: ChatStreamEvent) {
    this.bus.next(e);
  }

  /** Staff inbox: everything. */
  staff(): Observable<MessageEvent> {
    return this.withHeartbeat(this.bus.asObservable());
  }

  /** One customer's thread. Internal counters for staff are not leaked. */
  conversation(conversationId: string): Observable<MessageEvent> {
    return this.withHeartbeat(
      this.bus.pipe(
        filter((e) => e.conversationId === conversationId),
        map((e): ChatStreamEvent => (e.type === 'conversation' ? { ...e, assigneeId: null, unreadByStaff: 0 } : e)),
      ),
    );
  }

  onModuleDestroy() {
    this.bus.complete();
  }

  private withHeartbeat(src: Observable<ChatStreamEvent>): Observable<MessageEvent> {
    return merge(
      src.pipe(map((e): MessageEvent => ({ type: e.type, data: e }))),
      interval(HEARTBEAT_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: { at: new Date().toISOString() } }))),
    );
  }
}
