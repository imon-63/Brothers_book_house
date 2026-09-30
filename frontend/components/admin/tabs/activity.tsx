"use client";

import "./activity.css";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useAdminNav } from "@/components/admin/nav";
import { Avatar, Card, Columns, Empty, Ico, Menu, PageHead, SearchInput, Segmented, Stat, ago, num, when } from "@/components/admin/ui";
import { activityLink } from "@/components/admin/tabs/dashboard";
import { bn } from "@/lib/format";
import { adminErrorText, ms, useToast } from "@/lib/api/admin/core";
import { exportActivity, useActivityFeed, useActivityStats, type ActivityFilter, type ActivityRow } from "@/lib/api/admin/activity";

type ActivityKind = "order" | "product" | "finance" | "settings" | "customer" | "chat" | "auth" | "inventory";
/** One feed row, shaped like the old local log so the markup below stays the same. */
type Activity = { id: string; at: number; by: string; byId: string | null; kind: ActivityKind; text: string; ref?: string; raw: ActivityRow };
function toActivity(r: ActivityRow): Activity {
  const kind = (r.area in KINDS ? r.area : "settings") as ActivityKind;
  return { id: r.id, at: ms(r.createdAt), by: r.actorName || (r.actorType === "SYSTEM" ? "সিস্টেম" : "অজানা"), byId: r.actorId, kind, text: r.summary, ref: r.entityType ?? undefined, raw: r };
}

/* ───────── kind metadata ───────── */

const lock = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
  </svg>
);

const KINDS: Record<ActivityKind, { bn: string; en: string; icon: ReactNode }> = {
  order: { bn: "অর্ডার", en: "Orders", icon: Ico.orders },
  product: { bn: "পণ্য", en: "Catalog", icon: Ico.products },
  finance: { bn: "হিসাব", en: "Finance", icon: Ico.finance },
  settings: { bn: "সেটিংস", en: "Settings", icon: Ico.settings },
  customer: { bn: "কাস্টমার", en: "Customers", icon: Ico.customers },
  chat: { bn: "চ্যাট", en: "Inbox", icon: Ico.chat },
  auth: { bn: "লগইন", en: "Access", icon: lock },
  inventory: { bn: "স্টক", en: "Inventory", icon: Ico.box },
};
const KIND_ORDER: ActivityKind[] = ["order", "product", "inventory", "finance", "settings", "customer", "chat", "auth"];

type Range = "today" | "7" | "30" | "all";
const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "আজ" },
  { id: "7", label: "৭ দিন" },
  { id: "30", label: "৩০ দিন" },
  { id: "all", label: "সব" },
];

const PAGE = 40;
const DAY = 86400000;

/* ───────── helpers ───────── */

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function clock(ts: number) {
  return new Date(ts).toLocaleTimeString("bn-BD", { hour: "numeric", minute: "2-digit" });
}

function dayLabel(dayStart: number, today: number): { main: string; sub: string } {
  const d = new Date(dayStart);
  const weekday = d.toLocaleDateString("bn-BD", { weekday: "long" });
  const sameYear = d.getFullYear() === new Date(today).getFullYear();
  const date = d.toLocaleDateString("bn-BD", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
  if (dayStart === today) return { main: "আজ", sub: `${weekday}, ${date}` };
  if (dayStart === today - DAY) return { main: "গতকাল", sub: `${weekday}, ${date}` };
  return { main: date, sub: weekday };
}

function target(a: Activity) {
  return activityLink(a.raw);
}

/** Subtly highlight order ids, money, percentages and status arrows inside a log line. */
const TOKEN = /([A-Z]{2,5}-[0-9০-৯]+|৳\s?[0-9০-৯][0-9০-৯,.]*|[0-9০-৯]+(?:\.[0-9০-৯]+)?%|→)/g;
function Rich({ text, q }: { text: string; q: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (i % 2 === 1) {
          if (p === "→") return <span key={i} className="ac-arrow" aria-label="থেকে">→</span>;
          if (p.startsWith("৳") || p.endsWith("%")) return <b key={i} className="ac-amt">{bn(p)}</b>;
          return <code key={i} className="ac-id">{p}</code>;
        }
        return <Mark key={i} text={p} q={q} />;
      })}
    </>
  );
}

function Mark({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="ac-hit">{text.slice(i, i + q.length)}</mark><Mark text={text.slice(i + q.length)} q={q} /></>;
}

/* ───────── screen ───────── */

export function ActivityTab() {
  const toast = useToast();
  const { go } = useAdminNav();

  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [who, setWho] = useState<{ id: string | null; name: string } | null>(null);
  const [range, setRange] = useState<Range>("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);

  const today = startOfDay(now);
  const fromTs = range === "all" ? null : range === "today" ? today : today - (Number(range) - 1) * DAY;
  const filter: ActivityFilter = useMemo(() => ({
    area: kind === "all" ? undefined : kind,
    q: term || undefined,
    from: fromTs ? new Date(fromTs).toISOString() : undefined,
    actorId: who?.id ?? undefined,
    limit: PAGE,
  }), [kind, term, fromTs, who]);
  const feed = useActivityFeed(filter);
  const statsQ = useActivityStats();
  const rows = useMemo(() => (feed.data?.pages ?? []).flatMap((p) => p.items).map(toActivity), [feed.data]);
  const stats = statsQ.data;

  /* summary (server stats) */
  const summary = useMemo(() => {
    const daily = stats?.daily ?? [];
    const days = daily.map((d) => d.count);
    const dayLabels = daily.map((d) => new Date(`${d.day}T00:00:00`).toLocaleDateString("bn-BD", { day: "numeric", month: "short" }));
    const byKind = new Map<ActivityKind, number>((stats?.byArea ?? []).map((a) => [a.area as ActivityKind, a.count]));
    const yestN = days.length >= 2 ? days[days.length - 2] : 0;
    const prevWeek = days.slice(0, Math.max(0, days.length - 7)).reduce((s2, n) => s2 + n, 0);
    const byWho = new Map<string, { id: string | null; n: number; last: number }>();
    for (const r of rows) {
      const w = byWho.get(r.by);
      if (w) w.n++;
      else byWho.set(r.by, { id: r.byId, n: 1, last: r.at });
    }
    const people = [...byWho.entries()].map(([name, v]) => ({ name, ...v })).sort((x, y) => y.n - x.n);
    const delta = (x: number, y: number) => (y ? Math.round(((x - y) / y) * 100) : null);
    const topKind = (stats?.topArea?.area as ActivityKind | undefined) ?? null;
    const topPool = (stats?.byArea ?? []).reduce((s2, x) => s2 + x.count, 0);
    return {
      todayN: stats?.today ?? 0, yestN, week: stats?.week ?? 0, prevWeek, days, dayLabels, byKind, people,
      topKind, topN: stats?.topArea?.count ?? 0, topPool, recentIsMonth: true,
      dToday: delta(stats?.today ?? 0, yestN), dWeek: delta(stats?.week ?? 0, prevWeek),
    };
  }, [stats, rows]);

  const needle = term.toLowerCase();
  const list = rows;
  const visible = rows;
  const kindCounts = summary.byKind;
  const base = { length: (stats?.byArea ?? []).reduce((s2, x) => s2 + x.count, 0) };
  const hasMore = !!feed.hasNextPage;

  const groups = useMemo(() => {
    const out: { day: number; items: { row: Activity; idx: number }[]; total: number }[] = [];
    visible.forEach((row, idx) => {
      const day = startOfDay(row.at);
      const last = out[out.length - 1];
      if (last && last.day === day) { last.items.push({ row, idx }); last.total += 1; }
      else out.push({ day, items: [{ row, idx }], total: 1 });
    });
    return out;
  }, [visible]);

  const filtered = kind !== "all" || !!who || range !== "all" || !!needle;
  const reset = () => { setQ(""); setKind("all"); setWho(null); setRange("all"); };

  const exportCsv = () => {
    exportActivity(filtered ? filter : {})
      .then(() => toast("অ্যাক্টিভিটি লগ CSV-তে নামানো হয়েছে"))
      .catch((e) => toast(adminErrorText(e)));
  };

  const open = (r: Activity) => {
    const t = target(r);
    if (t) go(t.tab, t.focus ?? null);
  };
  const everEmpty = !feed.isLoading && !rows.length && !filtered;

  const topKindMeta = summary.topKind ? KINDS[summary.topKind] : null;
  const last = rows[0];
  const whoName = who?.name ?? null;
  const kindsShown = KIND_ORDER.filter((k) => k !== "auth" || (summary.byKind.get("auth") ?? 0) > 0);

  return (
    <div className="ac-root">
      <PageHead
        title="অ্যাক্টিভিটি"
        en="Activity log"
        sub="কে কখন কী বদলেছে — প্রতিটি পরিবর্তনের স্থায়ী রেকর্ড · Audit trail"
        actions={
          <>
            <button type="button" className="ap-btn" onClick={exportCsv} disabled={everEmpty}>
              {Ico.download}CSV এক্সপোর্ট
            </button>
          </>
        }
      />

      {/* summary strip */}
      <div className="ac-summary">
        <Stat label="আজকের কাজ" en="Today" tone="wine" icon={Ico.activity} value={num(summary.todayN)}
          delta={summary.dToday} hint={`গতকাল ${num(summary.yestN)}টি`} onClick={() => setRange("today")} />
        <Stat label="এই সপ্তাহে" en="Last 7 days" tone="gold" icon={Ico.clock} value={num(summary.week)}
          delta={summary.dWeek} hint={`আগের সপ্তাহে ${num(summary.prevWeek)}টি`} onClick={() => setRange("7")} />
        <Stat label="সবচেয়ে ব্যস্ত বিভাগ" en="Most active area" tone="sage" icon={topKindMeta?.icon ?? Ico.grid}
          value={topKindMeta ? topKindMeta.bn : "—"}
          hint={summary.topKind ? `${num(summary.topN)}টি · ${bn(Math.round((summary.topN / Math.max(1, summary.topPool)) * 100))}% ${summary.recentIsMonth ? "· ৩০ দিনে" : ""}` : "এখনো কিছু নেই"}
          onClick={summary.topKind ? () => setKind(summary.topKind as ActivityKind) : undefined} />
        <Stat label="শেষ পরিবর্তন" en="Last change" tone="blue" icon={Ico.edit}
          value={last ? ago(last.at) : "—"} hint={last ? `${last.by} · ${when(last.at)}` : "কোনো রেকর্ড নেই"} />
        <section className="ac-trend ap-card">
          <header>
            <div>
              <b>১৪ দিনের ছন্দ</b>
              <small>14-day activity</small>
            </div>
            <span className="ac-trend-total">{num(summary.days.reduce((s, n) => s + n, 0))}<em>টি কাজ</em></span>
          </header>
          <Columns values={summary.days} labels={summary.dayLabels} height={64} format={(n) => `${num(n)}টি`} />
          <footer><span>{summary.dayLabels[0]}</span><span>আজ</span></footer>
        </section>
      </div>

      {everEmpty ? (
        <Card className="ac-empty-card">
          <EmptyLog />
        </Card>
      ) : (
        <div className="ac-layout">
          <div className="ac-main">
            {/* toolbar */}
            <div className="ac-toolbar">
              <div className="ac-toolbar-row">
                <div className="ac-search"><SearchInput value={q} onChange={setQ} placeholder="লেখা, অর্ডার নম্বর, নাম খুঁজুন…" /></div>
                <Menu
                  align="left"
                  trigger={(isOpen) => (
                    <button type="button" className={`ap-btn ac-who-btn${who ? " on" : ""}${isOpen ? " open" : ""}`} aria-haspopup="menu" aria-expanded={isOpen}>
                      {whoName ? <Avatar name={whoName} size={20} /> : Ico.user}
                      <span>{whoName ?? "সবাই"}</span>
                      <span className="ac-caret">{Ico.chevD}</span>
                    </button>
                  )}
                >
                  {(close) => (
                    <div className="ac-who-menu" role="menu">
                      <div className="ac-menu-cap">কে করেছেন · Person</div>
                      <button type="button" role="menuitem" className={`ap-menu-item${who === null ? " on" : ""}`} onClick={() => { setWho(null); close(); }}>
                        {Ico.customers}সবাই<small>{num(base.length)}</small>
                      </button>
                      {summary.people.map((p) => (
                        <button key={p.name} type="button" role="menuitem" className={`ap-menu-item${whoName === p.name ? " on" : ""}`} onClick={() => { setWho({ id: p.id, name: p.name }); close(); }}>
                          <Avatar name={p.name} size={22} /><span className="ac-who-name">{p.name}</span><small>{num(p.n)}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </Menu>
                <Segmented size="sm" value={range} onChange={setRange} options={RANGES} />
              </div>
              <div className="ac-chips" role="toolbar" aria-label="বিভাগ ফিল্টার">
                <button type="button" className={`ac-chip k-all${kind === "all" ? " on" : ""}`} aria-pressed={kind === "all"} onClick={() => setKind("all")}>
                  <span className="ac-chip-ico">{Ico.list}</span>সব<em>{num(base.length)}</em>
                </button>
                {kindsShown.map((k) => {
                  const n = kindCounts.get(k) ?? 0;
                  return (
                    <button key={k} type="button" className={`ac-chip k-${k}${kind === k ? " on" : ""}${n === 0 ? " zero" : ""}`} aria-pressed={kind === k}
                      onClick={() => setKind(kind === k ? "all" : k)}>
                      <span className="ac-chip-ico">{KINDS[k].icon}</span>{KINDS[k].bn}<em>{num(n)}</em>
                    </button>
                  );
                })}
              </div>
            </div>

            {filtered ? (
              <div className="ac-result">
                <span><b>{num(list.length)}{hasMore ? "+" : ""}</b>টি ফলাফল{whoName ? <> · <i>{whoName}</i></> : null}</span>
                <button type="button" className="ac-reset" onClick={reset}>{Ico.close}ফিল্টার মুছুন</button>
              </div>
            ) : null}

            {/* feed */}
            {list.length === 0 ? (
              <Card>
                <Empty icon={Ico.filter} title="এই ফিল্টারে কিছু পাওয়া যায়নি" sub="সার্চ বা তারিখের পরিসর বদলে দেখুন, অথবা সব ফিল্টার মুছে দিন।"
                  action={<button type="button" className="ap-btn sm" onClick={reset}>সব দেখান</button>} />
              </Card>
            ) : (
              <div className="ac-feed">
                {groups.map((g) => {
                  const lbl = dayLabel(g.day, today);
                  return (
                    <section key={g.day} className="ac-day">
                      <header className="ac-day-head">
                        <span className="ac-day-pill">
                          <b>{lbl.main}</b>
                          <small>{lbl.sub}</small>
                        </span>
                        <span className="ac-day-rule" />
                        <span className="ac-day-count">{num(g.total)}টি</span>
                      </header>
                      <ol className="ac-list">
                        {g.items.map(({ row, idx }) => {
                          const t = target(row);
                          const meta = KINDS[row.kind] ?? KINDS.settings;
                          const stagger = { "--i": Math.min(idx % PAGE, 16) } as CSSProperties;
                          const body = (
                            <>
                              <span className="ac-node" aria-hidden="true">{meta.icon}</span>
                              <span className="ac-card">
                                <span className="ac-line">
                                  <span className="ac-text"><Rich text={row.text} q={needle} /></span>
                                  <span className="ac-time" title={`${when(row.at)} · ${ago(row.at)}`}>
                                    <span className="ac-clock">{clock(row.at)}</span>
                                    <span className="ac-ago">{ago(row.at)}</span>
                                  </span>
                                </span>
                                <span className="ac-meta">
                                  <Avatar name={row.by} size={20} />
                                  <span className="ac-by"><Mark text={row.by} q={needle} /></span>
                                  <span className="ac-dot" />
                                  <span className="ac-kind">{meta.bn}<i>{meta.en}</i></span>
                                  {row.ref ? <><span className="ac-dot" /><span className="ac-ref">{row.ref}</span></> : null}
                                </span>
                              </span>
                              {t ? <span className="ac-go" aria-hidden="true">{Ico.chevR}</span> : null}
                            </>
                          );
                          return (
                            <li key={row.id} className={`ac-item k-${row.kind}`} style={stagger}>
                              {t ? (
                                <button type="button" className="ac-row click" onClick={() => open(row)} aria-label={`${row.text} — খুলুন`}>{body}</button>
                              ) : (
                                <div className="ac-row">{body}</div>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  );
                })}

                <div className="ac-more">
                  {hasMore ? (
                    <button type="button" className="ap-btn ac-more-btn" disabled={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
                      {feed.isFetchingNextPage ? "লোড হচ্ছে…" : "আরও দেখুন"} <small>পুরনো {num(PAGE)}টি</small>
                    </button>
                  ) : (
                    <span className="ac-end">{Ico.check}সব দেখানো হয়েছে · {num(list.length)}টি রেকর্ড</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* aside */}
          <aside className="ac-aside">
            <Card title="কে কী করেছেন" en="People" className="ac-side-card">
              <ul className="ac-people">
                {summary.people.slice(0, 6).map((p) => (
                  <li key={p.name}>
                    <button type="button" className={whoName === p.name ? "on" : ""} onClick={() => setWho(whoName === p.name ? null : { id: p.id, name: p.name })}>
                      <Avatar name={p.name} size={30} />
                      <span><b>{p.name}</b><small>শেষ: {ago(p.last)}</small></span>
                      <em>{num(p.n)}</em>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="বিভাগ অনুযায়ী" en="By area" className="ac-side-card">
              <ul className="ac-kinds">
                {kindsShown.map((k) => {
                  const n = summary.byKind.get(k) ?? 0;
                  const pct = summary.topPool ? (n / summary.topPool) * 100 : 0;
                  return (
                    <li key={k} className={`k-${k}`}>
                      <button type="button" className={kind === k ? "on" : ""} onClick={() => setKind(kind === k ? "all" : k)}>
                        <span className="ac-kinds-top">
                          <span className="ac-kinds-ico">{KINDS[k].icon}</span>
                          <span>{KINDS[k].bn}</span>
                          <b>{num(n)}</b>
                        </span>
                        <span className="ac-kinds-track"><i style={{ width: `${pct}%` }} /></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <p className="ac-note">{Ico.lock}<span>লগ স্থায়ী — কোনো রেকর্ড মোছা যায় না। বিভাগের হিসাব গত ৩০ দিনের। দরকার হলে <b>CSV এক্সপোর্ট</b> করুন।</span></p>
          </aside>
        </div>
      )}

    </div>
  );
}

function EmptyLog() {
  const examples: { kind: ActivityKind; text: string }[] = [
    { kind: "order", text: "CLO-1042: কনফার্মড → শিপড" },
    { kind: "product", text: "মাসুদ রানা ১ম খণ্ড · দাম বদলানো" },
    { kind: "settings", text: "নতুন কুপন EID25 · ২৫%" },
    { kind: "finance", text: "ক্যাশবুক: ঢুকেছে ৳১২,৫০০" },
  ];
  return (
    <div className="ac-empty">
      <div className="ac-empty-art" aria-hidden="true">
        <span className="ac-empty-glow" />
        <span className="ac-empty-ico">{Ico.activity}</span>
      </div>
      <b>এখনো কোনো অ্যাক্টিভিটি নেই</b>
      <p>
        অ্যাডমিনে যা-ই বদলান — অর্ডারের স্ট্যাটাস, পণ্যের দাম, কুপন, সেটিংস, কাস্টমার নোট বা চ্যাটের জবাব —
        সবকিছু এখানে নিজে থেকেই সময় ও নামসহ জমা হবে। কিছু করতে হবে না।
      </p>
      <small>Every change made in the admin is recorded here automatically.</small>
      <ol className="ac-empty-demo">
        {examples.map((e, i) => (
          <li key={e.kind} className={`k-${e.kind}`} style={{ "--i": i } as CSSProperties}>
            <span className="ac-node">{KINDS[e.kind].icon}</span>
            <span className="ac-empty-line"><Rich text={e.text} q="" /></span>
            <em>{KINDS[e.kind].bn}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}
