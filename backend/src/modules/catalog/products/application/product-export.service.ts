import { Injectable } from '@nestjs/common';
import type { AuthUser } from '@/common/types/auth-user';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { toCsv, type CsvCell } from '../../domain/csv';
import { toAdminProductRow, type AdminProductListItem } from '../../mappers/product.mapper';
import { ProductListRepository } from '../../shared/product-list.repository';
import type { AdminProductQueryDto } from '../dto/product-query.dto';
import { ProductAdminService } from './product-admin.service';

const EXPORT_MAX = 10_000;
const CHUNK = 500;

/** Same columns as the admin panel's "CSV" button. */
export function productCsvRows(rows: AdminProductListItem[], sectionCode?: string): CsvCell[][] {
  const who = sectionCode === 'book' ? 'Author' : sectionCode ? 'Brand' : 'Author/Brand';
  return [
    ['ID', 'Title', who, 'Category', 'Sub', 'Cost', 'Old', 'Price', 'Discount %', 'Deal price', 'Deal until', 'Stock', 'Copies', 'Sold', 'Stock value', 'Free ship'],
    ...rows.map((p) => [
      p.legacyId ?? p.sku,
      p.title,
      p.authorLine ?? '',
      p.category.name,
      p.subcategory?.name ?? '',
      p.costPrice ?? 0,
      p.storedCompareAt ?? 0,
      p.regularPrice,
      p.discountPct,
      p.deal ? p.deal.dealPrice : '',
      p.deal ? p.deal.endsAt : '',
      p.stock.available,
      p.stock.initialCopies ?? p.stock.onHand,
      p.soldCount,
      Math.round(Math.max(0, p.stock.onHand) * (p.costPrice ?? 0) * 100) / 100,
      p.freeShipping,
    ]),
  ];
}

@Injectable()
export class ProductExportService {
  constructor(
    private readonly list: ProductListRepository,
    private readonly products: ProductAdminService,
    private readonly audit: AuditService,
  ) {}

  @Traced('catalog.admin.products.export')
  async csv(q: AdminProductQueryDto, actor: AuthUser): Promise<{ filename: string; body: string; count: number }> {
    const now = new Date();
    const filter = { scope: 'admin' as const, section: q.section, category: q.category, subcategory: q.subcategory, q: q.q, quick: q.quick, lowStock: q.lowStock, status: q.status, deleted: q.deleted, freeShipping: q.freeShipping, sort: q.sort, order: q.order };
    const rows: AdminProductListItem[] = [];
    for (let skip = 0; skip < EXPORT_MAX; skip += CHUNK) {
      const { ids } = await this.list.findIds({ ...filter, skip, take: CHUNK }, now);
      if (!ids.length) break;
      rows.push(...(await this.products.rows(ids, now)).map((r) => toAdminProductRow(r, now, q.lowStock)));
      if (ids.length < CHUNK) break;
    }
    const sectionCode = q.section && !/^[0-9a-f-]{36}$/i.test(q.section) ? q.section : undefined;
    await this.audit.record({ actor, action: 'EXPORT', area: 'product', entityType: 'Product', summary: `${rows.length}টি পণ্য CSV তে নামানো হলো`, after: { filter: JSON.parse(JSON.stringify(filter)) } });
    return { filename: `products-${sectionCode ?? 'all'}-${now.toISOString().slice(0, 10)}.csv`, body: toCsv(productCsvRows(rows, sectionCode)), count: rows.length };
  }
}
