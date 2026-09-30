import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PageQueryDto, skipTake, toPage } from '@/common/dto/pagination.dto';
import { NotFoundError } from '@/common/errors/domain.error';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { searchTokens } from '../../domain/search';
import { toAuthorView } from '../../mappers/contributor.mapper';
import { ProductCardLoader } from '../../shared/product-card.loader';
import { ProductListRepository } from '../../shared/product-list.repository';
import { isUuid } from '../../shared/query-transforms';
import { publicProductWhere } from '../../shared/visibility';
import type { PublicAuthorQueryDto } from '../dto/contributor.dto';

/** লেখক pages on the storefront — only authors with at least one visible product. */
@Injectable()
export class AuthorCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly list: ProductListRepository,
    private readonly cards: ProductCardLoader,
  ) {}

  @Traced('catalog.authors.list')
  async search(q: PublicAuthorQueryDto) {
    const now = new Date();
    const productWhere: Prisma.ProductWhereInput = {
      ...publicProductWhere(now),
      ...(q.section ? { section: { isVisible: true, ...(isUuid(q.section) ? { id: q.section } : { code: q.section }) } } : {}),
      ...(q.category ? { category: { isVisible: true, deletedAt: null, ...(isUuid(q.category) ? { id: q.category } : { slug: q.category }) } } : {}),
    };
    const tokens = searchTokens(q.q);
    const where: Prisma.AuthorWhereInput = {
      deletedAt: null,
      products: { some: { product: productWhere } },
      ...(tokens.length
        ? { OR: [{ AND: tokens.map((t) => ({ nameBn: { contains: t, mode: 'insensitive' as const } })) }, { AND: tokens.map((t) => ({ nameEn: { contains: t, mode: 'insensitive' as const } })) }] }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.author.findMany({
        where,
        orderBy: { nameBn: q.order === 'desc' && q.q ? 'desc' : 'asc' },
        ...skipTake(q),
        include: {
          photo: { select: { url: true } },
          products: {
            where: { product: productWhere },
            select: { product: { select: { soldCount: true, category: { select: { id: true, slug: true, nameBn: true } } } } },
          },
        },
      }),
      this.prisma.author.count({ where }),
    ]);
    return toPage(
      rows.map((a) => {
        const cats = new Map<string, { id: string; slug: string; name: string }>();
        for (const pa of a.products) cats.set(pa.product.category.id, { id: pa.product.category.id, slug: pa.product.category.slug, name: pa.product.category.nameBn });
        return {
          ...toAuthorView(a),
          productCount: a.products.length,
          soldCount: a.products.reduce((n, pa) => n + pa.product.soldCount, 0),
          categories: [...cats.values()],
        };
      }),
      total,
      q,
    );
  }

  @Traced('catalog.authors.detail')
  async detail(slug: string, q: PageQueryDto) {
    const now = new Date();
    const a = await this.prisma.author.findFirst({ where: { deletedAt: null, ...(isUuid(slug) ? { id: slug } : { slug }) }, include: { photo: { select: { url: true } } } });
    if (!a) throw new NotFoundError('Author', slug);
    const { ids, total } = await this.list.findIds({ scope: 'public', author: a.id, sort: 'popular', ...skipTake(q) }, now);
    return { ...toAuthorView(a), products: toPage(await this.cards.cards(ids, now), total, q) };
  }
}
