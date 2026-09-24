"use client";

import Link from "next/link";
import { describeLine } from "@/lib/cart/describe";
import { cartFreeShip, quoteCheckout, shipNote } from "@/lib/demo/pricing";
import { bn } from "@/lib/format";
import { PackSpines } from "@/components/catalog/pack-card";
import { IconCart } from "@/components/icons";
import { setQty } from "@/store/slices/cart-slice";
import { showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function CartPage() {
  const lines = useAppSelector((s) => s.cart.lines);
  const coupon = useAppSelector((s) => s.orders.coupon);
  const products = useAppSelector((s) => s.shop.products);
  const packs = useAppSelector((s) => s.shop.packs);
  const coupons = useAppSelector((s) => s.shop.coupons);
  const ship = useAppSelector((s) => s.shop.ship);
  const dispatch = useAppDispatch();
  const rows = lines.map((line) => ({ ...line, ...describeLine(line, products, packs) }));
  const copies = rows.reduce((s, r) => s + r.n, 0);
  const sub = rows.reduce((s, r) => s + r.price * r.n, 0);
  const gifted = cartFreeShip(lines, products, packs, ship);
  const quote = quoteCheckout(sub, coupon, "", coupons, ship, gifted);
  const net = Math.max(0, quote.sub - quote.off);
  const meter = quote.freeAboveOn && !quote.campaign && !gifted;
  const left = meter ? Math.max(0, quote.freeAbove - net) : 0;
  const pct = meter ? Math.min(100, Math.round((net / quote.freeAbove) * 100)) : 0;
  const nudge = quote.campaign ? "camp" : gifted ? "gift" : meter ? "meter" : "";

  function remove(kind: "book" | "pack", id: number) {
    dispatch(setQty({ kind, id, n: 0 }));
    dispatch(showToast("কার্ট থেকে সরানো হয়েছে"));
  }

  return (
    <div className="wrap">
      <p className="crumb">হোম / <b>কার্ট</b></p>
      <h2 style={{ margin: "8px 0 6px" }}>আপনার কার্ট</h2>
      {!rows.length ? (
        <div className="empty cart-empty">
          <img className="empty-art" src="/icons/empty-cart.png" alt="কার্ট খালি" width={260} height={260} />
          <p className="serif">কার্ট এখন খালি</p>
          <p className="author">পছন্দের পণ্য যোগ করুন — বই, ঘরের বাজার ও গ্যাজেট এক কার্টে।</p>
          <Link className="btn btn-primary" href="/shop" style={{ marginTop: 16 }}>ক্যাটালগ দেখুন</Link>
        </div>
      ) : (
        <>
          {nudge ? (
            <div className={`bag-ship${nudge === "meter" && left > 0 ? "" : " free"}${nudge === "camp" ? " camp" : ""}`}>
              <span className="ship-mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" /><circle cx="7.2" cy="17.2" r="1.6" /><circle cx="17.8" cy="17.2" r="1.6" /></svg>
              </span>
              <div className="ship-copy">
                <b>{nudge === "camp" ? "সবার জন্য ডেলিভারি ফ্রি" : nudge === "gift" || left === 0 ? "ডেলিভারি ফ্রি" : `আর ৳${bn(left)} হলে ডেলিভারি ফ্রি`}</b>
                {nudge === "meter" ? (
                  <div className="bag-meter" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
                ) : (
                  <small>{nudge === "camp" ? "ক্যাম্পেইন চলছে" : "এই কার্টে কুরিয়ার ৳০"}</small>
                )}
              </div>
            </div>
          ) : null}
          <div className="bag-layout">
            <div className="bag-list">
              <div className="cart-panel-head" style={{ borderRadius: 16, border: "1px solid var(--line)" }}>
                <b>আইটেম ({bn(rows.length)})</b>
                <span className="author">{bn(copies)} কপি</span>
              </div>
              {rows.map((r, i) => (
                <article className="bag-row" key={`${r.kind}-${r.id}`} style={{ animationDelay: `${i * 50}ms` }}>
                  {r.kind === "pack" ? (
                    <Link className="cart-pack" href={r.href}>
                      <PackSpines books={r.books} />
                    </Link>
                  ) : r.image ? (
                    <Link className="cart-cover has-pic" href={r.href}><img src={r.image} alt="" /></Link>
                  ) : (
                    <Link className="cart-cover" href={r.href} style={{ background: r.color }}>
                      <div className="ct">{r.title}</div>
                      <div className="ca">{r.sub}</div>
                    </Link>
                  )}
                  <div className="bag-info">
                    <h3><Link href={r.href}>{r.title}</Link></h3>
                    <div className="author">
                      {r.vertical !== "book" ? <span className="vtag">{r.vertName}</span> : null}
                      {r.sub}{r.cat ? ` · ${r.cat}` : ""}
                    </div>
                    <div className="bag-unit">
                      <b>৳{bn(r.price)}</b>
                      {r.old > r.price ? <span className="old">৳{bn(r.old)}</span> : null}
                    </div>
                  </div>
                  <div className="bag-ops">
                    <div className="qty">
                      <button type="button" aria-label="কমান" onClick={() => dispatch(setQty({ kind: r.kind, id: r.id, n: r.n - 1 }))}>−</button>
                      <span>{bn(r.n)}</span>
                      <button type="button" aria-label="বাড়ান" onClick={() => dispatch(setQty({ kind: r.kind, id: r.id, n: r.n + 1 }))}>+</button>
                    </div>
                    <div className="bag-line">৳{bn(r.price * r.n)}</div>
                    <button type="button" className="bag-del" onClick={() => remove(r.kind, r.id)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 7V5h4v2M6 7l1.1 13h9.8L18 7M10 11v6M14 11v6" /></svg>
                      সরান
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <aside className="bag-sum">
              <h3 className="serif">সারসংক্ষেপ</h3>
              <div className="row"><span>সাবটোটাল</span><span>৳{bn(quote.sub)}</span></div>
              <div className="row"><span>কুপন ছাড়</span><span>{quote.off ? `−৳${bn(quote.off)}` : "—"}</span></div>
              <div className="bag-grand"><span>মোট</span><b>৳{bn(quote.grand)}</b></div>
              <Link className="btn btn-primary btn-wide bag-go" href="/checkout"><IconCart /> চেকআউট</Link>
              <p className="note">{shipNote(quote)}</p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
