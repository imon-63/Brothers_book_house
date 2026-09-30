"use client";

/** Staff notifications (bell) — /admin/notifications, /unread-count, /:id/read, /read-all */

import { useQuery } from "@tanstack/react-query";
import { get, post } from "@/lib/api/client";
import { adminKeys, useAdminMutation, type Paged } from "./core";

export type AdminNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  /** in-app deep link, e.g. "#orders/CLO-2043" */
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export function useNotifications(pageSize = 20) {
  return useQuery({
    queryKey: [...adminKeys.notifications, "list", pageSize],
    queryFn: () => get<Paged<AdminNotification> & { unread: number }>("/admin/notifications", { pageSize }),
    refetchInterval: 45_000,
  });
}

type Cache = Paged<AdminNotification> & { unread: number };

export function useMarkNotificationRead() {
  return useAdminMutation<{ id: string }, unknown>({
    fn: ({ id }) => post(`/admin/notifications/${id}/read`),
    quietError: true,
    optimistic: {
      key: adminKeys.notifications,
      patch: (old, { id }) => {
        const c = old as Cache;
        if (!c?.items) return old;
        const hit = c.items.find((n) => n.id === id && !n.readAt);
        return { ...c, unread: Math.max(0, c.unread - (hit ? 1 : 0)), items: c.items.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) };
      },
    },
    invalidate: [adminKeys.notifications],
  });
}

export function useMarkAllNotificationsRead() {
  return useAdminMutation<void, unknown>({
    fn: () => post("/admin/notifications/read-all"),
    optimistic: {
      key: adminKeys.notifications,
      patch: (old) => {
        const c = old as Cache;
        if (!c?.items) return old;
        const now = new Date().toISOString();
        return { ...c, unread: 0, items: c.items.map((n) => ({ ...n, readAt: n.readAt ?? now })) };
      },
    },
    invalidate: [adminKeys.notifications],
  });
}
