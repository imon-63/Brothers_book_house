import type { OrderStatus, PaymentMethod } from '@prisma/client';

/**
 * In-process domain events (@nestjs/event-emitter). Modules react to each
 * other through these instead of importing each other's services, which keeps
 * the dependency graph acyclic:
 *
 *   orders ──emit──▶ order.status_changed ──▶ finance (invoice/receipt/credit note, cash)
 *                                           ──▶ customers (CRM aggregates)
 *                                           ──▶ notifications (SMS to customer)
 *   payments ─emit─▶ payment.succeeded     ──▶ orders (mark paid / auto-confirm)
 *
 * Listeners run AFTER the originating transaction commits (emit after commit),
 * so a failing listener never rolls back the order. Anything that must be
 * atomic with the order is done inside the order transaction instead.
 */
export const Events = {
  OrderPlaced: 'order.placed',
  OrderStatusChanged: 'order.status_changed',
  OrderPaid: 'order.paid',
  PaymentSucceeded: 'payment.succeeded',
  PaymentFailed: 'payment.failed',
  StockLow: 'inventory.stock_low',
  StockRestocked: 'inventory.restocked',
  ChatMessageReceived: 'chat.message_received',
} as const;

export type OrderPlacedEvent = {
  orderId: string;
  orderNo: string;
  customerId: string;
  grandTotal: string;
  paymentMethod: PaymentMethod;
  placedAt: Date;
};

export type OrderStatusChangedEvent = {
  orderId: string;
  orderNo: string;
  customerId: string;
  from: OrderStatus;
  to: OrderStatus;
  actorId: string | null;
  /** credit-note inputs when moving to CANCELLED/RETURNED from a live state */
  credit?: { reason: string; courierLoss: string };
  at: Date;
};

export type OrderPaidEvent = {
  orderId: string;
  orderNo: string;
  amount: string;
  method: PaymentMethod;
  actorId: string | null;
  at: Date;
};

export type PaymentSucceededEvent = {
  paymentId: string;
  orderId: string;
  amount: string;
  fee: string;
  tranId: string;
};

export type PaymentFailedEvent = { paymentId: string; orderId: string; reason: string };

export type StockLowEvent = { productId: string; title: string; stockOnHand: number; threshold: number };
export type StockRestockedEvent = { productId: string; stockOnHand: number };
export type ChatMessageReceivedEvent = { conversationId: string; customerName: string; preview: string };
