"use client";

import Link from "next/link";
import { use } from "react";
import { PackSpines } from "@/components/catalog/pack-card";
import { useWait } from "@/components/catalog/use-wait";
import { bn, discount, inStock } from "@/lib/format";
import { offerOf } from "@/lib/catalog/offer";
import { addLine } from "@/store/slices/cart-slice";
import { setAuth, setMiniCart, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const pack = useAppSelector((s) => s.shop.packs.find((p) => p.id === Number(id)));
  const products = useAppSelector((s) => s.shop.products);
  const dispatch = useAppDispatch();
  const { user, saved, toggle } = useWait();
  if (!pack) return <div className="wrap"><p className="crumb">প্যাকেজ পাওয়া যায়নি</p></div>;
  const books = pack.bookIds.map((bid) => products.find((p) => p.id === bid)).filter((p) => p != null);
  const off = discount(pack.price, pack.old);
  const oos = books.some((b) => !inStock(b.stock));
  const kept = saved("pack", pack.id);
  const single = books.reduce((sum, b) => sum + offerOf(b).price, 0);
  const saving = Math.max(0, single - pack.price);

  return (
    <div className="wrap" style={{ paddingBottom: 48 }}>
      <p className="crumb">হোম / <Link href="/packs">প্যাকেজ</Link> / <b>{pack.title}</b></p>
      <div className="product">
        <div className="pkg-stack">
          <PackSpines books={books} />
        </div>
        <div>
          <h1 className="serif">{pack.title}</h1>
          <p className="author">{bn(books.length)}টি বই</p>
          <div className="price" style={{ fontSize: 28 }}>
            ৳{bn(pack.price)}
            {pack.old > pack.price ? <span className="old">৳{bn(pack.old)}</span> : null}
            {off ? <span className="sale-badge" style={{ position: "static", marginLeft: 8 }}>-{bn(off)}%</span> : null}
          </div>
          <p className="lead">{pack.desc}</p>
          <a className="pk-jump" href="#pack-books">
            <span>{bn(books.length)}টি বই দেখুন</span>
            {saving ? <b>আলাদা কেনার চেয়ে ৳{bn(saving)} কম</b> : null}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
          </a>
          {oos ? (
            <>
              <div className="oos-banner">
                <div>
                  <b>প্যাকেজের কোনো বই স্টক আউট</b>
                  <p>{user ? "এখন কার্টে যোগ করা যাবে না। তালিকায় রাখুন, স্টকে এলে কিনতে পারবেন।" : "লগইন করলে ভবিষ্যৎ অর্ডার তালিকায় রাখতে পারবেন।"}</p>
                </div>
              </div>
              <div className="buy-row">
                <button className={`btn ${kept ? "btn-primary" : "btn-gold"}`} type="button" onClick={() => toggle("pack", pack.id)}>{kept ? "তালিকায় আছে · সরান" : "ভবিষ্যৎ তালিকায় রাখুন"}</button>
                {user ? <Link className="btn btn-ghost" href="/wait">তালিকা দেখুন</Link> : <button className="btn btn-ghost" type="button" onClick={() => dispatch(setAuth(true))}>লগইন</button>}
              </div>
            </>
          ) : (
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                dispatch(addLine({ kind: "pack", id: pack.id }));
                dispatch(showToast("কার্টে যোগ হয়েছে"));
                dispatch(setMiniCart(true));
              }}
            >
              কার্টে যোগ
            </button>
          )}
        </div>
      </div>

      <section className="pb-sec" id="pack-books">
        <header className="pb-head">
          <div>
            <p className="pb-kick">প্যাকেজের ভেতরে</p>
            <h2>এই প্যাকেজে যা আছে</h2>
          </div>
          <span className="pb-count">{bn(books.length)}টি বই</span>
        </header>
        <ol className="pb-list">
          {books.map((b, i) => {
            const offer = offerOf(b);
            const ok = inStock(b.stock);
            return (
              <li key={b.id} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="pb-no">{bn(i + 1)}</span>
                <Link className="pb-cover" href={`/product/${b.id}`} style={{ background: b.image ? undefined : b.color }}>
                  {b.image ? <img src={b.image} alt="" /> : <em>{b.title}</em>}
                </Link>
                <div className="pb-info">
                  <Link href={`/product/${b.id}`}><b>{b.title}</b></Link>
                  <small>{b.author}{b.cat ? ` · ${b.cat}` : ""}{b.sub ? ` · ${b.sub}` : ""}</small>
                  <span className={`pb-stock ${ok ? "in" : "out"}`}>{ok ? "স্টকে আছে" : "স্টক আউট"}</span>
                </div>
                <div className="pb-price">
                  <small>আলাদা দাম</small>
                  <b>৳{bn(offer.price)}</b>
                  {offer.old > offer.price ? <s>৳{bn(offer.old)}</s> : null}
                </div>
                <Link className="pb-go" href={`/product/${b.id}`} aria-label={`${b.title} দেখুন`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 6l6 6-6 6" /></svg>
                </Link>
              </li>
            );
          })}
        </ol>
        <div className="pb-sum">
          <p><span>বইগুলো আলাদা কিনলে</span><s>৳{bn(single)}</s></p>
          <p className="pb-total"><span>প্যাকেজে একসাথে</span><b>৳{bn(pack.price)}</b></p>
          {saving ? <p className="pb-save"><span>আপনি বাঁচাবেন</span><b>৳{bn(saving)}</b></p> : null}
        </div>
      </section>
    </div>
  );
}
