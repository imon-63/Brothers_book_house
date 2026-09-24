"use client";

import { useEffect, useRef } from "react";

export function Rail({ children, kind = "books" }: { children: React.ReactNode; kind?: "books" | "packs" }) {
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rail.current;
    if (!root) return;
    const view = root.querySelector<HTMLElement>(".rail-view");
    const track = root.querySelector<HTMLElement>(".rail-track");
    const prev = root.querySelector<HTMLButtonElement>(".rail-prev");
    const next = root.querySelector<HTMLButtonElement>(".rail-next");
    if (!view || !track || !prev || !next) return;
    let i = 0;
    const gap = () => parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
    const step = () => {
      const el = track.children[0] as HTMLElement | undefined;
      return el ? el.getBoundingClientRect().width + gap() : 0;
    };
    const vis = () => {
      const s = step();
      return s ? Math.max(1, Math.floor((view.clientWidth + gap() * 0.2) / s)) : 1;
    };
    const max = () => Math.max(0, track.children.length - vis());
    const sync = () => {
      i = Math.max(0, Math.min(max(), i));
      const s = step();
      track.style.transform = s ? `translateX(${-i * s}px)` : "none";
      prev.hidden = i <= 0;
      next.hidden = i >= max();
    };
    const onPrev = (e: Event) => { e.preventDefault(); i -= 1; sync(); };
    const onNext = (e: Event) => { e.preventDefault(); i += 1; sync(); };
    prev.addEventListener("click", onPrev);
    next.addEventListener("click", onNext);
    const ro = new ResizeObserver(sync);
    ro.observe(view);
    sync();
    return () => {
      prev.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      ro.disconnect();
    };
  }, [children]);

  return (
    <div className={`rail rail-${kind}`} ref={rail}>
      <button type="button" className="rail-btn rail-prev" hidden aria-label="আগে">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M15 5 8 12l7 7" /></svg>
      </button>
      <div className="rail-view"><div className="rail-track">{children}</div></div>
      <button type="button" className="rail-btn rail-next" aria-label="পরে">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M9 5l7 7-7 7" /></svg>
      </button>
    </div>
  );
}
