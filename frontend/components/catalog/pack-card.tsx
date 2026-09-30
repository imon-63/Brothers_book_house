"use client";

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

  function add(e: React.MouseEvent) {
    e.stopPropagation();
    if (oos) return;
    void addToCart("pack", pack.id);
  }

  return (
    <article className={`pkg${oos ? " oos" : ""}`}>
      {off && !oos ? <span className="sale-badge">-{bn(off)}%</span> : null}
      <div className="pkg-stack" onClick={() => router.push(packHref(pack))} style={{ cursor: "pointer" }}>
        <PackSpines books={books} />
        {oos ? (
          <>
            <span className="ribbon stock">স্টক আউট</span>
            <span className="stamp">স্টক আউট</span>
          </>
        ) : null}
      </div>
      <div className="card-body">
        <h3 onClick={() => router.push(packHref(pack))} style={{ cursor: "pointer" }}>{pack.title}</h3>
        <div className="author">{bn(books.length)}টি বই{oos ? " · স্টক আউট" : ""}</div>
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
