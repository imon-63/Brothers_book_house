import { Module } from '@nestjs/common';
import { CatalogSharedModule } from '../shared/catalog-shared.module';
import { AuthorCatalogService } from './application/author-catalog.service';
import { ContributorAdminService } from './application/contributor-admin.service';
import { AuthorsController } from './controllers/authors.controller';
import { ContributorsAdminController } from './controllers/contributors.admin.controller';

/** লেখক, প্রকাশনী, ব্র্যান্ড. */
@Module({
  imports: [CatalogSharedModule],
  controllers: [AuthorsController, ContributorsAdminController],
  providers: [AuthorCatalogService, ContributorAdminService],
})
export class ContributorsModule {}
