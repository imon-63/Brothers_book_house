"use client";

import { useCallback, useState, type ElementType, type ReactNode } from "react";

/*
 * Scroll-reveal for the NEW storefront blocks only (existing blocks keep their own motion).
 * One shared IntersectionObserver; the element gets `sf-in` once it scrolls into view.
 * CSS (app/storefront.css) does the fade/lift and turns it off for prefers-reduced-motion.
 */

let io: IntersectionObserver | null = null;
const hooks = new WeakMap<Element, () => void>();

function observer() {
  if (io) return io;
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      hooks.get(en.target)?.();
      hooks.delete(en.target);
      io?.unobserve(en.target);
    }
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
  return io;
}

export function useReveal<T extends HTMLElement = HTMLElement>() {
  const [on, setOn] = useState(false);
  const ref = useCallback((el: T | null) => {
    if (!el) return;
    const o = observer();
    if (!o) { setOn(true); return; }
    hooks.set(el, () => setOn(true));
    o.observe(el);
    return () => { o.unobserve(el); hooks.delete(el); };
  }, []);
  return [ref, on] as const;
}

export function Reveal({ as, className = "", stagger = false, children, id, ...aria }: {
  as?: ElementType;
  className?: string;
  stagger?: boolean;
  children: ReactNode;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const Tag = (as ?? "section") as ElementType;
  const [ref, on] = useReveal<HTMLElement>();
  return (
    <Tag ref={ref} id={id} className={`sf-rv${stagger ? " sf-stagger" : ""}${on ? " sf-in" : ""}${className ? ` ${className}` : ""}`} {...aria}>
      {children}
    </Tag>
  );
}
