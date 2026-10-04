"use client";

import Link from "next/link";
import { PackCard } from "@/components/catalog/pack-card";
import { BundleShowcase } from "@/components/home/bundle-showcase";
import { EmptyState } from "@/components/storefront/empty-state";
import { GGift } from "@/components/storefront/glyphs";
import { PageHero } from "@/components/storefront/page-head";
import { SkeletonGrid } from "@/components/storefront/skeleton";
import { useBundles } from "@/lib/api/catalog";
import { useSection } from "@/lib/api/section";
import { bn } from "@/lib/format";

export default function PacksPage() {
  const { code } = useSection();
  const q = useBundles({ section: code, pageSize: 60 });
  const packs = q.data?.items ?? [];
  const saving = packs.reduce((m, p) => Math.max(m, p.savingPct || 0), 0);
  const featured = packs.length > 2;
  const rest = featured ? packs.slice(5) : packs;
  return (
    <div className="wrap sf-packs" style={{ paddingBottom: 48 }}>
      <PageHero
        crumbs={[{ label: "হোম", href: "/" }, { label: "প্যাকেজ" }]}
        kicker="একসাথে কিনলে সাশ্রয়"
        icon={<GGift size={16} />}
        title={code === "book" ? "বইয়ের প্যাকেজ" : "প্যাকেজ"}
        sub="একসাথে কয়েকটা — স্ট্যাক দেখে বেছে নিন, আলাদা কেনার চেয়ে কম দামে।"
        aside={packs.length ? (
          <>
            <span className="sf-stat-chip"><b>{bn(packs.length)}</b><small>প্যাকেজ</small></span>
            {saving ? <span className="sf-stat-chip"><b>{bn(saving)}%</b><small>পর্যন্ত সাশ্রয়</small></span> : null}
          </>
        ) : null}
      />
      {q.isLoading && !packs.length ? <SkeletonGrid n={8} /> : !packs.length ? (
        <EmptyState art="box" title="এই বিভাগে এখনো প্যাকেজ নেই" text="শীঘ্রই নতুন প্যাকেজ আসছে। ততক্ষণ পছন্দের পণ্য আলাদা করে দেখুন।">
          <Link className="btn btn-primary" href="/shop">ক্যাটালগ দেখুন</Link>
        </EmptyState>
      ) : (
        <>
          {featured ? <BundleShowcase packs={packs.slice(0, 5)} sectionCode={code} bare /> : null}
          {rest.length ? (
            <>
              {featured ? <div className="sf-bhead"><div><p className="sf-bkick"><i />আরও</p><h2>সব প্যাকেজ</h2></div></div> : null}
              <div className="grid sf-packs-grid">
                {rest.map((p) => <PackCard key={p.id} pack={p} />)}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
