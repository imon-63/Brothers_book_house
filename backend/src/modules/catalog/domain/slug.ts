import { slugify } from '@/common/utils/text';

/** Slug from a title, or `fallback` when the title has no letters/digits at all. */
export function slugBase(input: string, fallback = 'item', maxLength = 180): string {
  const s = slugify(input).slice(0, maxLength).replace(/-+$/g, '');
  return s || fallback;
}

/**
 * First free slug among base, base-2, base-3 … given the slugs already taken.
 * The suffix is kept inside `maxLength` by trimming the base.
 */
export function pickUniqueSlug(base: string, taken: Iterable<string>, maxLength = 200): string {
  const used = new Set(taken);
  const root = base.slice(0, maxLength);
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, maxLength - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Slug to park on a soft-deleted row so its original slug can be reused. */
export function tombstoneSlug(slug: string, id: string, maxLength = 120): string {
  const tag = `~del-${id.replace(/-/g, '').slice(-8)}`;
  return `${slug.slice(0, maxLength - tag.length)}${tag}`;
}
