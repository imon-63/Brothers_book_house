"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { hiddenMain } from "@/lib/catalog/cats";
import { highlightParts, suggestCatalog } from "@/lib/catalog/search";
import { bn, discount } from "@/lib/format";
import { setMenu, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export function SearchBox({ placeholder }: { placeholder: string }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const path = usePathname();
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const vertical = useAppSelector((s) => s.ui.vertical);
  const products = useAppSelector((s) => s.shop.products);
  const hidden = useAppSelector((s) => s.shop.hiddenCats);
  const visible = products.filter((p) => !hiddenMain(hidden, p.vertical, p.cat));
  const packs = useAppSelector((s) => s.shop.packs);
  const { register, handleSubmit, watch, setValue } = useForm<{ q: string }>({ defaultValues: { q: "" } });
  const q = watch("q");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const { items, total } = useMemo(
    () => suggestCatalog(visible, packs, vertical, q),
    [visible, packs, vertical, q],
  );
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
