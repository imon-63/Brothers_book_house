/** Cap on tokens so a pasted paragraph cannot build a huge query. */
export const MAX_SEARCH_TOKENS = 6;

/** Collapse whitespace, NFC-normalise (Bangla combining marks), trim. */
export function normaliseQuery(q: string | null | undefined): string {
  return (q ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * Tokens every hit must contain (same rule as the storefront search box:
 * all words must match, in any order). Deduplicated, longest first.
 */
export function searchTokens(q: string | null | undefined): string[] {
  const norm = normaliseQuery(q).toLowerCase();
  if (!norm) return [];
  return [...new Set(norm.split(' ').filter(Boolean))].sort((a, b) => b.length - a.length).slice(0, MAX_SEARCH_TOKENS);
}

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function containsPattern(token: string): string {
  return `%${escapeLike(token)}%`;
}
