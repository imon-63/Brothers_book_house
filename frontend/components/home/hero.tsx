"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Slide } from "@/lib/api/content";
import type { SectionView } from "@/lib/api/section";
import { shopHref } from "@/lib/api/catalog";
import { bn } from "@/lib/format";

export function Hero({ slides, vertical }: { slides: Slide[]; vertical: SectionView }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const n = slides.length;
  const slide = slides[i] ?? slides[0];

  useEffect(() => { setI(0); }, [vertical.code]);

  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 5200);
    return () => clearInterval(t);
  }, [n, vertical.code]);

  if (!slide) {
    return (
      <div className="hero-stage">
        <div className="hero-copy wrap">
          <div className="inner">
            <p className="hero-kicker"><i></i> {vertical.kicker}</p>
            <h1><span>{vertical.title}</span><span className="hero-sub">{vertical.sub}</span></h1>
            <p className="lead">{vertical.lead}</p>
            <div className="hero-cta">
              <button className="btn btn-hero" type="button" onClick={() => router.push("/shop")}>সব দেখুন</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-stage">
      <div className="hero-slides">
        {slides.map((s, idx) => (
          <button
            key={s.key}
            type="button"
            className={`hero-slide${idx === i ? " on" : ""}`}
            onClick={() => router.push(s.catSlug ? shopHref(s.catSlug) : "/shop")}
          >
            <img src={s.img} alt={s.title} />
          </button>
        ))}
      </div>
      <button className="hs-nav prev" type="button" aria-label="আগের স্লাইড" onClick={() => setI((x) => (x - 1 + n) % n)}>‹</button>
      <button className="hs-nav next" type="button" aria-label="পরের স্লাইড" onClick={() => setI((x) => (x + 1) % n)}>›</button>
      <div className="hs-dots">
        {slides.map((s, idx) => (
          <button key={s.key} type="button" className={idx === i ? "on" : ""} aria-label={`স্লাইড ${bn(idx + 1)}`} onClick={() => setI(idx)} />
        ))}
      </div>
      <div className="hero-copy wrap" key={slide.key}>
        <div className="inner">
          <p className="hero-kicker"><i></i> {slide.kicker || vertical.kicker}</p>
          <h1><span>{slide.title || vertical.title}</span><span className="hero-sub">{slide.sub || vertical.sub}</span></h1>
          <p className="lead">{slide.cat ? `${slide.cat} — ${vertical.lead}` : vertical.lead}</p>
          <div className="hero-cta">
            <button className="btn btn-hero" type="button" onClick={() => router.push(slide.catSlug ? shopHref(slide.catSlug) : "/shop")}>এই ক্যাটাগরি</button>
            <button className="btn btn-hero-ghost book-only" type="button" onClick={() => router.push("/authors")}>লেখকবৃন্দ</button>
          </div>
        </div>
      </div>
    </div>
  );
}
