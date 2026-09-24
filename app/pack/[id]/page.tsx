"use client";

import Link from "next/link";
import { use } from "react";
import { PackSpines } from "@/components/catalog/pack-card";
import { useWait } from "@/components/catalog/use-wait";
import { bn, discount, inStock } from "@/lib/format";
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
          <ul>
            {books.map((b) => <li key={b.id}><Link href={`/product/${b.id}`}>{b.title}</Link></li>)}
          </ul>
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
    </div>
  );
}
