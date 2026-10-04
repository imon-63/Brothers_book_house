"use client";

import "./admin-shell.css";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { bn, localPhone } from "@/lib/format";
import { logout, useMe } from "@/lib/api/auth";
import { useAttention } from "@/lib/api/admin/dashboard";
import { AdminSectionProvider, useAdminSection } from "@/lib/admin/section-context";
import { setBye } from "@/store/slices/ui-slice";
import { useAppDispatch } from "@/store/hooks";
import { SectionIcon } from "@/components/admin/shared";
import { FinanceDesk } from "@/components/admin/finance-desk";
import { AdminNavContext, NAV_GROUPS, TAB_META, type AdminTab } from "@/components/admin/nav";
import { CommandPalette } from "@/components/admin/command";
import { Notifications } from "@/components/admin/notify";
import { Avatar, Ico, Kbd, Menu, Modal, PageHead } from "@/components/admin/ui";
import { DashboardTab } from "@/components/admin/tabs/dashboard";
import { OrdersTab } from "@/components/admin/tabs/orders";
import { CustomersTab } from "@/components/admin/tabs/customers";
import { ChatTab } from "@/components/admin/tabs/chat";
import { ProductsTab } from "@/components/admin/tabs/products";
import { PacksTab } from "@/components/admin/tabs/packs";
import { CategoriesTab } from "@/components/admin/tabs/categories";
import { HomeBuilderTab } from "@/components/admin/tabs/home-builder";
import { SettingsTab } from "@/components/admin/tabs/settings";
import { ActivityTab } from "@/components/admin/tabs/activity";

const TABS = new Set<AdminTab>(["dashboard", "orders", "customers", "chat", "products", "packs", "cats", "home", "finance", "activity", "settings"]);
/** Screens that draw their own PageHead (with their own actions). */
const OWN_HEAD = new Set<AdminTab>(["dashboard", "orders", "customers", "products", "activity"]);
const GO_KEYS: Record<string, AdminTab> = { d: "dashboard", o: "orders", c: "customers", i: "chat", p: "products", b: "packs", f: "finance", a: "activity", s: "settings" };
const COLLAPSE_KEY = "cholo_admin_rail";

const TAB_ICON: Record<AdminTab, ReactNode> = {
  dashboard: Ico.dashboard, orders: Ico.orders, customers: Ico.customers, chat: Ico.chat, products: Ico.products,
  packs: Ico.packs, cats: Ico.cats, home: Ico.store, finance: Ico.finance, activity: Ico.activity, settings: Ico.settings,
};

function readHash(): { tab: AdminTab; focus: string | null } {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  const [tab, ...rest] = raw.split("/");
  return TABS.has(tab as AdminTab) ? { tab: tab as AdminTab, focus: rest.join("/") || null } : { tab: "dashboard", focus: null };
}

const ROLE_BN: Record<string, string> = { OWNER: "মালিক", ADMIN: "অ্যাডমিন", MANAGER: "ম্যানেজার", SUPPORT: "সাপোর্ট", ACCOUNTANT: "হিসাবরক্ষক", WAREHOUSE: "গুদাম" };

export function AdminPanel() {
  return (
    <AdminSectionProvider>
      <AdminShell />
    </AdminSectionProvider>
  );
}

function AdminShell() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  const { me } = useMe();
  const { code: vertical, sections, setCode } = useAdminSection();
  const attn = useAttention();
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [focus, setFocus] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [rail, setRail] = useState(false);
  const [cmd, setCmd] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const first = readHash();
    setTab(first.tab);
    setFocus(first.focus);
    try { setRail(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* ignore */ }
    const onHash = () => { const h = readHash(); setTab(h.tab); setFocus(h.focus); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((next: AdminTab, f?: string | null) => {
    setTab(next);
    setFocus(f ?? null);
    setNavOpen(false);
    const hash = `#${next}${f ? `/${encodeURIComponent(f)}` : ""}`;
    if (window.location.hash !== hash) window.history.replaceState(null, "", hash);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const clearFocus = useCallback(() => {
    setFocus(null);
    window.history.replaceState(null, "", `#${tab}`);
  }, [tab]);
  const nav = useMemo(() => ({ tab, focus, go, clearFocus }), [tab, focus, go, clearFocus]);

  // keyboard: ⌘K / Ctrl+K / "/" palette · "g" + letter to jump · "?" help
  useEffect(() => {
    let gArmed = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((v) => !v); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); setCmd(true); return; }
      if (e.key === "?") { setHelp(true); return; }
      if (e.key === "g") { gArmed = Date.now(); return; }
      if (gArmed && Date.now() - gArmed < 900 && GO_KEYS[e.key]) { go(GO_KEYS[e.key]); gArmed = 0; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  function toggleRail() {
    setRail((v) => {
      try { localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  }

  const badges: Partial<Record<AdminTab, { n: number; tone?: "gold" | "red" }>> = {
    orders: { n: attn?.pendingOrders ?? 0, tone: "gold" },
    chat: { n: attn?.unrepliedChats ?? 0 },
    products: { n: (attn?.outOfStock ?? 0) + (attn?.lowStock ?? 0), tone: "red" },
  };

  async function signOut() {
    const first = me?.name.split(" ")[0] || "অ্যাডমিন";
    try { await logout(); } catch { /* token already gone — still leave */ }
    qc.removeQueries({ queryKey: ["admin"] });
    dispatch(setBye(first));
  }
  const meta = TAB_META[tab];
  const hour = new Date().getHours();
  const shift = hour < 12 ? "সকাল" : hour < 17 ? "দুপুর" : hour < 20 ? "সন্ধ্যা" : "রাত";

  return (
    <AdminNavContext.Provider value={nav}>
      <div className={`adm ap-shell${navOpen ? " nav-on" : ""}${rail ? " rail" : ""}`}>
        <aside className="ap-side">
          <div className="ap-brand">
            <img src="/icons/cholo-mark.svg" alt="চলো" width={38} height={38} />
            <div className="ap-brand-txt"><strong>চলো</strong><small>Admin Studio</small></div>
            <button type="button" className="ap-rail-btn" aria-label="সাইডবার ছোট/বড়" title="সাইডবার ছোট/বড়" onClick={toggleRail}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M9.5 4.5v15" /></svg>
            </button>
            <button type="button" className="ap-side-x" aria-label="বন্ধ" onClick={() => setNavOpen(false)}>{Ico.close}</button>
          </div>

          <button type="button" className="ap-side-search" onClick={() => setCmd(true)}>
            {Ico.search}<span>খুঁজুন…</span><Kbd>⌘K</Kbd>
          </button>

          <div className="ap-verts" role="radiogroup" aria-label="বিভাগ">
            {sections.map((v) => (
              <button key={v.id} type="button" role="radio" aria-checked={vertical === v.code} className={vertical === v.code ? "on" : ""} onClick={() => setCode(v.code)} title={`${v.name}${!v.isVisible ? " · সাইটে লুকানো" : ""}`}>
                <SectionIcon code={v.code} section={v} />
                <span>{v.name}</span>
                {!v.isVisible ? <i className="ap-vert-off" /> : null}
              </button>
            ))}
          </div>

          <nav className="ap-nav">
            {NAV_GROUPS.map((g) => (
              <div className="ap-nav-group" key={g.label}>
                <p>{g.label}</p>
                {g.items.map((t) => {
                  const b = badges[t.id];
                  return (
                    <button key={t.id} type="button" className={tab === t.id ? "on" : ""} onClick={() => go(t.id)} title={`${t.bn} · ${t.en}`}>
                      <span className="ap-nav-ico">{TAB_ICON[t.id]}{b?.n && rail ? <i className="ap-nav-dot" /> : null}</span>
                      <span className="ap-nav-txt"><b>{t.bn}</b><small>{t.en}</small></span>
                      {b?.n ? <em className={b.tone ? `t-${b.tone}` : ""}>{bn(b.n > 99 ? "99+" : b.n)}</em> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="ap-me">
            <Menu
              align="left"
              trigger={() => (
                <button type="button" className="ap-me-btn">
                  <Avatar name={me?.name || "অ"} size={36} tone={4} />
                  <span className="ap-me-txt"><b>{me?.name || "অ্যাডমিন"}</b><small>{me?.email || localPhone(me?.phone)}</small></span>
                  {Ico.chevD}
                </button>
              )}
            >
              {(close) => (
                <>
                  <p className="ap-menu-label">Signed in · {ROLE_BN[me?.role ?? ""] ?? "অ্যাডমিন"}</p>
                  <button type="button" className="ap-menu-item" onClick={() => { setHelp(true); close(); }}>{Ico.spark}কীবোর্ড শর্টকাট<small>?</small></button>
                  <button type="button" className="ap-menu-item" onClick={() => { go("activity"); close(); }}>{Ico.activity}অ্যাক্টিভিটি লগ</button>
                  <button type="button" className="ap-menu-item" onClick={() => { go("settings"); close(); }}>{Ico.settings}সেটিংস</button>
                  <div className="ap-menu-sep" />
                  <button type="button" className="ap-menu-item danger" onClick={() => { close(); void signOut(); }}>{Ico.logout}লগআউট</button>
                </>
              )}
            </Menu>
          </div>
        </aside>
        <button className="ap-scrim" type="button" aria-label="মেনু বন্ধ" onClick={() => setNavOpen(false)} />

        <div className="ap-main">
          <header className="ap-top">
            <button type="button" className="ap-top-btn ap-burger" aria-label="মেনু" onClick={() => setNavOpen(true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
            </button>
            <div className="ap-crumb">
              <span>চলো</span>{Ico.chevR}<b>{meta.bn}</b><em>{meta.en}</em>
            </div>
            <button type="button" className="ap-top-search" onClick={() => setCmd(true)}>
              {Ico.search}<span>অর্ডার, কাস্টমার, পণ্য খুঁজুন…</span><Kbd>⌘</Kbd><Kbd>K</Kbd>
            </button>
            <div className="ap-top-acts">
              <span className="ap-live" title="স্টোর চালু আছে"><i />{shift}ের শিফট</span>
              <Menu
                trigger={(open) => <button type="button" className={`ap-new${open ? " on" : ""}`}>{Ico.plus}<span>নতুন</span></button>}
              >
                {(close) => (
                  <>
                    <p className="ap-menu-label">Create · তৈরি করুন</p>
                    <button type="button" className="ap-menu-item" onClick={() => { go("products", "new"); close(); }}>{Ico.products}নতুন পণ্য<small>Product</small></button>
                    <button type="button" className="ap-menu-item" onClick={() => { go("packs"); close(); }}>{Ico.packs}নতুন প্যাকেজ<small>Bundle</small></button>
                    <button type="button" className="ap-menu-item" onClick={() => { go("settings", "coupons"); close(); }}>{Ico.tag}নতুন কুপন<small>Coupon</small></button>
                    <button type="button" className="ap-menu-item" onClick={() => { go("finance", "buy"); close(); }}>{Ico.cash}ক্রয় বিল<small>Purchase</small></button>
                    <button type="button" className="ap-menu-item" onClick={() => { go("cats"); close(); }}>{Ico.cats}নতুন ক্যাটাগরি<small>Category</small></button>
                  </>
                )}
              </Menu>
              <Notifications />
            </div>
          </header>

          <div className="ap-page" key={`${tab}-${vertical}`}>
            {!OWN_HEAD.has(tab) ? <PageHead title={meta.bn} en={meta.en} sub={meta.sub} /> : null}
            {tab === "dashboard" ? <DashboardTab /> : null}
            {tab === "orders" ? <OrdersTab /> : null}
            {tab === "customers" ? <CustomersTab /> : null}
            {tab === "chat" ? <ChatTab /> : null}
            {tab === "products" ? <ProductsTab /> : null}
            {tab === "packs" ? <PacksTab /> : null}
            {tab === "cats" ? <CategoriesTab /> : null}
            {tab === "home" ? <HomeBuilderTab /> : null}
            {tab === "finance" ? <FinanceDesk /> : null}
            {tab === "activity" ? <ActivityTab /> : null}
            {tab === "settings" ? <SettingsTab /> : null}
          </div>
        </div>

        <CommandPalette open={cmd} onClose={() => setCmd(false)} />
        <Modal open={help} onClose={() => setHelp(false)} title="কীবোর্ড শর্টকাট" sub="Keyboard shortcuts · দ্রুত কাজের জন্য">
          <ul className="ap-keys">
            <li><span><Kbd>⌘</Kbd><Kbd>K</Kbd> বা <Kbd>/</Kbd></span>সব কিছু খুঁজুন</li>
            <li><span><Kbd>g</Kbd><Kbd>d</Kbd></span>ড্যাশবোর্ড</li>
            <li><span><Kbd>g</Kbd><Kbd>o</Kbd></span>অর্ডার</li>
            <li><span><Kbd>g</Kbd><Kbd>c</Kbd></span>কাস্টমার</li>
            <li><span><Kbd>g</Kbd><Kbd>p</Kbd></span>পণ্য</li>
            <li><span><Kbd>g</Kbd><Kbd>i</Kbd></span>চ্যাট ইনবক্স</li>
            <li><span><Kbd>g</Kbd><Kbd>f</Kbd></span>হিসাব</li>
            <li><span><Kbd>g</Kbd><Kbd>a</Kbd></span>অ্যাক্টিভিটি লগ</li>
            <li><span><Kbd>g</Kbd><Kbd>s</Kbd></span>সেটিংস</li>
            <li><span><Kbd>esc</Kbd></span>ড্রয়ার/পপআপ বন্ধ</li>
            <li><span><Kbd>?</Kbd></span>এই তালিকা</li>
          </ul>
        </Modal>
      </div>
    </AdminNavContext.Provider>
  );
}
