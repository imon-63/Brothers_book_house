"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { bn } from "@/lib/format";
import { answerSoon, currentSoon, subscribeSoon } from "@/lib/soon-confirm";

function whenBn(iso: string) {
  return new Date(iso).toLocaleString("bn-BD", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
}

function leftBn(iso: string, now: number) {
  const s = Math.max(0, Math.floor((Date.parse(iso) - now) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return d ? `${bn(d)} দিন ${bn(h)} ঘণ্টা ${bn(m)} মিনিট` : h ? `${bn(h)} ঘণ্টা ${bn(m)} মিনিট ${bn(sec)} সেকেন্ড` : `${bn(m)} মিনিট ${bn(sec)} সেকেন্ড`;
}

const ClockIco = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.6M9.5 3h5" /></svg>
);

/** The one "deal starts soon — buy now at the regular price?" dialog (mounted once in SiteFrame). */
export function SoonConfirm() {
  const info = useSyncExternalStore(subscribeSoon, currentSoon, () => null);
  const [now, setNow] = useState(() => Date.now());
  const buyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!info) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") answerSoon(false); };
    window.addEventListener("keydown", key);
    buyRef.current?.focus();
    return () => { window.clearInterval(t); window.removeEventListener("keydown", key); };
  }, [info]);

  /* the deal went live while the dialog was open → no need to ask any more */
  useEffect(() => {
    if (info && Date.parse(info.startsAt) <= now) answerSoon(true);
  }, [info, now]);

  if (!info) return null;
  const save = Math.max(0, info.regularPrice - info.dealPrice);
  const pct = info.regularPrice > 0 ? Math.round((save / info.regularPrice) * 100) : 0;

  return (
    <div className="sf-soon-wrap" onClick={(e) => { if (e.target === e.currentTarget) answerSoon(false); }}>
      <div className="sf-soon" role="alertdialog" aria-modal="true" aria-labelledby="sf-soon-h" aria-describedby="sf-soon-d">
        <span className="sf-soon-ico">{ClockIco}</span>
        <h3 id="sf-soon-h">এই পণ্যে ছাড় শীঘ্রই শুরু হচ্ছে</h3>
        <p className="sf-soon-title">{info.title}</p>

        <div className="sf-soon-cmp" id="sf-soon-d">
          <div className="now">
            <small>এখন কিনলে</small>
            <b>৳{bn(info.regularPrice)}</b>
            <span>আগের (পুরো) দাম</span>
          </div>
          <i aria-hidden="true">→</i>
          <div className="later">
            <small>{whenBn(info.startsAt)} থেকে</small>
            <b>৳{bn(info.dealPrice)}</b>
            <span>{bn(pct)}% ছাড় · ৳{bn(save)} সাশ্রয়</span>
          </div>
        </div>

        <p className="sf-soon-left">{ClockIco}ছাড় শুরু হতে বাকি <b>{leftBn(info.startsAt, now)}</b></p>
        <p className="sf-soon-note">এখন কার্টে দিলে আগের দাম <b>৳{bn(info.regularPrice)}</b> দিতে হবে — ছাড়ের দাম পরে প্রযোজ্য হবে না।</p>

        <div className="sf-soon-acts">
          <button type="button" className="btn btn-ghost" onClick={() => answerSoon(false)}>অপেক্ষা করব</button>
          <button ref={buyRef} type="button" className="btn btn-primary" onClick={() => answerSoon(true)}>এখনই ৳{bn(info.regularPrice)}-এ কিনুন</button>
        </div>
      </div>
    </div>
  );
}

/** Product page: "ছাড় আসছে" — one line under the price, same shape as the live-deal line. */
export function SoonNote({ soon, price }: { soon: { price: number; from: string; until: string }; price: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (now != null && Date.parse(soon.from) <= now) return null;
  const pct = price > 0 ? Math.round(((price - soon.price) / price) * 100) : 0;
  return (
    <p className="deal-line soon" title={`এখন কিনলে ৳${bn(price)} · শুরু হতে বাকি ${now == null ? "" : leftBn(soon.from, now)}`}>
      <span className="deal-line-ico" aria-hidden="true">{ClockIco}</span>
      <b>ছাড় আসছে</b>
      <span className="deal-line-until">{whenBn(soon.from)} থেকে <strong>৳{bn(soon.price)}</strong>{pct > 0 ? ` · ${bn(pct)}% কম` : ""}</span>
      <span className="deal-line-left">{now == null ? "…" : leftBn(soon.from, now).split(" ").slice(0, 4).join(" ")} বাকি</span>
    </p>
  );
}
