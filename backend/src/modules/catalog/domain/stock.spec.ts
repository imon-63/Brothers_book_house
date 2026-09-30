import { availableUnits, DEFAULT_LOW_STOCK, stockStatus, stockTransition, thresholdOf } from './stock';

const s = (o: Partial<Parameters<typeof stockStatus>[0]> = {}) => ({
  trackInventory: true,
  allowBackorder: false,
  stockOnHand: 20,
  stockReserved: 0,
  lowStockThreshold: null,
  ...o,
});

describe('stock helpers', () => {
  it('available = on-hand − reserved, never negative', () => {
    expect(availableUnits({ stockOnHand: 10, stockReserved: 3 })).toBe(7);
    expect(availableUnits({ stockOnHand: 2, stockReserved: 5 })).toBe(0);
  });

  it('threshold defaults to the store default', () => {
    expect(thresholdOf({ lowStockThreshold: null })).toBe(DEFAULT_LOW_STOCK);
    expect(thresholdOf({ lowStockThreshold: 2 })).toBe(2);
  });

  it('status: in / low / out on available units', () => {
    expect(stockStatus(s())).toBe('in');
    expect(stockStatus(s({ stockOnHand: 8, stockReserved: 3 }))).toBe('low');
    expect(stockStatus(s({ stockOnHand: 3, stockReserved: 3 }))).toBe('out');
    expect(stockStatus(s({ stockOnHand: 3, lowStockThreshold: 2 }))).toBe('in');
  });

  it('untracked or backorderable products are always in stock', () => {
    expect(stockStatus(s({ trackInventory: false, stockOnHand: 0 }))).toBe('in');
    expect(stockStatus(s({ allowBackorder: true, stockOnHand: 0 }))).toBe('in');
  });

  it('transition: becameLow only when crossing the threshold downwards', () => {
    expect(stockTransition(10, 5, 5)).toEqual({ becameLow: true, restocked: false });
    expect(stockTransition(5, 3, 5)).toEqual({ becameLow: false, restocked: false });
    expect(stockTransition(3, 10, 5)).toEqual({ becameLow: false, restocked: false });
  });

  it('transition: restocked when going from nothing to something', () => {
    expect(stockTransition(0, 3, 5)).toEqual({ becameLow: false, restocked: true });
    expect(stockTransition(0, 0, 5).restocked).toBe(false);
    expect(stockTransition(1, 3, 5).restocked).toBe(false);
  });
});
