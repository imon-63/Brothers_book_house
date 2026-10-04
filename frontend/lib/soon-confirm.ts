/**
 * "ছাড় আসছে" guard for the cart. Any add-to-cart (card, product page, wishlist,
 * like-strip…) goes through useAddToCart, which calls askSoon() when a timed deal
 * on that product has not started yet. One dialog (<SoonConfirm/> in SiteFrame)
 * answers; the promise resolves true = buy now at the regular price.
 */

export type SoonInfo = { title: string; regularPrice: number; dealPrice: number; startsAt: string; endsAt: string };

type Pending = { info: SoonInfo; resolve: (ok: boolean) => void };

let pending: Pending | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((fn) => fn());

export function askSoon(info: SoonInfo): Promise<boolean> {
  pending?.resolve(false); // a newer question replaces an unanswered one
  return new Promise((resolve) => {
    pending = { info, resolve };
    emit();
  });
}

export function answerSoon(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}

export function subscribeSoon(fn: () => void) {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

export function currentSoon() {
  return pending?.info ?? null;
}
