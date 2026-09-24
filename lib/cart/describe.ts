import { catalog } from "@/lib/catalog/data";
import { offerOf } from "@/lib/catalog/offer";
import type { CartLine, Pack, Product, VerticalId } from "@/lib/catalog/types";
import { bn } from "@/lib/format";

export type LineView = {
  title: string;
  price: number;
  old: number;
  sub: string;
  cat: string;
  color: string;
  image?: string;
  vertical: VerticalId;
  vertName: string;
  books: Product[];
  href: string;
};

export function describeLine(line: CartLine, products: Product[] = catalog.products, packs: Pack[] = catalog.packs): LineView {
  if (line.kind === "pack") {
    const pack = packs.find((p) => p.id === line.id);
    const books = (pack?.bookIds ?? [])
      .map((id) => products.find((p) => p.id === id))
      .filter((p): p is Product => p != null);
    return {
      title: pack?.title || "প্যাকেজ",
      price: pack?.price ?? 0,
      old: pack?.old ?? 0,
      sub: `${bn(books.length)}টি বইয়ের প্যাকেজ`,
      cat: "প্যাকেজ",
      color: "#3D5A4C",
      vertical: "book",
      vertName: "",
      books,
      href: `/pack/${line.id}`,
    };
  }
  const product = products.find((p) => p.id === line.id);
  const offer = product ? offerOf(product) : { price: 0, old: 0 };
  const vertical = product?.vertical ?? "book";
  const vertName = catalog.verticals.find((v) => v.id === vertical)?.name ?? "";
  const cat = product?.sub ? `${product.cat} · ${product.sub}` : product?.cat || "";
  return {
    title: product?.title || "পণ্য",
    price: offer.price,
    old: offer.old,
    sub: product?.unit || product?.author || "",
    cat,
    color: product?.color || "#7A2430",
    image: product?.image,
    vertical,
    vertName,
    books: [],
    href: `/product/${line.id}`,
  };
}
