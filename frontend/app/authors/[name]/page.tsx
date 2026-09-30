"use client";

import Link from "next/link";
import { use } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { useAuthor } from "@/lib/api/catalog";
import { bn } from "@/lib/format";

export default function AuthorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const slug = decodeURIComponent(name);
  const q = useAuthor(slug, { pageSize: 60 });
  const a = q.data;
  const books = a?.books ?? [];
  const title = a?.name ?? slug;
  return (
    <div className="wrap" style={{ paddingBottom: 48 }}>
      <p className="crumb">হোম / <Link href="/authors">লেখক</Link> / <b>{title}</b></p>
      <div className="author-hero">
        <div className="author-av" style={{ background: books[0]?.color || "#7A2430" }}>{a?.photoUrl ? <img src={a.photoUrl} alt="" /> : title.slice(0, 1)}</div>
        <div>
          <h2>{title}</h2>
          <div className="meta">{q.isLoading ? "লোড হচ্ছে…" : `${bn(a?.products.total ?? books.length)}টি বই`}</div>
          {a?.bio ? <p className="lead">{a.bio}</p> : null}
        </div>
      </div>
      <div className="grid">
        {books.map((p) => <ProductCard key={p.id} product={p} />)}
        {!q.isLoading && !books.length ? <div className="empty" style={{ gridColumn: "1 / -1" }}>এই লেখকের কোনো বই পাওয়া যায়নি</div> : null}
      </div>
    </div>
  );
}
