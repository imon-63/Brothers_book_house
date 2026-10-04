/**
 * Per-section home page layout — which blocks show, in what order, with what
 * heading. Stored in `section.content.home` (no migration: the section's
 * content JSON is already public via GET /sections), edited from
 * Admin → হোম পেজ. The banner (hero) is always first and is not listed here.
 */

export type HomeBlockKey = "deals" | "categories" | "popular" | "bundles" | "fresh" | "authors" | "how" | "help";

export type HomeBlock = { key: HomeBlockKey; on: boolean; title?: string };

/** "auto": timed deals + any marked-down product · "timed": only products with a running timer */
export type DealMode = "auto" | "timed";

export type HomeLayout = { blocks: HomeBlock[]; dealMode: DealMode };

export const HOME_BLOCKS: Record<HomeBlockKey, { bn: string; en: string; desc: string; titled?: boolean; only?: string[] }> = {
  deals: { bn: "আজকের ছাড়", en: "Today's deals", desc: "টাইমার দেওয়া ছাড় · কাউন্টডাউন ঘড়িসহ", titled: true },
  categories: { bn: "ক্যাটাগরি", en: "Categories", desc: "ক্যাটাগরির ছবিসহ টাইল" },
  popular: { bn: "জনপ্রিয়", en: "Popular", desc: "সবচেয়ে বেশি বিক্রি হওয়া পণ্য", titled: true },
  bundles: { bn: "প্যাকেজ", en: "Bundles", desc: "একসাথে কিনলে সাশ্রয় · প্যাকেজ থাকলে দেখাবে" },
  fresh: { bn: "নতুন এসেছে", en: "New arrivals", desc: "সদ্য যোগ হওয়া পণ্য", titled: true },
  authors: { bn: "লেখক স্পটলাইট", en: "Authors", desc: "জনপ্রিয় লেখকরা", only: ["book"] },
  how: { bn: "কীভাবে অর্ডার করবেন", en: "How to order", desc: "৩ ধাপে অর্ডারের নিয়ম" },
  help: { bn: "সাহায্য", en: "Help band", desc: "হেল্পলাইন, হোয়াটসঅ্যাপ, চ্যাট" },
};

export const DEFAULT_ORDER: HomeBlockKey[] = ["deals", "categories", "popular", "bundles", "fresh", "authors", "how", "help"];

/** Blocks that make sense for this section (authors → books only). */
export function blocksFor(code: string): HomeBlockKey[] {
  return DEFAULT_ORDER.filter((k) => !HOME_BLOCKS[k].only || HOME_BLOCKS[k].only!.includes(code));
}

/**
 * Stored layout merged over the defaults: unknown keys dropped, blocks added
 * later (or never saved) appended at the end switched on.
 */
export function readHomeLayout(content: Record<string, unknown> | null | undefined, code: string): HomeLayout {
  const raw = (content?.home ?? null) as { blocks?: unknown; dealMode?: unknown } | null;
  const allowed = new Set(blocksFor(code));
  const seen = new Set<HomeBlockKey>();
  const blocks: HomeBlock[] = [];
  if (raw && Array.isArray(raw.blocks)) {
    for (const b of raw.blocks as Partial<HomeBlock>[]) {
      const key = b?.key as HomeBlockKey;
      if (!key || !allowed.has(key) || seen.has(key)) continue;
      seen.add(key);
      const title = typeof b.title === "string" && b.title.trim() ? b.title.trim().slice(0, 60) : undefined;
      blocks.push({ key, on: b.on !== false, ...(title ? { title } : {}) });
    }
  }
  for (const key of allowed) if (!seen.has(key)) blocks.push({ key, on: true });
  return { blocks, dealMode: raw?.dealMode === "timed" ? "timed" : "auto" };
}
