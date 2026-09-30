import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { buildCategoryTree } from '../../domain/category-tree';
import { toCategoryTreeView, toSectionView } from '../../mappers/taxonomy.mapper';
import { publicProductWhere } from '../../shared/visibility';

/** Storefront navigation: visible sections → visible 2-level category tree + hero copy. */
@Injectable()
export class TaxonomyQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async sections() {
    const now = new Date();
    const [sections, categories, byCat, bySub] = await Promise.all([
      this.prisma.section.findMany({ where: { isVisible: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] }),
      this.prisma.category.findMany({
        where: { deletedAt: null, isVisible: true, section: { isVisible: true } },
        include: { image: { select: { url: true } } },
      }),
      this.prisma.product.groupBy({ by: ['categoryId'], where: publicProductWhere(now), _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['subcategoryId'], where: { ...publicProductWhere(now), subcategoryId: { not: null } }, _count: { _all: true } }),
    ]);
    const counts = new Map<string, number>();
    for (const r of byCat) counts.set(r.categoryId, r._count._all);
    for (const r of bySub) if (r.subcategoryId) counts.set(r.subcategoryId, r._count._all);

    return sections.map((s) => ({
      ...toSectionView(s),
      categories: toCategoryTreeView(
        buildCategoryTree(
          categories.filter((c) => c.sectionId === s.id),
          { visibleOnly: true, counts },
        ),
      ),
    }));
  }
}
