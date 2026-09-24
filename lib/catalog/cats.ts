import { catalog } from "./data";
import type { VerticalId } from "./types";

export type CatNode = { name: string; subs: string[] };

const FOOD: CatNode[] = [
  { name: "তেল ও ঘি", subs: ["সরিষার তেল", "ঘি"] },
  { name: "মধু", subs: ["সুন্দরবন", "ফুলের মধু"] },
  { name: "খেজুর", subs: ["আজওয়া", "সুকারি"] },
  { name: "মসলা", subs: ["গুঁড়া মসলা"] },
];

const GADGET: CatNode[] = [
  { name: "মোবাইল এক্সেসরিজ", subs: ["ইয়ারবাড", "পাওয়ার ব্যাংক"] },
  { name: "স্মার্ট গ্যাজেট", subs: ["মাইক", "ফ্ল্যাশলাইট"] },
  { name: "কম্পিউটার", subs: ["Mini UPS", "DC UPS"] },
  { name: "হোম", subs: ["ফ্যান", "মশারি ব্যাট"] },
];

const BOOK_ORDER = [
  "অষ্টম শ্রেণি",
  "নবম-দশম",
  "ইন্টারমিডিয়েট",
  "ইঞ্জিনিয়ারিং ভর্তি",
  "বিশ্ববিদ্যালয় ভর্তি",
  "জাতীয় বিশ্ববিদ্যালয় ভর্তি",
  "মেডিকেল ভর্তি",
  "ব্যাংক প্রস্তুতি",
  "বিশ্ববিদ্যালয় বিজ্ঞান",
  "বিশ্ববিদ্যালয় মানবিক",
];

export const AUTHOR_GROUPS = [
  { id: "অষ্টম", title: "অষ্টম শ্রেণি", sub: "জুনিয়র পাঠ্য", cats: ["অষ্টম শ্রেণি"] },
  { id: "এসএসসি", title: "এসএসসি", sub: "নবম-দশম গাইড", cats: ["নবম-দশম"] },
  { id: "এইচএসসি", title: "এইচএসসি", sub: "ইন্টারমিডিয়েট", cats: ["ইন্টারমিডিয়েট"] },
  { id: "ভর্তি", title: "ভর্তি", sub: "ইঞ্জিনিয়ারিং · মেডিকেল · বিশ্ববিদ্যালয়", cats: ["ইঞ্জিনিয়ারিং ভর্তি", "বিশ্ববিদ্যালয় ভর্তি", "জাতীয় বিশ্ববিদ্যালয় ভর্তি", "মেডিকেল ভর্তি"] },
  { id: "অনার্স", title: "অনার্স", sub: "বিজ্ঞান · মানবিক", cats: ["বিশ্ববিদ্যালয় বিজ্ঞান", "বিশ্ববিদ্যালয় মানবিক"] },
  { id: "ব্যাংক", title: "ব্যাংক", sub: "নিয়োগ প্রস্তুতি", cats: ["ব্যাংক প্রস্তুতি"] },
];

export function catTree(
  vertical: VerticalId,
  products: { vertical: VerticalId; cat: string; sub?: string }[] = catalog.products,
  extra: { vertical: VerticalId; name: string; subs: string[] }[] = [],
  hidden: { vertical: VerticalId; name: string; sub?: string }[] = [],
): CatNode[] {
  const map = new Map<string, CatNode>();
  const base = vertical === "food" ? FOOD : vertical === "gadget" ? GADGET : null;
  if (base) {
    for (const node of base) map.set(node.name, { name: node.name, subs: [...node.subs] });
  } else {
    const have = new Set(products.filter((p) => p.vertical === "book").map((p) => p.cat));
    for (const name of BOOK_ORDER) {
      if (have.has(name)) map.set(name, { name, subs: [] });
    }
  }
  for (const node of extra.filter((c) => c.vertical === vertical)) {
    const cur = map.get(node.name) ?? { name: node.name, subs: [] };
    cur.subs = [...new Set([...cur.subs, ...node.subs])];
    map.set(node.name, cur);
  }
  for (const p of products.filter((x) => x.vertical === vertical)) {
    const cur = map.get(p.cat) ?? { name: p.cat, subs: [] };
    if (p.sub && !cur.subs.includes(p.sub)) cur.subs.push(p.sub);
    map.set(p.cat, cur);
  }
  return [...map.values()].filter((node) => {
    if (hidden.some((h) => h.vertical === vertical && h.name === node.name && !h.sub)) return false;
    node.subs = node.subs.filter((s) => !hidden.some((h) => h.vertical === vertical && h.name === node.name && h.sub === s));
    return true;
  });
}

export function hiddenMain(
  hidden: { vertical: VerticalId; name: string; sub?: string }[],
  vertical: VerticalId,
  name: string,
) {
  return hidden.some((h) => h.vertical === vertical && h.name === name && !h.sub);
}

export function shopHref(cat: string, sub?: string) {
  const q = new URLSearchParams({ cat });
  if (sub) q.set("sub", sub);
  return `/shop?${q.toString()}`;
}
