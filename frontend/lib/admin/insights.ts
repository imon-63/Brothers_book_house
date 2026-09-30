/* Small pure helpers the admin screens share (data now comes from the API). */

export { statusTone, isSslMethod, isLiveStatus, type StatusTone } from "./status";

export const DAY = 86_400_000;

export function phoneKey(phone: string) {
  const d = (phone || "").replace(/\D/g, "");
  return d.length >= 11 ? d.slice(-11) : d;
}

export type Segment = "new" | "regular" | "vip" | "risk" | "sleep";
export const SEGMENT_LABEL: Record<Segment, { bn: string; en: string }> = {
  new: { bn: "নতুন", en: "New" },
  regular: { bn: "নিয়মিত", en: "Regular" },
  vip: { bn: "VIP", en: "VIP" },
  risk: { bn: "ঝুঁকি", en: "At risk" },
  sleep: { bn: "ঘুমন্ত", en: "Dormant" },
};

/** API segment enum (NEW, REGULAR, VIP, AT_RISK, DORMANT…) → UI segment. */
export function segmentOf(api: string | null | undefined): Segment {
  switch ((api ?? "").toUpperCase()) {
    case "VIP": return "vip";
    case "REGULAR": return "regular";
    case "AT_RISK":
    case "RISK": return "risk";
    case "DORMANT":
    case "SLEEP": return "sleep";
    default: return "new";
  }
}

export function pctDelta(cur: number, prev: number) {
  if (!prev) return cur ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}
