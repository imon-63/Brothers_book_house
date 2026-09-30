"use client";

import { useQuery } from "@tanstack/react-query";
import { get } from "./client";

export type HeroSlideDto = {
  id: string;
  kicker: string | null;
  title: string | null;
  subtitle: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  category: { slug: string; name: string } | null;
};

export type StorefrontDto = {
  announcements: { id: string; text: string; linkUrl: string | null }[];
  promo: {
    id: string;
    title: string;
    body: string | null;
    ctaLabel: string | null;
    ctaUrl: string | null;
    imageUrl: string | null;
    coupon: { code: string; type: "PERCENT" | "FIXED" | string; value: number; minSubtotal: number; description: string | null; endsAt: string | null } | null;
  } | null;
  hero: Record<string, HeroSlideDto[]>;
  settings: {
    store_name?: string;
    helpline?: string | null;
    whatsapp?: string | null;
    support_hours?: string | null;
    cod_enabled?: boolean;
    online_payment_enabled?: boolean;
    [k: string]: unknown;
  };
};

export type HeaderCouponDto = {
  code: string;
  type: "PERCENT" | "FIXED" | string;
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
  scope: string;
  description: string | null;
  endsAt: string | null;
};

/** Hero slide as the Hero component renders it. */
export type Slide = { key: string; cat: string; catSlug: string; kicker: string; title: string; sub: string; img: string };

export function toSlides(rows: HeroSlideDto[] = []): Slide[] {
  return rows
    .filter((r) => r.imageUrl)
    .map((r) => ({
      key: r.id,
      cat: r.category?.name ?? "",
      catSlug: r.category?.slug ?? "",
      kicker: r.kicker ?? "",
      title: r.title ?? "",
      sub: r.subtitle ?? "",
      img: r.imageUrl!,
    }));
}

/** Top-bar ticker, promo popup, hero slides per section, public settings. */
export function useStorefront() {
  return useQuery({
    queryKey: ["content", "storefront"],
    queryFn: () => get<StorefrontDto>("/content/storefront"),
    staleTime: 5 * 60_000,
  });
}

/** Live coupons for the header chips. */
export function useHeaderCoupons() {
  return useQuery({
    queryKey: ["coupons", "header"],
    queryFn: () => get<HeaderCouponDto[]>("/coupons/header"),
    staleTime: 5 * 60_000,
  });
}

export function helplineOf(settings?: StorefrontDto["settings"]) {
  return (settings?.helpline as string | undefined) || "017910948088";
}

/** Helpline number from public settings (falls back to the legacy number). */
export function useContentHelpline() {
  return helplineOf(useStorefront().data?.settings);
}
