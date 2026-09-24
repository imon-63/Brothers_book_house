"use client";

import { useRouter } from "next/navigation";
import { DealChip } from "@/components/catalog/deal-chip";
import { offerOf } from "@/lib/catalog/offer";
import type { Product } from "@/lib/catalog/types";
import { bn, discount, inStock } from "@/lib/format";
import { addLine } from "@/store/slices/cart-slice";
import { setMiniCart, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch } from "@/store/hooks";
import { useWait } from "@/components/catalog/use-wait";
import { IconCart } from "@/components/icons";

export function LikeCard({ product }: { product: Product }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { saved, toggle } = useWait();
  const kept = saved("book", product.id);
  const oos = !inStock(product.stock);
  const offer = offerOf(product);
  const off = discount(offer.price, offer.old);
  const hover = Boolean(product.image2 && product.image2 !== product.image);

  return (
    <article className="like-card">
      <div
        className={`like-pic${hover ? " has-hover" : ""}`}
        onClick={() => router.push(`/product/${product.id}`)}
        style={product.image ? undefined : { background: product.color }}
      >
        {off && !oos ? <span className="like-off">-{bn(off)}%</span> : null}
        {offer.on ? <DealChip until={offer.until} face="mini" /> : null}
        {product.image ? (
          <>
            <img className="pic-a" src={product.image} alt="" />
            {hover ? <img className="pic-b" src={product.image2} alt="" aria-hidden /> : null}
          </>
        ) : (
          <div style={{ position: "absolute", inset: 12, display: "flex", alignItems: "flex-end", color: "#fff", fontWeight: 700 }}>{product.title}</div>
        )}
      </div>
      <h3 onClick={() => router.push(`/product/${product.id}`)}>{product.title}</h3>
      <div className="like-price">
        {offer.old > offer.price ? <s>৳{bn(offer.old)}</s> : null}
        <b>৳{bn(offer.price)}</b>
      </div>
      <button
        type="button"
        className={`slide-add${oos ? ` wait${kept ? " on" : ""}` : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (oos) { toggle("book", product.id); return; }
          dispatch(addLine({ kind: "book", id: product.id }));
          dispatch(showToast("কার্টে যোগ হয়েছে"));
          dispatch(setMiniCart(true));
        }}
      >
        {oos ? (kept ? "রাখা হয়েছে" : "তালিকায়") : <><IconCart /> কার্টে যোগ</>}
      </button>
    </article>
  );
}

export function AlsoStrip({ products, pill, mini }: { products: Product[]; pill?: string; mini?: boolean }) {
  if (!products.length) return null;
  const dur = Math.max(mini ? 18 : 24, products.length * 4);
  return (
    <div className={`also-wrap${mini ? " minicart-also" : ""}`} style={{ ["--also-dur" as string]: `${dur}s` }}>
      {pill ? <span className="also-pill">{pill}</span> : null}
      <div className="also-mask">
        <div className="also-track">
          <div className="also-set">{products.map((p) => <LikeCard key={p.id} product={p} />)}</div>
          <div className="also-set" aria-hidden>{products.map((p) => <LikeCard key={`b-${p.id}`} product={p} />)}</div>
        </div>
      </div>
    </div>
  );
}
