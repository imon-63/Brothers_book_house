import type { DemoOrder } from "@/lib/demo/accounts";
import { nextOrderId, rememberPlaced } from "@/lib/demo/placed";
import { clearCart } from "@/store/slices/cart-slice";
import { placeOrder } from "@/store/slices/order-slice";
import { holdStock } from "@/store/slices/shop-slice";
import { showToast } from "@/store/slices/ui-slice";
import type { AppDispatch } from "@/store";

export const SSL_API = "http://127.0.0.1:8787";
export const SSL_PENDING = "cholo_ssl_pending";
export const SSL_DONE = "cholo_ssl_done";

export type SslPending = Omit<DemoOrder, "id" | "at" | "status" | "paid" | "confirmedAt" | "cancelAt"> & {
  tran_id: string;
  units: { id: number; n: number }[];
};

export function sslQuery() {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const ssl = q.get("ssl");
  if (ssl !== "success" && ssl !== "fail" && ssl !== "cancel") return null;
  return { ssl, tran_id: q.get("tran_id") || "" };
}

export function commitSslPaid(dispatch: AppDispatch, orderCount: number) {
  const q = sslQuery();
  if (!q || q.ssl !== "success") return false;
  if (sessionStorage.getItem(SSL_DONE)) return true;
  const raw = sessionStorage.getItem(SSL_PENDING);
  if (!raw) return false;
  let pending: SslPending;
  try { pending = JSON.parse(raw) as SslPending; } catch { return false; }
  if (q.tran_id && pending.tran_id !== q.tran_id) return false;
  sessionStorage.setItem(SSL_DONE, pending.tran_id);
  sessionStorage.removeItem(SSL_PENDING);
  const { units, tran_id: _tran, ...order } = pending;
  const id = nextOrderId(orderCount);
  dispatch(holdStock(units));
  dispatch(placeOrder({ ...order, pay: "SSLCOMMERZ", stockHeld: true }));
  dispatch(clearCart());
  dispatch(showToast("পেমেন্ট হয়েছে"));
  rememberPlaced(id, order.phone);
  return true;
}
