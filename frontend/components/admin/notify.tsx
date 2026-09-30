"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { bn } from "@/lib/format";
import { ms } from "@/lib/api/admin/core";
import { useAttention } from "@/lib/api/admin/dashboard";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, type AdminNotification } from "@/lib/api/admin/notifications";
import { useAdminPrefs } from "@/lib/api/admin/prefs";
import { Ico, Menu, ago, tk } from "@/components/admin/ui";
import { useAdminNav, type AdminTab } from "@/components/admin/nav";

type Note = {
  id: string; tone: "wine" | "gold" | "red" | "sage" | "blue"; icon: ReactNode; title: string; sub: string; at: number;
  tab: AdminTab; focus?: string; server?: AdminNotification;
};
const SEEN_KEY = "cholo_admin_seen";
const TABS = new Set<AdminTab>(["dashboard", "orders", "customers", "chat", "products", "packs", "cats", "finance", "activity", "settings"]);

/** "#orders/CLO-2043" → { tab, focus } */
function parseLink(link: string | null): { tab: AdminTab; focus?: string } {
  const raw = decodeURIComponent((link ?? "").replace(/^.*#/, ""));
  const [tab, ...rest] = raw.split("/");
  return TABS.has(tab as AdminTab) ? { tab: tab as AdminTab, focus: rest.join("/") || undefined } : { tab: "dashboard" };
}

function toneOf(type: string): Note["tone"] {
  if (type.startsWith("order")) return "gold";
  if (type.startsWith("chat") || type.startsWith("support")) return "blue";
  if (type.includes("stock")) return "red";
  if (type.startsWith("payment") || type.startsWith("refund")) return "sage";
  return "wine";
}
function iconOf(type: string): ReactNode {
  if (type.startsWith("order")) return Ico.clock;
  if (type.startsWith("chat") || type.startsWith("support")) return Ico.chat;
  if (type.includes("stock")) return Ico.box;
  if (type.startsWith("payment") || type.startsWith("refund")) return Ico.cash;
  return Ico.bell;
}

/**
 * Bell contents: server notifications (/admin/notifications) plus live alerts
 * derived from the dashboard's attention counters (stock, chats, COD, deals).
 */
export function useAlerts(): Note[] {
  const list = useNotifications();
  const attn = useAttention();
  const { lowStock } = useAdminPrefs();
  return useMemo(() => {
    const now = Date.now();
    const out: Note[] = [];
    for (const n of list.data?.items ?? []) {
      const { tab, focus } = parseLink(n.link);
      out.push({ id: `srv-${n.id}`, tone: toneOf(n.type), icon: iconOf(n.type), title: n.title, sub: n.body ?? "", at: ms(n.createdAt), tab, focus, server: n });
    }
    if (attn) {
      if (attn.unrepliedChats) out.push({ id: `chat-${attn.unrepliedChats}`, tone: "blue", icon: Ico.chat, title: `${bn(attn.unrepliedChats)}টি চ্যাটের উত্তর বাকি`, sub: "গ্রাহক অপেক্ষা করছেন", at: now, tab: "chat" });
      if (attn.outOfStock) out.push({ id: `oos-${attn.outOfStock}`, tone: "red", icon: Ico.alert, title: `${bn(attn.outOfStock)}টি পণ্য স্টক আউট`, sub: "রিস্টক করুন", at: now - 1, tab: "products", focus: "stock:out" });
      if (attn.lowStock) out.push({ id: `low-${attn.lowStock}`, tone: "gold", icon: Ico.box, title: `${bn(attn.lowStock)}টি পণ্যের স্টক কম`, sub: `${bn(lowStock)} বা তার কম কপি বাকি`, at: now - 2, tab: "products", focus: "stock:low" });
      if (attn.dealsEnding) out.push({ id: `deal-${attn.dealsEnding}`, tone: "wine", icon: Ico.clock, title: `${bn(attn.dealsEnding)}টি ছাড় ২৪ ঘণ্টায় শেষ`, sub: "মেয়াদ বাড়াতে চাইলে এখনই", at: now - 3, tab: "products", focus: "deal" });
      if (attn.codToCollect) out.push({ id: `due-${Math.round(attn.codToCollect)}`, tone: "sage", icon: Ico.cash, title: `${tk(attn.codToCollect)} COD আসা বাকি`, sub: "কুরিয়ারের সাথে হিসাব মেলান", at: now - 4, tab: "finance", focus: "cash" });
    }
    return out.sort((a, b) => b.at - a.at);
  }, [list.data, attn, lowStock]);
}

export function Notifications() {
  const { go } = useAdminNav();
  const alerts = useAlerts();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { /* ignore */ }
  }, []);
  const isNew = (a: Note) => (a.server ? !a.server.readAt : !seen.includes(a.id));
  const unread = alerts.filter(isNew).length;

  function readAll() {
    const ids = alerts.filter((a) => !a.server).map((a) => a.id);
    setSeen(ids);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
    if (alerts.some((a) => a.server && !a.server.readAt)) markAll.mutate();
  }

  function open(a: Note) {
    if (a.server && !a.server.readAt) markOne.mutate({ id: a.server.id });
    else if (!a.server && !seen.includes(a.id)) {
      const next = [...seen, a.id];
      setSeen(next);
      try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
    go(a.tab, a.focus ?? null);
  }

  return (
    <Menu
      trigger={(isOpen) => (
        <button type="button" className={`ap-top-btn${isOpen ? " on" : ""}`} aria-label="নোটিফিকেশন">
          {Ico.bell}
          {unread ? <em className="ap-bell-n">{bn(unread > 9 ? "9+" : unread)}</em> : null}
        </button>
      )}
    >
      {(close) => (
        <div className="ap-notes">
          <header>
            <b>নোটিফিকেশন <span>Alerts</span></b>
            {unread ? <button type="button" onClick={readAll}>সব পড়া হয়েছে</button> : <small>সব আপডেট</small>}
          </header>
          {!alerts.length ? (
            <div className="ap-notes-empty">{Ico.check}<b>সব ঠিকঠাক!</b><small>এই মুহূর্তে করার মতো কিছু নেই</small></div>
          ) : (
            <ul>
              {alerts.map((a) => (
                <li key={a.id}>
                  <button type="button" className={isNew(a) ? "new" : ""} onClick={() => { open(a); close(); }}>
                    <span className={`ap-note-ico t-${a.tone}`}>{a.icon}</span>
                    <span className="ap-note-txt"><b>{a.title}</b><small>{a.sub}</small><time>{ago(a.at)}</time></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Menu>
  );
}
