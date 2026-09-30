"use client";

/** Per-staff UI preferences — GET/PATCH /admin/me/preferences ({ preferences: {...} } merge). */

import { useQuery } from "@tanstack/react-query";
import { get, patch } from "@/lib/api/client";
import { adminKeys, useAdminMutation } from "./core";

export type AdminPrefs = { lowStock: number; pageSize: number; dashPeriod?: string; [k: string]: unknown };
const DEFAULTS: AdminPrefs = { lowStock: 5, pageSize: 10 };

export function useAdminPrefsQuery() {
  return useQuery({
    queryKey: adminKeys.prefs,
    staleTime: 10 * 60_000,
    queryFn: () => get<Partial<AdminPrefs>>("/admin/me/preferences"),
  });
}

/** Resolved prefs with defaults (never undefined). */
export function useAdminPrefs(): AdminPrefs {
  const q = useAdminPrefsQuery();
  const raw = q.data ?? {};
  return {
    ...DEFAULTS,
    ...raw,
    lowStock: Number.isFinite(Number(raw.lowStock)) ? Math.max(0, Number(raw.lowStock)) : DEFAULTS.lowStock,
    pageSize: Number.isFinite(Number(raw.pageSize)) && Number(raw.pageSize) > 0 ? Number(raw.pageSize) : DEFAULTS.pageSize,
  };
}

export function useSetAdminPrefs() {
  return useAdminMutation<Partial<AdminPrefs>, AdminPrefs>({
    fn: (p) => patch<AdminPrefs>("/admin/me/preferences", { preferences: p }),
    optimistic: { key: adminKeys.prefs, patch: (old, p) => ({ ...(old as object), ...p }) },
    invalidate: [adminKeys.prefs],
  });
}
