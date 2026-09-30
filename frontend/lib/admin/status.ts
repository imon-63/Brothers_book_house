/** Order status enum (API) → Bangla labels / badge tones used across admin. */

export const ORDER_STATUSES = [
  "PENDING", "CONFIRMED", "PROCESSING", "HANDED_TO_COURIER", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Forward flow (without the terminal CANCELLED / RETURNED). */
export const FLOW: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "HANDED_TO_COURIER", "OUT_FOR_DELIVERY", "DELIVERED"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "অপেক্ষমাণ",
  CONFIRMED: "অর্ডার নিশ্চিত",
  PROCESSING: "প্রস্তুত হচ্ছে",
  HANDED_TO_COURIER: "কুরিয়ারে তোলা হয়েছে",
  OUT_FOR_DELIVERY: "ডেলিভারিতে আছে",
  DELIVERED: "ডেলিভারি সম্পন্ন",
  CANCELLED: "বাতিল",
  RETURNED: "ফেরত",
};

export const STATUS_SHORT: Record<OrderStatus, string> = {
  PENDING: "অপেক্ষমাণ",
  CONFIRMED: "কনফার্ম",
  PROCESSING: "প্রস্তুত হচ্ছে",
  HANDED_TO_COURIER: "কুরিয়ারে",
  OUT_FOR_DELIVERY: "ডেলিভারিতে",
  DELIVERED: "ডেলিভার্ড",
  CANCELLED: "বাতিল",
  RETURNED: "ফেরত",
};

export function statusLabel(s: string | null | undefined) {
  return STATUS_LABEL[s as OrderStatus] ?? "অর্ডার";
}

export type StatusTone = "hold" | "live" | "ship" | "done" | "bad";
export function statusTone(s: string | null | undefined): StatusTone {
  switch (s) {
    case "PENDING": return "hold";
    case "CANCELLED":
    case "RETURNED": return "bad";
    case "DELIVERED": return "done";
    case "HANDED_TO_COURIER":
    case "OUT_FOR_DELIVERY": return "ship";
    default: return "live";
  }
}

/** Confirmed and not dead — "live" revenue. */
export function isLiveStatus(s: string) {
  return s !== "PENDING" && s !== "CANCELLED" && s !== "RETURNED";
}
export function isClosedStatus(s: string) {
  return s === "CANCELLED" || s === "RETURNED";
}
export function isSslMethod(method: string | null | undefined) {
  return (method ?? "").toUpperCase().includes("SSL");
}
