"use client";

/** সেটিংস — shipping zones/rules, coupons, content (announcements/topbar, promo popup, hero, settings kv) */

import { useQuery } from "@tanstack/react-query";
import { del, get, patch, post, put } from "@/lib/api/client";
import { adminKeys, useAdminMutation, type Paged } from "./core";

/* ───────── shipping ───────── */

export type Zone = { id: number; code: string; nameBn: string; fee: number; courierCost: number; etaMinDays: number; etaMaxDays: number; districts: number };
export type ShipRule = {
  id: string; type: "MIN_SUBTOTAL" | "ANY_BUNDLE" | "SECTION_ONLY" | "CAMPAIGN_ALL"; label: string; minSubtotal: number | null;
  section: { id: string; code: string; nameBn: string } | null; startsAt: string | null; endsAt: string | null; isActive: boolean; priority: number;
};

export function useZones() {
  return useQuery({ queryKey: [...adminKeys.shipping, "zones"], queryFn: () => get<Zone[]>("/admin/shipping/zones") });
}
export function useShipRules() {
  return useQuery({ queryKey: [...adminKeys.shipping, "rules"], queryFn: () => get<ShipRule[]>("/admin/shipping/rules") });
}
export function usePatchZone() {
  return useAdminMutation<{ id: number; fee?: number; courierCost?: number }, Zone>({
    fn: ({ id, ...body }) => patch<Zone>(`/admin/shipping/zones/${id}`, body),
    invalidate: [adminKeys.shipping],
  });
}
export function useSaveShipRule() {
  return useAdminMutation<{ id?: string; body: Partial<Omit<ShipRule, "id" | "section">> & { section?: string | null } }, ShipRule>({
    fn: ({ id, body }) => (id ? patch<ShipRule>(`/admin/shipping/rules/${id}`, body) : post<ShipRule>("/admin/shipping/rules", body)),
    invalidate: [adminKeys.shipping],
  });
}
export function useDeleteShipRule() {
  return useAdminMutation<{ id: string }, unknown>({ fn: ({ id }) => del(`/admin/shipping/rules/${id}`), invalidate: [adminKeys.shipping] });
}

/* ───────── store settings (kv) ───────── */

export type SettingRow = { key: string; value: unknown; default: unknown; isDefault: boolean; public: boolean; description: string | null };
export function useStoreSettings() {
  return useQuery({ queryKey: [...adminKeys.settings, "kv"], queryFn: () => get<SettingRow[]>("/admin/content/settings") });
}
export function useSetStoreSettings() {
  return useAdminMutation<Record<string, unknown>, unknown>({
    fn: (values) => patch("/admin/content/settings", { values }),
    invalidate: [adminKeys.settings],
  });
}

/* ───────── coupons ───────── */

export type AdminCoupon = {
  id: string; code: string; description: string | null; type: "PERCENT" | "FIXED" | "FREE_SHIPPING"; value: number; minSubtotal: number;
  isActive: boolean; live: boolean; expired: boolean; exhausted: boolean; usedCount: number; startsAt: string | null; endsAt: string | null;
  stats: { uses: number; discountGiven: number; revenue: number };
};
export function useCoupons() {
  return useQuery({ queryKey: [...adminKeys.coupons, "list"], queryFn: () => get<Paged<AdminCoupon>>("/admin/coupons", { pageSize: 100 }) });
}
export function useCreateCoupon() {
  return useAdminMutation<{ code: string; type: "PERCENT" | "FIXED"; value: number; description?: string }, AdminCoupon>({
    fn: (body) => post<AdminCoupon>("/admin/coupons", body),
    invalidate: [adminKeys.coupons, ["admin", "dashboard"]],
    success: "কুপন যোগ হয়েছে",
  });
}
export function useToggleCoupon() {
  return useAdminMutation<{ id: string; code: string; on: boolean }, unknown>({
    fn: ({ id, on }) => post(`/admin/coupons/${id}/${on ? "activate" : "deactivate"}`),
    invalidate: [adminKeys.coupons, ["admin", "dashboard"]],
    success: (_d, v) => (v.on ? `${v.code} চালু হয়েছে` : `${v.code} বন্ধ করা হয়েছে`),
    optimistic: {
      key: [...adminKeys.coupons, "list"],
      patch: (old, v) => {
        const c = old as Paged<AdminCoupon> | undefined;
        return c?.items ? { ...c, items: c.items.map((x) => (x.id === v.id ? { ...x, isActive: v.on } : x)) } : old;
      },
    },
  });
}
export function useDeleteCoupon() {
  return useAdminMutation<{ id: string; code: string }, unknown>({
    fn: ({ id }) => del(`/admin/coupons/${id}`),
    invalidate: [adminKeys.coupons],
    success: (_d, v) => `${v.code} মুছে ফেলা হয়েছে`,
  });
}

/* ───────── announcements (topbar ticker) ───────── */

export type Announcement = { id: string; text: string; linkUrl: string | null; sortOrder: number; isActive: boolean };
export function useAnnouncements() {
  return useQuery({ queryKey: [...adminKeys.content, "announcements"], queryFn: () => get<Announcement[]>("/admin/content/announcements") });
}
export function useCreateAnnouncement() {
  return useAdminMutation<{ text: string }, Announcement>({
    fn: (body) => post<Announcement>("/admin/content/announcements", body),
    invalidate: [adminKeys.content],
    success: "টপবারে যোগ হয়েছে",
  });
}
export function useUpdateAnnouncement() {
  return useAdminMutation<{ id: string; text?: string; isActive?: boolean }, Announcement>({
    fn: ({ id, ...body }) => patch<Announcement>(`/admin/content/announcements/${id}`, body),
    invalidate: [adminKeys.content],
  });
}
export function useDeleteAnnouncement() {
  return useAdminMutation<{ id: string }, unknown>({
    fn: ({ id }) => del(`/admin/content/announcements/${id}`),
    invalidate: [adminKeys.content],
    success: "লাইন সরানো হয়েছে",
  });
}
export function useReorderAnnouncements() {
  return useAdminMutation<{ ids: string[] }, unknown>({ fn: (body) => put("/admin/content/announcements/order", body), invalidate: [adminKeys.content] });
}

/* ───────── promo popup ───────── */

export type Promo = {
  id: string; title: string; body: string | null; couponId: string | null; imageId: string | null; ctaLabel: string | null; ctaUrl: string | null;
  isActive: boolean; coupon: { id: string; code: string; isActive: boolean } | null; image: { id: string; url: string } | null;
};
export function usePromos() {
  return useQuery({ queryKey: [...adminKeys.content, "promos"], queryFn: () => get<Promo[]>("/admin/content/promos") });
}
export function useSavePromo() {
  return useAdminMutation<{ id?: string; body: { title: string; body?: string | null; couponId?: string | null; imageId?: string | null; isActive?: boolean } }, Promo>({
    fn: ({ id, body }) => (id ? patch<Promo>(`/admin/content/promos/${id}`, body) : post<Promo>("/admin/content/promos", body)),
    invalidate: [adminKeys.content],
    success: "অফার সেভ হয়েছে",
  });
}
