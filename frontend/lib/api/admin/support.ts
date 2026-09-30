"use client";

/**
 * চ্যাট ইনবক্স — /admin/support/* + live SSE stream.
 *
 * GET /admin/support/stream needs `Authorization: Bearer` (JwtStrategy only
 * reads the header), so EventSource can't be used; useSupportStream() reads
 * the stream with fetch() and parses SSE frames by hand.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, del, get, getAccessToken, patch, post, refreshSession } from "@/lib/api/client";
import { adminKeys, useAdminMutation, type Paged } from "./core";

export type ConvStatus = "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
export type Conversation = {
  id: string; name: string; registered: boolean; customer: { id: string; name: string; phone: string | null } | null;
  status: ConvStatus; channel: string; assignee: { id: string; name: string } | null; unread: number; needsReply: boolean;
  last: { preview: string; sender: "CUSTOMER" | "STAFF" | "SYSTEM"; at: string } | null; lastMessageAt: string; createdAt: string;
};
export type Message = { id: string; sender: "CUSTOMER" | "STAFF" | "SYSTEM"; senderName: string | null; body: string; readAt: string | null; createdAt: string };
export type Thread = {
  id: string; name: string; status: ConvStatus; channel: string; assignee: { id: string; name: string } | null; unread: number; createdAt: string; closedAt: string | null;
  customer: {
    id: string; name: string; phone: string | null; email: string | null; registered: boolean; blocked: boolean; ordersCount: number; liveOrders: number; totalSpent: number;
    recentOrders: { id: string; orderNo: string; status: string; grandTotal: number; placedAt: string }[];
  } | null;
  messages: Message[];
};
export type InboxCounts = { open: number; pending: number; unreadThreads: number; unreadMessages: number; needsReply: number; mine: number; unassigned: number };
export type CannedReply = { id: string; title: string; body: string; sortOrder: number };

const k = adminKeys.support;

export function useConversations(filter: { status?: string; unread?: boolean; q?: string }) {
  return useQuery({
    queryKey: [...k, "list", filter],
    placeholderData: (p) => p,
    queryFn: () => get<Paged<Conversation>>("/admin/support/conversations", { ...filter, pageSize: 100 }),
    refetchInterval: 60_000,
  });
}

export function useInboxCounts() {
  return useQuery({ queryKey: [...k, "counts"], queryFn: () => get<InboxCounts>("/admin/support/conversations/counts"), refetchInterval: 60_000 });
}

/** Threads waiting for a staff reply (nav badge). */
export function useUnrepliedCount() {
  return useInboxCounts().data?.needsReply ?? 0;
}

export function useThread(id: string | null) {
  return useQuery({ queryKey: [...k, "thread", id], enabled: !!id, queryFn: () => get<Thread>(`/admin/support/conversations/${id}`) });
}

export function useCannedReplies() {
  return useQuery({ queryKey: [...k, "canned"], staleTime: 10 * 60_000, queryFn: () => get<CannedReply[]>("/admin/support/canned-replies") });
}

export function useSendReply() {
  return useAdminMutation<{ id: string; body: string }, unknown>({
    fn: ({ id, body }) => post(`/admin/support/conversations/${id}/messages`, { body }),
    invalidate: [k, ["admin", "dashboard"]],
    optimistic: {
      key: [...k, "thread"],
      patch: (old, v) => {
        const t = old as Thread | undefined;
        if (!t || t.id !== v.id) return old;
        const msg: Message = { id: `tmp-${Date.now()}`, sender: "STAFF", senderName: null, body: v.body, readAt: null, createdAt: new Date().toISOString() };
        return { ...t, messages: [...t.messages, msg] };
      },
    },
  });
}

export function useMarkThreadRead() {
  return useAdminMutation<{ id: string }, unknown>({
    fn: ({ id }) => post(`/admin/support/conversations/${id}/read`),
    quietError: true,
    invalidate: [[...k, "list"], [...k, "counts"]],
  });
}

export function useConversationAction() {
  return useAdminMutation<{ id: string; action: "resolve" | "close" | "reopen" | "pending" }, unknown>({
    fn: ({ id, action }) => post(`/admin/support/conversations/${id}/${action}`),
    invalidate: [k, ["admin", "dashboard"]],
    success: (_d, v) => ({ resolve: "সমাধান হয়েছে", close: "বন্ধ করা হয়েছে", reopen: "আবার খোলা হয়েছে", pending: "অপেক্ষমাণ করা হয়েছে" })[v.action],
  });
}

export function useAssignConversation() {
  return useAdminMutation<{ id: string; assigneeId: string | null }, unknown>({
    fn: ({ id, assigneeId }) => patch(`/admin/support/conversations/${id}/assign`, { assigneeId }),
    invalidate: [k],
    success: (_d, v) => (v.assigneeId ? "দায়িত্ব দেওয়া হয়েছে" : "দায়িত্ব সরানো হয়েছে"),
  });
}

export function useSaveCannedReply() {
  return useAdminMutation<{ id?: string; title: string; body: string }, unknown>({
    fn: ({ id, ...body }) => (id ? patch(`/admin/support/canned-replies/${id}`, body) : post("/admin/support/canned-replies", body)),
    invalidate: [[...k, "canned"]],
    success: "দ্রুত উত্তর সেভ হয়েছে",
  });
}

export function useDeleteCannedReply() {
  return useAdminMutation<{ id: string }, unknown>({
    fn: ({ id }) => del(`/admin/support/canned-replies/${id}`),
    invalidate: [[...k, "canned"]],
    success: "দ্রুত উত্তর মুছে ফেলা হয়েছে",
  });
}

/* ───────── live stream (SSE over fetch) ───────── */

type StreamEvent =
  | { type: "message"; conversationId: string; message: { id: string; sender: Message["sender"]; senderName: string | null; body: string; createdAt: string } }
  | { type: "conversation"; conversationId: string; status: ConvStatus; unreadByStaff: number }
  | { type: "read"; conversationId: string; by: "STAFF" | "CUSTOMER" };

/** Keep the inbox live. Mount once (the chat tab and/or the shell). */
export function useSupportStream(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    let ctrl: AbortController | null = null;
    let backoff = 1000;

    const apply = (e: StreamEvent) => {
      if (e.type === "message") {
        qc.setQueryData<Thread>([...k, "thread", e.conversationId], (t) => {
          if (!t || t.messages.some((m) => m.id === e.message.id)) return t;
          const messages = t.messages.filter((m) => !(m.id.startsWith("tmp-") && m.sender === e.message.sender && m.body === e.message.body));
          return { ...t, messages: [...messages, { ...e.message, readAt: null }] };
        });
      }
      qc.invalidateQueries({ queryKey: [...k, "list"] });
      qc.invalidateQueries({ queryKey: [...k, "counts"] });
      if (e.type !== "message") qc.invalidateQueries({ queryKey: [...k, "thread", e.conversationId] });
      if (e.type === "message" && e.message.sender === "CUSTOMER") qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
    };

    const run = async () => {
      while (!stop) {
        ctrl = new AbortController();
        try {
          let token = getAccessToken();
          let res = await fetch(`${API_URL}/admin/support/stream`, { headers: { accept: "text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) }, credentials: "include", signal: ctrl.signal });
          if (res.status === 401) {
            token = await refreshSession();
            if (!token) return; // logged out — give up quietly
            res = await fetch(`${API_URL}/admin/support/stream`, { headers: { accept: "text/event-stream", authorization: `Bearer ${token}` }, credentials: "include", signal: ctrl.signal });
          }
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          backoff = 1000;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          while (!stop) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let cut: number;
            while ((cut = buf.indexOf("\n\n")) >= 0) {
              const frame = buf.slice(0, cut);
              buf = buf.slice(cut + 2);
              const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
              if (!data) continue;
              try {
                const ev = JSON.parse(data) as StreamEvent | { at: string };
                if ("type" in ev) apply(ev);
              } catch { /* ignore malformed frame */ }
            }
          }
        } catch {
          if (stop) return;
        }
        if (stop) return;
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 30_000);
      }
    };
    void run();
    return () => {
      stop = true;
      ctrl?.abort();
    };
  }, [enabled, qc]);
}
