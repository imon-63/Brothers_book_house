"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useBundles, useProducts } from "@/lib/api/catalog";
import { toSlides, useStorefront } from "@/lib/api/content";
import { useSection } from "@/lib/api/section";
import { PackCard } from "@/components/catalog/pack-card";
import { ProductCard } from "@/components/catalog/product-card";
import { Rail } from "@/components/catalog/rail";
import { Hero } from "./hero";

export function HomeView() {
  const { section: vertical, sections, code: verticalId } = useSection();
  const { data } = useProducts({ section: verticalId, sort: "popular", pageSize: 12 });
  const products = data?.items ?? [];
  const packsQ = useBundles({ section: verticalId, pageSize: 12 });
  const packs = packsQ.data?.items ?? [];
  const content = useStorefront().data;
  const prev = useRef(verticalId);
  const [motion, setMotion] = useState<"" | "next" | "prev">("");

  useEffect(() => {
    if (prev.current === verticalId) return;
    const order = sections.map((x) => x.code);
    const from = order.indexOf(prev.current);
    const to = order.indexOf(verticalId);
    setMotion(to > from ? "next" : "prev");
    prev.current = verticalId;
  }, [verticalId, sections]);

  const slides = toSlides(content?.hero?.[verticalId] ?? []);

  return (
    <div key={verticalId} className={motion ? `vert-stage ${motion}` : undefined}>
      <Hero slides={slides} vertical={vertical} />
      <div className="wrap section">
        <div className="section-head">
          <h2>{vertical.popular}</h2>
          <Link className="see" href="/shop">সব দেখুন →</Link>
        </div>
        <Rail>
          {products.slice(0, 12).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </Rail>
      </div>
      {packs.length ? <div className="wrap section">
        <div className="section-head">
          <h2>প্যাকেজ অফার</h2>
          <Link className="see" href="/packs">সব প্যাকেজ →</Link>
        </div>
        <Rail kind="packs">
          {packs.map((p) => <PackCard key={p.id} pack={p} />)}
        </Rail>
      </div> : null}
      <div className="wrap section">
        <div className="section-head"><h2>কীভাবে অর্ডার করবেন</h2></div>
        <div className="how" ref={(el) => {
          if (!el || el.dataset.watched) return;
          el.dataset.watched = "1";
          const io = new IntersectionObserver((entries) => {
            entries.forEach((en) => {
              if (!en.isIntersecting) { el.classList.remove("play"); return; }
              el.classList.remove("play");
              void el.offsetWidth;
              el.classList.add("play");
            });
          }, { threshold: 0.3 });
          io.observe(el);
        }}>
          <article className="how-step" style={{ ["--i" as string]: 0 }}>
            <div className="how-top">
              <span className="how-ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 4h11a2 2 0 0 1 2 2v14l-4-2-4 2-4-2-4 2V6a2 2 0 0 1 2-2z" /><path d="M9 8h6M9 12h4" /></svg></span>
              <span className="n">১</span>
            </div>
            <h3>{vertical.how1}</h3>
            <p>{vertical.how1p}</p>
          </article>
          <article className="how-step" style={{ ["--i" as string]: 1 }}>
            <div className="how-top">
              <span className="how-ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /><path d="M3 4h2l2.2 11h11.3l1.8-8H7" /></svg></span>
              <span className="n">২</span>
            </div>
            <h3>চেকআউট</h3>
            <p>ঠিকানা দিন, কুপন লাগান, ক্যাশ অন বা SSLCOMMERZ।</p>
          </article>
          <article className="how-step" style={{ ["--i" as string]: 2 }}>
            <div className="how-top">
              <span className="how-ico"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h11v10H3z" /><path d="M14 10h4l3 3v4h-7" /><circle cx="7" cy="19" r="1.6" /><circle cx="17" cy="19" r="1.6" /></svg></span>
              <span className="n">৩</span>
            </div>
            <h3>হোম ডেলিভারি</h3>
            <p>ঢাকার ভিতর ৳৬০, বাইরে ৳১২০। ফোন বা অর্ডার আইডি দিয়ে ট্র্যাক করুন।</p>
          </article>
        </div>
      </div>
    </div>
  );
}
