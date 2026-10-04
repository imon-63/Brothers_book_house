"use client";

import Link from "next/link";
import { Reveal } from "@/components/storefront/reveal";
import { GArrow } from "@/components/storefront/glyphs";
import { shopHref, type Product } from "@/lib/api/catalog";
import type { SectionView } from "@/lib/api/section";
import { bn } from "@/lib/format";
import { BlockHead } from "./blocks";

const TONES = ["#7A2430", "#3D5A4C", "#8A6230", "#5C1B24", "#245A6B", "#6B3A52"];

/** Category grid with product counts and a fan of real covers from that category. */
export function CategoryTiles({ section, products, loading }: { section: SectionView; products: Product[]; loading: boolean }) {
  const tree = section.tree;
  if (!tree.length) {
    if (!loading) return null;
    return (
      <div className="wrap sf-cats-wrap" aria-hidden="true">
        <div className="sf-cats">{Array.from({ length: 6 }, (_, i) => <i key={i} className="sf-skel sf-cat-skel" />)}</div>
      </div>
    );
  }
  const unit = section.code === "book" ? "টি বই" : "টি পণ্য";
  return (
    <Reveal className="wrap sf-cats-wrap" aria-labelledby="sf-cats-h">
      <BlockHead kicker={section.name} title="ক্যাটাগরি ঘুরে দেখুন" href="/shop" id="sf-cats-h" />
      <div className="sf-cats sf-stagger-kids">
        {tree.slice(0, 12).map((node, i) => {
          const count = node.count + node.subs.reduce((s, x) => s + x.count, 0);
          const covers = products.filter((p) => p.catSlug === node.slug && p.image).slice(0, 3);
          return (
            <Link key={node.slug} href={shopHref(node.slug)} className="sf-cat" style={{ ["--c" as string]: TONES[i % TONES.length], ["--i" as string]: i }}>
              <span className="sf-cat-art" aria-hidden="true">
                {covers.length ? covers.map((p, k) => (
                  <img key={p.id} src={p.image} alt="" style={{ ["--k" as string]: k - (covers.length - 1) / 2 }} />
                )) : <b>{node.name.slice(0, 1)}</b>}
              </span>
              <span className="sf-cat-txt">
                <b>{node.name}</b>
                <small>{count ? `${bn(count)}${unit}` : "শীঘ্রই আসছে"}{node.subs.length ? ` · ${bn(node.subs.length)}টি ভাগ` : ""}</small>
              </span>
              <span className="sf-cat-go" aria-hidden="true"><GArrow size={16} /></span>
            </Link>
          );
        })}
      </div>
    </Reveal>
  );
}
