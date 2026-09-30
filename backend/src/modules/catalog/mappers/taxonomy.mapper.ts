import type { Category, Section } from '@prisma/client';
import type { CategoryNode } from '../domain/category-tree';

type CatWithImage = Category & { image: { url: string } | null };

export function toCategoryView(c: CatWithImage & { productCount: number }) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.nameBn,
    nameEn: c.nameEn,
    description: c.description,
    imageUrl: c.image?.url ?? null,
    sortOrder: c.sortOrder,
    productCount: c.productCount,
  };
}

export function toCategoryTreeView(nodes: CategoryNode<CatWithImage>[]) {
  return nodes.map((n) => ({ ...toCategoryView(n), children: n.children.map(toCategoryView) }));
}

export function toAdminCategoryTreeView(nodes: CategoryNode<CatWithImage>[]) {
  const one = (c: CatWithImage & { productCount: number }) => ({
    ...toCategoryView(c),
    parentId: c.parentId,
    isVisible: c.isVisible,
    imageId: c.imageId,
    updatedAt: c.updatedAt.toISOString(),
  });
  return nodes.map((n) => ({ ...one(n), children: n.children.map(one) }));
}

export function toSectionView(s: Section) {
  return {
    id: s.id,
    code: s.code,
    name: s.nameBn,
    nameEn: s.nameEn,
    sortOrder: s.sortOrder,
    searchHint: s.searchHint,
    hero: { kicker: s.heroKicker, title: s.heroTitle, sub: s.heroSub, lead: s.heroLead },
    content: s.content,
  };
}

export function toAdminSectionView(s: Section, counts: { categories: number; products: number; hiddenCategories: number }) {
  return { ...toSectionView(s), isVisible: s.isVisible, ...counts, updatedAt: s.updatedAt.toISOString() };
}
