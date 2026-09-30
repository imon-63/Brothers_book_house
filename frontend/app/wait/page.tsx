"use client";

import Link from "next/link";
import { bn } from "@/lib/format";
import { useAddToCart, useWait, useWishlist } from "@/lib/api/shop";
import { setAuth } from "@/store/slices/ui-slice";
import { useAppDispatch } from "@/store/hooks";

export default function WaitPage() {
  const dispatch = useAppDispatch();
  const { user, toggle } = useWait();
  const addToCart = useAddToCart();
  const listQ = useWishlist();

  if (!user) {
    return (
      <div className="wrap" style={{ paddingBottom: 48 }}>
        <p className="crumb">হোম / <b>ভবিষ্যৎ অর্ডার</b></p>
        <div className="empty">
          <p className="serif">লগইন করলে তালিকা দেখতে পারবেন।</p>
          <button className="btn btn-primary" type="button" style={{ marginTop: 12 }} onClick={() => dispatch(setAuth(true))}>লগইন</button>
        </div>
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

  return (
    <div className="wrap" style={{ paddingBottom: 48 }}>
      <p className="crumb">হোম / <b>ভবিষ্যৎ অর্ডার</b></p>
      <div className="wait-hero">
        <div>
          <h2>ভবিষ্যৎ অর্ডার</h2>
          <p>স্টক না থাকলে এখানে রাখুন। স্টকে ফিরলে কার্টে যোগ করতে পারবেন।</p>
        </div>
        <span className={`stock-pill ${readyN ? "in" : "out"}`} style={{ margin: 0 }}>
          {bn(items.length)}টি রাখা{readyN ? ` · ${bn(readyN)}টি স্টকে` : ""}
        </span>
      </div>
      {!items.length && listQ.isLoading ? <div className="empty"><p className="serif">লোড হচ্ছে…</p></div> : !items.length ? (
        <div className="empty">
          <p className="serif" style={{ fontSize: 22, color: "var(--burgundy)", marginBottom: 8 }}>তালিকা খালি</p>
          <p className="author">স্টক আউট পণ্যের কার্ডে «তালিকায়» চাপলে এখানে জমা হবে।</p>
          <Link className="btn btn-primary" href="/shop" style={{ marginTop: 14 }}>ক্যাটালগ দেখুন</Link>
        </div>
      ) : items.map((x) => (
        <div className={`wait-item${x.ready ? " back" : ""}`} key={`${x.kind}-${x.id}`}>
          {x.image ? (
            <Link className="cover has-pic" href={x.href}><img src={x.image} alt="" /></Link>
          ) : (
            <Link className="cover" href={x.href} style={{ background: x.color }}><div className="ct">{x.title}</div></Link>
          )}
          <div>
            <span className={`stock-pill ${x.ready ? "in" : "out"}`}>{x.ready ? "এখন স্টকে আছে" : "এখনো স্টক আউট"}</span>
            <h3><Link href={x.href}>{x.title}</Link></h3>
            <div className="author">{x.sub}</div>
            <div className="price" style={{ marginTop: 6 }}>
              ৳{bn(x.price)}
              {x.old > x.price ? <span className="old">৳{bn(x.old)}</span> : null}
            </div>
          </div>
          <div className="wait-acts">
            {x.ready ? (
              <button
                className="btn btn-primary btn-sm"
                type="button"
                onClick={() => { void addToCart(x.kind, x.id); }}
              >
                কার্টে যোগ
              </button>
            ) : (
              <button className="btn btn-gold btn-sm" type="button" disabled style={{ opacity: 0.7 }}>স্টকের অপেক্ষায়</button>
            )}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => void toggle(x.kind, x.id)}>সরান</button>
          </div>
        </div>
      ))}
    </div>
  );
}
