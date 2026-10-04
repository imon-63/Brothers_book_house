"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { useBundles, useProducts } from "@/lib/api/catalog";
import { helplineOf, toSlides, useStorefront } from "@/lib/api/content";
import { useSection } from "@/lib/api/section";
import type { HomeBlock } from "@/lib/home-layout";
import { ProductCard } from "@/components/catalog/product-card";
import { Rail } from "@/components/catalog/rail";
import { Reveal } from "@/components/storefront/reveal";
import { SkeletonRail } from "@/components/storefront/skeleton";
import { setChat } from "@/store/slices/ui-slice";
import { useAppDispatch } from "@/store/hooks";
import { Hero } from "./hero";
import { BlockHead, HelpBand } from "./blocks";
import { DealStrip } from "./deal-strip";
import { CategoryTiles } from "./category-tiles";
import { BundleShowcase } from "./bundle-showcase";
import { AuthorsSpotlight } from "./authors-spotlight";

export function HomeView() {
  const dispatch = useAppDispatch();
  const { section: vertical, sections, code: verticalId, loading: sectionsLoading } = useSection();
  const { data, isLoading: popLoading } = useProducts({ section: verticalId, sort: "popular", pageSize: 12 });
  const products = data?.items ?? [];
  const newQ = useProducts({ section: verticalId, sort: "new", pageSize: 12 });
  const fresh = newQ.data?.items ?? [];
  const dealQ = useProducts({ section: verticalId, onDeal: true, sort: "popular", pageSize: 12 });
  const soonQ = useProducts({ section: verticalId, upcomingDeal: true, pageSize: 12 });
  const packsQ = useBundles({ section: verticalId, pageSize: 12 });
  const packs = packsQ.data?.items ?? [];
  const storeQ = useStorefront();
  const content = storeQ.data;
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
  const pool = [...products, ...fresh.filter((p) => !products.some((x) => x.id === p.id))];
  const freshOnly = fresh.filter((p) => !products.slice(0, 6).some((x) => x.id === p.id));
  const newList = (freshOnly.length >= 4 ? freshOnly : fresh).slice(0, 12);
  const layout = vertical.home;

  function renderBlock(b: HomeBlock) {
    switch (b.key) {
      case "deals":
        return <DealStrip deals={dealQ.data?.items ?? []} discounted={layout.dealMode === "timed" ? [] : pool} upcoming={soonQ.data?.items ?? []} title={b.title} />;
      case "categories":
        return <CategoryTiles section={vertical} products={pool} loading={sectionsLoading} />;
      case "popular":
        return (
          <div className="wrap section">
            <div className="section-head">
              <h2>{b.title || vertical.popular}</h2>
              <Link className="see" href="/shop">সব দেখুন →</Link>
            </div>
            {popLoading && !products.length ? <SkeletonRail /> : (
              <Rail>
                {products.slice(0, 12).map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
              </Rail>
            )}
          </div>
        );
      case "bundles":
        return packs.length ? <BundleShowcase packs={packs} sectionCode={verticalId} /> : null;
      case "fresh":
        return newQ.isLoading || newList.length ? (
          <Reveal className="wrap sf-fresh" aria-labelledby="sf-fresh-h">
            <BlockHead kicker="নতুন সংযোজন" title={b.title || (verticalId === "book" ? "নতুন এসেছে" : "নতুন আইটেম")} href="/shop" id="sf-fresh-h" />
            {newQ.isLoading && !newList.length ? <SkeletonRail /> : (
              <Rail>
                {newList.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
              </Rail>
            )}
          </Reveal>
        ) : null;
      case "authors":
        return verticalId === "book" ? <AuthorsSpotlight /> : null;
      case "how":
        return (
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
        );
      case "help":
        return (
          <HelpBand
            helpline={helplineOf(content?.settings)}
            whatsapp={(content?.settings?.whatsapp as string | null | undefined) ?? null}
            hours={content?.settings?.support_hours ?? null}
            onChat={() => dispatch(setChat(true))}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div key={verticalId} className={motion ? `vert-stage ${motion}` : undefined}>
      <Hero slides={slides} vertical={vertical} loading={storeQ.isLoading || sectionsLoading} />
      {layout.blocks.filter((b) => b.on).map((b) => <Fragment key={b.key}>{renderBlock(b)}</Fragment>)}
    </div>
  );
}
