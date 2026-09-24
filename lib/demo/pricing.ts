import { bn } from "@/lib/format";
import { COUPONS } from "./accounts";

export function couponOff(sub: number, code: string, coupons: { code: string; off: number; type: "pct" | "tk"; active?: boolean }[] = COUPONS) {
  const hit = coupons.find((c) => c.active !== false && c.code.toUpperCase() === code.trim().toUpperCase());
  if (!hit) return 0;
  if (hit.type === "pct") return Math.round((sub * hit.off) / 100);
  return Math.min(sub, hit.off);
}

export function shipFee(sub: number, outside: boolean) {
  if (sub >= 500) return 0;
  return outside ? 120 : 60;
}

const DHAKA = 60;
const OUTSIDE = 120;
const FREE_ABOVE = 500;

export function cartFreeShip(
  lines: { kind: string; id: number }[],
  products: { id: number; freeShip?: boolean }[],
  packs: { id: number; freeShip?: boolean }[],
  ship: { freeOnPack?: boolean; freeOnBooks?: boolean },
) {
  if (!lines.length) return false;
  const hasPack = lines.some((l) => l.kind === "pack");
  if (ship.freeOnPack && hasPack) return true;
  if (ship.freeOnBooks && !hasPack) return true;
  return lines.every((l) => (l.kind === "pack"
    ? !!packs.find((p) => p.id === l.id)?.freeShip
    : !!products.find((p) => p.id === l.id)?.freeShip));
}

export function quoteCheckout(
  sub: number,
  code: string,
  dist: string,
  coupons?: { code: string; off: number; type: "pct" | "tk"; active?: boolean }[],
  rates?: { dhaka: number; outside: number; freeAbove: number; freeAboveOn?: boolean; freeAllOn?: boolean; freeFrom?: string; freeTo?: string },
  forceFree = false,
) {
  const off = couponOff(sub, code, coupons);
  const net = Math.max(0, sub - off);
  const known = dist.trim().length > 0;
  const inside = dist === "ঢাকা";
  const dhaka = rates?.dhaka ?? DHAKA;
  const outside = rates?.outside ?? OUTSIDE;
  const freeAbove = rates?.freeAbove ?? FREE_ABOVE;
  const freeAboveOn = rates?.freeAboveOn !== false;
  let ship: number | null = null;
  let why = "";
  const now = Date.now();
  const from = rates?.freeFrom ? new Date(rates.freeFrom).getTime() : 0;
  const to = rates?.freeTo ? new Date(rates.freeTo).getTime() : Infinity;
  const campaign = !!rates?.freeAllOn && now >= from && now <= to;
  if (forceFree) {
    ship = 0;
    why = "ফ্রি ডেলিভারি";
  } else if (campaign) {
    ship = 0;
    why = "ক্যাম্পেইন · সবার জন্য ফ্রি";
  } else if (freeAboveOn && net >= freeAbove) {
    ship = 0;
    why = `৳${bn(freeAbove)}+ অর্ডারে ফ্রি`;
  } else if (!known) {
    ship = null;
    why = "জেলা বাছুন — ঢাকা/বাইরের রেট বসবে";
  } else if (inside) {
    ship = dhaka;
    why = "ঢাকার ভিতর";
  } else {
    ship = outside;
    why = "ঢাকার বাইরে";
  }
  return {
    sub,
    off,
    ship,
    grand: ship == null ? net : net + ship,
    why,
    dhaka,
    outside,
    freeAbove,
    freeAboveOn: freeAboveOn && freeAbove > 0,
    campaign,
  };
}

export function shipNote(quote: { dhaka: number; outside: number; freeAbove: number; freeAboveOn?: boolean; campaign?: boolean }) {
  const base = `হোম ডেলিভারি · ঢাকার ভিতর ৳${bn(quote.dhaka)} · বাইরে ৳${bn(quote.outside)}`;
  if (quote.campaign) return `${base} · ক্যাম্পেইনে ফ্রি`;
  if (quote.freeAboveOn && quote.freeAbove > 0) return `${base} · ৳${bn(quote.freeAbove)}+ ফ্রি`;
  return base;
}
