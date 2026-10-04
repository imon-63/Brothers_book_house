import { Injectable } from '@nestjs/common';
import { Prisma, type ContentStatus } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { DEFAULT_LOW_STOCK } from '../domain/stock';
import { UPCOMING_DAYS } from './product-card.loader';
import { containsPattern, normaliseQuery, searchTokens } from '../domain/search';
import { isUuid } from './query-transforms';

export type ProductSort = 'relevance' | 'popular' | 'new' | 'price' | 'rating' | 'name' | 'stock' | 'sold' | 'margin';
export type AdminQuick = 'all' | 'low' | 'out' | 'deal' | 'nocost' | 'free' | 'hidden';

export type ProductListFilter = {
  /** public → only storefront-visible rows; admin → everything (soft-deleted only on request) */
  scope: 'public' | 'admin';
  section?: string;
  category?: string;
  subcategory?: string;
  author?: string;
  q?: string;
  inStock?: boolean;
  onDeal?: boolean;
  /** a timed deal starts within UPCOMING_DAYS */
  upcomingDeal?: boolean;
  freeShipping?: boolean;
  minPrice?: number;
  maxPrice?: number;
  excludeIds?: string[];
  // admin only
  quick?: AdminQuick;
  /** override for "low stock" (admin prefs); default = product threshold ?? 5 */
  lowStock?: number;
  status?: ContentStatus;
  deleted?: boolean;
  sort?: ProductSort;
  order?: 'asc' | 'desc';
  skip: number;
  take: number;
};

type IdRow = { id: string; total: number };

/** Effective price in SQL — same rule as domain/effective-price.ts (a live, cheaper deal wins). */
const EFF = Prisma.sql`COALESCE(ld.deal_price, p.price)`;
const AVAILABLE = Prisma.sql`(p.stock_on_hand - p.stock_reserved)`;
const SELLABLE = Prisma.sql`(NOT p.track_inventory OR p.allow_backorder OR ${AVAILABLE} > 0)`;

/**
 * Filtering + ordering for product lists, done in SQL so pagination, price
 * ranges and "sort by price / margin" use the *effective* price (live deals)
 * rather than the stored one. Returns ids in order + total; callers hydrate
 * with Prisma includes.
 */
@Injectable()
export class ProductListRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findIds(f: ProductListFilter, now = new Date()): Promise<{ ids: string[]; total: number }> {
    const at = Prisma.sql`${now.toISOString()}::timestamptz`;
    const where = this.where(f, at);
    const order = this.orderBy(f);
    const rows = await this.prisma.$queryRaw<IdRow[]>`
      SELECT p.id, (count(*) OVER())::int AS total
        FROM products p
        JOIN sections s   ON s.id = p.section_id
        JOIN categories c ON c.id = p.category_id
   LEFT JOIN categories sc ON sc.id = p.subcategory_id
   LEFT JOIN LATERAL (
          SELECT d.deal_price FROM product_deals d
           WHERE d.product_id = p.id AND d.cancelled_at IS NULL
             AND d.starts_at <= ${at} AND d.ends_at > ${at} AND d.deal_price < p.price
           ORDER BY d.deal_price LIMIT 1) ld ON true
       WHERE ${where}
       ORDER BY ${order}
       LIMIT ${f.take} OFFSET ${f.skip}`;
    if (rows.length || f.skip === 0) return { ids: rows.map((r) => r.id), total: rows[0]?.total ?? 0 };
    // asked past the last page: still report the real total
    const [{ total }] = await this.prisma.$queryRaw<{ total: number }[]>`
      SELECT count(*)::int AS total
        FROM products p
        JOIN sections s   ON s.id = p.section_id
        JOIN categories c ON c.id = p.category_id
   LEFT JOIN categories sc ON sc.id = p.subcategory_id
   LEFT JOIN LATERAL (
          SELECT d.deal_price FROM product_deals d
           WHERE d.product_id = p.id AND d.cancelled_at IS NULL
             AND d.starts_at <= ${at} AND d.ends_at > ${at} AND d.deal_price < p.price
           ORDER BY d.deal_price LIMIT 1) ld ON true
       WHERE ${where}`;
    return { ids: [], total };
  }

  /** Counts for the admin quick-filter chips + stock valuation, in one pass. */
  async adminSummary(section: string | undefined, lowStock: number | undefined, now = new Date()) {
    const at = Prisma.sql`${now.toISOString()}::timestamptz`;
    const low = this.lowThreshold(lowStock);
    const rows = await this.prisma.$queryRaw<
      { all: number; low: number; out: number; deal: number; nocost: number; free: number; hidden: number; units: number; stock_value: Prisma.Decimal; retail_value: Prisma.Decimal }[]
    >`
      SELECT count(*)::int AS all,
             count(*) FILTER (WHERE p.track_inventory AND ${AVAILABLE} > 0 AND ${AVAILABLE} <= ${low})::int AS low,
             count(*) FILTER (WHERE p.track_inventory AND ${AVAILABLE} <= 0)::int AS out,
             count(*) FILTER (WHERE ld.deal_price IS NOT NULL)::int AS deal,
             count(*) FILTER (WHERE p.cost_price IS NULL OR p.cost_price <= 0)::int AS nocost,
             count(*) FILTER (WHERE p.free_shipping)::int AS free,
             count(*) FILTER (WHERE ${this.hiddenCat()})::int AS hidden,
             COALESCE(sum(GREATEST(p.stock_on_hand, 0)), 0)::int AS units,
             COALESCE(sum(GREATEST(p.stock_on_hand, 0) * COALESCE(p.cost_price, 0)), 0) AS stock_value,
             COALESCE(sum(GREATEST(p.stock_on_hand, 0) * ${EFF}), 0) AS retail_value
        FROM products p
        JOIN sections s   ON s.id = p.section_id
        JOIN categories c ON c.id = p.category_id
   LEFT JOIN categories sc ON sc.id = p.subcategory_id
   LEFT JOIN LATERAL (
          SELECT d.deal_price FROM product_deals d
           WHERE d.product_id = p.id AND d.cancelled_at IS NULL
             AND d.starts_at <= ${at} AND d.ends_at > ${at} AND d.deal_price < p.price
           ORDER BY d.deal_price LIMIT 1) ld ON true
       WHERE p.deleted_at IS NULL ${section ? Prisma.sql`AND ${this.sectionCond(section)}` : Prisma.empty}`;
    return rows[0];
  }

  // ─── SQL building ───

  private where(f: ProductListFilter, at: Prisma.Sql): Prisma.Sql {
    const c: Prisma.Sql[] = [];

    if (f.scope === 'public') {
      c.push(Prisma.sql`p.deleted_at IS NULL AND p.status = 'ACTIVE'`);
      c.push(Prisma.sql`s.is_visible AND c.is_visible AND c.deleted_at IS NULL`);
      c.push(Prisma.sql`(sc.id IS NULL OR (sc.is_visible AND sc.deleted_at IS NULL))`);
      c.push(Prisma.sql`(p.published_at IS NULL OR p.published_at <= ${at})`);
    } else {
      c.push(f.deleted ? Prisma.sql`p.deleted_at IS NOT NULL` : Prisma.sql`p.deleted_at IS NULL`);
      if (f.status) c.push(Prisma.sql`p.status = ${f.status}::content_status`);
    }

    if (f.section) c.push(this.sectionCond(f.section));
    if (f.category) c.push(isUuid(f.category) ? Prisma.sql`c.id = ${f.category}::uuid` : Prisma.sql`c.slug = ${f.category}`);
    if (f.subcategory) c.push(isUuid(f.subcategory) ? Prisma.sql`sc.id = ${f.subcategory}::uuid` : Prisma.sql`sc.slug = ${f.subcategory}`);
    if (f.author) {
      const a = isUuid(f.author) ? Prisma.sql`pa.author_id = ${f.author}::uuid` : Prisma.sql`au.slug = ${f.author}`;
      c.push(Prisma.sql`EXISTS (SELECT 1 FROM product_authors pa JOIN authors au ON au.id = pa.author_id
                                 WHERE pa.product_id = p.id AND au.deleted_at IS NULL AND ${a})`);
    }
    if (f.excludeIds?.length) c.push(Prisma.sql`p.id NOT IN (${Prisma.join(f.excludeIds.map((id) => Prisma.sql`${id}::uuid`))})`);

    const search = this.searchCond(f.q, f.scope === 'admin');
    if (search) c.push(search);

    if (f.inStock) c.push(SELLABLE);
    if (f.onDeal) c.push(Prisma.sql`ld.deal_price IS NOT NULL`);
    if (f.upcomingDeal) {
      c.push(Prisma.sql`EXISTS (SELECT 1 FROM product_deals ud
                                 WHERE ud.product_id = p.id AND ud.cancelled_at IS NULL AND ud.deal_price < p.price
                                   AND ud.starts_at > ${at} AND ud.starts_at <= ${at} + make_interval(days => ${UPCOMING_DAYS}::int))`);
    }
    if (f.freeShipping != null) c.push(f.freeShipping ? Prisma.sql`p.free_shipping` : Prisma.sql`NOT p.free_shipping`);
    if (f.minPrice != null) c.push(Prisma.sql`${EFF} >= ${f.minPrice}`);
    if (f.maxPrice != null) c.push(Prisma.sql`${EFF} <= ${f.maxPrice}`);

    if (f.scope === 'admin' && f.quick && f.quick !== 'all') {
      const low = this.lowThreshold(f.lowStock);
      const quick: Record<Exclude<AdminQuick, 'all'>, Prisma.Sql> = {
        low: Prisma.sql`p.track_inventory AND ${AVAILABLE} > 0 AND ${AVAILABLE} <= ${low}`,
        out: Prisma.sql`p.track_inventory AND ${AVAILABLE} <= 0`,
        deal: Prisma.sql`ld.deal_price IS NOT NULL`,
        nocost: Prisma.sql`(p.cost_price IS NULL OR p.cost_price <= 0)`,
        free: Prisma.sql`p.free_shipping`,
        hidden: this.hiddenCat(),
      };
      c.push(quick[f.quick]);
    }

    return Prisma.join(c, ' AND ');
  }

  private sectionCond(section: string) {
    return isUuid(section) ? Prisma.sql`s.id = ${section}::uuid` : Prisma.sql`s.code = ${section}`;
  }

  private hiddenCat() {
    return Prisma.sql`(NOT c.is_visible OR c.deleted_at IS NOT NULL OR (sc.id IS NOT NULL AND (NOT sc.is_visible OR sc.deleted_at IS NOT NULL)))`;
  }

  private lowThreshold(override?: number) {
    return override != null ? Prisma.sql`${override}::int` : Prisma.sql`COALESCE(p.low_stock_threshold, ${DEFAULT_LOW_STOCK}::int)`;
  }

  /**
   * Every token must appear in the title or subtitle (author/unit line) —
   * ILIKE uses the pg_trgm GIN indexes — or the whole query must be
   * trigram-close to the title (typos, Bangla spelling variants).
   */
  private searchCond(q: string | undefined, admin: boolean): Prisma.Sql | null {
    const tokens = searchTokens(q);
    if (!tokens.length) return null;
    const full = normaliseQuery(q);
    const all = Prisma.join(
      tokens.map((t) => {
        const pat = containsPattern(t);
        return admin
          ? Prisma.sql`(p.title ILIKE ${pat} OR p.subtitle ILIKE ${pat} OR p.sku ILIKE ${pat})`
          : Prisma.sql`(p.title ILIKE ${pat} OR p.subtitle ILIKE ${pat})`;
      }),
      ' AND ',
    );
    const exactLegacy = admin && /^\d{1,9}$/.test(full) ? Prisma.sql` OR p.legacy_id = ${Number(full)}` : Prisma.empty;
    return Prisma.sql`((${all}) OR word_similarity(${full}, p.title) >= 0.45${exactLegacy})`;
  }

  private orderBy(f: ProductListFilter): Prisma.Sql {
    const dir = f.order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const sort: ProductSort = f.sort ?? (normaliseQuery(f.q) ? 'relevance' : f.scope === 'admin' ? 'new' : 'popular');
    switch (sort) {
      case 'relevance': {
        const q = normaliseQuery(f.q);
        if (!q) return Prisma.sql`p.sold_count DESC, p.id DESC`;
        const starts = Prisma.sql`${`${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`}`;
        return Prisma.sql`(p.title ILIKE ${starts}) DESC, GREATEST(similarity(p.title, ${q}), word_similarity(${q}, p.title)) DESC, p.sold_count DESC, p.id DESC`;
      }
      case 'popular':
      case 'sold':
        return Prisma.sql`p.sold_count ${dir}, p.id DESC`;
      case 'new':
        return Prisma.sql`p.created_at ${dir}, p.id ${dir}`;
      case 'price':
        return Prisma.sql`${EFF} ${dir}, p.sold_count DESC, p.id DESC`;
      case 'rating':
        return Prisma.sql`p.rating_avg ${dir}, p.rating_count ${dir}, p.id DESC`;
      case 'name':
        return Prisma.sql`p.title ${dir}, p.id DESC`;
      case 'stock':
        return Prisma.sql`${AVAILABLE} ${dir}, p.id DESC`;
      case 'margin':
        // unknown cost sorts last in both directions
        return Prisma.sql`CASE WHEN p.cost_price > 0 AND ${EFF} > 0 THEN (${EFF} - p.cost_price) / ${EFF} END ${dir} NULLS LAST, p.id DESC`;
    }
  }
}
