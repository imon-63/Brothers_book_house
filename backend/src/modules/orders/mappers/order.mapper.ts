import type { Prisma } from '@prisma/client';
import { D, toNumber } from '@/common/utils/money';
import { localPhone } from '@/common/utils/text';
import { NEXT_ACTION_BN, STATUS_LABEL_BN, isOpen, nextStatus, regressTarget } from '../domain/order-status';
import { buildTimeline } from '../domain/order-timeline';

const n = toNumber;
const nn = (v: Prisma.Decimal | null) => (v == null ? null : toNumber(v));

export const ORDER_SUMMARY_INCLUDE = {
  items: { select: { kind: true, productId: true, bundleId: true, title: true, quantity: true, sectionCode: true } },
  tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
  shipments: { where: { status: { notIn: ['CANCELLED', 'RETURNED'] } }, select: { trackingNo: true, status: true, courier: { select: { code: true, name: true } } }, take: 1 },
} satisfies Prisma.OrderInclude;

export type OrderSummaryRow = Prisma.OrderGetPayload<{ include: typeof ORDER_SUMMARY_INCLUDE }>;

export function addressText(o: { shipLine: string; shipUnion: string | null; shipUpazila: string | null; shipDistrict: string; shipLandmark?: string | null }) {
  return [o.shipLine, o.shipLandmark, o.shipUnion, o.shipUpazila, o.shipDistrict].filter(Boolean).join(', ');
}

/** Admin list row / board card. */
export function toOrderSummary(o: OrderSummaryRow) {
  const sections = [...new Set(o.items.map((i) => i.sectionCode))];
  const next = nextStatus(o.status);
  return {
    id: o.id,
    orderNo: o.orderNo,
    version: o.version,
    status: o.status,
    statusLabel: STATUS_LABEL_BN[o.status],
    priority: o.priority,
    source: o.source,
    placedAt: o.placedAt,
    customer: { id: o.customerId, name: o.contactName, phone: localPhone(o.contactPhone) },
    address: addressText(o),
    district: o.shipDistrict,
    items: o.items.slice(0, 3).map((i) => ({ kind: i.kind, productId: i.productId, bundleId: i.bundleId, title: i.title, quantity: i.quantity })),
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    lineCount: o.items.length,
    sections,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    due: isDue(o),
    grandTotal: n(o.grandTotal),
    couponCode: o.couponCode,
    tags: o.tags.map((t) => t.tag),
    shipment: o.shipments[0] ? { courier: o.shipments[0].courier.name, trackingNo: o.shipments[0].trackingNo, status: o.shipments[0].status } : null,
    next: next && o.status !== 'DELIVERED' ? { status: next, label: NEXT_ACTION_BN[o.status] ?? null } : null,
    canRegress: !!regressTarget(o.status),
    ageMinutes: Math.round((Date.now() - o.placedAt.getTime()) / 60_000),
  };
}

/** Storefront `dueCod`: confirmed…delivered and not paid. */
export function isDue(o: { status: Prisma.OrderGetPayload<object>['status']; paymentStatus: string }) {
  return o.paymentStatus === 'UNPAID' && o.status !== 'PENDING' && o.status !== 'CANCELLED' && o.status !== 'RETURNED';
}

export const ORDER_DETAIL_INCLUDE = {
  items: { include: { components: true } },
  history: { orderBy: { createdAt: 'asc' }, include: { changedBy: { select: { id: true, name: true } } } },
  notes: { where: { deletedAt: null }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }], include: { author: { select: { id: true, name: true } } } },
  tags: { include: { tag: true } },
  shipments: { orderBy: { createdAt: 'desc' }, include: { courier: true } },
  payments: { orderBy: { initiatedAt: 'desc' }, select: { id: true, method: true, provider: true, status: true, amount: true, fee: true, tranId: true, initiatedAt: true, succeededAt: true, failureReason: true } },
  documents: { orderBy: { issuedAt: 'asc' }, select: { id: true, docNo: true, kind: true, total: true, issuedAt: true } },
  customer: { select: { id: true, name: true, phone: true, email: true, isBlocked: true, blockedReason: true, ordersCount: true, liveOrders: true, cancelledOrders: true, totalSpent: true, firstOrderAt: true, lastOrderAt: true } },
  createdBy: { select: { id: true, name: true } },
  couponRedemption: { select: { discount: true, revokedAt: true } },
} satisfies Prisma.OrderInclude;

export type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof ORDER_DETAIL_INCLUDE }>;

function moneyBlock(o: OrderDetailRow | OrderSummaryRow) {
  return {
    itemsSubtotal: n(o.itemsSubtotal),
    discountTotal: n(o.discountTotal),
    couponCode: o.couponCode,
    shippingFee: n(o.shippingFee),
    shippingFeeReason: o.shippingFeeReason,
    taxTotal: n(o.taxTotal),
    grandTotal: n(o.grandTotal),
    amountPaid: n(o.amountPaid),
    amountRefunded: n(o.amountRefunded),
    due: n(D(o.grandTotal).minus(o.amountPaid).greaterThan(0) && o.paymentStatus === 'UNPAID' ? D(o.grandTotal).minus(o.amountPaid) : 0),
  };
}

function lines(o: OrderDetailRow, internal: boolean) {
  return o.items.map((i) => ({
    id: i.id,
    kind: i.kind,
    productId: i.productId,
    bundleId: i.bundleId,
    title: i.title,
    sku: i.sku,
    sectionCode: i.sectionCode,
    categoryName: i.categoryName,
    quantity: i.quantity,
    quantityReturned: i.quantityReturned,
    unitPrice: n(i.unitPrice),
    listPrice: n(i.listPrice),
    discount: n(i.discount),
    taxAmount: n(i.taxAmount),
    lineTotal: n(i.lineTotal),
    ...(internal
      ? {
          unitCost: nn(i.unitCost),
          margin: i.unitCost == null ? null : n(D(i.lineTotal).minus(i.taxAmount).minus(D(i.unitCost).times(i.quantity))),
        }
      : {}),
    components: i.components.map((c) => ({
      productId: c.productId,
      title: c.title,
      quantity: c.quantity,
      ...(internal ? { unitCost: nn(c.unitCost), allocatedRevenue: n(c.allocatedRevenue) } : {}),
    })),
  }));
}

function timeline(o: OrderDetailRow) {
  return buildTimeline({
    status: o.status,
    cancelledFrom: o.cancelledFrom,
    placedAt: o.placedAt,
    cancelledAt: o.cancelledAt,
    history: o.history.map((h) => ({ toStatus: h.toStatus, at: h.createdAt })),
  });
}

function trackingUrl(c: { trackingUrl: string | null }, no: string | null) {
  return c.trackingUrl && no ? c.trackingUrl.replace('{tracking}', encodeURIComponent(no)) : null;
}

/** Full admin drawer. */
export function toOrderDetail(o: OrderDetailRow) {
  const profitKnown = o.itemsCost != null;
  const netRevenue = D(o.grandTotal).minus(o.taxTotal);
  const profit = netRevenue.minus(o.itemsCost ?? 0).minus(o.courierCost).minus(o.gatewayFee).minus(o.courierLoss);
  const next = nextStatus(o.status);
  return {
    id: o.id,
    orderNo: o.orderNo,
    version: o.version,
    status: o.status,
    statusLabel: STATUS_LABEL_BN[o.status],
    priority: o.priority,
    source: o.source,
    createdBy: o.createdBy,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    due: isDue(o),
    contact: { name: o.contactName, phone: localPhone(o.contactPhone), email: o.contactEmail },
    address: {
      text: addressText(o),
      districtId: o.shipDistrictId,
      division: o.shipDivision,
      district: o.shipDistrict,
      upazila: o.shipUpazila,
      union: o.shipUnion,
      line: o.shipLine,
      landmark: o.shipLandmark,
      zoneCode: o.shipZoneCode,
    },
    customerNote: o.customerNote,
    items: lines(o, true),
    money: {
      ...moneyBlock(o),
      itemsCost: nn(o.itemsCost),
      courierCost: n(o.courierCost),
      gatewayFee: n(o.gatewayFee),
      courierLoss: n(o.courierLoss),
      estimatedProfit: n(profit),
      profitComplete: profitKnown,
    },
    stockReserved: o.stockReserved,
    cancelReason: o.cancelReason,
    cancelledFrom: o.cancelledFrom,
    timestamps: { placedAt: o.placedAt, confirmedAt: o.confirmedAt, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt, cancelledAt: o.cancelledAt, paidAt: o.paidAt },
    next: next && isOpen(o.status) ? { status: next, label: NEXT_ACTION_BN[o.status] ?? null } : null,
    canRegress: !!regressTarget(o.status),
    history: o.history.map((h) => ({ id: h.id, from: h.fromStatus, to: h.toStatus, label: STATUS_LABEL_BN[h.toStatus], actorType: h.actorType, by: h.changedBy, note: h.note, at: h.createdAt })),
    notes: o.notes.map((x) => ({ id: x.id, body: x.body, isPinned: x.isPinned, by: x.author, at: x.createdAt })),
    tags: o.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    shipments: o.shipments.map((s) => ({
      id: s.id,
      courier: { id: s.courier.id, code: s.courier.code, name: s.courier.name },
      trackingNo: s.trackingNo,
      trackingUrl: trackingUrl(s.courier, s.trackingNo),
      status: s.status,
      codAmount: n(s.codAmount),
      codStatus: s.codStatus,
      deliveryCharge: n(s.deliveryCharge),
      returnCharge: n(s.returnCharge),
      createdAt: s.createdAt,
    })),
    payments: o.payments.map((p) => ({ ...p, amount: n(p.amount), fee: n(p.fee) })),
    documents: o.documents.map((d) => ({ ...d, total: n(d.total) })),
    coupon: o.couponRedemption ? { code: o.couponCode, discount: n(o.couponRedemption.discount), revoked: !!o.couponRedemption.revokedAt } : null,
    customer: { ...o.customer, phone: localPhone(o.customer.phone), totalSpent: n(o.customer.totalSpent) },
    timeline: timeline(o),
  };
}

/** Customer view (me/orders/:no) — no costs, no internal notes. */
export function toCustomerOrder(o: OrderDetailRow) {
  return {
    orderNo: o.orderNo,
    status: o.status,
    statusLabel: STATUS_LABEL_BN[o.status],
    placedAt: o.placedAt,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    contact: { name: o.contactName, phone: localPhone(o.contactPhone), email: o.contactEmail },
    address: addressText(o),
    items: lines(o, false),
    money: moneyBlock(o),
    shipment: o.shipments.find((s) => s.status !== 'CANCELLED')
      ? (() => {
          const s = o.shipments.find((x) => x.status !== 'CANCELLED')!;
          return { courier: s.courier.name, trackingNo: s.trackingNo, trackingUrl: trackingUrl(s.courier, s.trackingNo), status: s.status };
        })()
      : null,
    canCancel: o.status === 'PENDING',
    timeline: timeline(o),
  };
}

/**
 * Public tracker — only reachable with the order's own phone number, so the
 * buyer sees their name and the bill; the street address stays private.
 */
export function toTrackedOrder(o: OrderDetailRow) {
  return {
    orderNo: o.orderNo,
    status: o.status,
    statusLabel: STATUS_LABEL_BN[o.status],
    placedAt: o.placedAt,
    customer: o.contactName.trim(),
    district: o.shipDistrict,
    items: o.items.map((i) => ({ title: i.title, quantity: i.quantity, kind: i.kind, unitPrice: n(i.unitPrice), lineTotal: n(i.lineTotal) })),
    money: { itemsSubtotal: n(o.itemsSubtotal), discountTotal: n(o.discountTotal), couponCode: o.couponCode, shippingFee: n(o.shippingFee), grandTotal: n(o.grandTotal) },
    grandTotal: n(o.grandTotal),
    paymentMethod: o.paymentMethod,
    paid: o.paymentStatus !== 'UNPAID',
    shipment: o.shipments.find((s) => s.status !== 'CANCELLED')
      ? (() => {
          const s = o.shipments.find((x) => x.status !== 'CANCELLED')!;
          return { courier: s.courier.name, trackingNo: s.trackingNo, trackingUrl: trackingUrl(s.courier, s.trackingNo) };
        })()
      : null,
    timeline: timeline(o),
  };
}

/** What POST /orders returns (and what idempotent replays return verbatim). */
export function toPlacedOrder(o: { id: string; orderNo: string; status: string; paymentMethod: string; paymentStatus: string; grandTotal: Prisma.Decimal; shippingFee: Prisma.Decimal; discountTotal: Prisma.Decimal; itemsSubtotal: Prisma.Decimal; taxTotal: Prisma.Decimal; shippingFeeReason: string | null; placedAt: Date; customerId: string }) {
  return {
    id: o.id,
    orderNo: o.orderNo,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    itemsSubtotal: n(o.itemsSubtotal),
    discountTotal: n(o.discountTotal),
    shippingFee: n(o.shippingFee),
    shippingFeeReason: o.shippingFeeReason,
    taxTotal: n(o.taxTotal),
    grandTotal: n(o.grandTotal),
    placedAt: o.placedAt.toISOString(),
    /** SSLCOMMERZ: call the payments API with this order id to get the gateway URL */
    requiresPayment: o.paymentMethod === 'SSLCOMMERZ',
  };
}
