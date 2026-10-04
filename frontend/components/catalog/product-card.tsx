"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DealChip } from "@/components/catalog/deal-chip";
import { offerOf, productHref, type Product } from "@/lib/api/catalog";
import { bn, discount } from "@/lib/format";
import { useAddToCart, useWait } from "@/lib/api/shop";
import { IconCart } from "@/components/icons";
import { Stars } from "@/components/storefront/glyphs";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const router = useRouter();
  const addToCart = useAddToCart();
  const { saved, toggle } = useWait();
  const kept = saved("book", product.id);
  const oos = product.oos;
  const low = !oos && product.stockStatus === "low";
  const offer = offerOf(product);
  const off = discount(offer.price, offer.old);
  const meta = product.vertical === "book" ? product.author : product.unit || product.author;
  const plain = product.vertical !== "book" ? " pic-plain" : "";
  const tight = product.vertical === "gadget" ? " pic-tight" : "";
  const hover = Boolean(product.image2 && product.image2 !== product.image);
  const href = productHref(product);
  const rated = product.rating?.count > 0;
  const ref = useRef<HTMLElement | null>(null);
  const [bump, setBump] = useState(0);

  /* phones: cards pop in as they scroll into view (desktop keeps its own entrance) */
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined" || !window.matchMedia("(max-width: 640px)").matches) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0) return;
    el.classList.add("sf-pc-wait");
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      el.classList.remove("sf-pc-wait");
      el.classList.add("sf-pc-in");
      io.disconnect();
    }, { threshold: 0.15, rootMargin: "0px 40px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!bump) return;
    const t = window.setTimeout(() => setBump(0), 700);
    return () => window.clearTimeout(t);
  }, [bump]);

  function open() {
    router.push(href);
  }

  function add(e: React.MouseEvent) {
    e.stopPropagation();
    if (oos) return;
    setBump(Date.now());
    void addToCart("book", product.id);
  }

  return (
    <article ref={ref} className={`card sf-pc${oos ? " oos" : ""}${bump ? " sf-pc-added" : ""}`} style={{ animationDelay: `${index * 50}ms`, ["--col" as string]: index % 2 }}>
      <div
        className="card-media"
        role="link"
        tabIndex={0}
        aria-label={product.title}
        onClick={open}
        onKeyDown={(e) => { if (e.key === "Enter") open(); }}
      >
        {off && !oos ? <span className="sale-badge">-{bn(off)}%</span> : null}
        {offer.on ? <DealChip until={offer.until} /> : null}
        <div className={`cover-wrap${tight}`}>
          {product.image ? (
            <div className={`cover has-pic${plain}${hover ? " has-hover" : ""}`}>
              {oos ? (
                <>
                  <span className="ribbon stock">স্টক আউট</span>
                  <span className="stamp">স্টক আউট</span>
                </>
              ) : null}
              <img className="pic-a" src={product.image} alt={product.title} loading="lazy" />
              {hover ? <img className="pic-b" src={product.image2} alt="" aria-hidden /> : null}
            </div>
          ) : (
            <div className={`cover${plain}`} style={{ background: product.color }}>
              {oos ? (
                <>
                  <span className="ribbon stock">স্টক আউট</span>
                  <span className="stamp">স্টক আউট</span>
                </>
              ) : null}
              <div className="ct">{product.title}</div>
              <div className="ca">{meta}</div>
            </div>
          )}
        </div>
        {!oos && (low || product.freeShipping) ? (
          <span className="sf-pc-tags">
            {low ? <span className="sf-pc-tag low">অল্প বাকি</span> : null}
            {product.freeShipping ? <span className="sf-pc-tag free">ফ্রি ডেলিভারি</span> : null}
          </span>
        ) : null}
      </div>
      <div className="card-body">
        <h3><Link href={href} prefetch={false}>{product.title}</Link></h3>
        <div className="author">{meta}</div>
        <div className="sf-pc-proof">
          {rated ? (
            <><Stars value={product.rating.average} count={product.rating.count} /><small>({bn(product.rating.count)})</small></>
          ) : product.sold > 0 ? (
            <small className="sf-pc-sold">{bn(product.sold)}+ বিক্রি</small>
          ) : product.cat ? (
            <small>{product.cat}</small>
          ) : null}
        </div>
        {product.soon && !offer.on && Date.parse(product.soon.from) > Date.now() ? (
          <div className="sf-pc-soon" title="টাইমার ছাড় আসছে">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.5 1.6M9.5 3h5" /></svg>
            <span>{new Date(product.soon.from).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} থেকে <b>৳{bn(product.soon.price)}</b></span>
          </div>
        ) : null}
        <div className="card-foot">
          <div className="price-switch">
            <div className="price">
              ৳{bn(offer.price)}
              {offer.old > offer.price ? <span className="old">৳{bn(offer.old)}</span> : null}
            </div>
          </div>
          {oos ? (
            <button type="button" className={`slide-add wait${kept ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); toggle("book", product.id); }}>{kept ? "রাখা হয়েছে" : "তালিকায়"}</button>
          ) : (
            <button type="button" className="slide-add" onClick={add} aria-label={`${product.title} কার্টে যোগ করুন`}>
              <IconCart /> <span className="sf-pc-addtxt">কার্টে যোগ</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
