import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { CatalogSharedModule } from '../shared/catalog-shared.module';
import { DealService } from './application/deal.service';
import { ProductAdminService } from './application/product-admin.service';
import { ProductBulkService } from './application/product-bulk.service';
import { ProductCatalogService } from './application/product-catalog.service';
import { ProductExportService } from './application/product-export.service';
import { ProductGuards } from './application/product-guards';
import { ProductImagesService } from './application/product-images.service';
import { ProductStockService } from './application/product-stock.service';
import { StockWriter } from './application/stock-writer';
import { ProductOpsAdminController } from './controllers/product-ops.admin.controller';
import { ProductsAdminController } from './controllers/products.admin.controller';
import { ProductsController } from './controllers/products.controller';

/** Products: storefront reads, admin CRUD, bulk ops, stock screens, deals, gallery, export. */
@Module({
  imports: [CatalogSharedModule, MediaModule],
  controllers: [ProductsController, ProductsAdminController, ProductOpsAdminController],
  providers: [
    ProductCatalogService,
    ProductAdminService,
    ProductBulkService,
    ProductStockService,
    ProductExportService,
    ProductImagesService,
    DealService,
    ProductGuards,
    StockWriter,
  ],
})
export class ProductsModule {}
