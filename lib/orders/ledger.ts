import { offerOf } from "@/lib/catalog/offer";
import type { CartLine } from "@/lib/catalog/types";
import type { OrderLine } from "@/lib/demo/accounts";
import type { ShopPack, ShopProduct } from "@/store/slices/shop-slice";

export function snapshotLines(cart: CartLine[], products: ShopProduct[], packs: ShopPack[]): OrderLine[] {
  return cart.map((line) => {
    if (line.kind === "pack") {
      const pack = packs.find((p) => p.id === line.id);
      const ids = pack?.bookIds ?? [];
      const books = ids.map((id) => products.find((p) => p.id === id)).filter((p): p is ShopProduct => Boolean(p));
      const cost = books.reduce((sum, book) => sum + (book.cost || 0), 0);
      return {
        kind: "pack",
        id: line.id,
        title: pack?.title || "প্যাকেজ",
        qty: line.n,
        price: pack?.price ?? 0,
        cost,
        costKnown: ids.length > 0 && books.length === ids.length && books.every((book) => (book.cost || 0) > 0),
        bookIds: ids,
      };
    }
    const product = products.find((p) => p.id === line.id);
    const cost = product?.cost || 0;
    return {
      kind: "book",
      id: line.id,
      title: product?.title || "পণ্য",
      qty: line.n,
      price: product ? offerOf(product).price : 0,
      cost,
      costKnown: cost > 0,
    };
  });
}

export function stockUnits(lines: OrderLine[]) {
  const need = new Map<number, number>();
  for (const line of lines) {
    const ids = line.kind === "pack" ? line.bookIds ?? [] : [line.id];
    for (const id of ids) need.set(id, (need.get(id) || 0) + line.qty);
  }
  return [...need.entries()].map(([id, n]) => ({ id, n }));
}

export function stockShort(units: { id: number; n: number }[], products: ShopProduct[]) {
  for (const unit of units) {
    const product = products.find((p) => p.id === unit.id);
    if (!product || product.stock < unit.n) return product?.title || "পণ্য";
  }
  return "";
}
