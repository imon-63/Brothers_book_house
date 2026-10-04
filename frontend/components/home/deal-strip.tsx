"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { Rail } from "@/components/catalog/rail";
import { Reveal } from "@/components/storefront/reveal";
import { GArrow, GBolt } from "@/components/storefront/glyphs";
import { offerOf, type Product } from "@/lib/api/catalog";
import { bn, discount } from "@/lib/format";

function pad(n: number) {
  return bn(String(n).padStart(2, "0"));
}

/** Big live clock to the soonest-ending deal. Renders nothing once it runs out. */
function BigClock({ until }: { until: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const end = Date.parse(until);
  const ms = now == null ? 0 : end - now;
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const cells = [...(d ? [{ v: d, l: "দিন" }] : []), { v: h, l: "ঘণ্টা" }, { v: m, l: "মিনিট" }, { v: s, l: "সেকেন্ড" }];
  return (
    <div className="sf-clock" role="timer" aria-label={`ছাড় শেষ হতে ${d ? `${bn(d)} দিন ` : ""}${bn(h)} ঘণ্টা ${bn(m)} মিনিট বাকি`}>
      {cells.map((c, i) => (
        <span key={c.l} className="sf-clock-cell">
          <b aria-hidden="true">{now == null ? "--" : pad(c.v)}</b>
          <small aria-hidden="true">{c.l}</small>
          {i < cells.length - 1 ? <i aria-hidden="true">:</i> : null}
        </span>
      ))}
    </div>
  );
}

/**
 * "আজকের ছাড়" — live deals (deal.endsAt) first, then marked-down items.
 * Countdown only shows when at least one product has a running deal clock.
 */
export function DealStrip({ deals, discounted, upcoming = [], title }: { deals: Product[]; discounted: Product[]; upcoming?: Product[]; title?: string }) {
  const live = deals.filter((p) => offerOf(p).on);
  const seen = new Set(live.map((p) => p.id));
  const rest = discounted.filter((p) => !seen.has(p.id) && !p.oos && discount(p.price, p.old) > 0);
  const now = [...live, ...rest].slice(0, 12);
  now.forEach((p) => seen.add(p.id));
  const soon = upcoming.filter((p) => p.soon && Date.parse(p.soon.from) > Date.now() && !seen.has(p.id));
  const list = [...now, ...soon].slice(0, 12);
  if (!list.length) return null;
  /* nothing running yet → the strip becomes a "coming soon" teaser counting down to the first start */
  const teaser = !now.length;
  const ends = live.map((p) => p.until).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const starts = soon.map((p) => p.soon!.from).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const clockTo = teaser ? starts : ends;
  const pct = (p: Product) => (p.soon && !offerOf(p).on ? discount(p.soon.price, p.price) : discount(p.price, p.old));
  const best = Math.max(...list.map(pct));
  const firstDay = starts ? new Date(starts).toLocaleString("bn-BD", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) : "";

  return (
    <Reveal className={`wrap sf-deal${teaser ? " is-soon" : ""}`} aria-labelledby="sf-deal-h">
      <div className="sf-deal-in">
        <div className="sf-deal-side">
          <span className="sf-deal-flash" aria-hidden="true"><GBolt size={22} /></span>
          <p className="sf-bkick light"><i />{teaser ? "শীঘ্রই আসছে" : "সীমিত সময়"}</p>
          <h2 id="sf-deal-h">{title || "আজকের ছাড়"}</h2>
          <p className="sf-deal-lead">
            {teaser
              ? <>{firstDay} থেকে {best > 0 ? <>সর্বোচ্চ <b>{bn(best)}%</b> ছাড়</> : "বিশেষ দাম"}</>
              : best > 0 ? <>সর্বোচ্চ <b>{bn(best)}%</b> পর্যন্ত কম দামে</> : "বাছাই করা পণ্যে বিশেষ দাম"}
          </p>
          {clockTo ? (
            <>
              <small className="sf-deal-note">{teaser ? "ছাড় শুরু হতে বাকি" : "ছাড় শেষ হতে বাকি"}</small>
              <BigClock until={clockTo} />
            </>
          ) : (
            <small className="sf-deal-note">স্টক থাকা পর্যন্ত এই দাম</small>
          )}
          {teaser ? null : <Link className="sf-deal-cta" href={live.length ? "/shop?deal=1" : "/shop"}>সব ছাড় দেখুন <GArrow size={16} /></Link>}
        </div>
        <div className="sf-deal-rail">
          <Rail>
            {list.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </Rail>
        </div>
      </div>
    </Reveal>
  );
}
