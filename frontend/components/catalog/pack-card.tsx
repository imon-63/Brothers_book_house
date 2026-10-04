"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { packHref, type Pack } from "@/lib/api/catalog";
import { bn, discount } from "@/lib/format";
import { useAddToCart, useWait } from "@/lib/api/shop";
import { IconCart } from "@/components/icons";

export function PackSpines({ books }: { books: { id: string | number; title: string; color: string; image?: string }[] }) {
  return books.slice(0, 3).map((b) => (
    b.image
      ? <div key={b.id} className="ps has-pic"><img src={b.image} alt="" /></div>
      : <div key={b.id} className="ps" style={{ background: b.color }}>{b.title}</div>
  ));
}

export function PackCard({ pack }: { pack: Pack }) {
  const router = useRouter();
  const addToCart = useAddToCart();
  const { saved, toggle } = useWait();
  const kept = saved("pack", pack.id);
  const books = pack.books;
  const oos = pack.oos;
  const off = discount(pack.price, pack.old);
  const href = packHref(pack);
  const unit = pack.vertical === "book" ? "বই" : "পণ্য";
  const saving = pack.saving || (pack.old > pack.price ? pack.old - pack.price : 0);

  function add(e: React.MouseEvent) {
    e.stopPropagation();
    if (oos) return;
    void addToCart("pack", pack.id);
  }

  return (
    <article className={`pkg sf-pk${oos ? " oos" : ""}`}>
      {off && !oos ? <span className="sale-badge">-{bn(off)}%</span> : null}
      <div
        className="pkg-stack"
        role="link"
        tabIndex={0}
        aria-label={`${pack.title} · ${bn(books.length)}টি ${unit}`}
        onClick={() => router.push(href)}
        onKeyDown={(e) => { if (e.key === "Enter") router.push(href); }}
        style={{ cursor: "pointer" }}
      >
        <PackSpines books={books} />
        {pack.freeShipping && !oos ? <span className="sf-pk-free">ফ্রি ডেলিভারি</span> : null}
        {oos ? (
          <>
            <span className="ribbon stock">স্টক আউট</span>
            <span className="stamp">স্টক আউট</span>
          </>
        ) : null}
      </div>
      <div className="card-body">
        <h3><Link href={href} prefetch={false}>{pack.title}</Link></h3>
        <div className="author">{bn(books.length)}টি {unit}{oos ? " · স্টক আউট" : saving ? ` · ৳${bn(saving)} সাশ্রয়` : ""}</div>
        <div className="card-foot">
          <div className="price-switch">
            <div className="price">
              ৳{bn(pack.price)}
              {pack.old > pack.price ? <span className="old">৳{bn(pack.old)}</span> : null}
            </div>
          </div>
          <button type="button" className={`slide-add${oos ? ` wait${kept ? " on" : ""}` : ""}`} onClick={oos ? (e) => { e.stopPropagation(); toggle("pack", pack.id); } : add}>
            {oos ? (kept ? "রাখা হয়েছে" : "তালিকায়") : <><IconCart /> কার্টে যোগ</>}
          </button>
        </div>
      </div>
    </article>
  );
}
