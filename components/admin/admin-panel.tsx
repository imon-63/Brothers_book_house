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
import { bn, discount } from "@/lib/format";
import { stockShort, stockUnits } from "@/lib/orders/ledger";
import { applyOrderBooks } from "@/store/slices/books-slice";
import { setOrderStatus, markPaid } from "@/store/slices/order-slice";
import {
  addCoupon, addExtraCat, addPack, addProduct, deletePack, deleteProduct, hideCat, showCat, hideVertical, showVertical, holdStock, releaseStock,
  patchPack, patchProduct, pushChat, setPromo, setShip, setTicker, toggleCoupon,
  type ChatThread, type ExtraCat, type HiddenCat, type PromoSettings, type ShipSettings, type ShopCoupon, type ShopProduct,
} from "@/store/slices/shop-slice";
import { showToast } from "@/store/slices/ui-slice";
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

export function AdminPanel() {
  const vertical = useAppSelector((s) => s.ui.vertical);
  const shop = useAppSelector((s) => s.shop);
  const orders = useAppSelector((s) => s.orders.orders);
  const me = useAppSelector((s) => s.session.users.find((u) => u.id === s.session.userId) ?? null);
  const [tab, setTab] = useState<Tab>("books");
  const vname = vertical === "book" ? "বই" : vertical === "food" ? "ঘরের বাজার" : "গ্যাজেট";
  const prodLabel = vertical === "book" ? "বই" : vertical === "food" ? "পণ্য" : "গ্যাজেট";
  const pending = orders.filter((o) => o.status < 0).length;
  const waiting = shop.chats.filter((c) => c.msgs.at(-1)?.from === "user").length;
  const here = shop.products.filter((p) => p.vertical === vertical).length;
  const deals = shop.products.filter((p) => offerOf(p).on).length;
  const hiddenN = shop.hiddenCats.filter((h) => !h.sub).length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "books", label: prodLabel },
    { id: "settings", label: "সেটিংস", badge: hiddenN },
    { id: "cats", label: "ক্যাটাগরি" },
    { id: "packs", label: "প্যাকেজ" },
    { id: "orders", label: "অর্ডার", badge: pending },
    { id: "finance", label: "হিসাব" },
    { id: "chat", label: "চ্যাট", badge: waiting },
  ];

  return (
    <div className="wrap desk-page">
      <p className="crumb">হোম / <b>অ্যাডমিন</b></p>
      <section className="desk-hero">
        <div className="desk-copy">
          <p className="me-kicker">চলো ডেস্ক · {vname}</p>
          <h1>{me?.name || "অ্যাডমিন"}</h1>
          <p>পণ্য, ছাড়, অর্ডার আর হিসাব — এক জায়গা থেকে।</p>
        </div>
        <div className="desk-kpis">
          <article><b>{bn(pending)}</b><span>অপেক্ষমাণ</span></article>
          <article><b>{bn(here)}</b><span>{vname}</span></article>
          <article><b>{bn(deals)}</b><span>চলমান ছাড়</span></article>
          <article><b>{bn(waiting)}</b><span>নতুন চ্যাট</span></article>
        </div>
      </section>
      <div className="admin-shell">
        <aside className="admin-nav">
          <p className="admin-brand">মেনু</p>
          {tabs.map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
              <TabMark id={t.id} />
              <span>{t.label}</span>
              {t.badge ? <em>{bn(t.badge)}</em> : null}
            </button>
          ))}
        </aside>
        <div className="desk-body">
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
          <div><b>নতুন {label} যোগ</b><small>ফর্ম খুলতে ক্লিক করুন</small></div>
          <span className="acc-chev" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg></span>
        </button>
        <form className="acc-body" onSubmit={addForm.handleSubmit(add)}>
          <div className="form-grid">
            <div><label>নাম</label><input {...addForm.register("title")} /></div>
            <div><label>{vertical === "book" ? "লেখক" : "একক / ব্র্যান্ড"}</label><input {...addForm.register("author")} /></div>
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
            <div><label>কেনা দাম</label><input {...addForm.register("cost")} type="number" min="1" placeholder="ক্রয়মূল্য" /></div>
            <div><label>পুরনো দাম</label><input {...addForm.register("old")} type="number" /></div>
            <div><label>নতুন দাম</label><input {...addForm.register("price")} type="number" /></div>
            <div><label>আসল কপি</label><input {...addForm.register("stock")} type="number" min="0" placeholder="যেমন: ২৫" /></div>
            <div className="span-2"><label>বিবরণ</label><input {...addForm.register("desc")} /></div>
            <div className="span-2">
              <label className="tog" style={{ margin: 0 }}><input type="checkbox" {...addForm.register("free")} /><span><b>এই পণ্যের অর্ডারে ফ্রি ডেলিভারি</b><small>শুধু এই পণ্য থাকলে কুরিয়ার ৳০</small></span></label>
            </div>
            <div className="span-2">
              <label>কভার ছবি</label>
              <div className="img-pick">
                {preview ? <img className="img-preview" src={preview} alt="" /> : <div className="img-preview empty-prev">ছবি নেই</div>}
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, setPreview); }} />
              </div>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} type="submit">যোগ করুন</button>
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
        <div className="pager">
          <div className="pager-info">পৃষ্ঠা <b>{bn(cur)}</b> / {bn(pages)}</div>
          <div className="pager-btns">
            <button type="button" className="pg" disabled={cur === 1} onClick={() => setPage(cur - 1)}>‹</button>
            <button type="button" className="pg on">{bn(cur)}</button>
            <button type="button" className="pg" disabled={cur === pages} onClick={() => setPage(cur + 1)}>›</button>
          </div>
        </div>
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
      {menu === "cats" ? <section className="set-block">
        <div className="set-mains">
          {SET_COLS.map((col) => {
            const off = hiddenVerts.includes(col.id);
            return (
              <button key={col.id} type="button" className={`set-main${off ? " off" : ""}`} onClick={() => flipVert(col.id, off)}>
                <VerticalIcon id={col.id} />
                <b>{col.name}</b>
                <i>{off ? "লুকানো" : "দেখাচ্ছে"}</i>
              </button>
            );
          })}
        </div>
        <div className="set-cols">
          {SET_COLS.map((col) => {
            const cats = catTree(col.id, products, extra, []);
            return (
              <article className="set-col" key={col.id}>
                <h4>{col.name}<small>{col.note}</small></h4>
                {cats.map((c) => {
                  const off = hiddenMain(hidden, col.id, c.name);
                  const n = products.filter((p) => p.vertical === col.id && p.cat === c.name).length;
                  return (
                    <button key={c.name} type="button" className={`set-row${off ? " off" : ""}`} onClick={() => flip(col.id, c.name, off)}>
                      <span><b>{c.name}</b><small>{bn(n)}টি পণ্য</small></span>
                      <i>{off ? "লুকানো" : "দেখাচ্ছে"}</i>
                    </button>
                  );
                })}
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
    <>
      <div className="box" style={{ marginBottom: 16 }}>
        <h3 className="serif">টপবারের স্ক্রলিং টেক্সট</h3>
        <form onSubmit={form.handleSubmit(({ text }) => {
          if (!text.trim()) { dispatch(showToast("টেক্সট লিখুন")); return; }
          dispatch(setTicker([...ticker, text.trim()]));
          form.reset();
          dispatch(showToast("টপবারে যোগ হয়েছে"));
        })}>
          <label>নতুন লাইন</label>
          <input {...form.register("text")} placeholder="যেমন: ঈদে ফ্রি ডেলিভারি" />
          <button className="btn btn-primary" style={{ marginTop: 12 }} type="submit">যোগ করুন</button>
        </form>
        <p className="author" style={{ marginTop: 8 }}>একাধিক লাইন যোগ করলে ন্যাভবারের উপরে সবগুলো ঘুরে ঘুরে চলবে।</p>
      </div>
      {ticker.length ? (
        <table><tbody>
          <tr><th>টেক্সট</th><th></th></tr>
          {ticker.map((t, i) => (
            <tr key={`${t}-${i}`}>
              <td><input value={t} onChange={(e) => { const next = [...ticker]; next[i] = e.target.value; dispatch(setTicker(next)); }} /></td>
              <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch(setTicker(ticker.filter((_, n) => n !== i)))}>সরান</button></td>
            </tr>
          ))}
        </tbody></table>
      ) : <div className="empty">এখনো কোনো টেক্সট নেই</div>}
    </>
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

  function add(data: { title: string; price: string; old: string; free: boolean }) {
    const title = data.title.trim();
    const price = Number(data.price || 0);
    if (!title || !price || picked.length < 2) { dispatch(showToast("নাম, দাম আর কমপক্ষে ২টি বই দিন")); return; }
    dispatch(addPack({
      id: Date.now(), title, price, old: Number(data.old || 0),
      bookIds: picked, desc: "প্যাকেজ অফার।", vertical: "book", freeShip: data.free,
    }));
    setPicked([]);
    packForm.reset();
    dispatch(showToast("প্যাকেজ যোগ হয়েছে"));
  }

  return (
    <>
      <form className="box" style={{ marginBottom: 16 }} onSubmit={packForm.handleSubmit(add)}>
        <h3 className="serif">নতুন প্যাকেজ · বইয়ের স্ট্যাক</h3>
        <label>প্যাকেজ নাম</label><input {...packForm.register("title")} placeholder="যেমন: এসএসসি প্যাকেজ" />
        <div className="form-grid">
          <div><label>নতুন দাম</label><input {...packForm.register("price")} type="number" min="1" /></div>
          <div><label>পুরনো দাম</label><input {...packForm.register("old")} type="number" min="0" /></div>
        </div>
        <label>বই বেছে নিন (কমপক্ষে ২টি)</label>
        <input type="search" placeholder="বই খুঁজুন..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pk-pick">
          {shown.map((b) => (
            <label className="pk-row" key={b.id}>
              <input type="checkbox" checked={picked.includes(b.id)} onChange={() => setPicked((ids) => ids.includes(b.id) ? ids.filter((x) => x !== b.id) : [...ids, b.id])} />
              <span>{b.title}<small>{b.author} · {b.cat}</small></span>
            </label>
          ))}
        </div>
        <p className="pk-meta">{bn(picked.length)}টি বই বেছে নিয়েছেন</p>
        <label className="tog"><input type="checkbox" {...packForm.register("free")} /><span><b>এই প্যাকেজে ফ্রি ডেলিভারি</b></span></label>
        <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }}>প্যাকেজ যোগ</button>
      </form>
      <div className="grid-3">
        {packs.map((p) => (
          <div className="box" key={p.id}>
            <b>{p.title}</b>
            <div className="author">{bn(p.bookIds.length)}টি বই · ৳{bn(p.price)}</div>
            <label className="tog"><input type="checkbox" checked={!!p.freeShip} onChange={(e) => dispatch(patchPack({ id: p.id, patch: { freeShip: e.target.checked } }))} /><span><b>ফ্রি ডেলিভারি</b></span></label>
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => dispatch(deletePack(p.id))}>মুছুন</button>
          </div>
        ))}
      </div>
    </>
  );
}

function CouponsTab() {
  const dispatch = useAppDispatch();
  const coupons = useAppSelector((s) => s.shop.coupons);
  const form = useForm({ defaultValues: { code: "", off: "", type: "pct" } });
  function add(data: { code: string; off: string; type: string }) {
    const code = data.code.trim().toUpperCase();
    const off = Number(data.off || 0);
    if (!code || !off) { dispatch(showToast("কোড ও মান দিন")); return; }
    dispatch(addCoupon({ code, off, type: data.type === "tk" ? "tk" : "pct", active: true }));
    form.reset();
    dispatch(showToast("কুপন যোগ হয়েছে"));
  }
  return (
    <>
      <form className="box" style={{ marginBottom: 16 }} onSubmit={form.handleSubmit(add)}>
        <h3 className="serif">কুপন</h3>
        <div className="form-grid">
          <div><label>কোড</label><input {...form.register("code")} placeholder="EID20" /></div>
          <div><label>ধরন</label><select {...form.register("type")}><option value="pct">শতাংশ</option><option value="tk">টাকা</option></select></div>
          <div><label>মান</label><input {...form.register("off")} type="number" /></div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} type="submit">কুপন যোগ</button>
      </form>
      <div className="cpn-list">
        <div className="cpn-head"><span>কোড</span><span>ছাড়</span><span>স্ট্যাটাস</span></div>
        {coupons.map((c: ShopCoupon) => (
          <div className="cpn-row" key={c.code}>
            <b>{c.code}</b>
            <span>{c.type === "pct" ? `${c.off}%` : `৳${bn(c.off)}`}</span>
            <span><button type="button" className={`btn btn-sm ${c.active ? "btn-primary" : "btn-ghost"}`} onClick={() => dispatch(toggleCoupon(c.code))}>{c.active ? "চালু" : "বন্ধ"}</button></span>
          </div>
        ))}
      </div>
    </>
  );
}

function PromoTab() {
  const dispatch = useAppDispatch();
  const promo = useAppSelector((s) => s.shop.promo);
  const [draft, setDraft] = useState<PromoSettings>(promo);
  return (
    <div className="box">
      <h3 className="serif">প্রথম ভিজিটের অফার মডাল</h3>
      <label><input type="checkbox" checked={draft.on} onChange={(e) => setDraft({ ...draft, on: e.target.checked })} /> চালু</label>
      <label>শিরোনাম</label><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
      <label>টেক্সট</label><input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} />
      <label>কুপন কোড</label><input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
      <label>ছবি</label><input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f, (url) => setDraft({ ...draft, image: url })); }} />
      {draft.image ? <div className="promo-preview"><img src={draft.image} alt="অফার ছবি" /><button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, image: "" })}>ছবি সরান</button></div> : <p className="author">পুরো ছবি দেখাবে।</p>}
      <div className="save-row">
        <button type="button" className="btn btn-primary" onClick={() => { dispatch(setPromo(draft)); dispatch(showToast("অফার সেভ হয়েছে")); }}>সেভ করুন</button>
        <button type="button" className="btn btn-ghost" onClick={() => { sessionStorage.removeItem("cholo_promo_seen"); dispatch(showToast("পরের রিফ্রেশে মডাল আবার দেখাবে")); }}>টেস্ট: আবার দেখাও</button>
      </div>
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

function OrdersTab() {
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.orders.orders);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pay, setPay] = useState("all");
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
  }), [orders, q, status, range, pay, from, to]);
  const chip = (cur: string, id: string, label: string, set: (v: string) => void, tone = "") => (
    <button type="button" className={`ofilt${cur === id ? ` on${tone ? ` ${tone}` : ""}` : ""}`} onClick={() => set(id)}>{label}</button>
  );
  const detail = orders.find((o) => o.id === open);
  const products = useAppSelector((s) => s.shop.products);

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
            <tr><th>অর্ডার</th><th>তারিখ</th><th>যোগাযোগ</th><th>মোট</th><th>অ্যাকশন</th></tr>
            {filtered.map((o) => (
              <tr key={o.id} onClick={() => setOpen(o.id)}>
                <td><b>{o.id}</b><div className="author">{o.items}</div></td>
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
      {detail ? (
        <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setOpen(null); }}>
          <div className="box" style={{ maxWidth: 520, margin: "10vh auto" }}>
            <button type="button" className="x" onClick={() => setOpen(null)}>×</button>
            <h3 className="serif">{detail.id}</h3>
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

function ChatTab() {
  const dispatch = useAppDispatch();
  const chats = useAppSelector((s) => s.shop.chats);
  const [id, setId] = useState(chats[0]?.id || "");
  const replyForm = useForm({ defaultValues: { text: "" } });
  const cur: ChatThread | undefined = chats.find((c) => c.id === id) || chats[0];
  if (!chats.length) return <div className="empty">এখনো কোনো চ্যাট নেই। ইউজার নিচের চ্যাট বাটন থেকে লিখলে এখানে আসবে।</div>;
  return (
    <>
      <div className="chat-desk">
        <div className="chat-list">
          {chats.map((c) => (
            <button key={c.id} type="button" className={c.id === cur?.id ? "on" : ""} onClick={() => setId(c.id)}>
              <b>{c.name}{c.msgs.at(-1)?.from === "user" ? " · নতুন" : ""}</b>
              <span className="author">{c.msgs.at(-1)?.text.slice(0, 42)}</span>
            </button>
          ))}
        </div>
        <div className="chat-thread">
          <div className="chat-msgs">
            {(cur?.msgs || []).map((m, i) => <div key={i} className={`chat-bub ${m.from}`}><div>{m.text}</div></div>)}
          </div>
          {cur ? (
            <form className="chat-form" onSubmit={replyForm.handleSubmit(({ text }) => {
              if (!text.trim()) return;
              dispatch(pushChat({ id: cur.id, name: cur.name, from: "agent", text: text.trim() }));
              replyForm.reset();
            })}>
              <input {...replyForm.register("text")} placeholder={`${cur.name}-কে জবাব লিখুন...`} />
              <button className="send" type="submit" aria-label="পাঠান">›</button>
            </form>
          ) : null}
        </div>
      </div>
      <p className="author" style={{ marginTop: 10 }}>ইউজার সাইটের নিচের চ্যাট থেকে লিখবে। এখান থেকে সরাসরি জবাব দিন।</p>
    </>
  );
}
