"use client";

import { useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMe } from "./auth";
import { bundleQuery, productQuery, type Pack, type Product } from "./catalog";
import { cartToken, del, get, patch, post } from "./client";

/* ───────────── API shapes ───────────── */

export type QuoteLineDto = {
  kind: "PRODUCT" | "BUNDLE";
  productId: string | null;
  bundleId: string | null;
  title: string;
  sectionCode: string;
  quantity: number;
  unitPrice: number;
  listPrice: number;
  gross: number;
  discount: number;
  taxAmount: number;
  lineTotal: number;
  freeShipping: boolean;
  couponEligible: boolean;
  components: { productId: string; title: string; quantity: number }[];
};

export type ShippingBasis = "ITEM_FLAGS" | "ANY_BUNDLE" | "SECTION_ONLY" | "COUPON" | "CAMPAIGN_ALL" | "MIN_SUBTOTAL" | "ZONE" | "UNKNOWN_DISTRICT";

export type QuoteDto = {
  lines: QuoteLineDto[];
  itemsSubtotal: number;
  discountTotal: number;
  netSubtotal: number;
  taxTotal: number;
  shippingFee: number | null;
  grandTotal: number;
  shipping: {
    fee: number | null;
    free: boolean;
    reason: string;
    basis: ShippingBasis;
    zoneCode: string | null;
    freeAbove: number | null;
    amountToFree: number | null;
    campaign: boolean;
    eta: { minDays: number; maxDays: number } | null;
  };
  district: { id: number; nameBn: string; division: string } | null;
  coupon: { code: string; type: string; discount: number; freeShipping: boolean } | null;
  couponError: { code: string; message: string } | null;
  unavailable: unknown[];
  stockIssues: { productId?: string; title?: string; available?: number; requested?: number }[];
};

export type CartItemDto = {
  id: string;
  kind: "PRODUCT" | "BUNDLE";
  productId: string | null;
  bundleId: string | null;
  quantity: number;
  addedAt: string;
  available: boolean;
  stockOk: boolean;
  maxAvailable: number | null;
  line: QuoteLineDto | null;
};

export type CartDto = {
  id: string | null;
  token: string | null;
  items: CartItemDto[];
  couponCode: string | null;
  count: number;
  quote: QuoteDto | null;
};

export const cartKey = ["cart"] as const;

/* ───────────── low-level calls (guest token travels in x-cart-token) ───────────── */

function keepToken(cart: CartDto) {
  if (cart.token) cartToken.set(cart.token);
  return cart;
}

export const cartApi = {
  get: () => get<CartDto>("/cart", undefined, { cart: true }).then(keepToken),
  add: (kind: "PRODUCT" | "BUNDLE", id: string, quantity = 1) =>
    post<CartDto>("/cart/items", kind === "PRODUCT" ? { kind, productId: id, quantity } : { kind, bundleId: id, quantity }, { cart: true }).then(keepToken),
  setQty: (itemId: string, quantity: number) => patch<CartDto>(`/cart/items/${itemId}`, { quantity }, { cart: true }).then(keepToken),
  remove: (itemId: string) => del<CartDto>(`/cart/items/${itemId}`, { cart: true }),
  applyCoupon: (code: string) => post<CartDto>("/cart/coupon", { code }, { cart: true }).then(keepToken),
  removeCoupon: () => del<CartDto>("/cart/coupon", { cart: true }),
  clear: () => del<unknown>("/cart", { cart: true }),
  /** After login: fold the guest cart into the customer's cart and drop the guest token. */
  merge: async () => {
    const guestToken = cartToken.get();
    if (!guestToken) return null;
    try {
      return await post<CartDto>("/cart/merge", { guestToken });
    } finally {
      cartToken.set(null);
    }
  },
};

/* ───────────── hooks ───────────── */

/** The server cart (guest or customer). Refetches when the session changes. */
export function useCart() {
  const { me, loading } = useMe();
  return useQuery({
    queryKey: [...cartKey, me?.id ?? "guest"],
    enabled: !loading,
    queryFn: cartApi.get,
    staleTime: 30_000,
  });
}

/** Mutations that write the fresh cart straight into the cache. */
export function useCartActions() {
  const qc = useQueryClient();
  const { me } = useMe();
  const key = [...cartKey, me?.id ?? "guest"];
  const put = (cart: CartDto | undefined | null) => {
    if (cart && typeof cart === "object" && "items" in cart) qc.setQueryData(key, cart);
    else void qc.invalidateQueries({ queryKey: cartKey });
    return cart;
  };
  return {
    add: (kind: "book" | "pack", id: string, n = 1) => cartApi.add(kind === "pack" ? "BUNDLE" : "PRODUCT", id, n).then(put),
    setQty: (itemId: string, n: number) => (n <= 0 ? cartApi.remove(itemId) : cartApi.setQty(itemId, n)).then(put),
    remove: (itemId: string) => cartApi.remove(itemId).then(put),
    applyCoupon: (code: string) => cartApi.applyCoupon(code).then(put),
    removeCoupon: () => cartApi.removeCoupon().then(put),
    refresh: () => qc.invalidateQueries({ queryKey: cartKey }),
  };
}

/** One cart line as the mini cart / cart page / checkout render it. */
export type CartRow = {
  itemId: string;
  kind: "book" | "pack";
  refId: string;
  n: number;
  title: string;
  price: number;
  old: number;
  sub: string;
  cat: string;
  color: string;
  image?: string;
  vertical: string;
  vertName: string;
  books: Product[];
  href: string;
  lineTotal: number;
  stockOk: boolean;
  available: boolean;
  loaded: boolean;
};

/**
 * Cart items enriched with covers / links. The cart API returns titles and
 * prices only, so product and bundle details come from their (cached) queries.
 */
export function useCartRows(cart: CartDto | undefined) {
  const items = cart?.items ?? [];
  const productIds = [...new Set(items.filter((i) => i.kind === "PRODUCT" && i.productId).map((i) => i.productId!))];
  const bundleIds = [...new Set(items.filter((i) => i.kind === "BUNDLE" && i.bundleId).map((i) => i.bundleId!))];
  const products = useQueries({ queries: productIds.map((id) => ({ ...productQuery(id), staleTime: 5 * 60_000 })) });
  const bundles = useQueries({ queries: bundleIds.map((id) => ({ ...bundleQuery(id), staleTime: 5 * 60_000 })) });
  const pMap = new Map<string, Product>();
  products.forEach((q, i) => q.data && pMap.set(productIds[i], q.data.product));
  const bMap = new Map<string, Pack>();
  bundles.forEach((q, i) => q.data && bMap.set(bundleIds[i], q.data));
  const sig = `${items.map((i) => `${i.id}:${i.quantity}:${i.line?.unitPrice}`).join("|")}#${pMap.size}#${bMap.size}`;

  return useMemo<CartRow[]>(() => items.map((item) => {
    const line = item.line;
    if (item.kind === "BUNDLE") {
      const pack = bMap.get(item.bundleId!);
      const unit = line?.unitPrice ?? pack?.price ?? 0;
      return {
        itemId: item.id,
        kind: "pack",
        refId: item.bundleId!,
        n: item.quantity,
        title: line?.title || pack?.title || "প্যাকেজ",
        price: unit,
        old: Math.max(line?.listPrice ?? 0, pack?.old ?? 0),
        sub: `${toBn(pack?.books.length ?? line?.components.length ?? 0)}টি বইয়ের প্যাকেজ`,
        cat: "প্যাকেজ",
        color: "#3D5A4C",
        vertical: line?.sectionCode ?? pack?.vertical ?? "book",
        vertName: "",
        books: pack?.books ?? [],
        href: pack ? `/pack/${encodeURIComponent(pack.key)}` : `/pack/${item.bundleId}`,
        lineTotal: line ? line.gross : unit * item.quantity,
        stockOk: item.stockOk,
        available: item.available,
        loaded: !!pack,
      };
    }
    const p = pMap.get(item.productId!);
    const unit = line?.unitPrice ?? p?.price ?? 0;
    return {
      itemId: item.id,
      kind: "book",
      refId: item.productId!,
      n: item.quantity,
      title: line?.title || p?.title || "পণ্য",
      price: unit,
      old: Math.max(line && line.listPrice > unit ? line.listPrice : 0, p?.old ?? 0),
      sub: p?.unit || p?.author || "",
      cat: p ? (p.sub ? `${p.cat} · ${p.sub}` : p.cat) : "",
      color: p?.color || "#7A2430",
      image: p?.image,
      vertical: line?.sectionCode ?? p?.vertical ?? "book",
      vertName: p?.vertName ?? "",
      books: [],
      href: p ? `/product/${encodeURIComponent(p.key)}` : `/product/${item.productId}`,
      lineTotal: line ? line.gross : unit * item.quantity,
      stockOk: item.stockOk,
      available: item.available,
      loaded: !!p,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sig]);
}

function toBn(n: number) {
  return String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)] ?? d);
}

/** Lines in the shape /checkout/quote and /orders expect. */
export function cartLines(cart: CartDto | undefined) {
  return (cart?.items ?? []).map((i) =>
    i.kind === "BUNDLE"
      ? { kind: "BUNDLE" as const, bundleId: i.bundleId!, quantity: i.quantity }
      : { kind: "PRODUCT" as const, productId: i.productId!, quantity: i.quantity },
  );
}
