"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { bn, localPhone } from "@/lib/format";
import { statusLabel, statusTone } from "@/lib/admin/status";
import { money } from "@/lib/api/admin/core";
import { useAdminSearch } from "@/lib/api/admin/search";
import { Avatar, Badge, Ico, Kbd, tk, useEscLayer } from "@/components/admin/ui";
import { NAV_GROUPS, useAdminNav, type AdminTab } from "@/components/admin/nav";

type Item = { id: string; group: string; title: ReactNode; sub?: ReactNode; icon: ReactNode; right?: ReactNode; hay: string; run: () => void };

const TAB_ICON: Record<AdminTab, ReactNode> = {
  dashboard: Ico.dashboard, orders: Ico.orders, customers: Ico.customers, chat: Ico.chat, products: Ico.products,
  packs: Ico.packs, cats: Ico.cats, home: Ico.store, finance: Ico.finance, activity: Ico.activity, settings: Ico.settings,
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { go } = useAdminNav();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 200); return () => window.clearTimeout(t); }, [q]);
  const found = useAdminSearch(term, open);
  const orders = found.data?.orders ?? [];
  const customers = found.data?.customers ?? [];
  const products = found.data?.products ?? [];
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const items = useMemo<Item[]>(() => {
    const act = (tab: AdminTab, focus?: string | null) => () => { go(tab, focus ?? null); onClose(); };
    const nav: Item[] = NAV_GROUPS.flatMap((g) => g.items).map((t) => ({
      id: `nav-${t.id}`, group: "যান · Go to", title: t.bn, sub: t.en, icon: TAB_ICON[t.id], hay: `${t.bn} ${t.en}`, run: act(t.id),
    }));
    const actions: Item[] = [
      { id: "a-product", group: "কাজ · Actions", title: "নতুন পণ্য যোগ", sub: "New product", icon: Ico.plus, hay: "new product নতুন পণ্য add", run: act("products", "new") },
      { id: "a-pack", group: "কাজ · Actions", title: "নতুন প্যাকেজ", sub: "New bundle", icon: Ico.packs, hay: "new bundle package প্যাকেজ", run: act("packs") },
      { id: "a-coupon", group: "কাজ · Actions", title: "নতুন কুপন", sub: "New coupon", icon: Ico.tag, hay: "coupon কুপন discount", run: act("settings", "coupons") },
      { id: "a-buy", group: "কাজ · Actions", title: "ক্রয় বিল লিখুন", sub: "Record purchase", icon: Ico.cash, hay: "purchase ক্রয় supplier stock", run: act("finance", "buy") },
      { id: "a-pending", group: "কাজ · Actions", title: "অপেক্ষমাণ অর্ডার দেখুন", sub: "Pending orders", icon: Ico.clock, hay: "pending অপেক্ষমাণ confirm", run: act("orders", "status:pending") },
      { id: "a-ship", group: "কাজ · Actions", title: "ডেলিভারি চার্জ বদলান", sub: "Shipping rates", icon: Ico.truck, hay: "shipping delivery ডেলিভারি charge", run: act("settings", "ship") },
    ];
    // server already matched these on q — keep them in `hay` so the local word filter passes
    const hayQ = term;
    const ord: Item[] = orders.map((o) => {
      const lines = o.items.map((i) => `${i.title} × ${bn(i.quantity)}`).join(", ");
      return {
        id: `o-${o.id}`, group: "অর্ডার · Orders", title: <>{o.orderNo} <Badge tone={statusTone(o.status)} dot>{statusLabel(o.status)}</Badge></>,
        sub: `${o.customer?.name ?? "গেস্ট"} · ${localPhone(o.customer?.phone)} · ${lines}`, icon: Ico.orders, right: tk(money(o.grandTotal)),
        hay: `${hayQ} ${o.orderNo} ${o.customer?.name ?? ""} ${o.customer?.phone ?? ""} ${localPhone(o.customer?.phone)} ${lines}`, run: act("orders", o.orderNo),
      };
    });
    const cus: Item[] = customers.map((c) => ({
      id: `c-${c.id}`, group: "কাস্টমার · Customers", title: c.name, sub: `${localPhone(c.phone) || c.email || ""} · ${bn(c.ordersCount)}টি অর্ডার`,
      icon: <Avatar name={c.name} size={26} />, right: tk(money(c.totalSpent)), hay: `${hayQ} ${c.name} ${c.phone ?? ""} ${localPhone(c.phone)} ${c.email ?? ""}`, run: act("customers", c.id),
    }));
    const pro: Item[] = products.map((p) => ({
      id: `p-${p.id}`, group: "পণ্য · Products", title: p.title, sub: `${p.authorLine || p.unit || ""} · ${p.category?.name ?? ""} · স্টক ${bn(p.stock?.onHand ?? 0)}`,
      icon: p.cover?.url ? <img src={p.cover.url} alt="" className="ap-cmd-thumb" /> : Ico.products, right: tk(money(p.price)),
      hay: `${hayQ} ${p.title} ${p.authorLine ?? ""} ${p.category?.name ?? ""}`, run: act("products", p.id),
    }));
    return [...actions, ...nav, ...ord, ...cus, ...pro];
  }, [orders, customers, products, term, go, onClose]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items.filter((i) => i.group.startsWith("কাজ") || i.group.startsWith("যান") || i.id.startsWith("o-")).slice(0, 18);
    const words = term.split(/\s+/);
    return items.filter((i) => words.every((w) => i.hay.toLowerCase().includes(w))).slice(0, 40);
  }, [items, q]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // top-most Esc layer, so Escape closes only the palette and not a drawer underneath
  useEscLayer(open, onClose);
  if (!mounted || !open) return null;

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); shown[idx]?.run(); }
  }

  let lastGroup = "";
  return createPortal(
    <div className="ap-cmd-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ap-cmd" role="dialog" aria-label="কমান্ড">
        <label className="ap-cmd-input">
          {Ico.search}
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="অর্ডার, কাস্টমার, পণ্য বা কাজ খুঁজুন… Search anything" />
          <Kbd>esc</Kbd>
        </label>
        <div className="ap-cmd-list" ref={listRef}>
          {!shown.length ? <p className="ap-cmd-none">{found.isFetching ? "খুঁজছি…" : <>“{q}” এর সাথে কিছু মেলেনি</>}</p> : shown.map((it, i) => {
            const head = it.group !== lastGroup ? <p className="ap-cmd-group" key={`g-${it.group}`}>{it.group}</p> : null;
            lastGroup = it.group;
            return (
              <div key={it.id}>
                {head}
                <button type="button" data-i={i} className={`ap-cmd-item${i === idx ? " on" : ""}`} onMouseEnter={() => setIdx(i)} onClick={it.run}>
                  <span className="ap-cmd-ico">{it.icon}</span>
                  <span className="ap-cmd-txt"><b>{it.title}</b>{it.sub ? <small>{it.sub}</small> : null}</span>
                  {it.right ? <span className="ap-cmd-right">{it.right}</span> : null}
                  {i === idx ? <span className="ap-cmd-enter">↵</span> : null}
                </button>
              </div>
            );
          })}
        </div>
        <footer className="ap-cmd-foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> বাছুন</span>
          <span><Kbd>↵</Kbd> খুলুন</span>
          <span><Kbd>⌘</Kbd><Kbd>K</Kbd> যেকোনো জায়গা থেকে</span>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
