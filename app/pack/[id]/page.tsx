"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { PackCard } from "@/components/catalog/pack-card";
import { useWait } from "@/components/catalog/use-wait";
import { bn, discount, inStock } from "@/lib/format";
import { offerOf } from "@/lib/catalog/offer";
import { quoteCheckout } from "@/lib/demo/pricing";
import { addLine } from "@/store/slices/cart-slice";
import { setAuth, setMiniCart, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

const FAQ = [
  { q: "প্যাকেজের বই কি আলাদা করে পাল্টানো যাবে?", a: "প্যাকেজ একসাথে সাজানো দামে বিক্রি হয়। আলাদা বই লাগলে প্রতিটা বইয়ের পেজ থেকে আলাদা অর্ডার করতে পারবেন।" },
  { q: "ডেলিভারিতে কত দিন লাগে?", a: "ঢাকার ভিতরে সাধারণত ১–২ দিন, ঢাকার বাইরে ২–৪ দিন। অর্ডার কনফার্ম হলেই আপনার অর্ডার পেজে প্রতিটা ধাপ দেখা যাবে।" },
  { q: "টাকা কীভাবে দেব?", a: "SSLCOMMERZ দিয়ে বিকাশ, নগদ বা কার্ডে আগে পেমেন্ট করতে পারেন, অথবা ক্যাশ অন ডেলিভারিতে বই হাতে পেয়ে টাকা দিন।" },
  { q: "বই ছেঁড়া বা ভুল এলে?", a: "হাতে পাওয়ার সময় দেখে নিন। সমস্যা থাকলে সাথে সাথে হেল্পলাইন 017910948088-এ জানান, আমরা বদলে দেব।" },
];

export default function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pack = useAppSelector((s) => s.shop.packs.find((p) => p.id === Number(id)));
  const packs = useAppSelector((s) => s.shop.packs);
  const products = useAppSelector((s) => s.shop.products);
  const ship = useAppSelector((s) => s.shop.ship);
  const coupons = useAppSelector((s) => s.shop.coupons);
  const dispatch = useAppDispatch();
  const { user, saved, toggle } = useWait();
  const [faq, setFaq] = useState(0);
  if (!pack) return <div className="wrap"><p className="crumb">প্যাকেজ পাওয়া যায়নি</p></div>;

  const books = pack.bookIds.map((bid) => products.find((p) => p.id === bid)).filter((p) => p != null);
  const off = discount(pack.price, pack.old);
  const oos = books.some((b) => !inStock(b.stock));
  const outN = books.filter((b) => !inStock(b.stock)).length;
  const kept = saved("pack", pack.id);
  const single = books.reduce((sum, b) => sum + offerOf(b).price, 0);
  const saving = Math.max(0, single - pack.price);
  const savePct = single > 0 ? Math.round((saving / single) * 100) : 0;
  const pages = books.reduce((sum, b) => sum + (b.pages || 0), 0);
  const sold = books.reduce((sum, b) => sum + (b.sold || 0), 0);
  const authors = [...new Set(books.map((b) => b.author).filter(Boolean))];
  const cats = [...new Set(books.flatMap((b) => [b.cat, b.sub]).filter((x): x is string => Boolean(x)))];
  const quote = quoteCheckout(pack.price, "", "ঢাকা", coupons, ship, !!pack.freeShip || ship.freeOnPack);
  const freeShip = quote.ship === 0;
  const others = packs.filter((p) => p.id !== pack.id).slice(0, 4);

  function add(go?: boolean) {
    dispatch(addLine({ kind: "pack", id: pack!.id }));
    if (go) {
      router.push("/checkout");
      return;
    }
    dispatch(showToast("কার্টে যোগ হয়েছে"));
    dispatch(setMiniCart(true));
  }

  function share() {
    const url = window.location.href;
    if (navigator.share) navigator.share({ title: pack!.title, url }).catch(() => undefined);
    else {
      navigator.clipboard?.writeText(url).catch(() => undefined);
      dispatch(showToast("লিংক কপি হয়েছে"));
    }
  }

  return (
    <div className="wrap pd-pack" style={{ paddingBottom: 48 }}>
      <p className="crumb">হোম / <Link href="/packs">প্যাকেজ</Link> / <b>{pack.title}</b></p>

      <section className="pp-hero">
        <div className="pp-stage">
          {off ? <span className="pd-off">{bn(off)}%<small>ছাড়</small></span> : null}
          {freeShip ? <span className="pk-free">ফ্রি ডেলিভারি</span> : null}
          <div className={`pk-stack lg${oos ? " pp-oos" : ""}`} style={{ ["--n" as string]: Math.min(5, books.length) }}>
            {books.slice(0, 5).map((b, i, arr) => (
              <span key={b.id} className="pk-cover" style={{ ["--i" as string]: i - (arr.length - 1) / 2, background: b.image ? undefined : b.color }}>
                {b.image ? <img src={b.image} alt="" /> : <em>{b.title}</em>}
              </span>
            ))}
          </div>
          {books.length > 5 ? <span className="pp-more">+{bn(books.length - 5)}টি আরও</span> : null}
          <div className="pp-stage-foot">
            <span><b>{bn(books.length)}</b> বই</span>
            {pages ? <span><b>{bn(pages)}</b> পৃষ্ঠা</span> : null}
            {sold ? <span><b>{bn(sold)}+</b> বিক্রি</span> : null}
          </div>
        </div>

        <div className="pp-info">
          <p className="pp-kick">চলো বই প্যাকেজ</p>
          <h1>{pack.title}</h1>
          <p className="pp-desc">{pack.desc}</p>
          <div className="pp-tags">
            {cats.slice(0, 4).map((c) => <span key={c}>{c}</span>)}
          </div>

          <div className="pp-mini">
            <div className="pp-mini-head"><b>প্যাকেজে যা পাবেন</b><a href="#pack-books">সব দেখুন ›</a></div>
            <div className="pp-mini-row">
              {books.slice(0, 6).map((b, i) => (
                <Link key={b.id} href={`/product/${b.id}`} className={`pp-mini-cover${inStock(b.stock) ? "" : " out"}`} title={b.title} style={{ background: b.image ? undefined : b.color, animationDelay: `${i * 50}ms` }}>
                  {b.image ? <img src={b.image} alt={b.title} /> : <em>{b.title}</em>}
                </Link>
              ))}
              {books.length > 6 ? <a href="#pack-books" className="pp-mini-more">+{bn(books.length - 6)}</a> : null}
            </div>
          </div>

          <div className="pp-price">
            <div>
              <small>প্যাকেজ দাম</small>
              <b>৳{bn(pack.price)}</b>
            </div>
            {pack.old > pack.price ? <s>৳{bn(pack.old)}</s> : null}
            {saving ? <span className="pp-save">৳{bn(saving)} সাশ্রয় · {bn(savePct)}%</span> : null}
            {single > pack.price ? (
              <div className="pp-compare">
                <p><span>আলাদা কিনলে</span><i><u style={{ width: "100%" }} /></i><s>৳{bn(single)}</s></p>
                <p className="me"><span>এই প্যাকেজে</span><i><u style={{ width: `${Math.max(8, (pack.price / single) * 100)}%` }} /></i><b>৳{bn(pack.price)}</b></p>
              </div>
            ) : null}
          </div>

          <div className={`pp-stock${oos ? " out" : ""}`}>
            <i />
            {oos ? `${bn(outN)}টি বই এখন স্টক আউট` : "সব বই স্টকে আছে · আজই পাঠানো হবে"}
          </div>

          {oos ? (
            <div className="pp-actions">
              <button className={`btn ${kept ? "btn-primary" : "btn-gold"} pp-main`} type="button" onClick={() => toggle("pack", pack.id)}>{kept ? "তালিকায় আছে · সরান" : "ভবিষ্যৎ তালিকায় রাখুন"}</button>
              {user ? <Link className="btn btn-ghost" href="/wait">তালিকা দেখুন</Link> : <button className="btn btn-ghost" type="button" onClick={() => dispatch(setAuth(true))}>লগইন</button>}
            </div>
          ) : (
            <div className="pp-actions">
              <button className="btn btn-primary pp-main" type="button" onClick={() => add()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M6 6 5 3H2" /></svg>
                কার্টে যোগ
              </button>
              <button className="btn btn-gold pp-now" type="button" onClick={() => add(true)}>এখনই কিনুন</button>
              <button className="pp-icon" type="button" aria-label="শেয়ার" title="শেয়ার" onClick={share}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" /></svg>
              </button>
            </div>
          )}

        </div>
      </section>

      <section className="pp-stats">
        <article><span className="pp-st-ico"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5H8.5A2.5 2.5 0 0 0 6 22z" /><path d="M6 4.5v17.5" /></svg></span><div><b>{bn(books.length)}</b><small>বই একসাথে</small></div></article>
        <article><span className="pp-st-ico ok">৳</span><div><b>৳{bn(saving)}</b><small>আলাদা কেনার চেয়ে কম</small></div></article>
        <article><span className="pp-st-ico gold"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c1.2-3.2 3.6-5 6.5-5s5.3 1.8 6.5 5" /></svg></span><div><b>{bn(authors.length)}</b><small>লেখক / প্রকাশনী</small></div></article>
        <article><span className="pp-st-ico sage"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg></span><div><b>{pages ? bn(pages) : bn(cats.length)}</b><small>{pages ? "মোট পৃষ্ঠা" : "বিষয়"}</small></div></article>
      </section>

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
                  <small>{b.author}{b.cat ? ` · ${b.cat}` : ""}{b.sub ? ` · ${b.sub}` : ""}{b.pages ? ` · ${bn(b.pages)} পৃষ্ঠা` : ""}</small>
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

      <div className="pp-duo">
        <section className="pp-card">
          <p className="pb-kick">কাদের জন্য</p>
          <h2>প্যাকেজ সম্পর্কে</h2>
          <p className="pp-about">{pack.desc} {bn(books.length)}টি বই আলাদা খোঁজার ঝামেলা ছাড়াই একসাথে পাবেন{saving ? `, আর আলাদা কেনার চেয়ে ৳${bn(saving)} কম পড়বে` : ""}।</p>
          {cats.length ? (
            <>
              <h4>বিষয় ও শ্রেণি</h4>
              <div className="pp-chips">{cats.map((c) => <span key={c}>{c}</span>)}</div>
            </>
          ) : null}
          {authors.length ? (
            <>
              <h4>লেখক / প্রকাশনী</h4>
              <div className="pp-chips au">{authors.map((a) => <Link key={a} href={`/authors/${encodeURIComponent(a)}`}>{a}</Link>)}</div>
            </>
          ) : null}
        </section>

        <section className="pp-card">
          <p className="pb-kick">অর্ডার থেকে হাতে</p>
          <h2>কীভাবে পৌঁছাবে</h2>
          <ol className="pp-steps">
            <li><i>১</i><div><b>অর্ডার দিন</b><small>কার্টে যোগ করে চেকআউট করুন</small></div></li>
            <li><i>২</i><div><b>কনফার্ম ও প্যাকিং</b><small>বইগুলো যাচাই করে একসাথে প্যাক হয়</small></div></li>
            <li><i>৩</i><div><b>কুরিয়ারে রওনা</b><small>অর্ডার পেজে প্রতিটা ধাপ দেখবেন</small></div></li>
            <li><i>৪</i><div><b>আপনার দরজায়</b><small>ঢাকায় ১–২ দিন · বাইরে ২–৪ দিন</small></div></li>
          </ol>
          <p className="pp-ship">{freeShip ? `এই প্যাকেজে ডেলিভারি ফ্রি · ${quote.why}` : `ডেলিভারি চার্জ: ঢাকায় ৳${bn(quote.dhaka)}, বাইরে ৳${bn(quote.outside)}${quote.freeAboveOn ? ` · ৳${bn(quote.freeAbove)}+ অর্ডারে ফ্রি` : ""}`}</p>
        </section>
      </div>

      <section className="pp-card pp-faq">
        <p className="pb-kick">জিজ্ঞাসা</p>
        <h2>সচরাচর প্রশ্ন</h2>
        {FAQ.map((f, i) => (
          <div key={f.q} className={`pp-q${faq === i ? " on" : ""}`}>
            <button type="button" onClick={() => setFaq(faq === i ? -1 : i)}>
              <span>{f.q}</span>
              <i aria-hidden="true">+</i>
            </button>
            <div className="pp-a"><p>{f.a}</p></div>
          </div>
        ))}
      </section>

      {others.length ? (
        <section className="pp-others">
          <header className="pb-head">
            <div>
              <p className="pb-kick">আরও দেখুন</p>
              <h2>অন্য প্যাকেজ</h2>
            </div>
            <Link className="btn btn-ghost btn-sm" href="/packs">সব প্যাকেজ</Link>
          </header>
          <div className="grid">
            {others.map((p) => <PackCard key={p.id} pack={p} />)}
          </div>
        </section>
      ) : null}

      <div className="pp-bar">
        <div>
          <b>৳{bn(pack.price)}</b>
          {pack.old > pack.price ? <s>৳{bn(pack.old)}</s> : null}
        </div>
        {oos ? (
          <button className={`btn ${kept ? "btn-primary" : "btn-gold"}`} type="button" onClick={() => toggle("pack", pack.id)}>{kept ? "তালিকায় আছে" : "তালিকায় রাখুন"}</button>
        ) : (
          <button className="btn btn-primary" type="button" onClick={() => add()}>কার্টে যোগ</button>
        )}
      </div>
    </div>
  );
}
