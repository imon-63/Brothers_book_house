import { offerOf } from "@/lib/catalog/offer";
import type { Pack, Product, VerticalId } from "@/lib/catalog/types";

export function norm(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchesQuery(hay: string, q: string) {
  const query = norm(q);
  if (!query) return false;
  const text = norm(hay);
  return query.split(" ").filter(Boolean).every((token) => text.includes(token));
}

function escapeReg(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlightParts(text: string, q: string) {
  const tokens = [...new Set(norm(q).split(" ").filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!tokens.length) return [{ text, hit: false }];
  const re = new RegExp(`(${tokens.map(escapeReg).join("|")})`, "ig");
  return text.split(re).filter((part) => part !== "").map((part) => ({
    text: part,
    hit: tokens.some((token) => part.toLowerCase() === token),
  }));
}

function scoreText(title: string, extra: string, q: string, sold = 0) {
  const query = norm(q);
  const name = norm(title);
  const rest = norm(extra);
  const tokens = query.split(" ").filter(Boolean);
  let score = 0;
  if (name.startsWith(query)) score += 140;
  else if (name.includes(query)) score += 100;
  if (tokens.every((token) => name.includes(token))) score += 55;
  if (rest.includes(query)) score += 28;
  const at = name.indexOf(tokens[0] || query);
  if (at >= 0) score += Math.max(0, 14 - at);
  score += Math.min(12, sold / 80);
  return score;
}

export type SuggestItem = {
  key: string;
  href: string;
  title: string;
  meta: string;
  price: number;
  old: number;
  image?: string;
  color: string;
  oos: boolean;
  kind: "product" | "pack";
};

export function suggestCatalog(products: Product[], packs: Pack[], vertical: VerticalId, q: string, limit = 7) {
  const query = norm(q);
  if (!query) return { items: [] as SuggestItem[], total: 0 };

  const mine = products.filter((p) => p.vertical === vertical);
  const productHits = mine
    .map((p) => {
      const hay = `${p.title} ${p.author} ${p.cat} ${p.sub || ""} ${p.unit || ""} ${p.desc}`;
      if (!matchesQuery(hay, query)) return null;
      const meta = [p.vertical === "book" ? p.author : p.unit || p.author, p.sub || p.cat].filter(Boolean).join(" · ");
      const offer = offerOf(p);
      return {
        key: `p-${p.id}`,
        href: `/product/${p.id}`,
        title: p.title,
        meta,
        price: offer.price,
        old: offer.old,
        image: p.image,
        color: p.color,
        oos: p.stock <= 0,
        kind: "product" as const,
        score: scoreText(p.title, `${p.author} ${p.cat} ${p.sub || ""} ${p.unit || ""}`, query, p.sold),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const packHits = packs
    .filter((p) => p.vertical === vertical)
    .map((p) => {
      const books = mine.filter((book) => p.bookIds.includes(book.id));
      if (!matchesQuery(`${p.title} ${p.desc} ${books.map((book) => book.title).join(" ")}`, query)) return null;
      const cover = books.find((book) => book.image);
      return {
        key: `k-${p.id}`,
        href: `/pack/${p.id}`,
        title: p.title,
        meta: "প্যাকেজ",
        price: p.price,
        old: p.old,
        image: cover?.image,
        color: "#7A2430",
        oos: false,
        kind: "pack" as const,
        score: scoreText(p.title, p.desc, query) + 8,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const ranked = [...productHits, ...packHits].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "bn"));
  return { items: ranked.slice(0, limit).map(({ score: _score, ...item }) => item), total: ranked.length };
}
