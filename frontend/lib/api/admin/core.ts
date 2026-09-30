"use client";

/**
 * Shared plumbing for every admin data hook (lib/api/admin/<domain>.ts).
 *
 *  • adminKeys  — one query-key namespace per domain so mutations can
 *                 invalidate precisely (["admin", "orders", …]).
 *  • useToast   — the existing ui-slice toast (the only Redux bit we keep).
 *  • useAdminMutation — useMutation + error toast + invalidation + optional
 *                 optimistic patching of cached queries.
 *  • small mappers: ms() for ISO → epoch ms, money() for Prisma Decimal strings.
 */

import { useCallback } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError, errorText } from "@/lib/api/client";
import { showToast } from "@/store/slices/ui-slice";
import { useAppDispatch } from "@/store/hooks";

export type Paged<T> = { items: T[]; page: number; pageSize: number; total: number; pages: number };

export const adminKeys = {
  all: ["admin"] as const,
  dashboard: (period: string) => ["admin", "dashboard", period] as const,
  sections: ["admin", "sections"] as const,
  categories: (sectionId: string) => ["admin", "categories", sectionId] as const,
  categoriesAll: ["admin", "categories"] as const,
  orders: ["admin", "orders"] as const,
  customers: ["admin", "customers"] as const,
  products: ["admin", "products"] as const,
  bundles: ["admin", "bundles"] as const,
  support: ["admin", "support"] as const,
  finance: ["admin", "finance"] as const,
  documents: ["admin", "documents"] as const,
  settings: ["admin", "settings"] as const,
  shipping: ["admin", "shipping"] as const,
  coupons: ["admin", "coupons"] as const,
  content: ["admin", "content"] as const,
  activity: ["admin", "activity"] as const,
  notifications: ["admin", "notifications"] as const,
  staff: ["admin", "staff"] as const,
  prefs: ["admin", "prefs"] as const,
  search: (q: string) => ["admin", "search", q] as const,
};

/** ISO string → epoch ms (0 when empty). */
export function ms(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Prisma Decimal arrives as string — coerce to number. */
export function money(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Local calendar day (YYYY-MM-DD) — the API reads it as a Dhaka day. */
export function isoDay(t: number | Date = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Toast text for a failed request. Validation errors (400) carry the
 * per-field messages in `errors` — show those instead of the generic detail.
 */
export function adminErrorText(err: unknown): string {
  if (err instanceof ApiError && err.errors?.length) return err.errors.slice(0, 3).join(" · ");
  return errorText(err);
}

export function useToast() {
  const dispatch = useAppDispatch();
  return useCallback((text: string) => { dispatch(showToast(text)); }, [dispatch]);
}

type Keys<TVars, TData> = QueryKey[] | ((vars: TVars, data: TData | undefined) => QueryKey[]);

export type AdminMutationOptions<TVars, TData> = {
  fn: (vars: TVars) => Promise<TData>;
  /** query keys (prefixes) to invalidate once the call settles */
  invalidate?: Keys<TVars, TData>;
  /** toast on success */
  success?: string | ((data: TData, vars: TVars) => string | null | undefined);
  /** silence the default error toast (caller handles it) */
  quietError?: boolean;
  /**
   * Optimistic update: patch every cached query under `key` before the call.
   * Return the new cache value; the old one is restored on error.
   */
  optimistic?: { key: QueryKey; patch: (old: unknown, vars: TVars) => unknown };
  onSuccess?: (data: TData, vars: TVars) => void;
  onError?: (err: unknown, vars: TVars) => void;
};

export function useAdminMutation<TVars = void, TData = unknown>(opts: AdminMutationOptions<TVars, TData>) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation<TData, unknown, TVars, { snaps: [QueryKey, unknown][] }>({
    mutationFn: opts.fn,
    onMutate: async (vars) => {
      if (!opts.optimistic) return { snaps: [] };
      const { key, patch } = opts.optimistic;
      await qc.cancelQueries({ queryKey: key });
      const snaps = qc.getQueriesData({ queryKey: key });
      for (const [k, old] of snaps) {
        if (old !== undefined) qc.setQueryData(k, patch(old, vars));
      }
      return { snaps };
    },
    onError: (err, vars, ctx) => {
      ctx?.snaps.forEach(([k, old]) => qc.setQueryData(k, old));
      if (!opts.quietError) toast(adminErrorText(err));
      opts.onError?.(err, vars);
    },
    onSuccess: (data, vars) => {
      const msg = typeof opts.success === "function" ? opts.success(data, vars) : opts.success;
      if (msg) toast(msg);
      opts.onSuccess?.(data, vars);
    },
    onSettled: (data, _err, vars) => {
      const keys = typeof opts.invalidate === "function" ? opts.invalidate(vars, data) : opts.invalidate;
      keys?.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    },
  });
}
