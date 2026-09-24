import { catalog } from "./data";
import type { Catalog, Product, VerticalId } from "./types";

/** Catalog reads go through this module so React Query can later point at an API. */
export async function fetchCatalog(): Promise<Catalog> {
  return catalog;
}

export async function fetchProducts(vertical: VerticalId): Promise<Product[]> {
  return catalog.products
    .filter((p) => p.vertical === vertical)
    .sort((a, b) => b.sold - a.sold);
}

export async function fetchProduct(id: number): Promise<Product | null> {
  return catalog.products.find((p) => p.id === id) ?? null;
}
