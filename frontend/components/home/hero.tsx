"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Slide } from "@/lib/api/content";
import type { SectionView } from "@/lib/api/section";
import { shopHref } from "@/lib/api/catalog";
import { bn } from "@/lib/format";
import { SectionGlyph } from "@/components/icons";

const TICK = 5200;

function two(n: number) {
  return bn(String(n).padStart(2, "0"));
}

export function Hero({ slides, vertical, loading = false }: { slides: Slide[]; vertical: SectionView; loading?: boolean }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const n = slides.length;
  const slide = slides[i] ?? slides[0];

  useEffect(() => { setI(0); }, [vertical.code]);

  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), TICK);
    return () => clearInterval(t);
  }, [n, vertical.code]);

  if (!slide) {
    return (
      <div className={`hero-stage sf-hero sf-hero-empty${loading ? " is-loading" : ""}`}>
        <span className="sf-hero-glow" aria-hidden="true" />
        <span className="sf-hero-grain" aria-hidden="true" />
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
        <span className="sf-hero-badge" aria-hidden="true"><SectionGlyph code={vertical.code} icon={vertical.icon} /></span>
      </div>
    );
  }

  return (
    <div className="hero-stage sf-hero" aria-roledescription="ক্যারোসেল" aria-label={vertical.name || "অফার"}>
      <div className="hero-slides">
        {slides.map((s, idx) => (
          <button
            key={s.key}
            type="button"
            tabIndex={-1}
            aria-hidden={idx !== i}
            className={`hero-slide${idx === i ? " on" : ""}`}
            onClick={() => router.push(s.catSlug ? shopHref(s.catSlug) : "/shop")}
          >
            <img src={s.img} alt={s.title || s.cat || vertical.name} />
          </button>
        ))}
      </div>
      <span className="sf-hero-tint" aria-hidden="true" />
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
      {n > 1 ? (
        <div className="sf-hero-rail wrap" aria-label="স্লাইড বাছুন">
          <span className="sf-hero-count" aria-live="polite"><b>{two(i + 1)}</b> / {two(n)}</span>
          <div className="sf-hero-thumbs">
            {slides.map((s, idx) => (
              <button
                key={s.key}
                type="button"
                className={`sf-hero-thumb${idx === i ? " on" : ""}`}
                aria-current={idx === i ? "true" : undefined}
                aria-label={`${s.title || s.cat || `স্লাইড ${bn(idx + 1)}`}`}
                onClick={() => setI(idx)}
              >
                <img src={s.img} alt="" />
                <span className="sf-hero-thumb-txt">
                  <small>{s.cat || vertical.name}</small>
                  <b>{s.title || vertical.title}</b>
                </span>
                {idx === i ? <i className="sf-hero-bar" key={`${vertical.code}-${i}`} style={{ animationDuration: `${TICK}ms` }} aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
