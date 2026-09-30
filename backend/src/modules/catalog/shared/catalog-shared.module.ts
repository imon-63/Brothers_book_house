import { Module } from '@nestjs/common';
import { ProductListRepository } from './product-list.repository';
import { ProductCardLoader } from './product-card.loader';
import { SlugService } from './slug.service';
import { StockEventsService } from './stock-events.service';

/** Building blocks shared by the catalog sub-modules (not exported outside catalog). */
@Module({
  providers: [ProductListRepository, ProductCardLoader, SlugService, StockEventsService],
  exports: [ProductListRepository, ProductCardLoader, SlugService, StockEventsService],
})
export class CatalogSharedModule {}
