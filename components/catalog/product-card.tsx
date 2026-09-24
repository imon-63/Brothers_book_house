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

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { saved, toggle } = useWait();
  const kept = saved("book", product.id);
  const oos = !inStock(product.stock);
  const offer = offerOf(product);
  const off = discount(offer.price, offer.old);
  const meta = product.vertical === "book" ? product.author : product.unit || product.author;
  const plain = product.vertical !== "book" ? " pic-plain" : "";
  const tight = product.vertical === "gadget" ? " pic-tight" : "";
  const hover = Boolean(product.image2 && product.image2 !== product.image);

  function open() {
    router.push(`/product/${product.id}`);
  }

  function add(e: React.MouseEvent) {
    e.stopPropagation();
    if (oos) return;
    dispatch(addLine({ kind: "book", id: product.id }));
    dispatch(showToast("কার্টে যোগ হয়েছে"));
    dispatch(setMiniCart(true));
  }

  return (
    <article className={`card${oos ? " oos" : ""}`} style={{ animationDelay: `${index * 50}ms` }}>
      <div className="card-media" onClick={open}>
        {off && !oos ? <span className="sale-badge">-{bn(off)}%</span> : null}
        {offer.on ? <DealChip until={offer.until} /> : null}
        <div className={`cover-wrap${tight}`}>
          {product.image ? (
            <div className={`cover has-pic${plain}${hover ? " has-hover" : ""}`}>
              {oos ? (
                <>
                  <span className="ribbon stock">স্টক আউট</span>
                  <span className="stamp">স্টক আউট</span>
                </>
              ) : null}
              <img className="pic-a" src={product.image} alt="" />
              {hover ? <img className="pic-b" src={product.image2} alt="" aria-hidden /> : null}
            </div>
          ) : (
            <div className={`cover${plain}`} style={{ background: product.color }}>
              {oos ? (
                <>
                  <span className="ribbon stock">স্টক আউট</span>
                  <span className="stamp">স্টক আউট</span>
                </>
              ) : null}
              <div className="ct">{product.title}</div>
              <div className="ca">{meta}</div>
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        <h3>{product.title}</h3>
        <div className="author">{meta}</div>
        <div className="card-foot">
          <div className="price-switch">
            <div className="price">
              ৳{bn(offer.price)}
              {offer.old > offer.price ? <span className="old">৳{bn(offer.old)}</span> : null}
            </div>
          </div>
          {oos ? (
            <button type="button" className={`slide-add wait${kept ? " on" : ""}`} onClick={(e) => { e.stopPropagation(); toggle("book", product.id); }}>{kept ? "রাখা হয়েছে" : "তালিকায়"}</button>
          ) : (
            <button type="button" className="slide-add" onClick={add}>
              <IconCart /> কার্টে যোগ
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
