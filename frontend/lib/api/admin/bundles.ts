"use client";

/** প্যাকেজ — /admin/bundles */

import { useQuery } from "@tanstack/react-query";
import { del, get, patch, post } from "@/lib/api/client";
import { adminKeys, useAdminMutation, type Paged } from "./core";

export type BundleItem = {
  id: string; title: string; subtitle: string | null; price: number; quantity: number;
  cover: { url: string | null; color: string | null }; category: { name: string } | null;
};
export type AdminBundle = {
  id: string; slug: string; title: string; description: string | null;
  section: { id: string; code: string; name: string };
  cover: { url: string | null }; price: number; compareAt: number | null; separatePrice: number;
  freeShipping: boolean; soldCount: number; itemCount: number; items: BundleItem[]; status?: string;
};

export function useAdminBundles(section?: string) {
  return useQuery({
    queryKey: [...adminKeys.bundles, "list", section],
    queryFn: () => get<Paged<AdminBundle>>("/admin/bundles", { section, pageSize: 100 }),
  });
}

const fallout = [adminKeys.bundles, adminKeys.sections];

export function useCreateBundle() {
  return useAdminMutation<{ sectionId: string; title: string; price: number; compareAtPrice?: number | null; freeShipping?: boolean; description?: string; items: { productId: string; quantity?: number }[] }, AdminBundle>({
    fn: (body) => post<AdminBundle>("/admin/bundles", body),
    invalidate: fallout,
    success: "প্যাকেজ যোগ হয়েছে",
  });
}

export function usePatchBundle() {
  return useAdminMutation<{ id: string; body: { freeShipping?: boolean; price?: number; title?: string }; toast?: string }, AdminBundle>({
    fn: ({ id, body }) => patch<AdminBundle>(`/admin/bundles/${id}`, body),
    invalidate: fallout,
    success: (_d, v) => v.toast ?? "প্যাকেজ আপডেট হয়েছে",
    optimistic: {
      key: adminKeys.bundles,
      patch: (old, v) => {
        const c = old as Paged<AdminBundle> | undefined;
        return c?.items ? { ...c, items: c.items.map((b) => (b.id === v.id ? { ...b, ...v.body } : b)) } : old;
      },
    },
  });
}

export function useDeleteBundle() {
  return useAdminMutation<{ id: string }, unknown>({
    fn: ({ id }) => del(`/admin/bundles/${id}`),
    invalidate: fallout,
    success: "প্যাকেজ মুছে ফেলা হয়েছে",
  });
}
