"use client";

import "./finance.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAdminNav } from "@/components/admin/nav";
import { BnDateField } from "@/components/ui/bangla-calendar";
import { bn } from "@/lib/format";
import { adminErrorText, isoDay, ms, useToast } from "@/lib/api/admin/core";
import { useDocuments, type AdminDocument } from "@/lib/api/admin/documents";
import {
  exportFinance, useCashAccounts, useCategoryReport, useCourierPayment, useCreatePurchase, useCreateSupplier, useDayClose, useFinanceOrders,
  useFinanceSummary, useManualEntry, usePayPurchase, usePnl, useProductPicker, usePurchases, useReverseEntry, useSuppliers,
  type CashAccount, type CashEntry, type Pnl, type Purchase, type ReportPeriod,
} from "@/lib/api/admin/finance";
import { isSslMethod } from "@/lib/admin/status";
import { DocModal } from "@/components/admin/doc-frame";
import { useConfirmInput } from "@/components/admin/confirm";
import { Drawer, Modal, Toggle, tk } from "@/components/admin/ui";

/* ═══════════════════════════════════════════════════════════
   হিসাব · Finance desk
   summary cockpit · papers · purchases · cash book · P&L
   styles: ./finance.css (prefix fx-)
   ═══════════════════════════════════════════════════════════ */

type View = "sum" | "paper" | "buy" | "cash" | "pnl";
type Tenure = "day" | "month" | "year";
type Range = "today" | "7" | "30" | "all" | "custom";

const S = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const FI = {
  sum: <svg {...S}><path d="M4 19.5V5M4 19.5h16" /><path d="M8 15l3.5-4 3 2.5 5-6" /></svg>,
  paper: <svg {...S}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>,
  buy: <svg {...S}><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M6 6 5 3H2" /></svg>,
  cash: <svg {...S}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></svg>,
  pnl: <svg {...S}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2.1-.6-2.6-1.6" /></svg>,
  wallet: <svg {...S}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="4" y="8" width="16.5" height="11" rx="2.5" /><circle cx="16" cy="13.5" r="1.2" /></svg>,
  clock: <svg {...S}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  box: <svg {...S}><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" /></svg>,
  truck: <svg {...S}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></svg>,
  store: <svg {...S}><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M5.5 12v8h13v-8" /><path d="M10 20v-4h4v4" /></svg>,
  trend: <svg {...S}><path d="M3.5 17 9 11.5l3.5 3.5 8-8" /><path d="M15 7h5.5v5.5" /></svg>,
  down: <svg {...S}><path d="M12 4v11M7 10l5 5 5-5M5 19.5h14" /></svg>,
  plus: <svg {...S}><path d="M12 5v14M5 12h14" /></svg>,
  minus: <svg {...S}><path d="M5 12h14" /></svg>,
  close: <svg {...S}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  chevL: <svg {...S}><path d="m15 6-6 6 6 6" /></svg>,
  chevR: <svg {...S}><path d="m9 6 6 6-6 6" /></svg>,
  undo: <svg {...S}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>,
  alert: <svg {...S}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2h.01" /></svg>,
  check: <svg {...S}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  search: <svg {...S}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>,
  receipt: <svg {...S}><path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>,
  credit: <svg {...S}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9.5 14h5" /><path d="m11.5 11.5-2 2.5 2 2.5" /></svg>,
  bank: <svg {...S}><path d="M3.5 9 12 4l8.5 5M5 9.5v8M9.5 9.5v8M14.5 9.5v8M19 9.5v8M3.5 20h17" /></svg>,
  phone: <svg {...S}><rect x="7" y="3" width="10" height="18" rx="2.2" /><path d="M11 17.5h2" /></svg>,
  card: <svg {...S}><rect x="3" y="5.5" width="18" height="13" rx="2.2" /><path d="M3 10h18M6.5 15h4" /></svg>,
  coins: <svg {...S}><ellipse cx="9" cy="7" rx="5.5" ry="2.5" /><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" /><path d="M9.5 16.4c.6.1 1.3.1 2 .1 3 0 5.5-1.1 5.5-2.5" /><path d="M14.5 11.5c3 0 5.5 1.1 5.5 2.5v4c0 1.4-2.5 2.5-5.5 2.5S9 19.4 9 18v-1.6" /></svg>,
  user: <svg {...S}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.2-3.4 3.8-5.2 7-5.2s5.8 1.8 7 5.2" /></svg>,
  lock: <svg {...S}><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
};

const TABS: { id: View; label: string; hint: string; icon: ReactNode }[] = [
  { id: "sum", label: "সারাংশ", hint: "বিল ও বকেয়া", icon: FI.sum },
  { id: "paper", label: "কাগজ", hint: "ইনভয়েস · রিসিট", icon: FI.paper },
  { id: "buy", label: "ক্রয়", hint: "সাপ্লায়ার বিল", icon: FI.buy },
  { id: "cash", label: "ক্যাশবুক", hint: "দিনের ক্লোজ", icon: FI.cash },
  { id: "pnl", label: "লাভ-ক্ষতি", hint: "মার্জিন ও নেট", icon: FI.pnl },
];
const DOC_KIND: Record<string, string> = { invoice: "INVOICE", receipt: "RECEIPT", credit: "CREDIT_NOTE" };
const DAY = 86400000;
const dayMs = (d: string) => new Date(`${d}T00:00:00`).getTime();
const bnDate = (d: string, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("bn-BD", o) : "");
const clamp = (n: number, a = 0, b = 100) => Math.max(a, Math.min(b, n));

function periodOf(range: Range, from: string, to: string): ReportPeriod {
  const today = isoDay();
  if (range === "today") return { period: "day", date: today };
  if (range === "7" || range === "30") return { period: "custom", from: isoDay(Date.now() - (Number(range) - 1) * DAY), to: today };
  if (range === "custom") return { period: "custom", from, to };
  return { period: "custom", from: "2020-01-01", to: today };
}
/** The same-length window right before the selected one (null for "all"). */
function prevOf(range: Range, from: string, to: string): ReportPeriod | null {
  if (range === "today") return { period: "day", date: isoDay(Date.now() - DAY) };
  if (range === "7" || range === "30") {
    const n = Number(range);
    return { period: "custom", from: isoDay(Date.now() - (2 * n - 1) * DAY), to: isoDay(Date.now() - n * DAY) };
  }
  if (range === "custom") {
    const len = Math.max(1, Math.round((dayMs(to) - dayMs(from)) / DAY) + 1);
    return { period: "custom", from: isoDay(dayMs(from) - len * DAY), to: isoDay(dayMs(from) - DAY) };
  }
  return null;
}

/* ───────── motion helpers ───────── */

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}
function useCountUp(value: number, dur = 1100) {
  const [n, setN] = useState(0);
  const cur = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { cur.current = value; setN(value); return; }
    const a = cur.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const v = a + (value - a) * (1 - Math.pow(1 - k, 4));
      cur.current = v;
      setN(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return n;
}
function Num({ value, sign }: { value: number; sign?: boolean }) {
  const n = useCountUp(value);
  return <>{sign && value > 0 ? "+" : ""}{tk(n)}</>;
}

/* ───────── small presentational parts ───────── */

function Delta({ cur, prev, dark }: { cur: number; prev: number | null | undefined; dark?: boolean }) {
  if (prev == null) return null;
  if (!prev) return cur ? <span className={`fx-delta up${dark ? " dk" : ""}`}>নতুন</span> : null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  const up = pct >= 0;
  return (
    <span className={`fx-delta ${up ? "up" : "dn"}${dark ? " dk" : ""}`} title={`আগের সময়ে ${tk(prev)}`}>
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d={up ? "M5 1.5 9 7.5H1z" : "M5 8.5 1 2.5h8z"} /></svg>
      {bn(Math.abs(pct))}%
    </span>
  );
}

function Ring({ pct, size = 52, stroke = 6, tone = "green", children }: { pct: number; size?: number; stroke?: number; tone?: "green" | "gold" | "wine" | "red"; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={`fx-ring t-${tone}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="bg" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fg" strokeDasharray={c} style={{ ["--off" as string]: c * (1 - clamp(pct) / 100), ["--c" as string]: c }} />
      </svg>
      <em>{children}</em>
    </span>
  );
}

function Skel({ h = 16, w = "100%", r = 8 }: { h?: number; w?: number | string; r?: number }) {
  return <i className="fx-skel" style={{ height: h, width: w, borderRadius: r }} />;
}

function FxEmpty({ art = "paper", title, sub, action }: { art?: "paper" | "box" | "cash" | "chart"; title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="fx-empty">
      <svg viewBox="0 0 160 110" className="fx-empty-art" aria-hidden="true">
        <ellipse cx="80" cy="98" rx="56" ry="7" className="sh" />
        {art === "paper" ? (
          <>
            <rect x="58" y="14" width="52" height="68" rx="6" className="p2" transform="rotate(8 84 48)" />
            <rect x="48" y="16" width="52" height="68" rx="6" className="p1" />
            <path d="M58 32h32M58 42h32M58 52h22" className="ln" />
            <circle cx="92" cy="72" r="9" className="gd" /><path d="m88 72 3 3 5-6" className="ck" />
          </>
        ) : art === "box" ? (
          <>
            <path d="M40 44 80 26l40 18v34L80 96 40 78z" className="p1" />
            <path d="M40 44l40 18 40-18M80 62v34" className="ln" />
            <path d="M60 35l40 18" className="gdl" />
          </>
        ) : art === "cash" ? (
          <>
            <rect x="36" y="34" width="88" height="50" rx="8" className="p2" transform="rotate(-6 80 59)" />
            <rect x="36" y="38" width="88" height="50" rx="8" className="p1" />
            <circle cx="80" cy="63" r="12" className="gd" />
            <path d="M48 50h8M104 76h8" className="ln" />
          </>
        ) : (
          <>
            <path d="M34 86h92" className="ln" />
            <rect x="44" y="60" width="14" height="26" rx="3" className="p1" />
            <rect x="66" y="44" width="14" height="42" rx="3" className="p1" />
            <rect x="88" y="30" width="14" height="56" rx="3" className="gd" />
            <path d="M40 52 62 36l22 8 26-22" className="gdl" />
          </>
        )}
      </svg>
      <b>{title}</b>
      {sub ? <p>{sub}</p> : null}
      {action}
    </div>
  );
}

function Chips<T extends string>({ value, onChange, items, dark }: { value: T; onChange: (v: T) => void; items: [T, ReactNode][]; dark?: boolean }) {
  return (
    <div className={`fx-seg${dark ? " dark" : ""}`} role="tablist">
      {items.map(([id, lab]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={value === id ? "on" : ""} onClick={() => onChange(id)}>{lab}</button>
      ))}
    </div>
  );
}

/* monotone cubic path (Fritsch–Carlson) — no overshoot below zero */
function smooth(pts: [number, number][]) {
  const n = pts.length;
  if (!n) return "";
  if (n < 3) return pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const dx: number[] = []; const m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i]; const b = t[i + 1] / m[i]; const h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${pts[i][0] + h},${pts[i][1] + t[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - t[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

function AreaChart({ data }: { data: { key: string; label: string; v: number }[] }) {
  const W = 600; const H = 180; const top = 16; const bot = 6;
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(1, ...data.map((d) => d.v));
  const pts: [number, number][] = data.map((d, i) => [data.length > 1 ? (i / (data.length - 1)) * W : W / 2, H - bot - (d.v / peak) * (H - top - bot)]);
  const line = smooth(pts);
  const area = pts.length ? `${line} L${W},${H} L0,${H} Z` : "";
  const hi = hover ?? data.length - 1;
  const p = pts[hi];
  function move(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const f = clamp((e.clientX - r.left) / r.width, 0, 1);
    setHover(Math.round(f * (data.length - 1)));
  }
  if (!data.length) return <div className="fx-area is-empty"><Skel h={140} r={14} /></div>;
  return (
    <div className="fx-area" onPointerMove={move} onPointerLeave={() => setHover(null)} onPointerDown={move}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="fxAreaFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#E8C877" stopOpacity=".55" />
            <stop offset=".6" stopColor="#C4A15A" stopOpacity=".12" />
            <stop offset="1" stopColor="#C4A15A" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fxAreaLine" x1="0" x2="1">
            <stop offset="0" stopColor="#E8D5A3" stopOpacity=".6" />
            <stop offset="1" stopColor="#F3DFA6" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={top + (H - top - bot) * g} y2={top + (H - top - bot) * g} className="gl" vectorEffect="non-scaling-stroke" />)}
        <path d={area} fill="url(#fxAreaFill)" className="fill" />
        <path d={line} fill="none" stroke="url(#fxAreaLine)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" className="line" pathLength={1} />
      </svg>
      {p ? (
        <>
          <span className="fx-area-x" style={{ left: `${(p[0] / W) * 100}%` }} />
          <span className="fx-area-dot" style={{ left: `${(p[0] / W) * 100}%`, top: `${(p[1] / H) * 100}%` }} />
          <span className={`fx-area-tip${(p[0] / W) > 0.7 ? " r" : (p[0] / W) < 0.3 ? " l" : ""}`} style={{ left: `${(p[0] / W) * 100}%` }}>
            <small>{data[hi].label}{hover == null ? " · আজ" : ""}</small><b>{tk(data[hi].v)}</b>
          </span>
        </>
      ) : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Desk
   ═══════════════════════════════════════════════════════════ */

export function FinanceDesk() {
  const toast = useToast();
  const { focus, clearFocus } = useAdminNav();
  const [view, setView] = useState<View>(() => (TABS.some((t) => t.id === focus) ? (focus as View) : "sum"));
  const [newBuy, setNewBuy] = useState(() => focus === "buy");
  useEffect(() => {
    if (focus && TABS.some((t) => t.id === focus)) {
      setView(focus as View);
      if (focus === "buy") setNewBuy(true);
      clearFocus();
    }
  }, [focus, clearFocus]);
  const [range, setRange] = useState<Range>("30");
  const [from, setFrom] = useState(isoDay(Date.now() - 29 * DAY));
  const [to, setTo] = useState(isoDay());
  const [pay, setPay] = useState<"all" | "got" | "due">("all");
  const [paperKind, setPaperKind] = useState("all");
  const [open, setOpen] = useState<AdminDocument | null>(null);
  const [day, setDay] = useState(isoDay());
  const [tenure, setTenure] = useState<Tenure>("month");

  const period = periodOf(range, from, to);
  const prevP = prevOf(range, from, to);
  const sumQ = useFinanceSummary(period);
  const prevQ = useFinanceSummary(prevP ?? period);
  const monthQ = useFinanceSummary({ period: "custom", from: isoDay(Date.now() - 29 * DAY), to: isoDay() });
  const ordersQ = useFinanceOrders(range === "custom" ? "all" : range, pay);
  const accountsQ = useCashAccounts();
  const docsCountQ = useDocuments({ pageSize: 1 });
  const purchasesQ = usePurchases();
  const dayQ = useDayClose(day);
  const sum = sumQ.data;
  const prev = prevP ? prevQ.data : undefined;
  const tenureP: ReportPeriod = { period: tenure, date: isoDay() };

  const counts: Partial<Record<View, number>> = {
    paper: docsCountQ.data?.total,
    buy: purchasesQ.data?.total,
    cash: dayQ.data?.entries.length,
  };

  return (
    <div className="fx">
      <nav className="fx-nav" aria-label="হিসাব">
        <div className="fx-nav-in">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={view === t.id ? "on" : ""} aria-current={view === t.id ? "page" : undefined} onClick={() => setView(t.id)}>
              <span className="fx-nav-ico">{t.icon}</span>
              <span className="fx-nav-txt"><b>{t.label}</b><small>{t.hint}</small></span>
              {counts[t.id] ? <em>{bn(counts[t.id] as number)}</em> : null}
            </button>
          ))}
        </div>
      </nav>

      <div className="fx-view" key={view}>
        {view === "sum" ? (
          <Summary
            range={range} setRange={setRange} from={from} to={to} setFrom={setFrom} setTo={setTo}
            sum={sum} prev={prev} loading={sumQ.isLoading} last14={monthQ.data?.last14Days ?? sum?.last14Days ?? []}
            accounts={accountsQ.data?.items ?? []} cashNet={accountsQ.data?.totalBalance ?? sum?.cashInHand ?? 0}
            pay={pay} setPay={setPay} orders={ordersQ.data?.items ?? []} ordersLoading={ordersQ.isLoading}
            go={setView}
          />
        ) : null}
        {view === "paper" ? <Papers paperKind={paperKind} setPaperKind={setPaperKind} onOpen={setOpen} /> : null}
        {view === "buy" ? <Purchases accounts={accountsQ.data?.items ?? []} sheet={newBuy} setSheet={setNewBuy} /> : null}
        {view === "cash" ? <CashBook day={day} setDay={setDay} accounts={accountsQ.data?.items ?? []} total={accountsQ.data?.totalBalance ?? 0} payable={sum?.supplierDue ?? 0} courier={sum?.courierDue ?? 0} /> : null}
        {view === "pnl" ? <PnlView tenure={tenure} setTenure={setTenure} period={tenureP} stockValue={sum?.stockValue ?? 0} onExport={(kind) => exportFinance(kind, tenureP).then(() => toast("CSV নামানো হয়েছে")).catch((e) => toast(adminErrorText(e)))} /> : null}
      </div>
      <DocModal doc={open} onClose={() => setOpen(null)} title={open ? `${open.kindLabel} · ${open.docNo}` : undefined} sub={open?.orderNo ? `অর্ডার ${open.orderNo} · Document` : undefined} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   সারাংশ
   ═══════════════════════════════════════════════════════════ */

type Sum = NonNullable<ReturnType<typeof useFinanceSummary>["data"]>;
type OrderRow = { id: string; orderNo: string; paymentMethod: string; paymentStatus: string; grandTotal: number; status: string; shipment: unknown };

const RANGE_LABEL: Record<Range, string> = { today: "আজ", "7": "গত ৭ দিন", "30": "গত ৩০ দিন", all: "শুরু থেকে", custom: "বাছাই করা সময়" };
const PREV_LABEL: Record<Range, string> = { today: "গতকালের তুলনায়", "7": "আগের ৭ দিনের তুলনায়", "30": "আগের ৩০ দিনের তুলনায়", all: "", custom: "আগের সমান সময়ের তুলনায়" };

function Summary({
  range, setRange, from, to, setFrom, setTo, sum, prev, loading, last14, accounts, cashNet, pay, setPay, orders, ordersLoading, go,
}: {
  range: Range; setRange: (r: Range) => void; from: string; to: string; setFrom: (v: string) => void; setTo: (v: string) => void;
  sum: Sum | undefined; prev: Sum | undefined; loading: boolean; last14: { day: string; billed: number }[];
  accounts: CashAccount[]; cashNet: number; pay: "all" | "got" | "due"; setPay: (v: "all" | "got" | "due") => void;
  orders: OrderRow[]; ordersLoading: boolean; go: (v: View) => void;
}) {
  const missingCost = sum?.missingCostProducts ?? 0;
  const billed = sum?.billed ?? 0;
  const due = sum?.codDue ?? 0;
  const profitOk = !missingCost;
  const hero = profitOk ? sum?.net ?? 0 : billed;
  const heroPrev = prev ? (profitOk ? prev.net : prev.billed) : null;
  const margin = billed > 0 ? Math.round(((sum?.gross ?? 0) / billed) * 100) : 0;
  const chart = last14.map((d) => ({ key: d.day, v: d.billed, label: bnDate(d.day) }));
  const total14 = chart.reduce((s, d) => s + d.v, 0);
  const peak = Math.max(0, ...chart.map((d) => d.v));
  const live = accounts.filter((a) => a.isActive);
  const liveSum = live.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const shown = orders;
  const shownTotal = shown.reduce((s, o) => s + o.grandTotal, 0);

  return (
    <div className="fx-stack">
      <section className="fx-hero">
        <div className="fx-hero-glow" aria-hidden="true" />
        <svg className="fx-hero-mark" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="96" /><circle cx="100" cy="100" r="72" /><circle cx="100" cy="100" r="48" /></svg>
        <div className="fx-hero-top">
          <p className="fx-kick"><span className="fx-kick-dot" />চলো · হিসাবখাত</p>
          <Chips dark value={range} onChange={setRange} items={[["today", "আজ"], ["7", "৭ দিন"], ["30", "৩০ দিন"], ["all", "সব"], ["custom", "কাস্টম"]]} />
        </div>
        {range === "custom" ? (
          <div className="fx-hero-range">
            <BnDateField compact value={from} onChange={setFrom} />
            <span>→</span>
            <BnDateField compact value={to} onChange={setTo} end />
          </div>
        ) : null}
        <div className="fx-hero-body">
          <div className="fx-hero-copy">
            <p className="fx-hero-label">{profitOk ? "নিট লাভ" : "কাস্টমার বিল"} · {RANGE_LABEL[range]}</p>
            <h2 className={`fx-hero-num${hero < 0 ? " neg" : ""}`}>{loading && !sum ? <Skel h={64} w={260} r={14} /> : <Num value={hero} />}</h2>
            <div className="fx-hero-meta">
              <Delta cur={hero} prev={heroPrev} dark />
              {heroPrev != null && PREV_LABEL[range] ? <small>{PREV_LABEL[range]}</small> : null}
              {!profitOk ? <span className="fx-lockpill">{FI.lock}লাভ বন্ধ · {bn(missingCost)}টি পণ্যে কেনা দাম নেই</span> : null}
            </div>
            <dl className="fx-hero-figs">
              <div><dt>বিক্রি (বিল)</dt><dd><Num value={billed} /> <Delta cur={billed} prev={prev?.billed} dark /></dd></div>
              <div><dt>গ্রস লাভ</dt><dd>{profitOk ? <Num value={sum?.gross ?? 0} /> : "—"}</dd></div>
              <div><dt>কাগজ</dt><dd>{bn(sum?.invoices ?? 0)} ইনভয়েস{sum?.creditNotes ? <small> · {bn(sum.creditNotes)} ক্রেডিট</small> : null}</dd></div>
            </dl>
          </div>
          <div className="fx-hero-chart">
            <div className="fx-hero-chart-head">
              <div><b>গত ১৪ দিনের বিল</b><small>মোট {tk(total14)} · সর্বোচ্চ {tk(peak)}</small></div>
            </div>
            <AreaChart data={chart} />
            <div className="fx-hero-axis"><small>{chart[0]?.label}</small><small>{chart[Math.floor(chart.length / 2)]?.label}</small><small>আজ</small></div>
          </div>
        </div>
      </section>

      {missingCost ? (
        <div className="fx-banner warn">
          <span className="fx-banner-ico">{FI.alert}</span>
          <div><b>{bn(missingCost)}টি পণ্যে কেনা দাম নেই</b><p>লাভের সংখ্যা বন্ধ রাখা হয়েছে — আগে পণ্যে কেনা দাম দিন। বিল ও বকেয়ার হিসাব ঠিক আছে।</p></div>
        </div>
      ) : sum && !sum.invoices && !sum.creditNotes ? (
        <div className="fx-banner"><span className="fx-banner-ico">{FI.paper}</span><div><b>এই সময়ে কোনো ইনভয়েস নেই</b><p>কনফার্মড বিক্রি হলে এখানে লাভ ও মার্জিন দেখাবে।</p></div></div>
      ) : null}

      <div className="fx-kpis">
        <button type="button" className="fx-kpi t-green" onClick={() => go("cash")} style={{ ["--i" as string]: 0 }}>
          <span className="fx-kpi-ico">{FI.wallet}</span>
          <span className="fx-kpi-lab">ক্যাশ হাতে</span>
          <b className="fx-kpi-val"><Num value={cashNet} /></b>
          <span className="fx-kpi-mix" aria-hidden="true">
            {live.map((a, i) => <i key={a.id} className={`c${i % 5}`} style={{ flexGrow: liveSum ? Math.max(0, a.balance) / liveSum : 1 }} />)}
          </span>
          <small>{bn(live.length)} খাত মিলিয়ে · ক্যাশবুক →</small>
        </button>
        <div className={`fx-kpi ${due ? "t-gold" : "t-green"}`} style={{ ["--i" as string]: 1 }}>
          <span className="fx-kpi-ico">{FI.clock}</span>
          <span className="fx-kpi-lab">COD বাকি</span>
          <b className="fx-kpi-val"><Num value={due} /></b>
          <span className="fx-kpi-bar" aria-hidden="true"><i style={{ width: `${billed ? clamp((due / billed) * 100) : 0}%` }} /></span>
          <small>{due ? `${bn(sum?.codDueOrders ?? 0)}টি অর্ডার · কুরিয়ারের কাছে${sum?.codWithCourier ? ` ${tk(sum.codWithCourier)}` : ""}` : "কোনো বকেয়া নেই"}</small>
        </div>
        <div className="fx-kpi t-blue" style={{ ["--i" as string]: 2 }}>
          <span className="fx-kpi-ico">{FI.box}</span>
          <span className="fx-kpi-lab">স্টকের মূল্য</span>
          <b className="fx-kpi-val"><Num value={sum?.stockValue ?? 0} /></b>
          <small>{bn(sum?.stockUnits ?? 0)} কপি × কেনা দাম</small>
        </div>
        <button type="button" className={`fx-kpi ${sum?.supplierDue ? "t-red" : "t-sage"}`} onClick={() => go("buy")} style={{ ["--i" as string]: 3 }}>
          <span className="fx-kpi-ico">{FI.store}</span>
          <span className="fx-kpi-lab">সাপ্লায়ার বাকি</span>
          <b className="fx-kpi-val"><Num value={sum?.supplierDue ?? 0} /></b>
          <small>{sum?.supplierDue ? "ক্রয় বিল থেকে পরিশোধ করুন →" : "সব পরিশোধ · ক্রয় →"}</small>
        </button>
        <button type="button" className={`fx-kpi ${sum?.courierDue ? "t-gold" : "t-sage"}`} onClick={() => go("cash")} style={{ ["--i" as string]: 4 }}>
          <span className="fx-kpi-ico">{FI.truck}</span>
          <span className="fx-kpi-lab">কুরিয়ার বাকি</span>
          <b className="fx-kpi-val"><Num value={sum?.courierDue ?? 0} /></b>
          <small>{sum?.courierDue ? "ক্যাশবুক থেকে কুরিয়ার দিন →" : "কুরিয়ারের কোনো পাওনা নেই"}</small>
        </button>
        <button type="button" className="fx-kpi t-wine has-ring" onClick={() => go("pnl")} style={{ ["--i" as string]: 5 }}>
          <span className="fx-kpi-ico">{FI.trend}</span>
          <span className="fx-kpi-lab">গ্রস লাভ · মার্জিন</span>
          <b className="fx-kpi-val">{profitOk ? <Num value={sum?.gross ?? 0} /> : "—"}</b>
          <small>{profitOk ? "বিলের উপর · লাভ-ক্ষতি →" : "কেনা দাম দিলে খুলবে"}</small>
          <span className="fx-kpi-ring"><Ring pct={profitOk ? margin : 0} tone={margin >= 25 ? "green" : margin >= 10 ? "gold" : "red"}>{profitOk ? `${bn(margin)}%` : "—"}</Ring></span>
        </button>
      </div>

      <div className="fx-split">
        <section className="fx-card">
          <header className="fx-card-head">
            <div><h3>অর্ডার অনুযায়ী</h3><p>{range === "custom" ? "কাস্টম সময়ে সব কনফার্মড অর্ডার" : `${RANGE_LABEL[range]} · কনফার্মড অর্ডার`} · {bn(shown.length)}টি · {tk(shownTotal)}</p></div>
            <Chips value={pay} onChange={setPay} items={[["all", "সব"], ["got", "পেয়েছি"], ["due", "বকেয়া"]]} />
          </header>
          {!shown.length ? (
            ordersLoading ? <div className="fx-skel-list">{[0, 1, 2, 3].map((i) => <Skel key={i} h={46} r={12} />)}</div> : <FxEmpty art="box" title="এই সময়ে কনফার্মড অর্ডার নেই" sub="অন্য সময় বা ফিল্টার বেছে দেখুন।" />
          ) : (
            <ul className="fx-orders">
              {shown.map((o, i) => {
                const got = o.paymentStatus !== "UNPAID";
                const ssl = isSslMethod(o.paymentMethod);
                return (
                  <li key={o.id} style={{ ["--i" as string]: Math.min(i, 12) }}>
                    <span className={`fx-om ${ssl ? "m-ssl" : o.paymentMethod === "COD" ? "m-cod" : "m-oth"}`}>{ssl ? FI.card : o.paymentMethod === "COD" ? FI.coins : FI.wallet}</span>
                    <span className="fx-on"><b>{o.orderNo}</b><small>{ssl ? "SSL · অনলাইন" : o.paymentMethod === "COD" ? "ক্যাশ অন ডেলিভারি" : o.paymentMethod}</small></span>
                    <span className="fx-oa">{tk(o.grandTotal)}</span>
                    <span className={`fx-pill ${got ? "ok" : "warn"}`}>{got ? "পেয়েছি" : "বকেয়া"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="fx-card">
          <header className="fx-card-head"><div><h3>টাকা কোথায় আছে</h3><p>খাত অনুযায়ী ব্যালান্স</p></div></header>
          {!live.length ? <div className="fx-skel-list">{[0, 1, 2].map((i) => <Skel key={i} h={36} r={10} />)}</div> : (
            <ul className="fx-where">
              {live.slice().sort((a, b) => b.balance - a.balance).map((a, i) => (
                <li key={a.id}>
                  <span className="fx-where-top"><b>{a.name}</b><span>{tk(a.balance)}</span></span>
                  <span className="fx-where-bar"><i className={`c${i % 5}`} style={{ width: `${liveSum ? clamp((Math.max(0, a.balance) / liveSum) * 100) : 0}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
          <div className="fx-where-foot"><span>মোট হাতে</span><b>{tk(cashNet)}</b></div>
          <button type="button" className="fx-link" onClick={() => go("cash")}>ক্যাশবুক খুলুন {FI.chevR}</button>
        </section>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   কাগজ
   ═══════════════════════════════════════════════════════════ */

function docTone(kind: string) {
  return kind === "RECEIPT" ? "rcpt" : kind === "CREDIT_NOTE" ? "cred" : "inv";
}

function Papers({
  paperKind, setPaperKind, onOpen,
}: {
  paperKind: string;
  setPaperKind: (v: string) => void;
  onOpen: (p: AdminDocument) => void;
}) {
  const [q, setQ] = useState("");
  const docsQ = useDocuments({ kind: paperKind === "all" ? undefined : DOC_KIND[paperKind], pageSize: 100, q: q.trim() || undefined });
  const papers = docsQ.data?.items ?? [];
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: AdminDocument[] }[] = [];
    const today = isoDay(); const yest = isoDay(Date.now() - DAY);
    for (const p of papers) {
      const k = isoDay(ms(p.issuedAt));
      const label = k === today ? "আজ" : k === yest ? "গতকাল" : bnDate(k, { day: "numeric", month: "long", year: "numeric" });
      const g = out[out.length - 1];
      if (g && g.key === k) g.items.push(p); else out.push({ key: k, label, items: [p] });
    }
    return out;
  }, [papers]);
  const total = papers.reduce((s, p) => s + (p.kind === "CREDIT_NOTE" ? 0 : p.total), 0);

  return (
    <div className="fx-stack">
      <section className="fx-card fx-papers">
        <header className="fx-card-head">
          <div><h3>ইনভয়েস, রিসিট, ক্রেডিট নোট</h3><p>{bn(docsQ.data?.total ?? papers.length)}টি কাগজ{papers.length ? ` · দেখানো ${tk(total)}` : ""}</p></div>
          <label className="fx-search">{FI.search}<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="নম্বর, অর্ডার বা নাম…" /></label>
        </header>
        <div className="fx-doc-filters">
          {([["all", "সব", FI.paper, ""], ["invoice", "ইনভয়েস", FI.paper, "inv"], ["receipt", "রিসিট", FI.receipt, "rcpt"], ["credit", "ক্রেডিট নোট", FI.credit, "cred"]] as const).map(([id, lab, ico, tone]) => (
            <button key={id} type="button" className={`fx-dchip ${tone}${paperKind === id ? " on" : ""}`} onClick={() => setPaperKind(id)}>{ico}{lab}</button>
          ))}
        </div>
        <p className="fx-info">ক্যাশ অন ডেলিভারিতে ইনভয়েস কাটে কনফার্মে, রিসিট ডেলিভারিতে। SSL-এ দুটোই কনফার্মে। ফেরত হলে ক্রেডিট নোট।</p>
        {!papers.length ? (
          docsQ.isLoading ? <div className="fx-skel-list">{[0, 1, 2, 3, 4].map((i) => <Skel key={i} h={58} r={14} />)}</div> : <FxEmpty art="paper" title={q ? "কিছু মেলেনি" : "এই কাগজ এখনো কাটেনি"} sub={q ? "অন্য শব্দ দিয়ে খুঁজুন।" : "অর্ডার কনফার্ম বা ডেলিভারি হলে কাগজ নিজে থেকেই তৈরি হয়।"} />
        ) : (
          <div className="fx-doc-groups">
            {groups.map((g) => (
              <div key={g.key} className="fx-doc-group">
                <h4><span>{g.label}</span><em>{bn(g.items.length)}টি</em></h4>
                <ul className="fx-docs">
                  {g.items.map((p, i) => {
                    const t = docTone(p.kind);
                    return (
                      <li key={p.id} style={{ ["--i" as string]: Math.min(i, 10) }}>
                        <button type="button" onClick={() => onOpen(p)}>
                          <span className={`fx-doc-ico ${t}`}>{t === "rcpt" ? FI.receipt : t === "cred" ? FI.credit : FI.paper}</span>
                          <span className="fx-doc-main">
                            <b>{p.docNo}<span className={`fx-kind ${t}`}>{p.kindLabel}</span></b>
                            <small>{p.orderNo ?? "—"}{p.customerName ? ` · ${p.customerName}` : ""}{p.paymentLabel ? ` · ${p.paymentLabel}` : ""}</small>
                          </span>
                          <span className="fx-doc-amt"><b className={t === "cred" ? "neg" : ""}>{t === "cred" ? "−" : ""}{tk(p.total)}</b><small>{new Date(ms(p.issuedAt)).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" })}</small></span>
                          <span className="fx-doc-go">{FI.chevR}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ক্রয়
   ═══════════════════════════════════════════════════════════ */

type PurchaseLine = { productId: string; title: string; qty: number; cost: number };

function Purchases({ accounts, sheet, setSheet }: { accounts: CashAccount[]; sheet: boolean; setSheet: (v: boolean) => void }) {
  const purchasesQ = usePurchases();
  const purchases = purchasesQ.data?.items ?? [];
  const live = accounts.filter((a) => a.isActive && a.type !== "GATEWAY");
  const [payFor, setPayFor] = useState<Purchase | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; items: Purchase[]; total: number; paid: number; due: number }>();
    for (const p of purchases) {
      const g = map.get(p.supplier.id) ?? { id: p.supplier.id, name: p.supplier.name, items: [], total: 0, paid: 0, due: 0 };
      g.items.push(p); g.total += p.total; g.paid += p.amountPaid; g.due += p.due;
      map.set(p.supplier.id, g);
    }
    return [...map.values()].sort((a, b) => b.due - a.due || b.total - a.total);
  }, [purchases]);
  const tot = groups.reduce((s, g) => ({ total: s.total + g.total, paid: s.paid + g.paid, due: s.due + g.due }), { total: 0, paid: 0, due: 0 });

  return (
    <div className="fx-stack">
      <section className="fx-buyhead">
        <div className="fx-buyhead-copy">
          <p className="fx-kick dark"><span className="fx-kick-dot" />সাপ্লায়ার খতিয়ান</p>
          <h2>ক্রয় বিল</h2>
          <p>সাপ্লায়ার, কপি, কেনা দাম — সেভ করলে স্টক বাড়ে আর ওই কেনা দাম পণ্যে বসে।</p>
        </div>
        <div className="fx-buystats">
          <div><small>মোট ক্রয়</small><b><Num value={tot.total} /></b></div>
          <div className="ok"><small>পরিশোধ</small><b><Num value={tot.paid} /></b></div>
          <div className={tot.due ? "bad" : ""}><small>বাকি</small><b><Num value={tot.due} /></b></div>
        </div>
        <button type="button" className="ap-btn primary fx-buy-new" onClick={() => setSheet(true)}>{FI.plus}নতুন ক্রয় বিল</button>
      </section>

      {!purchases.length ? (
        purchasesQ.isLoading ? <div className="fx-grid2">{[0, 1].map((i) => <Skel key={i} h={180} r={18} />)}</div> : (
          <section className="fx-card"><FxEmpty art="box" title="এখনো কোনো ক্রয় বিল নেই" sub="প্রথম চালান তুলুন — স্টক আর কেনা দাম একসাথে ঠিক হবে।" action={<button type="button" className="ap-btn primary" onClick={() => setSheet(true)}>{FI.plus}প্রথম ক্রয় বিল</button>} /></section>
        )
      ) : (
        <div className="fx-suppliers">
          {groups.map((g, gi) => {
            const pct = g.total ? clamp((g.paid / g.total) * 100) : 0;
            return (
              <section key={g.id} className="fx-sup" style={{ ["--i" as string]: Math.min(gi, 8) }}>
                <header>
                  <span className="fx-sup-av">{g.name.slice(0, 1)}</span>
                  <div className="fx-sup-name"><b>{g.name}</b><small>{bn(g.items.length)}টি বিল · মোট {tk(g.total)}</small></div>
                  <span className={`fx-pill ${g.due ? (g.paid ? "gold" : "warn") : "ok"}`}>{g.due ? `বাকি ${tk(g.due)}` : "সব পরিশোধ"}</span>
                </header>
                <div className="fx-sup-prog" aria-label={`${bn(Math.round(pct))}% পরিশোধ`}><i style={{ width: `${pct}%` }} /></div>
                <div className="fx-sup-legend"><span><em className="ok" />পরিশোধ {tk(g.paid)}</span><span>{bn(Math.round(pct))}%</span></div>
                <ul className="fx-bills">
                  {g.items.map((p) => (
                    <li key={p.id}>
                      <div className="fx-bill-top">
                        <span className="fx-bill-no"><b>{p.purchaseNo}</b><small>{new Date(ms(p.purchasedAt)).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" })}</small></span>
                        <span className="fx-bill-amt">{tk(p.total)}</span>
                      </div>
                      <div className="fx-bill-lines">
                        {p.items.map((l) => <span key={l.id}>{l.title} <em>× {bn(l.quantity)}</em></span>)}
                      </div>
                      {p.note ? <p className="fx-bill-note">{p.note}</p> : null}
                      <div className="fx-bill-foot">
                        <span className={`fx-pill ${p.paymentStatus === "PAID" ? "ok" : p.paymentStatus === "PARTIAL" ? "gold" : "warn"}`}>
                          {p.paymentStatus === "PAID" ? "পরিশোধ" : p.paymentStatus === "PARTIAL" ? `আংশিক · বাকি ${tk(p.due)}` : "বকেয়া"}
                        </span>
                        {p.due > 0 ? <button type="button" className="ap-btn sm" onClick={() => setPayFor(p)}>{FI.wallet}পরিশোধ করুন</button> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <PurchaseSheet open={sheet} onClose={() => setSheet(false)} live={live} />
      <PayPurchase purchase={payFor} onClose={() => setPayFor(null)} live={live} />
    </div>
  );
}

function PurchaseSheet({ open, onClose, live }: { open: boolean; onClose: () => void; live: CashAccount[] }) {
  const toast = useToast();
  const suppliersQ = useSuppliers();
  const createSup = useCreateSupplier();
  const createM = useCreatePurchase();
  const [find, setFind] = useState("");
  const pickerQ = useProductPicker(find.trim());
  const products = pickerQ.data ?? [];
  const [supplier, setSupplier] = useState("");
  const [when, setWhen] = useState(isoDay());
  const [paid, setPaid] = useState(true);
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  useEffect(() => { if (!account && live[0]) setAccount(live[0].id); }, [live, account]);
  useEffect(() => {
    if (!products.some((p) => p.id === productId) && products[0]) {
      setProductId(products[0].id);
      if (products[0].costPrice) setCost(products[0].costPrice);
    }
  }, [products, productId]);

  function pick(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p?.costPrice) setCost(p.costPrice);
  }

  function addLine() {
    const product = products.find((p) => p.id === productId);
    if (!product || qty < 1 || !(cost > 0)) {
      toast("পণ্য, কপি ও কেনা দাম দিন");
      return;
    }
    setLines((cur) => {
      const hit = cur.find((l) => l.productId === product.id);
      if (hit) return cur.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + qty, cost } : l));
      return [...cur, { productId: product.id, title: product.title, qty, cost }];
    });
  }

  async function save() {
    const name = supplier.trim();
    if (!name || !lines.length) {
      toast("সাপ্লায়ার ও অন্তত একটা লাইন দিন");
      return;
    }
    if (paid && !account) { toast("কোন খাত থেকে দেবেন বাছুন"); return; }
    let supplierId = (suppliersQ.data?.items ?? []).find((x) => x.name.trim() === name)?.id;
    if (!supplierId) {
      try { supplierId = (await createSup.mutateAsync({ name })).id; } catch { return; }
    }
    createM.mutate({
      supplierId, purchasedAt: when, note: note.trim() || undefined,
      lines: lines.map((l) => ({ productId: l.productId, quantity: l.qty, unitCost: l.cost })),
      payment: paid ? { accountId: account } : undefined,
      toast: paid ? "ক্রয় বিল সেভ · স্টক বেড়েছে · টাকা কমেছে" : "ক্রয় বিল সেভ · স্টক বেড়েছে · সাপ্লায়ার বকেয়া",
    }, { onSuccess: () => { setLines([]); setSupplier(""); setNote(""); onClose(); } });
  }

  const total = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const acc = live.find((a) => a.id === account);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={600}
      title="নতুন ক্রয় বিল"
      sub="সাপ্লায়ার → পণ্য → পরিশোধ। সেভ করলে স্টক বাড়বে।"
      footer={
        <div className="fx-sheet-foot">
          <div className="fx-sheet-total"><small>{bn(lines.length)} লাইন · {bn(units)} কপি</small><b>{tk(total)}</b></div>
          <button type="button" className="ap-btn ghost" onClick={onClose}>বাতিল</button>
          <button type="button" className="ap-btn primary" disabled={createM.isPending || createSup.isPending} onClick={() => void save()}>{FI.check}ক্রয় সেভ</button>
        </div>
      }
    >
      <div className="fx-sheet">
        <div className="fx-step"><span>১</span><b>সাপ্লায়ার ও তারিখ</b></div>
        <div className="fx-form2">
          <div>
            <label htmlFor="fx-sup-in">সাপ্লায়ার</label>
            <input id="fx-sup-in" list="fx-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="পাঞ্জেরী / রকমারি" />
            <datalist id="fx-suppliers">{(suppliersQ.data?.items ?? []).map((x) => <option key={x.id} value={x.name} />)}</datalist>
          </div>
          <BnDateField label="তারিখ" value={when} onChange={setWhen} />
        </div>

        <div className="fx-step"><span>২</span><b>পণ্য যোগ করুন</b></div>
        <label className="fx-search wide">{FI.search}<input value={find} onChange={(e) => setFind(e.target.value)} placeholder="পণ্য খুঁজুন…" /></label>
        <div className="fx-picker" role="listbox" aria-label="পণ্য">
          {!products.length ? <p className="fx-picker-empty">{pickerQ.isLoading ? "লোড হচ্ছে…" : "কোনো পণ্য মেলেনি"}</p> : products.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={p.id === productId} className={p.id === productId ? "on" : ""} onClick={() => pick(p.id)}>
              <span><b>{p.title}</b><small>{p.section.name}</small></span>
              <em>{p.costPrice ? `কেনা ${tk(p.costPrice)}` : "কেনা দাম নেই"}</em>
            </button>
          ))}
        </div>
        <div className="fx-lineadd">
          <div><label htmlFor="fx-qty">কপি</label><input id="fx-qty" type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} /></div>
          <div><label htmlFor="fx-cost">কেনা দাম (প্রতি কপি)</label><input id="fx-cost" type="number" min={1} value={cost || ""} onChange={(e) => setCost(Number(e.target.value) || 0)} /></div>
          <button type="button" className="ap-btn gold" onClick={addLine}>{FI.plus}লাইন যোগ</button>
        </div>
        {lines.length ? (
          <ul className="fx-lines">
            {lines.map((l) => (
              <li key={l.productId}>
                <span><b>{l.title}</b><small>{bn(l.qty)} × {tk(l.cost)}</small></span>
                <em>{tk(l.qty * l.cost)}</em>
                <button type="button" aria-label="বাদ" onClick={() => setLines((cur) => cur.filter((x) => x.productId !== l.productId))}>{FI.close}</button>
              </li>
            ))}
          </ul>
        ) : <p className="fx-hint">এখনো কোনো লাইন নেই — পণ্য বেছে কপি ও দাম দিয়ে “লাইন যোগ” চাপুন।</p>}

        <div className="fx-step"><span>৩</span><b>পরিশোধ</b></div>
        <div className="fx-paybox">
          <Toggle checked={paid} onChange={setPaid} label="এখনই পরিশোধ" sub={paid ? "নিচের খাত থেকে টাকা কমবে" : "সাপ্লায়ারের কাছে বকেয়া থাকবে"} />
          {paid ? (
            <div className="fx-accpick">
              {live.map((a) => (
                <button key={a.id} type="button" className={a.id === account ? "on" : ""} onClick={() => setAccount(a.id)}>
                  <b>{a.name}</b><small>{tk(a.balance)}</small>
                </button>
              ))}
            </div>
          ) : null}
          {paid && acc && total > acc.balance ? <p className="fx-warn-line">{FI.alert}{acc.name}-এ ব্যালান্স {tk(acc.balance)} — বিলের চেয়ে কম</p> : null}
        </div>
        <label htmlFor="fx-note">নোট</label>
        <input id="fx-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="চালান নম্বর, ঐচ্ছিক" />
      </div>
    </Drawer>
  );
}

function PayPurchase({ purchase, onClose, live }: { purchase: Purchase | null; onClose: () => void; live: CashAccount[] }) {
  const toast = useToast();
  const payM = usePayPurchase();
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState(0);
  useEffect(() => {
    if (purchase) { setAmount(purchase.due); setAccount((a) => a || live[0]?.id || ""); }
  }, [purchase, live]);
  function pay() {
    if (!purchase) return;
    if (!account || !(amount > 0) || amount > purchase.due) { toast(`খাত বাছুন, টাকা ১ থেকে ${tk(purchase.due)} এর মধ্যে`); return; }
    payM.mutate({ id: purchase.id, accountId: account, amount }, { onSuccess: onClose });
  }
  return (
    <Modal
      open={!!purchase}
      onClose={onClose}
      width={460}
      title="সাপ্লায়ারকে পরিশোধ"
      sub={purchase ? `${purchase.purchaseNo} · ${purchase.supplier.name} · বাকি ${tk(purchase.due)}` : undefined}
      footer={<><button type="button" className="ap-btn ghost" onClick={onClose}>বাতিল</button><button type="button" className="ap-btn primary" disabled={payM.isPending} onClick={pay}>{FI.check}পরিশোধ করুন</button></>}
    >
      <div className="fx-sheet">
        <label>কোন খাত থেকে</label>
        <div className="fx-accpick">
          {live.map((a) => (
            <button key={a.id} type="button" className={a.id === account ? "on" : ""} onClick={() => setAccount(a.id)}><b>{a.name}</b><small>{tk(a.balance)}</small></button>
          ))}
        </div>
        <label htmlFor="fx-pay-amt">টাকা</label>
        <div className="fx-amt"><span>৳</span><input id="fx-pay-amt" type="number" min={1} max={purchase?.due} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></div>
        {purchase ? <div className="fx-quick"><button type="button" onClick={() => setAmount(purchase.due)}>পুরো বাকি</button><button type="button" onClick={() => setAmount(Math.round(purchase.due / 2))}>অর্ধেক</button></div> : null}
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════
   ক্যাশবুক
   ═══════════════════════════════════════════════════════════ */

const ACC_TYPE: Record<string, string> = { CASH: "নগদ টাকা", BANK: "ব্যাংক", MOBILE_WALLET: "মোবাইল ওয়ালেট", GATEWAY: "পেমেন্ট গেটওয়ে" };
const accIcon = (t: string) => (t === "BANK" ? FI.bank : t === "MOBILE_WALLET" ? FI.phone : t === "GATEWAY" ? FI.card : FI.coins);

function CashBook({
  day, setDay, accounts, total, payable, courier,
}: {
  day: string;
  setDay: (v: string) => void;
  accounts: CashAccount[];
  total: number;
  payable: number;
  courier: number;
}) {
  const toast = useToast();
  const closeQ = useDayClose(day);
  const entryM = useManualEntry();
  const reverseM = useReverseEntry();
  const ask = useConfirmInput();
  const courierM = useCourierPayment();
  const ordersQ = useFinanceOrders("30", "all");
  const live = accounts.filter((a) => a.isActive);
  const [account, setAccount] = useState("");
  const [dir, setDir] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");
  const [courierId, setCourierId] = useState("");
  const [mode, setMode] = useState<"manual" | "courier">("manual");
  const [only, setOnly] = useState<string | null>(null);
  useEffect(() => { if (!account && live[0]) setAccount(live[0].id); }, [live, account]);
  const shipped = (ordersQ.data?.items ?? []).filter((o) => o.shipment);
  const dc = closeQ.data;
  const acct = only ? dc?.accounts.find((a) => a.account.id === only) : null;
  const opening = acct ? acct.opening : dc?.opening ?? 0;
  const dayIn = acct ? acct.in : dc?.in ?? 0;
  const dayOut = acct ? acct.out : dc?.out ?? 0;
  const close = acct ? acct.closing : dc?.closing ?? 0;
  const rows = (dc?.entries ?? []).filter((e) => !only || e.account.id === only).slice().sort((a, b) => ms(a.occurredAt) - ms(b.occurredAt));
  const today = isoDay();
  const flow = Math.max(1, dayIn, dayOut);

  function add() {
    if (!memo.trim() || !(amount > 0) || !account) {
      toast("খাত, টাকা ও খতিয়ান লিখুন");
      return;
    }
    entryM.mutate({ accountId: account, direction: dir === "in" ? "IN" : "OUT", amount, memo: memo.trim(), occurredAt: day }, { onSuccess: () => { setMemo(""); setAmount(0); } });
  }

  function payCourier() {
    if (!courierId || !account) {
      toast("কুরিয়ার খরচসহ অর্ডার বাছুন");
      return;
    }
    courierM.mutate({ orderId: courierId, accountId: account, occurredAt: day });
  }

  async function reverse(e: CashEntry) {
    const reason = await ask({
      tone: "warn",
      title: "এই এন্ট্রি উল্টাবেন?",
      body: <>«{e.memo}» — সমান অঙ্কের একটি উল্টো এন্ট্রি বসবে, খতিয়ানের ব্যালান্স বদলাবে। আসল এন্ট্রি মুছবে না।</>,
      details: [
        { label: "খতিয়ান", value: e.account.name },
        { label: e.direction === "IN" ? "ঢোকা" : "বের", from: `৳${bn(e.amount)}`, to: "উল্টানো" },
      ],
      input: { label: "কেন উল্টাচ্ছেন? (কারণ লগে থাকবে)", initial: "ভুল এন্ট্রি", minLength: 2, chips: ["ভুল এন্ট্রি", "ভুল অঙ্ক", "ভুল খতিয়ান", "ডাবল এন্ট্রি"] },
      confirmText: "হ্যাঁ, উল্টান",
    });
    if (!reason || reason.trim().length < 2) return;
    reverseM.mutate({ id: e.id, reason: reason.trim() });
  }

  return (
    <div className="fx-stack">
      <div className="fx-wallets" role="list">
        <button type="button" role="listitem" className={`fx-wallet total${!only ? " on" : ""}`} onClick={() => setOnly(null)} style={{ ["--i" as string]: 0 }}>
          <span className="fx-wallet-top"><span className="fx-wallet-chip" /><small>সব খাত</small></span>
          <span className="fx-wallet-bal"><Num value={total} /></span>
          <span className="fx-wallet-foot"><span>চলো · মোট হাতে</span><span>{bn(live.length)} খাত</span></span>
        </button>
        {live.map((a, i) => {
          const d = dc?.accounts.find((x) => x.account.id === a.id);
          const change = d ? d.in - d.out : 0;
          return (
            <button key={a.id} type="button" role="listitem" className={`fx-wallet g${i % 5}${only === a.id ? " on" : ""}`} onClick={() => setOnly(only === a.id ? null : a.id)} style={{ ["--i" as string]: i + 1 }}>
              <span className="fx-wallet-top"><span className="fx-wallet-ico">{accIcon(a.type)}</span><small>{ACC_TYPE[a.type] ?? a.type}</small></span>
              <span className="fx-wallet-name">{a.name}</span>
              <span className="fx-wallet-bal">{tk(a.balance)}</span>
              <span className="fx-wallet-foot">
                <span>{a.accountNo ? `•••• ${a.accountNo.slice(-4)}` : a.code.toUpperCase()}</span>
                {change ? <span className={change > 0 ? "up" : "dn"}>{change > 0 ? "+" : "−"}{tk(Math.abs(change)).replace("−", "")} {day === today ? "আজ" : "এই দিনে"}</span> : <span>শুরু {tk(a.openingBalance)}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <section className="fx-card fx-dayclose">
        <header className="fx-card-head">
          <div><h3>দিনের ক্লোজ{only && acct ? <span className="fx-filter-tag">{acct.account.name}<button type="button" aria-label="ফিল্টার সরান" onClick={() => setOnly(null)}>{FI.close}</button></span> : null}</h3><p>{bnDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
          <div className="fx-daynav">
            <button type="button" className="fx-iconbtn" aria-label="আগের দিন" onClick={() => setDay(isoDay(dayMs(day) - DAY))}>{FI.chevL}</button>
            <BnDateField compact value={day} onChange={setDay} />
            <button type="button" className="fx-iconbtn" aria-label="পরের দিন" disabled={day >= today} onClick={() => setDay(isoDay(dayMs(day) + DAY))}>{FI.chevR}</button>
            {day !== today ? <button type="button" className="ap-btn sm" onClick={() => setDay(today)}>আজ</button> : null}
          </div>
        </header>
        <div className="fx-ribbon">
          <div className="o"><small>শুরু</small><b>{closeQ.isLoading ? <Skel h={22} w={90} /> : <Num value={opening} />}</b></div>
          <span className="fx-ribbon-op">+</span>
          <div className="in"><small>ঢুকেছে</small><b><Num value={dayIn} /></b><i style={{ width: `${(dayIn / flow) * 100}%` }} /></div>
          <span className="fx-ribbon-op">−</span>
          <div className="out"><small>বেরিয়েছে</small><b><Num value={dayOut} /></b><i style={{ width: `${(dayOut / flow) * 100}%` }} /></div>
          <span className="fx-ribbon-op">=</span>
          <div className="c"><small>ক্লোজ</small><b><Num value={close} /></b></div>
        </div>
        <p className="fx-info">সাপ্লায়ার বকেয়া <b>{tk(payable)}</b> · কুরিয়ার বকেয়া <b>{tk(courier)}</b> — এ দুটো হাতের টাকায় গোনা হয়নি।</p>

        <div className="fx-cash-grid">
          <div className="fx-timeline-wrap">
            <h4 className="fx-sub">এন্ট্রি · {bn(rows.length)}টি</h4>
            {!rows.length ? (
              closeQ.isLoading ? <div className="fx-skel-list">{[0, 1, 2].map((i) => <Skel key={i} h={60} r={14} />)}</div> : <FxEmpty art="cash" title="এই দিনে কোনো এন্ট্রি নেই" sub="ডান পাশ থেকে হাতে এন্ট্রি বসাতে পারেন।" />
            ) : (
              <ol className="fx-timeline">
                {rows.map((e, i) => {
                  const rev = !!e.reversedById;
                  return (
                    <li key={e.id} className={`${e.direction === "IN" ? "in" : "out"}${rev ? " rev" : ""}${e.reversesId ? " fix" : ""}`} style={{ ["--i" as string]: Math.min(i, 12) }}>
                      <time>{new Date(ms(e.occurredAt)).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })}</time>
                      <span className="fx-tl-dot">{e.direction === "IN" ? FI.plus : FI.minus}</span>
                      <div className="fx-tl-card">
                        <div className="fx-tl-main">
                          <b>{e.memo}</b>
                          <span className="fx-tl-chips">
                            <span className="fx-chip">{e.kindLabel}</span>
                            <span className="fx-chip acc">{e.account.name}</span>
                            {rev ? <span className="fx-chip bad">উল্টানো</span> : e.reversesId ? <span className="fx-chip warn">উল্টো এন্ট্রি</span> : null}
                          </span>
                        </div>
                        <span className="fx-tl-amt">{e.direction === "IN" ? "+" : "−"}{tk(e.amount)}</span>
                        {!e.reversedById && !e.reversesId ? (
                          <button type="button" className="fx-tl-undo" onClick={() => void reverse(e)} title="এন্ট্রি উল্টান">{FI.undo}<span>উল্টান</span></button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <aside className="fx-composer">
            <div className="fx-composer-tabs">
              <Chips value={mode} onChange={setMode} items={[["manual", "হাতে লিখুন"], ["courier", "কুরিয়ার পরিশোধ"]]} />
            </div>
            <label>খাত</label>
            <div className="fx-accpick">
              {live.map((a) => <button key={a.id} type="button" className={a.id === account ? "on" : ""} onClick={() => setAccount(a.id)}><b>{a.name}</b><small>{tk(a.balance)}</small></button>)}
            </div>
            {mode === "manual" ? (
              <>
                <div className="fx-dir">
                  <button type="button" className={`in${dir === "in" ? " on" : ""}`} onClick={() => setDir("in")}>{FI.plus}ঢুকেছে</button>
                  <button type="button" className={`out${dir === "out" ? " on" : ""}`} onClick={() => setDir("out")}>{FI.minus}বেরিয়েছে</button>
                </div>
                <label htmlFor="fx-amt">টাকা</label>
                <div className={`fx-amt ${dir}`}><span>৳</span><input id="fx-amt" type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} placeholder="০" /></div>
                <label htmlFor="fx-memo">খতিয়ান</label>
                <input id="fx-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="প্যাকিং, বিজ্ঞাপন, হেল্পলাইন" />
                <div className="fx-quick">{["প্যাকিং", "বিজ্ঞাপন", "হেল্পলাইন", "ভাড়া"].map((m) => <button key={m} type="button" onClick={() => setMemo(m)}>{m}</button>)}</div>
                <button type="button" className={`ap-btn primary fx-wide${dir === "in" ? " fx-in" : ""}`} disabled={entryM.isPending} onClick={add}>{FI.check}এন্ট্রি বসান · {bnDate(day)}</button>
              </>
            ) : (
              <>
                <label htmlFor="fx-courier">অর্ডার</label>
                <select id="fx-courier" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
                  <option value="">অর্ডার বাছুন</option>
                  {shipped.map((o) => (
                    <option key={o.id} value={o.id}>{o.orderNo} · ৳{bn(o.grandTotal)}</option>
                  ))}
                </select>
                <p className="fx-hint">কুরিয়ারে যাওয়া গত ৩০ দিনের অর্ডার। এখন কুরিয়ার বকেয়া {tk(courier)}।</p>
                <button type="button" className="ap-btn primary fx-wide" disabled={courierM.isPending} onClick={payCourier}>{FI.truck}কুরিয়ার দিন · {bnDate(day)}</button>
              </>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   লাভ-ক্ষতি
   ═══════════════════════════════════════════════════════════ */

type Step = { key: string; label: string[]; value: number; kind: "total" | "pos" | "neg" };

function Waterfall({ steps }: { steps: Step[] }) {
  const W = 760; const H = 320; const top = 34; const bot = 54; const side = 8;
  let run = 0;
  const bars = steps.map((s) => {
    let a: number; let b: number;
    if (s.kind === "total") { a = 0; b = s.value; run = s.value; } else if (s.kind === "pos") { a = run; b = run + s.value; run = b; } else { a = run; b = run - s.value; run = b; }
    return { ...s, lo: Math.min(a, b), hi: Math.max(a, b), end: run };
  });
  const max = Math.max(1, ...bars.map((b) => b.hi));
  const min = Math.min(0, ...bars.map((b) => b.lo));
  const y = (v: number) => top + ((max - v) / (max - min)) * (H - top - bot);
  const slot = (W - side * 2) / bars.length;
  const bw = slot * 0.58;
  return (
    <div className="fx-wf-scroll">
      <svg className="fx-wf" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="লাভ-ক্ষতির ধাপ">
        <defs>
          <linearGradient id="fxWfTot" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8A2B38" /><stop offset="1" stopColor="#5C1B24" /></linearGradient>
          <linearGradient id="fxWfNet" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#E8C877" /><stop offset="1" stopColor="#B8914A" /></linearGradient>
          <linearGradient id="fxWfPos" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2E9A5C" /><stop offset="1" stopColor="#146C3A" /></linearGradient>
          <linearGradient id="fxWfNeg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#D9564A" /><stop offset="1" stopColor="#B42318" /></linearGradient>
        </defs>
        <line x1={side} x2={W - side} y1={y(0)} y2={y(0)} className="zero" />
        {bars.map((b, i) => {
          const x = side + slot * i + (slot - bw) / 2;
          const last = i === bars.length - 1;
          const fill = b.kind === "total" ? (last ? (b.value < 0 ? "url(#fxWfNeg)" : "url(#fxWfNet)") : "url(#fxWfTot)") : b.kind === "pos" ? "url(#fxWfPos)" : "url(#fxWfNeg)";
          const h = Math.max(2, y(b.lo) - y(b.hi));
          const next = bars[i + 1];
          return (
            <g key={b.key} className={`bar k-${b.kind}${b.kind === "neg" ? " down" : ""}`} style={{ ["--i" as string]: i }}>
              {next ? <line x1={x + bw} x2={x + slot} y1={y(b.end)} y2={y(b.end)} className="link" /> : null}
              <rect x={x} y={y(b.hi)} width={bw} height={h} rx={5} fill={fill} />
              <text x={x + bw / 2} y={y(b.hi) - 8} className={`val ${b.kind}`} textAnchor="middle">{b.kind === "neg" && b.value ? "−" : b.kind === "pos" && b.value ? "+" : ""}{tk(Math.abs(b.value)).replace("−", "")}</text>
              {b.label.map((l, li) => <text key={li} x={x + bw / 2} y={H - bot + 22 + li * 15} className={`lab${b.kind === "total" ? " tot" : ""}`} textAnchor="middle">{l}</text>)}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function PnlView({
  tenure, setTenure, period, stockValue, onExport,
}: {
  tenure: Tenure;
  setTenure: (v: Tenure) => void;
  period: ReportPeriod;
  stockValue: number;
  onExport: (kind: "pnl" | "cashbook" | "documents") => void;
}) {
  const pnlQ = usePnl(period);
  const catsQ = useCategoryReport(period);
  const empty: Pnl = { period: tenure, from: "", to: "", sales: 0, coupon: 0, netSales: 0, cogs: 0, gross: 0, marginPct: 0, deliveryIncome: 0, courierCost: 0, gatewayFee: 0, courierLoss: 0, net: 0, invoices: 0, creditNotes: 0, skipped: 0, missingCostProducts: 0, costsReady: true };
  const p = pnlQ.data ?? empty;
  const pnl = { sales: p.sales, coupon: p.coupon, cogs: p.cogs, shipIn: p.deliveryIncome, courier: p.courierCost, sslFee: p.gatewayFee, courierLoss: p.courierLoss, skipped: p.skipped, invoices: p.invoices, credits: p.creditNotes };
  const gross = p.gross;
  const net = p.net;
  const missingCost = p.missingCostProducts;
  const costsReady = p.costsReady && !missingCost;
  const cats = useMemo(() => (catsQ.data?.items ?? []).map((r) => ({ cat: r.category, qty: r.qty, sales: r.sales, cogs: r.cogs })).sort((a, b) => b.sales - a.sales), [catsQ.data]);
  const salesNet = pnl.sales - pnl.coupon;
  const margin = pnl.sales > 0 ? Math.round((gross / pnl.sales) * 100) : 0;
  const netPct = pnl.sales > 0 ? Math.round((net / pnl.sales) * 100) : 0;
  const label = tenure === "day" ? "আজকের" : tenure === "month" ? "এই মাসের" : "এই বছরের";
  const catMax = Math.max(1, ...cats.map((c) => c.sales));
  const steps: Step[] = [
    { key: "sales", label: ["বিক্রি"], value: pnl.sales, kind: "total" },
    { key: "coupon", label: ["কুপন"], value: pnl.coupon, kind: "neg" },
    { key: "netSales", label: ["নিট", "বিক্রি"], value: salesNet, kind: "total" },
    { key: "cogs", label: ["কেনা", "খরচ"], value: pnl.cogs, kind: "neg" },
    { key: "gross", label: ["গ্রস"], value: gross, kind: "total" },
    { key: "ship", label: ["ডেলিভারি", "আয়"], value: pnl.shipIn, kind: "pos" },
    { key: "courier", label: ["কুরিয়ার", "খরচ"], value: pnl.courier, kind: "neg" },
    { key: "fee", label: ["গেটওয়ে", "ফি"], value: pnl.sslFee, kind: "neg" },
    { key: "loss", label: ["কুরিয়ার", "লস"], value: pnl.courierLoss, kind: "neg" },
    { key: "net", label: ["নিট লাভ"], value: net, kind: "total" },
  ];
  const other = Math.max(0, pnl.coupon + pnl.courier + pnl.sslFee + pnl.courierLoss - pnl.shipIn);
  const mixTotal = Math.max(1, pnl.cogs + other + Math.max(0, net));
  const per100 = (v: number) => bn(Math.round((v / mixTotal) * 100));

  return (
    <div className="fx-stack">
      <div className="fx-toolbar">
        <Chips value={tenure} onChange={setTenure} items={[["day", "আজ"], ["month", "এই মাস"], ["year", "এই বছর"]]} />
        {p.from ? <span className="fx-range-txt">{bnDate(p.from.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })} – {bnDate(p.to.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</span> : null}
        <div className="fx-exports">
          <button type="button" className="ap-btn sm" onClick={() => onExport("pnl")}>{FI.down}লাভ-ক্ষতি CSV</button>
          <button type="button" className="ap-btn sm" onClick={() => onExport("cashbook")}>{FI.down}ক্যাশবুক CSV</button>
          <button type="button" className="ap-btn sm" onClick={() => onExport("documents")}>{FI.down}কাগজ CSV</button>
        </div>
      </div>

      {missingCost ? (
        <div className="fx-banner warn">
          <span className="fx-banner-ico">{FI.lock}</span>
          <div><b>{bn(missingCost)}টি পণ্যে কেনা দাম নেই</b><p>{label} লাভ, কেনা খরচ ও মার্জিন বন্ধ। বিল ও ক্যাশবুক আগের ট্যাবে ঠিক আছে।</p></div>
        </div>
      ) : (
        <div className="fx-pnl-hero">
          <div className="fx-pnl-net">
            <p className="fx-kick"><span className="fx-kick-dot" />{label} নিট লাভ</p>
            <h2 className={net < 0 ? "neg" : ""}><Num value={net} /></h2>
            <p>বিক্রির {bn(netPct)}% · শিপিং, কুরিয়ার, ফি ও ফেরতের লস বাদে</p>
          </div>
          <div className="fx-pnl-fig"><small>বিক্রি</small><b><Num value={pnl.sales} /></b><span>কুপন বাদে {tk(salesNet)}</span></div>
          <div className="fx-pnl-fig ring">
            <Ring pct={margin} size={68} stroke={7} tone={margin >= 25 ? "green" : margin >= 10 ? "gold" : "red"}>{bn(margin)}%</Ring>
            <div><small>গ্রস লাভ</small><b><Num value={gross} /></b><span>বিক্রির উপর মার্জিন</span></div>
          </div>
        </div>
      )}

      <section className="fx-card">
        <header className="fx-card-head">
          <div><h3>{label} হিসাব</h3><p>শুধু স্ন্যাপশটসহ ইনভয়েস ও ক্রেডিট নোট — পেন্ডিং গোনা হয় না। {pnl.skipped ? `${bn(pnl.skipped)}টিতে কেনা দামের স্ন্যাপশট নেই, সেগুলো লাভে বাদ।` : `${bn(pnl.invoices)} ইনভয়েস · ${bn(pnl.credits)} ক্রেডিট নোট।`}</p></div>
        </header>
        {pnlQ.isLoading && !pnlQ.data ? <Skel h={280} r={16} /> : costsReady && pnl.sales > 0 ? (
          <div className="fx-pnl-grid">
            <div className="fx-pnl-chart">
              <Waterfall steps={steps} />
              <div className="fx-mix">
                <div className="fx-mix-bar">
                  <i className="c" style={{ width: `${(pnl.cogs / mixTotal) * 100}%` }} />
                  <i className="o" style={{ width: `${(other / mixTotal) * 100}%` }} />
                  <i className="n" style={{ width: `${(Math.max(0, net) / mixTotal) * 100}%` }} />
                </div>
                <div className="fx-mix-leg">
                  <span><em className="c" />কেনা দাম {tk(pnl.cogs)}</span>
                  <span><em className="o" />অন্যান্য খরচ {tk(other)}</span>
                  <span><em className="n" />নেট {tk(net)}</span>
                </div>
                <p className="fx-hint">প্রতি ৳১০০-তে: কেনা ৳{per100(pnl.cogs)} · খরচ ৳{per100(other)} · লাভ ৳{per100(Math.max(0, net))}</p>
              </div>
            </div>
            <dl className="fx-stmt">
              <div className="plus"><dt>বিক্রি</dt><dd>{tk(pnl.sales)}</dd></div>
              <div className="minus"><dt>কুপন</dt><dd>−{tk(pnl.coupon)}</dd></div>
              <div className="sub"><dt>নিট বিক্রি</dt><dd>{tk(salesNet)}</dd></div>
              <div className="minus"><dt>কেনা দাম</dt><dd>−{tk(pnl.cogs)}</dd></div>
              <div className="sub"><dt>গ্রস</dt><dd>{tk(gross)}</dd></div>
              <div className="plus"><dt>ডেলিভারি আয়</dt><dd>+{tk(pnl.shipIn)}</dd></div>
              <div className="minus"><dt>কুরিয়ার</dt><dd>−{tk(pnl.courier)}</dd></div>
              <div className="minus"><dt>SSL / গেটওয়ে ফি</dt><dd>−{tk(pnl.sslFee)}</dd></div>
              <div className="minus"><dt>ফেরতের কুরিয়ার লস</dt><dd>−{tk(pnl.courierLoss)}</dd></div>
              <div className={`net${net < 0 ? " neg" : ""}`}><dt>নেট</dt><dd>{tk(net)}</dd></div>
            </dl>
          </div>
        ) : costsReady ? (
          <FxEmpty art="chart" title={`${label} কোনো বিক্রি নেই`} sub="কনফার্মড ইনভয়েস হলে এখানে ধাপে ধাপে লাভ দেখাবে।" />
        ) : (
          <FxEmpty art="chart" title="লাভের হিসাব বন্ধ" sub="সব পণ্যে কেনা দাম দিলে এখানে ধাপে ধাপে লাভ দেখাবে।" />
        )}
        {costsReady ? <p className="fx-info">{FI.box}স্টকে আটকে <b>{tk(stockValue)}</b> — বাকি কপি × কেনা দাম।</p> : null}
      </section>

      {cats.length ? (
        <section className="fx-card">
          <header className="fx-card-head"><div><h3>ক্যাটাগরি র‍্যাংকিং</h3><p>বিক্রি অনুযায়ী · {bn(cats.length)}টি ক্যাটাগরি</p></div></header>
          <ol className="fx-cats">
            {cats.map((row, i) => {
              const g = row.sales - row.cogs;
              const pct = row.sales > 0 ? Math.round((g / row.sales) * 100) : 0;
              return (
                <li key={row.cat} style={{ ["--i" as string]: Math.min(i, 12) }}>
                  <span className={`fx-rank${i < 3 ? ` top${i}` : ""}`}>{bn(i + 1)}</span>
                  <div className="fx-cat-main">
                    <div className="fx-cat-top"><b>{row.cat}</b><span>{tk(row.sales)}</span></div>
                    <div className="fx-cat-bar"><i style={{ width: `${(row.sales / catMax) * 100}%` }} />{costsReady ? <i className="g" style={{ width: `${(Math.max(0, g) / catMax) * 100}%` }} /> : null}</div>
                    <small>{bn(row.qty)} কপি{costsReady ? ` · লাভ ${tk(g)}` : ""}</small>
                  </div>
                  {costsReady ? <span className={`fx-mpill ${pct >= 30 ? "hi" : pct >= 15 ? "mid" : "lo"}`}>{bn(pct)}%</span> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
