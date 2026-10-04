import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { NotFoundError } from '@/common/errors/domain.error';
import { toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { searchTokens } from '../../domain/search';
import { bundleInclude, toBundle } from '../../mappers/bundle.mapper';
import { toProductCard, toProductDetail } from '../../mappers/product.mapper';
import { ProductCardLoader } from '../../shared/product-card.loader';
import { productCardInclude, productDetailInclude } from '../../shared/product-includes';
import { ProductListRepository, type ProductSort } from '../../shared/product-list.repository';
import { isUuid } from '../../shared/query-transforms';
import { publicBundleWhere, publicProductWhere } from '../../shared/visibility';
import type { PublicProductQueryDto, PublicSort, SuggestQueryDto } from '../dto/product-query.dto';

const SORT_MAP: Record<PublicSort, { sort: ProductSort; order: 'asc' | 'desc' }> = {
  relevance: { sort: 'relevance', order: 'desc' },
  popular: { sort: 'popular', order: 'desc' },
  new: { sort: 'new', order: 'desc' },
  price_asc: { sort: 'price', order: 'asc' },
  price_desc: { sort: 'price', order: 'desc' },
  rating: { sort: 'rating', order: 'desc' },
};

const RELATED = 8;

/** Storefront product reads — only ACTIVE, visible, not-deleted rows. */
@Injectable()
export class ProductCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly list: ProductListRepository,
    private readonly cards: ProductCardLoader,
  ) {}

  @Traced('catalog.products.list')
  async search(q: PublicProductQueryDto) {
    const now = new Date();
    const s = q.sort ? SORT_MAP[q.sort] : undefined;
    const { ids, total } = await this.list.findIds(
      {
        scope: 'public',
        section: q.section,
        category: q.category,
        subcategory: q.subcategory,
        author: q.author,
        q: q.q,
        inStock: q.inStock,
        onDeal: q.onDeal,
        upcomingDeal: q.upcomingDeal,
        freeShipping: q.freeShipping,
        minPrice: q.minPrice,
        maxPrice: q.maxPrice,
        sort: s?.sort,
        order: s?.order,
        ...skipTake(q),
      },
      now,
    );
    return toPage(await this.cards.cards(ids, now), total, q);
  }

  /** `/product/:idOrSlug` — uuid, legacy numeric id (old storefront links) or slug. */
  @Traced('catalog.products.detail')
  async detail(idOrSlug: string) {
    const now = new Date();
    const key: Prisma.ProductWhereInput = isUuid(idOrSlug) ? { id: idOrSlug } : /^\d{1,9}$/.test(idOrSlug) ? { legacyId: Number(idOrSlug) } : { slug: idOrSlug };
    const p = await this.prisma.product.findFirst({ where: { ...key, ...publicProductWhere(now) }, include: productDetailInclude(now) });
    if (!p) throw new NotFoundError('Product', idOrSlug);
    const related = await this.cards.withNextDeal(await this.related(p.id, p.categoryId, p.sectionId, now), now);
    const next = await this.cards.nextDeals([p.id], now);
    return { ...toProductDetail(p, related, now), nextDeal: next.get(p.id) ?? null };
  }

  /** Cart guard: is a timed deal about to start on this product? (buying now = regular price) */
  @Traced('catalog.products.next_deal')
  async nextDeal(id: string) {
    const now = new Date();
    if (!isUuid(id)) throw new NotFoundError('Product', id);
    const p = await this.prisma.product.findFirst({ where: { id, ...publicProductWhere(now) }, select: { id: true, title: true, price: true } });
    if (!p) throw new NotFoundError('Product', id);
    const d = (await this.cards.nextDeals([id], now)).get(id) ?? null;
    return { productId: p.id, title: p.title, regularPrice: toNumber(p.price), nextDeal: d };
  }

  /** Same category first (best sellers), topped up from the same section. */
  private async related(id: string, categoryId: string, sectionId: string, now: Date) {
    const include = productCardInclude(now);
    const base = publicProductWhere(now);
    const same = await this.prisma.product.findMany({
      where: { ...base, categoryId, id: { not: id } },
      orderBy: [{ soldCount: 'desc' }, { id: 'desc' }],
      take: RELATED,
      include,
    });
    const rest =
      same.length < RELATED
        ? await this.prisma.product.findMany({
            where: { ...base, sectionId, id: { notIn: [id, ...same.map((x) => x.id)] } },
            orderBy: [{ soldCount: 'desc' }, { id: 'desc' }],
            take: RELATED - same.length,
            include,
          })
        : [];
    return [...same, ...rest].map((r) => toProductCard(r, now));
  }

  /** Search box: best product hits + matching authors, categories and bundles. */
  @Traced('catalog.search.suggest')
  async suggest(q: SuggestQueryDto) {
    const now = new Date();
    const tokens = searchTokens(q.q);
    if (!tokens.length) return { query: q.q ?? '', products: [], authors: [], categories: [], bundles: [], total: 0 };

    const all = (field: string) => tokens.map((t) => ({ [field]: { contains: t, mode: 'insensitive' as const } }));
    const sectionWhere: Prisma.SectionWhereInput | undefined = q.section ? (isUuid(q.section) ? { id: q.section } : { code: q.section }) : undefined;

    const [hits, authors, categories, bundles] = await Promise.all([
      this.list.findIds({ scope: 'public', section: q.section, q: q.q, sort: 'relevance', skip: 0, take: q.limit }, now),
      this.prisma.author.findMany({
        where: {
          deletedAt: null,
          OR: [{ AND: all('nameBn') }, { AND: all('nameEn') }],
          products: { some: { product: { ...publicProductWhere(now), ...(sectionWhere ? { section: { ...sectionWhere, isVisible: true } } : {}) } } },
        },
        take: 4,
        orderBy: { nameBn: 'asc' },
        select: { id: true, slug: true, nameBn: true, _count: { select: { products: true } } },
      }),
      this.prisma.category.findMany({
        where: {
          deletedAt: null,
          isVisible: true,
          section: { isVisible: true, ...(sectionWhere ?? {}) },
          OR: [{ parentId: null }, { parent: { isVisible: true, deletedAt: null } }],
          AND: [{ OR: [{ AND: all('nameBn') }, { AND: all('nameEn') }] }],
        },
        take: 4,
        orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }],
        select: { id: true, slug: true, nameBn: true, parent: { select: { id: true, slug: true, nameBn: true } }, section: { select: { code: true } } },
      }),
      this.prisma.bundle.findMany({
        where: {
          ...publicBundleWhere(),
          ...(sectionWhere ? { section: { ...sectionWhere, isVisible: true } } : {}),
          AND: tokens.map((t) => ({ OR: [{ title: { contains: t, mode: 'insensitive' as const } }, { items: { some: { product: { title: { contains: t, mode: 'insensitive' as const } } } } }] })),
        },
        take: 3,
        orderBy: [{ soldCount: 'desc' }, { sortOrder: 'asc' }],
        include: bundleInclude(now),
      }),
    ]);

    return {
      query: q.q,
      products: await this.cards.cards(hits.ids, now),
      authors: authors.map((a) => ({ id: a.id, slug: a.slug, name: a.nameBn, productCount: a._count.products })),
      categories: categories.map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.nameBn,
        section: c.section.code,
        parent: c.parent ? { id: c.parent.id, slug: c.parent.slug, name: c.parent.nameBn } : null,
      })),
      bundles: bundles.map((b) => {
        const v = toBundle(b, now);
        return { id: v.id, slug: v.slug, title: v.title, price: v.price, compareAt: v.compareAt, cover: v.cover, itemCount: v.itemCount };
      }),
      total: hits.total,
    };
  }
}

