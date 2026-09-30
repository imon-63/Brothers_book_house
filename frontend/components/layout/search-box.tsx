"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { bn, discount } from "@/lib/format";
import { offerOf, packHref, productHref, toProduct, useSuggest } from "@/lib/api/catalog";
import { setMenu, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

function norm(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function highlightParts(text: string, q: string) {
  const tokens = [...new Set(norm(q).split(" ").filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!tokens.length) return [{ text, hit: false }];
  const re = new RegExp(`(${tokens.map(escapeReg).join("|")})`, "ig");
  return text.split(re).filter((part) => part !== "").map((part) => ({
    text: part,
    hit: tokens.some((token) => part.toLowerCase() === token),
  }));
}

type SuggestItem = { key: string; kind: "book" | "pack"; title: string; meta: string; price: number; old: number; color: string; image?: string; href: string; oos: boolean };

export function SearchBox({ placeholder }: { placeholder: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const path = usePathname();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const vertical = useAppSelector((s) => s.ui.section);
  const { register, handleSubmit, watch, setValue } = useForm<{ q: string }>({ defaultValues: { q: "" } });
  const q = watch("q");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [term, setTerm] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 180); return () => window.clearTimeout(t); }, [q]);
  const sug = useSuggest(open ? term : "", vertical);

  const { items, total } = useMemo(() => {
    const d = sug.data;
    if (!d) return { items: [] as SuggestItem[], total: 0 };
    const rows: SuggestItem[] = d.products.map((dto) => {
      const p = toProduct(dto);
      const o = offerOf(p);
      return { key: `p-${p.id}`, kind: "book", title: p.title, meta: [p.author || p.unit, p.cat].filter(Boolean).join(" · "), price: o.price, old: o.old, color: p.color, image: p.image, href: productHref(p), oos: p.oos };
    });
    for (const b of d.bundles) {
      rows.push({ key: `b-${b.id}`, kind: "pack", title: b.title, meta: `${bn(b.itemCount)}টি বইয়ের প্যাকেজ`, price: b.price, old: b.compareAt ?? 0, color: "#3D5A4C", image: b.cover.url ?? undefined, href: packHref({ key: b.slug }), oos: false });
    }
    return { items: rows.slice(0, 7), total: d.total };
  }, [sug.data]);
  const shown = open && q.trim().length > 0;

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("q") || "";
    setValue("q", next);
    setOpen(false);
    setActive(-1);
  }, [path]);

  useEffect(() => {
    setActive(-1);
  }, [q, vertical]);

  function go(href: string) {
    setOpen(false);
    dispatch(setMenu(false));
    router.push(href);
  }

  function submit(values: { q: string }) {
    const text = values.q.trim();
    if (!text) {
      dispatch(showToast("কী খুঁজছেন লিখুন"));
      return;
    }
    if (active >= 0 && items[active]) {
      go(items[active].href);
      return;
    }
    go(`/shop?q=${encodeURIComponent(text)}`);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!shown && (e.key === "ArrowDown" || e.key === "ArrowUp") && q.trim()) setOpen(true);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i <= 0 ? items.length - 1 : i - 1) : -1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="search-wrap" ref={root}>
      <form className="search" role="search" onSubmit={handleSubmit(submit)}>
        <input
          type="search"
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={placeholder}
          autoComplete="off"
          {...register("q", { onChange: () => setOpen(true) })}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!root.current?.contains(e.relatedTarget as Node)) setOpen(false);
          }}
          onKeyDown={onKey}
        />
        {q ? (
          <button className="search-clear" type="button" aria-label="মুছুন" onClick={() => { setValue("q", ""); setOpen(false); }}>×</button>
        ) : null}
        <button className="btn btn-primary" type="submit">খুঁজুন</button>
      </form>
      {shown ? (
        <div className="suggest" id={listId} role="listbox" aria-label="সাজেশন" onMouseDown={(e) => e.preventDefault()}>
          <p className="suggest-kicker">{total ? `${bn(total)}টি মিল` : "কোনো মিল নেই"}</p>
          {items.length ? items.map((item, i) => {
            const off = discount(item.price, item.old);
            return (
              <button
                key={item.key}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`suggest-row${i === active ? " on" : ""}${item.kind === "pack" ? " pack" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item.href)}
              >
                <span className="suggest-pic" style={{ background: item.color }}>
                  {item.image ? <img src={item.image} alt="" /> : <b>{item.title.slice(0, 1)}</b>}
                  {off ? <i>-{bn(off)}%</i> : null}
                </span>
                <span className="suggest-copy">
                  <strong>
                    {highlightParts(item.title, q).map((part, n) => part.hit ? <mark key={n}>{part.text}</mark> : <span key={n}>{part.text}</span>)}
                  </strong>
                  <em>
                    {item.meta}
                    {item.oos ? <span className="suggest-oos">স্টক আউট</span> : null}
                  </em>
                </span>
                <span className="suggest-price">
                  <b>৳{bn(item.price)}</b>
                  {item.old > item.price ? <s>৳{bn(item.old)}</s> : null}
                </span>
              </button>
            );
          }) : (
            <p className="suggest-empty">“{q.trim()}” দিয়ে এই বিভাগে কিছু মেলেনি।</p>
          )}
          {total ? (
            <button className="suggest-all" type="button" onClick={() => go(`/shop?q=${encodeURIComponent(q.trim())}`)}>
              সব ফলাফল দেখুন
              {total > items.length ? <span> · আরও {bn(total - items.length)}টি</span> : null}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
