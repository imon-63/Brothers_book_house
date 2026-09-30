import { Module } from '@nestjs/common';
import { BundlesModule } from './bundles/bundles.module';
import { ContributorsModule } from './contributors/contributors.module';
import { MediaModule } from './media/media.module';
import { ProductsModule } from './products/products.module';
import { TaxonomyModule } from './taxonomy/taxonomy.module';

/**
 * Catalog: sections & categories, products (storefront + admin, stock
 * screens, deals, gallery), bundles, authors/publishers/brands and media.
 * Stock itself only moves through the global InventoryService.
 */
@Module({
  imports: [TaxonomyModule, ProductsModule, BundlesModule, ContributorsModule, MediaModule],
})
export class CatalogModule {}
