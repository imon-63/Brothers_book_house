import { Module } from '@nestjs/common';
import { CatalogSharedModule } from '../shared/catalog-shared.module';
import { BundleAdminService } from './application/bundle-admin.service';
import { BundleCatalogService } from './application/bundle-catalog.service';
import { BundlesAdminController } from './controllers/bundles.admin.controller';
import { BundlesController } from './controllers/bundles.controller';

/** প্যাকেজ — fixed-price bundles of products. */
@Module({
  imports: [CatalogSharedModule],
  controllers: [BundlesController, BundlesAdminController],
  providers: [BundleCatalogService, BundleAdminService],
})
export class BundlesModule {}
