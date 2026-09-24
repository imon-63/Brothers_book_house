import { queryOptions } from "@tanstack/react-query";
import { fetchCatalog, fetchProduct, fetchProducts } from "./api";
import type { VerticalId } from "./types";

export const catalogQuery = queryOptions({
  queryKey: ["catalog"],
  queryFn: fetchCatalog,
});

export function productsQuery(vertical: VerticalId) {
  return queryOptions({
    queryKey: ["products", vertical],
    queryFn: () => fetchProducts(vertical),
  });
}

export function productQuery(id: number) {
  return queryOptions({
    queryKey: ["product", id],
    queryFn: () => fetchProduct(id),
  });
}
