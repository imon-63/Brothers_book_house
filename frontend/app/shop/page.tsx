"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { shopHref, useProducts, type ProductQuery } from "@/lib/api/catalog";
import { useSection } from "@/lib/api/section";
import { bn } from "@/lib/format";

const SORT: Record<string, ProductQuery["sort"]> = { pop: "popular", low: "price_asc", high: "price_desc" };

function ShopBody() {
  const { section: meta, code: vertical, findCat } = useSection();
  const params = useSearchParams();
  const router = useRouter();
  const catSlug = params.get("cat") || "";
  const subSlug = params.get("sub") || "";
  const q = (params.get("q") || "").trim();
  const [sort, setSort] = useState("pop");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const tree = meta.tree;
  // old links used names — resolve either slug or name
  const hitCat = catSlug ? findCat(catSlug) ?? (() => { const node = tree.find((n) => n.name === catSlug); return node ? { node, sub: null } : null; })() : null;
  const catNode = hitCat?.node ?? null;
  const subNode = subSlug ? catNode?.subs.find((x) => x.slug === subSlug || x.name === subSlug) ?? null : hitCat?.sub ?? null;
  const cat = catNode?.name ?? "";
  const sub = subNode?.name ?? "";
  const { data, isLoading } = useProducts({
    section: vertical, category: catNode?.slug, subcategory: subNode?.slug, q: q || undefined,
    sort: q && sort === "pop" ? "relevance" : SORT[sort], page, pageSize,
  });
  const slice = data?.items ?? [];
  const totalN = data?.total ?? 0;
  const pages = Math.max(1, data?.pages ?? 1);
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const from = totalN ? start + 1 : 0;
  const to = start + slice.length;
  const filtered = { length: totalN };
  const productsCount = tree.reduce((s2, n) => s2 + n.count, 0);

  function pick(nextCat: string, nextSub?: string) {
    setPage(1);
    router.push(shopHref(nextCat, nextSub));
  }

  return (
    <div className="wrap">
      <p className="crumb">
        হোম / ক্যাটাগরি
        {cat ? <> / <b>{sub || cat}</b></> : null}
      </p>
      <div className="section-head"><h2>{q ? "খোঁজ" : sub || cat || "ক্যাটাগরি"}</h2></div>
      <div className="shop-layout">
        <aside className="side">
          <h3>ক্যাটাগরি</h3>
          {tree.map((node) => (
            <div key={node.slug}>
              <button type="button" className={`filt${cat === node.name && !sub ? " on" : ""}`} onClick={() => pick(node.slug)}>
                {node.name}<span>{bn(node.count + node.subs.reduce((s2, x) => s2 + x.count, 0))}</span>
              </button>
              {node.subs.map((x) => (
                <button key={x.slug} type="button" className={`filt kid${cat === node.name && sub === x.name ? " on" : ""}`} onClick={() => pick(node.slug, x.slug)}>
                  {x.name}<span>{bn(x.count)}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>
        <div>
          <div className="shop-tools">
            <span>{bn(from)}–{bn(to)} / {bn(filtered.length)}{vertical === "book" ? "টি বই" : vertical === "gadget" ? "টি আইটেম" : "টি পণ্য"}</span>
            <div className="tool-right">
              <label className="size-lab">প্রতি পৃষ্ঠায়
                <select className="inline" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{bn(n)}</option>)}
                </select>
              </label>
              <select className="inline" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                <option value="pop">বেশি বিক্রি</option>
                <option value="low">দাম: কম → বেশি</option>
                <option value="high">দাম: বেশি → কম</option>
              </select>
            </div>
          </div>
          <div className="grid">
            {slice.length ? slice.map((p, i) => <ProductCard key={p.id} product={p} index={i} />) : <div className="empty" style={{ gridColumn: "1 / -1" }}>{isLoading ? "লোড হচ্ছে…" : vertical === "book" ? "এই ক্যাটাগরিতে বই নেই" : "এই ক্যাটাগরিতে পণ্য নেই"}</div>}
          </div>
          <div className="pager">
            <div className="pager-info">পৃষ্ঠা <b>{bn(current)}</b> / {bn(pages)}</div>
            <div className="pager-btns">
              <button className="pg" type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>‹</button>
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <button key={n} className={`pg${n === current ? " on" : ""}`} type="button" onClick={() => setPage(n)}>{bn(n)}</button>
              ))}
              <button className="pg" type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense>
      <ShopBody />
    </Suspense>
  );
}
