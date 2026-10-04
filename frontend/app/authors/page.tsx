"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/storefront/avatar";
import { EmptyState } from "@/components/storefront/empty-state";
import { GBook, GSearch } from "@/components/storefront/glyphs";
import { PageHero } from "@/components/storefront/page-head";
import { TileSkeleton } from "@/components/storefront/skeleton";
import { useAuthors } from "@/lib/api/catalog";
import { bn } from "@/lib/format";

export default function AuthorsPage() {
  const [filter, setFilter] = useState("সব");
  const [find, setFind] = useState("");
  const q = useAuthors({ section: "book", pageSize: 100 });
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; title: string; list: { slug: string; name: string; n: number; sold: number; photo: string | null }[] }>();
    for (const a of q.data?.items ?? []) {
      const cat = a.categories[0];
      const key = cat?.slug ?? "other";
      const g = map.get(key) ?? { id: cat?.name ?? "অন্যান্য", title: cat?.name ?? "অন্যান্য", list: [] };
      g.list.push({ slug: a.slug, name: a.name, n: a.productCount, sold: a.soldCount, photo: a.photoUrl });
      map.set(key, g);
    }
    return [...map.values()];
  }, [q.data]);

  const chips = ["সব", ...groups.map((g) => g.id)];
  const needle = find.trim().toLowerCase();
  const shown = groups
    .filter((g) => filter === "সব" || g.id === filter)
    .map((g) => ({ ...g, list: needle ? g.list.filter((a) => a.name.toLowerCase().includes(needle)) : g.list }))
    .filter((g) => g.list.length);
  const total = q.data?.items.length ?? 0;
  const books = (q.data?.items ?? []).reduce((s, a) => s + a.productCount, 0);

  return (
    <div className="wrap sf-authors" style={{ paddingBottom: 48 }}>
      <PageHero
        crumbs={[{ label: "হোম", href: "/" }, { label: "লেখক" }]}
        kicker="প্রিয় লেখক"
        icon={<GBook size={16} />}
        title="লেখক"
        sub="ক্যাটাগরি বেছে লেখক দেখুন, তারপর তাঁর বই।"
        aside={total ? (
          <>
            <span className="sf-stat-chip"><b>{bn(total)}</b><small>লেখক</small></span>
            <span className="sf-stat-chip"><b>{bn(books)}</b><small>বই</small></span>
          </>
        ) : null}
      />
      <div className="sf-authors-tools">
        <label className="sf-authors-find">
          <GSearch size={18} />
          <span className="sf-sr">লেখক খুঁজুন</span>
          <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="লেখকের নাম লিখুন" />
        </label>
        <div className="author-chips sf-author-chips" role="tablist" aria-label="ক্যাটাগরি">
          {chips.map((id) => (
            <button key={id} type="button" role="tab" aria-selected={filter === id} className={`author-chip${filter === id ? " on" : ""}`} onClick={() => setFilter(id)}>{id}</button>
          ))}
        </div>
      </div>
      {q.isLoading ? <TileSkeleton n={10} className="authors sf-author-grid" /> : !shown.length ? (
        <EmptyState art={needle ? "search" : "book"} title={needle ? `“${find.trim()}” নামে কোনো লেখক নেই` : "কোনো লেখক নেই"} text="বানান বদলে বা অন্য ক্যাটাগরিতে খুঁজে দেখুন।">
          {needle || filter !== "সব" ? <button className="btn btn-primary" type="button" onClick={() => { setFind(""); setFilter("সব"); }}>সব লেখক দেখুন</button> : null}
        </EmptyState>
      ) : shown.map((g) => (
        <section className="author-block sf-author-block" key={g.id} aria-label={g.title}>
          <div className="author-block-head">
            <div>
              <div className="kicker"><i></i> ক্যাটাগরি</div>
              <h3>{g.title}</h3>
            </div>
            <span className="count">{bn(g.list.length)} জন লেখক</span>
          </div>
          <div className="authors sf-author-grid">
            {g.list.map((a) => (
              <Link key={a.slug} className="author-card sf-author-card" href={`/authors/${encodeURIComponent(a.slug)}`}>
                <Avatar name={a.name} photo={a.photo} size={76} />
                <h3>{a.name}</h3>
                <div className="meta">{bn(a.n)}টি বই{a.sold ? ` · ${bn(a.sold)}+ বিক্রি` : ""}</div>
                <span className="sf-author-go">বই দেখুন →</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
