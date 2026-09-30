"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuthors } from "@/lib/api/catalog";
import { bn } from "@/lib/format";

const COLORS = ["#7A2430", "#5C1B24", "#3D5A4C", "#8A6230", "#1a3a6b", "#245A6B"];

export default function AuthorsPage() {
  const [filter, setFilter] = useState("সব");
  const q = useAuthors({ section: "book", pageSize: 100 });
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; title: string; list: { slug: string; name: string; n: number; color: string }[] }>();
    for (const a of q.data?.items ?? []) {
      const cat = a.categories[0];
      const key = cat?.slug ?? "other";
      const g = map.get(key) ?? { id: cat?.name ?? "অন্যান্য", title: cat?.name ?? "অন্যান্য", list: [] };
      g.list.push({ slug: a.slug, name: a.name, n: a.productCount, color: COLORS[g.list.length % COLORS.length] });
      map.set(key, g);
    }
    return [...map.values()];
  }, [q.data]);

  const chips = ["সব", ...groups.map((g) => g.id)];

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
      {!groups.length ? <div className="empty">{q.isLoading ? "লোড হচ্ছে…" : "কোনো লেখক নেই"}</div> : null}
      {groups.filter((g) => filter === "সব" || g.id === filter).map((g) => (
        <section className="author-block" key={g.id}>
          <div className="author-block-head">
            <div>
              <div className="kicker"><i></i> ক্যাটাগরি</div>
              <h3>{g.title}</h3>
            </div>
            <span className="count">{bn(g.list.length)} জন লেখক</span>
          </div>
          <div className="authors">
            {g.list.map((a) => (
              <Link key={a.slug} className="author-card" href={`/authors/${encodeURIComponent(a.slug)}`}>
                <span className="author-tag">{g.title}</span>
                <div className="author-av" style={{ background: a.color }}>{a.name.slice(0, 1)}</div>
                <h3>{a.name}</h3>
                <div className="meta">{bn(a.n)}টি বই</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
