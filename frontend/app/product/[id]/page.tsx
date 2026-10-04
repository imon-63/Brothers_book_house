"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { DealChip } from "@/components/catalog/deal-chip";
import { SoonNote } from "@/components/storefront/soon";
import { parseDesc } from "@/lib/desc";
import { AlsoStrip } from "@/components/catalog/like-strip";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { offerOf, shopHref, useProduct } from "@/lib/api/catalog";
import { get, post } from "@/lib/api/client";
import { useMe } from "@/lib/api/auth";
import { apiErrorText, useAddToCart, useWait } from "@/lib/api/shop";
import { useContentHelpline } from "@/lib/api/content";
import { bn, discount, stars, timeAgo } from "@/lib/format";
import { setAuth, setMiniCart, setSection, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

type Review = { id: string; displayName: string | null; rating: number; title: string | null; body: string | null; verified: boolean; createdAt: string };
type ReviewPage = { summary: { average: number; count: number }; items: Review[] };
const AV = ["#7A2430", "#3D5A4C", "#8A6230", "#1a3a6b", "#5C1B24", "#245A6B"];
const avatarColor = (i: number) => AV[i % AV.length];

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const key = decodeURIComponent(id);
  const q = useProduct(key);
  const product = q.data?.product;
  const dto = q.data?.dto;
  const related = q.data?.related ?? [];
  const dispatch = useAppDispatch();
  const router = useRouter();
  const qc = useQueryClient();
  const addToCart = useAddToCart();
  const { me } = useMe();
  const helpline = useContentHelpline();
  const { user: routerUser, saved, toggle } = useWait();
  const kept = product ? saved("book", product.id) : false;
  const vertical = useAppSelector((s) => s.ui.section);

  useEffect(() => {
    if (!product || product.vertical === vertical) return;
    dispatch(setSection(product.vertical));
  }, [product, vertical, dispatch]);
  const [qty, setQty] = useState(1);
  const [openDesc, setOpenDesc] = useState(false);
  const reviewForm = useForm<{ name: string; text: string; stars: number }>({
    defaultValues: { name: routerUser?.name || "", text: "", stars: 0 },
  });
  const picked = reviewForm.watch("stars");
  const [busy, setBusy] = useState(false);
  const reviewsQ = useQuery({
    queryKey: ["reviews", product?.id],
    enabled: !!product,
    queryFn: () => get<ReviewPage>(`/products/${product!.id}/reviews`, { pageSize: 30 }),
  });
  const reviews = reviewsQ.data?.items ?? [];
  const summary = reviewsQ.data?.summary ?? { average: product?.rating.average ?? 0, count: product?.rating.count ?? 0 };

  if (!product) return <div className="wrap"><p className="crumb">{q.isLoading ? "লোড হচ্ছে…" : "পণ্য পাওয়া যায়নি"}</p></div>;

  const oos = product.oos;
  const offer = offerOf(product);
  const off = discount(offer.price, offer.old);
  const score = Math.round((summary.average || 0) * 10) / 10;
  const social = { score, reviews: summary.count, love: dto?.wishlistCount ?? 0, rank: 0 };
  const isBook = product.vertical === "book";
  const descParts = parseDesc(product.desc);
  const longDesc = descParts.intro.length > 160 || descParts.points.length > 4;
  const copies = 99;
  const author = dto?.authors?.[0];

  function add(n = qty, openCart = true) {
    void addToCart("book", product!.id, n, openCart).then((ok) => { if (!openCart) dispatch(setMiniCart(false)); return ok; });
  }

  function share() {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: product!.title, url }).catch(() => undefined);
    else navigator.clipboard?.writeText(url).then(() => dispatch(showToast("লিংক কপি হয়েছে")));
  }

  async function submitReview(values: { name: string; text: string; stars: number }) {
    if (!values.stars || !values.name.trim() || !values.text.trim()) {
      dispatch(showToast("রেটিং, নাম আর রিভিউ দিন"));
      return;
    }
    if (!me) { dispatch(setAuth(true)); dispatch(showToast("রিভিউ দিতে লগইন করুন")); return; }
    setBusy(true);
    try {
      await post(`/products/${product!.id}/reviews`, { rating: values.stars, body: values.text.trim(), displayName: values.name.trim() });
      reviewForm.setValue("text", "");
      reviewForm.setValue("stars", 0);
      dispatch(showToast("রিভিউ জমা হয়েছে · যাচাইয়ের পর দেখাবে"));
      void qc.invalidateQueries({ queryKey: ["reviews", product!.id] });
    } catch (e) {
      dispatch(showToast(apiErrorText(e)));
    } finally { setBusy(false); }
  }

  return (
    <div className="wrap">
      <p className="crumb">
        হোম / <Link href={shopHref(product.catSlug)}>{product.cat}</Link>
        {product.sub ? <> / <Link href={shopHref(product.catSlug, product.subSlug)}>{product.sub}</Link></> : null}
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
          <span className={`stock-pill ${oos ? "out" : "in"}`}>{oos ? "এখন স্টকে নেই" : product.stockStatus === "low" ? "স্টকে আছে · অল্প বাকি" : "স্টকে আছে"}</span>
          <div><span className="tag">{product.sub || product.cat} · {bn(product.sold)} বিক্রি</span></div>
          <h1>{product.title}</h1>
          <p className="meta">
            {isBook && author ? <Link href={`/authors/${encodeURIComponent(author.slug)}`}>{author.name}</Link> : product.author}
            {product.unit ? ` · ${product.unit}` : null}
            {product.cat ? <> <span>|</span> <Link href={shopHref(product.catSlug, product.subSlug)}>{product.sub || product.cat}</Link></> : null}
          </p>
          {social.rank === 1 ? <div className="pd-best">★ #১ বেস্ট সেলার · {product.sub || product.cat}</div> : null}
          <div className="pd-rate">
            <span className="pd-stars">{stars(social.score)}</span>
            <span>{bn(social.score)} · {bn(social.reviews)} রিভিউ</span>
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
          {!offer.on && product.soon ? <SoonNote soon={product.soon} price={offer.price} /> : null}
          {descParts.intro || descParts.points.length ? (
            <div className={`pd-desc${longDesc ? " clamp" : ""}${openDesc ? " on" : ""}`}>
              {descParts.intro ? <p className="desc">{descParts.intro}</p> : null}
              {descParts.points.length ? (
                <ul className="pd-points">
                  {descParts.points.map((pt, i) => (
                    <li key={i} style={{ ["--i" as string]: i }}>
                      <span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" /></svg></span>{pt}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {longDesc ? <button type="button" className="pd-morebtn" onClick={() => setOpenDesc((v) => !v)}>{openDesc ? "কম দেখুন" : "আরও পড়ুন"}</button> : null}
          {isBook ? <p className="author" style={{ marginTop: 10 }}>{product.pages ? `পৃষ্ঠা ${bn(product.pages)} · ` : ""}ভাষা {dto?.book?.language || "বাংলা"}</p> : product.unit ? <p className="author" style={{ marginTop: 10 }}>{product.unit}</p> : null}
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
          <p className="note">সারা বাংলাদেশে হোম ডেলিভারি · হেল্পলাইন {helpline}</p>
        </div>
        <div className="pd-also">
          <AlsoStrip products={related} pill="এগুলোও চলছে" />
        </div>
        <aside className="rv-col">
          <h3>কাস্টমার রিভিউ</h3>
          <p className="rv-avg"><span className="rv-stars">{stars(social.score)}</span> {bn(social.score)} · {bn(summary.count)}টি রিভিউ</p>
          <form className={`rv-form${busy ? " wait" : ""}`} onSubmit={reviewForm.handleSubmit((v) => void submitReview(v))}>
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
                    <article className="rv-item" key={`${copy}-${r.id}`}>
                      <div className="rv-item-h">
                        <span className="rv-av" style={{ background: avatarColor(i) }}>{(r.displayName || "ক").slice(0, 1)}</span>
                        <div>
                          <b>{r.displayName || "ক্রেতা"}{r.verified ? " ✓" : ""}</b>
                          <small><span className="rv-stars">{stars(r.rating)}</span> · {timeAgo(Date.parse(r.createdAt))}</small>
                        </div>
                      </div>
                      <p>{r.body || r.title}</p>
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
