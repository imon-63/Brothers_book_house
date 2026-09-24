import type { PriceDeal } from "@/lib/catalog/types";

export function offerOf(product: { price: number; old: number; deal?: PriceDeal }, now = Date.now()) {
  const until = product.deal?.until ? Date.parse(product.deal.until) : NaN;
  const live = Boolean(product.deal && product.deal.price > 0 && product.deal.price < product.price && until > now);
  if (live && product.deal) return { price: product.deal.price, old: product.price, until: product.deal.until, on: true };
  return { price: product.price, old: product.old, until: "", on: false };
}

export function nextDealAt(products: { deal?: PriceDeal; price: number }[], now = Date.now()) {
  let next = 0;
  for (const product of products) {
    const until = product.deal?.until ? Date.parse(product.deal.until) : NaN;
    if (product.deal && product.deal.price > 0 && product.deal.price < product.price && until > now) {
      next = next ? Math.min(next, until) : until;
    }
  }
  return next;
}
