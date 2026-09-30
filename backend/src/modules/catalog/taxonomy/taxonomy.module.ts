import { Module } from '@nestjs/common';
import { CatalogSharedModule } from '../shared/catalog-shared.module';
import { CategoryAdminService } from './application/category-admin.service';
import { SectionAdminService } from './application/section-admin.service';
import { TaxonomyQueryService } from './application/taxonomy-query.service';
import { SectionsController } from './controllers/sections.controller';
import { TaxonomyAdminController } from './controllers/taxonomy.admin.controller';

/** বিভাগ (sections) and the 2-level category tree. */
@Module({
  imports: [CatalogSharedModule],
  controllers: [SectionsController, TaxonomyAdminController],
  providers: [TaxonomyQueryService, SectionAdminService, CategoryAdminService],
})
export class TaxonomyModule {}
