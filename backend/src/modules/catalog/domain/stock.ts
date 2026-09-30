/** Store-wide default when a product has no own low-stock threshold (matches InventoryService / v_product_stock). */
export const DEFAULT_LOW_STOCK = 5;

export type StockStatus = 'in' | 'low' | 'out';

export type StockLike = {
  trackInventory: boolean;
  allowBackorder: boolean;
  stockOnHand: number;
  stockReserved: number;
  lowStockThreshold: number | null;
};

export function availableUnits(s: Pick<StockLike, 'stockOnHand' | 'stockReserved'>): number {
  return Math.max(0, s.stockOnHand - s.stockReserved);
}

export function thresholdOf(s: Pick<StockLike, 'lowStockThreshold'>, fallback = DEFAULT_LOW_STOCK): number {
  return s.lowStockThreshold ?? fallback;
}

/**
 * Storefront stock badge. Deliberately coarse — shoppers never see
 * exact on-hand or reserved counts.
 */
export function stockStatus(s: StockLike, fallbackThreshold = DEFAULT_LOW_STOCK): StockStatus {
  if (!s.trackInventory || s.allowBackorder) return 'in';
  const available = availableUnits(s);
  if (available <= 0) return 'out';
  return available <= thresholdOf(s, fallbackThreshold) ? 'low' : 'in';
}

export type StockTransition = { becameLow: boolean; restocked: boolean };

/**
 * What a change in on-hand stock means for alerts:
 *  - becameLow: it crossed from above the threshold to ≤ threshold
 *  - restocked: it went from nothing (≤ 0) to something
 */
export function stockTransition(before: number, after: number, threshold: number): StockTransition {
  return {
    becameLow: before > threshold && after <= threshold,
    restocked: before <= 0 && after > 0,
  };
}
