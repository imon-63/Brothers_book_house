"use client";

/** পণ্য — /admin/products (+summary, export, bulk, duplicate, restore), deals, stock, media */

import { useQuery } from "@tanstack/react-query";
import { del, download, get, patch, post } from "@/lib/api/client";
import { adminKeys, isoDay, useAdminMutation, type Paged } from "./core";

export type Quick = "all" | "low" | "out" | "deal" | "nocost" | "free" | "hidden";
export type ProductSort = "name" | "price" | "stock" | "sold" | "margin" | "new";

export type AdminProductRow = {
  id: string;
  legacyId: number | null;
  slug: string;
  title: string;
  subtitle: string | null;
  unit: string | null;
  section: { id: string; code: string; name: string };
  category: { id: string; slug: string; name: string } | null;
  subcategory: { id: string; slug: string; name: string } | null;
  cover: { url: string | null; alt: string | null; color: string | null };
  price: number;
  compareAt: number | null;
  soldCount: number;
  freeShipping: boolean;
  sku: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  regularPrice: number;
  storedCompareAt: number | null;
  costPrice: number | null;
  marginPct: number | null;
  deal: { id: string; dealPrice: number; startsAt: string; endsAt: string; label: string | null } | null;
  stock: { onHand: number; reserved: number; available: number; threshold: number; initialCopies: number; status: "in" | "low" | "out"; tracked: boolean };
  authorLine: string | null;
  categoryHidden: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AdminProductDetail = AdminProductRow & {
  description: string | null;
  images: { id: string; url: string; alt: string | null; isPrimary: boolean; sortOrder: number }[];
  authors: { id: string; name: string }[];
  categoryId: string;
  subcategoryId: string | null;
  deals: { id: string; dealPrice: number; startsAt: string; endsAt: string; cancelledAt?: string | null; label: string | null }[];
};

export type ProductSummary = { counts: Record<Quick, number>; units: number; stockValue: number; retailValue: number };

export type StockMovement = {
  id: string;
  type: "OPENING" | "PURCHASE_RECEIPT" | "ORDER_RESERVE" | "ORDER_RELEASE" | "ORDER_FULFILL" | "RETURN_RESTOCK" | "ADJUSTMENT" | "DAMAGE" | "WRITE_OFF";
  onHandDelta: number;
  reservedDelta: number;
  balanceAfter: number;
  unitCost: number | null;
  note: string | null;
  order: { id: string; orderNo: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
};

export type ProductFilter = {
  section?: string;
  q?: string;
  category?: string;
  subcategory?: string;
  quick?: Quick;
  lowStock?: number;
  sort?: ProductSort;
  order?: "asc" | "desc";
  deleted?: boolean;
};

const clean = <T extends object>(f: T) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== "" && v !== "all")) as Partial<T>;

export function useAdminProducts(filter: ProductFilter, page: number, pageSize: number) {
  const f = clean(filter);
  return useQuery({
    queryKey: [...adminKeys.products, "list", f, page, pageSize],
    placeholderData: (prev) => prev,
    queryFn: () => get<Paged<AdminProductRow>>("/admin/products", { ...f, page, pageSize }),
  });
}

export function useProductSummary(filter: Pick<ProductFilter, "section" | "lowStock">) {
  const f = clean(filter);
  return useQuery({ queryKey: [...adminKeys.products, "summary", f], placeholderData: (p) => p, queryFn: () => get<ProductSummary>("/admin/products/summary", f) });
}

export function useAdminProduct(id: string | null) {
  return useQuery({ queryKey: [...adminKeys.products, "detail", id], enabled: !!id, queryFn: () => get<AdminProductDetail>(`/admin/products/${id}`) });
}

export function useStockMovements(id: string | null, pageSize = 100) {
  return useQuery({
    queryKey: [...adminKeys.products, "movements", id, pageSize],
    enabled: !!id,
    queryFn: () => get<Paged<StockMovement>>(`/admin/products/${id}/stock/movements`, { pageSize }),
  });
}

export function exportProducts(filter: ProductFilter) {
  return download("/admin/products/export.csv", `products-${filter.section ?? "all"}-${isoDay()}.csv`, clean(filter));
}

/* ───────── mutations ───────── */

const fallout = [adminKeys.products, ["admin", "dashboard"], adminKeys.sections, adminKeys.categoriesAll, adminKeys.bundles];

export type ProductPatch = {
  title?: string; subtitle?: string | null; unit?: string | null; description?: string | null;
  categoryId?: string; subcategoryId?: string | null; price?: number; compareAtPrice?: number | null; costPrice?: number | null;
  freeShipping?: boolean; coverColor?: string | null; status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
};

function patchRow(old: unknown, id: string, body: ProductPatch): unknown {
  const c = old as Paged<AdminProductRow> | AdminProductDetail | undefined;
  if (!c) return old;
  const fix = <T extends AdminProductRow>(r: T): T => {
    if (r.id !== id) return r;
    return {
      ...r,
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.subtitle !== undefined ? { authorLine: body.subtitle, subtitle: body.subtitle } : {}),
      ...(body.price !== undefined ? { regularPrice: body.price, price: r.deal ? r.price : body.price } : {}),
      ...(body.compareAtPrice !== undefined ? { storedCompareAt: body.compareAtPrice } : {}),
      ...(body.costPrice !== undefined ? { costPrice: body.costPrice } : {}),
      ...(body.freeShipping !== undefined ? { freeShipping: body.freeShipping } : {}),
    };
  };
  if ("items" in c && Array.isArray(c.items)) return { ...c, items: c.items.map(fix) };
  if ("id" in c) return fix(c as AdminProductDetail);
  return old;
}

/** Inline patch with optimistic lock (`version`). */
export function usePatchProduct() {
  return useAdminMutation<{ id: string; version: number; body: ProductPatch; toast?: string | null }, AdminProductDetail>({
    fn: ({ id, version, body }) => patch<AdminProductDetail>(`/admin/products/${id}`, { ...body, version }),
    invalidate: fallout,
    success: (_d, v) => (v.toast === undefined ? null : v.toast),
    optimistic: { key: adminKeys.products, patch: (old, v) => patchRow(old, v.id, v.body) },
  });
}

export type CreateProductInput = ProductPatch & { categoryId: string; title: string; price: number; initialCopies?: number; imageIds?: string[] };

export function useCreateProduct() {
  return useAdminMutation<CreateProductInput & { toast?: string }, AdminProductDetail>({
    fn: ({ toast: _t, ...body }) => post<AdminProductDetail>("/admin/products", body),
    invalidate: fallout,
    success: (_d, v) => v.toast ?? "পণ্য যোগ হয়েছে",
  });
}

export function useDuplicateProduct() {
  return useAdminMutation<{ id: string }, AdminProductDetail>({
    fn: ({ id }) => post<AdminProductDetail>(`/admin/products/${id}/duplicate`),
    invalidate: fallout,
    success: "কপি তৈরি হয়েছে · তালিকার শুরুতে",
  });
}

export function useDeleteProducts() {
  return useAdminMutation<{ ids: string[] }, unknown>({
    fn: ({ ids }) => (ids.length === 1 ? del(`/admin/products/${ids[0]}`) : post("/admin/products/bulk/delete", { ids })),
    invalidate: fallout,
    success: (_d, v) => (v.ids.length > 1 ? `${v.ids.length}টি মুছে ফেলা হয়েছে` : "মুছে ফেলা হয়েছে"),
  });
}

export function useRestoreProduct() {
  return useAdminMutation<{ id: string }, unknown>({
    fn: ({ id }) => post(`/admin/products/${id}/restore`),
    invalidate: fallout,
    success: "পণ্য ফিরিয়ে আনা হয়েছে",
  });
}

export function useBulkProducts() {
  return useAdminMutation<
    | { kind: "price"; ids: string[]; percent: number; direction: "up" | "down"; toast: string }
    | { kind: "discount"; ids: string[]; percent: number; toast: string }
    | { kind: "restock"; ids: string[]; units: number; note?: string; toast: string }
    | { kind: "free-shipping"; ids: string[]; freeShipping: boolean; toast: string }
    | { kind: "move"; ids: string[]; categoryId: string; subcategoryId?: string; toast: string },
    unknown
  >({
    fn: ({ kind, toast: _t, ...body }) => post(`/admin/products/bulk/${kind}`, body),
    invalidate: fallout,
    success: (_d, v) => v.toast,
  });
}

export function useAdjustStock() {
  return useAdminMutation<{ id: string; onHand: number; reason: string; type?: "ADJUSTMENT" | "DAMAGE" | "WRITE_OFF"; toast?: string }, unknown>({
    fn: ({ id, onHand, reason, type }) => post(`/admin/products/${id}/stock/adjust`, { onHand, reason, type }),
    invalidate: fallout,
    success: (_d, v) => v.toast ?? "স্টক আপডেট হয়েছে",
  });
}

export function useCreateDeal() {
  return useAdminMutation<{ id: string; dealPrice: number; endsAt: string; startsAt?: string; replaceExisting?: boolean }, unknown>({
    fn: ({ id, dealPrice, endsAt, startsAt, replaceExisting }) => post(`/admin/products/${id}/deals`, { dealPrice, endsAt, ...(startsAt ? { startsAt } : {}), replaceExisting: replaceExisting ?? true }),
    invalidate: fallout,
    success: (_r, v) => (v.startsAt ? "ছাড় শিডিউল হয়েছে · সময় হলে নিজে থেকে শুরু হবে" : "টাইমার বসেছে · সময় শেষে আগের দামে ফিরবে"),
  });
}

export function useCancelDeal() {
  return useAdminMutation<{ dealId: string }, unknown>({
    fn: ({ dealId }) => post(`/admin/deals/${dealId}/cancel`),
    invalidate: fallout,
    success: "টাইমার সরানো হয়েছে · আগের দাম",
  });
}

export type Media = { id: string; url: string; alt: string | null };

/** POST /admin/media (multipart) → media id to attach. */
export function uploadMedia(file: File, alt?: string) {
  const fd = new FormData();
  fd.append("file", file);
  if (alt) fd.append("alt", alt);
  return post<Media>("/admin/media", fd);
}

/** Upload + attach as the cover of an existing product. */
export function useUploadProductImage() {
  return useAdminMutation<{ id: string; file: File }, unknown>({
    fn: async ({ id, file }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await post<{ id?: string; mediaId?: string }>(`/admin/products/${id}/images/upload`, fd);
      const mediaId = res?.mediaId ?? res?.id;
      if (mediaId) await post(`/admin/products/${id}/images/${mediaId}/primary`).catch(() => undefined);
      return res;
    },
    invalidate: fallout,
    success: "ছবি বদলানো হয়েছে",
  });
}

export function useRemoveProductImage() {
  return useAdminMutation<{ id: string; mediaId: string }, unknown>({
    fn: ({ id, mediaId }) => del(`/admin/products/${id}/images/${mediaId}`),
    invalidate: fallout,
    success: "ছবি সরানো হয়েছে",
  });
}

/* ───────── timed deals (আজকের ছাড়) ───────── */

export type AdminDeal = {
  id: string;
  product: { id: string; title: string; sku: string; section: string; regularPrice: number; cover: string | null };
  dealPrice: number;
  discountPct: number;
  label: string | null;
  startsAt: string;
  endsAt: string;
  state: "live" | "scheduled" | "ended" | "cancelled";
  secondsLeft: number | null;
};

/** Running (or upcoming) timed deals for one section — what "আজকের ছাড়" shows first. */
export function useSectionDeals(section: string, state: "active" | "scheduled" = "active") {
  return useQuery({
    queryKey: [...adminKeys.products, "deals", section, state],
    queryFn: () => get<Paged<AdminDeal>>("/admin/deals", { section, state, pageSize: 100 }),
  });
}
