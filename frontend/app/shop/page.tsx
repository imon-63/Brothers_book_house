"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ProductCard } from "@/components/catalog/product-card";
import { SectionGlyph } from "@/components/icons";
import { EmptyState } from "@/components/storefront/empty-state";
import { GFilter, GX } from "@/components/storefront/glyphs";
import { PageHero } from "@/components/storefront/page-head";
import { SkeletonGrid } from "@/components/storefront/skeleton";
import { shopHref, useProducts, type ProductQuery } from "@/lib/api/catalog";
import { useSection } from "@/lib/api/section";
import { bn } from "@/lib/format";

const SORT: Record<string, ProductQuery["sort"]> = { pop: "popular", new: "new", low: "price_asc", high: "price_desc", rate: "rating" };
const SORT_LABEL: Record<string, string> = { pop: "বেশি বিক্রি", new: "নতুন আগে", low: "দাম: কম → বেশি", high: "দাম: বেশি → কম", rate: "রেটিং" };

/** Page numbers with gaps: 1 … 4 5 6 … 12 */
function pageList(cur: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, cur - 1), to = Math.min(total - 1, cur + 1);
  if (from > 2) out.push("gap");
  for (let n = from; n <= to; n++) out.push(n);
  if (to < total - 1) out.push("gap");
  out.push(total);
  return out;
}

/** Static shell (same on server and first client paint) so cached data never causes a hydration mismatch. */
function ShopShell() {
  return (
    <div className="wrap sf-shop">
      <PageHero crumbs={[{ label: "হোম", href: "/" }, { label: "ক্যাটাগরি" }]} kicker="ক্যাটালগ" title="ক্যাটাগরি" sub="পণ্য খোঁজা হচ্ছে…" />
      <div className="sf-shop-body">
        <aside className="sf-side" aria-hidden="true"><div className="sf-side-block">{Array.from({ length: 8 }, (_, i) => <i key={i} className="sf-skel sf-skel-line" style={{ margin: "12px 6px" }} />)}</div></aside>
        <div className="sf-shop-main"><div className="sf-toolbar"><span className="sf-count">লোড হচ্ছে…</span></div><SkeletonGrid n={8} /></div>
      </div>
    </div>
  );
}

function ShopGate() {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return ready ? <ShopBody /> : <ShopShell />;
}

function ShopBody() {
  const { section: meta, code: vertical, findCat, loading: sectionsLoading } = useSection();
  const params = useSearchParams();
  const router = useRouter();
  const catSlug = params.get("cat") || "";
  const subSlug = params.get("sub") || "";
  const q = (params.get("q") || "").trim();
  const [sort, setSort] = useState("pop");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [inStock, setInStock] = useState(false);
  const [onDeal, setOnDeal] = useState(() => params.get("deal") === "1");
  const [sheet, setSheet] = useState(false);
  const tree = meta.tree;
  // old links used names — resolve either slug or name
  const hitCat = catSlug ? findCat(catSlug) ?? (() => { const node = tree.find((n) => n.name === catSlug); return node ? { node, sub: null } : null; })() : null;
  const catNode = hitCat?.node ?? null;
  const subNode = subSlug ? catNode?.subs.find((x) => x.slug === subSlug || x.name === subSlug) ?? null : hitCat?.sub ?? null;
  const cat = catNode?.name ?? "";
  const sub = subNode?.name ?? "";
  const { data, isLoading, isFetching } = useProducts({
    section: vertical, category: catNode?.slug, subcategory: subNode?.slug, q: q || undefined,
    sort: q && sort === "pop" ? "relevance" : SORT[sort], page, pageSize,
    inStock: inStock || undefined, onDeal: onDeal || undefined,
  });
  const slice = data?.items ?? [];
  const totalN = data?.total ?? 0;
  const pages = Math.max(1, data?.pages ?? 1);
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  const from = totalN ? start + 1 : 0;
  const to = start + slice.length;
  const unit = vertical === "book" ? "টি বই" : vertical === "gadget" ? "টি আইটেম" : "টি পণ্য";
  const loading = (isLoading || sectionsLoading) && !slice.length;
  const title = q ? `“${q}” খোঁজের ফল` : sub || cat || "সব ক্যাটাগরি";

  useEffect(() => { setPage(1); }, [catSlug, subSlug, q]);
  useEffect(() => {
    document.body.classList.toggle("sf-lock", sheet);
    if (!sheet) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); document.body.classList.remove("sf-lock"); };
  }, [sheet]);

  function pick(nextCat: string, nextSub?: string) {
    setPage(1);
    setSheet(false);
    router.push(nextCat ? shopHref(nextCat, nextSub) : "/shop");
  }
  function go(n: number) {
    setPage(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const crumbs = [{ label: "হোম", href: "/" }, { label: "ক্যাটাগরি", href: "/shop" }, ...(cat ? [{ label: cat, href: shopHref(catNode!.slug) }] : []), ...(sub ? [{ label: sub }] : []), ...(q ? [{ label: "খোঁজ" }] : [])];
  const active = [
    ...(onDeal ? [{ k: "deal", t: "ছাড় চলছে", off: () => { setOnDeal(false); setPage(1); } }] : []),
    ...(inStock ? [{ k: "stock", t: "শুধু স্টকে আছে", off: () => { setInStock(false); setPage(1); } }] : []),
    ...(q ? [{ k: "q", t: `খোঁজ: ${q}`, off: () => router.push(cat ? shopHref(catNode!.slug, subNode?.slug) : "/shop") }] : []),
  ];

  const filters = (
    <>
      <div className="sf-side-block">
        <h3>ক্যাটাগরি</h3>
        <button type="button" className={`sf-filt${!cat ? " on" : ""}`} onClick={() => pick("")}>
          <span>সব {meta.name}</span><em>{bn(tree.reduce((s, n) => s + n.count + n.subs.reduce((a, x) => a + x.count, 0), 0))}</em>
        </button>
        {tree.map((node) => (
          <div key={node.slug} className="sf-filt-group">
            <button type="button" className={`sf-filt${cat === node.name && !sub ? " on" : ""}`} aria-current={cat === node.name && !sub ? "page" : undefined} onClick={() => pick(node.slug)}>
              <span>{node.name}</span><em>{bn(node.count + node.subs.reduce((s2, x) => s2 + x.count, 0))}</em>
            </button>
            {node.subs.length && cat === node.name ? node.subs.map((x) => (
              <button key={x.slug} type="button" className={`sf-filt kid${sub === x.name ? " on" : ""}`} aria-current={sub === x.name ? "page" : undefined} onClick={() => pick(node.slug, x.slug)}>
                <span>{x.name}</span><em>{bn(x.count)}</em>
              </button>
            )) : null}
          </div>
        ))}
      </div>
      <div className="sf-side-block">
        <h3>ফিল্টার</h3>
        <label className="pk-switch sf-tog">
          <input type="checkbox" checked={inStock} onChange={(e) => { setInStock(e.target.checked); setPage(1); }} />
          <span className="sw" aria-hidden="true" /> শুধু স্টকে আছে
        </label>
        <label className="pk-switch sf-tog">
          <input type="checkbox" checked={onDeal} onChange={(e) => { setOnDeal(e.target.checked); setPage(1); }} />
          <span className="sw" aria-hidden="true" /> ছাড় চলছে
        </label>
      </div>
      <div className="sf-side-block">
        <h3>সাজান</h3>
        <div className="sf-sort-pills" role="radiogroup" aria-label="সাজান">
          {Object.keys(SORT).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={sort === k} className={sort === k ? "on" : ""} onClick={() => { setSort(k); setPage(1); }}>{SORT_LABEL[k]}</button>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="wrap sf-shop">
      <PageHero
        crumbs={crumbs}
        kicker={meta.name || "ক্যাটালগ"}
        icon={<SectionGlyph code={vertical} icon={meta.icon} />}
        title={title}
        sub={loading ? "পণ্য খোঁজা হচ্ছে…" : totalN ? `${bn(totalN)}${unit} পাওয়া গেছে${onDeal ? " · ছাড়ে" : ""}` : "এই মুহূর্তে কিছু মেলেনি"}
      >
        {catNode && catNode.subs.length ? (
          <div className="sf-subchips" aria-label="উপ-ক্যাটাগরি">
            <button type="button" className={!sub ? "on" : ""} onClick={() => pick(catNode.slug)}>সব</button>
            {catNode.subs.map((x) => (
              <button key={x.slug} type="button" className={sub === x.name ? "on" : ""} onClick={() => pick(catNode.slug, x.slug)}>{x.name} <small>{bn(x.count)}</small></button>
            ))}
          </div>
        ) : !cat && tree.length ? (
          <div className="sf-subchips" aria-label="ক্যাটাগরি">
            {tree.slice(0, 10).map((n) => <button key={n.slug} type="button" onClick={() => pick(n.slug)}>{n.name}</button>)}
          </div>
        ) : null}
      </PageHero>
      <div className="sf-shop-body">
        <aside className="sf-side" aria-label="ফিল্টার">{filters}</aside>
        <div className="sf-shop-main">
          <div className="sf-toolbar">
            <button type="button" className="sf-filter-btn" onClick={() => setSheet(true)} aria-haspopup="dialog">
              <GFilter size={18} /> ফিল্টার{active.length ? <b>{bn(active.length)}</b> : null}
            </button>
            <span className="sf-count" aria-live="polite">
              {totalN ? <><b>{bn(from)}–{bn(to)}</b> / {bn(totalN)}{unit}</> : loading ? "লোড হচ্ছে…" : `০${unit}`}
            </span>
            <div className="sf-tool-right">
              <label className="sf-select">
                <span>সাজান</span>
                <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                  {Object.keys(SORT).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
                </select>
              </label>
              <label className="sf-select sf-hide-sm">
                <span>প্রতি পৃষ্ঠায়</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{bn(n)}</option>)}
                </select>
              </label>
            </div>
          </div>
          {active.length ? (
            <div className="sf-active">
              {active.map((a) => (
                <button key={a.k} type="button" onClick={a.off} aria-label={`${a.t} সরান`}>{a.t} <GX size={14} /></button>
              ))}
            </div>
          ) : null}
          {loading ? <SkeletonGrid n={8} /> : slice.length ? (
            <div className={`grid sf-grid${isFetching ? " is-busy" : ""}`} aria-busy={isFetching}>
              {slice.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
            </div>
          ) : (
            <EmptyState
              art={q ? "search" : "box"}
              title={q ? `“${q}” দিয়ে কিছু মেলেনি` : vertical === "book" ? "এই ক্যাটাগরিতে বই নেই" : "এই ক্যাটাগরিতে পণ্য নেই"}
              text={active.length ? "কিছু ফিল্টার সরিয়ে আবার দেখুন, অথবা অন্য ক্যাটাগরি বেছে নিন।" : "বানান একটু বদলে খুঁজুন, অথবা অন্য ক্যাটাগরি ঘুরে দেখুন।"}
            >
              {active.length ? <button type="button" className="btn btn-primary" onClick={() => { setInStock(false); setOnDeal(false); setPage(1); }}>ফিল্টার মুছুন</button> : null}
              <Link className="btn btn-ghost sf-btn-ghost" href="/shop">সব ক্যাটাগরি</Link>
            </EmptyState>
          )}
          {pages > 1 ? (
            <nav className="sf-pager" aria-label="পৃষ্ঠা">
              <button className="sf-pg wide" type="button" disabled={current === 1} onClick={() => go(current - 1)}>‹ আগের</button>
              {pageList(current, pages).map((n, i) => n === "gap"
                ? <span key={`g${i}`} className="sf-pg-gap" aria-hidden="true">…</span>
                : <button key={n} className={`sf-pg${n === current ? " on" : ""}`} type="button" aria-current={n === current ? "page" : undefined} aria-label={`পৃষ্ঠা ${bn(n)}`} onClick={() => go(n)}>{bn(n)}</button>)}
              <button className="sf-pg wide" type="button" disabled={current === pages} onClick={() => go(current + 1)}>পরের ›</button>
            </nav>
          ) : null}
        </div>
      </div>
      <div className={`sf-sheet${sheet ? " on" : ""}`} aria-hidden={!sheet}>
        <button type="button" className="sf-sheet-back" aria-label="বন্ধ" tabIndex={sheet ? 0 : -1} onClick={() => setSheet(false)} />
        <div className="sf-sheet-panel" role="dialog" aria-modal="true" aria-label="ফিল্টার">
          <div className="sf-sheet-head">
            <i className="sf-sheet-grip" aria-hidden="true" />
            <b>ফিল্টার ও সাজানো</b>
            <button type="button" className="sf-sheet-x" aria-label="বন্ধ" onClick={() => setSheet(false)}><GX size={18} /></button>
          </div>
          <div className="sf-sheet-body">{sheet ? filters : null}</div>
          <div className="sf-sheet-foot">
            <button type="button" className="btn btn-ghost" onClick={() => { setInStock(false); setOnDeal(false); setSort("pop"); setPage(1); }}>রিসেট</button>
            <button type="button" className="btn btn-primary" onClick={() => setSheet(false)}>{totalN ? `${bn(totalN)}${unit} দেখুন` : "দেখুন"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopShell />}>
      <ShopGate />
    </Suspense>
  );
}
