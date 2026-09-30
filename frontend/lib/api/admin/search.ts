"use client";

/** Command-palette search — fans out to orders / customers / products with q= (small pages). */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { adminKeys, type Paged } from "./core";

export type SearchOrder = { id: string; orderNo: string; status: string; customer: { id: string | null; name: string | null; phone: string | null } | null; items: { title: string; quantity: number }[]; grandTotal: number };
export type SearchCustomer = { id: string; name: string; phone: string | null; email: string | null; ordersCount: number; totalSpent: number };
export type SearchProduct = { id: string; title: string; authorLine: string | null; unit: string | null; category: { name: string } | null; cover: { url: string | null } | null; price: number; stock: { onHand: number } | null };

export type AdminSearch = { orders: SearchOrder[]; customers: SearchCustomer[]; products: SearchProduct[] };

export function useAdminSearch(q: string, enabled: boolean) {
  const term = q.trim();
  return useQuery<AdminSearch>({
    queryKey: adminKeys.search(term),
    enabled,
    staleTime: 20_000,
    placeholderData: (prev: AdminSearch | undefined) => prev,
    queryFn: async ({ signal }): Promise<AdminSearch> => {
      const size = term ? 8 : 6;
      const [orders, customers, products] = await Promise.all([
        get<Paged<SearchOrder>>("/admin/orders", { q: term || undefined, pageSize: size }, { signal }).catch(() => null),
        term ? get<Paged<SearchCustomer>>("/admin/customers", { q: term, pageSize: size }, { signal }).catch(() => null) : null,
        term ? get<Paged<SearchProduct>>("/admin/products", { q: term, pageSize: size }, { signal }).catch(() => null) : null,
      ]);
      return { orders: orders?.items ?? [], customers: customers?.items ?? [], products: products?.items ?? [] };
    },
  });
}
