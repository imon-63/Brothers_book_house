"use client";

import Link from "next/link";
import { Avatar } from "@/components/storefront/avatar";
import { Reveal } from "@/components/storefront/reveal";
import { TileSkeleton } from "@/components/storefront/skeleton";
import { useAuthors } from "@/lib/api/catalog";
import { bn } from "@/lib/format";
import { BlockHead } from "./blocks";

/** Book section only: the most-read authors as initials/photo cards. */
export function AuthorsSpotlight() {
  const q = useAuthors({ section: "book", pageSize: 12 });
  const list = [...(q.data?.items ?? [])].sort((a, b) => b.soldCount - a.soldCount).slice(0, 8);
  if (!q.isLoading && !list.length) return null;
  return (
    <Reveal className="wrap sf-spot" aria-labelledby="sf-spot-h">
      <BlockHead kicker="পাঠকের প্রিয়" title="লেখক স্পটলাইট" href="/authors" more="সব লেখক" id="sf-spot-h" />
      {q.isLoading ? <TileSkeleton n={6} className="sf-spot-row" /> : (
        <div className="sf-spot-row sf-stagger-kids">
          {list.map((a, i) => (
            <Link key={a.id} href={`/authors/${encodeURIComponent(a.slug)}`} className="sf-spot-card" style={{ ["--i" as string]: i }}>
              <span className="sf-spot-rank" aria-hidden="true">{bn(i + 1)}</span>
              <Avatar name={a.name} photo={a.photoUrl} size={68} />
              <b>{a.name}</b>
              <small>{bn(a.productCount)}টি বই{a.soldCount ? ` · ${bn(a.soldCount)}+ বিক্রি` : ""}</small>
              {a.categories[0] ? <span className="sf-spot-tag">{a.categories[0].name}</span> : null}
            </Link>
          ))}
        </div>
      )}
    </Reveal>
  );
}
