"use client";

import "./customers.css";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bn, localPhone } from "@/lib/format";
import { DAY, phoneKey, SEGMENT_LABEL, type Segment } from "@/lib/admin/insights";
import { isSslMethod } from "@/lib/admin/status";
import { useAdminSection } from "@/lib/admin/section-context";
import { adminErrorText, ms as toMs, useToast } from "@/lib/api/admin/core";
import {
  exportCustomers, useBlockCustomer, useBulkCustomerTag, useCustomer, useCustomerKpis, useCustomerTags, useCustomers, useSetCustomerTags, useUpdateCustomer,
  tagNames, type CustomerDetail, type CustomerFilter, type CustomerRow,
} from "@/lib/api/admin/customers";
import { useAdminNav } from "@/components/admin/nav";
import {
  AreaChart, Avatar, Badge, Card, CopyBtn, Donut, Drawer, Empty, Ico, Kbd, Menu, Modal, PageHead, SearchInput,
  Segmented, Spark, Stat, StatusPill, Toggle, ago, dateOnly, downloadCsv, num, tk, when, useSelection, type Tone,
} from "@/components/admin/ui";

/* ───────── types & constants ───────── */

type SegTab = "all" | Segment | "blocked";
type SortKey = "last" | "spent" | "orders" | "aov" | "name";
type Kind = "all" | "reg" | "guest";
type View = "list" | "cards";

/** One customer row as this screen renders it (mapped from the API). */
type Customer = {
  key: string; name: string; phone: string; email: string; registered: boolean; live: number; cancelled: number; total: number;
  spent: number; aov: number; first: number; last: number; segment: Segment; blocked: boolean; blockedReason: string; tags: string[]; spark: number[];
};
type CustomerMeta = { note: string; tags: string[]; blocked: boolean };

function toCustomer(r: CustomerRow): Customer {
  return {
    key: r.id, name: r.name || "গেস্ট", phone: r.phone ?? "", email: r.email ?? "", registered: r.registered, live: r.liveOrders, cancelled: r.cancelledOrders,
    total: r.ordersCount, spent: r.totalSpent, aov: r.aov, first: toMs(r.firstOrderAt), last: toMs(r.lastOrderAt),
    segment: (["new", "regular", "vip", "risk", "sleep"].includes(r.segment) ? r.segment : "new") as Segment, blocked: r.blocked, blockedReason: r.blockedReason ?? "",
    tags: tagNames(r.tags), spark: r.spark ?? [],
  };
}
const metaOf = (c: Customer): CustomerMeta => ({ note: "", tags: c.tags, blocked: c.blocked });

/* ───────── tag pills — each tag in its own colour (customer_tags.color) ───────── */

function useTagColor() {
  const q = useCustomerTags();
  const map = useMemo(() => new Map((q.data?.tags ?? []).map((t) => [t.name, t.color || ""])), [q.data]);
  return useCallback((name: string) => map.get(name) || "#8A6230", [map]);
}

function TagPill({ name, color }: { name: string; color: string }) {
  const vip = name.trim().toUpperCase() === "VIP";
  return (
    <i className={`cu-tag${vip ? " vip" : ""}`} style={{ ["--tc" as string]: color }} title={`ট্যাগ · ${name}`}>
      {vip ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" /></svg> : <span className="cu-tag-dot" aria-hidden="true" />}
      {name}
    </i>
  );
}

function TagPills({ tags, max, color }: { tags: string[]; max: number; color: (n: string) => string }) {
  return (
    <>
      {tags.slice(0, max).map((t) => <TagPill key={t} name={t} color={color(t)} />)}
      {tags.length > max ? <i className="cu-tag more" title={tags.slice(max).join(", ")}>+{bn(tags.length - max)}</i> : null}
    </>
  );
}

const SEG_TONE: Record<Segment, Tone> = { vip: "gold", regular: "green", new: "blue", sleep: "ink", risk: "red" };
const SEG_ORDER: Segment[] = ["vip", "regular", "new", "sleep", "risk"];
const SORTS: { id: SortKey; bn: string; en: string }[] = [
  { id: "last", bn: "শেষ অর্ডার", en: "Recent" },
  { id: "spent", bn: "মোট খরচ", en: "Spent" },
  { id: "orders", bn: "অর্ডার সংখ্যা", en: "Orders" },
  { id: "aov", bn: "গড় অর্ডার", en: "AOV" },
  { id: "name", bn: "নাম", en: "Name" },
];
const PAGE_SIZES = [10, 25, 50, 100];

/* ───────── helpers ───────── */

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const isoDay = (ts: number) => (ts ? new Date(ts).toISOString().slice(0, 10) : "");

function waLink(phone: string) {
  const d = phoneKey(phone);
  if (!d) return "";
  if (d.startsWith("880")) return `https://wa.me/${d}`;
  return `https://wa.me/88${d}`;
}

function monthLabel(ym: string, withYear = false) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("bn-BD", withYear ? { month: "short", year: "2-digit" } : { month: "short" });
}

function daysSince(ts: number, now = Date.now()) {
  return ts ? Math.max(0, Math.floor((now - ts) / DAY)) : 0;
}

function csvRows(list: Customer[]) {
  return [
    ["Name", "Phone", "Email", "Registered", "Segment", "Orders", "Spent (BDT)", "AOV (BDT)", "First order", "Last order", "Tags", "Blocked"],
    ...list.map((c) => [
      c.name, c.phone, c.email, c.registered ? "yes" : "no", SEGMENT_LABEL[c.segment].en, c.live,
      Math.round(c.spent), Math.round(c.aov), isoDay(c.first), isoDay(c.last), c.tags.join("; "), c.blocked ? "yes" : "no",
    ]),
  ];
}

function useNarrow(query = "(max-width: 980px)") {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

/* ───────── main ───────── */

export function CustomersTab() {
  const toast = useToast();
  const tagColor = useTagColor();
  const { focus, go, clearFocus } = useAdminNav();

  const [view, setView] = useState<View>("list");
  const [seg, setSeg] = useState<SegTab>("all");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<SortKey>("last");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const selection = useSelection<string>();
  const narrow = useNarrow();
  const shown: View = narrow ? "cards" : view;
  const now = Date.now();
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);

  const filter: CustomerFilter = useMemo(() => ({
    q: term || undefined,
    segment: seg !== "all" && seg !== "blocked" ? seg : undefined,
    blocked: seg === "blocked" ? true : undefined,
    kind: kind === "reg" ? "registered" : kind === "guest" ? "guest" : undefined,
    tag: tag || undefined,
    sort,
    order: dir === 1 ? "asc" : "desc",
  }), [term, seg, kind, tag, sort, dir]);
  const listQ = useCustomers(filter, size, page);
  const kpiQ = useCustomerKpis();
  const tagsQ = useCustomerTags();
  const bulkTagM = useBulkCustomerTag();
  const allTags = useMemo(() => (tagsQ.data?.tags ?? []).map((t) => t.name), [tagsQ.data]);

  const list = useMemo(() => (listQ.data?.items ?? []).map(toCustomer), [listQ.data]);
  const totalFound = listQ.data?.total ?? 0;
  const k = kpiQ.data;

  /* focus from nav / command palette (customer id) */
  useEffect(() => {
    if (!focus) return;
    if (/^[0-9a-f-]{36}$/i.test(focus)) setOpenKey(focus);
    else setQ(focus);
    clearFocus();
  }, [focus, clearFocus]);

  /* KPIs */
  const kpi = {
    total: k?.total ?? 0, reg: k?.registered ?? 0, guest: k?.guests ?? 0, buyers: k?.buyers ?? 0, repeat: k?.repeaters ?? 0,
    repeatRate: Math.round(k?.repeatRate ?? 0), ltv: k?.avgLtv ?? 0, top: k?.topSpend ?? 0, newThis: k?.newThisMonth ?? 0, newPrev: k?.newLastMonth ?? 0,
    risk: k?.atRisk ?? 0, sleep: k?.dormant ?? 0, newSeries: (k?.newSeries ?? []).map((x) => x.count), cumSeries: (k?.cumulative ?? []).map((x) => x.count),
  };

  /* filtering (server-side) */
  const segCount: Record<SegTab, number> = {
    all: kpi.total, vip: k?.segments.vip ?? 0, regular: k?.segments.regular ?? 0, new: k?.segments.new ?? 0,
    sleep: k?.segments.sleep ?? 0, risk: k?.segments.risk ?? 0, blocked: k?.blocked ?? 0,
  };
  const customers = { length: kpi.total };

  useEffect(() => setPage(1), [term, seg, kind, tag, sort, dir, size]);
  const pages = Math.max(1, Math.ceil(totalFound / size));
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /* new page → back to the top of the list; edge shadows follow the scroll position */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    markScroll(el);
  }, [list, size]);
  useEffect(() => { if (page > pages) setPage(pages); }, [page, pages]);
  const goPage = (n: number) => {
    setPage(Math.min(Math.max(1, n), pages));
    document.querySelector(".cu-table-card, .cu-cards")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const pager = totalFound > 0
    ? <CustomerPager page={page} pages={pages} total={totalFound} size={size} loading={listQ.isFetching} onPage={goPage} onSize={setSize} />
    : null;

  const visible = list;
  const filtered = !!q || seg !== "all" || kind !== "all" || !!tag;
  const resetFilters = () => { setQ(""); setSeg("all"); setKind("all"); setTag(""); };

  const sortBy = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 1 ? -1 : 1));
    else { setSort(key); setDir(key === "name" ? 1 : -1); }
  };

  /* selection / bulk */
  const selectedRows = list.filter((c) => selection.has(c.key));
  const allVisibleOn = visible.length > 0 && visible.every((c) => selection.has(c.key));
  const someVisibleOn = visible.some((c) => selection.has(c.key));

  useEffect(() => {
    if (!selection.size || openKey) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") selection.clear(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selection, openKey]);

  const exportList = (rows: Customer[] | null, label: string) => {
    if (rows) {
      if (!rows.length) { toast("এক্সপোর্ট করার মতো কাস্টমার নেই"); return; }
      downloadCsv(`customers-${label}-${isoDay(Date.now())}.csv`, csvRows(rows));
      toast(`${bn(rows.length)} জন কাস্টমার CSV-তে এক্সপোর্ট হয়েছে`);
      return;
    }
    exportCustomers(filter).then(() => toast("কাস্টমার তালিকা CSV-তে এক্সপোর্ট হয়েছে")).catch((e) => toast(adminErrorText(e)));
  };

  const bulkTag = (t: string) => {
    const ids = selectedRows.filter((c) => !c.tags.includes(t)).map((c) => c.key);
    if (!ids.length) { toast(`সবার আগেই "${t}" ট্যাগ আছে`); return; }
    bulkTagM.mutate({ customerIds: ids, tag: t, action: "add", toast: `${bn(ids.length)} জনকে "${t}" ট্যাগ দেওয়া হয়েছে` });
  };
  const bulkUntag = (t: string) => {
    const ids = selectedRows.filter((c) => c.tags.includes(t)).map((c) => c.key);
    if (!ids.length) { toast("কারও এই ট্যাগ ছিল না"); return; }
    bulkTagM.mutate({ customerIds: ids, tag: t, action: "remove", toast: `${bn(ids.length)} জনের "${t}" ট্যাগ সরানো হয়েছে` });
  };

  /* drawer navigation */
  const navIdx = openKey ? list.findIndex((c) => c.key === openKey) : -1;
  const close = useCallback(() => setOpenKey(null), []);
  const step = useCallback((d: number) => {
    if (navIdx < 0) return;
    const next = list[navIdx + d];
    if (next) setOpenKey(next.key);
  }, [navIdx, list]);

  /* insights */
  const topCustomers = useMemo(() => (k?.topCustomers ?? []).map(toCustomer).filter((c) => c.spent > 0).slice(0, 5), [k]);
  const followUps = useMemo(() => (k?.followUps ?? []).map(toCustomer).filter((c) => !c.blocked).slice(0, 5), [k]);

  const segOptions: { id: SegTab; label: ReactNode; count: number }[] = [
    { id: "all", label: "সব", count: segCount.all },
    { id: "vip", label: "VIP", count: segCount.vip },
    { id: "regular", label: "নিয়মিত", count: segCount.regular },
    { id: "new", label: "নতুন", count: segCount.new },
    { id: "sleep", label: "ঘুমন্ত", count: segCount.sleep },
    { id: "risk", label: "ঝুঁকি", count: segCount.risk },
    { id: "blocked", label: "ব্লক করা", count: segCount.blocked },
  ];

  return (
    <div className="cu">
      <PageHead
        title="কাস্টমার"
        en="Customers"
        sub={<>কে কিনছে, কত কিনছে, কাকে ফেরাতে হবে · CRM <span className="cu-sub-dot" /> {num(customers.length)} জন কাস্টমার</>}
        actions={
          <>
            <Segmented<View>
              value={view}
              onChange={setView}
              size="sm"
              options={[
                { id: "list", label: <span className="cu-seg-l">তালিকা<small>List</small></span>, icon: Ico.list },
                { id: "cards", label: <span className="cu-seg-l">কার্ড<small>Cards</small></span>, icon: Ico.grid },
              ]}
            />
            <button type="button" className="ap-btn" onClick={() => exportList(null, filtered ? "filtered" : "all")}>
              {Ico.download}CSV এক্সপোর্ট
            </button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="cu-kpis">
        <Stat label="মোট কাস্টমার" en="Customers" value={num(kpi.total)} tone="wine" icon={Ico.customers}
          hint={`নিবন্ধিত ${num(kpi.reg)} · গেস্ট ${num(kpi.guest)}`} spark={kpi.cumSeries} />
        <Stat label="রিপিট রেট" en="Repeat rate" value={`${bn(kpi.repeatRate)}%`} tone="green" icon={Ico.trend}
          hint={`${num(kpi.repeat)} / ${num(kpi.buyers)} ক্রেতা ফিরে এসেছেন`} onClick={() => setSeg("regular")} />
        <Stat label="গড় লাইফটাইম ভ্যালু" en="Avg LTV" value={tk(kpi.ltv)} tone="gold" icon={Ico.cash}
          hint={kpi.top ? `সর্বোচ্চ ${tk(kpi.top)}` : "এখনও বিক্রি নেই"} onClick={() => { setSort("spent"); setDir(-1); }} />
        <Stat label="এই মাসে নতুন" en="New this month" value={num(kpi.newThis)} tone="blue" icon={Ico.spark}
          hint={`গত মাসে ${num(kpi.newPrev)}`} spark={kpi.newSeries} onClick={() => setSeg("new")} />
        <Stat label="ঝুঁকিতে" en="At risk" value={num(kpi.risk + kpi.sleep)} tone="red" icon={Ico.alert}
          hint={`ঝুঁকি ${num(kpi.risk)} · ঘুমন্ত ${num(kpi.sleep)}`} onClick={() => setSeg(kpi.risk || !kpi.sleep ? "risk" : "sleep")} />
      </div>

      {/* sticky filter bar */}
      <div className="cu-bar">
        <Segmented<SegTab> value={seg} onChange={setSeg} options={segOptions} />
        <div className="cu-tools">
          <SearchInput value={q} onChange={setQ} placeholder="নাম, ফোন, ইমেইল বা অর্ডার আইডি" />
          <Segmented<Kind>
            value={kind}
            onChange={setKind}
            size="sm"
            options={[
              { id: "all", label: "সবাই" },
              { id: "reg", label: "নিবন্ধিত" },
              { id: "guest", label: "গেস্ট" },
            ]}
          />
          <span className="cu-select">
            {Ico.tag}
            <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="ট্যাগ ফিল্টার">
              <option value="">সব ট্যাগ</option>
              {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </span>
          <span className="cu-select">
            {Ico.filter}
            <select value={sort} onChange={(e) => { const k = e.target.value as SortKey; setSort(k); setDir(k === "name" ? 1 : -1); }} aria-label="সাজান">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.bn} · {s.en}</option>)}
            </select>
            <button type="button" className="cu-dir" onClick={() => setDir((d) => (d === 1 ? -1 : 1))} aria-label="ক্রম উল্টান" title={dir === -1 ? "বড় থেকে ছোট" : "ছোট থেকে বড়"}>
              {dir === -1 ? Ico.down : Ico.up}
            </button>
          </span>
          <span className="cu-count">
            {filtered ? <><b>{num(totalFound)}</b> / {num(customers.length)} জন</> : <><b>{num(totalFound)}</b> জন</>}
            {filtered ? <button type="button" className="cu-reset" onClick={resetFilters}>ফিল্টার মুছুন</button> : null}
          </span>
        </div>
      </div>

      {/* results */}
      {!customers.length && !listQ.isLoading && !list.length ? (
        <Card>
          <Empty icon={Ico.customers} title="এখনও কোনো কাস্টমার নেই"
            sub="প্রথম অর্ডার বা রেজিস্ট্রেশন হলেই কাস্টমার এখানে চলে আসবে — খরচ, সেগমেন্ট আর পুরো ইতিহাসসহ।" />
        </Card>
      ) : !list.length ? (
        <Card>
          <Empty icon={Ico.search} title="এই ফিল্টারে কাউকে পাওয়া যায়নি"
            sub={q ? `"${q}" — নাম, ফোন বা ইমেইলের সাথে মেলেনি। বানান বা নম্বর আবার দেখুন।` : "অন্য সেগমেন্ট বা ট্যাগ বেছে দেখুন।"}
            action={<button type="button" className="ap-btn" onClick={resetFilters}>সব ফিল্টার মুছুন</button>} />
        </Card>
      ) : shown === "list" ? (
        <Card pad={false} className="cu-table-card">
          <div className="ap-table-wrap cu-scroll" ref={scrollRef} onScroll={(e) => markScroll(e.currentTarget)}>
            <table className="ap-table cu-table">
              <thead>
                <tr>
                  <th className="cu-c-check">
                    <input type="checkbox" className="ap-check" aria-label="সব নির্বাচন" checked={allVisibleOn}
                      ref={(el) => { if (el) el.indeterminate = someVisibleOn && !allVisibleOn; }}
                      onChange={(e) => selection.setAll(visible.map((c) => c.key), e.target.checked)} />
                  </th>
                  <th><SortHead k="name" sort={sort} dir={dir} onSort={sortBy}>কাস্টমার</SortHead></th>
                  <th>যোগাযোগ</th>
                  <th>সেগমেন্ট</th>
                  <th className="num"><SortHead k="orders" sort={sort} dir={dir} onSort={sortBy}>অর্ডার</SortHead></th>
                  <th className="num"><SortHead k="spent" sort={sort} dir={dir} onSort={sortBy}>মোট খরচ</SortHead></th>
                  <th className="num"><SortHead k="aov" sort={sort} dir={dir} onSort={sortBy}>গড়</SortHead></th>
                  <th><SortHead k="last" sort={sort} dir={dir} onSort={sortBy}>শেষ অর্ডার</SortHead></th>
                  <th className="cu-c-trend">৬ মাস</th>
                  <th aria-label="খুলুন" />
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => {
                  const m = metaOf(c);
                  const on = selection.has(c.key);
                  const sp = c.spark;
                  return (
                    <tr key={c.key} className={`click cu-row${on ? " sel" : ""}${m.blocked ? " cu-blocked" : ""}`} style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }}
                      onClick={() => setOpenKey(c.key)}>
                      <td className="cu-c-check" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="ap-check" aria-label={`${c.name} নির্বাচন`} checked={on} onChange={() => selection.toggle(c.key)} />
                      </td>
                      <td>
                        <div className="cu-who">
                          <Avatar name={c.name} size={38} />
                          <div className="cu-who-txt">
                            <b>
                              <span className="cu-ellip">{c.name}</span>
                              {c.registered ? <span className="cu-verified" title="নিবন্ধিত অ্যাকাউন্ট · Registered">{Ico.check}</span> : null}
                              {m.blocked ? <Badge tone="red">ব্লক</Badge> : null}
                            </b>
                            <span className="cu-tags">
                              {m.tags.length ? <TagPills tags={m.tags} max={3} color={tagColor} /> : <small>{c.registered ? "নিবন্ধিত · Registered" : "গেস্ট · Guest"}</small>}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="cu-contact">
                          {c.phone ? (
                            <span className="cu-phone">{bn(localPhone(c.phone))}<CopyBtn text={localPhone(c.phone)} onCopied={() => toast("ফোন নম্বর কপি হয়েছে")} /></span>
                          ) : <span className="muted">ফোন নেই</span>}
                          {c.email ? <small className="cu-ellip">{c.email}</small> : null}
                        </div>
                      </td>
                      <td><SegBadge seg={c.segment} /></td>
                      <td className="num">
                        <b>{num(c.live)}</b>
                        {c.cancelled ? <small className="cu-cx" title="বাতিল অর্ডার">−{bn(c.cancelled)}</small> : null}
                      </td>
                      <td className="num"><b>{tk(c.spent)}</b></td>
                      <td className="num muted">{c.aov ? tk(c.aov) : "—"}</td>
                      <td>
                        <div className="cu-last">
                          <span>{c.last ? ago(c.last) : "—"}</span>
                          {c.last ? <small>{dateOnly(c.last)}</small> : <small>অর্ডার নেই</small>}
                        </div>
                      </td>
                      <td className="cu-c-trend">
                        {sp.some((v) => v > 0) ? <div className="cu-spark"><Spark data={sp} tone={SEG_TONE[c.segment]} height={28} /></div> : <span className="cu-nospark" />}
                      </td>
                      <td className="cu-c-go"><span className="cu-chev">{Ico.chevR}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pager}
        </Card>
      ) : (
        <>
          <div className="cu-cards">
            {visible.map((c, i) => (
              <CustomerCard key={c.key} c={c} meta={metaOf(c)} spark={c.spark} index={i}
                selected={selection.has(c.key)} onToggle={() => selection.toggle(c.key)} onOpen={() => setOpenKey(c.key)}
                onCopied={() => toast("ফোন নম্বর কপি হয়েছে")} />
            ))}
          </div>
          {pager}
        </>
      )}

      {/* bulk bar */}
      {selection.size ? (
        <div className="ap-bulk cu-bulk" role="region" aria-label="নির্বাচিত কাস্টমার">
          <b>{num(selection.size)} জন নির্বাচিত</b>
          <Menu align="left" trigger={() => <button type="button" className="ap-btn sm">{Ico.tag}ট্যাগ যোগ</button>}>
            {(done) => (
              <>
                <div className="ap-menu-label">ট্যাগ যোগ · Add tag</div>
                {allTags.map((t) => (
                  <button key={t} type="button" className="ap-menu-item" onClick={() => { bulkTag(t); done(); }}>
                    {Ico.tag}{t}<small>{num(selectedRows.filter((c) => metaOf(c).tags.includes(t)).length)}/{num(selectedRows.length)}</small>
                  </button>
                ))}
                <div className="ap-menu-sep" />
                <div className="ap-menu-label">ট্যাগ সরান · Remove</div>
                {allTags.filter((t) => selectedRows.some((c) => metaOf(c).tags.includes(t))).map((t) => (
                  <button key={t} type="button" className="ap-menu-item danger" onClick={() => { bulkUntag(t); done(); }}>{Ico.close}{t}</button>
                ))}
              </>
            )}
          </Menu>
          <button type="button" className="ap-btn sm" onClick={() => exportList(selectedRows, "selected")}>{Ico.download}এক্সপোর্ট</button>
          <button type="button" className="ap-btn sm gold" onClick={selection.clear}>বাতিল <Kbd>Esc</Kbd></button>
        </div>
      ) : null}

      {/* insights row */}
      {customers.length ? (
        <div className="ap-grid-3 cu-insights">
          <Card title="সেগমেন্ট ভাগ" en="Segments" sub="কোন দলে কতজন — ক্লিক করে ফিল্টার করুন">
            <Donut size={148} thick={18}
              data={SEG_ORDER.map((s) => ({ label: SEGMENT_LABEL[s].bn, value: segCount[s], tone: SEG_TONE[s] }))}
              center={<><b>{num(customers.length)}</b><small>কাস্টমার</small></>} />
            <div className="cu-seg-links">
              {SEG_ORDER.map((s) => (
                <button key={s} type="button" className={`ap-chip${seg === s ? " on" : ""}`} onClick={() => setSeg(seg === s ? "all" : s)}>
                  {SEGMENT_LABEL[s].bn}<em>{bn(segCount[s])}</em>
                </button>
              ))}
            </div>
          </Card>
          <Card title="সেরা কাস্টমার" en="Top spenders" sub="আজীবন খরচ অনুযায়ী">
            {topCustomers.length ? (
              <ol className="cu-top">
                {topCustomers.map((c, i) => (
                  <li key={c.key}>
                    <button type="button" onClick={() => setOpenKey(c.key)}>
                      <span className={`cu-rank r${i}`}>{bn(i + 1)}</span>
                      <Avatar name={c.name} size={30} />
                      <span className="cu-top-txt">
                        <b className="cu-ellip">{c.name}</b>
                        <span className="cu-top-bar"><i style={{ width: `${Math.max(4, pct(c.spent, topCustomers[0].spent))}%` }} /></span>
                      </span>
                      <span className="cu-top-val"><b>{tk(c.spent)}</b><small>{num(c.live)} অর্ডার</small></span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <MiniEmpty icon={Ico.cash} text="প্রথম সফল অর্ডারের পর এখানে র‍্যাংকিং দেখা যাবে।" />}
          </Card>
          <Card title="ফলো-আপ দরকার" en="Win-back" sub="অনেকদিন কেনেননি বা বাতিল বেশি">
            {followUps.length ? (
              <ul className="cu-follow">
                {followUps.map((c) => {
                  const d = daysSince(c.last, now);
                  const reason = c.segment === "risk"
                    ? `বাতিল ${bn(pct(c.cancelled, c.total))}% · ${bn(c.total)} অর্ডারে`
                    : `${bn(d)} দিন কোনো অর্ডার নেই`;
                  const wa = waLink(c.phone);
                  return (
                    <li key={c.key}>
                      <button type="button" className="cu-follow-main" onClick={() => setOpenKey(c.key)}>
                        <Avatar name={c.name} size={30} />
                        <span><b className="cu-ellip">{c.name}</b><small>{reason}</small></span>
                      </button>
                      {wa ? <a className="ap-icon-btn sm cu-wa" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp-এ লিখুন">{Ico.whatsapp}</a> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <MiniEmpty icon={Ico.check} text="দারুণ! এই মুহূর্তে কাউকে ফেরানোর দরকার নেই — সবাই সক্রিয়।" good />}
          </Card>
        </div>
      ) : null}

      {openKey ? (
        <CustomerDrawer
          id={openKey}
          pos={navIdx}
          count={list.length}
          onStep={step}
          onClose={close}
          onGo={(tab, id) => { setOpenKey(null); go(tab, id); }}
        />
      ) : null}
    </div>
  );
}

/* ───────── small pieces ───────── */

function SegBadge({ seg }: { seg: Segment }) {
  return <Badge tone={SEG_TONE[seg]} dot title={SEGMENT_LABEL[seg].en}>{SEGMENT_LABEL[seg].bn}</Badge>;
}

function SortHead({ k, sort, dir, onSort, children }: { k: SortKey; sort: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void; children: ReactNode }) {
  const on = sort === k;
  return (
    <button type="button" className={`ap-sort${on ? " on" : ""}`} onClick={() => onSort(k)} aria-sort={on ? (dir === 1 ? "ascending" : "descending") : undefined}>
      {children}{on ? (dir === 1 ? Ico.up : Ico.down) : null}
    </button>
  );
}

function markScroll(el: HTMLElement) {
  el.classList.toggle("scrolled", el.scrollTop > 2);
  el.classList.toggle("at-end", el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
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

function CustomerPager({ page, pages, total, size, loading, onPage, onSize }: {
  page: number; pages: number; total: number; size: number; loading: boolean; onPage: (n: number) => void; onSize: (n: number) => void;
}) {
  const first = (page - 1) * size + 1;
  const last = Math.min(total, page * size);
  const pct = Math.round((last / total) * 100);
  return (
    <nav className={`cu-pager${loading ? " busy" : ""}`} aria-label="কাস্টমার পৃষ্ঠা">
      <div className="cu-pager-info">
        <span className="cu-pager-range"><b>{bn(first)}–{bn(last)}</b> <small>/ {num(total)} জন</small></span>
        <span className="cu-pager-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
      </div>
      <div className="cu-pager-pages">
        <button type="button" className="cu-pg nav" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="আগের পৃষ্ঠা">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg><span>আগের</span>
        </button>
        {pageList(page, pages).map((n, i) => n === "gap"
          ? <span key={`g${i}`} className="cu-pg-gap" aria-hidden="true">···</span>
          : <button key={n} type="button" className={`cu-pg${n === page ? " on" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{bn(n)}</button>)}
        <button type="button" className="cu-pg nav" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="পরের পৃষ্ঠা">
          <span>পরের</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <div className="cu-pager-size" role="group" aria-label="প্রতি পৃষ্ঠায়">
        <small>প্রতি পৃষ্ঠায়</small>
        {PAGE_SIZES.map((n) => (
          <button key={n} type="button" className={n === size ? "on" : ""} aria-pressed={n === size} onClick={() => onSize(n)}>{bn(n)}</button>
        ))}
      </div>
    </nav>
  );
}

function MiniEmpty({ icon, text, good }: { icon: ReactNode; text: string; good?: boolean }) {
  return (
    <div className={`cu-mini-empty${good ? " good" : ""}`}>
      <span>{icon}</span>
      <p>{text}</p>
    </div>
  );
}

function CustomerCard({ c, meta, spark, index, selected, onToggle, onOpen, onCopied }: {
  c: Customer; meta: CustomerMeta; spark: number[]; index: number; selected: boolean;
  onToggle: () => void; onOpen: () => void; onCopied: () => void;
}) {
  const wa = waLink(c.phone);
  const tagColor = useTagColor();
  return (
    <article className={`cu-card seg-${c.segment}${selected ? " sel" : ""}${meta.blocked ? " cu-blocked" : ""}`} style={{ animationDelay: `${Math.min(index, 16) * 28}ms` }}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} tabIndex={0} role="button" aria-label={`${c.name} — বিস্তারিত`}>
      <header className="cu-card-head">
        <Avatar name={c.name} size={44} />
        <div className="cu-card-id">
          <b>
            <span className="cu-ellip">{c.name}</span>
            {c.registered ? <span className="cu-verified" title="নিবন্ধিত · Registered">{Ico.check}</span> : null}
          </b>
          <span className="ap-row cu-card-badges"><SegBadge seg={c.segment} />{meta.blocked ? <Badge tone="red">ব্লক</Badge> : null}</span>
        </div>
        <span className="cu-card-check" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" className="ap-check" aria-label={`${c.name} নির্বাচন`} checked={selected} onChange={onToggle} />
        </span>
      </header>
      <div className="cu-card-contact">
        {c.phone ? <span className="cu-phone">{Ico.phone}{bn(localPhone(c.phone))}<CopyBtn text={localPhone(c.phone)} onCopied={onCopied} /></span> : <span className="muted">ফোন নেই</span>}
        {c.email ? <small className="cu-ellip">{Ico.mail}{c.email}</small> : null}
      </div>
      <dl className="cu-card-stats">
        <div><dt>অর্ডার</dt><dd>{num(c.live)}</dd></div>
        <div><dt>মোট খরচ</dt><dd>{tk(c.spent)}</dd></div>
        <div><dt>গড়</dt><dd>{c.aov ? tk(c.aov) : "—"}</dd></div>
      </dl>
      <div className="cu-card-spark">
        {spark.some((v) => v > 0) ? <Spark data={spark} tone={SEG_TONE[c.segment]} height={30} /> : <span className="cu-nospark wide">গত ৬ মাসে কেনাকাটা নেই</span>}
      </div>
      <footer className="cu-card-foot">
        <span className="cu-card-last">{Ico.clock}{c.last ? ago(c.last) : "এখনও অর্ডার নেই"}</span>
        <span className="cu-tags"><TagPills tags={meta.tags} max={2} color={tagColor} /></span>
        <span className="cu-card-acts" onClick={(e) => e.stopPropagation()}>
          {c.phone ? <a className="ap-icon-btn sm" href={`tel:${c.phone}`} aria-label="কল" title="কল করুন">{Ico.phone}</a> : null}
          {wa ? <a className="ap-icon-btn sm cu-wa" href={wa} target="_blank" rel="noreferrer" aria-label="WhatsApp" title="WhatsApp">{Ico.whatsapp}</a> : null}
        </span>
      </footer>
    </article>
  );
}

/* ───────── drawer ───────── */

function CustomerDrawer({ id, pos, count, onStep, onClose, onGo }: {
  id: string; pos: number; count: number; onStep: (d: number) => void; onClose: () => void;
  onGo: (tab: "orders" | "products" | "packs" | "chat", id?: string) => void;
}) {
  const q = useCustomer(id);
  const d = q.data;
  if (!d) {
    return (
      <Drawer open onClose={onClose} width={600} title={q.isLoading ? "লোড হচ্ছে…" : "কাস্টমার পাওয়া যায়নি"}>
        {q.isLoading ? null : <Empty icon={Ico.customers} title="কাস্টমার পাওয়া যায়নি" />}
      </Drawer>
    );
  }
  return <CustomerDrawerBody key={d.id} d={d} pos={pos} count={count} onStep={onStep} onClose={onClose} onGo={onGo} />;
}

function CustomerDrawerBody({ d, pos, count, onStep, onClose, onGo }: {
  d: CustomerDetail; pos: number; count: number; onStep: (d: number) => void; onClose: () => void;
  onGo: (tab: "orders" | "products" | "packs" | "chat", id?: string) => void;
}) {
  const toast = useToast();
  const { byCode } = useAdminSection();
  const tagsQ = useCustomerTags();
  const setTagsM = useSetCustomerTags();
  const tagColor = useTagColor();
  const blockM = useBlockCustomer();
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const st = d.stats;
  const c: Customer = {
    key: d.id, name: d.name || "গেস্ট", phone: d.phone ?? "", email: d.email ?? "", registered: d.registered, live: st.liveOrders, cancelled: st.cancelledOrders,
    total: st.ordersCount, spent: st.totalSpent, aov: st.aov, first: toMs(st.firstOrderAt), last: toMs(st.lastOrderAt),
    segment: (["new", "regular", "vip", "risk", "sleep"].includes(d.segment) ? d.segment : "new") as Segment, blocked: d.blocked, blockedReason: d.blockedReason ?? "",
    tags: tagNames(d.tags), spark: [],
  };
  const meta: CustomerMeta = { note: d.adminNote ?? "", tags: c.tags, blocked: c.blocked };
  const allTags = [...new Set([...(tagsQ.data?.tags ?? []).map((t) => t.name), ...c.tags])];
  const now = Date.now();
  const cancelRate = Math.round(st.cancelRate ?? pct(c.cancelled, c.total));
  const wa = waLink(c.phone);
  const hasChat = st.conversations > 0;
  const sec = st.favouriteSection ? byCode(st.favouriteSection.key) : undefined;
  const profile = {
    topVertical: st.favouriteSection ? { name: sec?.name ?? st.favouriteSection.key, share: st.favouriteSection.share } : null,
    topCat: st.favouriteCategory ? { name: st.favouriteCategory.key, share: st.favouriteCategory.share } : null,
    items: d.topItems.slice(0, 4).map((it) => ({ key: `${it.kind}${it.id}`, kind: it.kind === "BUNDLE" ? "pack" as const : "book" as const, id: it.id, title: it.title, qty: it.qty, amount: it.amount })),
    cod: st.payment.cod,
    ssl: st.payment.ssl,
    hasLines: d.topItems.length > 0,
  };
  const monthsShown = d.monthlySpend.slice(-Math.min(12, Math.max(6, c.first ? Math.ceil((now - c.first) / (30 * DAY)) + 1 : 6)));
  const ms = monthsShown.map((m) => ({ label: monthLabel(m.month, true) }));
  const spend = monthsShown.map((m) => m.amount);
  const counts = monthsShown.map((m) => m.orders);
  const orders = d.orders;
  const wait = d.wishlist.map((w) => ({
    key: w.id, kind: w.kind === "bundle" ? "pack" as const : "book" as const, id: w.refId, title: w.title, sub: w.kind === "bundle" ? "প্যাকেজ" : "",
    price: w.price, stock: w.kind === "bundle" ? -1 : n0s(w.stock), color: "", image: undefined as string | undefined,
  }));
  const addresses = d.addresses.map((a2) => [a2.line, a2.landmark, a2.union, a2.upazila, a2.district].filter(Boolean).join(", "));

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (confirmBlock) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); onStep(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); onStep(-1); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onStep, confirmBlock]);

  const closeDrawer = useCallback(() => { if (!confirmBlock) onClose(); }, [confirmBlock, onClose]);

  const setBlocked = (blocked: boolean, reason?: string) => {
    blockM.mutate({ id: c.key, name: c.name, blocked, reason });
  };
  const toggleTag = (t: string) => {
    setTagsM.mutate({ id: c.key, tags: c.tags.includes(t) ? c.tags.filter((x) => x !== t) : [...c.tags, t] });
  };
  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    toast(`${label} কপি হয়েছে`);
  };

  const head = (
    <div className="cu-dh">
      <div className="cu-dh-av">
        <Avatar name={c.name} size={60} />
        {c.registered ? <span className="cu-dh-ver" title="নিবন্ধিত · Registered">{Ico.check}</span> : null}
      </div>
      <div className="cu-dh-txt">
        <h2>{c.name}</h2>
        <div className="cu-dh-badges">
          <SegBadge seg={c.segment} />
          <Badge tone={c.registered ? "sage" : "ink"}>{c.registered ? "নিবন্ধিত" : "গেস্ট"}</Badge>
          {meta.blocked ? <Badge tone="red" dot>ব্লক করা</Badge> : null}
        </div>
        <p>
          {c.first ? <>কাস্টমার {dateOnly(c.first)} থেকে · {bn(Math.max(1, Math.ceil((now - c.first) / DAY)))} দিন</> : "এখনও কোনো অর্ডার দেননি"}
          
        </p>
      </div>
    </div>
  );

  const footer = (
    <div className="cu-df">
      <div className="cu-df-nav">
        <button type="button" className="ap-icon-btn sm" disabled={pos <= 0} onClick={() => onStep(-1)} aria-label="আগের কাস্টমার"><span className="cu-flip">{Ico.chevR}</span></button>
        <span>{pos >= 0 ? `${bn(pos + 1)} / ${bn(count)}` : "—"}</span>
        <button type="button" className="ap-icon-btn sm" disabled={pos < 0 || pos >= count - 1} onClick={() => onStep(1)} aria-label="পরের কাস্টমার">{Ico.chevR}</button>
        <small className="cu-df-keys"><Kbd>←</Kbd><Kbd>→</Kbd> বদলান · <Kbd>Esc</Kbd> বন্ধ</small>
      </div>
      <button type="button" className="ap-btn" onClick={onClose}>বন্ধ করুন</button>
    </div>
  );

  return (
    <Drawer open onClose={closeDrawer} width={600} head={head} footer={footer}>
      <div className="cu-drawer">
        {meta.blocked ? (
          <div className="cu-alert">
            {Ico.alert}
            <div><b>এই কাস্টমার ব্লক করা আছে</b><p>{c.blockedReason || "নতুন অর্ডার এলে কনফার্ম করার আগে যাচাই করুন। COD এড়িয়ে চলুন।"}</p></div>
            <button type="button" className="ap-btn sm" onClick={() => setBlocked(false)}>আনব্লক</button>
          </div>
        ) : null}

        {/* contact */}
        <div className="cu-acts">
          <a className={`cu-act${c.phone ? "" : " off"}`} href={c.phone ? `tel:${c.phone}` : undefined} aria-disabled={!c.phone}>{Ico.phone}<b>কল</b><small>Call</small></a>
          <a className={`cu-act wa${wa ? "" : " off"}`} href={wa || undefined} target="_blank" rel="noreferrer" aria-disabled={!wa}>{Ico.whatsapp}<b>WhatsApp</b><small>Message</small></a>
          <a className={`cu-act${c.email ? "" : " off"}`} href={c.email ? `mailto:${c.email}` : undefined} aria-disabled={!c.email}>{Ico.mail}<b>ইমেইল</b><small>Email</small></a>
          <button type="button" className={`cu-act${hasChat ? "" : " off"}`} disabled={!hasChat} onClick={() => onGo("chat", c.key)} title={hasChat ? "চ্যাট খুলুন" : "এই কাস্টমারের কোনো চ্যাট নেই"}>{Ico.chat}<b>চ্যাট</b><small>{hasChat ? "Inbox" : "No thread"}</small></button>
        </div>
        <dl className="ap-kv cu-contact-kv">
          <dt>ফোন</dt>
          <dd>{c.phone ? <span className="cu-kv-copy">{bn(localPhone(c.phone))}<button type="button" className="ap-icon-btn sm" onClick={() => copy(localPhone(c.phone), "ফোন নম্বর")} aria-label="কপি">{Ico.copy}</button></span> : "—"}</dd>
          <dt>ইমেইল</dt>
          <dd>{c.email ? <span className="cu-kv-copy">{c.email}<button type="button" className="ap-icon-btn sm" onClick={() => copy(c.email, "ইমেইল")} aria-label="কপি">{Ico.copy}</button></span> : "—"}</dd>
        </dl>

        {/* stats */}
        <div className="cu-tiles">
          <Tile label="আজীবন খরচ" en="Lifetime" value={tk(c.spent)} tone="wine" />
          <Tile label="অর্ডার" en="Orders" value={num(c.live)} sub={c.total !== c.live ? `মোট ${bn(c.total)} টির মধ্যে` : "সব সফল"} />
          <Tile label="গড় অর্ডার" en="AOV" value={c.aov ? tk(c.aov) : "—"} />
          <Tile label="বাতিল হার" en="Cancel rate" value={`${bn(cancelRate)}%`} tone={cancelRate >= 30 ? "red" : undefined}
            sub={c.cancelled ? `${bn(c.cancelled)}টি বাতিল` : "কোনো বাতিল নেই"} />
          <Tile label="পেমেন্ট" en="Prefers" value={!c.total ? "—" : profile.ssl > profile.cod ? "SSL" : "COD"}
            extra={c.total ? (
              <span className="cu-paybar" title={`COD ${bn(profile.cod)} · SSL ${bn(profile.ssl)}`}>
                <i style={{ width: `${st.payment.codShare}%` }} />
                <small>COD {bn(Math.round(st.payment.codShare))}% · SSL {bn(Math.round(st.payment.sslShare))}%</small>
              </span>
            ) : null} />
          <Tile label="প্রিয় বিভাগ" en="Favourite" value={profile.topVertical?.name || "—"}
            sub={profile.topCat ? `${profile.topCat.name} · ${bn(profile.topCat.share)}%` : profile.hasLines ? "—" : "আইটেম ডেটা নেই"} />
        </div>

        {/* chart */}
        <Card title="খরচের ধারা" en="Spend over time" sub={c.live ? `সর্বোচ্চ মাস ${tk(Math.max(...spend))}` : undefined}>
          {c.live ? (
            <AreaChart height={170} points={ms}
              series={[
                { key: "spend", name: "খরচ", tone: "wine", values: spend, format: tk },
                { key: "orders", name: "অর্ডার", tone: "gold", values: counts },
              ]} />
          ) : <MiniEmpty icon={Ico.trend} text="সফল অর্ডার হলে মাসভিত্তিক খরচের চার্ট এখানে দেখা যাবে।" />}
        </Card>

        {/* orders */}
        <Card title="অর্ডার ইতিহাস" en="Orders" pad={false} className="cu-d-orders"
          actions={orders.length ? <Badge tone="ink">{bn(orders.length)}টি</Badge> : undefined}>
          {orders.length ? (
            <ul className="cu-olist">
              {orders.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => onGo("orders", o.orderNo)}>
                    <span className="cu-o-id"><b>{o.orderNo}</b><small>{when(toMs(o.placedAt))}</small></span>
                    <span className="cu-o-items">{bn(o.itemCount)}টি পণ্য<small>{isSslMethod(o.paymentMethod) ? "SSLCOMMERZ" : "ক্যাশ অন ডেলিভারি"}{o.paymentStatus !== "UNPAID" ? " · পরিশোধিত" : ""}</small></span>
                    <StatusPill status={o.status} />
                    <b className={`cu-o-total${o.status === "CANCELLED" || o.status === "RETURNED" ? " x" : ""}`}>{tk(o.grandTotal)}</b>
                    <span className="cu-chev">{Ico.chevR}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <MiniEmpty icon={Ico.orders} text="এখনও কোনো অর্ডার নেই। প্রথম অর্ডার এলে পুরো ইতিহাস এখানে থাকবে।" />}
        </Card>

        {/* favourites */}
        {profile.items.length ? (
          <Card title="বেশি কেনা" en="Most bought">
            <ul className="cu-items">
              {profile.items.map((it) => (
                <li key={it.key}>
                  <button type="button" onClick={() => onGo(it.kind === "pack" ? "packs" : "products", it.kind === "pack" ? undefined : String(it.id))}>
                    <span className="cu-item-ico">{it.kind === "pack" ? Ico.packs : Ico.products}</span>
                    <span className="cu-ellip">{it.title}</span>
                    <small>×{bn(it.qty)}</small>
                    <b>{tk(it.amount)}</b>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {/* wishlist */}
        {c.registered ? (
          <Card title="অপেক্ষার তালিকা" en="Wishlist · future orders" sub="যেগুলো স্টকে এলে কিনতে চান"
            actions={wait.length ? <Badge tone="gold">{bn(wait.length)}টি</Badge> : undefined}>
            {wait.length ? (
              <ul className="cu-wait">
                {wait.map((w) => (
                  <li key={w.key}>
                    <button type="button" onClick={() => onGo(w.kind === "pack" ? "packs" : "products", w.kind === "pack" ? undefined : String(w.id))}>
                      <span className="cu-wait-thumb" style={w.color ? { background: w.color } : undefined}>
                        {w.image ? <img src={w.image} alt="" loading="lazy" /> : w.kind === "pack" ? Ico.packs : Ico.products}
                      </span>
                      <span className="cu-wait-txt"><b className="cu-ellip">{w.title}</b><small className="cu-ellip">{w.sub}</small></span>
                      <span className="cu-wait-meta">
                        <b>{tk(w.price)}</b>
                        {w.stock < 0 ? <Badge tone="ink">প্যাকেজ</Badge> : w.stock > 0 ? <Badge tone="green" dot>স্টকে আছে</Badge> : <Badge tone="gold" dot>স্টক শেষ</Badge>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <MiniEmpty icon={Ico.star} text="অপেক্ষার তালিকা খালি — স্টক শেষ পণ্যে “স্টকে এলে জানান” চাপলে এখানে দেখা যাবে।" />}
            {wait.some((w) => w.stock > 0) ? (
              <p className="cu-hint">{Ico.spark}<span>{bn(wait.filter((w) => w.stock > 0).length)}টি পণ্য এখন স্টকে আছে — WhatsApp-এ জানিয়ে অর্ডার নিন।</span></p>
            ) : null}
          </Card>
        ) : null}

        {/* addresses */}
        <Card title="ঠিকানা" en="Addresses" actions={addresses.length ? <Badge tone="ink">{bn(addresses.length)}টি</Badge> : undefined}>
          {addresses.length ? (
            <ul className="cu-addr">
              {addresses.map((a, i) => (
                <li key={a}>
                  <span className="cu-addr-ico">{Ico.truck}</span>
                  <span className="cu-addr-txt">{a}{i === 0 ? <Badge tone="sage">সর্বশেষ</Badge> : null}</span>
                  <CopyBtn text={a} onCopied={() => toast("ঠিকানা কপি হয়েছে")} />
                </li>
              ))}
            </ul>
          ) : <MiniEmpty icon={Ico.truck} text="কোনো ডেলিভারি ঠিকানা এখনও সংরক্ষিত নেই।" />}
        </Card>

        {/* CRM */}
        <Card title="নোট ও ট্যাগ" en="CRM" sub="শুধু অ্যাডমিনরা দেখবেন">
          <NoteBox key={c.key} id={c.key} initial={meta.note} />
          <div className="cu-tagset">
            <span className="cu-tagset-label">{Ico.tag}ট্যাগ</span>
            {allTags.map((t) => {
              const on = meta.tags.includes(t);
              return (
                <button key={t} type="button" className={`cu-tag-chip${on ? " on" : ""}`} aria-pressed={on}
                  style={{ ["--tc" as string]: tagColor(t) }} onClick={() => toggleTag(t)}>
                  {on ? Ico.check : Ico.plus}{t}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className={`cu-block${meta.blocked ? " on" : ""}`}>
          <Toggle checked={meta.blocked} onChange={(v) => (v ? setConfirmBlock(true) : setBlocked(false))}
            label="কাস্টমার ব্লক করুন" sub="Block · সন্দেহজনক বা বারবার অর্ডার বাতিল করলে" />
          <p className="cu-block-note">
            {Ico.alert}
            <span>ব্লক করলে এই নম্বরের প্রতিটি অর্ডারে সতর্কতা দেখাবে এবং এই নম্বর থেকে নতুন অর্ডার নেওয়া বন্ধ থাকবে। আগের অর্ডার বদলাবে না।</span>
          </p>
        </Card>
      </div>

      <Modal open={confirmBlock} onClose={() => setConfirmBlock(false)} title={`${c.name} — ব্লক করবেন?`} sub="Block customer" width={440}
        footer={
          <>
            <button type="button" className="ap-btn" onClick={() => setConfirmBlock(false)}>না, থাক</button>
            <button type="button" className="ap-btn primary" disabled={blockReason.trim().length < 3} onClick={() => { setBlocked(true, blockReason.trim()); setConfirmBlock(false); setBlockReason(""); }}>হ্যাঁ, ব্লক করুন</button>
          </>
        }>
        <div className="cu-confirm">
          <p>এই কাস্টমারকে <b>ঝুঁকিপূর্ণ</b> হিসেবে চিহ্নিত করা হবে। অর্ডার তালিকায় লাল সতর্কতা থাকবে এবং ফিল্টারে &quot;ব্লক করা&quot; দলে দেখা যাবে।</p>
          <ul>
            <li>মোট অর্ডার <b>{bn(c.total)}</b> · বাতিল <b>{bn(c.cancelled)}</b> ({bn(cancelRate)}%)</li>
            <li>আজীবন খরচ <b>{tk(c.spent)}</b></li>
          </ul>
          <label htmlFor="cu-block-reason">কারণ · Reason</label>
          <input id="cu-block-reason" value={blockReason} placeholder="যেমন: বারবার অর্ডার নিয়ে ফেরত দিচ্ছেন" onChange={(e) => setBlockReason(e.target.value)} />
          <p className="muted">যেকোনো সময় আনব্লক করা যাবে। কাজটি অ্যাক্টিভিটি লগে থাকবে।</p>
        </div>
      </Modal>
    </Drawer>
  );
}

function Tile({ label, en, value, sub, tone, extra }: { label: string; en: string; value: ReactNode; sub?: ReactNode; tone?: "wine" | "red"; extra?: ReactNode }) {
  return (
    <div className={`cu-tile${tone ? ` t-${tone}` : ""}`}>
      <span className="cu-tile-l">{label}<em>{en}</em></span>
      <b>{value}</b>
      {extra ?? (sub ? <small>{sub}</small> : null)}
    </div>
  );
}

function NoteBox({ id, initial }: { id: string; initial: string }) {
  const update = useUpdateCustomer();
  const [text, setText] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const dirty = text.trim() !== saved.trim();
  const save = () => {
    if (!dirty) return;
    const next = text.trim();
    update.mutate({ id, adminNote: next || null, toast: "নোট সংরক্ষিত হয়েছে" }, { onSuccess: () => { setSaved(next); setText(next); } });
  };
  return (
    <div className="cu-note">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000}
        placeholder="যেমন: বিকেল ৫টার পর কল করবেন · অফিস ঠিকানায় ডেলিভারি পছন্দ করেন"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } }} />
      <div className="cu-note-foot">
        <small>{dirty ? <><i className="cu-dot" />সংরক্ষণ হয়নি · <Kbd>⌘</Kbd><Kbd>↵</Kbd></> : saved ? <>{Ico.check}সংরক্ষিত</> : `${bn(text.length)}/১০০০`}</small>
        {dirty ? <button type="button" className="ap-btn sm ghost" onClick={() => setText(saved)}>বাতিল</button> : null}
        <button type="button" className="ap-btn sm primary" disabled={!dirty} onClick={save}>{Ico.note}সংরক্ষণ</button>
      </div>
    </div>
  );
}

function n0s(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
