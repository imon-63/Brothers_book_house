/* eslint-disable no-console */
/**
 * Cholo seed: reference data + the storefront's demo catalogue.
 *
 *   npx prisma db seed                 (dev: ts-node --transpile-only prisma/seed/seed.ts)
 *   node seed/seed.js                  (inside the API image, compiled at build time)
 *
 * Idempotent. Every row is keyed by a natural/unique key (or a stable UUID
 * derived from one), so running it again never duplicates anything.
 *
 * Re-run policy:
 *   default          insert what is missing; never touch rows that already exist
 *                    (admins own prices, stock, copy and settings after day one)
 *   SEED_FORCE=true  also refresh catalogue copy, prices, settings and content
 *                    from the JSON snapshot (still never stock, sold counts,
 *                    counters or passwords)
 *
 * Users:
 *   non-production   OWNER admin@cholo.shop / admin123 and customer rafi@gmail.com / 123456
 *   production       OWNER password from SEED_ADMIN_PASSWORD (or ADMIN_BOOTSTRAP_PASSWORD);
 *                    the demo customer only when SEED_DEMO_USERS=true
 *
 * Data comes from prisma/seed/data/*.json (see export-frontend-data.ts).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient, type CashAccountType, type TagScope } from '@prisma/client';
import * as argon2 from 'argon2';

// ─────────────────────────── data snapshot types ───────────────────────────

type SectionCode = 'book' | 'food' | 'gadget';
type GeoJson = { division: string; districts: { district: string; upazilas: { upazila: string; unions: string[] }[] }[] }[];
type SectionJson = {
  code: SectionCode;
  nameBn: string;
  nameEn: string;
  sortOrder: number;
  searchHint: string;
  heroKicker: string;
  heroTitle: string;
  heroSub: string;
  heroLead: string;
  content: Record<string, string>;
};
type CategoryJson = { section: SectionCode; tree: { name: string; subs: string[] }[] }[];
type ProductJson = {
  id: number;
  section: SectionCode;
  title: string;
  author: string;
  unit: string | null;
  price: number;
  old: number | null;
  cost: number | null;
  stock: number;
  sold: number;
  pages: number | null;
  color: string;
  cat: string;
  sub: string | null;
  desc: string;
  image: string | null;
  image2: string | null;
};
type BundleJson = { id: number; section: SectionCode; title: string; price: number; old: number | null; productIds: number[]; desc: string; sortOrder: number };
type SlideJson = Record<SectionCode, { cat: string; kicker: string; title: string; sub: string; img: string }[]>;
type ContentJson = {
  ticker: string[];
  coupons: { code: string; off: number; type: 'pct' | 'tk' }[];
  promo: { on: boolean; title: string; text: string; code: string; image: string };
  ship: {
    dhaka: number;
    outside: number;
    costDhaka: number;
    costOutside: number;
    freeOnPack: boolean;
    freeOnBooks: boolean;
    freeAboveOn: boolean;
    freeAbove: number;
    freeAllOn: boolean;
    freeFrom: string;
    freeTo: string;
    sslFeePct: number;
  };
  quickReplies: string[];
  demoUsers: { name: string; email: string; phone: string; role: 'admin' | 'user' }[];
};

// ─────────────────────────── helpers ───────────────────────────

const DATA_DIR = process.env.SEED_DATA_DIR ?? join(__dirname, 'data');
const FORCE = ['1', 'true', 'yes'].includes((process.env.SEED_FORCE ?? '').toLowerCase());
const IS_PROD = process.env.NODE_ENV === 'production';
const TX = { timeout: 120_000, maxWait: 10_000 };

const load = <T>(file: string): T => JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;

/** Same rules as src/common/utils/text.ts (copied: the seed must not import src). */
function slugify(input: string): string {
  return input
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
function normalizeBdPhone(input: string): string | null {
  let d = input.replace(/[০-৯]/g, (c) => String(BN_DIGITS.indexOf(c))).replace(/\D/g, '');
  if (d.startsWith('880')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return /^1[3-9]\d{8}$/.test(d) ? `+880${d}` : null;
}

/** Deterministic UUID (v5-shaped, sha1) for rows without a natural unique key. */
function stableId(key: string): string {
  const h = createHash('sha1').update(`cholo-seed:${key}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** Only refresh existing rows when SEED_FORCE is on. */
const refresh = <T extends object>(data: T): T | Record<string, never> => (FORCE ? data : {});

/** Identical to AuthService.hash (argon2id, OWASP 2024 params). */
const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });

const SKU_PREFIX: Record<SectionCode, string> = { book: 'BK', food: 'FD', gadget: 'GD' };
const sku = (p: ProductJson) => `${SKU_PREFIX[p.section]}-${String(p.id).padStart(4, '0')}`;

function mimeOf(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', svg: 'image/svg+xml' } as Record<string, string>)[ext ?? ''] ?? 'image/jpeg';
}

const counts: Record<string, number> = {};
const bump = (k: string, n = 1) => (counts[k] = (counts[k] ?? 0) + n);

const prisma = new PrismaClient({ log: ['warn', 'error'] });

// ─────────────────────────── groups ───────────────────────────

async function seedShippingAndGeo(content: ContentJson) {
  const geo = load<GeoJson>('geo.json');
  const s = content.ship;

  await prisma.$transaction(async (tx) => {
    const inside = await tx.shippingZone.upsert({
      where: { code: 'inside_dhaka' },
      update: refresh({ fee: s.dhaka, courierCost: s.costDhaka }),
      create: { code: 'inside_dhaka', nameBn: 'ঢাকার ভিতর', fee: s.dhaka, courierCost: s.costDhaka, etaMinDays: 1, etaMaxDays: 2 },
    });
    const outside = await tx.shippingZone.upsert({
      where: { code: 'outside_dhaka' },
      update: refresh({ fee: s.outside, courierCost: s.costOutside }),
      create: { code: 'outside_dhaka', nameBn: 'ঢাকার বাইরে', fee: s.outside, courierCost: s.costOutside, etaMinDays: 2, etaMaxDays: 4 },
    });
    bump('shipping_zones', 2);

    for (const div of geo) {
      const division = await tx.geoDivision.upsert({ where: { nameBn: div.division }, update: {}, create: { nameBn: div.division } });
      bump('geo_divisions');
      for (const d of div.districts) {
        const zoneId = d.district === 'ঢাকা' ? inside.id : outside.id;
        const district = await tx.geoDistrict.upsert({
          where: { divisionId_nameBn: { divisionId: division.id, nameBn: d.district } },
          update: refresh({ shippingZoneId: zoneId }),
          create: { divisionId: division.id, nameBn: d.district, shippingZoneId: zoneId },
        });
        bump('geo_districts');

        await tx.geoUpazila.createMany({ data: d.upazilas.map((u) => ({ districtId: district.id, nameBn: u.upazila })), skipDuplicates: true });
        const upazilas = await tx.geoUpazila.findMany({ where: { districtId: district.id }, select: { id: true, nameBn: true } });
        const upaId = new Map(upazilas.map((u) => [u.nameBn, u.id]));
        bump('geo_upazilas', d.upazilas.length);

        const unions = d.upazilas.flatMap((u) => u.unions.map((nameBn) => ({ upazilaId: upaId.get(u.upazila)!, nameBn })));
        await tx.geoUnion.createMany({ data: unions, skipDuplicates: true });
        bump('geo_unions', unions.length);
      }
    }
  }, TX);
}

async function seedSections(): Promise<Map<SectionCode, string>> {
  const sections = load<SectionJson[]>('sections.json');
  const ids = new Map<SectionCode, string>();
  await prisma.$transaction(async (tx) => {
    for (const s of sections) {
      const copy = {
        nameBn: s.nameBn,
        nameEn: s.nameEn,
        sortOrder: s.sortOrder,
        searchHint: s.searchHint,
        heroKicker: s.heroKicker,
        heroTitle: s.heroTitle,
        heroSub: s.heroSub,
        heroLead: s.heroLead,
        content: s.content,
      };
      const row = await tx.section.upsert({ where: { code: s.code }, update: refresh(copy), create: { code: s.code, ...copy } });
      ids.set(s.code, row.id);
      bump('sections');
    }
  }, TX);
  return ids;
}

async function seedShippingRules(content: ContentJson, sectionIds: Map<SectionCode, string>) {
  const s = content.ship;
  const campaignWindow =
    s.freeFrom && s.freeTo ? { startsAt: new Date(s.freeFrom), endsAt: new Date(s.freeTo) } : { startsAt: null, endsAt: null };
  const rules: Prisma.ShippingRuleUncheckedCreateInput[] = [
    { id: stableId('shipping_rule:MIN_SUBTOTAL'), type: 'MIN_SUBTOTAL', label: `৳${s.freeAbove}+ অর্ডারে ফ্রি ডেলিভারি`, minSubtotal: s.freeAbove, isActive: s.freeAboveOn, priority: 10 },
    { id: stableId('shipping_rule:ANY_BUNDLE'), type: 'ANY_BUNDLE', label: 'প্যাকেজ থাকলে ফ্রি ডেলিভারি', isActive: s.freeOnPack, priority: 20 },
    { id: stableId('shipping_rule:SECTION_ONLY:book'), type: 'SECTION_ONLY', label: 'শুধু বই থাকলে ফ্রি ডেলিভারি', sectionId: sectionIds.get('book')!, isActive: s.freeOnBooks, priority: 30 },
    { id: stableId('shipping_rule:CAMPAIGN_ALL'), type: 'CAMPAIGN_ALL', label: 'সবার জন্য ফ্রি ডেলিভারি (ক্যাম্পেইন)', isActive: s.freeAllOn, priority: 40, ...campaignWindow },
  ];
  await prisma.$transaction(async (tx) => {
    for (const r of rules) {
      const { id, ...rest } = r;
      await tx.shippingRule.upsert({ where: { id: id! }, update: refresh(rest), create: r });
      bump('shipping_rules');
    }
  }, TX);
}

type CatIndex = Map<string, { id: string; subs: Map<string, string> }>; // key `${section}|${name}`

async function seedCategories(sectionIds: Map<SectionCode, string>, products: ProductJson[]): Promise<CatIndex> {
  const trees = load<CategoryJson>('categories.json');
  const index: CatIndex = new Map();

  await prisma.$transaction(async (tx) => {
    for (const { section, tree } of trees) {
      // merge in anything the products reference that the tree snapshot lacks
      const nodes = tree.map((n) => ({ name: n.name, subs: [...n.subs] }));
      for (const p of products.filter((x) => x.section === section)) {
        let n = nodes.find((x) => x.name === p.cat);
        if (!n) nodes.push((n = { name: p.cat, subs: [] }));
        if (p.sub && !n.subs.includes(p.sub)) n.subs.push(p.sub);
      }

      const sectionId = sectionIds.get(section)!;
      const used = new Set(nodes.map((n) => slugify(n.name)));
      for (const [i, node] of nodes.entries()) {
        const slug = slugify(node.name);
        const parent = await tx.category.upsert({
          where: { sectionId_slug: { sectionId, slug } },
          update: refresh({ nameBn: node.name, sortOrder: i, parentId: null }),
          create: { sectionId, slug, nameBn: node.name, sortOrder: i },
        });
        bump('categories');
        const subs = new Map<string, string>();
        for (const [j, sub] of node.subs.entries()) {
          let subSlug = slugify(sub);
          if (used.has(subSlug)) subSlug = `${slug}-${subSlug}`;
          used.add(subSlug);
          const child = await tx.category.upsert({
            where: { sectionId_slug: { sectionId, slug: subSlug } },
            update: refresh({ nameBn: sub, sortOrder: j, parentId: parent.id }),
            create: { sectionId, slug: subSlug, nameBn: sub, sortOrder: j, parentId: parent.id },
          });
          subs.set(sub, child.id);
          bump('categories');
        }
        index.set(`${section}|${node.name}`, { id: parent.id, subs });
      }
    }
  }, TX);
  return index;
}

async function seedCatalog(sectionIds: Map<SectionCode, string>, cats: CatIndex, products: ProductJson[]) {
  const bundles = load<BundleJson[]>('bundles.json');
  const productIds = new Map<number, string>();

  await prisma.$transaction(async (tx) => {
    // authors (books) and brands (grocery/gadgets) come from the `author` line
    const authorIds = new Map<string, string>();
    for (const name of [...new Set(products.filter((p) => p.section === 'book').map((p) => p.author))]) {
      const a = await tx.author.upsert({ where: { slug: slugify(name) }, update: {}, create: { slug: slugify(name), nameBn: name } });
      authorIds.set(name, a.id);
      bump('authors');
    }
    const brandIds = new Map<string, string>();
    for (const name of [...new Set(products.filter((p) => p.section !== 'book').map((p) => p.author))]) {
      const b = await tx.brand.upsert({ where: { slug: slugify(name) }, update: {}, create: { slug: slugify(name), name } });
      brandIds.set(name, b.id);
      bump('brands');
    }

    for (const p of products) {
      const cat = cats.get(`${p.section}|${p.cat}`);
      if (!cat) throw new Error(`product ${p.id}: unknown category ${p.section}/${p.cat}`);
      const subcategoryId = p.sub ? (cat.subs.get(p.sub) ?? null) : null;
      const content = {
        title: p.title,
        subtitle: p.author,
        unit: p.unit,
        description: p.desc,
        coverColor: p.color,
        pages: p.pages,
        sectionId: sectionIds.get(p.section)!,
        categoryId: cat.id,
        subcategoryId,
        brandId: p.section === 'book' ? null : (brandIds.get(p.author) ?? null),
        price: p.price,
        compareAtPrice: p.old,
        costPrice: p.cost,
      };

      const existing = await tx.product.findUnique({ where: { legacyId: p.id }, select: { id: true } });
      let id: string;
      if (existing) {
        id = existing.id;
        if (FORCE) await tx.product.update({ where: { id }, data: content });
      } else {
        let slug = slugify(p.title);
        const clash = await tx.product.findUnique({ where: { slug }, select: { id: true } });
        if (clash) slug = `${slug}-${p.id}`;
        const created = await tx.product.create({
          data: {
            ...content,
            legacyId: p.id,
            sku: sku(p),
            slug,
            language: p.section === 'book' ? 'bn' : null,
            status: 'ACTIVE',
            stockOnHand: p.stock,
            initialCopies: p.stock,
            soldCount: p.sold,
            publishedAt: new Date(),
          },
        });
        id = created.id;
        bump('products_created');
        // opening balance → the ledger agrees with the cached stock from day one
        if (p.stock > 0) {
          await tx.stockMovement.create({
            data: { productId: id, type: 'OPENING', qtyOnHandDelta: p.stock, balanceAfter: p.stock, unitCost: p.cost, note: 'প্রারম্ভিক স্টক (seed)' },
          });
          bump('stock_movements_created');
        }
        await tx.productPriceHistory.create({
          data: { productId: id, price: p.price, compareAtPrice: p.old, costPrice: p.cost, reason: 'seed' },
        });
      }
      productIds.set(p.id, id);
      bump('products');

      if (p.section === 'book') {
        await tx.productAuthor.createMany({ data: [{ productId: id, authorId: authorIds.get(p.author)!, role: 'author' }], skipDuplicates: true });
      }

      for (const [i, url] of [p.image, p.image2].filter((u): u is string => !!u).entries()) {
        const media = await tx.mediaAsset.upsert({
          where: { storageKey: `legacy/products/${p.id}/${i + 1}` },
          update: refresh({ url, mimeType: mimeOf(url) }),
          create: { storageKey: `legacy/products/${p.id}/${i + 1}`, url, mimeType: mimeOf(url), sizeBytes: 0, alt: p.title },
        });
        await tx.productImage.upsert({
          where: { productId_mediaId: { productId: id, mediaId: media.id } },
          update: {},
          create: { productId: id, mediaId: media.id, sortOrder: i, isPrimary: i === 0 },
        });
        bump('product_images');
      }
    }

    for (const b of bundles) {
      const data = { title: b.title, description: b.desc, price: b.price, compareAtPrice: b.old, sectionId: sectionIds.get(b.section)!, sortOrder: b.sortOrder };
      const bundle = await tx.bundle.upsert({
        where: { legacyId: b.id },
        update: refresh(data),
        create: { ...data, legacyId: b.id, slug: `${slugify(b.title)}-${b.id}`, status: 'ACTIVE' },
      });
      await tx.bundleItem.createMany({
        data: b.productIds.map((pid, i) => {
          const productId = productIds.get(pid);
          if (!productId) throw new Error(`bundle ${b.id}: unknown product ${pid}`);
          return { bundleId: bundle.id, productId, quantity: 1, sortOrder: i };
        }),
        skipDuplicates: true,
      });
      bump('bundles');
      bump('bundle_items', b.productIds.length);
    }
  }, TX);
}

async function seedOperations() {
  const couriers = [
    { code: 'pathao', name: 'Pathao Courier', trackingUrl: 'https://merchant.pathao.com/tracking?consignment_id={tracking}' },
    { code: 'steadfast', name: 'Steadfast Courier', trackingUrl: 'https://steadfast.com.bd/t/{tracking}' },
    { code: 'redx', name: 'RedX', trackingUrl: 'https://redx.com.bd/track-parcel/?trackingId={tracking}' },
    { code: 'sundarban', name: 'সুন্দরবন কুরিয়ার', trackingUrl: null },
    { code: 'ecourier', name: 'eCourier', trackingUrl: null },
    { code: 'other', name: 'অন্যান্য', trackingUrl: null },
  ];
  const accounts: { code: string; name: string; type: CashAccountType }[] = [
    { code: 'cash', name: 'ক্যাশ', type: 'CASH' },
    { code: 'bkash', name: 'বিকাশ', type: 'MOBILE_WALLET' },
    { code: 'nagad', name: 'নগদ', type: 'MOBILE_WALLET' },
    { code: 'bank', name: 'ব্যাংক', type: 'BANK' },
    { code: 'sslcommerz', name: 'SSLCOMMERZ', type: 'GATEWAY' },
  ];
  // Mirrors DocumentCounterService DEFAULTS. Never updated: a counter only moves forward.
  const counters = [
    { scope: 'order', prefix: 'CLO-', nextValue: 2042n, padding: 4 },
    { scope: 'invoice', prefix: 'INV-', nextValue: 1n, padding: 6 },
    { scope: 'receipt', prefix: 'RCT-', nextValue: 1n, padding: 6 },
    { scope: 'credit_note', prefix: 'CRN-', nextValue: 1n, padding: 6 },
    { scope: 'purchase', prefix: 'PUR-', nextValue: 101n, padding: 6 },
  ];

  await prisma.$transaction(async (tx) => {
    for (const c of couriers) {
      await tx.courier.upsert({ where: { code: c.code }, update: refresh({ name: c.name, trackingUrl: c.trackingUrl }), create: c });
      bump('couriers');
    }
    for (const a of accounts) {
      await tx.cashAccount.upsert({ where: { code: a.code }, update: refresh({ name: a.name, type: a.type }), create: a });
      bump('cash_accounts');
    }
    const r = await tx.documentCounter.createMany({ data: counters, skipDuplicates: true });
    bump('document_counters', counters.length);
    bump('document_counters_created', r.count);
  }, TX);
}

async function seedPromotionsAndContent(content: ContentJson, sectionIds: Map<SectionCode, string>, cats: CatIndex) {
  const slides = load<SlideJson>('slides.json');
  const describe: Record<string, string> = { CHOLO10: 'প্রথম অর্ডারে ১০% ছাড়', BOI50: 'বইয়ে ৳৫০ ছাড়' };

  await prisma.$transaction(async (tx) => {
    const couponIds = new Map<string, string>();
    for (const c of content.coupons) {
      const data = { type: c.type === 'pct' ? ('PERCENT' as const) : ('FIXED' as const), value: c.off, description: describe[c.code] ?? null, isActive: true, showInHeader: true };
      const row = await tx.coupon.upsert({ where: { code: c.code }, update: refresh(data), create: { code: c.code, ...data } });
      couponIds.set(c.code, row.id);
      bump('coupons');
    }

    for (const [i, text] of content.ticker.entries()) {
      const id = stableId(`announcement:${i}`);
      await tx.announcement.upsert({ where: { id }, update: refresh({ text, sortOrder: i }), create: { id, text, sortOrder: i, isActive: true } });
      bump('announcements');
    }

    const p = content.promo;
    const promo = { title: p.title, body: p.text, couponId: couponIds.get(p.code) ?? null, isActive: p.on, ctaLabel: 'কেনাকাটা শুরু করুন', ctaUrl: '/shop' };
    const promoId = stableId('promo_popup:default');
    await tx.promoPopup.upsert({ where: { id: promoId }, update: refresh(promo), create: { id: promoId, ...promo } });
    bump('promo_popups');

    for (const section of Object.keys(slides) as SectionCode[]) {
      for (const [i, s] of slides[section].entries()) {
        const id = stableId(`hero_slide:${section}:${i}`);
        const data = {
          sectionId: sectionIds.get(section)!,
          categoryId: cats.get(`${section}|${s.cat}`)?.id ?? null,
          kicker: s.kicker,
          title: s.title,
          subtitle: s.sub,
          imageUrl: s.img,
          sortOrder: i,
        };
        await tx.heroSlide.upsert({ where: { id }, update: refresh(data), create: { id, ...data, isActive: true } });
        bump('hero_slides');
      }
    }

    const titles = ['সালাম', 'অর্ডার আইডি', 'ডেলিভারি সময়', 'স্টকে আছে', 'ধন্যবাদ'];
    for (const [i, body] of content.quickReplies.entries()) {
      const id = stableId(`canned_reply:${i}`);
      const title = titles[i] ?? body.slice(0, 40);
      await tx.cannedReply.upsert({ where: { id }, update: refresh({ title, body, sortOrder: i }), create: { id, title, body, sortOrder: i } });
      bump('canned_replies');
    }

    const settings: { key: string; value: Prisma.InputJsonValue; description: string }[] = [
      { key: 'store_name', value: 'চলো', description: 'দোকানের নাম (storefront + invoices)' },
      { key: 'helpline', value: '017910948088', description: 'হেল্পলাইন নম্বর' },
      { key: 'gateway_fee_pct', value: content.ship.sslFeePct, description: 'SSLCOMMERZ fee % charged to us (profit calc)' },
      { key: 'default_low_stock_threshold', value: 5, description: 'Low-stock alert when a product has no own threshold' },
    ];
    for (const s of settings) {
      await tx.storeSetting.upsert({ where: { key: s.key }, update: refresh({ value: s.value, description: s.description }), create: s });
      bump('store_settings');
    }

    const tags: { scope: TagScope; name: string; color: string }[] = [
      ...[
        ['উপহার', '#B86A2A'],
        ['জরুরি', '#B42318'],
        ['আবার অর্ডার', '#245A6B'],
        ['বাল্ক', '#4A2744'],
        ['কর্পোরেট', '#2C3A5A'],
        ['যাচাই দরকার', '#C4A15A'],
      ].map(([name, color]) => ({ scope: 'ORDER' as const, name, color })),
      ...[
        ['VIP', '#7A2430'],
        ['পাইকারি', '#3D5A4C'],
        ['শিক্ষক', '#245A6B'],
        ['স্টুডেন্ট', '#1F4A3A'],
        ['বাকি আছে', '#C4A15A'],
        ['সাবধান', '#B42318'],
      ].map(([name, color]) => ({ scope: 'CUSTOMER' as const, name, color })),
    ];
    await tx.tag.createMany({ data: tags, skipDuplicates: true });
    bump('tags', tags.length);
  }, TX);
}

async function seedUsers(content: ContentJson) {
  const demoAdmin = content.demoUsers.find((u) => u.role === 'admin');
  const demoCustomer = content.demoUsers.find((u) => u.role === 'user');

  const adminPassword = IS_PROD ? (process.env.SEED_ADMIN_PASSWORD ?? process.env.ADMIN_BOOTSTRAP_PASSWORD) : 'admin123';
  const withCustomer = !IS_PROD || process.env.SEED_DEMO_USERS === 'true';

  if (demoAdmin && adminPassword) {
    const email = (process.env.SEED_ADMIN_EMAIL ?? demoAdmin.email).toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          phone: IS_PROD ? null : normalizeBdPhone(demoAdmin.phone),
          name: demoAdmin.name,
          role: 'OWNER',
          passwordHash: await hashPassword(adminPassword),
          emailVerified: new Date(),
        },
      });
      bump('users_created');
    }
    bump('users');
  } else if (IS_PROD) {
    console.warn('  ! production: no SEED_ADMIN_PASSWORD / ADMIN_BOOTSTRAP_PASSWORD → OWNER not seeded (the API bootstraps it on first boot)');
  }

  if (demoCustomer && withCustomer) {
    const phone = normalizeBdPhone(demoCustomer.phone)!;
    const email = demoCustomer.email.toLowerCase();
    const hash = await hashPassword('123456');
    await prisma.$transaction(async (tx) => {
      let user = await tx.user.findFirst({ where: { OR: [{ email }, { phone }] } });
      if (!user) {
        user = await tx.user.create({ data: { email, phone, name: demoCustomer.name, role: 'CUSTOMER', passwordHash: hash, phoneVerified: new Date() } });
        bump('users_created');
      }
      await tx.customer.upsert({
        where: { phone },
        update: { userId: user.id },
        create: { phone, email, name: demoCustomer.name, userId: user.id },
      });
      bump('users');
      bump('customers');
    }, TX);
  }
}

async function report() {
  const tables = [
    'geo_divisions', 'geo_districts', 'geo_upazilas', 'geo_unions', 'shipping_zones', 'shipping_rules', 'sections', 'categories',
    'authors', 'brands', 'products', 'product_authors', 'media_assets', 'product_images', 'stock_movements', 'bundles', 'bundle_items',
    'couriers', 'cash_accounts', 'document_counters', 'coupons', 'announcements', 'promo_popups', 'hero_slides', 'canned_replies',
    'store_settings', 'tags', 'users', 'customers',
  ];
  const rows: Record<string, number> = {};
  for (const t of tables) {
    const r = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${t}"`);
    rows[t] = Number(r[0].n);
  }
  console.log('\nRows in database after seed:');
  console.table(rows);
  const created = Object.entries(counts).filter(([k]) => k.endsWith('_created'));
  if (created.length) console.log('Created this run:', Object.fromEntries(created));
}

async function main() {
  const started = Date.now();
  console.log(`Seeding Cholo (${IS_PROD ? 'production' : 'non-production'}${FORCE ? ', SEED_FORCE' : ''}) from ${DATA_DIR}`);
  const content = load<ContentJson>('content.json');
  const products = load<ProductJson[]>('products.json');

  await seedShippingAndGeo(content);
  console.log('  ✓ shipping zones + geo');
  const sectionIds = await seedSections();
  console.log('  ✓ sections');
  await seedShippingRules(content, sectionIds);
  console.log('  ✓ shipping rules');
  const cats = await seedCategories(sectionIds, products);
  console.log('  ✓ categories');
  await seedCatalog(sectionIds, cats, products);
  console.log('  ✓ authors, brands, products, images, bundles');
  await seedOperations();
  console.log('  ✓ couriers, cash accounts, document counters');
  await seedPromotionsAndContent(content, sectionIds, cats);
  console.log('  ✓ coupons, announcements, promo, hero slides, canned replies, settings, tags');
  await seedUsers(content);
  console.log('  ✓ users');

  await report();
  console.log(`Seed finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
