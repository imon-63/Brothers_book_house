"use client";

import { useAdminNav } from "@/components/admin/nav";
import { VisibilityPanel } from "@/components/admin/tabs/visibility";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { BnDateField } from "@/components/ui/bangla-calendar";
import { bn } from "@/lib/format";
import { adminErrorText, useToast } from "@/lib/api/admin/core";
import { uploadMedia } from "@/lib/api/admin/products";
import {
  useAnnouncements, useCoupons, useCreateAnnouncement, useCreateCoupon, useDeleteAnnouncement, usePatchZone, usePromos, useSavePromo, useSaveShipRule,
  useSetStoreSettings, useShipRules, useStoreSettings, useToggleCoupon, useUpdateAnnouncement, useZones, type AdminCoupon, type ShipRule,
} from "@/lib/api/admin/settings";
import { readFile, TabMark } from "@/components/admin/shared";
import { StaffPanel } from "@/components/admin/tabs/staff";
import { AccessPanel } from "@/components/admin/tabs/access";
import { ThemePanel } from "@/components/admin/tabs/theme";
import { useMe } from "@/lib/api/auth";
import { useConfirm, type ConfirmDetail } from "@/components/admin/confirm";
import { Ico, Segmented, Toggle } from "@/components/admin/ui";
import "./settings.css";

type SetMenu = "cats" | "ship" | "coupons" | "promo" | "ticker" | "staff" | "access" | "theme";

const SET_MENUS: { id: SetMenu; label: string }[] = [
  { id: "cats", label: "ক্যাটাগরি" },
  { id: "ship", label: "ডেলিভারি" },
  { id: "coupons", label: "কুপন" },
  { id: "promo", label: "অফার মডাল" },
  { id: "ticker", label: "টপবার" },
  { id: "staff", label: "স্টাফ" },
  { id: "access", label: "অ্যাক্সেস" },
  { id: "theme", label: "থিম" },
];
const ADMIN_ONLY: SetMenu[] = ["staff", "access", "theme"];

export function SettingsTab() {
  const { focus, clearFocus } = useAdminNav();
  const { me } = useMe();
  const isAdmin = me?.role === "OWNER" || me?.role === "ADMIN";
  const menus = SET_MENUS.filter((m) => isAdmin || !ADMIN_ONLY.includes(m.id));
  const [menu, setMenu] = useState<SetMenu>(() => (SET_MENUS.some((m) => m.id === focus) ? (focus as SetMenu) : "cats"));
  useEffect(() => {
    if (focus && SET_MENUS.some((m) => m.id === focus)) { setMenu(focus as SetMenu); clearFocus(); }
  }, [focus, clearFocus]);

  return (
    <div className="set-page">
      <nav className="set-steps" aria-label="সেটিংস">
        {menus.map((item, i) => (
          <button key={item.id} type="button" className={menu === item.id ? "on" : ""} onClick={() => setMenu(item.id)}>
            <i>{bn(i + 1)}</i>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {menu === "cats" ? <VisibilityPanel /> : null}
      {menu === "ship" ? <div className="set-panel"><ShipTab /></div> : null}
      {menu === "coupons" ? <div className="set-panel"><CouponsTab /></div> : null}
      {menu === "promo" ? <div className="set-panel"><PromoTab /></div> : null}
      {menu === "ticker" ? <div className="set-panel"><TickerTab /></div> : null}
      {menu === "staff" && isAdmin ? <div className="set-panel"><StaffPanel /></div> : null}
      {menu === "access" && isAdmin ? <div className="set-panel"><AccessPanel /></div> : null}
      {menu === "theme" && isAdmin ? <div className="set-panel"><ThemePanel /></div> : null}
    </div>
  );
}

function TickerTab() {
  const toast = useToast();
  const q = useAnnouncements();
  const rows = (q.data ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const ticker = rows.filter((r) => r.isActive).map((r) => r.text);
  const createM = useCreateAnnouncement();
  const updateM = useUpdateAnnouncement();
  const deleteM = useDeleteAnnouncement();
  const confirm = useConfirm();
  const form = useForm({ defaultValues: { text: "" } });
  return (
    <section className="cfg-card">
      <header className="cfg-head">
        <div><h3>টপবারের স্ক্রলিং টেক্সট</h3><p>সাইটের একদম উপরের বারে লাইনগুলো ঘুরে ঘুরে চলবে</p></div>
        <span className="pk-count">{bn(rows.length)}টি লাইন</span>
      </header>
      <div className="cfg-ticker" aria-hidden="true">
        <div className="cfg-ticker-run">
          {(ticker.length ? [...ticker, ...ticker] : ["এখানে আপনার টেক্সট চলবে"]).map((t, i) => <span key={i}>{t}</span>)}
        </div>
      </div>
      <form className="cfg-add" onSubmit={form.handleSubmit(({ text }) => {
        if (!text.trim()) { toast("টেক্সট লিখুন"); return; }
        createM.mutate({ text: text.trim() }, { onSuccess: () => form.reset() });
      })}>
        <input {...form.register("text")} placeholder="নতুন লাইন · যেমন: ঈদে ফ্রি ডেলিভারি" maxLength={200} />
        <button className="btn btn-primary btn-sm" type="submit" disabled={createM.isPending}>যোগ করুন</button>
      </form>
      {rows.length ? (
        <ol className="cfg-lines">
          {rows.map((t, i) => (
            <li key={t.id}>
              <span className="cfg-no">{bn(i + 1)}</span>
              <LineInput value={t.text} onCommit={(text) => updateM.mutate({ id: t.id, text }, { onSuccess: () => toast("লাইন সেভ হয়েছে") })} />
              <button type="button" className="pk-del" aria-label="সরান" title="সরান" onClick={async () => {
                if (!(await confirm({
                  tone: "danger",
                  title: "টপবারের এই লাইন মুছবেন?",
                  body: <>«{t.text}»</>,
                  details: [{ label: "টপবারে থাকবে", from: `${bn(rows.length)}টি লাইন`, to: `${bn(rows.length - 1)}টি লাইন` }],
                  confirmText: "হ্যাঁ, মুছুন", confirmIcon: Ico.trash,
                }))) return;
                deleteM.mutate({ id: t.id });
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg>
              </button>
            </li>
          ))}
        </ol>
      ) : <div className="empty">{q.isLoading ? "লোড হচ্ছে…" : "এখনো কোনো টেক্সট নেই"}</div>}
    </section>
  );
}

function LineInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <input value={v} maxLength={200} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() && v.trim() !== value) onCommit(v.trim()); else setV(value); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}

function CouponsTab() {
  const toast = useToast();
  const q = useCoupons();
  const createM = useCreateCoupon();
  const toggleM = useToggleCoupon();
  const confirm = useConfirm();
  const coupons: AdminCoupon[] = q.data?.items ?? [];
  const form = useForm({ defaultValues: { code: "", off: "", type: "pct" } });
  const live = form.watch();
  const liveCode = (live.code || "").trim().toUpperCase();
  const liveOff = Number(live.off || 0);
  const usedTotal = coupons.reduce((sum, c) => sum + (c.stats?.uses ?? c.usedCount ?? 0), 0);
  const activeN = coupons.filter((c) => c.isActive).length;
  const taken = coupons.some((c) => c.code === liveCode);

  function add(data: { code: string; off: string; type: string }) {
    const code = data.code.trim().toUpperCase();
    const off = Number(data.off || 0);
    if (!code || !off) { toast("কোড ও মান দিন"); return; }
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) { toast("কোড ৩–২৪ অক্ষর · A-Z, 0-9, _ বা -"); return; }
    if (coupons.some((c) => c.code === code)) { toast("এই কোড আগেই আছে"); return; }
    if (data.type === "pct" && off >= 100) { toast("শতাংশ ১০০-এর কম দিন"); return; }
    createM.mutate({ code, type: data.type === "tk" ? "FIXED" : "PERCENT", value: off }, { onSuccess: () => form.reset({ code: "", off: "", type: data.type }) });
  }

  function suggest() {
    const words = ["CHOLO", "BOI", "EID", "SAVE", "READ", "NEW"];
    const w = words[Math.floor(Math.random() * words.length)];
    form.setValue("code", `${w}${liveOff || Math.floor(Math.random() * 4 + 1) * 10}`);
  }

  function copy(code: string) {
    navigator.clipboard?.writeText(code).catch(() => undefined);
    toast(`${code} কপি হয়েছে`);
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
          <button className="btn btn-primary btn-wide" style={{ marginTop: 14 }} type="submit" disabled={taken || createM.isPending}>কুপন তৈরি করুন</button>
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
      {!coupons.length ? <div className="empty">{q.isLoading ? "লোড হচ্ছে…" : "এখনো কোনো কুপন নেই"}</div> : (
        <div className="cp-grid">
          {coupons.map((c, i) => {
            const n = c.stats?.uses ?? c.usedCount ?? 0;
            return (
              <article key={c.id} className={`cp-ticket${c.isActive ? "" : " is-off"}`} style={{ animationDelay: `${i * 50}ms` }}>
                <div className="cp-t-left">
                  <b>{c.type === "PERCENT" ? `${bn(c.value)}%` : c.type === "FIXED" ? `৳${bn(c.value)}` : "ফ্রি"}</b>
                  <small>{c.type === "PERCENT" ? "শতাংশ ছাড়" : c.type === "FIXED" ? "টাকা ছাড়" : "ফ্রি ডেলিভারি"}</small>
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
                    <input type="checkbox" checked={c.isActive} onChange={async () => {
                      if (c.isActive && !(await confirm({
                        tone: "warn", icon: Ico.tag,
                        title: `কুপন ${c.code} বন্ধ করবেন?`,
                        body: "চেকআউটে এই কোড আর কাজ করবে না। আগের অর্ডারের ছাড় বদলাবে না।",
                        details: [{ label: "অবস্থা", from: "চালু", to: "বন্ধ" }, { label: "ব্যবহার", value: n ? `${bn(n)}টি অর্ডারে` : "এখনো হয়নি" }],
                        confirmText: "হ্যাঁ, বন্ধ করুন",
                      }))) return;
                      toggleM.mutate({ id: c.id, code: c.code, on: !c.isActive });
                    }} />
                    <span className="sw" aria-hidden="true" />
                    <span>{c.isActive ? (c.expired ? "চালু · মেয়াদ শেষ" : "চালু") : "বন্ধ"}</span>
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

type PromoSettings = { on: boolean; title: string; text: string; code: string; image: string; imageId: string | null };

function PromoTab() {
  const toast = useToast();
  const promosQ = usePromos();
  const couponsQ = useCoupons();
  const saveM = useSavePromo();
  const promo = (promosQ.data ?? []).find((p) => p.isActive) ?? promosQ.data?.[0] ?? null;
  const base: PromoSettings = useMemo(() => ({
    on: !!promo?.isActive, title: promo?.title ?? "", text: promo?.body ?? "", code: promo?.coupon?.code ?? "", image: promo?.image?.url ?? "", imageId: promo?.imageId ?? null,
  }), [promo]);
  const [draft, setDraft] = useState<PromoSettings>(base);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setDraft(base), [base]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  function save() {
    const code = draft.code.trim().toUpperCase();
    const coupon = code ? (couponsQ.data?.items ?? []).find((c) => c.code === code) : null;
    if (code && !coupon) { toast(`«${code}» নামে কোনো কুপন নেই — আগে কুপন বানান`); return; }
    if (!draft.title.trim()) { toast("শিরোনাম দিন"); return; }
    saveM.mutate({ id: promo?.id, body: { title: draft.title.trim(), body: draft.text.trim() || null, couponId: coupon?.id ?? null, imageId: draft.imageId, isActive: draft.on } });
  }
  async function pickImage(f: File) {
    setUploading(true);
    readFile(f, (url) => setDraft((d) => ({ ...d, image: url })));
    try {
      const m = await uploadMedia(f, "promo");
      setDraft((d) => ({ ...d, imageId: m.id }));
    } catch (e) {
      toast(adminErrorText(e));
      setDraft((d) => ({ ...d, image: base.image, imageId: base.imageId }));
    } finally { setUploading(false); }
  }
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
              <label className="btn btn-ghost btn-sm cfg-file">{uploading ? "আপলোড হচ্ছে…" : "ছবি বাছুন"}<input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickImage(f); }} /></label>
              {draft.image ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft({ ...draft, image: "", imageId: null })}>সরান</button> : null}
            </div>
          </div>
        </div>
        <div className="cfg-foot">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { try { sessionStorage.removeItem("cholo_promo_seen"); localStorage.removeItem("cholo_promo_seen"); } catch { /* ignore */ } toast("পরের রিফ্রেশে মডাল আবার দেখাবে"); }}>টেস্ট: আবার দেখাও</button>
          <button type="button" className="btn btn-primary" disabled={!dirty || uploading || saveM.isPending} onClick={save}>{dirty ? "সেভ করুন" : "সেভ করা আছে"}</button>
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

type ShipSettings = {
  dhaka: number; outside: number; costDhaka: number; costOutside: number; freeOnPack: boolean; freeOnBooks: boolean;
  freeAboveOn: boolean; freeAbove: number; freeAllOn: boolean; freeFrom: string; freeTo: string; sslFeePct: number;
};
function toLocalDt(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

function ShipTab() {
  const toast = useToast();
  const zonesQ = useZones();
  const rulesQ = useShipRules();
  const kvQ = useStoreSettings();
  const zoneM = usePatchZone();
  const ruleM = useSaveShipRule();
  const kvM = useSetStoreSettings();
  const confirm = useConfirm();
  const zIn = zonesQ.data?.find((z) => z.code === "inside_dhaka");
  const zOut = zonesQ.data?.find((z) => z.code === "outside_dhaka");
  const rule = (t: ShipRule["type"], section?: string) => rulesQ.data?.find((r) => r.type === t && (!section || r.section?.code === section));
  const rMin = rule("MIN_SUBTOTAL"), rPack = rule("ANY_BUNDLE"), rBook = rule("SECTION_ONLY", "book"), rAll = rule("CAMPAIGN_ALL");
  const fee = Number(kvQ.data?.find((r) => r.key === "gateway_fee_pct")?.value ?? 0);
  const ship: ShipSettings = useMemo(() => ({
    dhaka: zIn?.fee ?? 0, outside: zOut?.fee ?? 0, costDhaka: zIn?.courierCost ?? 0, costOutside: zOut?.courierCost ?? 0,
    freeOnPack: !!rPack?.isActive, freeOnBooks: !!rBook?.isActive, freeAboveOn: !!rMin?.isActive, freeAbove: rMin?.minSubtotal ?? 500,
    freeAllOn: !!rAll?.isActive, freeFrom: toLocalDt(rAll?.startsAt ?? null), freeTo: toLocalDt(rAll?.endsAt ?? null), sslFeePct: Number.isFinite(fee) ? fee : 0,
  }), [zIn, zOut, rPack, rBook, rMin, rAll, fee]);
  const [draft, setDraft] = useState<ShipSettings>(ship);
  useEffect(() => setDraft(ship), [ship]);
  const set = (patch: Partial<ShipSettings>) => setDraft({ ...draft, ...patch });
  const [calc, setCalc] = useState({ total: 800, zone: "in" as "in" | "out", pack: false, books: false });
  const [saving, setSaving] = useState(false);

  async function save() {
    /* turning a free-delivery rule off or changing a fee hits every checkout — ask first */
    const tkS = (n: number) => `৳${bn(n)}`;
    const onOff = (v: boolean) => (v ? "চালু" : "বন্ধ");
    const diff: ConfirmDetail[] = [];
    let risky = false;
    const fee = (label: string, a: number, b: number) => { if (a !== b) { diff.push({ label, from: tkS(a), to: tkS(b) }); risky = true; } };
    const rule = (label: string, a: boolean, b: boolean) => { if (a !== b) { diff.push({ label, from: onOff(a), to: onOff(b), bad: !b }); if (!b) risky = true; } };
    fee("ঢাকার ভিতর · কাস্টমার", ship.dhaka, draft.dhaka);
    fee("ঢাকার বাইরে · কাস্টমার", ship.outside, draft.outside);
    rule("প্যাকেজে ফ্রি ডেলিভারি", ship.freeOnPack, draft.freeOnPack);
    rule("শুধু বইয়ে ফ্রি ডেলিভারি", ship.freeOnBooks, draft.freeOnBooks);
    rule(`৳${bn(draft.freeAbove)}+ এ ফ্রি`, ship.freeAboveOn, draft.freeAboveOn);
    rule("সবার জন্য ফ্রি ক্যাম্পেইন", ship.freeAllOn, draft.freeAllOn);
    if (risky && !(await confirm({
      tone: diff.some((d) => d.bad) ? "danger" : "warn", icon: Ico.truck,
      title: "ডেলিভারি নিয়ম বদলাবেন?",
      body: "সেভ করলেই চেকআউট ও কার্টে নতুন খরচ বসবে — চলমান কার্টেও।",
      details: diff,
      confirmText: "হ্যাঁ, সেভ করুন",
    }))) return;
    setSaving(true);
    const jobs: Promise<unknown>[] = [];
    const run = <T,>(m: { mutateAsync: (v: T) => Promise<unknown> }, v: T) => jobs.push(m.mutateAsync(v));
    if (zIn && (draft.dhaka !== ship.dhaka || draft.costDhaka !== ship.costDhaka)) run(zoneM, { id: zIn.id, fee: draft.dhaka, courierCost: draft.costDhaka });
    if (zOut && (draft.outside !== ship.outside || draft.costOutside !== ship.costOutside)) run(zoneM, { id: zOut.id, fee: draft.outside, courierCost: draft.costOutside });
    const upsert = (r: ShipRule | undefined, body: Parameters<typeof ruleM.mutateAsync>[0]["body"]) => run(ruleM, { id: r?.id, body });
    if (draft.freeOnPack !== ship.freeOnPack) upsert(rPack, rPack ? { isActive: draft.freeOnPack } : { type: "ANY_BUNDLE", label: "প্যাকেজ থাকলে ফ্রি ডেলিভারি", isActive: draft.freeOnPack });
    if (draft.freeOnBooks !== ship.freeOnBooks) upsert(rBook, rBook ? { isActive: draft.freeOnBooks } : { type: "SECTION_ONLY", label: "শুধু বই থাকলে ফ্রি ডেলিভারি", section: "book", isActive: draft.freeOnBooks });
    if (draft.freeAboveOn !== ship.freeAboveOn || draft.freeAbove !== ship.freeAbove) {
      if (draft.freeAboveOn && !(draft.freeAbove > 0)) { toast("ফ্রি ডেলিভারির অঙ্ক দিন"); setSaving(false); return; }
      upsert(rMin, { ...(rMin ? {} : { type: "MIN_SUBTOTAL" as const }), label: `৳${draft.freeAbove}+ অর্ডারে ফ্রি ডেলিভারি`, minSubtotal: draft.freeAbove > 0 ? draft.freeAbove : null, isActive: draft.freeAboveOn });
    }
    if (draft.freeAllOn !== ship.freeAllOn || draft.freeFrom !== ship.freeFrom || draft.freeTo !== ship.freeTo) {
      upsert(rAll, { ...(rAll ? {} : { type: "CAMPAIGN_ALL" as const, label: "সবার জন্য ফ্রি ডেলিভারি (ক্যাম্পেইন)" }), isActive: draft.freeAllOn, startsAt: toIso(draft.freeFrom), endsAt: toIso(draft.freeTo) });
    }
    if (draft.sslFeePct !== ship.sslFeePct) run(kvM, { gateway_fee_pct: draft.sslFeePct });
    try {
      await Promise.all(jobs);
      toast(jobs.length ? "ডেলিভারি সেভ হয়েছে" : "কোনো পরিবর্তন নেই");
    } catch { /* each mutation already toasted its error */ }
    setSaving(false);
  }
  const camp = campaignState(draft.freeAllOn, draft.freeFrom, draft.freeTo);
  const dirty = (Object.keys(draft) as (keyof ShipSettings)[]).filter((k) => draft[k] !== ship[k]).length;
  const rulesOn = [draft.freeOnPack, draft.freeOnBooks, draft.freeAboveOn, camp.k === "live"].filter(Boolean).length;
  const num = (v: string) => Number(v) || 0;

  /* "customer will pay" preview — mirrors the order in which checkout grants free delivery */
  const zoneFee = calc.zone === "in" ? draft.dhaka : draft.outside;
  const zoneCost = calc.zone === "in" ? draft.costDhaka : draft.costOutside;
  const why = camp.k === "live" ? "ক্যাম্পেইন চলছে"
    : draft.freeOnPack && calc.pack ? "কার্টে প্যাকেজ আছে"
    : draft.freeOnBooks && calc.books ? "কার্টে শুধু বই"
    : draft.freeAboveOn && draft.freeAbove > 0 && calc.total >= draft.freeAbove ? `৳${bn(draft.freeAbove)}+ অর্ডার`
    : null;
  const pay = why ? 0 : zoneFee;
  const gap = !why && draft.freeAboveOn && draft.freeAbove > calc.total ? draft.freeAbove - calc.total : 0;
  const gapPct = draft.freeAbove > 0 ? Math.min(100, Math.round((calc.total / draft.freeAbove) * 100)) : 0;
  const margin = pay - zoneCost;

  const zone = (k: "in" | "out") => {
    const fee = k === "in" ? draft.dhaka : draft.outside;
    const cost = k === "in" ? draft.costDhaka : draft.costOutside;
    const m = fee - cost;
    return (
      <section className={`dl-zone z-${k}`}>
        <div className="dl-zone-top">
          <span className="dl-zone-ico" aria-hidden="true">{k === "in" ? DlIco.pin : Ico.truck}</span>
          <div>
            <h3>{k === "in" ? "ঢাকার ভিতর" : "ঢাকার বাইরে"}</h3>
            <p>{k === "in" ? "শুধু জেলা ঢাকা" : "অন্য সব জেলা (৬৩টি)"}</p>
          </div>
          <ZoneArt k={k} />
        </div>
        <label className="dl-money big">
          <span>কাস্টমার দেখবে</span>
          <div><i>৳</i><input type="number" inputMode="numeric" min={0} value={fee} onChange={(e) => set(k === "in" ? { dhaka: num(e.target.value) } : { outside: num(e.target.value) })} /></div>
        </label>
        <div className="dl-zone-foot">
          <label className="dl-money">
            <span>আপনার খরচ (কুরিয়ার)</span>
            <div><i>৳</i><input type="number" inputMode="numeric" min={0} value={cost} onChange={(e) => set(k === "in" ? { costDhaka: num(e.target.value) } : { costOutside: num(e.target.value) })} /></div>
          </label>
          <span className={`dl-margin ${m > 0 ? "up" : m < 0 ? "down" : ""}`} title="কাস্টমার ফি − কুরিয়ার খরচ">
            <small>প্রতি অর্ডারে</small>
            <b>{m > 0 ? "+" : m < 0 ? "−" : ""}৳{bn(Math.abs(m))}</b>
            <em>{m > 0 ? "লাভ" : m < 0 ? "ভর্তুকি" : "সমান"}</em>
          </span>
        </div>
      </section>
    );
  };

  return (
    <div className="dl">
      <header className={`dl-hero${camp.k === "live" ? " camp" : ""}`}>
        <div className="dl-hero-copy">
          <span className="dl-eyebrow">{Ico.truck} DELIVERY</span>
          <h2>ডেলিভারি সেটিং</h2>
          <p>ঢাকা জেলা = ভিতর · অন্য জেলা = বাইরে। চেকআউটে জেলা বাছাই করলে এই খরচ বসবে।</p>
          <div className="dl-hero-chips">
            <span><small>ঢাকার ভিতর</small><b>৳{bn(draft.dhaka)}</b></span>
            <span><small>ঢাকার বাইরে</small><b>৳{bn(draft.outside)}</b></span>
            <span><small>ফ্রি নিয়ম চালু</small><b>{bn(rulesOn)}টি</b></span>
          </div>
        </div>
        <span className={`dl-live k-${camp.k === "live" ? "live" : "base"}`}><i />{camp.k === "live" ? "ক্যাম্পেইন চালু · সবার জন্য ফ্রি" : "সাধারণ রেট চালু"}</span>
      </header>

      <div className="dl-grid">
        <div className="dl-main">
          <div className="dl-sec-h"><h3>জোন ও ফি</h3><p>কাস্টমার যা দেবে আর কুরিয়ারকে আপনি যা দেবেন</p></div>
          <div className="dl-zones">{zone("in")}{zone("out")}</div>

          <div className="dl-sec-h"><h3>ফ্রি হোম ডেলিভারি</h3><p>টগল চালু করলে সেই অর্ডারে কুরিয়ার ৳০</p></div>
          <div className="dl-rules">
            <RuleCard on={draft.freeOnPack} icon={Ico.packs} title="প্যাকেজ কিনলে" sub="কার্টে প্যাকেজ থাকলে ফ্রি" onChange={(freeOnPack) => set({ freeOnPack })} />
            <RuleCard on={draft.freeOnBooks} icon={Ico.products} title="শুধু বই কিনলে" sub="কার্টে বই ছাড়া কিছু না থাকলে" onChange={(freeOnBooks) => set({ freeOnBooks })} />
            <RuleCard wide on={draft.freeAboveOn} icon={Ico.cash} title="অঙ্কের উপরে" sub={`৳${bn(draft.freeAbove)} বা বেশি অর্ডারে ফ্রি`} onChange={(freeAboveOn) => set({ freeAboveOn })}>
              <div className="dl-thresh">
                <label className="dl-money">
                  <span>ফ্রি হবে যে অঙ্ক থেকে</span>
                  <div><i>৳</i><input type="number" inputMode="numeric" min={0} value={draft.freeAbove} onChange={(e) => set({ freeAbove: num(e.target.value) })} /></div>
                </label>
                <div className="dl-chips" role="group" aria-label="দ্রুত অঙ্ক">
                  {QUICK.map((v) => (
                    <button key={v} type="button" className={draft.freeAbove === v ? "on" : ""} onClick={() => set({ freeAbove: v })}>৳{bn(v.toLocaleString("en-IN"))}</button>
                  ))}
                </div>
              </div>
            </RuleCard>
          </div>

          <section className={`dl-camp k-${camp.k}`}>
            <div className="dl-camp-top">
              <span className="dl-rule-ico" aria-hidden="true">{DlIco.cal}</span>
              <div className="dl-rule-txt">
                <b>সময় বেঁধে সবার জন্য ফ্রি</b>
                <small>এই সময়ের মধ্যে সব অর্ডারে হোম ডেলিভারি ফ্রি</small>
              </div>
              <span className="dl-camp-state"><i />{camp.label}</span>
              <Toggle checked={draft.freeAllOn} onChange={(freeAllOn) => set({ freeAllOn })} />
            </div>
            <div className="dl-camp-range">
              <div className="dl-date"><BnDateField label="শুরু" withTime value={draft.freeFrom} onChange={(freeFrom) => set({ freeFrom })} /></div>
              <span className="dl-camp-arrow" aria-hidden="true">{Ico.chevR}</span>
              <div className="dl-date"><BnDateField label="শেষ" withTime end value={draft.freeTo} onChange={(freeTo) => set({ freeTo })} /></div>
            </div>
            <p className="dl-note">খালি রাখলে সময়ের সীমা নেই — টগল চালু থাকা পর্যন্ত ফ্রি।</p>
          </section>

          <section className="dl-ssl">
            <span className="dl-rule-ico" aria-hidden="true">{DlIco.card}</span>
            <div className="dl-rule-txt">
              <b>SSL ফি</b>
              <small>লাভ-ক্ষতির হিসাবে SSLCOMMERZ অর্ডারে এই হারে ফি ধরা হয় — কাস্টমার দেখবে না (gateway_fee_pct)</small>
            </div>
            <label className="dl-money pct">
              <span className="sr">ফি %</span>
              <div><input type="number" inputMode="decimal" min={0} step="0.1" value={draft.sslFeePct} onChange={(e) => set({ sslFeePct: num(e.target.value) })} /><i>%</i></div>
            </label>
          </section>
        </div>

        <aside className="dl-calc" aria-label="কাস্টমার কত দেবে">
          <div className="dl-calc-h">
            <span className="dl-eyebrow">{DlIco.calc} লাইভ প্রিভিউ</span>
            <h3>কাস্টমার কত দেবে?</h3>
            <p>এখনকার (সেভ না করা) সেটিং দিয়ে হিসাব</p>
          </div>
          <label className="dl-money">
            <span>কার্ট টোটাল</span>
            <div><i>৳</i><input type="number" inputMode="numeric" min={0} value={calc.total} onChange={(e) => setCalc({ ...calc, total: num(e.target.value) })} /></div>
          </label>
          <Segmented size="sm" value={calc.zone} onChange={(zone) => setCalc({ ...calc, zone })} options={[{ id: "in", label: "ঢাকার ভিতর" }, { id: "out", label: "ঢাকার বাইরে" }]} />
          <div className="dl-calc-flags">
            <Toggle checked={calc.pack} onChange={(pack) => setCalc({ ...calc, pack })} label="প্যাকেজ আছে" />
            <Toggle checked={calc.books} onChange={(books) => setCalc({ ...calc, books })} label="শুধু বই" />
          </div>
          <div className={`dl-ticket${why ? " free" : ""}`} key={`${pay}-${why ?? ""}`}>
            <div className="dl-ticket-row"><span>সাবটোটাল</span><b>৳{bn(calc.total.toLocaleString("en-IN"))}</b></div>
            <div className="dl-ticket-row"><span>ডেলিভারি</span><b>{why ? <s>৳{bn(zoneFee)}</s> : null}{why ? "ফ্রি" : `৳${bn(zoneFee)}`}</b></div>
            <div className="dl-ticket-total"><span>কাস্টমার দেবে</span><b>৳{bn((calc.total + pay).toLocaleString("en-IN"))}</b></div>
            {why ? <span className="dl-ticket-why">{Ico.check} ফ্রি · {why}</span> : null}
          </div>
          {gap > 0 ? (
            <div className="dl-gap">
              <span>আর <b>৳{bn(gap.toLocaleString("en-IN"))}</b> কিনলে ফ্রি ডেলিভারি</span>
              <div className="dl-gap-bar"><i style={{ width: `${gapPct}%` }} /></div>
            </div>
          ) : null}
          <div className={`dl-calc-net ${margin < 0 ? "down" : "up"}`}>
            <span>আপনার কুরিয়ার খরচ ৳{bn(zoneCost)}</span>
            <b>{margin < 0 ? "ভর্তুকি" : "ডেলিভারিতে লাভ"} ৳{bn(Math.abs(margin))}</b>
          </div>
        </aside>
      </div>

      <div className={`dl-bar${dirty ? " dirty" : ""}`}>
        <span className="dl-bar-msg">
          <i />
          {dirty ? <><b>{bn(dirty)}টি অসংরক্ষিত পরিবর্তন</b><small>সেভ করলে চেকআউট ও কার্টে সাথে সাথে বসবে</small></> : <><b>সব সেভ করা আছে</b><small>সেভ করলে চেকআউট ও কার্টে সাথে সাথে বসবে</small></>}
        </span>
        {dirty ? <button type="button" className="ap-btn ghost" disabled={saving} onClick={() => setDraft(ship)}>বাতিল</button> : null}
        <button type="button" className="ap-btn primary" disabled={saving} onClick={() => void save()}>{saving ? "সেভ হচ্ছে…" : "সেভ করুন"}</button>
      </div>
    </div>
  );
}

const QUICK = [500, 1000, 1500, 2000];

function campaignState(on: boolean, from: string, to: string): { k: "off" | "soon" | "live" | "over"; label: string } {
  if (!on) return { k: "off", label: "বন্ধ" };
  const now = Date.now();
  if (from && now < new Date(from).getTime()) return { k: "soon", label: "নির্ধারিত" };
  if (to && now > new Date(to).getTime()) return { k: "over", label: "সময় শেষ" };
  return { k: "live", label: "এখন চলছে" };
}

const DP = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const DlIco = {
  pin: <svg {...DP}><path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></svg>,
  cal: <svg {...DP}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="m9.5 14.5 1.8 1.8 3.5-3.5" /></svg>,
  card: <svg {...DP}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h3" /></svg>,
  calc: <svg {...DP}><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h.01" /></svg>,
};

/** tiny decorative "map": inside = one city ring, outside = routes fanning out */
function ZoneArt({ k }: { k: "in" | "out" }) {
  return (
    <svg className="dl-zone-art" viewBox="0 0 120 64" aria-hidden="true">
      {k === "in" ? (
        <>
          <circle cx="60" cy="32" r="28" className="r3" />
          <circle cx="60" cy="32" r="18" className="r2" />
          <circle cx="60" cy="32" r="8" className="r1" />
          <circle cx="60" cy="32" r="3.2" className="dot" />
        </>
      ) : (
        <>
          <path d="M22 32 C 45 6, 75 6, 100 14 M22 32 C 50 32, 70 40, 104 34 M22 32 C 45 58, 78 60, 98 54" className="route" />
          <circle cx="22" cy="32" r="5" className="dot" />
          <circle cx="100" cy="14" r="3.4" className="node" />
          <circle cx="104" cy="34" r="3.4" className="node" />
          <circle cx="98" cy="54" r="3.4" className="node" />
        </>
      )}
    </svg>
  );
}

function RuleCard({ on, icon, title, sub, onChange, wide, children }: {
  on: boolean; icon: ReactNode; title: string; sub: string; onChange: (v: boolean) => void; wide?: boolean; children?: ReactNode;
}) {
  return (
    <section className={`dl-rule${on ? " on" : ""}${wide ? " wide" : ""}`}>
      <div className="dl-rule-top">
        <span className="dl-rule-ico" aria-hidden="true">{icon}</span>
        <div className="dl-rule-txt"><b>{title}</b><small>{sub}</small></div>
        <Toggle checked={on} onChange={onChange} />
      </div>
      {children ? <div className="dl-rule-body">{children}</div> : null}
    </section>
  );
}
