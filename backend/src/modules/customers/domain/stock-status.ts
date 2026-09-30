export type StockState = 'in_stock' | 'low' | 'out_of_stock';

export type StockFacts = {
  trackInventory: boolean;
  allowBackorder: boolean;
  stockOnHand: number;
  stockReserved: number;
  lowStockThreshold?: number | null;
};

const DEFAULT_LOW = 5;

/** Units a shopper can buy right now. Untracked/backorder items are always available. */
export function availableUnits(p: StockFacts): number {
  if (!p.trackInventory || p.allowBackorder) return Number.POSITIVE_INFINITY;
  return Math.max(0, p.stockOnHand - p.stockReserved);
}

export function productStock(p: StockFacts): { state: StockState; available: number | null } {
  const avail = availableUnits(p);
  if (!Number.isFinite(avail)) return { state: 'in_stock', available: null };
  if (avail <= 0) return { state: 'out_of_stock', available: 0 };
  return { state: avail <= (p.lowStockThreshold ?? DEFAULT_LOW) ? 'low' : 'in_stock', available: avail };
}

/** A bundle is buyable only when every component has enough units for its quantity. */
export function bundleStock(items: { quantity: number; product: StockFacts }[]): { state: StockState; available: number | null } {
  if (!items.length) return { state: 'out_of_stock', available: 0 };
  let packs = Number.POSITIVE_INFINITY;
  for (const it of items) packs = Math.min(packs, Math.floor(availableUnits(it.product) / Math.max(1, it.quantity)));
  if (!Number.isFinite(packs)) return { state: 'in_stock', available: null };
  if (packs <= 0) return { state: 'out_of_stock', available: 0 };
  return { state: packs <= 2 ? 'low' : 'in_stock', available: packs };
}
