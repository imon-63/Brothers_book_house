import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { skipTake, toPage } from '@/common/dto/pagination.dto';
import { NotFoundError } from '@/common/errors/domain.error';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { searchTokens } from '../../domain/search';
import { bundleInclude, toBundle } from '../../mappers/bundle.mapper';
import { isUuid } from '../../shared/query-transforms';
import { publicBundleWhere } from '../../shared/visibility';
import type { PublicBundleQueryDto } from '../dto/bundle.dto';

/** প্যাকেজ on the storefront. */
@Injectable()
export class BundleCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  @Traced('catalog.bundles.list')
  async list(q: PublicBundleQueryDto) {
    const now = new Date();
    const where: Prisma.BundleWhereInput = {
      ...publicBundleWhere(),
      ...(q.section ? { section: { isVisible: true, ...(isUuid(q.section) ? { id: q.section } : { code: q.section }) } } : {}),
      AND: searchTokens(q.q).map((t) => ({ title: { contains: t, mode: 'insensitive' as const } })),
    };
    const [rows, total] = await Promise.all([
      this.prisma.bundle.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { soldCount: 'desc' }, { createdAt: 'desc' }], ...skipTake(q), include: bundleInclude(now) }),
      this.prisma.bundle.count({ where }),
    ]);
    return toPage(rows.map((b) => toBundle(b, now)), total, q);
  }

  @Traced('catalog.bundles.detail')
  async detail(idOrSlug: string) {
    const now = new Date();
    const key: Prisma.BundleWhereInput = isUuid(idOrSlug) ? { id: idOrSlug } : /^\d{1,9}$/.test(idOrSlug) ? { legacyId: Number(idOrSlug) } : { slug: idOrSlug };
    const b = await this.prisma.bundle.findFirst({ where: { ...key, ...publicBundleWhere() }, include: bundleInclude(now) });
    if (!b) throw new NotFoundError('Bundle', idOrSlug);
    return toBundle(b, now);
  }
}
