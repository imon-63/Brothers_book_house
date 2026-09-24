"use client";

import Link from "next/link";
import { offerOf } from "@/lib/catalog/offer";
import { bn, inStock } from "@/lib/format";
import { addLine } from "@/store/slices/cart-slice";
import { setAuth, setMiniCart, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useWait } from "@/components/catalog/use-wait";

export default function WaitPage() {
  const dispatch = useAppDispatch();
  const { user, saved, toggle } = useWait();
  const products = useAppSelector((s) => s.shop.products);
  const packs = useAppSelector((s) => s.shop.packs);

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

  const items = (user.wait || []).map((x) => {
    if (x.kind === "pack") {
      const pack = packs.find((p) => p.id === x.id);
      if (!pack) return null;
      const books = pack.bookIds.map((id) => products.find((p) => p.id === id)).filter((p) => p != null);
      return {
        kind: "pack" as const,
        id: pack.id,
        title: pack.title,
        sub: "প্যাকেজ",
        price: pack.price,
        old: pack.old,
        color: "#3D5A4C",
        image: books.find((b) => b.image)?.image,
        href: `/pack/${pack.id}`,
        ready: books.length > 0 && books.every((b) => inStock(b.stock)),
      };
    }
    const product = products.find((p) => p.id === x.id);
    if (!product) return null;
    const offer = offerOf(product);
    return {
      kind: "book" as const,
      id: product.id,
      title: product.title,
      sub: product.unit || product.author,
      price: offer.price,
      old: offer.old,
      color: product.color,
      image: product.image,
      href: `/product/${product.id}`,
      ready: inStock(product.stock),
    };
  }).filter((x): x is NonNullable<typeof x> => x != null && saved(x.kind, x.id));

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
      {!items.length ? (
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
                onClick={() => {
                  dispatch(addLine({ kind: x.kind, id: x.id }));
                  dispatch(showToast("কার্টে যোগ হয়েছে"));
                  dispatch(setMiniCart(true));
                }}
              >
                কার্টে যোগ
              </button>
            ) : (
              <button className="btn btn-gold btn-sm" type="button" disabled style={{ opacity: 0.7 }}>স্টকের অপেক্ষায়</button>
            )}
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => toggle(x.kind, x.id)}>সরান</button>
          </div>
        </div>
      ))}
    </div>
  );
}
