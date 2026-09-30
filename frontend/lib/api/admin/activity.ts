"use client";

/** অ্যাক্টিভিটি লগ — append-only audit trail: /admin/activity (keyset `before`), /stats, /export */

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { download, get } from "@/lib/api/client";
import { adminKeys, isoDay } from "./core";

export type ActivityArea = "order" | "product" | "finance" | "settings" | "customer" | "chat" | "auth" | "inventory";

export type ActivityRow = {
  id: string;
  actorType: "STAFF" | "CUSTOMER" | "SYSTEM" | string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  area: ActivityArea | string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
};

export type ActivityFilter = { area?: string; actorId?: string; q?: string; from?: string; to?: string; limit?: number };
export type ActivityStats = {
  today: number;
  week: number;
  topArea: { area: string; count: number } | null;
  byArea: { area: string; count: number }[];
  daily: { day: string; count: number }[];
};

const clean = (f: ActivityFilter) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== "")) as ActivityFilter;

/** Infinite feed, newest first. `fetchNextPage()` loads older rows. */
export function useActivityFeed(filter: ActivityFilter = {}) {
  const f = clean(filter);
  return useInfiniteQuery({
    queryKey: [...adminKeys.activity, "feed", f],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => get<{ items: ActivityRow[]; nextCursor: string | null }>("/admin/activity", { ...f, before: pageParam ?? undefined }),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 60_000,
  });
}

/** Just the latest N rows (dashboard card). */
export function useRecentActivity(limit = 8) {
  return useQuery({
    queryKey: [...adminKeys.activity, "recent", limit],
    queryFn: () => get<{ items: ActivityRow[]; nextCursor: string | null }>("/admin/activity", { limit }),
    refetchInterval: 60_000,
  });
}

export function useActivityStats() {
  return useQuery({ queryKey: [...adminKeys.activity, "stats"], queryFn: () => get<ActivityStats>("/admin/activity/stats"), refetchInterval: 60_000 });
}

export function exportActivity(filter: ActivityFilter = {}) {
  const { limit: _l, ...f } = clean(filter);
  return download("/admin/activity/export", `cholo-activity-${isoDay()}.csv`, f);
}
