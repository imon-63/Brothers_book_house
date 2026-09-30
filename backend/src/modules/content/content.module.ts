import { Module } from '@nestjs/common';
import { ContentAdminService } from './application/content-admin.service';
import { StoreSettingsService } from './application/store-settings.service';
import { StorefrontService } from './application/storefront.service';
import { ContentAdminController } from './controllers/content.admin.controller';
import { ContentController } from './controllers/content.controller';

/** Storefront content (top bar, promo popup, hero slides) and typed store settings. */
@Module({
  controllers: [ContentController, ContentAdminController],
  providers: [ContentAdminService, StoreSettingsService, StorefrontService],
  exports: [StoreSettingsService],
})
export class ContentModule {}
