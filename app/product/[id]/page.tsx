"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { DealChip } from "@/components/catalog/deal-chip";
import { AlsoStrip } from "@/components/catalog/like-strip";
import { shopHref } from "@/lib/catalog/cats";
import { offerOf } from "@/lib/catalog/offer";
import { avatarColor, relatedFor, reviewsFor, socialFor, type Review } from "@/lib/catalog/social";
import { useProduct } from "@/lib/catalog/use-catalog";
import { bn, discount, inStock, stars, timeAgo } from "@/lib/format";
import { useWait } from "@/components/catalog/use-wait";
import { addLine } from "@/store/slices/cart-slice";
import { setAuth, setMiniCart, setVertical, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: product } = useProduct(Number(id));
  const products = useAppSelector((s) => s.shop.products);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { user: routerUser, saved, toggle } = useWait();
  const kept = product ? saved("book", product.id) : false;
  const vertical = useAppSelector((s) => s.ui.vertical);
  const hiddenVerts = useAppSelector((s) => s.shop.hiddenVerticals ?? []);

  useEffect(() => {
    if (!product || product.vertical === vertical) return;
    if (routerUser?.role !== "admin" && hiddenVerts.includes(product.vertical)) return;
    dispatch(setVertical(product.vertical));
  }, [product, vertical, dispatch, routerUser, hiddenVerts]);
  const [qty, setQty] = useState(1);
  const [openDesc, setOpenDesc] = useState(false);
  const reviewForm = useForm<{ name: string; text: string; stars: number }>({
    defaultValues: { name: routerUser?.name || "", text: "", stars: 0 },
  });
  const picked = reviewForm.watch("stars");
  const [extra, setExtra] = useState<Review[]>([]);
  const [busy, setBusy] = useState(false);

  const seed = useMemo(() => (product ? reviewsFor(product) : []), [product]);
  const reviews = [...extra, ...seed];

  if (!product) return <div className="wrap"><p className="crumb">পণ্য পাওয়া যায়নি</p></div>;

  const oos = !inStock(product.stock);
  const offer = offerOf(product);
  const off = discount(offer.price, offer.old);
  const social = socialFor(product, reviews, products);
  const isBook = product.vertical === "book";
  const longDesc = product.desc.length > 90;
  const related = relatedFor(product, products);
  const copies = Math.max(1, product.stock);

  function add(n = qty, openCart = true) {
    dispatch(addLine({ kind: "book", id: product!.id, n }));
    if (openCart) {
      dispatch(showToast("কার্টে যোগ হয়েছে"));
      dispatch(setMiniCart(true));
    } else dispatch(setMiniCart(false));
  }

  function share() {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: product!.title, url }).catch(() => undefined);
    else navigator.clipboard?.writeText(url).then(() => dispatch(showToast("লিংক কপি হয়েছে")));
  }

  function submitReview(values: { name: string; text: string; stars: number }) {
    if (!values.stars || !values.name.trim() || !values.text.trim()) {
      dispatch(showToast("রেটিং, নাম আর রিভিউ দিন"));
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      setExtra((list) => [{ name: values.name.trim(), stars: values.stars, text: values.text.trim(), at: Date.now() }, ...list]);
      reviewForm.setValue("text", "");
      reviewForm.setValue("stars", 0);
      setBusy(false);
      dispatch(showToast("রিভিউ যোগ হয়েছে"));
    }, 700);
  }

  return (
    <div className="wrap">
      <p className="crumb">
        হোম / <Link href={shopHref(product.cat)}>{product.cat}</Link>
        {product.sub ? <> / <Link href={shopHref(product.cat, product.sub)}>{product.sub}</Link></> : null}
        {" / "}<b>{product.title}</b>
      </p>
      <div className="product with-reviews">
        <div className="cover-stage">
          {off && !oos ? <span className="pd-off">{bn(off)}%<small>ছাড়</small></span> : null}
          <div className={`big-cover${oos ? " oos" : ""}${product.image ? " has-pic" : ""}`} style={product.image ? undefined : { background: product.color }}>
            {product.image ? <img src={product.image} alt="" /> : (
              <>
                <div style={{ fontFamily: "var(--font)", fontSize: 36, fontWeight: 700, lineHeight: 1.25 }}>{product.title}</div>
                <div>{product.author}</div>
              </>
            )}
          </div>
          {oos ? <span className="stamp">স্টক আউট</span> : null}
        </div>
        <div className="pd-body">
          <span className={`stock-pill ${oos ? "out" : "in"}`}>{oos ? "এখন স্টকে নেই" : `স্টকে আছে (${bn(product.stock)})`}</span>
          <div><span className="tag">{product.sub || product.cat} · {bn(product.sold)} বিক্রি</span></div>
          <h1>{product.title}</h1>
          <p className="meta">
            {isBook ? <Link href={`/authors/${encodeURIComponent(product.author)}`}>{product.author}</Link> : product.author}
            {product.unit ? ` · ${product.unit}` : null}
            {product.cat ? <> <span>|</span> <Link href={shopHref(product.cat, product.sub)}>{product.sub || product.cat}</Link></> : null}
          </p>
          {social.rank === 1 ? <div className="pd-best">★ #১ বেস্ট সেলার · {product.sub || product.cat}</div> : null}
          <div className="pd-rate">
            <span className="pd-stars">{stars(social.score)}</span>
            <span>{social.score} · {bn(social.reviews)} রিভিউ</span>
          </div>
          <div className="pd-love">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3" /><circle cx="16" cy="9" r="2.4" /><path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5" /><path d="M14 19c.3-2 1.6-3.4 3.5-3.6" /></svg>
            {bn(social.love)} জনের পছন্দের তালিকায় আছে
          </div>
          <div className="price" style={{ fontSize: 28 }}>
            ৳{bn(offer.price)}
            {offer.old > offer.price ? <span className="old">৳{bn(offer.old)}</span> : null}
            {off ? <span className="off">{bn(off)}%</span> : null}
          </div>
          {offer.on ? <DealChip until={offer.until} face="page" /> : null}
          <p className={`desc${longDesc ? " clamp" : ""}${openDesc ? " on" : ""}`}>{product.desc}</p>
          {longDesc ? <button type="button" className="pd-morebtn" onClick={() => setOpenDesc((v) => !v)}>{openDesc ? "কম দেখুন" : "আরও পড়ুন"}</button> : null}
          {isBook ? <p className="author" style={{ marginTop: 10 }}>পৃষ্ঠা {bn(product.pages || 0)} · ভাষা বাংলা</p> : product.unit ? <p className="author" style={{ marginTop: 10 }}>{product.unit}</p> : null}
          {oos ? (
            <>
              <div className="oos-banner">
                <div>
                  <b>এই পণ্যটি এখন স্টক আউট</b>
                  <p>{routerUser ? "কার্টে যোগ করা যাবে না। চাইলে ভবিষ্যৎ অর্ডার তালিকায় রাখুন — স্টকে এলে এখান থেকেই কিনতে পারবেন।" : "কার্টে যোগ করা যাবে না। লগইন করলে ভবিষ্যৎ অর্ডার তালিকায় রাখতে পারবেন।"}</p>
                </div>
              </div>
              <div className="buy-row">
                <button className={`btn ${kept ? "btn-primary" : "btn-gold"}`} type="button" onClick={() => toggle("book", product.id)}>{kept ? "তালিকায় আছে · সরান" : "ভবিষ্যৎ তালিকায় রাখুন"}</button>
                {routerUser ? <Link className="btn btn-ghost" href="/wait">তালিকা দেখুন</Link> : <button className="btn btn-ghost" type="button" onClick={() => dispatch(setAuth(true))}>লগইন</button>}
              </div>
            </>
          ) : (
            <>
              <p className="note" style={{ margin: "8px 0 0" }}>স্টক আউট হওয়ার আগেই অর্ডার করুন</p>
              <div className="buy-row" style={{ marginTop: 12 }}>
                <div className="qty">
                  <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))}>−</button>
                  <span>{bn(qty)}</span>
                  <button type="button" onClick={() => setQty((n) => Math.min(copies, n + 1))}>+</button>
                </div>
                <button className="btn btn-primary" type="button" onClick={() => add()}>কার্টে যোগ</button>
                <button className="btn btn-gold" type="button" onClick={() => { add(qty, false); router.push("/checkout"); }}>এখনই কিনুন</button>
              </div>
            </>
          )}
          <div className="pd-links">
            {oos ? null : <button type="button" onClick={() => toggle("book", product.id)}>{kept ? "তালিকায় আছে" : "পছন্দের তালিকায় রাখুন"}</button>}
            <button type="button" onClick={share}>বন্ধুদের সাথে শেয়ার</button>
          </div>
          <p className="note">সারা বাংলাদেশে হোম ডেলিভারি · হেল্পলাইন 017910948088</p>
        </div>
        <div className="pd-also">
          <AlsoStrip products={related} pill="এগুলোও চলছে" />
        </div>
        <aside className="rv-col">
          <h3>কাস্টমার রিভিউ</h3>
          <p className="rv-avg"><span className="rv-stars">{stars(social.score)}</span> {social.score} · {bn(reviews.length)}টি রিভিউ</p>
          <form className={`rv-form${busy ? " wait" : ""}`} onSubmit={reviewForm.handleSubmit(submitReview)}>
            <div>
              <label>রেটিং</label>
              <div className="rv-pick">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" className={`rv-star${n <= picked ? " on" : ""}`} onClick={() => reviewForm.setValue("stars", n)}>★</button>
                ))}
              </div>
            </div>
            <div>
              <label>নাম</label>
              <input placeholder="আপনার নাম" maxLength={40} {...reviewForm.register("name")} />
            </div>
            <div>
              <label>রিভিউ</label>
              <textarea placeholder="এই পণ্য কেমন লাগল লিখুন" maxLength={400} {...reviewForm.register("text")} />
            </div>
            <button className="btn btn-primary" type="submit">রিভিউ দিন</button>
            <div className="rv-busy" aria-hidden><i className="spin-lg" /><b>জমা হচ্ছে...</b></div>
          </form>
          <div className="rv-list">
            <div className="rv-run" style={{ ["--rv-dur" as string]: `${Math.max(18, reviews.length * 5)}s` }}>
              {[0, 1].map((copy) => (
                <div className="rv-set" key={copy} aria-hidden={copy === 1}>
                  {reviews.map((r, i) => (
                    <article className="rv-item" key={`${copy}-${r.name}-${i}`}>
                      <div className="rv-item-h">
                        <span className="rv-av" style={{ background: avatarColor(i) }}>{r.name.slice(0, 1)}</span>
                        <div>
                          <b>{r.name}</b>
                          <small><span className="rv-stars">{stars(r.stars)}</span> · {timeAgo(r.at)}</small>
                        </div>
                      </div>
                      <p>{r.text}</p>
                    </article>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
