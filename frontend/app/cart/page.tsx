"use client";

import Link from "next/link";
import { useState } from "react";
import { bn } from "@/lib/format";
import { useCart, useCartActions, useCartRows } from "@/lib/api/cart";
import { useProducts } from "@/lib/api/catalog";
import { apiErrorText } from "@/lib/api/shop";
import { PackSpines } from "@/components/catalog/pack-card";
import { ProductCard } from "@/components/catalog/product-card";
import { Rail } from "@/components/catalog/rail";
import { IconCart } from "@/components/icons";
import { EmptyState } from "@/components/storefront/empty-state";
import { GArrow, GShield, GTicket, GTruck } from "@/components/storefront/glyphs";
import { PageHero } from "@/components/storefront/page-head";
import { RowSkeleton } from "@/components/storefront/skeleton";
import { showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function CartPage() {
  const cartQ = useCart();
  const actions = useCartActions();
  const dispatch = useAppDispatch();
  const section = useAppSelector((s) => s.ui.section);
  const rows = useCartRows(cartQ.data).map((r) => ({ ...r, id: r.itemId }));
  const q = cartQ.data?.quote ?? null;
  const copies = rows.reduce((s2, r) => s2 + r.n, 0);
  const sub = q?.itemsSubtotal ?? rows.reduce((s2, r) => s2 + r.price * r.n, 0);
  const off = q?.discountTotal ?? 0;
  const net = Math.max(0, sub - off);
  const ship = q?.shipping;
  const gifted = !!ship?.free && !ship.campaign && ship.basis !== "MIN_SUBTOTAL";
  const freeAbove = ship?.freeAbove ?? 0;
  const meter = !!freeAbove && !ship?.campaign && !gifted;
  const left = meter ? Math.max(0, ship?.amountToFree ?? freeAbove - net) : 0;
  const pct = meter && freeAbove ? Math.min(100, Math.round((net / freeAbove) * 100)) : 0;
  const nudge = ship?.campaign ? "camp" : gifted ? "gift" : meter ? "meter" : "";
  const grand = q ? q.netSubtotal + (q.shippingFee ?? 0) : net;
  const note = ship?.reason || "ডেলিভারি চার্জ চেকআউটে জেলা বাছাই করলে দেখাবে";
  const listSave = rows.reduce((s2, r) => s2 + (r.old > r.price ? (r.old - r.price) * r.n : 0), 0);
  const saved = listSave + off;
  const coupon = cartQ.data?.couponCode ?? "";
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [bad, setBad] = useState(false);
  const taken = new Set(rows.filter((r) => r.kind === "book").map((r) => r.refId));
  const moreQ = useProducts({ section, sort: "popular", inStock: true, pageSize: 12 });
  const more = (moreQ.data?.items ?? []).filter((p) => !taken.has(p.id)).slice(0, 10);

  function setQty(itemId: string, n: number) {
    actions.setQty(itemId, n).catch((e) => dispatch(showToast(apiErrorText(e))));
  }
  function remove(itemId: string) {
    actions.remove(itemId).then(() => dispatch(showToast("কার্ট থেকে সরানো হয়েছে"))).catch((e) => dispatch(showToast(apiErrorText(e))));
  }
  function applyCoupon() {
    const next = code.trim();
    if (!next || checking || coupon) return;
    setBad(false);
    setChecking(true);
    actions.applyCoupon(next.toUpperCase())
      .then((cart) => {
        setChecking(false);
        const err = cart?.quote?.couponError;
        if (err || !cart?.couponCode) {
          setBad(true);
          dispatch(showToast(err?.message || "কুপন সঠিক নয়"));
          return;
        }
        setCode("");
        dispatch(showToast("কুপন প্রয়োগ হয়েছে"));
      })
      .catch((e) => { setChecking(false); setBad(true); dispatch(showToast(apiErrorText(e))); });
  }
  function dropCoupon() {
    actions.removeCoupon().then(() => dispatch(showToast("কুপন সরানো হয়েছে"))).catch((e) => dispatch(showToast(apiErrorText(e))));
  }

  const loading = !rows.length && cartQ.isLoading;

  return (
    <div className="wrap sf-cart">
      <PageHero
        tone="paper"
        crumbs={[{ label: "হোম", href: "/" }, { label: "কার্ট" }]}
        kicker="শপিং ব্যাগ"
        icon={<IconCart size={16} />}
        title="আপনার কার্ট"
        sub={rows.length ? `${bn(rows.length)}টি আইটেম · ${bn(copies)} কপি` : loading ? "কার্ট খোলা হচ্ছে…" : "পছন্দের পণ্য যোগ করুন"}
        aside={rows.length ? (
          <>
            <span className="sf-stat-chip"><b>৳{bn(grand)}</b><small>মোট</small></span>
            {saved > 0 ? <span className="sf-stat-chip sf-chip-save"><b>৳{bn(saved)}</b><small>সাশ্রয়</small></span> : null}
          </>
        ) : null}
      />
      {loading ? <RowSkeleton n={3} tall /> : !rows.length ? (
        <EmptyState art="bag" title="কার্ট এখন খালি" text="পছন্দের পণ্য যোগ করুন — বই, ঘরের বাজার ও গ্যাজেট এক কার্টে।">
          <Link className="btn btn-primary" href="/shop">ক্যাটালগ দেখুন <GArrow size={16} /></Link>
          <Link className="btn btn-ghost sf-btn-ghost" href="/wait">ভবিষ্যৎ তালিকা</Link>
        </EmptyState>
      ) : (
        <div className="sf-cart-grid">
          <div className="sf-cart-list">
            {nudge ? (
              <div className={`sf-ship${nudge === "meter" && left > 0 ? "" : " free"}`}>
                <span className="sf-ship-ico" aria-hidden="true"><GTruck size={22} /></span>
                <div className="sf-ship-copy">
                  <b>{nudge === "camp" ? "সবার জন্য ডেলিভারি ফ্রি" : nudge === "gift" || left === 0 ? "ডেলিভারি ফ্রি!" : <>আর <em>৳{bn(left)}</em> কিনলেই ডেলিভারি ফ্রি</>}</b>
                  {nudge === "meter" ? (
                    <div className="sf-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="ফ্রি ডেলিভারির অগ্রগতি">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  ) : (
                    <small>{nudge === "camp" ? "ক্যাম্পেইন চলছে" : "এই কার্টে কুরিয়ার ৳০"}</small>
                  )}
                </div>
                {nudge === "meter" && left > 0 ? <Link className="sf-ship-go" href="/shop">আরও দেখুন</Link> : null}
              </div>
            ) : null}
            {rows.map((r) => {
              const lineOff = r.old > r.price ? (r.old - r.price) * r.n : 0;
              return (
                <article className={`sf-line${!r.stockOk ? " warn" : ""}`} key={r.itemId}>
                  {r.kind === "pack" ? (
                    <Link className="sf-line-pic pack" href={r.href} aria-label={r.title}><span className="cart-pack"><PackSpines books={r.books} /></span></Link>
                  ) : r.image ? (
                    <Link className="sf-line-pic" href={r.href}><img src={r.image} alt={r.title} /></Link>
                  ) : (
                    <Link className="sf-line-pic tint" href={r.href} style={{ background: r.color }}><b>{r.title}</b></Link>
                  )}
                  <div className="sf-line-info">
                    <div className="sf-line-tags">
                      {r.kind === "pack" ? <span className="sf-tag gold">প্যাকেজ</span> : r.vertName && r.vertical !== "book" ? <span className="sf-tag">{r.vertName}</span> : null}
                      {r.cat && r.kind !== "pack" ? <span className="sf-line-cat">{r.cat}</span> : null}
                    </div>
                    <h3><Link href={r.href}>{r.title}</Link></h3>
                    {r.sub ? <p className="sf-line-sub">{r.sub}</p> : null}
                    <div className="sf-line-unit">
                      <b>৳{bn(r.price)}</b>
                      {r.old > r.price ? <s>৳{bn(r.old)}</s> : null}
                      <small>প্রতি কপি</small>
                    </div>
                    {!r.stockOk ? <p className="sf-line-warn">স্টক কম — পরিমাণ কমিয়ে দিন</p> : null}
                  </div>
                  <div className="sf-line-ops">
                    <div className="sf-qty" role="group" aria-label={`${r.title} পরিমাণ`}>
                      <button type="button" aria-label="কমান" onClick={() => setQty(r.itemId, r.n - 1)}>−</button>
                      <span aria-live="polite">{bn(r.n)}</span>
                      <button type="button" aria-label="বাড়ান" onClick={() => setQty(r.itemId, r.n + 1)}>+</button>
                    </div>
                    <div className="sf-line-total">
                      <b>৳{bn(r.lineTotal)}</b>
                      {lineOff ? <small>৳{bn(lineOff)} সাশ্রয়</small> : null}
                    </div>
                    <button type="button" className="sf-line-del" onClick={() => remove(r.itemId)}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 7V5h4v2M6 7l1.1 13h9.8L18 7M10 11v6M14 11v6" /></svg>
                      সরান
                    </button>
                  </div>
                </article>
              );
            })}
            <Link className="sf-cart-back" href="/shop"><GArrow size={16} /> আরও কেনাকাটা করুন</Link>
          </div>
          <aside className="sf-sum" aria-label="সারসংক্ষেপ">
            <h2>অর্ডার সারসংক্ষেপ</h2>
            <div className="sf-sum-row"><span>সাবটোটাল ({bn(copies)} কপি)</span><span>৳{bn(sub)}</span></div>
            <div className="sf-sum-row"><span>কুপন ছাড়{q?.coupon ? ` (${q.coupon.code})` : ""}</span><span className={off ? "ok" : ""}>{off ? `−৳${bn(off)}` : "—"}</span></div>
            {q?.shippingFee != null ? <div className="sf-sum-row"><span>ডেলিভারি</span><span className={q.shippingFee ? "" : "ok"}>{q.shippingFee ? `৳${bn(q.shippingFee)}` : "ফ্রি"}</span></div> : null}
            <div className={`sf-coupon${coupon ? " on" : ""}${bad ? " bad" : ""}`}>
              {coupon ? (
                <div className="sf-coupon-on">
                  <span className="sf-coupon-ico"><GTicket size={18} /></span>
                  <div><b>{coupon}</b><small>{off ? `−৳${bn(off)} ছাড় পাচ্ছেন` : "প্রয়োগ হয়েছে"}</small></div>
                  <button type="button" onClick={dropCoupon}>সরান</button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); applyCoupon(); }}>
                  <label htmlFor="sf-cpn">কুপন কোড আছে?</label>
                  <div className="sf-coupon-row">
                    <span className="sf-coupon-ico" aria-hidden="true"><GTicket size={18} /></span>
                    <input id="sf-cpn" value={code} onChange={(e) => { setCode(e.target.value); setBad(false); }} placeholder="কোড লিখুন" autoComplete="off" disabled={checking} aria-invalid={bad} />
                    <button type="submit" disabled={checking || !code.trim()}>{checking ? "যাচাই…" : "লাগান"}</button>
                  </div>
                </form>
              )}
            </div>
            {saved > 0 ? <p className="sf-sum-save">এই অর্ডারে মোট <b>৳{bn(saved)}</b> সাশ্রয় হচ্ছে</p> : null}
            <div className="sf-sum-grand"><span>সর্বমোট</span><b>৳{bn(grand)}</b></div>
            <Link className="btn btn-primary btn-wide bag-go sf-sum-go" href="/checkout"><IconCart /> চেকআউট করুন</Link>
            <p className="sf-sum-note">{note}</p>
            <ul className="sf-sum-trust">
              <li><GShield size={16} /> নিরাপদ পেমেন্ট · SSLCOMMERZ</li>
              <li><GTruck size={16} /> ক্যাশ অন ডেলিভারি সুবিধা</li>
            </ul>
          </aside>
        </div>
      )}
      {more.length ? (
        <section className="sf-cart-more" aria-labelledby="sf-more-h">
          <div className="sf-bhead"><div><p className="sf-bkick"><i />আপনার জন্য</p><h2 id="sf-more-h">আরও দেখুন</h2></div><Link className="sf-more" href="/shop">সব দেখুন <GArrow size={16} /></Link></div>
          <Rail>{more.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}</Rail>
        </section>
      ) : null}
    </div>
  );
}
