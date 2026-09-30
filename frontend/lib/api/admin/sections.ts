"use client";

/** বিভাগ ও ক্যাটাগরি — /admin/sections, /admin/sections/:id/categories, /admin/categories */

import { useQuery } from "@tanstack/react-query";
import { del, get, patch, post } from "@/lib/api/client";
import { adminKeys, useAdminMutation } from "./core";

export type SectionContent = { icon?: string; color?: string; popular?: string; how1?: string; how1p?: string; [k: string]: unknown };

export type AdminSection = {
  id: string;
  code: string;
  name: string;
  nameEn: string;
  sortOrder: number;
  searchHint: string | null;
  hero: { kicker: string | null; title: string | null; sub: string | null; lead: string | null };
  content: SectionContent | null;
  isVisible: boolean;
  categories: number;
  hiddenCategories: number;
  products: number;
  updatedAt: string;
};

export type CreateSectionInput = {
  code: string;
  nameBn: string;
  nameEn: string;
  searchHint?: string;
  heroKicker?: string;
  heroTitle?: string;
  heroSub?: string;
  heroLead?: string;
  content?: SectionContent;
  isVisible?: boolean;
};
export type UpdateSectionInput = Partial<Omit<CreateSectionInput, "code">> & { sortOrder?: number };

export type AdminCategory = {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  productCount: number;
  parentId: string | null;
  isVisible: boolean;
  imageId: string | null;
  updatedAt: string;
};
export type AdminCategoryNode = AdminCategory & { children: AdminCategory[] };
export type CategoryTree = { section: { id: string; code: string; name: string; isVisible: boolean }; categories: AdminCategoryNode[] };

/* ───────── sections ───────── */

export function useSections() {
  return useQuery({ queryKey: adminKeys.sections, queryFn: () => get<AdminSection[]>("/admin/sections"), staleTime: 5 * 60_000 });
}

/** Everything that shows section names/counts. */
const sectionFallout = [adminKeys.sections, adminKeys.categoriesAll, adminKeys.products, ["admin", "dashboard"]];

export function useCreateSection() {
  return useAdminMutation<CreateSectionInput, AdminSection>({
    fn: (body) => post<AdminSection>("/admin/sections", body),
    invalidate: sectionFallout,
    quietError: true, // the modal shows the API's messages inline
    success: (s) => `নতুন বিভাগ «${s.name}» যোগ হয়েছে${s.isVisible ? "" : " · এখনো লুকানো"}`,
  });
}

export function useUpdateSection() {
  return useAdminMutation<{ id: string; body: UpdateSectionInput & { isVisible?: boolean }; toast?: string }, AdminSection>({
    fn: ({ id, body }) => patch<AdminSection>(`/admin/sections/${id}`, body),
    invalidate: sectionFallout,
    success: (_s, v) => v.toast ?? "বিভাগ আপডেট হয়েছে",
    optimistic: {
      key: adminKeys.sections,
      patch: (old, { id, body }) =>
        (old as AdminSection[]).map((s) =>
          s.id !== id ? s : {
            ...s,
            ...(body.isVisible !== undefined ? { isVisible: body.isVisible } : {}),
            ...(body.nameBn ? { name: body.nameBn } : {}),
            ...(body.nameEn ? { nameEn: body.nameEn } : {}),
            ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
            ...(body.content ? { content: { ...(s.content ?? {}), ...body.content } } : {}),
          }),
    },
  });
}

export function useDeleteSection() {
  return useAdminMutation<{ id: string; name: string }, { ok: true }>({
    fn: ({ id }) => del<{ ok: true }>(`/admin/sections/${id}`),
    invalidate: sectionFallout,
    success: (_d, v) => `বিভাগ «${v.name}» মুছে ফেলা হয়েছে`,
  });
}

/* ───────── categories ───────── */

export function useCategoryTree(sectionId: string | null | undefined) {
  return useQuery({
    queryKey: adminKeys.categories(sectionId ?? ""),
    enabled: !!sectionId,
    queryFn: () => get<CategoryTree>(`/admin/sections/${sectionId}/categories`),
  });
}

export type CreateCategoryInput = { sectionId: string; parentId?: string; nameBn: string; nameEn?: string; slug?: string; description?: string; imageId?: string; isVisible?: boolean; sortOrder?: number };
export type UpdateCategoryInput = Partial<Pick<CreateCategoryInput, "nameBn" | "nameEn" | "slug" | "description" | "imageId" | "isVisible" | "sortOrder">>;

const catFallout = [adminKeys.categoriesAll, adminKeys.sections, adminKeys.products];

export function useCreateCategory() {
  return useAdminMutation<CreateCategoryInput & { toast?: string }, AdminCategory>({
    fn: ({ toast: _t, ...body }) => post<AdminCategory>("/admin/categories", body),
    invalidate: catFallout,
    success: (_c, v) => v.toast ?? (v.parentId ? "সাব-ক্যাটাগরি যোগ হয়েছে" : "ক্যাটাগরি যোগ হয়েছে"),
  });
}

function patchTree(old: unknown, id: string, body: UpdateCategoryInput): unknown {
  const t = old as CategoryTree | undefined;
  if (!t?.categories) return old;
  const fix = <C extends AdminCategory>(c: C): C => (c.id === id ? { ...c, ...(body.isVisible !== undefined ? { isVisible: body.isVisible } : {}), ...(body.nameBn ? { name: body.nameBn } : {}) } : c);
  return { ...t, categories: t.categories.map((n) => ({ ...fix(n), children: n.children.map(fix) })) };
}

export function useUpdateCategory() {
  return useAdminMutation<{ id: string; body: UpdateCategoryInput; toast?: string }, AdminCategory>({
    fn: ({ id, body }) => patch<AdminCategory>(`/admin/categories/${id}`, body),
    invalidate: catFallout,
    success: (_c, v) => v.toast ?? "ক্যাটাগরি আপডেট হয়েছে",
    optimistic: { key: adminKeys.categoriesAll, patch: (old, v) => patchTree(old, v.id, v.body) },
  });
}

export function useDeleteCategory() {
  return useAdminMutation<{ id: string; toast?: string }, unknown>({
    fn: ({ id }) => del(`/admin/categories/${id}`),
    invalidate: catFallout,
    success: (_d, v) => v.toast ?? "ক্যাটাগরি মুছেছে",
  });
}

export function useReorderCategories() {
  return useAdminMutation<{ ids: string[] }, unknown>({
    fn: (body) => post("/admin/categories/reorder", body),
    invalidate: [adminKeys.categoriesAll],
  });
}

export function useSectionCategoriesVisibility() {
  return useAdminMutation<{ sectionId: string; isVisible: boolean; includeSubcategories?: boolean; toast?: string }, unknown>({
    fn: ({ sectionId, isVisible, includeSubcategories }) => post(`/admin/sections/${sectionId}/categories/visibility`, { isVisible, includeSubcategories: includeSubcategories ?? true }),
    invalidate: catFallout,
    success: (_d, v) => v.toast ?? (v.isVisible ? "সব ক্যাটাগরি আবার দেখা যাচ্ছে" : "সব ক্যাটাগরি লুকানো হয়েছে"),
  });
}
