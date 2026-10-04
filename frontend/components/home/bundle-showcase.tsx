"use client";

import Link from "next/link";
import { PackCard } from "@/components/catalog/pack-card";
import { IconCart } from "@/components/icons";
import { Reveal } from "@/components/storefront/reveal";
import { GArrow, GGift } from "@/components/storefront/glyphs";
import { packHref, type Pack } from "@/lib/api/catalog";
import { useAddToCart, useWait } from "@/lib/api/shop";
import { bn, discount } from "@/lib/format";
import { BlockHead } from "./blocks";

/** Home: one featured bundle on a fanned-cover stage (pack page style) + the next few as cards. */
export function BundleShowcase({ packs, sectionCode, bare = false }: { packs: Pack[]; sectionCode: string; bare?: boolean }) {
  const addToCart = useAddToCart();
  const { saved, toggle } = useWait();
  const hero = packs.find((p) => !p.oos) ?? packs[0];
  if (!hero) return null;
  const others = packs.filter((p) => p.id !== hero.id).slice(0, 4);
  const books = hero.books;
  const fan = books.slice(0, 5);
  const off = discount(hero.price, hero.old);
  const single = hero.separatePrice || hero.old;
  const saving = hero.saving || (single > hero.price ? single - hero.price : 0);
  const unit = hero.vertical === "book" ? "বই" : "পণ্য";
  const kept = saved("pack", hero.id);

  return (
    <Reveal className={bare ? "sf-bundles" : "wrap sf-bundles"} aria-label={bare ? "ফিচার্ড প্যাকেজ" : undefined} aria-labelledby={bare ? undefined : "sf-bundles-h"}>
      {bare ? null : <BlockHead kicker="একসাথে কিনলে সাশ্রয়" title={sectionCode === "book" ? "বইয়ের প্যাকেজ" : "প্যাকেজ অফার"} href="/packs" more="সব প্যাকেজ" id="sf-bundles-h" />}
      <div className={`sf-bundles-grid${others.length ? "" : " solo"}`}>
        <article className="sf-bfeat">
          <Link className="sf-bfeat-stage" href={packHref(hero)} aria-label={`${hero.title} — প্যাকেজ দেখুন`}>
            {off ? <span className="sf-bfeat-off"><b>{bn(off)}%</b><small>ছাড়</small></span> : null}
            {hero.freeShipping ? <span className="pk-free">ফ্রি ডেলিভারি</span> : null}
            <div className={`pk-stack lg${hero.oos ? " pp-oos" : ""}`} style={{ ["--n" as string]: fan.length }}>
              {fan.map((b, i, arr) => (
                <span key={b.id} className="pk-cover" style={{ ["--i" as string]: i - (arr.length - 1) / 2, background: b.image ? undefined : b.color }}>
                  {b.image ? <img src={b.image} alt="" /> : <em>{b.title}</em>}
                </span>
              ))}
            </div>
            <span className="sf-bfeat-floor" aria-hidden="true" />
          </Link>
          <div className="sf-bfeat-info">
            <p className="sf-bkick"><i /><GGift size={14} /> ফিচার্ড প্যাকেজ</p>
            <h3><Link href={packHref(hero)}>{hero.title}</Link></h3>
            {hero.desc ? <p className="sf-bfeat-desc">{hero.desc}</p> : null}
            <ul className="sf-bfeat-list" aria-label="প্যাকেজে যা আছে">
              {books.slice(0, 4).map((b) => <li key={b.id}>{b.title}</li>)}
              {books.length > 4 ? <li className="more">আরও {bn(books.length - 4)}টি {unit}</li> : null}
            </ul>
            <div className="sf-bfeat-price">
              <b>৳{bn(hero.price)}</b>
              {single > hero.price ? <s>৳{bn(single)}</s> : null}
              {saving ? <span className="sf-save">৳{bn(saving)} সাশ্রয়</span> : null}
            </div>
            <div className="sf-bfeat-acts">
              {hero.oos ? (
                <button type="button" className={`btn ${kept ? "btn-primary" : "btn-gold"}`} onClick={() => toggle("pack", hero.id)}>{kept ? "তালিকায় আছে" : "ভবিষ্যৎ তালিকায় রাখুন"}</button>
              ) : (
                <button type="button" className="btn btn-primary sf-btn-cart" onClick={() => { void addToCart("pack", hero.id); }}><IconCart /> কার্টে যোগ</button>
              )}
              <Link className="btn btn-ghost sf-btn-ghost" href={packHref(hero)}>বিস্তারিত <GArrow size={16} /></Link>
            </div>
          </div>
        </article>
        {others.length ? (
          <div className="sf-bundles-more">
            {others.map((p) => <PackCard key={p.id} pack={p} />)}
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}
