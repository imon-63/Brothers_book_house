"use client";

import { keepPreviousData, queryOptions, useQuery } from "@tanstack/react-query";
import { ApiError, get } from "./client";

/* ───────────── API shapes (GET /sections, /products, /bundles, /authors, /search/suggest) ───────────── */

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number; pages: number };

export type Ref = { id: string; slug: string; name: string };

export type CategoryDto = {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  productCount: number;
  children: CategoryDto[];
};

export type SectionDto = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  sortOrder: number;
  searchHint: string | null;
  hero: { kicker?: string; title?: string; sub?: string; lead?: string } | null;
  content: { how1?: string; how1p?: string; popular?: string; icon?: string; [k: string]: unknown } | null;
  categories: CategoryDto[];
};

export type StockStatus = "in" | "low" | "out";

export type ProductCardDto = {
  id: string;
  legacyId: number | null;
  slug: string;
  title: string;
  subtitle: string | null;
  unit: string | null;
  section: { id: string; code: string; name: string };
  category: Ref;
  subcategory: Ref | null;
  cover: { url: string | null; alt: string | null; color: string | null };
  price: number;
  compareAt: number | null;
  discountPct: number;
  deal: { endsAt: string } | null;
  /** only on ?upcomingDeal=true lists */
  nextDeal?: { dealPrice: number; startsAt: string; endsAt: string } | null;
  stockStatus: StockStatus;
  rating: { average: number; count: number };
  soldCount: number;
  freeShipping: boolean;
};

export type ProductDetailDto = ProductCardDto & {
  description: string | null;
  images: { id: string; url: string; alt: string | null; isPrimary: boolean; sortOrder: number }[];
  authors: { id: string; slug: string; name: string; nameEn: string | null; role: string }[];
  publisher: Ref | null;
  brand: Ref | null;
  book: { isbn: string | null; pages: number | null; edition: string | null; language: string | null } | null;
  specs: { weightGrams: number | null; warrantyMonths: number | null; attributes: unknown };
  wishlistCount: number;
  seo: { title: string | null; description: string | null };
  related: ProductCardDto[];
};

export type BundleDto = {
  id: string;
  legacyId: number | null;
  slug: string;
  title: string;
  description: string | null;
  section: { id: string; code: string; name: string };
  cover: { url: string | null; alt: string | null };
  price: number;
  compareAt: number | null;
  discountPct: number;
  separatePrice: number;
  saving: number;
  savingPct: number;
  allInStock: boolean;
  freeShipping: boolean;
  soldCount: number;
  itemCount: number;
  items: (ProductCardDto & { quantity: number })[];
};

export type AuthorDto = {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  bio: string | null;
  photoUrl: string | null;
  productCount: number;
  soldCount: number;
  categories: Ref[];
};

export type AuthorPageDto = Omit<AuthorDto, "productCount" | "soldCount" | "categories"> & { products: Page<ProductCardDto> };

export type SuggestDto = {
  query: string;
  products: ProductCardDto[];
  authors: { id: string; slug: string; name: string; productCount: number }[];
  categories: { id: string; slug: string; name: string; section: string; parent: Ref | null }[];
  bundles: { id: string; slug: string; title: string; price: number; compareAt: number | null; cover: { url: string | null; alt: string | null }; itemCount: number }[];
  total: number;
};

/* ───────────── view models the storefront components render ───────────── */

export type Product = {
  id: string;
  /** URL key: legacy numeric id when the product came from the old catalog, else the slug */
  key: string;
  slug: string;
  title: string;
  /** author / brand line */
  author: string;
  unit?: string;
  /** what the customer pays now */
  price: number;
  /** struck-through price (0 = none) */
  old: number;
  /** deal end (ISO) or "" */
  until: string;
  /** a timed deal that has not started yet ("আসছে") */
  soon?: { price: number; from: string; until: string };
  sold: number;
  color: string;
  cat: string;
  catSlug: string;
  sub?: string;
  subSlug?: string;
  desc: string;
  vertical: string;
  vertName: string;
  stockStatus: StockStatus;
  oos: boolean;
  image?: string;
  image2?: string;
  freeShipping: boolean;
  rating: { average: number; count: number };
  pages?: number;
};

export type Pack = {
  id: string;
  key: string;
  slug: string;
  title: string;
  price: number;
  old: number;
  desc: string;
  vertical: string;
  books: Product[];
  oos: boolean;
  separatePrice: number;
  saving: number;
  savingPct: number;
  freeShipping: boolean;
  image?: string;
  sold: number;
};

const FALLBACK_COLOR = "#7A2430";

export function toProduct(p: ProductCardDto): Product {
  return {
    id: p.id,
    key: p.legacyId != null ? String(p.legacyId) : p.slug,
    slug: p.slug,
    title: p.title,
    author: p.subtitle ?? "",
    unit: p.unit ?? undefined,
    price: p.price,
    old: p.compareAt ?? 0,
    until: p.deal?.endsAt ?? "",
    soon: p.nextDeal ? { price: p.nextDeal.dealPrice, from: p.nextDeal.startsAt, until: p.nextDeal.endsAt } : undefined,
    sold: p.soldCount,
    color: p.cover.color || FALLBACK_COLOR,
    cat: p.category?.name ?? "",
    catSlug: p.category?.slug ?? "",
    sub: p.subcategory?.name ?? undefined,
    subSlug: p.subcategory?.slug ?? undefined,
    desc: "",
    vertical: p.section.code,
    vertName: p.section.name,
    stockStatus: p.stockStatus,
    oos: p.stockStatus === "out",
    image: p.cover.url ?? undefined,
    freeShipping: p.freeShipping,
    rating: p.rating,
  };
}

export function toProductDetail(p: ProductDetailDto): Product {
  const base = toProduct(p);
  const pics = [...(p.images ?? [])].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
  return {
    ...base,
    desc: p.description ?? "",
    image: pics[0]?.url ?? base.image,
    image2: pics[1]?.url,
    pages: p.book?.pages ?? undefined,
  };
}

export function toPack(b: BundleDto): Pack {
  const books = b.items.map(toProduct);
  return {
    id: b.id,
    key: b.legacyId != null ? String(b.legacyId) : b.slug,
    slug: b.slug,
    title: b.title,
    price: b.price,
    old: b.compareAt ?? (b.separatePrice > b.price ? b.separatePrice : 0),
    desc: b.description ?? "",
    vertical: b.section.code,
    books,
    oos: !b.allInStock,
    separatePrice: b.separatePrice,
    saving: b.saving,
    savingPct: b.savingPct,
    freeShipping: b.freeShipping,
    image: b.cover.url ?? undefined,
    sold: b.soldCount,
  };
}

/** Effective price + deal state for a card (deal hides itself once the clock runs out). */
export function offerOf(p: Pick<Product, "price" | "old" | "until">, now = Date.now()) {
  const on = Boolean(p.until) && Date.parse(p.until) > now;
  return { price: p.price, old: p.old, until: on ? p.until : "", on };
}

export function productHref(p: Pick<Product, "key">) {
  return `/product/${encodeURIComponent(p.key)}`;
}
export function packHref(p: Pick<Pack, "key">) {
  return `/pack/${encodeURIComponent(p.key)}`;
}
export function shopHref(cat: string, sub?: string) {
  const q = new URLSearchParams({ cat });
  if (sub) q.set("sub", sub);
  return `/shop?${q.toString()}`;
}

/* ───────────── queries ───────────── */

const STALE = 60_000;

export const sectionsQuery = queryOptions({
  queryKey: ["sections"],
  queryFn: () => get<SectionDto[]>("/sections"),
  staleTime: 5 * 60_000,
});

export function useSections() {
  return useQuery(sectionsQuery);
}

export type ProductQuery = {
  section?: string;
  category?: string;
  subcategory?: string;
  author?: string;
  q?: string;
  sort?: "relevance" | "popular" | "new" | "price_asc" | "price_desc" | "rating";
  inStock?: boolean;
  onDeal?: boolean;
  upcomingDeal?: boolean;
  page?: number;
  pageSize?: number;
};

export function productsQuery(params: ProductQuery) {
  return queryOptions({
    queryKey: ["products", params],
    queryFn: async () => {
      const res = await get<Page<ProductCardDto>>("/products", params);
      return { ...res, items: res.items.map(toProduct) };
    },
    staleTime: STALE,
  });
}

export function useProducts(params: ProductQuery, enabled = true) {
  return useQuery({ ...productsQuery(params), enabled, placeholderData: keepPreviousData });
}

export function productQuery(idOrSlug: string) {
  return queryOptions({
    queryKey: ["product", idOrSlug],
    queryFn: async () => {
      const dto = await get<ProductDetailDto>(`/products/${encodeURIComponent(idOrSlug)}`);
      return { dto, product: toProductDetail(dto), related: dto.related.map(toProduct) };
    },
    staleTime: STALE,
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
}

export function useProduct(idOrSlug: string | null | undefined) {
  return useQuery({ ...productQuery(idOrSlug ?? ""), enabled: !!idOrSlug });
}

export function bundlesQuery(params: { section?: string; page?: number; pageSize?: number; q?: string }) {
  return queryOptions({
    queryKey: ["bundles", params],
    queryFn: async () => {
      const res = await get<Page<BundleDto>>("/bundles", params);
      return { ...res, items: res.items.map(toPack) };
    },
    staleTime: STALE,
  });
}

export function useBundles(params: { section?: string; page?: number; pageSize?: number; q?: string }, enabled = true) {
  return useQuery({ ...bundlesQuery(params), enabled });
}

export function bundleQuery(idOrSlug: string) {
  return queryOptions({
    queryKey: ["bundle", idOrSlug],
    queryFn: async () => toPack(await get<BundleDto>(`/bundles/${encodeURIComponent(idOrSlug)}`)),
    staleTime: STALE,
    retry: (n, err) => !(err instanceof ApiError && err.status === 404) && n < 2,
  });
}

export function useBundle(idOrSlug: string | null | undefined) {
  return useQuery({ ...bundleQuery(idOrSlug ?? ""), enabled: !!idOrSlug });
}

export function useAuthors(params: { section?: string; category?: string; q?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["authors", params],
    queryFn: () => get<Page<AuthorDto>>("/authors", params),
    staleTime: STALE,
  });
}

/** Author page by slug; falls back to a name search so older /authors/<name> links still open. */
export function useAuthor(slugOrName: string, params: { page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: ["author", slugOrName, params],
    enabled: !!slugOrName,
    staleTime: STALE,
    retry: false,
    queryFn: async () => {
      const load = async (slug: string) => {
        const dto = await get<AuthorPageDto>(`/authors/${encodeURIComponent(slug)}`, params);
        return { ...dto, books: dto.products.items.map(toProduct) };
      };
      try {
        return await load(slugOrName);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        const hit = await get<Page<AuthorDto>>("/authors", { q: slugOrName, pageSize: 1 });
        if (!hit.items[0]) return null;
        return load(hit.items[0].slug);
      }
    },
  });
}

export function useSuggest(q: string, section?: string) {
  const text = q.trim();
  return useQuery({
    queryKey: ["suggest", text, section],
    enabled: text.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => get<SuggestDto>("/search/suggest", { q: text, section, limit: 7 }, { signal }),
  });
}
