/**
 * Warehouse pick list: every unit that must leave the shelf for a set of
 * orders, grouped by product. Bundle lines are expanded into their books.
 */
export type PickOrderInput = {
  orderNo: string;
  contactName: string;
  contactPhone: string;
  address: string;
  items: {
    kind: 'PRODUCT' | 'BUNDLE';
    productId: string | null;
    title: string;
    quantity: number;
    components: { productId: string; title: string; quantity: number }[];
  }[];
};

export type StockLevel = { stockOnHand: number; stockReserved: number; sku?: string | null };

export type PickGroup = {
  productId: string;
  title: string;
  sku: string | null;
  quantity: number;
  stockOnHand: number | null;
  /** units missing from the shelf for this pick (0 = ok) */
  shortfall: number;
  orders: string[];
  /** bundles this product was picked for */
  viaBundles: string[];
};

export type PickList = {
  groups: PickGroup[];
  units: number;
  shortCount: number;
  orders: { orderNo: string; contactName: string; contactPhone: string; address: string }[];
};

export function buildPickList(orders: PickOrderInput[], stock: Map<string, StockLevel>): PickList {
  const map = new Map<string, PickGroup>();
  const add = (productId: string, title: string, qty: number, orderNo: string, via?: string) => {
    const s = stock.get(productId);
    const g = map.get(productId) ?? {
      productId,
      title,
      sku: s?.sku ?? null,
      quantity: 0,
      stockOnHand: s ? s.stockOnHand : null,
      shortfall: 0,
      orders: [],
      viaBundles: [],
    };
    g.quantity += qty;
    if (!g.orders.includes(orderNo)) g.orders.push(orderNo);
    if (via && !g.viaBundles.includes(via)) g.viaBundles.push(via);
    map.set(productId, g);
  };

  for (const o of orders) {
    for (const it of o.items) {
      if (it.kind === 'BUNDLE') for (const c of it.components) add(c.productId, c.title, c.quantity, o.orderNo, it.title);
      else if (it.productId) add(it.productId, it.title, it.quantity, o.orderNo);
    }
  }
  const groups = [...map.values()]
    .map((g) => ({ ...g, shortfall: g.stockOnHand == null ? 0 : Math.max(0, g.quantity - g.stockOnHand) }))
    .sort((a, b) => b.quantity - a.quantity || a.title.localeCompare(b.title));
  return {
    groups,
    units: groups.reduce((s, g) => s + g.quantity, 0),
    shortCount: groups.filter((g) => g.shortfall > 0).length,
    orders: orders.map(({ orderNo, contactName, contactPhone, address }) => ({ orderNo, contactName, contactPhone, address })),
  };
}
