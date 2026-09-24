import type { Product, VerticalId } from "./types";
import { catalog } from "./data";

const COLORS = ["#7A2430", "#3D5A4C", "#2C3A5A", "#6B3A1F", "#4A2744", "#245A6B", "#B86A2A", "#1F4A3A"];

const RV: Record<VerticalId, { name: string; stars: number; text: string }[]> = {
  book: [
    { name: "নুসরাত জাহান", stars: 5, text: "গাইড পরিষ্কার, সাজেশন সত্যিই কাজে লেগেছে।" },
    { name: "রাফি আহমেদ", stars: 4, text: "প্রিন্ট ভালো। আরও উদাহরণ থাকলে পারফেক্ট হতো।" },
    { name: "তানিয়া আক্তার", stars: 5, text: "সময়মতো ডেলিভারি, কাভার সুন্দর।" },
    { name: "ইমরান হোসেন", stars: 5, text: "পড়ার জন্য বেস্ট — নোট নিতে সুবিধা।" },
    { name: "সাদিয়া ইসলাম", stars: 4, text: "দাম অনুযায়ী কোয়ালিটি ঠিক আছে।" },
  ],
  food: [
    { name: "মাহিনুর রহমান", stars: 5, text: "সরিষার তেলের ঘ্রাণ খাঁটি, প্যাক সিলড ছিল।" },
    { name: "ফারিহা নূর", stars: 4, text: "ঘি ঘন, চামচে জমে। ওজনও ঠিক।" },
    { name: "আরিফ চৌধুরী", stars: 5, text: "মধু একদম কাঁচা, আবার নেব।" },
    { name: "লামিয়া খান", stars: 5, text: "আজওয়া খেজুর নরম, প্যাকেজিং পরিষ্কার।" },
    { name: "নাফিস আলম", stars: 4, text: "মসলার রং আর গন্ধ ভালো, ডেলিভারি দ্রুত।" },
  ],
  gadget: [
    { name: "শাহরিয়ার কবীর", stars: 5, text: "বিল্ড কোয়ালিটি ভালো, দামের তুলনায় সেরা।" },
    { name: "মেহজাবিন", stars: 4, text: "হোভারে যে ছবি দেখায় সেটাই হাতে পেয়েছি।" },
    { name: "তানভীর হাসান", stars: 5, text: "চার্জ ধরে ভালো, প্যাকিং সেফ ছিল।" },
    { name: "রিফাত জামান", stars: 5, text: "অরিজিনাল মনে হয়েছে, রান করে ভালো।" },
    { name: "আয়েশা সিদ্দিকা", stars: 4, text: "কাজের জিনিস। ওয়ারেন্টি থাকলে আরও আত্মবিশ্বাস।" },
  ],
};

export type Review = { name: string; stars: number; text: string; at: number };

export function reviewsFor(product: Product): Review[] {
  const pool = RV[product.vertical];
  const n = 3 + (Math.abs(product.id) % 3);
  return Array.from({ length: n }, (_, i) => {
    const src = pool[(Math.abs(product.id) + i * 2) % pool.length];
    return { ...src, at: Date.now() - (i + 1) * (2 + i) * 86400000 };
  });
}

export function avatarColor(i: number) {
  return COLORS[i % COLORS.length];
}

export function socialFor(product: Product, reviews: Review[], products: Product[] = catalog.products) {
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.stars, 0) / reviews.length
    : 4.4 + ((product.id + product.sold) % 50) / 100;
  const same = products.filter((p) => p.vertical === product.vertical && p.cat === product.cat);
  const rank = [...same].sort((a, b) => b.sold - a.sold).findIndex((p) => p.id === product.id) + 1;
  return {
    score: Math.round(avg * 10) / 10,
    reviews: reviews.length,
    love: Math.max(24, Math.round(product.sold * 0.65)),
    rank,
  };
}

export function relatedFor(product: Product, products: Product[] = catalog.products) {
  const all = products.filter((p) => p.vertical === product.vertical && p.id !== product.id);
  const same = all.filter((p) => p.cat === product.cat);
  let list = [...same, ...all.filter((p) => p.cat !== product.cat)];
  if (!list.length) return [];
  while (list.length < 8) list = list.concat(list);
  return list.slice(0, Math.max(8, Math.min(12, list.length)));
}
