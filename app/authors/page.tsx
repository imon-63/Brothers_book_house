"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AUTHOR_GROUPS, hiddenMain } from "@/lib/catalog/cats";
import { bn } from "@/lib/format";
import { useAppSelector } from "@/store/hooks";

export default function AuthorsPage() {
  const [filter, setFilter] = useState("সব");
  const products = useAppSelector((s) => s.shop.products);
  const hidden = useAppSelector((s) => s.shop.hiddenCats);
  const authors = useMemo(() => {
    const books = products.filter((p) => p.vertical === "book" && !hiddenMain(hidden, "book", p.cat));
    const map = new Map<string, { name: string; n: number; sold: number; color: string; cat: string }>();
    for (const b of books) {
      const row = map.get(b.author) ?? { name: b.author, n: 0, sold: 0, color: b.color, cat: b.cat };
      row.n += 1;
      row.sold += b.sold;
      map.set(b.author, row);
    }
    return [...map.values()].sort((a, b) => b.sold - a.sold);
  }, [products, hidden]);

  const chips = ["সব", ...AUTHOR_GROUPS.map((g) => g.id)];

  return (
    <div className="wrap">
      <p className="crumb">হোম / <b>লেখক</b></p>
      <div className="section-head"><h2>লেখক</h2></div>
      <p className="lead" style={{ marginTop: -10 }}>ক্যাটাগরি বেছে লেখক দেখুন, তারপর তাঁর বই।</p>
      <div className="author-chips">
        {chips.map((id) => (
          <button key={id} type="button" className={`author-chip${filter === id ? " on" : ""}`} onClick={() => setFilter(id)}>{id}</button>
        ))}
      </div>
      {AUTHOR_GROUPS.filter((g) => filter === "সব" || g.id === filter).map((g) => {
        const list = authors.filter((a) => g.cats.includes(a.cat));
        if (!list.length) return null;
        return (
          <section className="author-block" key={g.id}>
            <div className="author-block-head">
              <div>
                <div className="kicker"><i></i> {g.sub}</div>
                <h3>{g.title}</h3>
              </div>
              <span className="count">{bn(list.length)} জন লেখক</span>
            </div>
            <div className="authors">
              {list.map((a) => (
                <Link key={a.name} className="author-card" href={`/authors/${encodeURIComponent(a.name)}`}>
                  <span className="author-tag">{g.title}</span>
                  <div className="author-av" style={{ background: a.color }}>{a.name.slice(0, 1)}</div>
                  <h3>{a.name}</h3>
                  <div className="meta">{bn(a.n)}টি বই</div>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
