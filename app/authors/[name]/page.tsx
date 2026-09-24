"use client";

import Link from "next/link";
import { use } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { bn } from "@/lib/format";
import { useAppSelector } from "@/store/hooks";

export default function AuthorPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const author = decodeURIComponent(name);
  const books = useAppSelector((s) => s.shop.products.filter((p) => p.vertical === "book" && p.author === author));
  return (
    <div className="wrap" style={{ paddingBottom: 48 }}>
      <p className="crumb">হোম / <Link href="/authors">লেখক</Link> / <b>{author}</b></p>
      <div className="author-hero">
        <div className="author-av" style={{ background: books[0]?.color || "#7A2430" }}>{author.slice(0, 1)}</div>
        <div>
          <h2>{author}</h2>
          <div className="meta">{bn(books.length)}টি বই</div>
        </div>
      </div>
      <div className="grid">
        {books.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
}
