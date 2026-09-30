/* eslint-disable no-console */
/**
 * One-off exporter: snapshot the storefront's static catalogue (frontend/lib/**)
 * into committed JSON under prisma/seed/data/, so the seed (and the Docker
 * image) never needs the frontend source.
 *
 *   cd backend && npx ts-node --transpile-only prisma/seed/export-frontend-data.ts
 *
 * Re-run only when the frontend's demo data changes, then commit the JSON.
 * Pieces that live inside React/Redux files (ship defaults, promo popup, chat
 * quick replies) are parsed out of the source text instead of imported, so
 * this script does not need Next/Redux path aliases.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The frontend modules are loaded with require() on purpose: the backend's
// `tsc` must not type-check frontend files (they use Next's `@/` alias).
/* eslint-disable @typescript-eslint/no-require-imports */
type Vertical = 'book' | 'food' | 'gadget';
type FeProduct = {
  id: number; title: string; author: string; unit?: string; price: number; old: number; sold: number; pages?: number;
  color: string; cat: string; sub?: string; desc: string; vertical: Vertical; stock: number; image?: string; image2?: string;
};
type FeCatalog = {
  products: FeProduct[];
  packs: { id: number; title: string; price: number; old: number; bookIds: number[]; desc: string; vertical: Vertical }[];
  slides: Record<Vertical, unknown[]>;
  ticker: string[];
};
type FeVertical = { id: Vertical; name: string; search: string; kicker: string; title: string; sub: string; lead: string; popular: string; how1: string; how1p: string };

const fe = (m: string) => require(join('../../../frontend', m));
const { catalog, VERTICALS, VERTICAL_ORDER } = fe('lib/catalog/data') as { catalog: FeCatalog; VERTICALS: FeVertical[]; VERTICAL_ORDER: Vertical[] };
const { catTree } = fe('lib/catalog/cats') as { catTree: (v: Vertical, products: FeProduct[]) => { name: string; subs: string[] }[] };
const { guessCost } = fe('lib/catalog/cost') as { guessCost: (price: number, v: Vertical, id: number) => number };
const { GEO } = fe('lib/geo') as { GEO: Record<string, Record<string, Record<string, string[]>>> };
const { COUPONS, DEMO_USERS } = fe('lib/demo/accounts') as {
  COUPONS: { code: string; off: number; type: string }[];
  DEMO_USERS: { name: string; email: string; phone: string; role: string }[];
};

const FRONTEND = resolve(__dirname, '../../../frontend');
const OUT = join(__dirname, 'data');

function write(name: string, data: unknown) {
  writeFileSync(join(OUT, name), JSON.stringify(data, null, 2) + '\n', 'utf8');
  const n = Array.isArray(data) ? data.length : Object.keys(data as object).length;
  console.log(`  wrote data/${name} (${n} top-level entries)`);
}

/** Evaluate a JS object/array literal cut out of a source file. Trusted input (our own repo). */
function literal<T>(file: string, pattern: RegExp): T {
  const src = readFileSync(join(FRONTEND, file), 'utf8');
  const m = src.match(pattern);
  if (!m) throw new Error(`pattern ${pattern} not found in ${file}`);
  return new Function(`return (${m[1]});`)() as T;
}

function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`Exporting frontend data → ${OUT}`);

  // ── geography: division → district → upazila → unions ──
  const geo = Object.entries(GEO).map(([division, districts]) => ({
    division,
    districts: Object.entries(districts).map(([district, upazilas]) => ({
      district,
      upazilas: Object.entries(upazilas).map(([upazila, unions]) => ({ upazila, unions: [...new Set(unions)] })),
    })),
  }));
  write('geo.json', geo);

  // ── sections (verticals) ──
  write(
    'sections.json',
    VERTICAL_ORDER.map((id, i) => {
      const v = VERTICALS.find((x) => x.id === id)!;
      return {
        code: v.id,
        nameBn: v.name,
        nameEn: { book: 'Books', food: 'Home Bazar', gadget: 'Gadgets' }[v.id],
        sortOrder: i,
        searchHint: v.search,
        heroKicker: v.kicker,
        heroTitle: v.title,
        heroSub: v.sub,
        heroLead: v.lead,
        content: { popular: v.popular, how1: v.how1, how1p: v.how1p },
      };
    }),
  );

  // ── category trees (base trees + whatever the products use) ──
  write(
    'categories.json',
    VERTICAL_ORDER.map((section) => ({ section, tree: catTree(section, catalog.products) })),
  );

  // ── products (cost = the admin's seeded guessCost, copies = opening stock) ──
  write(
    'products.json',
    catalog.products.map((p) => ({
      id: p.id,
      section: p.vertical,
      title: p.title,
      author: p.author,
      unit: p.unit ?? null,
      price: p.price,
      old: p.old > p.price ? p.old : null,
      cost: guessCost(p.price, p.vertical, p.id) || null,
      stock: p.stock,
      sold: p.sold,
      pages: p.pages ?? null,
      color: p.color,
      cat: p.cat,
      sub: p.sub ?? null,
      desc: p.desc,
      image: p.image ?? null,
      image2: p.image2 ?? null,
    })),
  );

  write(
    'bundles.json',
    catalog.packs.map((p, i) => ({
      id: p.id,
      section: p.vertical,
      title: p.title,
      price: p.price,
      old: p.old > p.price ? p.old : null,
      productIds: p.bookIds,
      desc: p.desc,
      sortOrder: i,
    })),
  );

  write('slides.json', catalog.slides);

  // ── storefront settings that live in Redux / React files ──
  const ship = literal<Record<string, unknown>>('store/slices/shop-slice.ts', /const shipSeed: ShipSettings = (\{[\s\S]*?\});/);
  const promo = literal<Record<string, unknown>>('store/slices/shop-slice.ts', /promo: (\{[\s\S]*?\}),\n\s*ship:/);
  const quickReplies = literal<string[]>('components/admin/tabs/chat.tsx', /const QUICK_REPLIES = (\[[\s\S]*?\]);/);

  write('content.json', {
    ticker: catalog.ticker,
    coupons: COUPONS,
    promo,
    ship,
    quickReplies,
    demoUsers: DEMO_USERS.map(({ name, email, phone, role }) => ({ name, email, phone, role })),
  });

  console.log('Done. Commit prisma/seed/data/*.json');
}

main();
