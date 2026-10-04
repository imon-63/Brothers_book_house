"use client";

import Link from "next/link";
import { use } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { Avatar } from "@/components/storefront/avatar";
import { EmptyState } from "@/components/storefront/empty-state";
import { Crumbs } from "@/components/storefront/page-head";
import { SkeletonGrid } from "@/components/storefront/skeleton";
import { useAuthor } from "@/lib/api/catalog";
import { bn } from "@/lib/format";

export default function AuthorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const slug = decodeURIComponent(name);
  const q = useAuthor(slug, { pageSize: 60 });
  const a = q.data;
  const books = a?.books ?? [];
  const title = a?.name ?? slug;
  const cats = [...new Set(books.map((b) => b.cat).filter(Boolean))].slice(0, 5);
  const sold = books.reduce((s, b) => s + (b.sold || 0), 0);
  const inStock = books.filter((b) => !b.oos).length;
  return (
    <div className="wrap sf-author-page" style={{ paddingBottom: 48 }}>
      <header className="sf-ahero">
        <span className="sf-phero-orb a" aria-hidden="true" />
        <div className="sf-ahero-in">
          <Crumbs items={[{ label: "হোম", href: "/" }, { label: "লেখক", href: "/authors" }, { label: title }]} />
          <div className="sf-ahero-row">
            <Avatar name={title} photo={a?.photoUrl} size={112} className="sf-ahero-av" />
            <div className="sf-ahero-copy">
              <p className="sf-phero-kick"><i />লেখক</p>
              <h1>{title}</h1>
              {a?.bio ? <p className="sf-ahero-bio">{a.bio}</p> : null}
              {cats.length ? <div className="sf-ahero-tags">{cats.map((c) => <span key={c}>{c}</span>)}</div> : null}
            </div>
            <div className="sf-phero-aside">
              <span className="sf-stat-chip"><b>{q.isLoading ? "—" : bn(a?.products.total ?? books.length)}</b><small>বই</small></span>
              {inStock ? <span className="sf-stat-chip"><b>{bn(inStock)}</b><small>স্টকে</small></span> : null}
              {sold ? <span className="sf-stat-chip"><b>{bn(sold)}+</b><small>বিক্রি</small></span> : null}
            </div>
          </div>
        </div>
      </header>
      {q.isLoading ? <SkeletonGrid n={8} /> : books.length ? (
        <>
          <div className="sf-bhead"><div><p className="sf-bkick"><i />সংগ্রহ</p><h2>{title}-এর বই</h2></div></div>
          <div className="grid">
            {books.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
          </div>
        </>
      ) : (
        <EmptyState art="book" title="এই লেখকের কোনো বই পাওয়া যায়নি" text="অন্য লেখকদের বই ঘুরে দেখুন।">
          <Link className="btn btn-primary" href="/authors">সব লেখক</Link>
        </EmptyState>
      )}
    </div>
  );
}
