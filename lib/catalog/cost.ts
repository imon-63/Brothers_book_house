import type { VerticalId } from "@/lib/catalog/types";

/** Wholesale guess under the selling price. Books keep a wider margin than grocery and gadgets. */
export function guessCost(price: number, vertical: VerticalId, id = 0): number {
  if (!(price > 0)) return 0;
  const base = vertical === "book" ? 0.68 : vertical === "food" ? 0.78 : 0.82;
  const wobble = (((id * 13) % 9) - 4) * 0.01;
  const step = price >= 1500 ? 10 : 5;
  const raw = Math.round((price * (base + wobble)) / step) * step;
  const cap = Math.max(step, price - step);
  return Math.min(cap, Math.max(step, raw));
}
