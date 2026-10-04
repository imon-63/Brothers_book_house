"use client";

import Link from "next/link";
import { bn } from "@/lib/format";
import { useAddToCart, useWait, useWishlist } from "@/lib/api/shop";
import { IconCart } from "@/components/icons";
import { EmptyState } from "@/components/storefront/empty-state";
import { GBell, GCheck, GHeart, GX } from "@/components/storefront/glyphs";
import { PageHero } from "@/components/storefront/page-head";
import { SkeletonGrid } from "@/components/storefront/skeleton";
import { setAuth } from "@/store/slices/ui-slice";
import { useAppDispatch } from "@/store/hooks";

export default function WaitPage() {
  const dispatch = useAppDispatch();
  const { user, toggle } = useWait();
  const addToCart = useAddToCart();
  const listQ = useWishlist();
  const crumbs = [{ label: "হোম", href: "/" }, { label: "ভবিষ্যৎ অর্ডার" }];

  if (!user) {
    return (
      <div className="wrap sf-wait" style={{ paddingBottom: 48 }}>
        <PageHero tone="sage" crumbs={crumbs} kicker="সেভ করা তালিকা" icon={<GHeart size={16} />} title="ভবিষ্যৎ অর্ডার" sub="স্টক আউট পণ্য রেখে দিন — ফিরলেই কার্টে তুলুন।" />
        <EmptyState art="heart" title="লগইন করলে তালিকা দেখতে পারবেন" text="আপনার রাখা পণ্যগুলো সব ডিভাইসে একসাথে থাকবে।">
          <button className="btn btn-primary" type="button" onClick={() => dispatch(setAuth(true))}>লগইন</button>
        </EmptyState>
      </div>
    );
  }

  const items = (listQ.data ?? []).map((w) => ({
    kind: w.kind === "bundle" ? "pack" as const : "book" as const,
    id: w.refId,
    title: w.title,
    sub: w.kind === "bundle" ? "প্যাকেজ" : w.subtitle ?? "",
    price: w.price,
    old: 0,
    color: w.coverColor || (w.kind === "bundle" ? "#3D5A4C" : "#7A2430"),
    image: w.imageUrl ?? undefined,
    href: w.kind === "bundle" ? `/pack/${encodeURIComponent(w.slug)}` : `/product/${encodeURIComponent(w.slug)}`,
    ready: w.canOrder,
  }));

  const readyN = items.filter((x) => x.ready).length;
  const sorted = [...items].sort((a, b) => Number(b.ready) - Number(a.ready));

  return (
    <div className="wrap sf-wait" style={{ paddingBottom: 48 }}>
      <PageHero
        tone="sage"
        crumbs={crumbs}
        kicker="সেভ করা তালিকা"
        icon={<GHeart size={16} />}
        title="ভবিষ্যৎ অর্ডার"
        sub="স্টক না থাকলে এখানে রাখুন। স্টকে ফিরলে কার্টে যোগ করতে পারবেন।"
        aside={items.length ? (
          <>
            <span className="sf-stat-chip"><b>{bn(items.length)}</b><small>রাখা আছে</small></span>
            <span className="sf-stat-chip"><b>{bn(readyN)}</b><small>এখন স্টকে</small></span>
          </>
        ) : null}
      />
      {readyN ? <p className="sf-wait-note" role="status"><GBell size={18} /> সুখবর! {bn(readyN)}টি পণ্য আবার স্টকে এসেছে — এখনই কার্টে নিন।</p> : null}
      {!items.length && listQ.isLoading ? <SkeletonGrid n={4} className="sf-wait-grid" /> : !items.length ? (
        <EmptyState art="heart" title="তালিকা খালি" text="স্টক আউট পণ্যের কার্ডে «তালিকায়» চাপলে এখানে জমা হবে।">
          <Link className="btn btn-primary" href="/shop">ক্যাটালগ দেখুন</Link>
        </EmptyState>
      ) : (
        <div className="sf-wait-grid">
          {sorted.map((x) => (
            <article className={`sf-wcard${x.ready ? " back" : ""}`} key={`${x.kind}-${x.id}`}>
              <Link className="sf-wcard-pic" href={x.href} style={x.image ? undefined : { background: x.color }}>
                {x.image ? <img src={x.image} alt={x.title} /> : <b>{x.title}</b>}
                <span className={`sf-wcard-state ${x.ready ? "in" : "out"}`}>{x.ready ? <><GCheck size={14} /> আবার স্টকে</> : "এখনো স্টক আউট"}</span>
              </Link>
              <div className="sf-wcard-body">
                <h3><Link href={x.href}>{x.title}</Link></h3>
                <p>{x.sub || " "}</p>
                <div className="sf-wcard-price">৳{bn(x.price)}</div>
                <div className="sf-wcard-acts">
                  {x.ready ? (
                    <button className="btn btn-primary btn-sm sf-btn-cart" type="button" onClick={() => { void addToCart(x.kind, x.id); }}><IconCart /> কার্টে যোগ</button>
                  ) : (
                    <span className="sf-wcard-wait"><GBell size={15} /> স্টকের অপেক্ষায়</span>
                  )}
                  <button className="sf-wcard-x" type="button" aria-label={`${x.title} তালিকা থেকে সরান`} onClick={() => void toggle(x.kind, x.id)}><GX size={16} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
