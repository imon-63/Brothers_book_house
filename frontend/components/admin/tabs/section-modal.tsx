"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { adminErrorText } from "@/lib/api/admin/core";
import { useCreateSection, useUpdateSection, type AdminSection } from "@/lib/api/admin/sections";
import { SectionIcon } from "@/components/admin/shared";
import { Ico, Modal, Toggle } from "@/components/admin/ui";

/*
 * নতুন বিভাগ / বিভাগ এডিট — one modal for both. Code is permanent (URL key),
 * suggested from the English name until the admin edits it by hand.
 */

const EMOJI = ["📚", "🛒", "🎧", "✏️", "🧸", "👕", "💄", "🏠", "🍯", "🌿", "⚽", "🎁", "💊", "🐟", "🖥️", "🚲"];
const SWATCH = ["#7A2430", "#5C1B24", "#3D5A4C", "#8A6230", "#1a3a6b", "#2F5D8A", "#146C3A", "#B86A2A", "#4A2744", "#245A6B"];

type Form = {
  nameBn: string; nameEn: string; code: string; searchHint: string;
  heroKicker: string; heroTitle: string; heroSub: string; heroLead: string;
  icon: string; color: string; isVisible: boolean;
};

const EMPTY: Form = { nameBn: "", nameEn: "", code: "", searchHint: "", heroKicker: "", heroTitle: "", heroSub: "", heroLead: "", icon: "✏️", color: SWATCH[5], isVisible: false };

export function slugCode(en: string) {
  const s = en.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "");
  return s.slice(0, 30).replace(/-+$/, "");
}
const CODE_RE = /^[a-z][a-z0-9-]{1,29}$/;

function fromSection(s: AdminSection): Form {
  return {
    nameBn: s.name, nameEn: s.nameEn ?? "", code: s.code, searchHint: s.searchHint ?? "",
    heroKicker: s.hero.kicker ?? "", heroTitle: s.hero.title ?? "", heroSub: s.hero.sub ?? "", heroLead: s.hero.lead ?? "",
    icon: typeof s.content?.icon === "string" ? s.content.icon : "", color: typeof s.content?.color === "string" ? s.content.color : SWATCH[0],
    isVisible: s.isVisible,
  };
}

export function SectionModal({ open, section, onClose, onSaved }: {
  open: boolean;
  /** null = create */
  section: AdminSection | null;
  onClose: () => void;
  onSaved?: (s: AdminSection) => void;
}) {
  const createM = useCreateSection();
  const updateM = useUpdateSection();
  const editing = !!section;
  const [f, setF] = useState<Form>(EMPTY);
  const [codeTouched, setCodeTouched] = useState(false);
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setF(section ? fromSection(section) : EMPTY);
    setCodeTouched(!!section);
    setMore(false);
    setErrors([]);
    setTried(false);
  }, [open, section]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((cur) => {
      const next = { ...cur, [k]: v };
      if (k === "nameEn" && !codeTouched && !editing) next.code = slugCode(String(v));
      return next;
    });
    setErrors([]);
  };

  const local = useMemo(() => {
    const out: Partial<Record<keyof Form, string>> = {};
    if (!f.nameBn.trim()) out.nameBn = "বাংলা নাম দিন";
    if (!f.nameEn.trim()) out.nameEn = "ইংরেজি নাম দিন";
    if (!editing && !CODE_RE.test(f.code)) out.code = "ইংরেজি ছোট হাতের অক্ষর দিয়ে শুরু · a-z, 0-9, - · ২–৩০ অক্ষর";
    if (f.color && !/^#[0-9a-fA-F]{6}$/.test(f.color)) out.color = "রঙ #RRGGBB আকারে দিন";
    return out;
  }, [f, editing]);
  const valid = Object.keys(local).length === 0;
  const busy = createM.isPending || updateM.isPending;

  function submit() {
    setTried(true);
    if (!valid) return;
    const content = { icon: f.icon.trim() || undefined, color: f.color || undefined };
    const opt = (v: string) => (v.trim() ? v.trim() : undefined);
    const onError = (e: unknown) => {
      if (e instanceof ApiError && e.errors?.length) setErrors(e.errors);
      else setErrors([adminErrorText(e)]);
    };
    if (section) {
      updateM.mutate({
        id: section.id,
        toast: "বিভাগ আপডেট হয়েছে",
        body: {
          nameBn: f.nameBn.trim(), nameEn: f.nameEn.trim(), searchHint: f.searchHint.trim(),
          heroKicker: f.heroKicker.trim(), heroTitle: f.heroTitle.trim(), heroSub: f.heroSub.trim(), heroLead: f.heroLead.trim(),
          content,
        },
      }, { onSuccess: (s) => { onSaved?.(s); onClose(); }, onError });
    } else {
      createM.mutate({
        code: f.code, nameBn: f.nameBn.trim(), nameEn: f.nameEn.trim(), searchHint: opt(f.searchHint),
        heroKicker: opt(f.heroKicker), heroTitle: opt(f.heroTitle), heroSub: opt(f.heroSub), heroLead: opt(f.heroLead),
        content, isVisible: f.isVisible,
      }, { onSuccess: (s) => { onSaved?.(s); onClose(); }, onError });
    }
  }

  const err = (k: keyof Form) => (tried && local[k] ? <small className="sx-err">{local[k]}</small> : null);
  const previewCode = f.code || "code";

  return (
    <Modal open={open} onClose={onClose} width={760}
      title={editing ? `বিভাগ এডিট · ${section?.name}` : "নতুন বিভাগ"}
      sub={editing ? "Edit section · নাম, আইকন, রঙ ও হিরো লেখা" : "New section · শুরুতে লুকানো রেখে ক্যাটাগরি ও পণ্য সাজিয়ে পরে চালু করুন"}
      footer={(
        <>
          <button type="button" className="ap-btn ghost" onClick={onClose}>বাতিল</button>
          <button type="button" className="ap-btn primary" disabled={busy || (tried && !valid)} onClick={submit}>
            {Ico.check}{busy ? "সেভ হচ্ছে…" : editing ? "সেভ করুন" : "বিভাগ তৈরি করুন"}
          </button>
        </>
      )}>
      <div className="sx">
        <div className="sx-form">
          <div className="sx-row2">
            <div className="sx-field">
              <label htmlFor="sx-bn">বাংলা নাম <i className="sx-req">*</i></label>
              <input id="sx-bn" value={f.nameBn} maxLength={60} placeholder="যেমন: স্টেশনারি" onChange={(e) => set("nameBn", e.target.value)} autoFocus />
              {err("nameBn")}
            </div>
            <div className="sx-field">
              <label htmlFor="sx-en">English name <i className="sx-req">*</i></label>
              <input id="sx-en" value={f.nameEn} maxLength={60} placeholder="e.g. Stationery" onChange={(e) => set("nameEn", e.target.value)} />
              {err("nameEn")}
            </div>
          </div>

          <div className="sx-field">
            <label htmlFor="sx-code">কোড · URL key {editing ? <small>(বদলানো যায় না)</small> : <small>ইংরেজি নাম থেকে নিজে বসে</small>}</label>
            <div className="sx-code">
              <span>/shop?section=</span>
              <input id="sx-code" value={f.code} readOnly={editing} maxLength={30} placeholder="stationery"
                onChange={(e) => { setCodeTouched(true); set("code", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} />
              {!editing && codeTouched ? <button type="button" className="ap-btn sm ghost" onClick={() => { setCodeTouched(false); set("code", slugCode(f.nameEn)); }}>আবার বসান</button> : null}
            </div>
            {err("code")}
          </div>

          <div className="sx-field">
            <label htmlFor="sx-hint">সার্চ বক্সের লেখা</label>
            <input id="sx-hint" value={f.searchHint} maxLength={120} placeholder={`যেমন: কোন ${f.nameBn || "পণ্য"} খুঁজছেন?`} onChange={(e) => set("searchHint", e.target.value)} />
          </div>

          <div className="sx-field">
            <label>আইকন · Icon</label>
            <div className="sx-emoji" role="radiogroup" aria-label="আইকন">
              {EMOJI.map((e) => (
                <button key={e} type="button" role="radio" aria-checked={f.icon === e} className={f.icon === e ? "on" : ""} onClick={() => set("icon", e)}>{e}</button>
              ))}
              <input className="sx-emoji-in" value={f.icon} maxLength={4} aria-label="নিজের ইমোজি" placeholder="✦" onChange={(e) => set("icon", e.target.value)} />
            </div>
          </div>

          <div className="sx-field">
            <label>রঙ · Color</label>
            <div className="sx-swatch" role="radiogroup" aria-label="রঙ">
              {SWATCH.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={f.color === c} aria-label={c} className={f.color.toLowerCase() === c.toLowerCase() ? "on" : ""} style={{ background: c }} onClick={() => set("color", c)} />
              ))}
              <label className="sx-custom" title="নিজের রঙ">
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(f.color) ? f.color : "#7A2430"} onChange={(e) => set("color", e.target.value)} />
              </label>
              <input className="sx-hex" value={f.color} maxLength={7} onChange={(e) => set("color", e.target.value)} />
            </div>
            {err("color")}
          </div>

          <button type="button" className="sx-more" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? Ico.chevD : Ico.chevR}আরও · হিরো ব্যানারের লেখা <small>(ঐচ্ছিক)</small>
          </button>
          {more ? (
            <div className="sx-hero">
              <div className="sx-row2">
                <div className="sx-field"><label>কিকার</label><input value={f.heroKicker} maxLength={120} placeholder={`চলো · ${f.nameBn || "বিভাগ"}`} onChange={(e) => set("heroKicker", e.target.value)} /></div>
                <div className="sx-field"><label>শিরোনাম</label><input value={f.heroTitle} maxLength={160} placeholder={f.nameBn || "শিরোনাম"} onChange={(e) => set("heroTitle", e.target.value)} /></div>
              </div>
              <div className="sx-field"><label>সাব-টাইটেল</label><input value={f.heroSub} maxLength={200} onChange={(e) => set("heroSub", e.target.value)} /></div>
              <div className="sx-field"><label>লিড</label><textarea rows={2} value={f.heroLead} maxLength={500} onChange={(e) => set("heroLead", e.target.value)} /></div>
            </div>
          ) : null}

          {!editing ? (
            <div className="sx-vis">
              <Toggle checked={f.isVisible} onChange={(v) => set("isVisible", v)} label="এখনই দোকানে দেখান" sub={f.isVisible ? "তৈরি হলেই ক্রেতারা দেখবে" : "লুকানো থাকবে — ক্যাটাগরি ও পণ্য যোগ করে পরে চালু করুন"} />
            </div>
          ) : null}

          {errors.length ? (
            <div className="sx-api" role="alert">
              {Ico.alert}
              <ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          ) : null}
        </div>

        <aside className="sx-preview">
          <p className="pk-live"><i /> লাইভ প্রিভিউ</p>
          <div className="sx-chip-row">
            <span className="sx-chip on" style={{ ["--c" as string]: f.color || "#7A2430" }}>
              <SectionIcon code={editing ? section!.code : "__new"} section={{ content: { icon: f.icon } }} />
              {f.nameBn || "বিভাগ"}
            </span>
            <span className="sx-chip">বই</span>
          </div>
          <div className="sx-card" style={{ ["--c" as string]: f.color || "#7A2430" }}>
            <div className="sx-card-art"><span>{f.icon || "✦"}</span></div>
            <div className="sx-card-body">
              <small>{f.heroKicker || `চলো · ${f.nameBn || "বিভাগ"}`}</small>
              <h4>{f.heroTitle || f.nameBn || "বিভাগের নাম"}</h4>
              <p>{f.heroSub || f.nameEn || "English name"}</p>
              <div className="sx-search">{Ico.search}<span>{f.searchHint || `কোন ${f.nameBn || "পণ্য"} খুঁজছেন?`}</span></div>
            </div>
          </div>
          <p className="sx-url"><code>/shop?section={previewCode}</code></p>
          {!editing ? <p className="sx-note">{f.isVisible ? "তৈরি হলেই দোকানের মেনুতে দেখাবে।" : "শুরুতে লুকানো · সাইডবারে লাল বিন্দু দেখাবে।"}</p> : null}
        </aside>
      </div>
    </Modal>
  );
}
