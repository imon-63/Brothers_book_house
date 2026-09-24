"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { catTree, hiddenMain, shopHref } from "@/lib/catalog/cats";
import { verticalById } from "@/lib/catalog/data";
import { useProducts } from "@/lib/catalog/use-catalog";
import { offerOf } from "@/lib/catalog/offer";
import { matchesQuery } from "@/lib/catalog/search";
import { bn } from "@/lib/format";
import { useAppSelector } from "@/store/hooks";

function ShopBody() {
  const vertical = useAppSelector((s) => s.ui.vertical);
  const meta = verticalById(vertical);
  const params = useSearchParams();
  const router = useRouter();
  const cat = params.get("cat") || "";
  const sub = params.get("sub") || "";
  const q = (params.get("q") || "").trim();
  const { data: all = [] } = useProducts(vertical);
  const extraCats = useAppSelector((s) => s.shop.extraCats);
  const hiddenCats = useAppSelector((s) => s.shop.hiddenCats);
  const products = all.filter((p) => !hiddenMain(hiddenCats, vertical, p.cat));
  const [sort, setSort] = useState("pop");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const tree = catTree(vertical, products, extraCats, hiddenCats);

  const filtered = useMemo(() => {
    let list = products.filter((p) => {
      if (cat && p.cat !== cat) return false;
      if (sub && p.sub !== sub) return false;
      if (q && !matchesQuery(`${p.title} ${p.author} ${p.cat} ${p.sub || ""} ${p.unit || ""} ${p.desc}`, q)) return false;
      return true;
    });
    if (sort === "low") list = [...list].sort((a, b) => offerOf(a).price - offerOf(b).price);
    if (sort === "high") list = [...list].sort((a, b) => offerOf(b).price - offerOf(a).price);
    return list;
  }, [products, cat, sub, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);
  const from = filtered.length ? start + 1 : 0;
  const to = start + slice.length;

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
            <div key={node.name}>
              <button type="button" className={`filt${cat === node.name && !sub ? " on" : ""}`} onClick={() => pick(node.name)}>
                {node.name}<span>{bn(products.filter((p) => p.cat === node.name).length)}</span>
              </button>
              {node.subs.map((s) => (
                <button key={s} type="button" className={`filt kid${cat === node.name && sub === s ? " on" : ""}`} onClick={() => pick(node.name, s)}>
                  {s}<span>{bn(products.filter((p) => p.cat === node.name && p.sub === s).length)}</span>
                </button>
              ))}
            </div>
          ))}
        </aside>
        <div>
          <div className="shop-tools">
            <span>{bn(from)}–{bn(to)} / {bn(filtered.length)}{meta.id === "book" ? "টি বই" : meta.id === "food" ? "টি পণ্য" : "টি আইটেম"}</span>
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
            {slice.length ? slice.map((p, i) => <ProductCard key={p.id} product={p} index={i} />) : <div className="empty" style={{ gridColumn: "1 / -1" }}>{meta.id === "book" ? "এই ক্যাটাগরিতে বই নেই" : "এই ক্যাটাগরিতে পণ্য নেই"}</div>}
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
