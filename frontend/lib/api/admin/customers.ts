"use client";

/** কাস্টমার (CRM) — /admin/customers (+kpis, tags, export, detail, notes, tags, block) */

import { useQuery } from "@tanstack/react-query";
import { del, download, get, patch, post, put } from "@/lib/api/client";
import { adminKeys, isoDay, useAdminMutation, type Paged } from "./core";

export type CustomerTag = { id: string; name: string; color: string | null };
export const tagNames = (tags: (CustomerTag | string)[] | undefined) => (tags ?? []).map((t) => (typeof t === "string" ? t : t.name));

export type ApiSegment = "new" | "regular" | "vip" | "risk" | "sleep";

export type CustomerRow = {
  id: string; name: string; phone: string | null; email: string | null; registered: boolean; blocked: boolean; blockedReason: string | null;
  segment: ApiSegment; ordersCount: number; liveOrders: number; cancelledOrders: number; cancelRate: number; totalSpent: number; aov: number;
  firstOrderAt: string | null; lastOrderAt: string | null; createdAt: string; tags: CustomerTag[]; spark?: number[];
};

export type CustomerKpis = {
  total: number; registered: number; guests: number; buyers: number; repeaters: number; repeatRate: number; avgLtv: number; topSpend: number;
  newThisMonth: number; newLastMonth: number; atRisk: number; dormant: number; blocked: number;
  segments: Record<ApiSegment, number>;
  newSeries: { month: string; count: number }[];
  cumulative: { month: string; count: number }[];
  topCustomers: CustomerRow[];
  followUps: CustomerRow[];
};

export type CustomerDetail = Omit<CustomerRow, "ordersCount" | "liveOrders" | "cancelledOrders" | "cancelRate" | "totalSpent" | "aov" | "firstOrderAt" | "lastOrderAt"> & {
  account: { id: string } | null;
  adminNote: string | null;
  stats: {
    ordersCount: number; liveOrders: number; cancelledOrders: number; cancelRate: number; totalSpent: number; aov: number;
    firstOrderAt: string | null; lastOrderAt: string | null; daysSinceLastOrder: number | null;
    payment: { cod: number; ssl: number; other: number; codShare: number; sslShare: number };
    favouriteSection: { key: string; share: number } | null;
    favouriteCategory: { key: string; share: number } | null;
    conversations: number;
  };
  monthlySpend: { month: string; amount: number; orders: number }[];
  topItems: { kind: "PRODUCT" | "BUNDLE"; id: string; title: string; qty: number; amount: number }[];
  orders: { id: string; orderNo: string; status: string; paymentMethod: string; paymentStatus: string; grandTotal: number; itemCount: number; placedAt: string }[];
  addresses: { id: string; label: string | null; recipientName: string; phone: string; district: string; upazila: string | null; union: string | null; line: string; landmark: string | null; isDefault: boolean }[];
  wishlist: { id: string; kind: "product" | "bundle"; refId: string; title: string; price: number; stock: number | null }[];
  notes: { id: string; body: string; isPinned: boolean; author: { id: string; name: string } | null; createdAt: string }[];
};

export type CustomerFilter = { q?: string; segment?: ApiSegment; kind?: "registered" | "guest"; tag?: string; blocked?: boolean; sort?: "last" | "spent" | "orders" | "aov" | "name"; order?: "asc" | "desc" };

const clean = <T extends object>(f: T) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;

export function useCustomers(filter: CustomerFilter, pageSize: number) {
  const f = clean(filter);
  return useQuery({
    queryKey: [...adminKeys.customers, "list", f, pageSize],
    placeholderData: (p) => p,
    queryFn: () => get<Paged<CustomerRow>>("/admin/customers", { ...f, pageSize }),
  });
}

export function useCustomerKpis() {
  return useQuery({ queryKey: [...adminKeys.customers, "kpis"], queryFn: () => get<CustomerKpis>("/admin/customers/kpis") });
}

export function useCustomerTags() {
  return useQuery({
    queryKey: [...adminKeys.customers, "tags"],
    staleTime: 5 * 60_000,
    queryFn: () => get<{ tags: { id: string; name: string; color: string | null; count: number }[] }>("/admin/customers/tags"),
  });
}

export function useCustomer(id: string | null) {
  return useQuery({ queryKey: [...adminKeys.customers, "detail", id], enabled: !!id, queryFn: () => get<CustomerDetail>(`/admin/customers/${id}`) });
}

export function exportCustomers(filter: CustomerFilter) {
  return download("/admin/customers/export.csv", `customers-${isoDay()}.csv`, clean(filter));
}

const fallout = [adminKeys.customers, adminKeys.orders];

function patchCust(old: unknown, id: string, fn: (c: { tags: CustomerTag[]; blocked: boolean; adminNote?: string | null }) => object): unknown {
  const c = old as (Paged<CustomerRow> & { id?: string }) | CustomerDetail | undefined;
  if (!c) return old;
  if ("items" in c && Array.isArray(c.items)) return { ...c, items: c.items.map((r) => (r.id === id ? { ...r, ...fn(r) } : r)) };
  if ((c as CustomerDetail).id === id) return { ...c, ...fn(c as CustomerDetail) };
  return old;
}

export function useSetCustomerTags() {
  return useAdminMutation<{ id: string; tags: string[] }, unknown>({
    fn: ({ id, tags }) => put(`/admin/customers/${id}/tags`, { tags }),
    invalidate: fallout,
    optimistic: { key: adminKeys.customers, patch: (old, v) => patchCust(old, v.id, () => ({ tags: v.tags.map((name) => ({ id: `tmp-${name}`, name, color: null })) })) },
  });
}

export function useBulkCustomerTag() {
  return useAdminMutation<{ customerIds: string[]; tag: string; action: "add" | "remove"; toast: string }, unknown>({
    fn: ({ toast: _t, ...body }) => post("/admin/customers/tags/bulk", body),
    invalidate: fallout,
    success: (_d, v) => v.toast,
  });
}

export function useBlockCustomer() {
  return useAdminMutation<{ id: string; name: string; blocked: boolean; reason?: string }, unknown>({
    fn: ({ id, blocked, reason }) => (blocked ? post(`/admin/customers/${id}/block`, { reason: reason || "অ্যাডমিন ব্লক করেছেন" }) : post(`/admin/customers/${id}/unblock`)),
    invalidate: fallout,
    success: (_d, v) => (v.blocked ? `${v.name} ব্লক করা হয়েছে` : `${v.name} আনব্লক হয়েছে`),
    optimistic: { key: adminKeys.customers, patch: (old, v) => patchCust(old, v.id, () => ({ blocked: v.blocked })) },
  });
}

export function useUpdateCustomer() {
  return useAdminMutation<{ id: string; adminNote?: string | null; name?: string; toast?: string }, unknown>({
    fn: ({ id, toast: _t, ...body }) => patch(`/admin/customers/${id}`, body),
    invalidate: fallout,
    success: (_d, v) => v.toast ?? "সংরক্ষিত হয়েছে",
  });
}

export function useAddCustomerNote() {
  return useAdminMutation<{ id: string; body: string; isPinned?: boolean }, unknown>({
    fn: ({ id, body, isPinned }) => post(`/admin/customers/${id}/notes`, { body, isPinned }),
    invalidate: [adminKeys.customers],
    success: "নোট যোগ হয়েছে",
  });
}

export function useDeleteCustomerNote() {
  return useAdminMutation<{ id: string; noteId: string }, unknown>({
    fn: ({ id, noteId }) => del(`/admin/customers/${id}/notes/${noteId}`),
    invalidate: [adminKeys.customers],
  });
}
