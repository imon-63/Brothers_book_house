/**
 * Review eligibility and rating maths (pure).
 *
 * • A customer who received the product (DELIVERED order containing it) gets a
 *   "verified purchase" review tied to that order line — one review per line.
 * • A customer without a delivered line may leave ONE unverified review per product.
 * • Blocked customers cannot review.
 */
export type DeliveredLine = { orderItemId: string; orderId: string; deliveredAt: Date | null };
export type ExistingReview = { orderItemId: string | null };

export type ReviewDecision =
  | { ok: true; verified: true; orderItemId: string; orderId: string }
  | { ok: true; verified: false; orderItemId: null; orderId: null }
  | { ok: false; code: 'review.already_reviewed' | 'review.blocked'; message: string };

export function decideReview(input: { blocked: boolean; delivered: DeliveredLine[]; existing: ExistingReview[] }): ReviewDecision {
  if (input.blocked) return { ok: false, code: 'review.blocked', message: 'আপনার অ্যাকাউন্ট থেকে রিভিউ দেওয়া যাচ্ছে না' };
  const used = new Set(input.existing.map((r) => r.orderItemId).filter((x): x is string => !!x));
  // newest delivery first → the review describes the most recent purchase
  const free = [...input.delivered]
    .sort((a, b) => (b.deliveredAt?.getTime() ?? 0) - (a.deliveredAt?.getTime() ?? 0))
    .find((l) => !used.has(l.orderItemId));
  if (free) return { ok: true, verified: true, orderItemId: free.orderItemId, orderId: free.orderId };
  if (input.delivered.length) {
    return { ok: false, code: 'review.already_reviewed', message: 'এই পণ্যের প্রতিটি কেনার জন্য আপনি রিভিউ দিয়েছেন' };
  }
  if (input.existing.some((r) => r.orderItemId === null)) {
    return { ok: false, code: 'review.already_reviewed', message: 'এই পণ্যে আপনি আগেই রিভিউ দিয়েছেন' };
  }
  return { ok: true, verified: false, orderItemId: null, orderId: null };
}

export type RatingSummary = { average: number; count: number; breakdown: Record<1 | 2 | 3 | 4 | 5, number>; percent: Record<1 | 2 | 3 | 4 | 5, number> };

/** From per-star counts → average (1 decimal for display) + breakdown. */
export function summarize(counts: { rating: number; count: number }[]): RatingSummary {
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as RatingSummary['breakdown'];
  for (const c of counts) if (c.rating >= 1 && c.rating <= 5) breakdown[c.rating as 1 | 2 | 3 | 4 | 5] += c.count;
  const count = Object.values(breakdown).reduce((s, n) => s + n, 0);
  const total = (Object.entries(breakdown) as [string, number][]).reduce((s, [star, n]) => s + Number(star) * n, 0);
  const percent = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as RatingSummary['percent'];
  for (const k of [1, 2, 3, 4, 5] as const) percent[k] = count ? Math.round((breakdown[k] / count) * 100) : 0;
  return { average: count ? Math.round((total / count) * 10) / 10 : 0, count, breakdown, percent };
}

/** Public display name: "নুসরাত জাহান" → "নুসরাত জ." (privacy), unless the reviewer chose one. */
export function displayNameFor(fullName: string, chosen?: string | null): string {
  const c = chosen?.trim();
  if (c) return c.slice(0, 120);
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ক্রেতা';
  if (parts.length === 1) return parts[0].slice(0, 120);
  return `${parts[0]} ${Array.from(parts[parts.length - 1])[0]}.`;
}
