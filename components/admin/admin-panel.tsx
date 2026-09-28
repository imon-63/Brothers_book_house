"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { catTree, hiddenMain, type CatNode } from "@/lib/catalog/cats";
import type { VerticalId } from "@/lib/catalog/types";
import { FinanceDesk } from "@/components/admin/finance-desk";
import { VerticalIcon } from "@/components/icons";
import { PaperView } from "@/components/books/paper";
import { BnDateField, BnRangeButton } from "@/components/ui/bangla-calendar";
import { fmtShipDt } from "@/lib/calendar";
import { offerOf } from "@/lib/catalog/offer";
import { dayRange, isoDay, type Paper } from "@/lib/books/ledger";
import { statusLabel, STATUS, type DemoOrder } from "@/lib/demo/accounts";
import { bn, discount, timeAgo } from "@/lib/format";
import { stockShort, stockUnits } from "@/lib/orders/ledger";
import { applyOrderBooks } from "@/store/slices/books-slice";
import { setOrderStatus, markPaid } from "@/store/slices/order-slice";
import {
  addCoupon, addExtraCat, addPack, addProduct, deletePack, deleteProduct, hideCat, showCat, hideVertical, showVertical, holdStock, releaseStock,
  patchPack, patchProduct, pushChat, setPromo, setShip, setTicker, toggleCoupon,
  type ChatThread, type ExtraCat, type HiddenCat, type PromoSettings, type ShipSettings, type ShopCoupon, type ShopProduct,
} from "@/store/slices/shop-slice";
import { setBye, setVertical, showToast } from "@/store/slices/ui-slice";
import { catalog } from "@/lib/catalog/data";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

type Tab = "books" | "settings" | "cats" | "packs" | "orders" | "finance" | "chat";

const COLORS = ["#7A2430", "#5C1B24", "#3D5A4C", "#8A6230", "#1a3a6b"];

function mergedCats(vertical: VerticalId, products: ShopProduct[], extra: ExtraCat[], hidden: HiddenCat[]): CatNode[] {
  return catTree(vertical, products, extra, hidden);
}

function readFile(file: File, done: (url: string) => void) {
  const reader = new FileReader();
  reader.onload = () => done(String(reader.result || ""));
  reader.readAsDataURL(file);
}

function TabMark({ id }: { id: Tab }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (id === "books") return <svg {...p}><path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5H8.5A2.5 2.5 0 0 0 6 22z" /><path d="M6 4.5v17.5" /></svg>;
  if (id === "settings") return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3V21M3.5 12h2.2M18.3 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></svg>;
  if (id === "cats") return <svg {...p}><path d="M4 7h7l2 2h7v9.5H4z" /></svg>;
  if (id === "packs") return <svg {...p}><path d="M4 8l8-4 8 4-8 4z" /><path d="M4 8v8l8 4 8-4V8" /></svg>;
  if (id === "orders") return <svg {...p}><path d="M7 6h10l1 13H6z" /><path d="M9 6a3 3 0 0 1 6 0" /></svg>;
  if (id === "finance") return <svg {...p}><path d="M5 18V8M10 18V6M15 18v-5M20 18V9" /></svg>;
  return <svg {...p}><path d="M5 7h14v9H8l-3 3z" /></svg>;
}

function pageList(cur: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, cur - 1);
  const to = Math.min(pages - 1, cur + 1);
  if (from > 2) out.push("gap");
  for (let n = from; n <= to; n++) out.push(n);
  if (to < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

function Pager({ cur, pages, total, size, onPage, onSize, unit = "টি" }: { cur: number; pages: number; total: number; size: number; onPage: (n: number) => void; onSize?: (n: number) => void; unit?: string }) {
  const first = total ? (cur - 1) * size + 1 : 0;
  const last = Math.min(total, cur * size);
  return (
    <div className="pager adm-pager">
      <div className="pager-info"><b>{bn(first)}–{bn(last)}</b> / {bn(total)}{unit}</div>
      {onSize ? (
        <label className="size-lab">প্রতি পৃষ্ঠায়
          <select className="inline" value={size} onChange={(e) => onSize(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{bn(n)}</option>)}
          </select>
        </label>
      ) : null}
      <div className="pager-btns">
        <button type="button" className="pg" aria-label="আগের পৃষ্ঠা" disabled={cur <= 1} onClick={() => onPage(cur - 1)}>‹</button>
        {pageList(cur, pages).map((n, i) => n === "gap"
          ? <span key={`g${i}`} className="pg-gap">…</span>
          : <button key={n} type="button" className={`pg${n === cur ? " on" : ""}`} aria-current={n === cur ? "page" : undefined} onClick={() => onPage(n)}>{bn(n)}</button>)}
        <button type="button" className="pg" aria-label="পরের পৃষ্ঠা" disabled={cur >= pages} onClick={() => onPage(cur + 1)}>›</button>
      </div>
    </div>
  );
}

const TAB_INFO: Record<Tab, { title: string; sub: string }> = {
  books: { title: "পণ্য তালিকা", sub: "নতুন পণ্য, দাম, ছাড়ের টাইমার আর স্টক" },
  settings: { title: "সেটিংস", sub: "ডেলিভারি, কুপন, প্রোমো আর টিকার" },
  cats: { title: "ক্যাটাগরি", sub: "ক্যাটাগরি সাজান, যোগ করুন বা লুকান" },
  packs: { title: "প্যাকেজ", sub: "বান্ডেল অফার তৈরি ও সম্পাদনা" },
  orders: { title: "অর্ডার", sub: "নতুন অর্ডার, স্ট্যাটাস আর পেমেন্ট" },
  finance: { title: "হিসাব", sub: "বিক্রি, খরচ আর লাভের খাতা" },
  chat: { title: "চ্যাট", sub: "গ্রাহকের বার্তার জবাব দিন" },
};

function greet() {
  const h = new Date().getHours();
  if (h < 5) return "শুভ রাত্রি";
  if (h < 12) return "শুভ সকাল";
  if (h < 17) return "শুভ দুপুর";
  if (h < 20) return "শুভ সন্ধ্যা";
  return "শুভ রাত্রি";
}

export function AdminPanel() {
  const dispatch = useAppDispatch();
  const vertical = useAppSelector((s) => s.ui.vertical);
  const shop = useAppSelector((s) => s.shop);
  const orders = useAppSelector((s) => s.orders.orders);
  const me = useAppSelector((s) => s.session.users.find((u) => u.id === s.session.userId) ?? null);
  const [tab, setTab] = useState<Tab>("books");
  const [navOpen, setNavOpen] = useState(false);
  const vname = vertical === "book" ? "বই" : vertical === "food" ? "ঘরের বাজার" : "গ্যাজেট";
  const prodLabel = vertical === "book" ? "বই" : vertical === "food" ? "পণ্য" : "গ্যাজেট";
  const pending = orders.filter((o) => o.status < 0).length;
  const waiting = shop.chats.filter((c) => c.msgs.at(-1)?.from === "user").length;
  const here = shop.products.filter((p) => p.vertical === vertical).length;
  const deals = shop.products.filter((p) => offerOf(p).on).length;
  const hiddenN = shop.hiddenCats.filter((h) => !h.sub).length;
  const hiddenVerts = shop.hiddenVerticals ?? [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOrders = orders.filter((o) => o.at >= today.getTime() && o.status !== 5);
  const todaySales = todayOrders.reduce((s, o) => s + (o.total || 0), 0);
  const dateLabel = new Date().toLocaleDateString("bn-BD", { weekday: "long", day: "numeric", month: "long" });
  const initials = (me?.name || "অ").trim().slice(0, 1);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "books", label: prodLabel },
    { id: "orders", label: "অর্ডার", badge: pending },
    { id: "finance", label: "হিসাব" },
    { id: "chat", label: "চ্যাট", badge: waiting },
    { id: "packs", label: "প্যাকেজ" },
    { id: "cats", label: "ক্যাটাগরি" },
    { id: "settings", label: "সেটিংস", badge: hiddenN },
  ];
  const info = tab === "books" ? { ...TAB_INFO.books, title: `${prodLabel} তালিকা` } : TAB_INFO[tab];

  const kpis: { id: Tab; label: string; value: string; hint: string; tone: string }[] = [
    { id: "orders", label: "অপেক্ষমাণ অর্ডার", value: bn(pending), hint: pending ? "নিশ্চিত করা বাকি" : "সব আপডেট", tone: "wine" },
    { id: "finance", label: "আজকের বিক্রি", value: `৳${bn(todaySales.toLocaleString("en-IN"))}`, hint: `${bn(todayOrders.length)}টি অর্ডার`, tone: "gold" },
    { id: "books", label: `${vname} · পণ্য`, value: bn(here), hint: `${bn(deals)}টিতে ছাড় চলছে`, tone: "sage" },
    { id: "chat", label: "নতুন চ্যাট", value: bn(waiting), hint: waiting ? "জবাবের অপেক্ষায়" : "ইনবক্স খালি", tone: "ink" },
  ];

  function go(id: Tab) {
    setTab(id);
    setNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function logout() {
    dispatch(setBye(me?.name.split(" ")[0] || "অ্যাডমিন"));
  }

  return (
    <div className={`adm${navOpen ? " nav-on" : ""}`}>
      <aside className="adm-side">
        <div className="adm-logo">
          <img src="/icons/cholo-mark.svg" alt="চলো" width={44} height={44} />
          <div><strong>চলো</strong><small>অ্যাডমিন ডেস্ক</small></div>
          <button className="adm-x" type="button" aria-label="বন্ধ" onClick={() => setNavOpen(false)}>×</button>
        </div>

        <p className="adm-label">বিভাগ</p>
        <div className="adm-verts">
          {catalog.verticals.map((v) => (
            <button key={v.id} type="button" className={vertical === v.id ? "on" : ""} onClick={() => dispatch(setVertical(v.id))} title={hiddenVerts.includes(v.id) ? "সাইটে লুকানো" : v.name}>
              <VerticalIcon id={v.id} />
              <span>{v.name}</span>
              {hiddenVerts.includes(v.id) ? <i className="adm-off" aria-label="লুকানো" /> : null}
            </button>
          ))}
        </div>

        <p className="adm-label">মেনু</p>
        <nav className="adm-nav">
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "on" : ""} onClick={() => go(t.id)}>
              <span className="adm-ico"><TabMark id={t.id} /></span>
              <span>{t.label}</span>
              {t.badge ? <em>{bn(t.badge)}</em> : null}
            </button>
          ))}
        </nav>

        <div className="adm-me">
          <span className="adm-av">{initials}</span>
          <div><b>{me?.name || "অ্যাডমিন"}</b><small>{me?.email}</small></div>
          <button type="button" className="adm-out" aria-label="লগআউট" title="লগআউট" onClick={logout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></svg>
          </button>
        </div>
      </aside>
      <button className="adm-scrim" type="button" aria-label="মেনু বন্ধ" onClick={() => setNavOpen(false)} />

      <div className="adm-main">
        <header className="adm-top">
          <button className="adm-burger" type="button" aria-label="মেনু" onClick={() => setNavOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
          </button>
          <div className="adm-title">
            <small>{vname} · {dateLabel}</small>
            <h1>{info.title}</h1>
          </div>
          <div className="adm-top-acts">
            <button type="button" className="adm-pill" onClick={() => go("orders")}>
              <TabMark id="orders" /> অর্ডার {pending ? <em>{bn(pending)}</em> : null}
            </button>
            <button type="button" className="adm-pill" onClick={() => go("chat")}>
              <TabMark id="chat" /> চ্যাট {waiting ? <em>{bn(waiting)}</em> : null}
            </button>
          </div>
        </header>

        <section className="adm-hero">
          <div className="adm-hero-copy">
            <p>{greet()},</p>
            <h2>{me?.name || "অ্যাডমিন"}</h2>
            <span>{info.sub}</span>
          </div>
          <div className="adm-kpis">
            {kpis.map((k) => (
              <button key={k.id} type="button" className={`adm-kpi tone-${k.tone}${tab === k.id ? " on" : ""}`} onClick={() => go(k.id)}>
                <span className="adm-kpi-ico"><TabMark id={k.id} /></span>
                <small>{k.label}</small>
                <b>{k.value}</b>
                <i>{k.hint}</i>
              </button>
            ))}
          </div>
        </section>

        <div className="adm-body desk-body" key={`${tab}-${vertical}`}>
          {tab === "books" ? <BooksTab /> : null}
          {tab === "settings" ? <SettingsTab /> : null}
          {tab === "cats" ? <CatsTab /> : null}
          {tab === "packs" ? <PacksTab /> : null}
          {tab === "orders" ? <OrdersTab /> : null}
          {tab === "finance" ? <FinanceDesk /> : null}
          {tab === "chat" ? <ChatTab /> : null}
        </div>
      </div>
    </div>
  );
}

function BooksTab() {
  const dispatch = useAppDispatch();
  const vertical = useAppSelector((s) => s.ui.vertical);
  const products = useAppSelector((s) => s.shop.products);
  const extra = useAppSelector((s) => s.shop.extraCats);
  const hidden = useAppSelector((s) => s.shop.hiddenCats);
  const cats = mergedCats(vertical, products, extra, []);
  const hiddenNames = new Set(hidden.filter((h) => h.vertical === vertical && !h.sub).map((h) => h.name));
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState(cats[0]?.name || "");
  const [sub, setSub] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [preview, setPreview] = useState("");
  const [dealId, setDealId] = useState<number | null>(null);
  const addForm = useForm({ defaultValues: { title: "", author: "", cost: "", old: "", price: "", stock: "", desc: "", free: false } });
  const [dragOn, setDragOn] = useState(false);
  const npLive = addForm.watch();
  const npCost = Number(npLive.cost || 0);
  const npPrice = Number(npLive.price || 0);
  const npOld = Number(npLive.old || 0);
  const npStock = Number(npLive.stock || 0);
  const npOff = discount(npPrice, npOld);
  const npProfit = npPrice - npCost;
  const npMargin = npPrice > 0 && npCost > 0 ? Math.round((npProfit / npPrice) * 100) : 0;
  const labelOf = vertical === "book" ? "বইয়ের" : "পণ্যের";
  const npReady = Boolean(npLive.title?.trim()) && npPrice > 0 && npCost > 0 && npLive.stock !== "";
  useEffect(() => {
    setCat(cats[0]?.name || "");
    setSub("");
    setPage(1);
  }, [vertical]);
  const list = products.filter((p) => p.vertical === vertical && p.cat === cat && (!sub || p.sub === sub));
  const pages = Math.max(1, Math.ceil(list.length / size));
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * size, cur * size);
  const subs = cats.find((c) => c.name === cat)?.subs ?? [];
  const label = vertical === "book" ? "বই" : "পণ্য";
  const missingCost = products.filter((p) => p.vertical === vertical && !(p.cost && p.cost > 0)).length;

  function add(data: { title: string; author: string; cost: string; old: string; price: string; stock: string; desc: string; free: boolean }) {
    const title = data.title.trim();
    const price = Number(data.price || 0);
    const cost = Number(data.cost || 0);
    if (!title || !price) { dispatch(showToast("নাম ও নতুন দাম দিন")); return; }
    if (!(cost > 0)) { dispatch(showToast("কেনা দাম দিন — নাহলে লাভের হিসাব বন্ধ থাকে")); return; }
    if (data.stock === "") { dispatch(showToast("আসল কপি সংখ্যা দিন")); return; }
    const copies = Math.max(0, parseInt(String(data.stock), 10) || 0);
    const row: ShopProduct = {
      id: Date.now(),
      title,
      author: data.author || "",
      price,
      old: Number(data.old || 0),
      cost,
      sold: 0,
      color: COLORS[products.length % COLORS.length],
      cat,
      sub: sub || undefined,
      desc: data.desc || "নতুন সংযোজন।",
      vertical,
      stock: copies,
      copies,
      freeShip: data.free,
      image: preview || undefined,
    };
    dispatch(addProduct(row));
    dispatch(showToast(`${label} যোগ হয়েছে · সাইটে দেখা যাচ্ছে`));
    addForm.reset();
    setPreview("");
    setOpen(false);
  }

  return (
    <>
      <div className={`acc admin-add${open ? " on" : ""}`}>
        <button type="button" className="acc-head" onClick={() => setOpen((v) => !v)}>
          <div><b>নতুন {label} যোগ করুন</b><small>{open ? "৩ ধাপে পূরণ করুন · পাশে লাইভ প্রিভিউ" : "চাপ দিয়ে ফর্ম খুলুন"}</small></div>
          <span className="acc-chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg></span>
        </button>
        <form className="acc-body np" onSubmit={addForm.handleSubmit(add)}>
          <div className="np-main">
            <section className="np-sec">
              <header className="pk-head"><span className="pk-step">১</span><div><h3>পরিচয়</h3><p>নাম, {vertical === "book" ? "লেখক" : "ব্র্যান্ড"} আর কোথায় বসবে</p></div></header>
              <div className="np-grid">
                <div className="span-2"><label>{labelOf} নাম <i className="np-req">*</i></label><input {...addForm.register("title")} placeholder={vertical === "book" ? "যেমন: নবম-দশম পদার্থবিজ্ঞান গাইড" : "যেমন: খাঁটি সরিষার তেল ১ লিটার"} /></div>
                <div className="span-2"><label>{vertical === "book" ? "লেখক / প্রকাশনী" : "একক / ব্র্যান্ড"}</label><input {...addForm.register("author")} placeholder={vertical === "book" ? "যেমন: পাঞ্জেরী" : "যেমন: ১ লিটার"} /></div>
                <div><label>ক্যাটাগরি</label>
                  <select value={cat} onChange={(e) => { setCat(e.target.value); setSub(""); setPage(1); }}>
                    {cats.map((c) => <option key={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div><label>সাব-ক্যাটাগরি</label>
                  <select value={sub} onChange={(e) => setSub(e.target.value)}>
                    <option value="">—</option>
                    {subs.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="span-2"><label>বিবরণ</label><textarea rows={2} {...addForm.register("desc")} placeholder="ছোট করে পণ্যের পরিচয় · খালি থাকলে «নতুন সংযোজন।»" /></div>
              </div>
            </section>

            <section className="np-sec">
              <header className="pk-head"><span className="pk-step">২</span><div><h3>দাম ও স্টক</h3><p>কেনা দাম দিলে লাভের হিসাব চালু থাকে</p></div></header>
              <div className="np-prices">
                <div className="np-money"><label>কেনা দাম <i className="np-req">*</i></label><div className="cp-val"><span>৳</span><input {...addForm.register("cost")} type="number" min="1" placeholder="ক্রয়মূল্য" /></div></div>
                <div className="np-money"><label>পুরনো দাম</label><div className="cp-val"><span>৳</span><input {...addForm.register("old")} type="number" min="0" placeholder="কাটা দাম" /></div></div>
                <div className="np-money hot"><label>বিক্রির দাম <i className="np-req">*</i></label><div className="cp-val"><span>৳</span><input {...addForm.register("price")} type="number" min="1" placeholder="নতুন দাম" /></div></div>
                <div className="np-money"><label>আসল কপি <i className="np-req">*</i></label><div className="cp-val"><span>#</span><input {...addForm.register("stock")} type="number" min="0" placeholder="যেমন: ২৫" /></div></div>
              </div>
              <div className="np-meter">
                <div className={`np-chip${npOff ? " on" : ""}`}><small>ছাড়</small><b>{npOff ? `${bn(npOff)}%` : "—"}</b></div>
                <div className={`np-chip${npProfit > 0 ? " ok" : npProfit < 0 ? " bad" : ""}`}><small>প্রতি কপিতে লাভ</small><b>{npPrice && npCost ? `৳${bn(npProfit)}` : "—"}</b></div>
                <div className="np-chip"><small>মার্জিন</small><b>{npPrice && npCost ? `${bn(npMargin)}%` : "—"}</b></div>
                <div className="np-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, npMargin))}%` }} className={npProfit < 0 ? "bad" : ""} /></div>
              </div>
              {npPrice && npCost && npProfit < 0 ? <p className="cp-warn">বিক্রির দাম কেনা দামের চেয়ে কম · লসে বিক্রি হবে</p> : null}
            </section>

            <section className="np-sec">
              <header className="pk-head"><span className="pk-step">৩</span><div><h3>ছবি ও ডেলিভারি</h3><p>ভালো ছবিতে বিক্রি বেশি হয়</p></div></header>
              <label
                className={`np-drop${preview ? " has" : ""}${dragOn ? " drag" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOn(true); }}
                onDragLeave={() => setDragOn(false)}
                onDrop={(e) => { e.preventDefault(); setDragOn(false); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith("image/")) readFile(f, setPreview); }}
              >
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, setPreview); }} />
                {preview ? (
                  <>
                    <img src={preview} alt="" />
                    <span className="np-drop-txt"><b>ছবি বসেছে</b><small>বদলাতে আবার চাপুন বা নতুন ছবি টেনে আনুন</small></span>
                    <button type="button" className="pk-del" aria-label="ছবি সরান" onClick={(e) => { e.preventDefault(); setPreview(""); }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg>
                    </button>
                  </>
                ) : (
                  <>
                    <span className="np-drop-ico"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg></span>
                    <span className="np-drop-txt"><b>ছবি টেনে এনে ছাড়ুন</b><small>অথবা চাপ দিয়ে বাছুন · JPG, PNG</small></span>
                  </>
                )}
              </label>
              <label className="pk-switch np-free">
                <input type="checkbox" {...addForm.register("free")} />
                <span className="sw" aria-hidden="true" />
                <span><b>ফ্রি ডেলিভারি</b><small>শুধু এই পণ্য থাকলে কুরিয়ার ৳০</small></span>
              </label>
            </section>
          </div>

          <aside className="np-side">
            <p className="pk-live"><i /> ক্রেতা যেভাবে দেখবে</p>
            <article className="np-card">
              {npOff ? <span className="pk-ribbon">-{bn(npOff)}%</span> : null}
              {npLive.free ? <span className="pk-free">ফ্রি ডেলিভারি</span> : null}
              <div className="np-card-art" style={{ background: preview ? undefined : COLORS[products.length % COLORS.length] }}>
                {preview ? <img src={preview} alt="" /> : <em>{npLive.title?.trim() || `${labelOf} নাম`}</em>}
              </div>
              <div className="np-card-body">
                <small className="np-card-cat">{cat}{sub ? ` · ${sub}` : ""}</small>
                <h4>{npLive.title?.trim() || `${labelOf} নাম`}</h4>
                <p>{npLive.author?.trim() || (vertical === "book" ? "লেখক" : "ব্র্যান্ড")}</p>
                <div className="pk-price"><b>৳{bn(npPrice || 0)}</b>{npOld > npPrice && npPrice ? <s>৳{bn(npOld)}</s> : null}</div>
                <span className={`np-stock${npStock > 0 ? "" : " out"}`}>{npLive.stock === "" ? "কপি সংখ্যা দিন" : npStock > 0 ? `স্টকে ${bn(npStock)} কপি` : "স্টক আউট"}</span>
              </div>
            </article>
            <ul className="np-check">
              <li className={npLive.title?.trim() ? "ok" : ""}>নাম</li>
              <li className={npCost > 0 ? "ok" : ""}>কেনা দাম</li>
              <li className={npPrice > 0 ? "ok" : ""}>বিক্রির দাম</li>
              <li className={npLive.stock !== "" ? "ok" : ""}>কপি সংখ্যা</li>
              <li className={preview ? "ok" : "opt"}>ছবি <small>(ঐচ্ছিক)</small></li>
            </ul>
            <button className="btn btn-primary btn-wide np-submit" type="submit" disabled={!npReady}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
              {label} যোগ করুন
            </button>
            <button className="btn btn-ghost btn-sm np-reset" type="button" onClick={() => { addForm.reset(); setPreview(""); }}>ফর্ম খালি করুন</button>
          </aside>
        </form>
      </div>
      {missingCost ? <p className="guest-note" style={{ margin: "0 0 14px" }}>{bn(missingCost)}টিতে কেনা দাম খালি। লাভের হিসাব ততক্ষণ বন্ধ।</p> : null}
      <div className="ord-bar">
        <div className="ord-bar-top">
          <span className="ord-meta">ক্যাটাগরি</span>
          <label className="size-lab">প্রতি পৃষ্ঠায়
            <select className="inline" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}>
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{bn(n)}</option>)}
            </select>
          </label>
        </div>
        <div className="ord-chips">
          {cats.map((c) => (
            <button key={c.name} type="button" className={`ofilt${cat === c.name ? " on" : ""}`} onClick={() => { setCat(c.name); setSub(""); setPage(1); }}>
              {c.name}{hiddenNames.has(c.name) ? " · লুকানো" : ""}<span> {bn(products.filter((p) => p.vertical === vertical && p.cat === c.name).length)}</span>
            </button>
          ))}
        </div>
        {subs.length ? (
          <div className="ord-chips" style={{ marginTop: 8 }}>
            <button type="button" className={`ofilt${!sub ? " on" : ""}`} onClick={() => { setSub(""); setPage(1); }}>সব</button>
            {subs.map((s) => (
              <button key={s} type="button" className={`ofilt${sub === s ? " on" : ""}`} onClick={() => { setSub(s); setPage(1); }}>{s}</button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="admin-cat-block">
        <div className="admin-cat-head"><h3>{sub ? `${cat} · ${sub}` : cat || "ক্যাটাগরি নেই"}</h3><span>{bn(slice.length ? (cur - 1) * size + 1 : 0)}–{bn((cur - 1) * size + slice.length)} / {bn(list.length)}টি</span></div>
        {!slice.length ? <div className="empty">এই ক্যাটাগরিতে কিছু নেই</div> : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <tbody>
                <tr><th>পণ্য</th><th>ক্যাটাগরি</th><th>কেনা</th><th>পুরনো</th><th>নতুন</th><th>ছাড় %</th><th>টাইমার</th><th>আসল কপি</th><th>বাকি</th><th>স্টক</th><th></th></tr>
                {slice.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="book-cell">
                        {b.image ? <img className="admin-thumb" src={b.image} alt="" /> : <span className="admin-thumb" style={{ background: b.color }} />}
                        <div>
                          {b.title}<div className="author">{b.author}</div>
                          <label className="file-mini">ছবি বদলান<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, (url) => dispatch(patchProduct({ id: b.id, patch: { image: url } }))); }} /></label>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select value={b.cat} onChange={(e) => dispatch(patchProduct({ id: b.id, patch: { cat: e.target.value, sub: undefined } }))}>
                        {cats.map((c) => <option key={c.name}>{c.name}</option>)}
                      </select>
                    </td>
                    <td><input className={b.cost ? "" : "cost-miss"} type="number" style={{ width: 90 }} value={b.cost || ""} onChange={(e) => dispatch(patchProduct({ id: b.id, patch: { cost: Number(e.target.value) || 0 } }))} /></td>
                    <td><input type="number" style={{ width: 90 }} value={b.old || ""} onChange={(e) => dispatch(patchProduct({ id: b.id, patch: { old: Number(e.target.value) || 0 } }))} /></td>
                    <td><input type="number" style={{ width: 90 }} value={b.price} onChange={(e) => dispatch(patchProduct({ id: b.id, patch: { price: Number(e.target.value) || 0 } }))} /></td>
                    <td><input type="number" style={{ width: 70 }} value={discount(b.price, b.old) || ""} onChange={(e) => {
                      const d = Number(e.target.value);
                      const old = d > 0 && d < 100 ? Math.round(b.price / (1 - d / 100)) : 0;
                      dispatch(patchProduct({ id: b.id, patch: { old } }));
                    }} /></td>
                    <td>
                      <button type="button" className={`btn btn-sm ${offerOf(b).on ? "btn-primary" : "btn-ghost"}`} onClick={() => setDealId(b.id)}>{offerOf(b).on ? "চলছে" : b.deal?.until ? "শেষ" : "টাইমার"}</button>
                      {offerOf(b).on && b.deal ? <div className="author">{fmtShipDt(b.deal.until)} পর্যন্ত</div> : null}
                    </td>
                    <td><input type="number" style={{ width: 80 }} value={b.copies ?? b.stock} onChange={(e) => dispatch(patchProduct({ id: b.id, patch: { copies: Number(e.target.value) || 0 } }))} /></td>
                    <td><input type="number" style={{ width: 80 }} value={b.stock} onChange={(e) => dispatch(patchProduct({ id: b.id, patch: { stock: Number(e.target.value) || 0 } }))} /></td>
                    <td><button type="button" className={`btn btn-sm ${b.stock > 0 ? "btn-primary" : "btn-ghost"}`} onClick={() => dispatch(patchProduct({ id: b.id, patch: { stock: b.stock > 0 ? 0 : (b.copies || 12) } }))}>{b.stock > 0 ? "স্টকে" : "আউট"}</button></td>
                    <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => { dispatch(deleteProduct(b.id)); dispatch(showToast("মুছে ফেলা হয়েছে")); }}>মুছুন</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager cur={cur} pages={pages} total={list.length} size={size} onPage={setPage} />
      </div>
      {dealId ? <DealDialog product={products.find((p) => p.id === dealId) || null} onClose={() => setDealId(null)} /> : null}
    </>
  );
}

function DealDialog({ product, onClose }: { product: ShopProduct | null; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const [price, setPrice] = useState(product?.deal?.price ? String(product.deal.price) : "");
  const [until, setUntil] = useState(product?.deal?.until || "");
  if (!product) return null;
  const live = offerOf(product).on;

  function save() {
    const n = Number(price);
    const end = Date.parse(until);
    if (!(n > 0) || n >= product!.price) {
      dispatch(showToast("ছাড়ের দাম আগের দামের চেয়ে কম দিন"));
      return;
    }
    if (!until || !(end > Date.now())) {
      dispatch(showToast("শেষ হওয়ার সময় সামনে দিন"));
      return;
    }
    dispatch(patchProduct({ id: product!.id, patch: { deal: { price: n, until } } }));
    dispatch(showToast("টাইমার বসেছে · সময় শেষে আগের দামে ফিরবে"));
    onClose();
  }

  function clear() {
    dispatch(patchProduct({ id: product!.id, patch: { deal: undefined } }));
    dispatch(showToast("টাইমার সরানো হয়েছে · আগের দাম"));
    onClose();
  }

  return (
    <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="box" style={{ maxWidth: 440, margin: "10vh auto" }}>
        <button type="button" className="x" onClick={onClose}>×</button>
        <h3 className="serif">সময়ের ছাড়</h3>
        <p className="author">{product.title}</p>
        <p>আগের দাম ৳{bn(product.price)}। সময় শেষ হলে এই দামেই ফিরবে।</p>
        <label>ছাড়ের দাম</label>
        <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} />
        <BnDateField label="শেষ হবে" withTime end value={until} onChange={setUntil} emptyText="তারিখ ও সময় বাছুন" />
        {live && product.deal ? <p className="author">এখন চলছে · {fmtShipDt(product.deal.until)} পর্যন্ত</p> : null}
        <div className="save-row">
          {product.deal ? <button type="button" className="btn btn-ghost" onClick={clear}>টাইমার সরান</button> : <span />}
          <button type="button" className="btn btn-primary" onClick={save}>বসান</button>
        </div>
      </div>
    </div>
  );
}

const SET_COLS: { id: VerticalId; name: string; note: string }[] = [
  { id: "book", name: "বই", note: "পাঠ্য ও ভর্তি" },
  { id: "food", name: "ঘরের বাজার", note: "তেল, মধু, মসলা" },
  { id: "gadget", name: "গ্যাজেট", note: "এক্সেসরিজ ও হোম" },
];

type SetMenu = "cats" | "ship" | "coupons" | "promo" | "ticker";

const SET_MENUS: { id: SetMenu; label: string }[] = [
  { id: "cats", label: "ক্যাটাগরি" },
  { id: "ship", label: "ডেলিভারি" },
  { id: "coupons", label: "কুপন" },
  { id: "promo", label: "অফার মডাল" },
  { id: "ticker", label: "টপবার" },
];

function SettingsTab() {
  const dispatch = useAppDispatch();
  const products = useAppSelector((s) => s.shop.products);
  const extra = useAppSelector((s) => s.shop.extraCats);
  const hidden = useAppSelector((s) => s.shop.hiddenCats);
  const hiddenVerts = useAppSelector((s) => s.shop.hiddenVerticals ?? []);
  const [menu, setMenu] = useState<SetMenu>("cats");

  function flipVert(id: VerticalId, off: boolean) {
    if (off) {
      dispatch(showVertical(id));
      dispatch(showToast("ক্যাটালগ আবার অ্যাপে"));
      return;
    }
    if (hiddenVerts.length >= SET_COLS.length - 1) {
      dispatch(showToast("অন্তত একটা ক্যাটালগ খোলা রাখুন"));
      return;
    }
    dispatch(hideVertical(id));
    dispatch(showToast("ক্রেতার অ্যাপ থেকে লুকানো"));
  }

  function flip(vertical: VerticalId, name: string, off: boolean) {
    if (off) {
      dispatch(showCat({ vertical, name }));
      dispatch(showToast("আবার সবার দোকানে"));
    } else {
      dispatch(hideCat({ vertical, name }));
      dispatch(showToast("সব ক্রেতার কাছ থেকে লুকানো"));
    }
  }

  return (
    <div className="set-page">
      <nav className="set-steps" aria-label="সেটিংস">
        {SET_MENUS.map((item, i) => (
          <button key={item.id} type="button" className={menu === item.id ? "on" : ""} onClick={() => setMenu(item.id)}>
            <i>{bn(i + 1)}</i>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {menu === "cats" ? <section className="set-cats">
        <header className="set-cats-head">
          <div>
            <h3>ক্রেতা কী দেখবে</h3>
            <p>সুইচ বন্ধ করলে সেই বিভাগ বা ক্যাটাগরি সাথে সাথে দোকান থেকে লুকিয়ে যায়। পণ্য মুছে যায় না।</p>
          </div>
          <div className="set-cats-sum">
            <b>{bn(SET_COLS.length - hiddenVerts.length)}/{bn(SET_COLS.length)}</b><small>বিভাগ চালু</small>
          </div>
        </header>
        <div className="set-verts">
          {SET_COLS.map((col, i) => {
            const off = hiddenVerts.includes(col.id);
            const cats = catTree(col.id, products, extra, []);
            const n = products.filter((p) => p.vertical === col.id).length;
            const hiddenHere = cats.filter((c) => hiddenMain(hidden, col.id, c.name)).length;
            return (
              <article key={col.id} className={`set-vert v-${col.id}${off ? " off" : ""}`} style={{ animationDelay: `${i * 70}ms` }}>
                <div className="set-vert-top">
                  <span className="set-vert-ico"><VerticalIcon id={col.id} /></span>
                  <div>
                    <h4>{col.name}</h4>
                    <small>{col.note}</small>
                  </div>
                  <label className="pk-switch" title={off ? "দেখান" : "লুকান"}>
                    <input type="checkbox" checked={!off} onChange={() => flipVert(col.id, off)} />
                    <span className="sw" aria-hidden="true" />
                  </label>
                </div>
                <div className="set-vert-stats">
                  <p><b>{bn(n)}</b><small>পণ্য</small></p>
                  <p><b>{bn(cats.length - hiddenHere)}</b><small>চালু ক্যাটাগরি</small></p>
                  <p><b>{bn(hiddenHere)}</b><small>লুকানো</small></p>
                </div>
                <span className={`set-state${off ? " off" : ""}`}>{off ? "দোকানে লুকানো" : "দোকানে দেখাচ্ছে"}</span>
                <ul className="set-list">
                  {cats.map((c) => {
                    const hid = hiddenMain(hidden, col.id, c.name);
                    const count = products.filter((p) => p.vertical === col.id && p.cat === c.name).length;
                    return (
                      <li key={c.name} className={hid ? "off" : ""}>
                        <span className="set-li-dot" />
                        <span className="set-li-txt"><b>{c.name}</b><small>{bn(count)}টি পণ্য{c.subs.length ? ` · ${bn(c.subs.length)} সাব` : ""}</small></span>
                        <label className="pk-switch sm">
                          <input type="checkbox" checked={!hid} disabled={off} onChange={() => flip(col.id, c.name, hid)} />
                          <span className="sw" aria-hidden="true" />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </section> : null}
      {menu === "ship" ? <div className="set-panel"><ShipTab /></div> : null}
      {menu === "coupons" ? <div className="set-panel"><CouponsTab /></div> : null}
      {menu === "promo" ? <div className="set-panel"><PromoTab /></div> : null}
      {menu === "ticker" ? <div className="set-panel"><TickerTab /></div> : null}
    </div>
  );
}

function CatsTab() {
  const dispatch = useAppDispatch();
  const vertical = useAppSelector((s) => s.ui.vertical);
  const products = useAppSelector((s) => s.shop.products);
  const extra = useAppSelector((s) => s.shop.extraCats);
  const hidden = useAppSelector((s) => s.shop.hiddenCats);
  const cats = mergedCats(vertical, products, extra, []);
  const catForm = useForm({ defaultValues: { name: "", sub: "" } });

  function count(parent: string, child?: string) {
    return products.filter((p) => p.vertical === vertical && p.cat === parent && (!child || p.sub === child)).length;
  }

  return (
    <>
      <div className="box" style={{ marginBottom: 16 }}>
        <h3 className="serif">নতুন ক্যাটাগরি</h3>
        <form onSubmit={catForm.handleSubmit((values) => {
          const title = values.name.trim();
          if (!title) { dispatch(showToast("ক্যাটাগরির নাম দিন")); return; }
          if (cats.some((c) => c.name === title)) { dispatch(showToast("এই ক্যাটাগরি আগেই আছে")); return; }
          dispatch(addExtraCat({ vertical, name: title, subs: values.sub.trim() ? [values.sub.trim()] : [] }));
          catForm.reset();
          dispatch(showToast("ক্যাটাগরি যোগ হয়েছে · সাইটে দেখা যাচ্ছে"));
        })}>
          <div className="form-grid">
            <div><label>ক্যাটাগরির নাম</label><input {...catForm.register("name")} placeholder="যেমন: প্রাইমারি" /></div>
            <div><label>সাব-ক্যাটাগরি <span className="author">ঐচ্ছিক</span></label><input {...catForm.register("sub")} placeholder="যেমন: বাংলা" /></div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} type="submit">যোগ করুন</button>
        </form>
      </div>
      {!cats.length ? <div className="empty">ক্যাটাগরি নেই</div> : (
        <div className="cat-tree">
          {cats.map((c) => {
            const off = hidden.some((h) => h.vertical === vertical && h.name === c.name && !h.sub);
            return (
            <article className={`cat-card${off ? " is-off" : ""}`} key={c.name}>
              <div className="cat-card-top">
                <span className="cat-card-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h16" /></svg></span>
                <div><b className="nm">{c.name}</b><small>{bn(c.subs.length)}টি সাব · {bn(count(c.name))}টি{off ? " · ইউজার দেখছে না" : ""}</small></div>
                <div className="acts">
                  <button type="button" className={`btn btn-sm ${off ? "btn-primary" : "btn-ghost"}`} onClick={() => {
                    if (off) {
                      dispatch(showCat({ vertical, name: c.name }));
                      dispatch(showToast("ক্যাটাগরি আবার দেখা যাচ্ছে"));
                    } else {
                      dispatch(hideCat({ vertical, name: c.name }));
                      dispatch(showToast("সব ক্রেতার কাছ থেকে লুকানো"));
                    }
                  }}>{off ? "দেখান" : "লুকান"}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                    if (count(c.name)) { dispatch(showToast("আগে পণ্য অন্য ক্যাটাগরিতে সরান")); return; }
                    dispatch(hideCat({ vertical, name: c.name }));
                    dispatch(showToast("ক্যাটাগরি মুছেছে"));
                  }}>মুছুন</button>
                </div>
              </div>
              {c.subs.length ? c.subs.map((s) => (
                <div className="cat-sub-row" key={s}>
                  <i className="dot" />
                  <b>{s}</b>
                  <span>{bn(count(c.name, s))}টি</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                    if (count(c.name, s)) { dispatch(showToast("আগে পণ্য অন্য সাবে সরান")); return; }
                    dispatch(hideCat({ vertical, name: c.name, sub: s }));
                  }}>মুছুন</button>
                </div>
              )) : <p className="cat-empty-subs">এখনো সাব-ক্যাটাগরি নেই</p>}
              <SubAddForm onAdd={(next) => {
                dispatch(addExtraCat({ vertical, name: c.name, subs: [next] }));
                dispatch(showToast("সাব-ক্যাটাগরি যোগ হয়েছে"));
              }} />
            </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function SubAddForm({ onAdd }: { onAdd: (name: string) => void }) {
  const { register, handleSubmit, reset } = useForm({ defaultValues: { sub: "" } });
  return (
    <form className="cat-sub-add" onSubmit={handleSubmit(({ sub }) => {
      const next = sub.trim();
      if (!next) return;
      onAdd(next);
      reset();
    })}>
      <input {...register("sub")} placeholder="সাব-ক্যাটাগরি · যেমন: বাংলা" />
      <button className="btn btn-gold btn-sm" type="submit">সাব যোগ</button>
    </form>
  );
}

function TickerTab() {
  const dispatch = useAppDispatch();
  const ticker = useAppSelector((s) => s.shop.ticker);
  const form = useForm({ defaultValues: { text: "" } });
  return (
    <section className="cfg-card">
      <header className="cfg-head">
        <div><h3>টপবারের স্ক্রলিং টেক্সট</h3><p>সাইটের একদম উপরের বারে লাইনগুলো ঘুরে ঘুরে চলবে</p></div>
        <span className="pk-count">{bn(ticker.length)}টি লাইন</span>
      </header>
      <div className="cfg-ticker" aria-hidden="true">
        <div className="cfg-ticker-run">
          {(ticker.length ? [...ticker, ...ticker] : ["এখানে আপনার টেক্সট চলবে"]).map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>
      <form className="cfg-add" onSubmit={form.handleSubmit(({ text }) => {
        if (!text.trim()) { dispatch(showToast("টেক্সট লিখুন")); return; }
        dispatch(setTicker([...ticker, text.trim()]));
        form.reset();
        dispatch(showToast("টপবারে যোগ হয়েছে"));
      })}>
        <input {...form.register("text")} placeholder="নতুন লাইন · যেমন: ঈদে ফ্রি ডেলিভারি" />
        <button className="btn btn-primary btn-sm" type="submit">যোগ করুন</button>
      </form>
      {ticker.length ? (
        <ol className="cfg-lines">
          {ticker.map((t, i) => (
            <li key={i}>
              <span className="cfg-no">{bn(i + 1)}</span>
              <input value={t} onChange={(e) => { const next = [...ticker]; next[i] = e.target.value; dispatch(setTicker(next)); }} />
              <button type="button" className="pk-del" aria-label="সরান" title="সরান" onClick={() => { dispatch(setTicker(ticker.filter((_, n) => n !== i))); dispatch(showToast("লাইন সরানো হয়েছে")); }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg>
              </button>
            </li>
          ))}
        </ol>
      ) : <div className="empty">এখনো কোনো টেক্সট নেই</div>}
    </section>
  );
}

function PackStack({ books, size = "md" }: { books: { id: number; title: string; color: string; image?: string }[]; size?: "md" | "lg" }) {
  const top = books.slice(0, 5);
  if (!top.length) return <div className={`pk-stack ${size} empty-stack`}><span>বই বাছুন</span></div>;
  return (
    <div className={`pk-stack ${size}`} style={{ ["--n" as string]: top.length }}>
      {top.map((b, i) => (
        <span key={b.id} className="pk-cover" style={{ ["--i" as string]: i - (top.length - 1) / 2, background: b.image ? undefined : b.color }}>
          {b.image ? <img src={b.image} alt="" /> : <em>{b.title}</em>}
        </span>
      ))}
    </div>
  );
}

function PacksTab() {
  const dispatch = useAppDispatch();
  const packs = useAppSelector((s) => s.shop.packs);
  const books = useAppSelector((s) => s.shop.products.filter((p) => p.vertical === "book"));
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const packForm = useForm({ defaultValues: { title: "", price: "", old: "", free: false } });
  const shown = books.filter((b) => `${b.title} ${b.author} ${b.cat}`.toLowerCase().includes(q.toLowerCase()));
  const live = packForm.watch();
  const pickedBooks = picked.map((id) => books.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => b != null);
  const sumPrice = pickedBooks.reduce((s, b) => s + b.price, 0);
  const livePrice = Number(live.price || 0);
  const liveOld = Number(live.old || 0) || sumPrice;
  const liveOff = discount(livePrice, liveOld);
  const avgOff = packs.length ? Math.round(packs.reduce((s, p) => s + discount(p.price, p.old), 0) / packs.length) : 0;
  const freeN = packs.filter((p) => p.freeShip).length;

  function add(data: { title: string; price: string; old: string; free: boolean }) {
    const title = data.title.trim();
    const price = Number(data.price || 0);
    if (!title || !price || picked.length < 2) { dispatch(showToast("নাম, দাম আর কমপক্ষে ২টি বই দিন")); return; }
    dispatch(addPack({
      id: Date.now(), title, price, old: Number(data.old || 0) || sumPrice,
      bookIds: picked, desc: "প্যাকেজ অফার।", vertical: "book", freeShip: data.free,
    }));
    setPicked([]);
    packForm.reset();
    dispatch(showToast("প্যাকেজ যোগ হয়েছে"));
  }

  function flip(id: number) {
    setPicked((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  return (
    <div className="pk-page">
      <div className="pk-stats">
        <article><span className="pk-stat-ico"><TabMark id="packs" /></span><div><b>{bn(packs.length)}</b><small>চলমান প্যাকেজ</small></div></article>
        <article><span className="pk-stat-ico gold">%</span><div><b>{bn(avgOff)}%</b><small>গড় ছাড়</small></div></article>
        <article><span className="pk-stat-ico sage"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></svg></span><div><b>{bn(freeN)}</b><small>ফ্রি ডেলিভারি</small></div></article>
      </div>

      <form className="pk-studio" onSubmit={packForm.handleSubmit(add)}>
        <div className="pk-build">
          <header className="pk-head">
            <span className="pk-step">১</span>
            <div><h3>প্যাকেজের নাম ও দাম</h3><p>নাম দিন, তারপর দাম বসান</p></div>
          </header>
          <label>প্যাকেজ নাম</label><input {...packForm.register("title")} placeholder="যেমন: এসএসসি প্যাকেজ" />
          <div className="form-grid">
            <div><label>নতুন দাম</label><input {...packForm.register("price")} type="number" min="1" placeholder="৳" /></div>
            <div><label>পুরনো দাম <span className="author">খালি থাকলে বইয়ের মোট</span></label><input {...packForm.register("old")} type="number" min="0" placeholder={sumPrice ? `৳${bn(sumPrice)}` : "৳"} /></div>
          </div>

          <header className="pk-head" style={{ marginTop: 22 }}>
            <span className="pk-step">২</span>
            <div><h3>বই বেছে নিন</h3><p>কমপক্ষে ২টি · কভারে চাপ দিন</p></div>
            <em className="pk-count">{bn(picked.length)}টি</em>
          </header>
          <div className="pk-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
            <input type="search" placeholder="বই, লেখক বা ক্যাটাগরি খুঁজুন..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="pk-tiles">
            {shown.map((b) => {
              const on = picked.includes(b.id);
              return (
                <button type="button" key={b.id} className={`pk-tile${on ? " on" : ""}`} onClick={() => flip(b.id)}>
                  <span className="pk-tile-cover" style={{ background: b.image ? undefined : b.color }}>
                    {b.image ? <img src={b.image} alt="" /> : <em>{b.title}</em>}
                    <i className="pk-tick"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"><path d="M5 12.5 10 17.5 19 7.5" /></svg></i>
                  </span>
                  <b>{b.title}</b>
                  <small>৳{bn(b.price)} · {b.cat}</small>
                </button>
              );
            })}
            {!shown.length ? <p className="pk-none">কোনো বই মেলেনি</p> : null}
          </div>
        </div>

        <aside className="pk-preview">
          <p className="pk-live"><i /> লাইভ প্রিভিউ</p>
          <div className="pk-stage">
            {liveOff ? <span className="pk-ribbon">-{bn(liveOff)}%</span> : null}
            <PackStack books={pickedBooks} size="lg" />
          </div>
          <h4>{live.title?.trim() || "প্যাকেজের নাম"}</h4>
          <p className="pk-sub">{bn(pickedBooks.length)}টি বই{live.free ? " · ফ্রি ডেলিভারি" : ""}</p>
          <div className="pk-price">
            <b>৳{bn(livePrice || 0)}</b>
            {liveOld > livePrice && livePrice ? <s>৳{bn(liveOld)}</s> : null}
          </div>
          {liveOld > livePrice && livePrice ? <p className="pk-save">ক্রেতা বাঁচাবে ৳{bn(liveOld - livePrice)}</p> : null}
          <label className="pk-switch">
            <input type="checkbox" {...packForm.register("free")} />
            <span className="sw" aria-hidden="true" />
            <span>ফ্রি ডেলিভারি</span>
          </label>
          <button className="btn btn-primary btn-wide" type="submit">প্যাকেজ তৈরি করুন</button>
        </aside>
      </form>

      <div className="pk-gallery-head">
        <h3>চলমান প্যাকেজ</h3>
        <span>{bn(packs.length)}টি</span>
      </div>
      {!packs.length ? <div className="empty">এখনো কোনো প্যাকেজ নেই · উপরে তৈরি করুন</div> : (
        <div className="pk-gallery">
          {packs.map((p, i) => {
            const list = p.bookIds.map((id) => books.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => b != null);
            const off = discount(p.price, p.old);
            return (
              <article className="pk-card" key={p.id} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="pk-card-stage">
                  {off ? <span className="pk-ribbon">-{bn(off)}%</span> : null}
                  {p.freeShip ? <span className="pk-free">ফ্রি ডেলিভারি</span> : null}
                  <PackStack books={list} />
                </div>
                <div className="pk-card-body">
                  <h4>{p.title}</h4>
                  <p className="pk-sub">{bn(p.bookIds.length)}টি বই</p>
                  <div className="pk-price"><b>৳{bn(p.price)}</b>{p.old > p.price ? <s>৳{bn(p.old)}</s> : null}</div>
                  <div className="pk-card-foot">
                    <label className="pk-switch sm">
                      <input type="checkbox" checked={!!p.freeShip} onChange={(e) => { dispatch(patchPack({ id: p.id, patch: { freeShip: e.target.checked } })); dispatch(showToast(e.target.checked ? "ফ্রি ডেলিভারি চালু হয়েছে" : "ফ্রি ডেলিভারি বন্ধ")); }} />
                      <span className="sw" aria-hidden="true" />
                      <span>ফ্রি ডেলিভারি</span>
                    </label>
                    <button type="button" className="pk-del" aria-label="মুছুন" title="মুছুন" onClick={() => { dispatch(deletePack(p.id)); dispatch(showToast("প্যাকেজ মুছে ফেলা হয়েছে")); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CouponsTab() {
  const dispatch = useAppDispatch();
  const coupons = useAppSelector((s) => s.shop.coupons);
  const orders = useAppSelector((s) => s.orders.orders);
  const form = useForm({ defaultValues: { code: "", off: "", type: "pct" } });
  const live = form.watch();
  const liveCode = (live.code || "").trim().toUpperCase();
  const liveOff = Number(live.off || 0);
  const uses = (code: string) => orders.filter((o) => (o.coupon || "").toUpperCase() === code).length;
  const usedTotal = orders.filter((o) => o.coupon).length;
  const activeN = coupons.filter((c) => c.active).length;
  const taken = coupons.some((c) => c.code === liveCode);

  function add(data: { code: string; off: string; type: string }) {
    const code = data.code.trim().toUpperCase();
    const off = Number(data.off || 0);
    if (!code || !off) { dispatch(showToast("কোড ও মান দিন")); return; }
    if (coupons.some((c) => c.code === code)) { dispatch(showToast("এই কোড আগেই আছে")); return; }
    if (data.type === "pct" && off >= 100) { dispatch(showToast("শতাংশ ১০০-এর কম দিন")); return; }
    dispatch(addCoupon({ code, off, type: data.type === "tk" ? "tk" : "pct", active: true }));
    form.reset({ code: "", off: "", type: data.type });
    dispatch(showToast("কুপন যোগ হয়েছে"));
  }

  function suggest() {
    const words = ["CHOLO", "BOI", "EID", "SAVE", "READ", "NEW"];
    const w = words[Math.floor(Math.random() * words.length)];
    form.setValue("code", `${w}${liveOff || Math.floor(Math.random() * 4 + 1) * 10}`);
  }

  function copy(code: string) {
    navigator.clipboard?.writeText(code).catch(() => undefined);
    dispatch(showToast(`${code} কপি হয়েছে`));
  }

  return (
    <div className="cp-page">
      <div className="pk-stats">
        <article><span className="pk-stat-ico">%</span><div><b>{bn(activeN)}</b><small>চালু কুপন</small></div></article>
        <article><span className="pk-stat-ico gold"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8.5A2.5 2.5 0 0 0 6.5 6h11A2.5 2.5 0 0 0 20 8.5v1a2 2 0 0 1 0 5v1A2.5 2.5 0 0 0 17.5 18h-11A2.5 2.5 0 0 0 4 15.5v-1a2 2 0 0 1 0-5z" /></svg></span><div><b>{bn(coupons.length)}</b><small>মোট কুপন</small></div></article>
        <article><span className="pk-stat-ico sage"><TabMark id="orders" /></span><div><b>{bn(usedTotal)}</b><small>অর্ডারে ব্যবহার</small></div></article>
      </div>

      <form className="cp-maker" onSubmit={form.handleSubmit(add)}>
        <div className="cp-form">
          <header className="cfg-head" style={{ marginBottom: 6 }}>
            <div><h3>নতুন কুপন</h3><p>ক্রেতা চেকআউটে এই কোড বসিয়ে ছাড় পাবে</p></div>
          </header>
          <label>কুপন কোড</label>
          <div className="cp-code-row">
            <input className="cfg-code" {...form.register("code", { onChange: (e) => form.setValue("code", e.target.value.toUpperCase().replace(/\s/g, "")) })} placeholder="EID20" maxLength={16} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={suggest}>✦ নিজে বানাও</button>
          </div>
          {taken ? <p className="cp-warn">এই কোড আগেই আছে</p> : null}
          <div className="cp-row2">
            <div>
              <label>ছাড়ের ধরন</label>
              <div className="cp-seg">
                <label className={live.type !== "tk" ? "on" : ""}><input type="radio" value="pct" {...form.register("type")} />% শতাংশ</label>
                <label className={live.type === "tk" ? "on" : ""}><input type="radio" value="tk" {...form.register("type")} />৳ টাকা</label>
              </div>
            </div>
            <div>
              <label>মান</label>
              <div className="cp-val">
                <span>{live.type === "tk" ? "৳" : "%"}</span>
                <input {...form.register("off")} type="number" min="1" placeholder={live.type === "tk" ? "50" : "10"} />
              </div>
            </div>
          </div>
          <div className="cp-quick">
            {(live.type === "tk" ? [30, 50, 100, 150] : [5, 10, 15, 20]).map((n) => (
              <button key={n} type="button" className={liveOff === n ? "on" : ""} onClick={() => form.setValue("off", String(n))}>{live.type === "tk" ? `৳${bn(n)}` : `${bn(n)}%`}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-wide" style={{ marginTop: 14 }} type="submit" disabled={taken}>কুপন তৈরি করুন</button>
        </div>
        <aside className="cp-preview">
          <p className="pk-live"><i /> লাইভ প্রিভিউ</p>
          <div className="cp-ticket big">
            <div className="cp-t-left">
              <b>{liveOff ? (live.type === "tk" ? `৳${bn(liveOff)}` : `${bn(liveOff)}%`) : "—"}</b>
              <small>ছাড়</small>
            </div>
            <div className="cp-t-right">
              <small>কুপন কোড</small>
              <code>{liveCode || "CODE"}</code>
              <span>চেকআউটে বসান</span>
            </div>
          </div>
        </aside>
      </form>

      <div className="pk-gallery-head">
        <h3>সব কুপন</h3>
        <span>{bn(coupons.length)}টি</span>
      </div>
      {!coupons.length ? <div className="empty">এখনো কোনো কুপন নেই</div> : (
        <div className="cp-grid">
          {coupons.map((c: ShopCoupon, i) => {
            const n = uses(c.code);
            return (
              <article key={c.code} className={`cp-ticket${c.active ? "" : " is-off"}`} style={{ animationDelay: `${i * 50}ms` }}>
                <div className="cp-t-left">
                  <b>{c.type === "pct" ? `${bn(c.off)}%` : `৳${bn(c.off)}`}</b>
                  <small>{c.type === "pct" ? "শতাংশ ছাড়" : "টাকা ছাড়"}</small>
                </div>
                <div className="cp-t-right">
                  <div className="cp-t-top">
                    <code>{c.code}</code>
                    <button type="button" className="cp-copy" aria-label="কপি" title="কপি" onClick={() => copy(c.code)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>
                    </button>
                  </div>
                  <span className="cp-uses">{n ? `${bn(n)}টি অর্ডারে ব্যবহার` : "এখনো ব্যবহার হয়নি"}</span>
                  <label className="pk-switch sm">
                    <input type="checkbox" checked={c.active} onChange={() => { dispatch(toggleCoupon(c.code)); dispatch(showToast(c.active ? `${c.code} বন্ধ করা হয়েছে` : `${c.code} চালু হয়েছে`)); }} />
                    <span className="sw" aria-hidden="true" />
                    <span>{c.active ? "চালু" : "বন্ধ"}</span>
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PromoTab() {
  const dispatch = useAppDispatch();
  const promo = useAppSelector((s) => s.shop.promo);
  const [draft, setDraft] = useState<PromoSettings>(promo);
  const dirty = JSON.stringify(draft) !== JSON.stringify(promo);
  return (
    <div className="cfg-split">
      <section className="cfg-card">
        <header className="cfg-head">
          <div><h3>প্রথম ভিজিটের অফার মডাল</h3><p>সাইটে প্রথমবার ঢুকলে ক্রেতা এই পপআপ দেখবে</p></div>
          <label className="pk-switch">
            <input type="checkbox" checked={draft.on} onChange={(e) => setDraft({ ...draft, on: e.target.checked })} />
            <span className="sw" aria-hidden="true" />
            <span>{draft.on ? "চালু" : "বন্ধ"}</span>
          </label>
        </header>
        <div className="cfg-grid">
          <div className="span-2"><label>শিরোনাম</label><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="যেমন: প্রথম অর্ডারে ১০% ছাড়" /></div>
          <div className="span-2"><label>টেক্সট</label><textarea rows={2} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="ছোট একটা বার্তা" /></div>
          <div><label>কুপন কোড</label><input className="cfg-code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="CHOLO10" /></div>
          <div>
            <label>ছবি</label>
            <div className="cfg-img">
              <label className="btn btn-ghost btn-sm cfg-file">ছবি বাছুন<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, (url) => setDraft({ ...draft, image: url })); }} /></label>
              {draft.image ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, image: "" })}>সরান</button> : null}
            </div>
          </div>
        </div>
        <div className="cfg-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { sessionStorage.removeItem("cholo_promo_seen"); dispatch(showToast("পরের রিফ্রেশে মডাল আবার দেখাবে")); }}>টেস্ট: আবার দেখাও</button>
          <button type="button" className="btn btn-primary" disabled={!dirty} onClick={() => { dispatch(setPromo(draft)); dispatch(showToast("অফার সেভ হয়েছে")); }}>{dirty ? "সেভ করুন" : "সেভ করা আছে"}</button>
        </div>
      </section>
      <aside className="cfg-preview">
        <p className="pk-live"><i /> লাইভ প্রিভিউ</p>
        <div className={`cfg-modal${draft.on ? "" : " off-look"}`}>
          <div className="cfg-modal-art">{draft.image ? <img src={draft.image} alt="" /> : <b>{draft.title || "শিরোনাম"}</b>}</div>
          <div className="cfg-modal-body">
            <h4>{draft.title || "শিরোনাম"}</h4>
            <p>{draft.text || "এখানে আপনার বার্তা দেখাবে।"}</p>
            {draft.code ? <span className="cfg-modal-code">{draft.code}</span> : null}
            <span className="cfg-modal-btn">ক্যাটালগ দেখুন</span>
          </div>
        </div>
        {!draft.on ? <p className="cfg-note">মডাল এখন বন্ধ · ক্রেতা দেখবে না</p> : null}
      </aside>
    </div>
  );
}

function ShipTab() {
  const dispatch = useAppDispatch();
  const ship = useAppSelector((s) => s.shop.ship);
  const [draft, setDraft] = useState<ShipSettings>(ship);
  const set = (patch: Partial<ShipSettings>) => setDraft({ ...draft, ...patch });
  const live = draft.freeAllOn;
  return (
    <div className="ship-page">
      <div className="ship-hero">
        <div>
          <h2>ডেলিভারি সেটিং</h2>
          <p>ঢাকা জেলা = ভিতর · অন্য জেলা = বাইরে। চেকআউটে জেলা বাছাই করলে এই খরচ বসবে।</p>
        </div>
        <span className={`ship-live${live ? " on" : ""}`}>{live ? "ক্যাম্পেইন চালু · ফ্রি" : "সাধারণ রেট চালু"}</span>
      </div>
      <div className="ship-rate-grid">
        <section className="ship-card">
          <div className="ship-card-h"><div><h3>ঢাকার ভিতর</h3><p>শুধু জেলা ঢাকা</p></div></div>
          <div className="ship-fields">
            <div><label>কাস্টমার দেখবে (৳)</label><input type="number" value={draft.dhaka} onChange={(e) => set({ dhaka: Number(e.target.value) || 0 })} /></div>
            <div><label>আপনার খরচ (৳)</label><input type="number" value={draft.costDhaka} onChange={(e) => set({ costDhaka: Number(e.target.value) || 0 })} /></div>
          </div>
        </section>
        <section className="ship-card out">
          <div className="ship-card-h"><div><h3>ঢাকার বাইরে</h3><p>অন্য সব জেলা</p></div></div>
          <div className="ship-fields">
            <div><label>কাস্টমার দেখবে (৳)</label><input type="number" value={draft.outside} onChange={(e) => set({ outside: Number(e.target.value) || 0 })} /></div>
            <div><label>আপনার খরচ (৳)</label><input type="number" value={draft.costOutside} onChange={(e) => set({ costOutside: Number(e.target.value) || 0 })} /></div>
          </div>
        </section>
      </div>
      <section className="ship-card">
        <div className="ship-card-h"><div><h3>ফ্রি হোম ডেলিভারি</h3><p>টগল চালু করলে সেই অর্ডারে কুরিয়ার ৳০</p></div></div>
        <div className="ship-togs">
          <label className="tog"><input type="checkbox" checked={draft.freeOnPack} onChange={(e) => set({ freeOnPack: e.target.checked })} /><span><b>প্যাকেজ কিনলে</b><small>কার্টে প্যাকেজ থাকলে ফ্রি</small></span></label>
          <label className="tog"><input type="checkbox" checked={draft.freeOnBooks} onChange={(e) => set({ freeOnBooks: e.target.checked })} /><span><b>শুধু বই কিনলে</b></span></label>
          <label className="tog"><input type="checkbox" checked={draft.freeAboveOn} onChange={(e) => set({ freeAboveOn: e.target.checked })} /><span><b>অঙ্কের উপরে</b></span></label>
        </div>
        <div className="ship-nested"><label>ফ্রি হবে যে অঙ্ক থেকে (৳)</label><input type="number" value={draft.freeAbove} onChange={(e) => set({ freeAbove: Number(e.target.value) || 0 })} /></div>
      </section>
      <section className="ship-card camp">
        <div className="ship-card-h"><div><h3>সময় বেঁধে সবার জন্য ফ্রি</h3><p>এই সময়ের মধ্যে সব অর্ডারে হোম ডেলিভারি ফ্রি</p></div></div>
        <label className="tog"><input type="checkbox" checked={draft.freeAllOn} onChange={(e) => set({ freeAllOn: e.target.checked })} /><span><b>ক্যাম্পেইন চালু</b></span></label>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <BnDateField label="শুরু" withTime value={draft.freeFrom} onChange={(freeFrom) => set({ freeFrom })} />
          <BnDateField label="শেষ" withTime end value={draft.freeTo} onChange={(freeTo) => set({ freeTo })} />
        </div>
      </section>
      <section className="ship-card">
        <div className="ship-card-h"><div><h3>SSL ফি</h3><p>হিসাবে পেমেন্ট গেটওয়ে খরচ — কাস্টমার দেখবে না</p></div></div>
        <div className="ship-ssl">
          <div><label>ফি %</label><input type="number" value={draft.sslFeePct} onChange={(e) => set({ sslFeePct: Number(e.target.value) || 0 })} /></div>
          <p className="hint-txt">স্যান্ডবক্স চালাতে টার্মিনালে <code>node design/ssl-sandbox.mjs</code> — তারপর <code>http://127.0.0.1:8787/</code></p>
        </div>
      </section>
      <div className="save-row">
        <span className="hint-txt">সেভ করলে চেকআউট ও কার্টে সাথে সাথে বসবে</span>
        <button type="button" className="btn btn-primary" onClick={() => { dispatch(setShip(draft)); dispatch(showToast("ডেলিভারি সেভ হয়েছে")); }}>সেভ করুন</button>
      </div>
    </div>
  );
}

const VERT_NAME: Record<VerticalId, string> = { book: "বই", food: "ঘরের বাজার", gadget: "গ্যাজেট" };

function orderVerticals(o: DemoOrder, products: ShopProduct[], packs: { id: number; vertical: VerticalId }[]): VerticalId[] {
  const found = new Set<VerticalId>();
  for (const line of o.lines || []) {
    if (line.kind === "pack") found.add(packs.find((p) => p.id === line.id)?.vertical || "book");
    else {
      const hit = products.find((p) => p.id === line.id);
      if (hit) found.add(hit.vertical);
    }
  }
  if (!found.size) {
    for (const part of o.items.split(",")) {
      const title = part.split("×")[0].trim();
      const hit = title ? products.find((p) => p.title === title) : undefined;
      if (hit) found.add(hit.vertical);
    }
  }
  return (["book", "food", "gadget"] as VerticalId[]).filter((v) => found.has(v));
}

function VertTags({ list }: { list: VerticalId[] }) {
  if (!list.length) return <span className="vt-tag none">অজানা</span>;
  return (
    <span className="vt-tags">
      {list.map((v) => <span key={v} className={`vt-tag v-${v}`}><VerticalIcon id={v} />{VERT_NAME[v]}</span>)}
    </span>
  );
}

function OrdersTab() {
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.orders.orders);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pay, setPay] = useState("all");
  const [vert, setVert] = useState("all");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const products = useAppSelector((s) => s.shop.products);
  const packs = useAppSelector((s) => s.shop.packs);
  const vertsOf = useMemo(() => new Map(orders.map((o) => [o.id, orderVerticals(o, products, packs)])), [orders, products, packs]);
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Paper | null>(null);
  const [ret, setRet] = useState<DemoOrder | null>(null);
  const [reason, setReason] = useState("কাস্টমার ফেরত দিয়েছে");
  const [loss, setLoss] = useState(0);
  const fee = useAppSelector((s) => s.shop.ship.sslFeePct);
  const orderPapers = useAppSelector((s) => s.books.papers.filter((p) => p.orderId === open));
  const filtered = useMemo(() => orders.filter((o) => {
    const blob = `${o.id} ${o.name} ${o.phone} ${o.items}`.toLowerCase();
    if (q && !blob.includes(q.trim().toLowerCase())) return false;
    if (status === "pending" && o.status >= 0) return false;
    if (status === "run" && !(o.status >= 0 && o.status < 4)) return false;
    if (status === "done" && o.status !== 4) return false;
    if (status === "cancel" && o.status !== 5) return false;
    if (pay === "cod" && !o.pay.includes("ক্যাশ")) return false;
    if (vert !== "all" && !(vertsOf.get(o.id) || []).includes(vert as VerticalId)) return false;
    if (pay === "ssl" && !o.pay.toUpperCase().includes("SSL")) return false;
    if (range === "custom") {
      if (from && o.at < dayRange(from).start) return false;
      if (to && o.at >= dayRange(to).end) return false;
    } else if (range !== "all") {
      const age = Date.now() - o.at;
      if (range === "today" && age > 86400000) return false;
      if (range === "7" && age > 7 * 86400000) return false;
      if (range === "30" && age > 30 * 86400000) return false;
    }
    return true;
  }), [orders, q, status, range, pay, from, to, vert, vertsOf]);
  const chip = (cur: string, id: string, label: string, set: (v: string) => void, tone = "") => (
    <button type="button" className={`ofilt${cur === id ? ` on${tone ? ` ${tone}` : ""}` : ""}`} onClick={() => set(id)}>{label}</button>
  );
  useEffect(() => { setPage(1); }, [q, status, range, pay, from, to, vert]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const cur = Math.min(page, pages);
  const slice = filtered.slice((cur - 1) * size, cur * size);
  function goPage(n: number) {
    setPage(n);
    document.querySelector(".adm .ord-bar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const detail = orders.find((o) => o.id === open);
  const vertCount = (v: VerticalId) => orders.filter((o) => (vertsOf.get(o.id) || []).includes(v)).length;

  function changeStatus(order: DemoOrder, status: number, credit?: { reason: string; courierLoss: number }) {
    const units = stockUnits(order.lines || []);
    const wasCancel = order.status === 5;
    const willCancel = status === 5;
    if (!wasCancel && willCancel && order.stockHeld && units.length) {
      dispatch(releaseStock(units));
      dispatch(setOrderStatus({ id: order.id, status, stockHeld: false }));
    } else if (wasCancel && !willCancel && units.length && !order.stockHeld) {
      const short = stockShort(units, products);
      if (short) {
        dispatch(showToast(`${short} এর স্টক নেই`));
        return;
      }
      dispatch(holdStock(units));
      dispatch(setOrderStatus({ id: order.id, status, stockHeld: true }));
    } else {
      dispatch(setOrderStatus({ id: order.id, status }));
    }
    dispatch(applyOrderBooks({ order, next: status, feePct: fee, credit }));
    const wasLive = order.status >= 0 && order.status < 5;
    if (order.status < 0 && status >= 0 && status < 5) {
      dispatch(showToast(order.pay.toUpperCase().includes("SSL") ? "কনফার্ম · ইনভয়েস ও রিসিট" : "কনফার্ম · ইনভয়েস কাটা হয়েছে"));
    } else if (status === 5 && order.status < 0) {
      dispatch(showToast(order.stockHeld && units.length ? "বাতিল · স্টক ফিরেছে" : "বাতিল"));
    } else if (status === 5 && wasLive) {
      dispatch(showToast(units.length ? "ক্রেডিট নোট · স্টক ফিরেছে" : "ক্রেডিট নোট কাটা হয়েছে"));
    } else if (status === 4 && !order.pay.toUpperCase().includes("SSL")) {
      dispatch(showToast("ডেলিভারি · রিসিট কাটা হয়েছে"));
    } else {
      dispatch(showToast("স্ট্যাটাস বদলেছে"));
    }
  }

  return (
    <>
      {orders.some((o) => o.status < 0) ? <p className="guest-note" style={{ margin: "0 0 14px" }}>নতুন {bn(orders.filter((o) => o.status < 0).length)}টি অর্ডার কনফার্মের অপেক্ষায়।</p> : null}
      <div className="ord-bar">
        <div className="ord-bar-top">
          <div className="ord-search">
            <input type="search" placeholder="আইডি, নাম, ফোন বা পণ্য খুঁজুন" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <span className="ord-meta">{bn(filtered.length)}টি অর্ডার</span>
        </div>
        <div className="ord-grid">
          <div className="ord-col"><h4>স্ট্যাটাস</h4><div className="ord-chips">
            {chip(status, "all", `সব · ${bn(orders.length)}`, setStatus)}
            {chip(status, "pending", "অপেক্ষমাণ", setStatus, "warn")}
            {chip(status, "run", "চলমান", setStatus)}
            {chip(status, "done", "সম্পন্ন", setStatus, "ok")}
            {chip(status, "cancel", "বাতিল", setStatus, "bad")}
          </div></div>
          <div className="ord-col"><h4>তারিখ</h4><div className="ord-chips">
            {chip(range, "all", "সব সময়", (v) => { setRange(v); setFrom(""); setTo(""); })}
            {chip(range, "today", "আজ", (v) => { setRange(v); setFrom(""); setTo(""); })}
            {chip(range, "7", "৭ দিন", (v) => { setRange(v); setFrom(""); setTo(""); })}
            {chip(range, "30", "৩০ দিন", (v) => { setRange(v); setFrom(""); setTo(""); })}
            <BnRangeButton on={range === "custom"} from={from} to={to} marked={orders.map((o) => isoDay(o.at))} onChange={(a, b) => { setRange("custom"); setFrom(a); setTo(b); }} />
          </div></div>
          <div className="ord-col"><h4>বিভাগ</h4><div className="ord-chips">
            {chip(vert, "all", "সব", setVert)}
            {(["book", "food", "gadget"] as VerticalId[]).map((v) => (
              <button key={v} type="button" className={`ofilt vt-filt${vert === v ? " on" : ""}`} onClick={() => setVert(v)}>
                <VerticalIcon id={v} />{VERT_NAME[v]}<span> {bn(vertCount(v))}</span>
              </button>
            ))}
          </div></div>
          <div className="ord-col"><h4>পেমেন্ট</h4><div className="ord-chips">
            {chip(pay, "all", "সব", setPay)}
            {chip(pay, "cod", "ক্যাশ অন", setPay)}
            {chip(pay, "ssl", "SSLCOMMERZ", setPay)}
          </div></div>
        </div>
      </div>
      {!filtered.length ? <div className="empty">এই ফিল্টারে অর্ডার নেই</div> : (
        <div style={{ overflowX: "auto" }}>
          <table><tbody>
            <tr><th>অর্ডার</th><th>বিভাগ</th><th>তারিখ</th><th>যোগাযোগ</th><th>মোট</th><th>অ্যাকশন</th></tr>
            {slice.map((o) => (
              <tr key={o.id} className={`ord-row${o.status < 0 ? " hold-row" : ""}`} onClick={() => setOpen(o.id)}>
                <td><div className="ord-cell"><b>{o.id}</b><span className={`st-pill ${o.status < 0 ? "hold" : o.status === 5 ? "bad" : o.status === 4 ? "done" : "live"}`}>{statusLabel(o.status)}</span></div><div className="author">{o.items}</div></td>
                <td><VertTags list={vertsOf.get(o.id) || []} /></td>
                <td>{new Date(o.at).toLocaleDateString("bn-BD")}<div className="author">{o.pay}</div></td>
                <td>{o.phone}<div className="author">{o.name}</div></td>
                <td>৳{bn(o.total)}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {o.status < 0 ? (
                    <div className="admin-ord-acts">
                      <span className="stock-pill out">অপেক্ষমাণ</span>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => changeStatus(o, 0)}>কনফার্ম করুন</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => changeStatus(o, 5)}>বাতিল</button>
                    </div>
                  ) : (
                    <div className="admin-ord-acts">
                      <select value={o.status} onChange={(e) => changeStatus(o, Number(e.target.value))}>
                        {STATUS.map((s, i) => <option key={s} value={i}>{s}</option>)}
                      </select>
                      {o.status < 5 ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setRet(o); setReason("কাস্টমার ফেরত দিয়েছে"); setLoss(0); }}>ফেরত</button> : null}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}
      {filtered.length ? <Pager cur={cur} pages={pages} total={filtered.length} size={size} onPage={goPage} onSize={(n) => { setSize(n); setPage(1); }} unit="টি অর্ডার" /> : null}
      {detail ? (
        <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="box" style={{ maxWidth: 520, margin: "10vh auto" }}>
            <button type="button" className="x" onClick={() => setOpen(null)}>×</button>
            <h3 className="serif">{detail.id}</h3>
            <p style={{ margin: "0 0 8px" }}><VertTags list={vertsOf.get(detail.id) || []} /></p>
            <p>{detail.name} · {detail.phone}</p>
            <p className="author">{detail.address}</p>
            <p>{detail.items}</p>
            {detail.lines?.map((line) => (
              <p key={`${line.kind}-${line.id}`} className="author">
                {line.title} × {bn(line.qty)} · বিক্রি ৳{bn(line.price)} · কেনা {line.costKnown ? `৳${bn(line.cost)}` : "নেই"}
              </p>
            ))}
            {detail.ship != null ? <p className="author">ডেলিভারি ৳{bn(detail.ship)} · কুরিয়ার খরচ ৳{bn(detail.shipCost || 0)}{detail.couponOff ? ` · কুপন ৳${bn(detail.couponOff)}` : ""}</p> : null}
            <p><b>৳{bn(detail.total)}</b> · {detail.pay} · {statusLabel(detail.status)}</p>
            {detail.status >= 0 && detail.status < 5 ? (
              detail.paid ? <span className="fin-pill ok">টাকা পেয়েছি</span> : (
                <button type="button" className="btn btn-gold btn-sm" onClick={() => { dispatch(markPaid(detail.id)); dispatch(applyOrderBooks({ order: detail, next: detail.status, feePct: fee, markPaid: true })); }}>বকেয়া · টাকা পেয়েছি</button>
              )
            ) : null}
            {orderPapers.length ? (
              <div className="admin-ord-acts" style={{ marginTop: 10 }}>
                {orderPapers.map((p) => (
                  <button key={p.id} type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet(p)}>{p.kind === "invoice" ? "ইনভয়েস" : p.kind === "receipt" ? "রিসিট" : "ক্রেডিট নোট"}</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {sheet ? <PaperView paper={sheet} onClose={() => setSheet(null)} /> : null}
      {ret ? (
        <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setRet(null); }}>
          <div className="box" style={{ maxWidth: 460, margin: "12vh auto" }}>
            <button type="button" className="x" onClick={() => setRet(null)}>×</button>
            <h3 className="serif">ফেরত · {ret.id}</h3>
            <p className="author">ক্রেডিট নোট কাটবে, স্টক ফিরবে। কুরিয়ারে উঠে থাকলে খরচ থেকে যাবে, বাড়তি লস আলাদা লাইন।</p>
            <label>কারণ</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
            <label>কুরিয়ার লস (৳)</label>
            <input type="number" min={0} value={loss || ""} onChange={(e) => setLoss(Number(e.target.value) || 0)} />
            <div className="save-row">
              <button type="button" className="btn btn-primary" onClick={() => { changeStatus(ret, 5, { reason: reason.trim() || "ফেরত", courierLoss: loss }); setRet(null); }}>ক্রেডিট নোট কাটুন</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

const QUICK_REPLIES = ["আসসালামু আলাইকুম, কীভাবে সাহায্য করতে পারি?", "আপনার অর্ডার আইডিটা দিন, দেখে জানাচ্ছি।", "ঢাকায় ১-২ দিন, বাইরে ২-৪ দিনে ডেলিভারি।", "বইটি স্টকে আছে, অর্ডার করতে পারেন।", "ধন্যবাদ! আর কিছু লাগলে জানাবেন।"];

function clock(t: number) {
  return t ? new Date(t).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" }) : "";
}

function ChatTab() {
  const dispatch = useAppDispatch();
  const chats = useAppSelector((s) => s.shop.chats);
  const users = useAppSelector((s) => s.session.users);
  const orders = useAppSelector((s) => s.orders.orders);
  const [id, setId] = useState(chats[0]?.id || "");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "new">("all");
  const replyForm = useForm({ defaultValues: { text: "" } });
  const cur: ChatThread | undefined = chats.find((c) => c.id === id) || chats[0];
  const isNew = (c: ChatThread) => c.msgs.at(-1)?.from === "user";
  const list = chats.filter((c) => (only === "all" || isNew(c)) && `${c.name} ${c.msgs.at(-1)?.text || ""}`.toLowerCase().includes(q.toLowerCase()));
  const newN = chats.filter(isNew).length;
  const who = cur?.id.startsWith("u-") ? users.find((u) => u.id === Number(cur.id.slice(2))) : undefined;
  const theirs = who ? orders.filter((o) => (who.phone && o.phone === who.phone) || (who.email && o.email === who.email)) : [];
  const spent = theirs.filter((o) => o.status !== 5 && o.status >= 0).reduce((sum, o) => sum + o.total, 0);

  useEffect(() => {
    const box = document.querySelector(".adm .chat-msgs");
    if (box) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [cur?.id, cur?.msgs.length]);

  function send(text: string) {
    if (!cur || !text.trim()) return;
    dispatch(pushChat({ id: cur.id, name: cur.name, from: "agent", text: text.trim() }));
  }

  if (!chats.length) {
    return (
      <div className="chat-empty-state">
        <span className="chat-empty-ico"><TabMark id="chat" /></span>
        <h3>ইনবক্স একদম খালি</h3>
        <p>ক্রেতা সাইটের নিচের চ্যাট বাটন থেকে লিখলে এখানে সাথে সাথে চলে আসবে।</p>
      </div>
    );
  }

  return (
    <div className={`chat-desk chat-desk-3${who ? "" : " no-info"}`}>
      <div className="chat-list">
        <div className="chat-list-head">
          <div className="chat-list-title"><b>ইনবক্স</b>{newN ? <em>{bn(newN)} নতুন</em> : <small>সব পড়া</small>}</div>
          <div className="chat-find">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="নাম বা বার্তা খুঁজুন" />
          </div>
          <div className="chat-seg">
            <button type="button" className={only === "all" ? "on" : ""} onClick={() => setOnly("all")}>সব · {bn(chats.length)}</button>
            <button type="button" className={only === "new" ? "on" : ""} onClick={() => setOnly("new")}>নতুন · {bn(newN)}</button>
          </div>
        </div>
        <div className="chat-list-body">
          {list.map((c) => (
            <button key={c.id} type="button" className={`${c.id === cur?.id ? "on" : ""}${isNew(c) ? " unread" : ""}`} onClick={() => setId(c.id)}>
              <span className="chat-ava">{c.name.trim().slice(0, 1) || "গ"}{c.id.startsWith("u-") ? <i className="chat-dot" /> : null}</span>
              <span className="chat-li">
                <b><span>{c.name}</span><time>{c.msgs.at(-1)?.t ? timeAgo(c.msgs.at(-1)!.t) : ""}</time></b>
                <span className="author">{c.msgs.at(-1)?.from === "agent" ? "আপনি: " : ""}{c.msgs.at(-1)?.text}</span>
              </span>
            </button>
          ))}
          {!list.length ? <p className="chat-none">কিছু মেলেনি</p> : null}
        </div>
      </div>

      <div className="chat-thread">
        {cur ? (
          <div className="chat-top">
            <span className="chat-ava">{cur.name.trim().slice(0, 1) || "গ"}</span>
            <div><b>{cur.name}</b><small>{who ? <><i className="chat-dot inline" /> নিবন্ধিত ক্রেতা</> : "গেস্ট"} · {bn(cur.msgs.length)}টি বার্তা</small></div>
            {who?.phone ? <a className="chat-call" href={`tel:${who.phone}`} aria-label="কল করুন"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></svg></a> : null}
          </div>
        ) : null}
        <div className="chat-msgs">
          <p className="chat-day"><span>কথোপকথন শুরু</span></p>
          {(cur?.msgs || []).map((m, i) => (
            <div key={`${cur?.id}-${i}`} className={`chat-bub ${m.from}`} style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
              <div>{m.text}</div>
              {m.t ? <time>{clock(m.t)}{m.from === "agent" ? " · ✓✓" : ""}</time> : null}
            </div>
          ))}
        </div>
        {cur ? (
          <>
            <div className="chat-quick-row">
              {QUICK_REPLIES.map((t) => <button key={t} type="button" onClick={() => send(t)}>{t}</button>)}
            </div>
            <form className="chat-form" onSubmit={replyForm.handleSubmit(({ text }) => { send(text); replyForm.reset(); })}>
              <input {...replyForm.register("text")} placeholder={`${cur.name}-কে জবাব লিখুন...`} autoComplete="off" />
              <button className="send" type="submit" aria-label="পাঠান">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 12 20 4l-6 16-3-7z" /></svg>
              </button>
            </form>
          </>
        ) : null}
      </div>

      {who ? (
        <aside className="chat-info">
          <span className="chat-ava lg">{who.name.trim().slice(0, 1)}</span>
          <h4>{who.name}</h4>
          <p className="chat-info-sub">চলো ক্রেতা</p>
          <div className="chat-info-rows">
            {who.phone ? <p><i>মোবাইল</i><b>{who.phone}</b></p> : null}
            {who.email ? <p><i>ইমেইল</i><b>{who.email}</b></p> : null}
          </div>
          <div className="chat-info-kpis">
            <div><b>{bn(theirs.length)}</b><small>অর্ডার</small></div>
            <div><b>৳{bn(spent)}</b><small>মোট কেনা</small></div>
          </div>
          {theirs.length ? (
            <div className="chat-info-orders">
              <small>সাম্প্রতিক অর্ডার</small>
              {theirs.slice(0, 3).map((o) => (
                <p key={o.id}><b>{o.id}</b><span className={`st-pill ${o.status < 0 ? "hold" : o.status === 5 ? "bad" : o.status === 4 ? "done" : "live"}`}>{statusLabel(o.status)}</span></p>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
