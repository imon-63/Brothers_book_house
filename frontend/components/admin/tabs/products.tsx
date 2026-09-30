"use client";

import "./products.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { BnDateField } from "@/components/ui/bangla-calendar";
import { fmtShipDt } from "@/lib/calendar";
import { bn, discount } from "@/lib/format";
import { DAY } from "@/lib/admin/insights";
import { useAdminSection } from "@/lib/admin/section-context";
import { adminErrorText, ms, useToast } from "@/lib/api/admin/core";
import { useAdminPrefs, useSetAdminPrefs } from "@/lib/api/admin/prefs";
import { useCategoryTree } from "@/lib/api/admin/sections";
import {
  exportProducts, uploadMedia, useAdjustStock, useAdminProduct, useAdminProducts, useBulkProducts, useCancelDeal, useCreateDeal, useCreateProduct,
  useDeleteProducts, useDuplicateProduct, usePatchProduct, useProductSummary, useStockMovements, useUploadProductImage,
  type AdminProductRow, type ProductPatch,
} from "@/lib/api/admin/products";
import { COLORS, readFile, Pager } from "@/components/admin/shared";
import { useAdminNav } from "@/components/admin/nav";
import {
  Badge, Columns, Drawer, Empty, Ico, Modal, PageHead, SearchInput, Segmented, Stat, StatusPill, Toggle,
  dateOnly, downloadCsv, num, tk, useSelection,
} from "@/components/admin/ui";

/* ───────── types & helpers ───────── */

type Quick = "all" | "low" | "out" | "deal" | "nocost" | "free" | "hidden";
type SortKey = "name" | "price" | "stock" | "sold" | "margin" | "new";
type View = "table" | "grid";
type BulkKind = null | "price" | "discount" | "restock" | "move";
type Cat = { id: string; name: string; hidden: boolean; count: number; subs: { id: string; name: string; hidden: boolean; count: number }[] };

/** API row → the shape this screen was designed around. */
type ShopProduct = {
  id: string; title: string; author: string; price: number; old: number; cost: number; sold: number; color: string;
  cat: string; catId: string; sub?: string; subId?: string; desc: string; vertical: string; stock: number; copies: number;
  freeShip: boolean; image?: string; deal?: { id: string; price: number; until: string }; version: number; hidden: boolean;
};
function toLocalDt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function toShop(r: AdminProductRow): ShopProduct {
  return {
    id: r.id, title: r.title, author: r.authorLine ?? r.subtitle ?? "", price: r.regularPrice, old: r.storedCompareAt ?? 0, cost: r.costPrice ?? 0,
    sold: r.soldCount, color: r.cover.color || "#7A2430", cat: r.category?.name ?? "", catId: r.category?.id ?? "", sub: r.subcategory?.name ?? undefined,
    subId: r.subcategory?.id ?? undefined, desc: "", vertical: r.section.code, stock: r.stock.onHand, copies: Math.max(r.stock.initialCopies, r.stock.onHand),
    freeShip: r.freeShipping, image: r.cover.url ?? undefined, deal: r.deal ? { id: r.deal.id, price: r.deal.dealPrice, until: toLocalDt(r.deal.endsAt) } : undefined,
    version: r.version, hidden: r.categoryHidden,
  };
}
function offerOf(p: Pick<ShopProduct, "price" | "old" | "deal">, now = Date.now()) {
  const until = p.deal?.until ? Date.parse(p.deal.until) : NaN;
  const live = Boolean(p.deal && p.deal.price > 0 && p.deal.price < p.price && until > now);
  if (live && p.deal) return { price: p.deal.price, old: p.price, until: p.deal.until, on: true };
  return { price: p.price, old: p.old, until: "", on: false };
}

const QUICK: { id: Quick; label: string; en: string }[] = [
  { id: "all", label: "সব", en: "All" },
  { id: "low", label: "কম স্টক", en: "Low" },
  { id: "out", label: "স্টক আউট", en: "Out" },
  { id: "deal", label: "ছাড় চলছে", en: "Deal" },
  { id: "nocost", label: "কেনা দাম নেই", en: "No cost" },
  { id: "free", label: "ফ্রি ডেলিভারি", en: "Free ship" },
  { id: "hidden", label: "লুকানো ক্যাটাগরি", en: "Hidden" },
];
const SORTS: { id: SortKey; label: string }[] = [
  { id: "name", label: "নাম" },
  { id: "price", label: "দাম" },
  { id: "stock", label: "স্টক" },
  { id: "sold", label: "বিক্রি" },
  { id: "margin", label: "মার্জিন" },
  { id: "new", label: "নতুন" },
];

/** A finite number or 0 — never NaN on screen. */
function n0(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function marginOf(price: number, cost: number | undefined): number | null {
  const c = n0(cost);
  if (!(price > 0) || !(c > 0)) return null;
  return Math.round(((price - c) / price) * 100);
}
function marginTone(m: number | null) {
  if (m == null) return "none";
  if (m >= 25) return "good";
  if (m >= 10) return "mid";
  return "bad";
}
const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
const oldFromDiscount = (price: number, d: number) => (d > 0 && d < 100 ? Math.round(price / (1 - d / 100)) : 0);

const dots = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
);
const imgIco = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
);

/** Number input that commits on blur / Enter (each commit is one PATCH). */
function NumCell({ value, onCommit, className = "pr-in", placeholder, min = 0, max, label, title }: {
  value: number; onCommit: (n: number) => void; className?: string; placeholder?: string; min?: number; max?: number; label?: string; title?: string;
}) {
  const [v, setV] = useState(value ? String(value) : "");
  useEffect(() => { setV(value ? String(value) : ""); }, [value]);
  const commit = () => { const n = n0(v); if (n !== n0(value)) onCommit(n); };
  return (
    <input className={className} type="number" min={min} max={max} value={v} placeholder={placeholder} aria-label={label} title={title}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setV(value ? String(value) : ""); }} />
  );
}

function Cover({ p, className = "" }: { p: ShopProduct; className?: string }) {
  return p.image
    ? <span className={`pr-cover ${className}`}><img src={p.image} alt="" /></span>
    : <span className={`pr-cover ${className}`} style={{ background: p.color }}><em>{p.title}</em></span>;
}

function StockBar({ p, low }: { p: ShopProduct; low: number }) {
  const cap = Math.max(n0(p.copies), n0(p.stock), 1);
  const pct = Math.max(0, Math.min(100, (n0(p.stock) / cap) * 100));
  const tone = p.stock <= 0 ? "out" : p.stock <= low ? "low" : "ok";
  return <span className={`pr-level ${tone}`} title={`${bn(p.stock)} / ${bn(cap)}`}><i style={{ width: `${pct}%` }} /></span>;
}

function MarginPill({ m }: { m: number | null }) {
  return <span className={`pr-margin ${marginTone(m)}`}>{m == null ? "—" : `${bn(m)}%`}</span>;
}

/** Row menu with fixed positioning so it never gets clipped by the scrolling table. */
function RowMenu({ children, label = "আরও" }: { children: (close: () => void) => ReactNode; label?: string }) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const off = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setPos(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPos(null); };
    const gone = () => setPos(null);
    document.addEventListener("mousedown", off);
    window.addEventListener("keydown", key);
    window.addEventListener("resize", gone);
    window.addEventListener("scroll", gone, true);
    return () => {
      document.removeEventListener("mousedown", off);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", gone);
      window.removeEventListener("scroll", gone, true);
    };
  }, [pos]);
  function toggle() {
    if (pos || !btn.current) { setPos(null); return; }
    const r = btn.current.getBoundingClientRect();
    const up = r.bottom + 300 > window.innerHeight && r.top > 300;
    setPos(up ? { bottom: window.innerHeight - r.top + 6, right: Math.max(8, window.innerWidth - r.right) } : { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  }
  return (
    <>
      <button ref={btn} type="button" className={`ap-icon-btn sm pr-more${pos ? " on" : ""}`} aria-label={label} aria-haspopup="menu" aria-expanded={!!pos} onClick={toggle}>{dots}</button>
      {pos ? (
        <div ref={pop} role="menu" className="ap-menu-pop pr-pop" style={{ top: pos.top, bottom: pos.bottom, right: pos.right }}>
          {children(() => setPos(null))}
        </div>
      ) : null}
    </>
  );
}

/* ───────── screen ───────── */

export function ProductsTab() {
  const toast = useToast();
  const { focus, go, clearFocus } = useAdminNav();
  const { code: vertical, section } = useAdminSection();
  const prefs = useAdminPrefs();
  const savePrefs = useSetAdminPrefs();
  const low = Math.max(0, n0(prefs.lowStock));
  const treeQ = useCategoryTree(section?.id);
  const cats: Cat[] = useMemo(() => (treeQ.data?.categories ?? []).map((c) => ({
    id: c.id, name: c.name, hidden: !c.isVisible, count: c.productCount + c.children.reduce((s2, x) => s2 + x.productCount, 0),
    subs: c.children.map((x) => ({ id: x.id, name: x.name, hidden: !x.isVisible, count: x.productCount })),
  })), [treeQ.data]);
  const hiddenNames = new Set(cats.filter((c) => c.hidden).map((c) => c.name));

  /* list state */
  const [view, setView] = useState<View>("table");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [quick, setQuick] = useState<Quick>("all");
  const [cat, setCat] = useState("");
  const [sub, setSub] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("new");
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [dealId, setDealId] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [bulk, setBulk] = useState<BulkKind>(null);
  const sel = useSelection<string>();
  const [known, setKnown] = useState<Map<string, ShopProduct>>(new Map());

  /* add studio state */
  const [open, setOpen] = useState(false);
  const [npCat, setNpCat] = useState("");
  const [npSub, setNpSub] = useState("");
  const [preview, setPreview] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOn, setDragOn] = useState(false);
  const studioRef = useRef<HTMLDivElement>(null);
  const addForm = useForm({ defaultValues: { title: "", author: "", cost: "", old: "", price: "", stock: "", desc: "", free: false } });
  const npLive = addForm.watch();
  const npCost = n0(npLive.cost || 0);
  const npPrice = n0(npLive.price || 0);
  const npOld = n0(npLive.old || 0);
  const npStock = n0(npLive.stock || 0);
  const npOff = discount(npPrice, npOld);
  const npProfit = npPrice - npCost;
  const npMargin = npPrice > 0 && npCost > 0 ? Math.round((npProfit / npPrice) * 100) : 0;
  const labelOf = vertical === "book" ? "বইয়ের" : "পণ্যের";
  const npReady = Boolean(npLive.title?.trim()) && npPrice > 0 && npCost > 0 && npLive.stock !== "" && !!npCat;
  const npSubs = cats.find((c) => c.id === npCat)?.subs ?? [];
  const label = vertical === "book" ? "বই" : "পণ্য";
  const whoLabel = vertical === "book" ? "লেখক" : "ব্র্যান্ড";

  useEffect(() => {
    setCat("");
    setSub("");
    setPage(1);
    setNpSub("");
    sel.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vertical]);
  useEffect(() => { if (!cats.some((c) => c.id === npCat)) setNpCat(cats[0]?.id || ""); }, [cats, npCat]);
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [term, quick, cat, sub, sortKey, desc, size]);

  const openStudio = useCallback(() => {
    setOpen(true);
    window.setTimeout(() => studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, []);

  /* deep links from dashboard / command palette */
  useEffect(() => {
    if (!focus) return;
    if (focus === "new") openStudio();
    else if (focus === "stock:low") setQuick("low");
    else if (focus === "stock:out") setQuick("out");
    else if (focus === "deal") setQuick("deal");
    else if (/^[0-9a-f-]{36}$/i.test(focus)) setDrawerId(focus);
    clearFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  /* server data */
  const listQ = useAdminProducts({
    section: vertical, q: term || undefined, category: cat || undefined, subcategory: sub || undefined, quick, lowStock: low,
    sort: sortKey, order: desc ? "desc" : "asc",
  }, page, size);
  const sumQ = useProductSummary({ section: vertical, lowStock: low });
  const slice = useMemo(() => (listQ.data?.items ?? []).map(toShop), [listQ.data]);
  useEffect(() => {
    if (!slice.length) return;
    setKnown((m) => { const n = new Map(m); slice.forEach((x) => n.set(x.id, x)); return n; });
  }, [slice]);
  const total = listQ.data?.total ?? 0;
  const soldOf = useCallback((p: ShopProduct) => n0(p.sold), []);

  const patchM = usePatchProduct();
  const adjustM = useAdjustStock();
  const createM = useCreateProduct();
  const dupM = useDuplicateProduct();
  const delM = useDeleteProducts();
  const bulkM = useBulkProducts();
  const imgM = useUploadProductImage();

  const isLow = (p: ShopProduct) => p.stock > 0 && p.stock <= low;
  const noCost = (p: ShopProduct) => !(n0(p.cost) > 0);
  const counts = sumQ.data?.counts;
  const kpi = {
    value: sumQ.data?.stockValue ?? 0, retail: sumQ.data?.retailValue ?? 0, units: sumQ.data?.units ?? 0,
    lowN: counts?.low ?? 0, outN: counts?.out ?? 0, dealN: counts?.deal ?? 0, missing: counts?.nocost ?? 0, freeN: counts?.free ?? 0, hiddenN: counts?.hidden ?? 0,
  };
  const allCount = counts?.all ?? 0;
  const quickCount: Record<Quick, number> = {
    all: allCount, low: kpi.lowN, out: kpi.outN, deal: kpi.dealN, nocost: kpi.missing, free: kpi.freeN, hidden: kpi.hiddenN,
  };

  const needle = term.toLowerCase();
  const pages = Math.max(1, listQ.data?.pages ?? 1);
  const cur = Math.min(page, pages);
  const subs = cats.find((c) => c.id === cat)?.subs ?? [];
  const pageIds = slice.map((p) => p.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const selected = [...sel.sel].map((id) => known.get(id)).filter((x): x is ShopProduct => !!x);

  function patch(p: ShopProduct, body: ProductPatch, msg?: string) {
    patchM.mutate({ id: p.id, version: p.version, body, toast: msg ?? null });
  }
  function setStock(p: ShopProduct, onHand: number, reason: string, msg?: string) {
    adjustM.mutate({ id: p.id, onHand: Math.max(0, Math.floor(onHand)), reason, toast: msg });
  }

  async function add(data: { title: string; author: string; cost: string; old: string; price: string; stock: string; desc: string; free: boolean }) {
    const title = data.title.trim();
    const price = n0(data.price || 0);
    const cost = n0(data.cost || 0);
    if (!title || !price) { toast("নাম ও নতুন দাম দিন"); return; }
    if (!(cost > 0)) { toast("কেনা দাম দিন — নাহলে লাভের হিসাব বন্ধ থাকে"); return; }
    if (data.stock === "") { toast("আসল কপি সংখ্যা দিন"); return; }
    if (!npCat) { toast("আগে একটি ক্যাটাগরি বানান"); return; }
    const copies = Math.max(0, parseInt(String(data.stock), 10) || 0);
    let imageIds: string[] | undefined;
    if (file) {
      // the image is optional — if the upload fails, still create the product and say so
      try { imageIds = [(await uploadMedia(file, title)).id]; } catch (e) { toast(`ছবি আপলোড হয়নি (${adminErrorText(e)}) · ছবি ছাড়াই যোগ হচ্ছে`); }
    }
    createM.mutate({
      categoryId: npCat, subcategoryId: npSub || null, title, subtitle: data.author.trim() || null, price,
      compareAtPrice: n0(data.old || 0) || null, costPrice: cost, initialCopies: copies, description: data.desc.trim() || "নতুন সংযোজন।",
      freeShipping: data.free, coverColor: COLORS[total % COLORS.length], imageIds, toast: `${label} যোগ হয়েছে · সাইটে দেখা যাচ্ছে`,
    }, {
      onSuccess: () => { addForm.reset(); setPreview(""); setFile(null); setOpen(false); },
    });
  }

  function duplicate(p: ShopProduct) {
    dupM.mutate({ id: p.id }, { onSuccess: (d) => setDrawerId(d.id) });
  }

  function toggleStock(p: ShopProduct) {
    if (p.stock > 0) setStock(p, 0, "স্টক আউট করা হলো (অ্যাডমিন)", "স্টক আউট করা হলো");
    else setStock(p, p.copies || 12, "আবার স্টকে (অ্যাডমিন)", "স্টকে ফিরেছে");
  }

  function csvRows(rows: ShopProduct[]) {
    return [
      ["ID", "Title", vertical === "book" ? "Author" : "Brand", "Category", "Sub", "Cost", "Old", "Price", "Discount %", "Deal price", "Deal until", "Stock", "Copies", "Sold", "Stock value", "Free ship"],
      ...rows.map((p) => [
        p.id, p.title, p.author, p.cat, p.sub || "", n0(p.cost), n0(p.old), n0(p.price), discount(p.price, p.old),
        offerOf(p).on ? n0(p.deal?.price) : "", offerOf(p).on ? p.deal?.until || "" : "",
        n0(p.stock), n0(p.copies ?? p.stock), soldOf(p), Math.max(0, p.stock) * n0(p.cost), p.freeShip ? "yes" : "no",
      ]),
    ];
  }
  function exportAll() {
    exportProducts({ section: vertical }).then(() => toast(`${num(allCount)}টি পণ্য CSV তে নামানো হলো`)).catch((e) => toast(adminErrorText(e)));
  }

  function doDelete(ids: string[]) {
    delM.mutate({ ids }, {
      onSuccess: () => {
        sel.setAll(ids, false);
        if (drawerId && ids.includes(drawerId)) setDrawerId(null);
      },
    });
    setConfirmIds(null);
  }

  function bulkFree() {
    const on = !selected.every((p) => p.freeShip);
    bulkM.mutate({ kind: "free-shipping", ids: selected.map((p) => p.id), freeShipping: on, toast: on ? `${num(selected.length)}টিতে ফ্রি ডেলিভারি চালু` : `${num(selected.length)}টিতে ফ্রি ডেলিভারি বন্ধ` });
  }

  const setQuickSafe = (id: Quick) => setQuick((cur0) => (cur0 === id && id !== "all" ? "all" : id));
  const closeDrawer = useCallback(() => setDrawerId(null), []);
  const vName = section?.name ?? vertical;
  const filtered = quick !== "all" || !!cat || !!needle;
  const catName = cats.find((c) => c.id === cat)?.name ?? "";
  const subName = subs.find((x) => x.id === sub)?.name ?? "";
  const dealProduct = dealId ? known.get(dealId) ?? null : null;

  return (
    <div className="pr">
      <PageHead
        title="পণ্য"
        en="Products"
        sub={<>{vName} বিভাগ · দাম, স্টক, ছাড় · Inventory</>}
        actions={
          <>
            <Segmented<View> size="sm" value={view} onChange={setView} options={[
              { id: "table", label: <>টেবিল <small className="pr-en">Table</small></>, icon: Ico.list },
              { id: "grid", label: <>গ্রিড <small className="pr-en">Grid</small></>, icon: Ico.grid },
            ]} />
            <button type="button" className="ap-btn" onClick={exportAll} disabled={!allCount}>{Ico.download}CSV</button>
            <button type="button" className="ap-btn primary" onClick={openStudio}>{Ico.plus}নতুন {label}</button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="pr-kpis">
        <Stat label="মোট পণ্য" en="Products" tone="wine" icon={Ico.products} value={num(allCount)} hint={`${num(kpi.units)} ইউনিট স্টকে`} onClick={() => { setQuick("all"); setCat(""); setQ(""); }} />
        <Stat label="স্টক ভ্যালু" en="At cost" tone="gold" icon={Ico.cash} value={tk(kpi.value)} hint={`বিক্রয়মূল্যে ${tk(kpi.retail)}`} onClick={() => { setSortKey("stock"); setDesc(true); }} />
        <Stat label="কম স্টক" en={`≤ ${bn(low)}`} tone="gold" icon={Ico.alert} value={num(kpi.lowN)} hint={kpi.lowN ? "আবার অর্ডার দিন" : "সব ঠিক আছে"} onClick={() => setQuickSafe("low")} />
        <Stat label="স্টক আউট" en="Out of stock" tone="red" icon={Ico.box} value={num(kpi.outN)} hint={kpi.outN ? "সাইটে কেনা যাচ্ছে না" : "সব স্টকে আছে"} onClick={() => setQuickSafe("out")} />
        <Stat label="চলমান ছাড়" en="Live deals" tone="green" icon={Ico.clock} value={num(kpi.dealN)} hint="সময়ের ছাড় চলছে" onClick={() => setQuickSafe("deal")} />
        <Stat label="কেনা দাম নেই" en="Missing cost" tone="blue" icon={Ico.note} value={num(kpi.missing)} hint={kpi.missing ? "লাভের হিসাব বন্ধ" : "সব পূরণ"} onClick={() => setQuickSafe("nocost")} />
      </div>

      {/* add studio (legacy np-* styles live in globals.css) */}
      <div ref={studioRef} id="pr-studio" className={`acc admin-add pr-studio${open ? " on" : ""}`}>
        <button type="button" className="acc-head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
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
                  <select value={npCat} onChange={(e) => { setNpCat(e.target.value); setNpSub(""); }}>
                    {cats.length ? null : <option value="">— আগে ক্যাটাগরি বানান —</option>}
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div><label>সাব-ক্যাটাগরি</label>
                  <select value={npSub} onChange={(e) => setNpSub(e.target.value)}>
                    <option value="">—</option>
                    {npSubs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
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
                onDrop={(e) => { e.preventDefault(); setDragOn(false); const f = e.dataTransfer.files?.[0]; if (f && f.type.startsWith("image/")) { setFile(f); readFile(f, setPreview); } }}
              >
                <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); readFile(f, setPreview); } }} />
                {preview ? (
                  <>
                    <img src={preview} alt="" />
                    <span className="np-drop-txt"><b>ছবি বসেছে</b><small>বদলাতে আবার চাপুন বা নতুন ছবি টেনে আনুন</small></span>
                    <button type="button" className="pk-del" aria-label="ছবি সরান" onClick={(e) => { e.preventDefault(); setPreview(""); setFile(null); }}>
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
              <div className="np-card-art" style={{ background: preview ? undefined : COLORS[total % COLORS.length] }}>
                {preview ? <img src={preview} alt="" /> : <em>{npLive.title?.trim() || `${labelOf} নাম`}</em>}
              </div>
              <div className="np-card-body">
                <small className="np-card-cat">{cats.find((c) => c.id === npCat)?.name ?? ""}{npSub ? ` · ${npSubs.find((x) => x.id === npSub)?.name ?? ""}` : ""}</small>
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
            <button className="btn btn-primary btn-wide np-submit" type="submit" disabled={!npReady || createM.isPending}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 5v14M5 12h14" /></svg>
              {label} যোগ করুন
            </button>
            <button className="btn btn-ghost btn-sm np-reset" type="button" onClick={() => { addForm.reset(); setPreview(""); setFile(null); }}>ফর্ম খালি করুন</button>
          </aside>
        </form>
      </div>

      {kpi.missing ? (
        <div className="pr-warn" role="status">
          <span className="pr-warn-ico">{Ico.alert}</span>
          <p><b>{bn(kpi.missing)}টিতে কেনা দাম খালি।</b> লাভের হিসাব ততক্ষণ বন্ধ। <small>Missing cost price</small></p>
          <button type="button" className="ap-btn sm" onClick={() => setQuick("nocost")}>দেখুন</button>
        </div>
      ) : null}

      {/* toolbar */}
      <section className="ap-card pr-filters">
        <div className="pr-tb-row">
          <SearchInput value={q} onChange={setQ} placeholder={`নাম, ${whoLabel}, ক্যাটাগরি খুঁজুন · Search`} />
          <div className="pr-sort">
            <span className="pr-lab">সাজান</span>
            <select value={sortKey} onChange={(e) => { const k = e.target.value as SortKey; setSortKey(k); setDesc(k !== "name"); }} aria-label="সাজান">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button type="button" className="ap-icon-btn sm" aria-label={desc ? "বড় থেকে ছোট" : "ছোট থেকে বড়"} title={desc ? "বড় → ছোট" : "ছোট → বড়"} onClick={() => setDesc((d) => !d)}>
              {desc ? Ico.down : Ico.up}
            </button>
          </div>
          <div className="pr-thresh" title="এই সংখ্যা বা তার কম হলে কম স্টক ধরা হবে">
            <span className="pr-lab">কম স্টক সীমা <small>Threshold</small></span>
            <button type="button" aria-label="কমান" onClick={() => savePrefs.mutate({ lowStock: Math.max(0, low - 1) })}>−</button>
            <b>≤ {bn(low)}</b>
            <button type="button" aria-label="বাড়ান" onClick={() => savePrefs.mutate({ lowStock: Math.min(999, low + 1) })}>+</button>
          </div>
          <div className="pr-size">
            <span className="pr-lab">প্রতি পৃষ্ঠায়</span>
            <select value={size} onChange={(e) => setSize(n0(e.target.value) || 25)} aria-label="প্রতি পৃষ্ঠায়">
              {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{bn(n)}</option>)}
            </select>
          </div>
        </div>
        <div className="pr-chips" role="group" aria-label="দ্রুত ফিল্টার">
          {QUICK.map((f) => (
            <button key={f.id} type="button" className={`ap-chip pr-q q-${f.id}${quick === f.id ? " on" : ""}`} aria-pressed={quick === f.id} onClick={() => setQuick(f.id)}>
              {f.label}<em>{bn(quickCount[f.id])}</em>
            </button>
          ))}
        </div>
        <div className="pr-cats">
          <span className="pr-lab">ক্যাটাগরি</span>
          <div className="pr-chips">
            <button type="button" className={`ap-chip${!cat ? " on" : ""}`} onClick={() => { setCat(""); setSub(""); }}>সব<em>{bn(allCount)}</em></button>
            {cats.map((c) => (
              <button key={c.id} type="button" className={`ap-chip${cat === c.id ? " on" : ""}${c.hidden ? " hid" : ""}`} onClick={() => { setCat(c.id); setSub(""); }}>
                {c.name}{c.hidden ? <i className="pr-hid">লুকানো</i> : null}<em>{bn(c.count)}</em>
              </button>
            ))}
          </div>
        </div>
        {cat && subs.length ? (
          <div className="pr-cats sub">
            <span className="pr-lab">সাব</span>
            <div className="pr-chips">
              <button type="button" className={`ap-chip${!sub ? " on" : ""}`} onClick={() => setSub("")}>সব</button>
              {subs.map((x) => (
                <button key={x.id} type="button" className={`ap-chip${sub === x.id ? " on" : ""}`} onClick={() => setSub(x.id)}>
                  {x.name}<em>{bn(x.count)}</em>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* list */}
      <section className="ap-card flush pr-list">
        <header className="ap-card-head pr-list-head">
          <div>
            <h3>{cat ? (sub ? `${catName} · ${subName}` : catName) : `সব ${label}`}<span>{view === "table" ? "Table" : "Grid"}</span></h3>
            <p>{bn(slice.length ? (cur - 1) * size + 1 : 0)}–{bn((cur - 1) * size + slice.length)} / {bn(total)}টি{quick !== "all" ? ` · ${QUICK.find((f) => f.id === quick)?.label}` : ""}</p>
          </div>
          <div className="ap-card-acts">
            {filtered ? <button type="button" className="ap-btn sm ghost" onClick={() => { setQuick("all"); setCat(""); setSub(""); setQ(""); }}>{Ico.close}ফিল্টার মুছুন</button> : null}
            {view === "grid" && slice.length ? (
              <label className="pr-selall"><input type="checkbox" className="ap-check" checked={allOnPage} onChange={(e) => sel.setAll(pageIds, e.target.checked)} />এই পৃষ্ঠা বাছুন</label>
            ) : null}
          </div>
        </header>

        {!slice.length ? (
          <Empty
            icon={needle ? Ico.search : Ico.box}
            title={listQ.isLoading ? "লোড হচ্ছে…" : allCount ? "কিছু মেলেনি" : `এখনো কোনো ${label} নেই`}
            sub={allCount ? "অন্য শব্দে খুঁজুন বা ফিল্টার বদলান · No matches" : "প্রথম পণ্যটি যোগ করুন · Add your first product"}
            action={allCount
              ? <button type="button" className="ap-btn sm" onClick={() => { setQuick("all"); setCat(""); setSub(""); setQ(""); }}>সব দেখুন</button>
              : <button type="button" className="ap-btn sm primary" onClick={openStudio}>{Ico.plus}নতুন {label}</button>}
          />
        ) : view === "table" ? (
          <div className="ap-table-wrap pr-wrap">
            <table className="ap-table pr-table">
              <thead>
                <tr>
                  <th className="pr-c-check"><input type="checkbox" className="ap-check" aria-label="এই পৃষ্ঠার সব বাছুন" checked={allOnPage} onChange={(e) => sel.setAll(pageIds, e.target.checked)} /></th>
                  <th>পণ্য</th>
                  <th>ক্যাটাগরি</th>
                  <th className="num">কেনা</th>
                  <th className="num">পুরনো</th>
                  <th className="num">দাম</th>
                  <th className="num">ছাড়</th>
                  <th>মার্জিন</th>
                  <th>স্টক</th>
                  <th className="num">বিক্রি</th>
                  <th>টাইমার</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {slice.map((b) => {
                  const offer = offerOf(b);
                  const m = marginOf(offer.price, b.cost);
                  const off = discount(b.price, b.old);
                  return (
                    <tr key={b.id} className={sel.has(b.id) ? "sel" : ""}>
                      <td className="pr-c-check"><input type="checkbox" className="ap-check" aria-label="বাছুন" checked={sel.has(b.id)} onChange={() => sel.toggle(b.id)} /></td>
                      <td className="pr-c-prod">
                        <div className="pr-prod">
                          <label className="pr-thumb" title="ছবি বদলান">
                            <Cover p={b} />
                            <span className="pr-thumb-edit">{imgIco}</span>
                            <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) imgM.mutate({ id: b.id, file: f }); }} />
                          </label>
                          <div className="pr-prod-txt">
                            <button type="button" className="pr-title" onClick={() => setDrawerId(b.id)}>{b.title}</button>
                            <small>{b.author || "—"}</small>
                            <span className="pr-tags">
                              {offer.on ? <Badge tone="green" dot>ছাড় চলছে</Badge> : null}
                              {b.freeShip ? <Badge tone="blue">ফ্রি ডেলিভারি</Badge> : null}
                              {b.stock <= 0 ? <Badge tone="red">স্টক আউট</Badge> : isLow(b) ? <Badge tone="gold">কম স্টক</Badge> : null}
                              {noCost(b) ? <Badge tone="ink">কেনা দাম নেই</Badge> : null}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td data-label="ক্যাটাগরি">
                        <select className="pr-in pr-sel" value={b.catId} onChange={(e) => patch(b, { categoryId: e.target.value, subcategoryId: null }, "ক্যাটাগরি বদলানো হয়েছে")}>
                          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {b.sub ? <small className="pr-sub">{b.sub}</small> : null}
                      </td>
                      <td className="num" data-label="কেনা">
                        <span className={`pr-money${b.cost ? "" : " miss"}`}><i>৳</i><NumCell value={b.cost} placeholder="—" onCommit={(v) => patch(b, { costPrice: v || null })} /></span>
                      </td>
                      <td className="num" data-label="পুরনো">
                        <span className="pr-money"><i>৳</i><NumCell value={b.old} placeholder="—" onCommit={(v) => patch(b, { compareAtPrice: v || null })} /></span>
                      </td>
                      <td className="num" data-label="দাম">
                        <span className="pr-money hot"><i>৳</i><NumCell value={b.price} onCommit={(v) => { if (v > 0) patch(b, { price: v }); }} /></span>
                        {offer.on ? <small className="pr-deal-price">এখন {tk(offer.price)}</small> : null}
                      </td>
                      <td className="num" data-label="ছাড় %">
                        <span className="pr-money pct"><NumCell value={off} max={95} placeholder="—" onCommit={(v) => patch(b, { compareAtPrice: oldFromDiscount(b.price, v) || null })} /><i>%</i></span>
                      </td>
                      <td data-label="মার্জিন"><MarginPill m={m} /></td>
                      <td data-label="স্টক">
                        <div className="pr-stock">
                          <div className="pr-stock-in">
                            <NumCell value={b.stock} label="বাকি" title="বাকি · In stock" placeholder="০" onCommit={(v) => setStock(b, v, "টেবিল থেকে স্টক গণনা", "স্টক আপডেট হয়েছে")} />
                            <span>/</span>
                            <input className="pr-in ghost" type="number" readOnly aria-label="আসল কপি" title="আসল কপি · Copies (স্টক লেজার থেকে)" value={b.copies ?? b.stock} />
                          </div>
                          <StockBar p={b} low={low} />
                        </div>
                      </td>
                      <td className="num" data-label="বিক্রি"><b className="pr-sold">{num(soldOf(b))}</b></td>
                      <td data-label="টাইমার">
                        <button type="button" className={`pr-timer${offer.on ? " on" : b.deal?.until ? " ended" : ""}`} onClick={() => setDealId(b.id)}>
                          {Ico.clock}{offer.on ? "চলছে" : b.deal?.until ? "শেষ" : "টাইমার"}
                        </button>
                        {offer.on && b.deal ? <small className="pr-until">{fmtShipDt(b.deal.until)} পর্যন্ত</small> : null}
                      </td>
                      <td className="pr-c-acts">
                        <div className="pr-acts">
                          <button type="button" className={`pr-inout${b.stock > 0 ? " in" : ""}`} onClick={() => toggleStock(b)} title="স্টকে / আউট">{b.stock > 0 ? "স্টকে" : "আউট"}</button>
                          <RowMenu>
                            {(close) => (
                              <>
                                <p className="ap-menu-label">{b.title.slice(0, 28)}</p>
                                <button type="button" className="ap-menu-item" onClick={() => { setDrawerId(b.id); close(); }}>{Ico.eye}বিস্তারিত<small>Details</small></button>
                                <button type="button" className="ap-menu-item" onClick={() => { duplicate(b); close(); }}>{Ico.copy}কপি করুন<small>Duplicate</small></button>
                                <button type="button" className="ap-menu-item" onClick={() => { setDealId(b.id); close(); }}>{Ico.clock}সময়ের ছাড়<small>Deal</small></button>
                                <button type="button" className="ap-menu-item" onClick={() => { patch(b, { freeShipping: !b.freeShip }, b.freeShip ? "ফ্রি ডেলিভারি বন্ধ" : "ফ্রি ডেলিভারি চালু"); close(); }}>{Ico.truck}{b.freeShip ? "ফ্রি ডেলিভারি বন্ধ" : "ফ্রি ডেলিভারি চালু"}</button>
                                <button type="button" className="ap-menu-item" disabled={b.stock <= 0} onClick={() => { setStock(b, 0, "স্টক আউট করা হলো (অ্যাডমিন)", "স্টক আউট করা হলো"); close(); }}>{Ico.box}স্টক আউট করুন</button>
                                <div className="ap-menu-sep" />
                                <button type="button" className="ap-menu-item danger" onClick={() => { setConfirmIds([b.id]); close(); }}>{Ico.trash}মুছে ফেলুন<small>Delete</small></button>
                              </>
                            )}
                          </RowMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="pr-grid">
            {slice.map((b) => {
              const offer = offerOf(b);
              const m = marginOf(offer.price, b.cost);
              const off = discount(offer.price, offer.old);
              return (
                <article key={b.id} className={`pr-card${sel.has(b.id) ? " sel" : ""}${b.stock <= 0 ? " out" : ""}`}>
                  <button type="button" className="pr-card-art" onClick={() => setDrawerId(b.id)} aria-label={`${b.title} বিস্তারিত`}>
                    <Cover p={b} className="lg" />
                    {off ? <span className="pr-ribbon">-{bn(off)}%</span> : null}
                    {offer.on ? <span className="pr-card-deal">{Ico.clock}চলছে</span> : null}
                  </button>
                  <input type="checkbox" className="ap-check pr-card-check" aria-label="বাছুন" checked={sel.has(b.id)} onChange={() => sel.toggle(b.id)} />
                  <div className="pr-card-body">
                    <small className="pr-card-cat">{b.cat}{b.sub ? ` · ${b.sub}` : ""}</small>
                    <h4><button type="button" onClick={() => setDrawerId(b.id)}>{b.title}</button></h4>
                    <p>{b.author || "—"}</p>
                    <div className="pr-card-price"><b>{tk(offer.price)}</b>{offer.old > offer.price ? <s>{tk(offer.old)}</s> : null}<MarginPill m={m} /></div>
                    <div className="pr-card-stock">
                      <span>{b.stock > 0 ? `স্টকে ${bn(b.stock)}` : "স্টক আউট"}<small> / {bn(b.copies ?? b.stock)}</small></span>
                      <span className="pr-card-sold">{num(soldOf(b))} বিক্রি</span>
                    </div>
                    <StockBar p={b} low={low} />
                    <div className="pr-card-tags">
                      {b.freeShip ? <Badge tone="blue">ফ্রি ডেলিভারি</Badge> : null}
                      {isLow(b) ? <Badge tone="gold">কম স্টক</Badge> : null}
                      {noCost(b) ? <Badge tone="ink">কেনা দাম নেই</Badge> : null}
                    </div>
                  </div>
                  <footer className="pr-card-foot">
                    <button type="button" className="ap-btn sm" onClick={() => setDrawerId(b.id)}>{Ico.edit}এডিট</button>
                    <button type="button" className={`pr-inout${b.stock > 0 ? " in" : ""}`} onClick={() => toggleStock(b)}>{b.stock > 0 ? "স্টকে" : "আউট"}</button>
                    <button type="button" className="ap-icon-btn sm" aria-label="সময়ের ছাড়" title="সময়ের ছাড়" onClick={() => setDealId(b.id)}>{Ico.clock}</button>
                    <RowMenu>
                      {(close) => (
                        <>
                          <button type="button" className="ap-menu-item" onClick={() => { duplicate(b); close(); }}>{Ico.copy}কপি করুন<small>Duplicate</small></button>
                          <button type="button" className="ap-menu-item" onClick={() => { patch(b, { freeShipping: !b.freeShip }, b.freeShip ? "ফ্রি ডেলিভারি বন্ধ" : "ফ্রি ডেলিভারি চালু"); close(); }}>{Ico.truck}{b.freeShip ? "ফ্রি ডেলিভারি বন্ধ" : "ফ্রি ডেলিভারি চালু"}</button>
                          <label className="ap-menu-item pr-menu-file">{imgIco}ছবি বদলান<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) imgM.mutate({ id: b.id, file: f }); close(); }} /></label>
                          <div className="ap-menu-sep" />
                          <button type="button" className="ap-menu-item danger" onClick={() => { setConfirmIds([b.id]); close(); }}>{Ico.trash}মুছে ফেলুন</button>
                        </>
                      )}
                    </RowMenu>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
        {total ? <Pager cur={cur} pages={pages} total={total} size={size} onPage={setPage} onSize={setSize} /> : null}
      </section>

      {/* floating bulk bar */}
      {selected.length ? (
        <div className="ap-bulk pr-bulk" role="toolbar" aria-label="বাছাই করা পণ্য">
          <b>{num(selected.length)}টি বাছাই</b>
          <button type="button" className="ap-btn" onClick={() => setBulk("price")}>{Ico.trend}দাম %</button>
          <button type="button" className="ap-btn" onClick={() => setBulk("discount")}>{Ico.tag}ছাড় %</button>
          <button type="button" className="ap-btn" onClick={() => setBulk("restock")}>{Ico.box}রিস্টক</button>
          <button type="button" className="ap-btn" onClick={bulkFree}>{Ico.truck}ফ্রি ডেলিভারি</button>
          <button type="button" className="ap-btn" onClick={() => setBulk("move")}>{Ico.cats}সরান</button>
          <button type="button" className="ap-btn" onClick={() => downloadCsv(`products-selected-${new Date().toISOString().slice(0, 10)}.csv`, csvRows(selected))}>{Ico.download}CSV</button>
          <button type="button" className="ap-btn pr-bulk-del" onClick={() => setConfirmIds(selected.map((p) => p.id))}>{Ico.trash}মুছুন</button>
          <button type="button" className="ap-btn ghost" aria-label="বাছাই মুছুন" onClick={sel.clear}>{Ico.close}</button>
        </div>
      ) : null}

      <BulkModal kind={bulk} items={selected} cats={cats} onClose={() => setBulk(null)} onDone={() => { setBulk(null); }} />

      <Modal
        open={!!confirmIds}
        onClose={() => setConfirmIds(null)}
        title={confirmIds && confirmIds.length > 1 ? `${num(confirmIds.length)}টি পণ্য মুছবেন?` : "পণ্যটি মুছবেন?"}
        sub="মুছে ফেলা পণ্য দোকানে দেখাবে না · Soft delete"
        width={440}
        footer={
          <>
            <button type="button" className="ap-btn ghost" onClick={() => setConfirmIds(null)}>বাতিল</button>
            <button type="button" className="ap-btn primary pr-danger" disabled={delM.isPending} onClick={() => confirmIds && doDelete(confirmIds)}>{Ico.trash}হ্যাঁ, মুছুন</button>
          </>
        }
      >
        <ul className="pr-confirm-list">
          {(confirmIds || []).slice(0, 6).map((id) => {
            const p = known.get(id);
            return p ? <li key={id}><Cover p={p} /><span><b>{p.title}</b><small>স্টকে {bn(p.stock)} · {num(soldOf(p))} বিক্রি</small></span></li> : null;
          })}
          {confirmIds && confirmIds.length > 6 ? <li className="more">আরও {bn(confirmIds.length - 6)}টি…</li> : null}
        </ul>
      </Modal>

      {drawerId != null ? (
        <ProductDrawer
          key={drawerId}
          id={drawerId}
          low={low}
          cats={cats}
          onClose={closeDrawer}
          onDeal={(id) => setDealId(id)}
          onDelete={(id) => setConfirmIds([id])}
          onOrder={(oid) => { setDrawerId(null); go("orders", oid); }}
        />
      ) : null}

      {dealId ? <DealLayer><DealDialog product={dealProduct} onClose={() => setDealId(null)} /></DealLayer> : null}
    </div>
  );
}

/* ───────── bulk actions ───────── */

function BulkModal({ kind, items, cats, onClose, onDone }: {
  kind: BulkKind; items: ShopProduct[]; cats: Cat[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const bulkM = useBulkProducts();
  const [sign, setSign] = useState<"up" | "down">("up");
  const [pct, setPct] = useState("10");
  const [disc, setDisc] = useState("10");
  const [units, setUnits] = useState("10");
  const [cat, setCat] = useState(cats[0]?.id || "");
  const [sub, setSub] = useState("");
  const subs = cats.find((c) => c.id === cat)?.subs ?? [];
  const p = Math.max(0, Math.min(90, n0(pct)));
  const d = Math.max(0, Math.min(95, n0(disc)));
  const u = Math.max(0, Math.floor(n0(units)));
  const nextPrice = (price: number) => round5(price * (1 + (sign === "up" ? p : -p) / 100));
  const preview = items.slice(0, 4);
  const ids = items.map((x) => x.id);

  function apply() {
    if (!items.length) return;
    const done = { onSuccess: () => onDone() };
    if (kind === "price") {
      if (!p) { toast("শতাংশ দিন"); return; }
      bulkM.mutate({ kind: "price", ids, percent: p, direction: sign, toast: `${num(items.length)}টির দাম ${bn(p)}% ${sign === "up" ? "বাড়ানো" : "কমানো"} হলো` }, done);
    } else if (kind === "discount") {
      bulkM.mutate({ kind: "discount", ids, percent: d, toast: d ? `${num(items.length)}টিতে ${bn(d)}% ছাড় দেখানো হচ্ছে` : "ছাড় সরানো হলো" }, done);
    } else if (kind === "restock") {
      if (!u) { toast("কত ইউনিট আসছে দিন"); return; }
      bulkM.mutate({ kind: "restock", ids, units: u, toast: `${num(items.length)}টিতে +${bn(u)} ইউনিট যোগ হলো` }, done);
    } else if (kind === "move") {
      if (!cat) return;
      const name = cats.find((c) => c.id === cat)?.name ?? "";
      const sname = subs.find((x) => x.id === sub)?.name ?? "";
      bulkM.mutate({ kind: "move", ids, categoryId: cat, subcategoryId: sub || undefined, toast: `${num(items.length)}টি «${name}${sname ? ` · ${sname}` : ""}» এ সরানো হলো` }, done);
    }
  }

  const meta: Record<Exclude<BulkKind, null>, { title: string; sub: string; cta: string }> = {
    price: { title: "দাম বদলান", sub: "শতাংশে বাড়ান বা কমান · নিকটতম ৳৫ এ গোল", cta: "দাম বসান" },
    discount: { title: "ছাড় % বসান", sub: "পুরনো (কাটা) দাম হিসাব করে বসবে · ০ দিলে ছাড় সরবে", cta: "ছাড় বসান" },
    restock: { title: "রিস্টক", sub: "প্রতিটি পণ্যে নতুন ইউনিট যোগ হবে · Receive stock", cta: "স্টক যোগ করুন" },
    move: { title: "ক্যাটাগরি বদলান", sub: "বাছাই করা পণ্য অন্য ক্যাটাগরিতে সরান", cta: "সরান" },
  };
  if (!kind) return null;
  const m = meta[kind];

  return (
    <Modal open onClose={onClose} title={m.title} sub={`${num(items.length)}টি পণ্য · ${m.sub}`} width={480}
      footer={<><button type="button" className="ap-btn ghost" onClick={onClose}>বাতিল</button><button type="button" className="ap-btn primary" disabled={bulkM.isPending} onClick={apply}>{m.cta}</button></>}>
      <div className="pr-bulk-body">
        {kind === "price" ? (
          <>
            <div className="pr-bulk-row">
              <Segmented<"up" | "down"> value={sign} onChange={setSign} options={[{ id: "up", label: "+ বাড়ান", icon: Ico.up }, { id: "down", label: "− কমান", icon: Ico.down }]} />
              <span className="pr-bulk-num"><input type="number" min={0} max={90} value={pct} onChange={(e) => setPct(e.target.value)} aria-label="শতাংশ" /><i>%</i></span>
            </div>
            <ul className="pr-bulk-prev">
              {preview.map((x) => <li key={x.id}><span>{x.title}</span><s>{tk(x.price)}</s><b>{tk(p ? nextPrice(x.price) : x.price)}</b></li>)}
              {items.length > preview.length ? <li className="more">আরও {bn(items.length - preview.length)}টি…</li> : null}
            </ul>
          </>
        ) : null}
        {kind === "discount" ? (
          <>
            <div className="pr-bulk-row">
              <span className="pr-bulk-num"><input type="number" min={0} max={95} value={disc} onChange={(e) => setDisc(e.target.value)} aria-label="ছাড় শতাংশ" /><i>%</i></span>
              <div className="pr-chips">{[0, 5, 10, 15, 20, 25].map((v) => <button key={v} type="button" className={`ap-chip${d === v ? " on" : ""}`} onClick={() => setDisc(String(v))}>{bn(v)}%</button>)}</div>
            </div>
            <ul className="pr-bulk-prev">
              {preview.map((x) => <li key={x.id}><span>{x.title}</span><s>{d ? tk(oldFromDiscount(x.price, d)) : "—"}</s><b>{tk(x.price)}</b></li>)}
            </ul>
          </>
        ) : null}
        {kind === "restock" ? (
          <>
            <div className="pr-bulk-row">
              <span className="pr-bulk-num wide"><i>+</i><input type="number" min={1} value={units} onChange={(e) => setUnits(e.target.value)} aria-label="ইউনিট" /><i>ইউনিট</i></span>
              <div className="pr-chips">{[5, 10, 25, 50].map((v) => <button key={v} type="button" className={`ap-chip${u === v ? " on" : ""}`} onClick={() => setUnits(String(v))}>+{bn(v)}</button>)}</div>
            </div>
            <ul className="pr-bulk-prev">
              {preview.map((x) => <li key={x.id}><span>{x.title}</span><s>{bn(x.stock)}</s><b>{bn(x.stock + u)}</b></li>)}
            </ul>
          </>
        ) : null}
        {kind === "move" ? (
          <div className="pr-bulk-grid">
            <div><label>ক্যাটাগরি</label><select value={cat} onChange={(e) => { setCat(e.target.value); setSub(""); }}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label>সাব-ক্যাটাগরি</label><select value={sub} onChange={(e) => setSub(e.target.value)}><option value="">—</option>{subs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* ───────── product drawer ───────── */

type Draft = { title: string; author: string; desc: string; cat: string; sub: string; cost: string; old: string; price: string; stock: string; copies: string; freeShip: boolean; image: string };

function toDraft(p: ShopProduct): Draft {
  return {
    title: p.title, author: p.author || "", desc: p.desc || "", cat: p.catId, sub: p.subId || "",
    cost: p.cost ? String(p.cost) : "", old: p.old ? String(p.old) : "", price: String(p.price || ""),
    stock: String(p.stock ?? 0), copies: String(p.copies ?? p.stock ?? 0), freeShip: !!p.freeShip, image: p.image || "",
  };
}

type Hit = { orderId: string; orderNo: string; qty: number; at: number };

function ProductDrawer({ id, low, cats, onClose, onDeal, onDelete, onOrder }: {
  id: string; low: number; cats: Cat[]; onClose: () => void; onDeal: (id: string) => void; onDelete: (id: string) => void; onOrder: (orderNo: string) => void;
}) {
  const toast = useToast();
  const q = useAdminProduct(id);
  const movesQ = useStockMovements(id);
  const patchM = usePatchProduct();
  const adjustM = useAdjustStock();
  const bulkM = useBulkProducts();
  const imgM = useUploadProductImage();
  const product = useMemo(() => (q.data ? { ...toShop(q.data), desc: q.data.description ?? "" } : null), [q.data]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recv, setRecv] = useState("");
  const [drag, setDrag] = useState(false);
  useEffect(() => { if (product) setDraft(toDraft(product)); }, [product]);

  /* sales from the stock ledger: reservations net of releases, per order */
  const hits = useMemo(() => {
    const m = new Map<string, Hit>();
    for (const mv of movesQ.data?.items ?? []) {
      if (!mv.order) continue;
      const h = m.get(mv.order.id) ?? { orderId: mv.order.id, orderNo: mv.order.orderNo, qty: 0, at: ms(mv.createdAt) };
      if (mv.type === "ORDER_RESERVE") h.qty += Math.abs(mv.reservedDelta || mv.onHandDelta);
      if (mv.type === "ORDER_RELEASE") h.qty -= Math.abs(mv.reservedDelta || mv.onHandDelta);
      h.at = Math.min(h.at, ms(mv.createdAt));
      m.set(mv.order.id, h);
    }
    return [...m.values()].filter((h) => h.qty > 0).sort((a2, b2) => b2.at - a2.at);
  }, [movesQ.data]);
  const units = hits.reduce((s2, h) => s2 + h.qty, 0);
  const revenue = units * n0(product ? offerOf(product).price : 0);
  const last = hits[0]?.at || 0;
  const days = useMemo(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = end.getTime() - 29 * DAY;
    const values = Array.from({ length: 30 }, () => 0);
    const labels = values.map((_, i) => new Date(start + i * DAY).toLocaleDateString("bn-BD", { day: "numeric", month: "short" }));
    for (const h of hits) {
      const idx = Math.floor((h.at - start) / DAY);
      if (idx >= 0 && idx < 30) values[idx] += h.qty;
    }
    return { values, labels, total: values.reduce((a2, b2) => a2 + b2, 0) };
  }, [hits]);

  if (!product || !draft) {
    return (
      <Drawer open onClose={onClose} title={q.isLoading ? "লোড হচ্ছে…" : "পণ্য পাওয়া যায়নি"} width={600}>
        {q.isLoading ? null : <Empty title="পণ্যটি আর নেই" sub="হয়তো মুছে ফেলা হয়েছে · Not found" />}
      </Drawer>
    );
  }

  const subs = cats.find((c) => c.id === draft.cat)?.subs ?? [];
  const cost = n0(draft.cost), old = n0(draft.old), price = n0(draft.price);
  const stock = Math.max(0, Math.floor(n0(draft.stock)));
  const copies = Math.max(0, Math.floor(n0(draft.copies)));
  const margin = marginOf(price, cost);
  const profit = cost > 0 && price > 0 ? price - cost : null;
  const off = discount(price, old);
  const offer = offerOf(product);
  const base = toDraft(product);
  const dirty = (Object.keys(base) as (keyof Draft)[]).some((k) => k !== "image" && base[k] !== draft[k]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const who = product.vertical === "book" ? "লেখক / প্রকাশনী" : "ব্র্যান্ড / একক";

  function save() {
    if (!draft || !product) return;
    const title = draft.title.trim();
    if (!title) { toast("নাম খালি রাখা যাবে না"); return; }
    if (!(price > 0)) { toast("বিক্রির দাম দিন"); return; }
    const body: ProductPatch = {};
    if (title !== product.title) body.title = title;
    if (draft.author.trim() !== product.author) body.subtitle = draft.author.trim() || null;
    if (draft.desc.trim() !== product.desc) body.description = draft.desc.trim() || null;
    if (draft.cat !== product.catId) { body.categoryId = draft.cat; body.subcategoryId = draft.sub || null; }
    else if (draft.sub !== (product.subId || "")) body.subcategoryId = draft.sub || null;
    if (cost !== product.cost) body.costPrice = cost || null;
    if (old !== product.old) body.compareAtPrice = old || null;
    if (price !== product.price) body.price = price;
    if (draft.freeShip !== product.freeShip) body.freeShipping = draft.freeShip;
    const msg = cost > 0 && price < cost ? "সেভ হয়েছে · সাবধান, লসে বিক্রি হবে" : "সেভ হয়েছে";
    if (Object.keys(body).length) patchM.mutate({ id: product.id, version: product.version, body, toast: msg });
    if (stock !== product.stock) adjustM.mutate({ id: product.id, onHand: stock, reason: "ড্রয়ার থেকে স্টক গণনা", toast: Object.keys(body).length ? undefined : msg });
  }

  function receive() {
    const n = Math.max(0, Math.floor(n0(recv)));
    if (!n || !product) { toast("কত ইউনিট এলো দিন"); return; }
    bulkM.mutate({ kind: "restock", ids: [product.id], units: n, toast: `+${bn(n)} ইউনিট স্টকে যোগ হলো` }, { onSuccess: () => setRecv("") });
  }

  const takeFile = (f?: File | null) => { if (f && f.type.startsWith("image/") && product) imgM.mutate({ id: product.id, file: f }); };

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      head={
        <div className="pr-dh">
          <small>{q.data?.sku ?? ""} · {q.data?.section.name ?? product.vertical} · {product.cat}</small>
          <h2>{product.title}</h2>
          <div className="pr-tags">
            {offer.on ? <Badge tone="green" dot>ছাড় চলছে</Badge> : null}
            {product.stock <= 0 ? <Badge tone="red">স্টক আউট</Badge> : product.stock <= low ? <Badge tone="gold">কম স্টক</Badge> : <Badge tone="sage">স্টকে</Badge>}
            {product.freeShip ? <Badge tone="blue">ফ্রি ডেলিভারি</Badge> : null}
            {dirty ? <Badge tone="wine" dot>সেভ হয়নি</Badge> : null}
          </div>
        </div>
      }
      footer={
        <>
          <button type="button" className="ap-btn danger pr-foot-del" onClick={() => onDelete(product.id)}>{Ico.trash}মুছুন</button>
          <span className="pr-foot-sp" />
          <button type="button" className="ap-btn ghost" disabled={!dirty} onClick={() => setDraft(toDraft(product))}>বাতিল</button>
          <button type="button" className="ap-btn primary" disabled={!dirty || patchM.isPending} onClick={save}>{Ico.check}সেভ করুন</button>
        </>
      }
    >
      <div className="pr-d">
        <div className="pr-d-hero">
          <label
            className={`pr-d-cover${drag ? " drag" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); takeFile(e.dataTransfer.files?.[0]); }}
          >
            {draft.image ? <img src={draft.image} alt="" /> : <span className="pr-d-ph" style={{ background: product.color }}><em>{draft.title || product.title}</em></span>}
            <span className="pr-d-cover-cta">{imgIco}ছবি বদলান</span>
            <input type="file" accept="image/*" onChange={(e) => takeFile(e.target.files?.[0])} />
          </label>
          <div className="pr-d-sum">
            <div className="pr-d-price">
              <b>{tk(offer.on ? offer.price : price)}</b>
              {(offer.on ? offer.old : old) > (offer.on ? offer.price : price) ? <s>{tk(offer.on ? offer.old : old)}</s> : null}
              {off && !offer.on ? <span className="pr-ribbon sm">-{bn(off)}%</span> : null}
            </div>
            <div className="pr-d-mini">
              <div><small>বিক্রি · Units</small><b>{num(n0(product.sold) || units)}</b></div>
              <div><small>আয় (আনুমানিক)</small><b>{tk(revenue)}</b></div>
              <div><small>শেষ বিক্রি</small><b>{last ? dateOnly(last) : "—"}</b></div>
              <div><small>স্টক ভ্যালু</small><b>{tk(stock * cost)}</b></div>
            </div>
            
          </div>
        </div>

        <section className="pr-d-sec">
          <h4>পরিচয় <span>Details</span></h4>
          <div className="pr-d-grid">
            <div className="span-2"><label>নাম</label><input value={draft.title} onChange={(e) => set("title", e.target.value)} /></div>
            <div className="span-2"><label>{who}</label><input value={draft.author} onChange={(e) => set("author", e.target.value)} /></div>
            <div><label>ক্যাটাগরি</label><select value={draft.cat} onChange={(e) => setDraft((d) => (d ? { ...d, cat: e.target.value, sub: "" } : d))}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}{cats.some((c) => c.id === draft.cat) ? null : <option value={draft.cat}>{product.cat}</option>}</select></div>
            <div><label>সাব-ক্যাটাগরি</label><select value={draft.sub} onChange={(e) => set("sub", e.target.value)}><option value="">—</option>{subs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}{draft.sub && !subs.some((x) => x.id === draft.sub) ? <option value={draft.sub}>{product.sub}</option> : null}</select></div>
            <div className="span-2"><label>বিবরণ</label><textarea rows={3} value={draft.desc} onChange={(e) => set("desc", e.target.value)} /></div>
          </div>
        </section>

        <section className="pr-d-sec">
          <h4>দাম <span>Pricing</span></h4>
          <div className="pr-d-grid three">
            <div><label>কেনা দাম</label><span className="pr-d-money"><i>৳</i><input type="number" min={0} value={draft.cost} placeholder="—" onChange={(e) => set("cost", e.target.value)} /></span></div>
            <div><label>পুরনো দাম</label><span className="pr-d-money"><i>৳</i><input type="number" min={0} value={draft.old} placeholder="—" onChange={(e) => set("old", e.target.value)} /></span></div>
            <div><label>বিক্রির দাম</label><span className="pr-d-money hot"><i>৳</i><input type="number" min={0} value={draft.price} onChange={(e) => set("price", e.target.value)} /></span></div>
          </div>
          <div className="pr-d-meter">
            <div className={`pr-d-chip ${marginTone(margin)}`}><small>মার্জিন</small><b>{margin == null ? "—" : `${bn(margin)}%`}</b></div>
            <div className={`pr-d-chip ${profit == null ? "none" : profit >= 0 ? "good" : "bad"}`}><small>প্রতি ইউনিটে লাভ</small><b>{profit == null ? "—" : tk(profit)}</b></div>
            <div className={`pr-d-chip ${off ? "mid" : "none"}`}><small>ছাড়</small><b>{off ? `${bn(off)}%` : "—"}</b></div>
            <div className="pr-d-bar" aria-hidden="true"><i className={marginTone(margin)} style={{ width: `${Math.max(0, Math.min(100, margin ?? 0))}%` }} /></div>
          </div>
          {!(cost > 0) ? <p className="pr-d-note">কেনা দাম দিলে লাভের হিসাব চালু হবে।</p> : profit != null && profit < 0 ? <p className="pr-d-note bad">বিক্রির দাম কেনা দামের চেয়ে কম · লসে বিক্রি হবে</p> : null}
        </section>

        <section className="pr-d-sec">
          <h4>স্টক <span>Inventory</span></h4>
          <div className="pr-d-grid three">
            <div><label>বাকি স্টক</label><input type="number" min={0} value={draft.stock} onChange={(e) => set("stock", e.target.value)} /></div>
            <div><label>আসল কপি</label><input type="number" readOnly value={draft.copies} title="স্টক লেজার থেকে · রিস্টকে বাড়ে" /></div>
            <div>
              <label>রিস্টক · Receive</label>
              <span className="pr-d-recv"><input type="number" min={1} value={recv} placeholder="+ইউনিট" onChange={(e) => setRecv(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") receive(); }} /><button type="button" className="ap-btn sm" disabled={bulkM.isPending} onClick={receive}>যোগ</button></span>
            </div>
          </div>
          <StockBar p={{ ...product, stock, copies }} low={low} />
          <div className="pr-d-toggle">
            <Toggle checked={draft.freeShip} onChange={(v) => set("freeShip", v)} label="ফ্রি ডেলিভারি" sub="শুধু এই পণ্য থাকলে কুরিয়ার ৳০ · Free delivery" />
          </div>
        </section>

        <section className="pr-d-sec">
          <h4>৩০ দিনের বিক্রি <span>Last 30 days · {num(days.total)} ইউনিট</span></h4>
          {days.total ? <Columns values={days.values} labels={days.labels} tone="wine" height={84} format={(v) => `${num(v)} ইউনিট`} /> : <p className="pr-d-empty">গত ৩০ দিনে বিক্রি হয়নি</p>}
          {days.total ? <div className="pr-d-axis"><span>{days.labels[0]}</span><span>আজ</span></div> : null}
        </section>

        <section className="pr-d-sec">
          <h4>সময়ের ছাড় <span>Timed deal</span></h4>
          <div className={`pr-d-deal${offer.on ? " on" : ""}`}>
            <span className="pr-d-deal-ico">{Ico.clock}</span>
            <div>
              {offer.on && product.deal ? (
                <><b>{tk(product.deal.price)} · চলছে</b><small>{fmtShipDt(product.deal.until)} পর্যন্ত · শেষে {tk(product.price)} এ ফিরবে</small></>
              ) : (
                <><b>কোনো টাইমার নেই</b><small>নির্দিষ্ট সময়ের জন্য কম দামে বিক্রি করুন</small></>
              )}
            </div>
            <button type="button" className="ap-btn sm" onClick={() => onDeal(product.id)}>{offer.on ? "এডিট" : "টাইমার বসান"}</button>
          </div>
        </section>

        <section className="pr-d-sec">
          <h4>অর্ডার <span>Orders · {num(hits.length)}</span></h4>
          {hits.length ? (
            <ul className="pr-d-orders">
              {hits.slice(0, 12).map((h) => (
                <li key={h.orderId}>
                  <button type="button" onClick={() => onOrder(h.orderNo)}>
                    <span className="pr-d-oid">{h.orderNo}</span>
                    <span className="pr-d-oname">অর্ডার<small>{dateOnly(h.at)}</small></span>
                    <span className="pr-d-oqty">×{bn(h.qty)}</span>
                    <b>{tk(h.qty * offer.price)}</b>
                    {Ico.chevR}
                  </button>
                </li>
              ))}
              {hits.length > 12 ? <li className="more">আরও {bn(hits.length - 12)}টি অর্ডার</li> : null}
            </ul>
          ) : <p className="pr-d-empty">এখনো কোনো অর্ডারে নেই</p>}
        </section>
      </div>
    </Drawer>
  );
}

/* ───────── timed deal ───────── */

/** DealDialog uses legacy `.adm .overlay` styles; portal it above the drawer inside an `.adm` shell. */
function DealLayer({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(<div className="adm pr-deal-layer">{children}</div>, document.body);
}

function DealDialog({ product, onClose }: { product: ShopProduct | null; onClose: () => void }) {
  const toast = useToast();
  const createM = useCreateDeal();
  const cancelM = useCancelDeal();
  const [price, setPrice] = useState(product?.deal?.price ? String(product.deal.price) : "");
  const [until, setUntil] = useState(product?.deal?.until || "");
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  if (!product) return null;
  const live = offerOf(product).on;
  const dealN = n0(price);
  const save_off = dealN > 0 && dealN < product.price ? Math.round((1 - dealN / product.price) * 100) : 0;

  function save() {
    const n = n0(price);
    const end = Date.parse(until);
    if (!(n > 0) || n >= product!.price) {
      toast("ছাড়ের দাম আগের দামের চেয়ে কম দিন");
      return;
    }
    if (!until || !(end > Date.now())) {
      toast("শেষ হওয়ার সময় সামনে দিন");
      return;
    }
    createM.mutate({ id: product!.id, dealPrice: n, endsAt: new Date(end).toISOString() }, { onSuccess: onClose });
  }

  function clear() {
    if (!product?.deal) return;
    cancelM.mutate({ dealId: product.deal.id }, { onSuccess: onClose });
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
        {save_off ? <p className="author">ক্রেতা পাবে {bn(save_off)}% ছাড়{n0(product.cost) > 0 && dealN < n0(product.cost) ? " · সাবধান, কেনা দামের নিচে" : ""}</p> : null}
        <BnDateField label="শেষ হবে" withTime end value={until} onChange={setUntil} emptyText="তারিখ ও সময় বাছুন" />
        {live && product.deal ? <p className="author">এখন চলছে · {fmtShipDt(product.deal.until)} পর্যন্ত</p> : null}
        <div className="save-row">
          {product.deal ? <button type="button" className="btn btn-ghost" onClick={clear}>টাইমার সরান</button> : <span />}
          <button type="button" className="btn btn-primary" disabled={createM.isPending} onClick={save}>বসান</button>
        </div>
      </div>
    </div>
  );
}
