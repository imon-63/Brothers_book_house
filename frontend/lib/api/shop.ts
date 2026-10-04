"use client";

/**
 * Storefront glue on top of lib/api/{client,auth,cart,catalog}: add-to-cart
 * with toast, wishlist (ভবিষ্যৎ অর্ডার), my orders, tracking, checkout
 * (geo → quote → place order → SSLCOMMERZ), profile/addresses, support chat.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, chatToken, del, errorText, get, newIdempotencyKey, patch, post } from "./client";
import { useMe } from "./auth";
import { cartKey, useCartActions, type QuoteDto } from "./cart";
import { setAuth, setMiniCart, setPendingWait, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { askSoon } from "@/lib/soon-confirm";

export function apiErrorText(err: unknown) {
  if (err instanceof ApiError && err.errors?.length) return err.errors.slice(0, 2).join(" · ");
  return errorText(err);
}

export function useShopToast() {
  const d = useAppDispatch();
  return useCallback((t: string) => { d(showToast(t)); }, [d]);
}

/* ───────── cart ───────── */

/** Add a product/bundle to the server cart, toast, and open the mini cart. */
type NextDealCheck = { productId: string; title: string; regularPrice: number; nextDeal: { dealPrice: number; startsAt: string; endsAt: string } | null };

export function useAddToCart() {
  const actions = useCartActions();
  const d = useAppDispatch();
  const qc = useQueryClient();
  return useCallback(async (kind: "book" | "pack", id: string, n = 1, openMini = true) => {
    /* a timed deal is about to start → say so before adding at today's (regular) price */
    if (kind === "book") {
      const check = await qc
        .fetchQuery({ queryKey: ["next-deal", id], staleTime: 15_000, queryFn: () => get<NextDealCheck>(`/products/${id}/next-deal`) })
        .catch(() => null);
      const nd = check?.nextDeal;
      if (check && nd && Date.parse(nd.startsAt) > Date.now()) {
        const ok = await askSoon({ title: check.title, regularPrice: check.regularPrice, dealPrice: nd.dealPrice, startsAt: nd.startsAt, endsAt: nd.endsAt });
        if (!ok) return false;
      }
    }
    try {
      await actions.add(kind, id, n);
      d(showToast("কার্টে যোগ হয়েছে"));
      if (openMini) d(setMiniCart(true));
      return true;
    } catch (e) {
      d(showToast(apiErrorText(e)));
      return false;
    }
  }, [actions, d, qc]);
}

/* ───────── wishlist (ভবিষ্যৎ অর্ডার) ───────── */

export type WishItem = {
  id: string; kind: "product" | "bundle"; refId: string; slug: string; title: string; subtitle: string | null; imageUrl: string | null;
  coverColor: string | null; price: number; stock: { state: string; available: number | null }; canOrder: boolean; notifyOnRestock: boolean; createdAt: string;
};
const wishKey = ["me", "wishlist"] as const;

export function useWishlist() {
  const { me } = useMe();
  return useQuery({ queryKey: [...wishKey, me?.id], enabled: !!me && me.role === "CUSTOMER", queryFn: () => get<WishItem[]>("/me/wishlist") });
}

/** saved(kind,id) / toggle(kind,id) — asks to log in first (and remembers the item). */
export function useWait() {
  const { me } = useMe();
  const d = useAppDispatch();
  const qc = useQueryClient();
  const list = useWishlist().data ?? [];
  const saved = useCallback((kind: "book" | "pack", id: string) => list.some((w) => w.refId === id && (kind === "pack") === (w.kind === "bundle")), [list]);
  const toggle = useCallback(async (kind: "book" | "pack", id: string) => {
    if (!me) {
      d(setPendingWait({ kind, id }));
      d(setAuth(true));
      d(showToast("লগইন করলে তালিকায় রাখতে পারবেন"));
      return;
    }
    const hit = list.find((w) => w.refId === id);
    try {
      if (hit) await del(`/me/wishlist/${hit.id}`);
      else await post("/me/wishlist", kind === "pack" ? { bundleId: id } : { productId: id });
      d(showToast(hit ? "তালিকা থেকে সরানো হয়েছে" : "ভবিষ্যৎ অর্ডারে রাখা হয়েছে"));
    } catch (e) {
      d(showToast(apiErrorText(e)));
    }
    void qc.invalidateQueries({ queryKey: wishKey });
  }, [me, list, d, qc]);
  return { user: me, saved, toggle };
}

/** After login: save the item the shopper tapped while logged out. */
export function useFlushPendingWait() {
  const pending = useAppSelector((s) => s.ui.pendingWait);
  const d = useAppDispatch();
  const qc = useQueryClient();
  return useCallback(async () => {
    if (!pending) return false;
    d(setPendingWait(null));
    try {
      await post("/me/wishlist", pending.kind === "pack" ? { bundleId: pending.id } : { productId: pending.id });
      void qc.invalidateQueries({ queryKey: wishKey });
      return true;
    } catch {
      return false;
    }
  }, [pending, d, qc]);
}

/* ───────── my orders / tracking ───────── */

export type Glance = { title: string; sub: string; chip: string; kind: "hold" | "live" | "ship" | "done" | "bad" | string };
export type MyOrder = {
  orderNo: string; status: string; statusLabel: string; placedAt: string; grandTotal: number; paymentMethod: string; paymentStatus: string;
  items: { title: string; quantity: number; kind: "PRODUCT" | "BUNDLE"; productId: string | null; bundleId: string | null }[];
  glance: Glance;
};
export type TimelineStep = { status: string; label: string; hint: string; state: "done" | "now" | "wait" | "skip" | "cancel"; at: string | null };
export type MyOrderDetail = MyOrder & {
  contact?: { name: string; phone: string; email: string | null };
  address?: string;
  shipment?: { courier: string; trackingNo: string | null; trackingUrl: string | null; status?: string } | null;
  money?: { itemsSubtotal: number; discountTotal: number; shippingFee: number; grandTotal: number; couponCode: string | null };
  timeline?: { title: string; sub: string; chip: string; kind: string; steps: TimelineStep[] };
  canCancel?: boolean;
  [k: string]: unknown;
};

export function useMyOrders() {
  const { me } = useMe();
  return useQuery({ queryKey: ["me", "orders", me?.id], enabled: !!me, queryFn: () => get<{ items: MyOrder[]; total: number }>("/me/orders", { pageSize: 50 }) });
}
export function useMyOrder(orderNo: string | null) {
  const { me } = useMe();
  return useQuery({ queryKey: ["me", "order", orderNo], enabled: !!me && !!orderNo, queryFn: () => get<MyOrderDetail>(`/me/orders/${encodeURIComponent(orderNo!)}`) });
}
export function useCancelMyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderNo, reason }: { orderNo: string; reason?: string }) => post(`/me/orders/${encodeURIComponent(orderNo)}/cancel`, { reason }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}
export function trackOrder(phone: string, orderNo?: string) {
  return post<{ orders: MyOrderDetail[] }>("/orders/track", { phone, orderNo: orderNo || undefined }, { auth: false }).then((r) => r.orders ?? []);
}

/** Guest orders remembered on this device (fetched through the public tracker). */
export function useGuestOrders(enabled: boolean) {
  const list = typeof window === "undefined" ? [] : placedOrders();
  const phones = [...new Set(list.map((x) => x.phone))];
  return useQuery({
    queryKey: ["guest", "orders", phones.join(",")],
    enabled: enabled && phones.length > 0,
    queryFn: async () => {
      const all = (await Promise.all(phones.map((ph) => trackOrder(ph).catch(() => [])))).flat();
      const mine = new Set(list.map((x) => x.orderNo));
      return all.filter((o) => mine.has(o.orderNo));
    },
  });
}

/* ───────── guest order memory ───────── */

export const PLACED_KEY = "cholo_placed_orders";
/** Guests: remember order numbers + phone so /orders can show them right after checkout. */
export function rememberPlaced(orderNo: string, phone: string) {
  try {
    const list = placedOrders();
    localStorage.setItem(PLACED_KEY, JSON.stringify([{ orderNo, phone }, ...list.filter((x) => x.orderNo !== orderNo)].slice(0, 10)));
    sessionStorage.setItem("cholo_placed", "1");
  } catch { /* ignore */ }
}
export function placedOrders(): { orderNo: string; phone: string }[] {
  try { return JSON.parse(localStorage.getItem(PLACED_KEY) || "[]"); } catch { return []; }
}

/* ───────── geo + checkout ───────── */

export type Division = { id: number; nameBn: string; districts: number };
export type District = { id: number; nameBn: string; divisionId: number; zoneCode: string };
export type Place = { id: number; nameBn: string };

export function useDivisions() {
  return useQuery({ queryKey: ["geo", "div"], staleTime: Infinity, queryFn: () => get<Division[]>("/geo/divisions", undefined, { auth: false }) });
}
export function useDistricts(division: number | null) {
  return useQuery({ queryKey: ["geo", "dist", division], enabled: !!division, staleTime: Infinity, queryFn: () => get<District[]>("/geo/districts", { division: division! }, { auth: false }) });
}
export function useUpazilas(district: number | null) {
  return useQuery({ queryKey: ["geo", "upa", district], enabled: !!district, staleTime: Infinity, queryFn: () => get<Place[]>("/geo/upazilas", { district: district! }, { auth: false }) });
}
export function useUnions(upazila: number | null) {
  return useQuery({ queryKey: ["geo", "uni", upazila], enabled: !!upazila, staleTime: Infinity, queryFn: () => get<Place[]>("/geo/unions", { upazila: upazila! }, { auth: false }) });
}

export type Line = { kind: "PRODUCT" | "BUNDLE"; productId?: string; bundleId?: string; quantity: number };

export function useQuote(lines: Line[], opts: { couponCode?: string; districtId?: number | null; phone?: string }) {
  const sig = JSON.stringify([lines, opts]);
  return useQuery({
    queryKey: ["checkout", "quote", sig],
    enabled: lines.length > 0,
    placeholderData: (p) => p,
    queryFn: () => post<QuoteDto>("/checkout/quote", { lines, couponCode: opts.couponCode || undefined, districtId: opts.districtId || undefined, phone: opts.phone || undefined }, { cart: true }),
  });
}

export type PlaceOrderInput = {
  lines: Line[];
  contact: { name: string; phone: string; email?: string };
  address: { districtId: number; upazila?: string; union?: string; line: string; landmark?: string };
  couponCode?: string;
  customerNote?: string;
  paymentMethod: "COD" | "SSLCOMMERZ";
};
export type PlacedOrder = { orderNo: string; id?: string; grandTotal?: number; status?: string; paymentMethod?: string; [k: string]: unknown };

/** POST /orders with one Idempotency-Key per checkout attempt (safe to retry). */
export function usePlaceOrder() {
  const qc = useQueryClient();
  const key = useMemo(() => ({ current: newIdempotencyKey() }), []);
  return useMutation({
    mutationFn: (input: PlaceOrderInput) => post<PlacedOrder>("/orders", { ...input, clearCart: true }, { cart: true, idempotencyKey: key.current }),
    onSuccess: () => {
      key.current = newIdempotencyKey();
      void qc.invalidateQueries({ queryKey: cartKey });
      void qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

/** Start an SSLCOMMERZ payment for an order → redirect URL. */
export async function startSslPayment(order: { id?: string; orderNo?: string; phone?: string }) {
  const res = await post<{ gatewayUrl?: string }>(`/payments/sslcommerz/init`, { orderId: order.id, orderNo: order.id ? undefined : order.orderNo, phone: order.phone }, { cart: true });
  return res.gatewayUrl || "";
}

/* ───────── profile / addresses ───────── */

export type Profile = { id: string; name: string; phone: string | null; email: string | null; memberSince: string; stats: { ordersCount: number; liveOrders: number; totalSpent: number; lastOrderAt: string | null } };
export type MyAddress = { id: string; label: string | null; recipientName: string; phone: string; districtId: number; district: string; division: string; upazila: string | null; union: string | null; line: string; landmark: string | null; isDefault: boolean };

export function useProfile() {
  const { me } = useMe();
  return useQuery({ queryKey: ["me", "profile", me?.id], enabled: !!me && me.role === "CUSTOMER", queryFn: () => get<Profile>("/me/profile") });
}
export function useAddresses() {
  const { me } = useMe();
  return useQuery({ queryKey: ["me", "addresses", me?.id], enabled: !!me && me.role === "CUSTOMER", queryFn: () => get<MyAddress[]>("/me/addresses") });
}
export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; email?: string | null }) => patch("/me/profile", body),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ["me"] }); void qc.invalidateQueries({ queryKey: ["auth", "me"] }); },
  });
}
export function useChangePassword() {
  return useMutation({ mutationFn: (body: { currentPassword: string; newPassword: string }) => post("/auth/password/change", body) });
}

/* ───────── support chat (customer) ───────── */

export type ChatMsg = { id: string; sender: "CUSTOMER" | "STAFF" | "SYSTEM"; senderName: string | null; body: string; createdAt: string };
type Conv = { id: string; chatToken?: string; messages?: ChatMsg[] } | null;

export function useSupportChat(open: boolean) {
  const qc = useQueryClient();
  const { me } = useMe();
  const q = useQuery({
    queryKey: ["support", "current", me?.id ?? "guest"],
    enabled: open,
    refetchInterval: open ? 8000 : false,
    queryFn: async () => {
      if (!me && !chatToken.get()) return null;
      try {
        const c = await get<Conv>("/support/conversations/current", undefined, { chat: true });
        if (!c) return null;
        if (c.messages) return c;
        const msgs = await get<{ items?: ChatMsg[] } | ChatMsg[]>(`/support/conversations/${c.id}/messages`, undefined, { chat: true });
        return { ...c, messages: Array.isArray(msgs) ? msgs : msgs.items ?? [] };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const send = useCallback(async (text: string, name?: string) => {
    const conv = q.data;
    if (conv?.id) await post(`/support/conversations/${conv.id}/messages`, { body: text }, { chat: true });
    else {
      const started = await post<{ id: string; chatToken?: string; token?: string }>("/support/conversations", { message: text, name }, { chat: true });
      const tok = started.chatToken ?? started.token;
      if (tok) chatToken.set(tok);
    }
    await qc.invalidateQueries({ queryKey: ["support", "current"] });
  }, [q.data, qc]);
  useEffect(() => {
    if (open && q.data?.id) void post(`/support/conversations/${q.data.id}/read`, {}, { chat: true }).catch(() => undefined);
  }, [open, q.data?.id, q.data?.messages?.length]);
  return { messages: q.data?.messages ?? [], send, loading: q.isLoading };
}
