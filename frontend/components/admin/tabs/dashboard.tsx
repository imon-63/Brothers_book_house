"use client";

import "./dashboard.css";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { bn } from "@/lib/format";
import { useMe } from "@/lib/api/auth";
import { ms } from "@/lib/api/admin/core";
import { useCouponDefs, useDashboard, type Dashboard, type DashPeriod } from "@/lib/api/admin/dashboard";
import { useRecentActivity, type ActivityRow } from "@/lib/api/admin/activity";
import { useAdminPrefs, useSetAdminPrefs } from "@/lib/api/admin/prefs";
import { useAdminSection } from "@/lib/admin/section-context";
import { isSslMethod } from "@/lib/admin/status";
import { SectionIcon } from "@/components/admin/shared";
import { useAdminNav, type AdminTab } from "@/components/admin/nav";
import {
  AreaChart, Avatar, Badge, Bars, Card, Columns, Donut, Empty, Ico, PageHead, Segmented, Stat, StatusPill,
  ago, downloadCsv, num, tk, type Tone,
} from "@/components/admin/ui";

/* ═══════════════════════════════════════════════════════════
   Dashboard · ড্যাশবোর্ড
   Every number comes from GET /admin/reports/dashboard (SQL in
   Asia/Dhaka time). This file only shapes it for the cards.
   ═══════════════════════════════════════════════════════════ */

type Period = "1" | "7" | "30" | "90";
const PERIODS: { id: Period; label: string }[] = [
  { id: "1", label: "আজ" },
  { id: "7", label: "৭ দিন" },
  { id: "30", label: "৩০ দিন" },
  { id: "90", label: "৯০ দিন" },
];
const API_PERIOD: Record<Period, DashPeriod> = { "1": "today", "7": "7d", "30": "30d", "90": "90d" };
const PERIOD_KEY = "cholo_admin_dash_period";
const HOUR = 3_600_000;
const WEEK_BN = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];
/** Bangladesh week starts on Saturday. */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

const SECTION_TONES: Tone[] = ["wine", "sage", "blue", "gold", "ink", "green"];
const BUILTIN_TONE: Record<string, Tone> = { book: "wine", food: "sage", gadget: "blue" };

/* ───────── pure helpers ───────── */

function hourName(h: number) {
  const part = h < 4 ? "রাত" : h < 6 ? "ভোর" : h < 12 ? "সকাল" : h < 15 ? "দুপুর" : h < 18 ? "বিকেল" : h < 20 ? "সন্ধ্যা" : "রাত";
  return `${part} ${bn(h % 12 || 12)}টা`;
}
function greeting(h: number) {
  if (h < 5) return "শুভ রাত্রি";
  if (h < 12) return "শুভ সকাল";
  if (h < 16) return "শুভ দুপুর";
  if (h < 18) return "শুভ বিকেল";
  if (h < 20) return "শুভ সন্ধ্যা";
  return "শুভ রাত্রি";
}
function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
/** API delta is a % with one decimal (null = nothing to compare) → whole % for the Stat chip. */
function dlt(d: number | null | undefined) {
  return d == null ? null : Math.round(d);
}

type Bucket = { label: string; csv: string; revenue: number; orders: number };

/** series[].t is the Dhaka wall-clock bucket start encoded as UTC. */
function toBuckets(d: Dashboard | undefined, period: Period): Bucket[] {
  if (!d) return [];
  return d.series.map((b) => {
    const t = new Date(b.t);
    const label = period === "1"
      ? hourName(t.getUTCHours())
      : t.toLocaleDateString("bn-BD", { day: "numeric", month: "short", timeZone: "UTC" });
    const csv = period === "1" ? `${b.t.slice(0, 10)} ${b.t.slice(11, 13)}:00` : b.t.slice(0, 10);
    return { label, csv, revenue: b.revenue, orders: b.orders };
  });
}

/* ───────── component ───────── */

export function DashboardTab() {
  const { go } = useAdminNav();
  const { me } = useMe();
  const prefs = useAdminPrefs();
  const savePrefs = useSetAdminPrefs();

  const [period, setPeriodState] = useState<Period>("7");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PERIOD_KEY) as Period | null;
      if (saved && PERIODS.some((p) => p.id === saved)) setPeriodState(saved);
    } catch { /* ignore */ }
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const p = prefs.dashPeriod as Period | undefined;
    if (p && PERIODS.some((x) => x.id === p)) setPeriodState(p);
  }, [prefs.dashPeriod]);

  function setPeriod(p: Period) {
    setPeriodState(p);
    try { localStorage.setItem(PERIOD_KEY, p); } catch { /* ignore */ }
    savePrefs.mutate({ dashPeriod: p });
  }

  const q = useDashboard(API_PERIOD[period]);
  const todayQ = useDashboard("today");
  const d = q.data;
  const series = useMemo(() => toBuckets(d, period), [d, period]);
  const best = useMemo(() => series.reduce<Bucket | null>((b, x) => (x.revenue > (b?.revenue ?? 0) ? x : b), null), [series]);
  const k = d?.kpis;

  const periodWord = period === "1" ? "গতকাল এই সময়ের তুলনায়" : `আগের ${bn(period)} দিনের তুলনায়`;
  const hour = new Date(now).getHours();
  const firstName = (me?.name || "অ্যাডমিন").split(" ")[0];
  const dateLine = new Date(now).toLocaleDateString("bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  function exportCsv() {
    const head = ["period", "revenue_bdt", "orders"];
    const rows = series.map((b) => [b.csv, Math.round(b.revenue), b.orders]);
    const day = new Date(now).toISOString().slice(0, 10);
    downloadCsv(`cholo-dashboard-${period === "1" ? "today" : `${period}d`}-${day}.csv`, [head, ...rows]);
  }

  const revenue = k?.revenue.value ?? 0;
  const orders = k?.orders.value ?? 0;
  const profit = k?.grossProfit.value ?? 0;
  const unknown = k?.grossProfit.unknownCostOrders ?? 0;
  const margin = revenue > 0 ? pct(profit, revenue) : 0;
  const cancelled = (d?.pipeline.CANCELLED ?? 0) + (d?.pipeline.RETURNED ?? 0);
  const pendingN = k?.pending.value ?? 0;
  const today = todayQ.data?.kpis;

  return (
    <div className="db">
      <PageHead
        title={`${greeting(hour)}, ${firstName}`}
        en="Overview"
        sub={
          <span className="db-sub">
            <span>{dateLine}</span>
            <i aria-hidden="true" />
            <span>আজ এখন পর্যন্ত <b>{tk(today?.revenue.value ?? 0)}</b> · <b>{bn(today?.orders.value ?? 0)}</b>টি অর্ডার</span>
          </span>
        }
        actions={
          <>
            <Segmented value={period} onChange={setPeriod} options={PERIODS} />
            <button type="button" className="ap-btn" onClick={exportCsv} title="দৈনিক হিসাব CSV ফাইলে নামান">
              {Ico.download}Export
            </button>
          </>
        }
      />

      {/* KPI row */}
      <div className="db-kpis">
        <Stat label="বিক্রি" en="Revenue" tone="wine" icon={Ico.trend} value={tk(revenue)}
          delta={dlt(k?.revenue.delta)} hint={periodWord} spark={series.map((b) => b.revenue)} onClick={() => go("finance", "sum")} />
        <Stat label="অর্ডার" en="Orders" tone="gold" icon={Ico.orders} value={num(orders)}
          delta={dlt(k?.orders.delta)} hint={cancelled ? `${bn(cancelled)}টি বাতিল` : "কোনো বাতিল নেই"} spark={series.map((b) => b.orders)} onClick={() => go("orders")} />
        <Stat label="গড় অর্ডার" en="AOV" tone="blue" icon={Ico.cash} value={tk(k?.aov.value ?? 0)}
          delta={dlt(k?.aov.delta)} hint="প্রতি অর্ডারে গড়"
          spark={series.map((b) => (b.orders ? b.revenue / b.orders : 0))} />
        <Stat label="গ্রস প্রফিট" en="Gross profit" tone="green" icon={Ico.spark} value={tk(profit)}
          delta={dlt(k?.grossProfit.delta)}
          hint={unknown ? <span className="db-warn-hint">কেনা দাম নেই · {bn(unknown)}টি অর্ডার</span> : orders ? `মার্জিন ${bn(margin)}%` : "লাইন-কস্ট থেকে"}
          onClick={() => go("finance", "pnl")} />
        <Stat label="নতুন কাস্টমার" en="New customers" tone="sage" icon={Ico.customers} value={num(k?.newCustomers.value ?? 0)}
          delta={dlt(k?.newCustomers.delta)} hint="প্রথম অর্ডার এই সময়ে" onClick={() => go("customers")} />
        <Stat label="অপেক্ষমাণ" en="Pending" tone={pendingN ? "red" : "ink"} icon={Ico.clock} value={num(pendingN)}
          hint={pendingN && k?.pending.oldestAt ? `পুরনোটি ${ago(ms(k.pending.oldestAt))}` : "সব কনফার্ম করা"} onClick={() => go("orders", "status:pending")} />
      </div>

      <div className="db-grid">
        <TrendCard series={series} revenue={revenue} orders={orders} best={best} period={period} />
        <AttentionCard now={now} d={d} low={prefs.lowStock} />
        <PipelineCard d={d} />
        <PaymentCard d={d} />
        <VerticalCard d={d} />
        <TopProductsCard d={d} low={prefs.lowStock} />
        <TopCustomersCard d={d} />
        <CategoryCard d={d} />
        <RhythmCard d={d} />
        <CouponCard d={d} orders={orders} />
        <RecentOrdersCard d={d} />
        <ActivityCard />
      </div>
    </div>
  );
}

/* ───────── trend ───────── */

function TrendCard({ series, revenue, orders, best, period }: { series: Bucket[]; revenue: number; orders: number; best: Bucket | null; period: Period }) {
  const active = series.filter((b) => b.orders > 0).length;
  const perUnit = period === "1" ? "ঘণ্টা" : "দিন";
  return (
    <Card className="db-trend db-wide" title="বিক্রি ও অর্ডার" en="Revenue & orders"
      sub={period === "1" ? "আজ ঘণ্টা ধরে" : `গত ${bn(period)} দিন, দিন ধরে`}
      actions={
        <div className="db-legend">
          <span><i className="db-dot" />বিক্রি</span>
          <span><i className="db-dash" />অর্ডার</span>
        </div>
      }>
      <div className="db-trend-sum">
        <div><small>মোট বিক্রি · Total</small><b>{tk(revenue)}</b></div>
        <div><small>অর্ডার · Orders</small><b>{num(orders)}</b></div>
        <div><small>সেরা {perUnit} · Best</small><b>{best ? tk(best.revenue) : "—"}</b>{best ? <em>{best.label}</em> : null}</div>
        <div><small>সক্রিয় {perUnit} · Active</small><b>{bn(active)}<span>/{bn(series.length)}</span></b></div>
      </div>
      <div className="db-chart">
        <AreaChart
          height={250}
          points={series.map((b) => ({ label: b.label }))}
          series={[
            { key: "rev", name: "বিক্রি", tone: "wine", values: series.map((b) => b.revenue), format: tk },
            { key: "ord", name: "অর্ডার", tone: "gold", values: series.map((b) => b.orders) },
          ]}
        />
        {revenue <= 0 ? (
          <div className="db-chart-empty">
            <span>{Ico.trend}</span>
            <b>এই সময়ে এখনো বিক্রি নেই</b>
            <small>অর্ডার এলেই গ্রাফ নিজে থেকে ভরে উঠবে</small>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ───────── needs attention ───────── */

type Task = { id: string; tone: Tone; icon: ReactNode; count: number; title: string; en: string; sub: string; cta: string; tab: AdminTab; focus?: string };

function AttentionCard({ now, d, low }: { now: number; d: Dashboard | undefined; low: number }) {
  const { go } = useAdminNav();
  const tasks = useMemo(() => {
    const out: Task[] = [];
    const a = d?.attention;
    if (!a) return out;
    if (a.pendingOrders) {
      out.push({ id: "pending", tone: "gold", icon: Ico.clock, count: a.pendingOrders, title: "অর্ডার কনফার্ম করুন", en: "To confirm",
        sub: a.oldestPendingAt ? `পুরনোটি ${ago(ms(a.oldestPendingAt))}` : "কনফার্মের অপেক্ষায়", cta: "কনফার্ম", tab: "orders", focus: "status:pending" });
    }
    if (a.unrepliedChats) {
      out.push({ id: "chat", tone: "blue", icon: Ico.chat, count: a.unrepliedChats, title: "চ্যাটের উত্তর বাকি", en: "Unreplied",
        sub: "গ্রাহক উত্তরের অপেক্ষায়", cta: "উত্তর দিন", tab: "chat" });
    }
    if (a.toShip) {
      out.push({ id: "pack", tone: "wine", icon: Ico.box, count: a.toShip, title: "প্যাক করে কুরিয়ারে দিন", en: "To ship",
        sub: "কনফার্ম ও প্রস্তুত হচ্ছে এমন অর্ডার", cta: "দেখুন", tab: "orders", focus: "status:run" });
    }
    if (a.outOfStock) {
      out.push({ id: "oos", tone: "red", icon: Ico.alert, count: a.outOfStock, title: "স্টক শেষ", en: "Out of stock",
        sub: "এই পণ্যগুলো এখন বিক্রি হচ্ছে না", cta: "রিস্টক", tab: "products", focus: "stock:out" });
    }
    if (a.lowStock) {
      out.push({ id: "low", tone: "gold", icon: Ico.products, count: a.lowStock, title: "স্টক কমে আসছে", en: "Low stock",
        sub: `${bn(low)} বা তার কম কপি`, cta: "দেখুন", tab: "products", focus: "stock:low" });
    }
    if (a.codToCollect > 0) {
      out.push({ id: "cod", tone: "sage", icon: Ico.cash, count: 1, title: "COD টাকা আসা বাকি", en: "Cash to collect",
        sub: `${tk(a.codToCollect)} কুরিয়ার থেকে আসবে`, cta: "ক্যাশবুক", tab: "finance", focus: "cash" });
    }
    if (a.dealsEnding) {
      out.push({ id: "deal", tone: "wine", icon: Ico.tag, count: a.dealsEnding, title: "ছাড় শেষ হচ্ছে", en: "Deals ending",
        sub: "২৪ ঘণ্টার মধ্যে শেষ হবে", cta: "বাড়ান", tab: "products", focus: "deal" });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, low, now]);

  const total = tasks.reduce((s, t) => s + t.count, 0);

  return (
    <Card className="db-attn" title="এখনই করুন" en="Needs attention"
      sub={tasks.length ? `${bn(tasks.length)} ধরনের কাজ · মোট ${bn(total)}টি` : "সব কিছু নিয়ন্ত্রণে"}
      actions={tasks.length ? <Badge tone="red" dot>{bn(total)}</Badge> : <Badge tone="green">{Ico.check}সব ঠিক</Badge>}>
      {tasks.length ? (
        <ul className="db-tasks">
          {tasks.map((t) => (
            <li key={t.id} className={`t-${t.tone}`}>
              <button type="button" onClick={() => go(t.tab, t.focus)}>
                <span className="db-task-ico">{t.icon}<em>{t.count > 99 ? "৯৯+" : bn(t.count)}</em></span>
                <span className="db-task-txt">
                  <b>{t.title}<small>{t.en}</small></b>
                  <span>{t.sub}</span>
                </span>
                <span className="db-task-cta">{t.cta}{Ico.chevR}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="db-allclear">
          <div className="db-confetti" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
          <span className="db-allclear-ico">{Ico.check}</span>
          <b>দারুণ! কোনো কাজ বাকি নেই</b>
          <p>সব অর্ডার কনফার্ম, চ্যাটের উত্তর দেওয়া, স্টক ঠিকঠাক। এক কাপ চা হয়ে যাক ☕</p>
        </div>
      )}
    </Card>
  );
}

/* ───────── pipeline ───────── */

function PipelineCard({ d }: { d: Dashboard | undefined }) {
  const { go } = useAdminNav();
  const stat = useMemo(() => {
    const p = d?.pipeline ?? {};
    const g = (k: string) => p[k] ?? 0;
    const data = [
      { label: "অপেক্ষমাণ", value: g("PENDING"), tone: "gold" as Tone },
      { label: "কনফার্ম", value: g("CONFIRMED"), tone: "wine" as Tone },
      { label: "প্রস্তুত হচ্ছে", value: g("PROCESSING"), tone: "ink" as Tone },
      { label: "কুরিয়ারে", value: g("HANDED_TO_COURIER"), tone: "blue" as Tone },
      { label: "ডেলিভারিতে", value: g("OUT_FOR_DELIVERY"), tone: "sage" as Tone },
      { label: "ডেলিভার্ড", value: g("DELIVERED"), tone: "green" as Tone },
      { label: "বাতিল/ফেরত", value: g("CANCELLED") + g("RETURNED"), tone: "red" as Tone },
    ];
    const total = data.reduce((s, x) => s + x.value, 0);
    return { data, total, delivered: g("DELIVERED"), cancelled: g("CANCELLED") + g("RETURNED") };
  }, [d]);

  return (
    <Card className="db-pipe" title="অর্ডার পাইপলাইন" en="Status" sub="এই সময়ের অর্ডার কোন ধাপে"
      actions={<button type="button" className="ap-btn ghost sm" onClick={() => go("orders")}>সব{Ico.chevR}</button>}>
      {stat.total ? (
        <>
          <Donut data={stat.data.filter((x) => x.value > 0)} size={150} thick={20}
            center={<><b>{num(stat.total)}</b><small>অর্ডার</small></>} />
          <div className="db-mini-kpis">
            <div><small>ডেলিভারি হার</small><b>{bn(pct(stat.delivered, stat.total - stat.cancelled))}%</b></div>
            <div><small>বাতিল হার</small><b className={pct(stat.cancelled, stat.total) >= 20 ? "bad" : ""}>{bn(pct(stat.cancelled, stat.total))}%</b></div>
            <div><small>অপেক্ষমাণ</small><b>{bn(d?.pipeline.PENDING ?? 0)}</b></div>
          </div>
        </>
      ) : (
        <Empty icon={Ico.orders} title="কোনো অর্ডার নেই" sub="এই সময়ের মধ্যে কোনো অর্ডার আসেনি" />
      )}
    </Card>
  );
}

/* ───────── payment mix ───────── */

function PaymentCard({ d }: { d: Dashboard | undefined }) {
  const { go } = useAdminNav();
  const m = useMemo(() => {
    let ssl = 0, sslN = 0, cod = 0, codN = 0, paid = 0, due = 0;
    for (const r of d?.payments ?? []) {
      const s = isSslMethod(r.method) || r.method !== "COD";
      if (s) { ssl += r.total; sslN += r.orders; } else { cod += r.total; codN += r.orders; }
      if (r.paid) paid += r.total; else due += r.total;
    }
    return { ssl, sslN, cod, codN, paid, due, total: ssl + cod };
  }, [d]);

  if (!m.total) {
    return (
      <Card className="db-pay" title="পেমেন্ট" en="Payment mix">
        <Empty icon={Ico.cash} title="কোনো পেমেন্ট নেই" sub="অর্ডার এলে COD ও SSLCOMMERZ-এর ভাগ এখানে দেখা যাবে" />
      </Card>
    );
  }
  const sslP = pct(m.ssl, m.total);
  const paidP = pct(m.paid, m.total);
  return (
    <Card className="db-pay" title="পেমেন্ট" en="Payment mix" sub="কোন পথে টাকা আসছে"
      actions={<button type="button" className="ap-btn ghost sm" onClick={() => go("finance", "cash")}>ক্যাশবুক{Ico.chevR}</button>}>
      <div className="db-split">
        <div className="db-split-head"><span>পদ্ধতি · Method</span></div>
        <div className="db-split-bar" role="img" aria-label={`SSLCOMMERZ ${sslP}%, COD ${100 - sslP}%`}>
          <i className="db-c-blue" style={{ width: `${sslP}%` }} />
          <i className="db-c-gold" style={{ width: `${100 - sslP}%` }} />
        </div>
        <div className="db-split-legend">
          <div><i className="db-c-blue" /><span>SSLCOMMERZ<small>{bn(m.sslN)}টি · অনলাইন</small></span><b>{tk(m.ssl)}</b></div>
          <div><i className="db-c-gold" /><span>ক্যাশ অন ডেলিভারি<small>{bn(m.codN)}টি · COD</small></span><b>{tk(m.cod)}</b></div>
        </div>
      </div>
      <div className="db-split">
        <div className="db-split-head"><span>আদায় · Collection</span><b>{bn(paidP)}% হাতে</b></div>
        <div className="db-split-bar" role="img" aria-label={`আদায় ${paidP}%`}>
          <i className="db-c-green" style={{ width: `${paidP}%` }} />
          <i className="db-c-line" style={{ width: `${100 - paidP}%` }} />
        </div>
        <div className="db-split-legend">
          <div><i className="db-c-green" /><span>পাওয়া গেছে<small>Paid</small></span><b>{tk(m.paid)}</b></div>
          <div><i className="db-c-line" /><span>বকেয়া<small>Due · COD</small></span><b className={m.due ? "warn" : ""}>{tk(m.due)}</b></div>
        </div>
      </div>
    </Card>
  );
}

/* ───────── by section (dynamic) / category ───────── */

function VerticalCard({ d }: { d: Dashboard | undefined }) {
  const { sections } = useAdminSection();
  const rows = useMemo(() => {
    const by = new Map((d?.sections ?? []).map((r) => [r.section, r]));
    const codes = [...sections.map((s) => s.code), ...[...by.keys()].filter((c) => !sections.some((s) => s.code === c))];
    const total = [...by.values()].reduce((s, r) => s + r.revenue, 0);
    return {
      total,
      list: codes.map((code, i) => {
        const r = by.get(code);
        const sec = sections.find((s) => s.code === code);
        return { id: code, sec, name: sec?.name ?? code, revenue: r?.revenue ?? 0, qty: r?.units ?? 0, orders: r?.orders ?? 0, share: pct(r?.revenue ?? 0, total), tone: BUILTIN_TONE[code] ?? SECTION_TONES[i % SECTION_TONES.length] };
      }),
    };
  }, [d, sections]);

  return (
    <Card className="db-vert" title="বিভাগ অনুযায়ী" en="By vertical" sub={rows.total ? `মোট পণ্য বিক্রি ${tk(rows.total)}` : "এই সময়ে পণ্য বিক্রি নেই"}>
      <ul className="db-verts">
        {rows.list.map((v) => (
          <li key={v.id} className={`t-${v.tone}`}>
            <span className="db-vert-ico"><SectionIcon code={v.id} section={v.sec} /></span>
            <div className="db-vert-body">
              <div className="db-vert-top"><b>{v.name}</b><strong>{tk(v.revenue)}</strong></div>
              <div className="db-vert-track"><i style={{ width: `${v.share}%` }} /></div>
              <small>{bn(v.qty)}টি পণ্য · {bn(v.orders)}টি অর্ডার<em>{bn(v.share)}%</em></small>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CategoryCard({ d }: { d: Dashboard | undefined }) {
  const rows = useMemo(() => {
    const list = d?.categories ?? [];
    const total = list.reduce((s, r) => s + r.revenue, 0);
    return list.slice(0, 6).map((r) => ({ key: r.category ?? "—", label: r.category ?? "অন্যান্য", value: r.revenue, sub: `${bn(r.units)}টি বিক্রি · ${bn(pct(r.revenue, total))}%` }));
  }, [d]);

  return (
    <Card className="db-cat" title="ক্যাটাগরি" en="By category" sub="সবচেয়ে বেশি বিক্রি">
      {rows.length ? <Bars rows={rows} format={tk} tone="wine" /> : <Empty icon={Ico.cats} title="ডেটা নেই" sub="এই সময়ে কোনো ক্যাটাগরিতে বিক্রি হয়নি" />}
    </Card>
  );
}

/* ───────── top products ───────── */

function Thumb({ title }: { title: string }) {
  return <span className="db-thumb swatch" style={{ background: "#7A2430" }}>{title.trim().slice(0, 1)}</span>;
}

function TopProductsCard({ d, low }: { d: Dashboard | undefined; low: number }) {
  const { go } = useAdminNav();
  const rows = (d?.topProducts ?? []).slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <Card className="db-top db-wide" pad={false} title="সেরা পণ্য" en="Top products"
      sub="এই সময়ে সবচেয়ে বেশি বিক্রি"
      actions={<button type="button" className="ap-btn ghost sm" onClick={() => go("products")}>সব পণ্য{Ico.chevR}</button>}>
      {rows.length ? (
        <div className="ap-table-wrap">
          <table className="ap-table db-table">
            <thead>
              <tr><th>#</th><th>পণ্য · Product</th><th className="num">বিক্রি · Units</th><th className="num">আয় · Revenue</th><th className="num">স্টক · Left</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className="click" onClick={() => go("products", r.id)}>
                  <td className="db-rank">{bn(i + 1)}</td>
                  <td>
                    <div className="db-prod">
                      <Thumb title={r.title} />
                      <span><b>{r.title}</b></span>
                    </div>
                  </td>
                  <td className="num">{num(r.units)}</td>
                  <td className="num">
                    <div className="db-rev">
                      <b>{tk(r.revenue)}</b>
                      <span><i style={{ width: `${(r.revenue / max) * 100}%` }} /></span>
                    </div>
                  </td>
                  <td className="num">
                    {r.stock <= 0 ? <Badge tone="red" dot>নেই</Badge> : r.stock <= low ? <Badge tone="gold" dot>{num(r.stock)}</Badge> : <span className="db-stock">{num(r.stock)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={Ico.products} title="এই সময়ে বিক্রি নেই" sub="অর্ডার এলে সেরা পণ্য এখানে দেখা যাবে" />
      )}
    </Card>
  );
}

/* ───────── top customers ───────── */

function TopCustomersCard({ d }: { d: Dashboard | undefined }) {
  const { go } = useAdminNav();
  const rows = (d?.topCustomers ?? []).filter((c) => c.spent > 0).slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.spent));

  return (
    <Card className="db-cust" title="সেরা কাস্টমার" en="Top customers" sub="এই সময়ে সবচেয়ে বেশি কেনাকাটা"
      actions={<button type="button" className="ap-btn ghost sm" onClick={() => go("customers")}>সব{Ico.chevR}</button>}>
      {rows.length ? (
        <ul className="db-people">
          {rows.map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => go("customers", c.id)}>
                <span className="db-people-av"><Avatar name={c.name} size={38} />{i === 0 ? <i title="সেরা">{Ico.star}</i> : null}</span>
                <span className="db-people-txt">
                  <b>{c.name}</b>
                  <small>{bn(c.orders)}টি অর্ডার · গড় {tk(c.orders ? Math.round(c.spent / c.orders) : 0)}</small>
                  <span className="db-people-bar"><i style={{ width: `${(c.spent / max) * 100}%` }} /></span>
                </span>
                <strong>{tk(c.spent)}</strong>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={Ico.customers} title="এখনো কেউ কেনেনি" sub="এই সময়ে কোনো সফল অর্ডার নেই" />
      )}
    </Card>
  );
}

/* ───────── rhythm (hours + weekdays) ───────── */

function RhythmCard({ d }: { d: Dashboard | undefined }) {
  const r = useMemo(() => {
    const hours = d?.hours ?? Array.from({ length: 24 }, () => 0);
    const days = d?.weekdays ?? Array.from({ length: 7 }, () => 0);
    const peakH = hours.indexOf(Math.max(...hours));
    const week = WEEK_ORDER.map((i) => days[i] ?? 0);
    const peakD = WEEK_ORDER[week.indexOf(Math.max(...week))];
    return { hours, week, peakH, peakD, total: hours.reduce((s, x) => s + x, 0) };
  }, [d]);
  const weekMax = Math.max(1, ...r.week);

  return (
    <Card className="db-rhythm" title="ব্যস্ত সময়" en="Busiest hours"
      sub={r.total ? <>সবচেয়ে বেশি অর্ডার <b className="db-hl">{hourName(r.peakH)}</b> ও <b className="db-hl">{WEEK_BN[r.peakD]}বার</b></> : "অর্ডার এলে প্যাটার্ন দেখা যাবে"}>
      <div className="db-hours">
        <Columns values={r.hours} labels={r.hours.map((_, h) => hourName(h))} tone="wine" height={84} />
        <div className="db-axis"><span>১২টা</span><span>৬টা</span><span>১২টা</span><span>৬টা</span><span>১১টা</span></div>
      </div>
      <div className="db-week" aria-label="সপ্তাহের দিন অনুযায়ী অর্ডার">
        {r.week.map((v, i) => (
          <div key={i} className={v && v === weekMax ? "peak" : ""} title={`${WEEK_BN[WEEK_ORDER[i]]} · ${bn(v)}টি অর্ডার`}>
            <span><i style={{ height: `${Math.max(6, (v / weekMax) * 100)}%`, animationDelay: `${i * 50}ms` }} /></span>
            <small>{WEEK_BN[WEEK_ORDER[i]]}</small>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ───────── coupons ───────── */

function CouponCard({ d, orders }: { d: Dashboard | undefined; orders: number }) {
  const { go } = useAdminNav();
  const defs = useCouponDefs();
  const rows = useMemo(() => {
    const byCode = new Map((defs.data ?? []).map((c) => [c.code.toUpperCase(), c]));
    return (d?.coupons ?? []).map((r) => ({ ...r, def: byCode.get(r.code.toUpperCase()) })).sort((a, b) => b.uses - a.uses || b.revenue - a.revenue);
  }, [d, defs.data]);
  const uses = rows.reduce((s, r) => s + r.uses, 0);
  const off = rows.reduce((s, r) => s + r.discount, 0);
  const couponRate = pct(uses, orders);

  return (
    <Card className="db-coupon" title="কুপন" en="Coupons"
      sub={uses ? `${bn(uses)} বার ব্যবহার · ${tk(off)} ছাড় · ${bn(couponRate)}% অর্ডারে` : "এই সময়ে কুপন ব্যবহার হয়নি"}
      actions={<button type="button" className="ap-btn ghost sm" onClick={() => go("settings", "coupons")}>ম্যানেজ{Ico.chevR}</button>}>
      {rows.length ? (
        <ul className="db-coupons">
          {rows.slice(0, 5).map((r) => (
            <li key={r.code} className={!r.active ? "off" : ""}>
              <code>{r.code}</code>
              <span className="db-coupon-mid">
                <b>{r.def ? (r.def.type === "PERCENT" ? `${bn(r.def.value)}% ছাড়` : `${tk(r.def.value)} ছাড়`) : "কুপন"}</b>
                <small>{r.uses ? `${bn(r.uses)} বার · ${tk(r.revenue)} বিক্রি` : "এখনো ব্যবহার হয়নি"}</small>
              </span>
              <span className="db-coupon-end">
                <strong>{r.discount ? `−${tk(r.discount)}` : "—"}</strong>
                <Badge tone={r.active ? "green" : "ink"} dot>{r.active ? "চালু" : "বন্ধ"}</Badge>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={Ico.tag} title="কোনো কুপন নেই" sub="সেটিংস থেকে একটি কুপন বানান" />
      )}
    </Card>
  );
}

/* ───────── recent orders ───────── */

function RecentOrdersCard({ d }: { d: Dashboard | undefined }) {
  const { go } = useAdminNav();
  const rows = d?.recentOrders ?? [];
  return (
    <Card className="db-recent" pad={false} title="সাম্প্রতিক অর্ডার" en="Recent orders"
      actions={<button type="button" className="ap-btn ghost sm" onClick={() => go("orders")}>সব অর্ডার{Ico.chevR}</button>}>
      {rows.length ? (
        <ul className="db-orders">
          {rows.map((o) => (
            <li key={o.id}>
              <button type="button" onClick={() => go("orders", o.orderNo)} className={o.status === "PENDING" ? "hold" : ""}>
                <Avatar name={o.contactName || "গেস্ট"} size={36} />
                <span className="db-order-txt">
                  <b>{o.contactName || "গেস্ট"}<code>{o.orderNo}</code></b>
                  <small>{o.paymentMethod === "COD" ? "ক্যাশ অন ডেলিভারি" : o.paymentMethod}</small>
                </span>
                <span className="db-order-end">
                  <strong>{tk(o.grandTotal)}</strong>
                  <span><StatusPill status={o.status} /></span>
                </span>
                <time>{ago(ms(o.placedAt))}<em>{isSslMethod(o.paymentMethod) ? "SSL" : "COD"}</em></time>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={Ico.orders} title="এখনো কোনো অর্ডার নেই" sub="প্রথম অর্ডারটি এলেই এখানে দেখা যাবে" />
      )}
    </Card>
  );
}

/* ───────── activity ───────── */

const KIND_ICON: Record<string, ReactNode> = {
  order: Ico.orders, product: Ico.products, finance: Ico.cash, settings: Ico.settings, customer: Ico.user, chat: Ico.chat, auth: Ico.logout, inventory: Ico.box,
};
const KIND_TONE: Record<string, string> = {
  order: "gold", product: "wine", finance: "green", settings: "ink", customer: "sage", chat: "blue", auth: "ink", inventory: "wine",
};
const KIND_TAB: Record<string, AdminTab> = { order: "orders", product: "products", customer: "customers", inventory: "products" };

/** Where an audit row should deep-link (only for entity types that have a screen). */
export function activityLink(a: ActivityRow): { tab: AdminTab; focus: string | null } | null {
  const t = (a.entityType ?? "").toLowerCase();
  if (t === "bundle") return { tab: "packs", focus: null };
  if (t === "section" || t === "category") return { tab: "settings", focus: "cats" };
  if (t === "coupon") return { tab: "settings", focus: "coupons" };
  const tab = KIND_TAB[a.area];
  if (!tab || !a.entityId) return null;
  if (tab === "orders" && t !== "order") return null;
  if (tab === "products" && t !== "product") return null;
  if (tab === "customers" && t !== "customer") return null;
  return { tab, focus: a.entityId };
}

function ActivityCard() {
  const { go } = useAdminNav();
  const q = useRecentActivity(8);
  const rows = q.data?.items ?? [];
  return (
    <Card className="db-activity" title="সাম্প্রতিক কাজ" en="Activity"
      sub={rows.length ? "সর্বশেষ পরিবর্তন" : undefined}
      actions={<button type="button" className="ap-btn ghost sm" onClick={() => go("activity")}>সব দেখুন{Ico.chevR}</button>}>
      {rows.length ? (
        <ol className="db-feed">
          {rows.map((a) => {
            const link = activityLink(a);
            const body = (
              <>
                <span className={`db-feed-ico k-${KIND_TONE[a.area] ?? "ink"}`}>{KIND_ICON[a.area] ?? Ico.activity}</span>
                <span className="db-feed-txt">
                  <span>{a.summary}</span>
                  <small>{a.actorName || "সিস্টেম"} · {ago(ms(a.createdAt))}</small>
                </span>
              </>
            );
            return (
              <li key={a.id}>
                {link ? <button type="button" onClick={() => go(link.tab, link.focus)}>{body}</button> : <div>{body}</div>}
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty icon={Ico.activity} title="এখনো কিছু ঘটেনি" sub="অর্ডার, পণ্য বা সেটিংসে পরিবর্তন করলে এখানে লগ হবে" />
      )}
    </Card>
  );
}
