"use client";

import { useEffect, useState } from "react";
import { bn } from "@/lib/format";

function pad(n: number) {
  return bn(String(n).padStart(2, "0"));
}

function clockOf(until: string, now: number) {
  const ms = Date.parse(until) - now;
  if (!(ms > 0)) return null;
  const total = Math.floor(ms / 1000);
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

function Clock({ h, m, s }: { h: number; m: number; s: number }) {
  return (
    <span className="deal-clock" aria-label={`আর ${bn(h)} ঘণ্টা ${bn(m)} মিনিট ${bn(s)} সেকেন্ড`}>
      <em>{pad(h)}<small>ঘণ্টা</small></em>
      <s>:</s>
      <em>{pad(m)}<small>মিনিট</small></em>
      <s>:</s>
      <em>{pad(s)}<small>সেকেন্ড</small></em>
    </span>
  );
}

export function DealChip({ until, face = "card" }: { until: string; face?: "card" | "page" | "mini" }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const clock = clockOf(until, now);
  if (!clock) return null;
  if (face === "page") {
    return (
      <p className="deal-line" role="timer" aria-label={`ছাড় চলছে · আর ${bn(clock.h)} ঘণ্টা ${bn(clock.m)} মিনিট`}>
        <span className="deal-line-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" /></svg>
        </span>
        <b>ছাড় চলছে</b>
        <span className="deal-line-until">{new Date(until).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} পর্যন্ত</span>
        <span className="deal-line-clock" aria-hidden="true">
          <em>{pad(clock.h)}<small>ঘ</small></em><s>:</s><em>{pad(clock.m)}<small>মি</small></em><s>:</s><em>{pad(clock.s)}<small>সে</small></em>
        </span>
      </p>
    );
  }
  return (
    <span className={`deal-chip${face === "mini" ? " mini" : ""}`}>
      <Clock {...clock} />
    </span>
  );
}
