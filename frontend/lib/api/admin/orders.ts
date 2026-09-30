"use client";

/** অর্ডার — /admin/orders (+ counts, kpis, board, detail, transitions, tags, notes, export, pick-list), shipments, refunds */

import { useQuery } from "@tanstack/react-query";
import { del, download, get, patch, post } from "@/lib/api/client";
import type { OrderStatus } from "@/lib/admin/status";
import { adminKeys, isoDay, useAdminMutation, type Paged } from "./core";

export type Priority = "NORMAL" | "HIGH" | "URGENT";
export type OrderTab = "all" | "pending" | "run" | "done" | "cancel";

export type OrderListItem = {
  id: string;
  orderNo: string;
  version: number;
  status: OrderStatus;
  statusLabel: string;
  priority: Priority;
  source: string;
  placedAt: string;
  customer: { id: string; name: string; phone: string } | null;
  address: string;
  district: string | null;
  items: { kind: "PRODUCT" | "BUNDLE"; productId: string | null; bundleId: string | null; title: string; quantity: number }[];
  itemCount: number;
  lineCount: number;
  sections: string[];
  paymentMethod: string;
  paymentStatus: string;
  due: boolean;
  grandTotal: number;
  couponCode: string | null;
  tags: { id: string; name: string; color: string | null }[];
  shipment: { courier: string; trackingNo: string | null; status: string } | null;
  next: { status: OrderStatus; label: string | null } | null;
  canRegress: boolean;
  ageMinutes: number;
};

export type OrderCounts = { tabs: Record<OrderTab, number>; byStatus: Partial<Record<OrderStatus, number>>; value: Partial<Record<OrderStatus, number>> };
export type OrderKpis = {
  today: { orders: number; value: number };
  pending: { orders: number; value: number; oldestAt: string | null };
  codToCollect: { orders: number; value: number };
  avgFulfilmentMinutes?: number | null;
  statuses: OrderStatus[];
};
export type OrderTag = { id: string; name: string; color: string | null; orders: number };
export type BoardColumn = { status: OrderStatus; label: string; count: number; value: number; orders: OrderListItem[] };

export type OrderLine = {
  id: string;
  kind: "PRODUCT" | "BUNDLE";
  productId: string | null;
  bundleId: string | null;
  title: string;
  sku: string | null;
  sectionCode: string | null;
  categoryName: string | null;
  quantity: number;
  quantityReturned: number;
  unitPrice: number;
  listPrice: number;
  discount: number;
  lineTotal: number;
  unitCost: number | null;
  margin: number | null;
  components: { productId: string; title: string; quantity: number }[];
};

export type OrderDetail = {
  id: string;
  orderNo: string;
  version: number;
  status: OrderStatus;
  statusLabel: string;
  priority: Priority;
  source: string;
  paymentMethod: string;
  paymentStatus: string;
  due: boolean;
  contact: { name: string; phone: string; email: string | null };
  address: { text: string; district: string | null; upazila: string | null; zoneCode: string | null };
  customerNote: string | null;
  items: OrderLine[];
  money: {
    itemsSubtotal: number; discountTotal: number; couponCode: string | null; shippingFee: number; shippingFeeReason: string | null;
    grandTotal: number; amountPaid: number; amountRefunded: number; due: number; itemsCost: number | null; courierCost: number;
    gatewayFee: number; courierLoss: number; estimatedProfit: number | null; profitComplete: boolean;
  };
  stockReserved: boolean;
  cancelReason: string | null;
  cancelledFrom: OrderStatus | null;
  timestamps: { placedAt: string; confirmedAt: string | null; shippedAt: string | null; deliveredAt: string | null; cancelledAt: string | null; paidAt: string | null };
  next: { status: OrderStatus; label: string | null } | null;
  canRegress: boolean;
  history: { id: string; from: OrderStatus | null; to: OrderStatus; label: string; actorType: string; by: { id: string; name: string } | null; note: string | null; at: string }[];
  notes: { id: string; body: string; isPinned: boolean; by: { id: string; name: string } | null; at: string }[];
  tags: { id: string; name: string; color: string | null }[];
  shipments: { id: string; courier: { id: string; code: string; name: string }; trackingNo: string | null; trackingUrl: string | null; status: string; createdAt?: string }[];
  payments: { id: string; method: string; status: string; amount: number }[];
  documents: { id: string; docNo: string; kind: string; total: number; issuedAt: string }[];
  customer: {
    id: string; name: string; phone: string; email: string | null; isBlocked: boolean; blockedReason: string | null;
    ordersCount: number; liveOrders: number; cancelledOrders: number; totalSpent: number;
  } | null;
};

export type PickList = {
  groups: { productId: string; title: string; sku: string | null; quantity: number; stockOnHand: number; shortfall: number; orders: string[]; viaBundles: string[] }[];
  units: number;
  shortCount: number;
  orders: { orderNo: string; contactName: string; contactPhone: string; address: string }[];
};

export type Courier = { id: string; code: string; name: string; isActive: boolean };

export type OrderFilter = {
  tab?: OrderTab;
  q?: string;
  range?: "all" | "today" | "7" | "30" | "custom";
  from?: string;
  to?: string;
  pay?: "all" | "cod" | "ssl" | "due";
  section?: string;
  priority?: "all" | "flagged" | "urgent";
  tag?: string;
  sort?: "new" | "old" | "high" | "low" | "prio";
  customerId?: string;
};

const clean = <T extends object>(f: T) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== "" && v !== "all")) as Partial<T>;

/* ───────── queries ───────── */

export function useOrders(filter: OrderFilter, page: number, pageSize: number) {
  const f = clean(filter);
  return useQuery({
    queryKey: [...adminKeys.orders, "list", f, page, pageSize],
    placeholderData: (prev) => prev,
    queryFn: () => get<Paged<OrderListItem> & { counts: OrderCounts }>("/admin/orders", { ...f, page, pageSize }),
  });
}

export function useOrderCounts(filter: OrderFilter) {
  const { tab: _t, ...rest } = clean(filter);
  return useQuery({ queryKey: [...adminKeys.orders, "counts", rest], placeholderData: (p) => p, queryFn: () => get<OrderCounts>("/admin/orders/counts", rest) });
}

export function useOrderKpis() {
  return useQuery({ queryKey: [...adminKeys.orders, "kpis"], queryFn: () => get<OrderKpis>("/admin/orders/kpis"), refetchInterval: 60_000 });
}

export function useOrderBoard(filter: OrderFilter, enabled: boolean) {
  const f = clean(filter);
  return useQuery({
    queryKey: [...adminKeys.orders, "board", f],
    enabled,
    placeholderData: (p) => p,
    queryFn: () => get<{ columns: BoardColumn[] }>("/admin/orders/board", { ...f, perColumn: 40 }),
  });
}

export function useOrder(ref: string | null) {
  return useQuery({
    queryKey: [...adminKeys.orders, "detail", ref],
    enabled: !!ref,
    queryFn: () => get<OrderDetail>(`/admin/orders/${encodeURIComponent(ref!)}`),
  });
}

export function useOrderTags() {
  return useQuery({ queryKey: [...adminKeys.orders, "tags"], staleTime: 5 * 60_000, queryFn: () => get<OrderTag[]>("/admin/orders/tags") });
}

export function useCouriers() {
  return useQuery({ queryKey: [...adminKeys.shipping, "couriers"], staleTime: 10 * 60_000, queryFn: () => get<Courier[]>("/admin/shipping/couriers") });
}

export function usePickList(ids: string[] | null) {
  return useQuery({
    queryKey: [...adminKeys.orders, "pick", ids],
    enabled: !!ids?.length,
    queryFn: () => get<PickList>("/admin/orders/pick-list", { ids: ids!.join(",") }),
  });
}

export function exportOrders(filter: OrderFilter) {
  return download("/admin/orders/export.csv", `orders-${isoDay()}.csv`, clean(filter));
}

/* ───────── mutations ───────── */

const orderFallout = [adminKeys.orders, ["admin", "dashboard"], adminKeys.customers, adminKeys.finance, adminKeys.documents, adminKeys.products, adminKeys.notifications];

type Credit = { reason: string; courierLoss?: number };

export function useChangeOrderStatus() {
  return useAdminMutation<{ ref: string; to: OrderStatus; version?: number; note?: string; credit?: Credit; toast?: string }, unknown>({
    fn: ({ ref, to, version, note, credit }) => post(`/admin/orders/${encodeURIComponent(ref)}/status`, { to, version, note, credit }),
    invalidate: orderFallout,
    success: (_d, v) => v.toast ?? "স্ট্যাটাস বদলেছে",
    // board/list feel instant: move the row right away
    optimistic: {
      key: adminKeys.orders,
      patch: (old, v) => patchRows(old, v.ref, (o) => ({ ...o, status: v.to })),
    },
  });
}

export function useRegressOrder() {
  return useAdminMutation<{ ref: string; version?: number; note?: string }, unknown>({
    fn: ({ ref, version, note }) => post(`/admin/orders/${encodeURIComponent(ref)}/regress`, { version, note }),
    invalidate: orderFallout,
    success: "আগের ধাপে ফেরানো হয়েছে",
  });
}

export function useReopenOrder() {
  return useAdminMutation<{ ref: string; reason: string; to?: "PENDING" | "CONFIRMED"; version?: number }, { orderNo: string }>({
    fn: ({ ref, reason, to, version }) => post(`/admin/orders/${encodeURIComponent(ref)}/reopen`, { reason, to, version }),
    invalidate: orderFallout,
    quietError: true, // the modal shows the reason inline
    success: (_d, v) => `অর্ডার আবার চালু হয়েছে · ${v.to === "CONFIRMED" ? "কনফার্ম" : "অপেক্ষমাণ"}`,
  });
}

export function useMarkPaid() {
  return useAdminMutation<{ ref: string; version?: number; quiet?: boolean }, unknown>({
    fn: ({ ref, version }) => post(`/admin/orders/${encodeURIComponent(ref)}/mark-paid`, { version }),
    invalidate: orderFallout,
    success: (_d, v) => (v.quiet ? null : "টাকা পাওয়া গেছে · রিসিট কাটা হয়েছে"),
  });
}

export function useBulkStatus() {
  return useAdminMutation<{ ids: string[]; action: "confirm" | "advance" | "set"; to?: OrderStatus; toast?: string }, BulkResult>({
    fn: ({ ids, action, to }) => post<BulkResult>("/admin/orders/bulk/status", { ids, action, to }),
    invalidate: orderFallout,
    success: (d, v) => `${v.toast ?? "আপডেট হয়েছে"}${d?.failed ? ` · ${d.failed}টি হয়নি` : ""}`,
  });
}

export type BulkResult = { total: number; succeeded: number; failed: number; results: unknown[] };

export function useBulkMarkPaid() {
  return useAdminMutation<{ ids: string[]; toast?: string }, BulkResult>({
    fn: ({ ids }) => post<BulkResult>("/admin/orders/bulk/mark-paid", { ids }),
    invalidate: orderFallout,
    success: (d, v) => `${v.toast ?? "টাকা পাওয়া গেছে"}${d?.failed ? ` · ${d.failed}টি হয়নি` : ""}`,
  });
}

export function useSetPriority() {
  return useAdminMutation<{ ref: string; priority: Priority }, unknown>({
    fn: ({ ref, priority }) => patch(`/admin/orders/${encodeURIComponent(ref)}/priority`, { priority }),
    invalidate: [adminKeys.orders],
    optimistic: { key: adminKeys.orders, patch: (old, v) => patchRows(old, v.ref, (o) => ({ ...o, priority: v.priority })) },
  });
}

export function useAddOrderTag() {
  return useAdminMutation<{ ref: string; name: string }, unknown>({
    fn: ({ ref, name }) => post(`/admin/orders/${encodeURIComponent(ref)}/tags`, { name }),
    invalidate: [adminKeys.orders],
    optimistic: { key: adminKeys.orders, patch: (old, v) => patchRows(old, v.ref, (o) => ({ ...o, tags: [...o.tags, { id: `tmp-${v.name}`, name: v.name, color: null }] })) },
  });
}

export function useRemoveOrderTag() {
  return useAdminMutation<{ ref: string; tagId: string }, unknown>({
    fn: ({ ref, tagId }) => del(`/admin/orders/${encodeURIComponent(ref)}/tags/${tagId}`),
    invalidate: [adminKeys.orders],
    optimistic: { key: adminKeys.orders, patch: (old, v) => patchRows(old, v.ref, (o) => ({ ...o, tags: o.tags.filter((t) => t.id !== v.tagId) })) },
  });
}

export function useAddOrderNote() {
  return useAdminMutation<{ ref: string; body: string; isPinned?: boolean }, unknown>({
    fn: ({ ref, body, isPinned }) => post(`/admin/orders/${encodeURIComponent(ref)}/notes`, { body, isPinned }),
    invalidate: [adminKeys.orders],
  });
}

export function useDeleteOrderNote() {
  return useAdminMutation<{ ref: string; noteId: string }, unknown>({
    fn: ({ ref, noteId }) => del(`/admin/orders/${encodeURIComponent(ref)}/notes/${noteId}`),
    invalidate: [adminKeys.orders],
  });
}

export function useAssignShipment() {
  return useAdminMutation<{ order: string; courier: string; trackingNo?: string | null; shipmentId?: string }, unknown>({
    fn: ({ order, courier, trackingNo, shipmentId }) =>
      shipmentId
        ? patch(`/admin/shipping/shipments/${shipmentId}`, { trackingNo: trackingNo || null })
        : post("/admin/shipping/shipments", { order, courier, trackingNo: trackingNo || null }),
    invalidate: [adminKeys.orders, adminKeys.shipping],
    success: "কুরিয়ার তথ্য সেভ হয়েছে",
  });
}

export function useOrderRefunds(orderId: string | null) {
  return useQuery({
    queryKey: [...adminKeys.orders, "refunds", orderId],
    enabled: !!orderId,
    queryFn: () => get<{ id: string; amount: number; status: string; reason: string | null; createdAt: string }[]>(`/admin/orders/${orderId}/refunds`),
  });
}

/* ───────── cache helpers ───────── */

type WithRows = { items?: OrderListItem[]; columns?: BoardColumn[] } & Partial<OrderDetail>;

/** Patch one order (by uuid or orderNo) wherever it appears: list pages, board columns, detail. */
function patchRows(old: unknown, ref: string, fn: <T extends { status: OrderStatus; priority: Priority; tags: OrderListItem["tags"] }>(o: T) => T): unknown {
  const c = old as WithRows;
  if (!c || typeof c !== "object") return old;
  const hit = (o: { id: string; orderNo: string }) => o.id === ref || o.orderNo === ref;
  if (Array.isArray(c.items)) return { ...c, items: c.items.map((o) => (hit(o) ? fn(o) : o)) };
  if (Array.isArray(c.columns)) {
    const moved = c.columns.flatMap((col) => col.orders).find(hit);
    if (!moved) return old;
    const next = fn(moved);
    return {
      ...c,
      columns: c.columns.map((col) => {
        const rest = col.orders.filter((o) => !hit(o));
        const orders = col.status === next.status ? [next, ...rest] : rest;
        return { ...col, orders, count: col.count + (orders.length - col.orders.length) };
      }),
    };
  }
  if (typeof c.id === "string" && typeof c.orderNo === "string" && hit(c as { id: string; orderNo: string })) return fn(c as OrderDetail);
  return old;
}
