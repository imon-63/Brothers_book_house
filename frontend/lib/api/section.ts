"use client";

import { useMemo } from "react";
import { useAppSelector } from "@/store/hooks";
import { useSections, type CategoryDto, type SectionDto } from "./catalog";
import { readHomeLayout, type HomeLayout } from "@/lib/home-layout";

export type CatNode = { name: string; slug: string; count: number; subs: { name: string; slug: string; count: number }[] };

/** What the header, hero and home page need for one বিভাগ. */
export type SectionView = {
  code: string;
  name: string;
  search: string;
  kicker: string;
  title: string;
  sub: string;
  lead: string;
  popular: string;
  how1: string;
  how1p: string;
  /** emoji / short glyph from section.content.icon (for codes without a built-in icon) */
  icon: string | null;
  tree: CatNode[];
  /** admin-arranged home page (Admin → হোম পেজ) */
  home: HomeLayout;
};

function toTree(cats: CategoryDto[]): CatNode[] {
  return cats.map((c) => ({
    name: c.name,
    slug: c.slug,
    count: c.productCount,
    subs: (c.children ?? []).map((s) => ({ name: s.name, slug: s.slug, count: s.productCount })),
  }));
}

export function toSectionView(s: SectionDto): SectionView {
  const hero = s.hero ?? {};
  const content = s.content ?? {};
  return {
    code: s.code,
    name: s.name,
    search: s.searchHint || `${s.name} খুঁজুন`,
    kicker: hero.kicker || `চলো · ${s.name}`,
    title: hero.title || s.name,
    sub: hero.sub || "",
    lead: hero.lead || "",
    popular: content.popular || `জনপ্রিয় ${s.name}`,
    how1: content.how1 || "পণ্য বাছুন",
    how1p: content.how1p || "ক্যাটাগরি বা সার্চ থেকে পছন্দের পণ্য কার্টে দিন।",
    icon: typeof content.icon === "string" && content.icon ? content.icon : null,
    tree: toTree(s.categories ?? []),
    home: readHomeLayout(content, s.code),
  };
}

const EMPTY: SectionView = {
  code: "book",
  name: "",
  search: "খুঁজুন",
  kicker: "",
  title: "",
  sub: "",
  lead: "",
  popular: "",
  how1: "",
  how1p: "",
  icon: null,
  tree: [],
  home: readHomeLayout(null, "book"),
};

/**
 * Current storefront section (ui.section) resolved against GET /sections.
 * Hidden sections never come back from the API, so they simply vanish.
 */
export function useSection() {
  const code = useAppSelector((s) => s.ui.section);
  const q = useSections();
  const sections = useMemo(() => (q.data ?? []).map(toSectionView), [q.data]);
  const section = sections.find((s) => s.code === code) ?? sections[0] ?? { ...EMPTY, code };
  /** find a category / sub-category by slug inside the current section */
  function findCat(slug: string) {
    for (const node of section.tree) {
      if (node.slug === slug) return { node, sub: null };
      const sub = node.subs.find((s) => s.slug === slug);
      if (sub) return { node, sub };
    }
    return null;
  }
  return { code: section.code, section, sections, loading: q.isLoading, error: q.error, findCat };
}
