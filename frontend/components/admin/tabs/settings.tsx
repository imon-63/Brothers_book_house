"use client";

import { useAdminNav } from "@/components/admin/nav";
import { VisibilityPanel } from "@/components/admin/tabs/visibility";
import { useEffect, useMemo, useState } from "react";
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

type SetMenu = "cats" | "ship" | "coupons" | "promo" | "ticker" | "staff";

const SET_MENUS: { id: SetMenu; label: string }[] = [
  { id: "cats", label: "ক্যাটাগরি" },
  { id: "ship", label: "ডেলিভারি" },
  { id: "coupons", label: "কুপন" },
  { id: "promo", label: "অফার মডাল" },
  { id: "ticker", label: "টপবার" },
  { id: "staff", label: "স্টাফ" },
];

export function SettingsTab() {
  const { focus, clearFocus } = useAdminNav();
  const [menu, setMenu] = useState<SetMenu>(() => (SET_MENUS.some((m) => m.id === focus) ? (focus as SetMenu) : "cats"));
  useEffect(() => {
    if (focus && SET_MENUS.some((m) => m.id === focus)) { setMenu(focus as SetMenu); clearFocus(); }
  }, [focus, clearFocus]);

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
      {menu === "cats" ? <VisibilityPanel /> : null}
      {menu === "ship" ? <div className="set-panel"><ShipTab /></div> : null}
      {menu === "coupons" ? <div className="set-panel"><CouponsTab /></div> : null}
      {menu === "promo" ? <div className="set-panel"><PromoTab /></div> : null}
      {menu === "ticker" ? <div className="set-panel"><TickerTab /></div> : null}
      {menu === "staff" ? <div className="set-panel"><StaffPanel /></div> : null}
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
              <button type="button" className="pk-del" aria-label="সরান" title="সরান" onClick={() => deleteM.mutate({ id: t.id })}>
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
                    <input type="checkbox" checked={c.isActive} onChange={() => toggleM.mutate({ id: c.id, code: c.code, on: !c.isActive })} />
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
  const live = draft.freeAllOn;
  const [saving, setSaving] = useState(false);

  async function save() {
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
          <p className="hint-txt">লাভ-ক্ষতির হিসাবে SSLCOMMERZ অর্ডারে এই হারে ফি ধরা হয় (সেটিং: gateway_fee_pct)।</p>
        </div>
      </section>
      <div className="save-row">
        <span className="hint-txt">সেভ করলে চেকআউট ও কার্টে সাথে সাথে বসবে</span>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "সেভ হচ্ছে…" : "সেভ করুন"}</button>
      </div>
    </div>
  );
}
