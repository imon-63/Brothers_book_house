import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/auth.decorators';
import { PublicCache } from '../../shared/http';
import { ProductCatalogService } from '../application/product-catalog.service';
import { PublicProductQueryDto, SuggestQueryDto } from '../dto/product-query.dto';

@ApiTags('Catalog · ক্যাটালগ')
@Public()
@Controller({ version: '1' })
export class ProductsController {
  constructor(private readonly catalog: ProductCatalogService) {}

  @Get('products')
  @PublicCache(60)
  @ApiOperation({ summary: 'Storefront product list: filters, trigram search, effective-price sorting, paginated cards' })
  list(@Query() q: PublicProductQueryDto) {
    return this.catalog.search(q);
  }

  @Get('products/:idOrSlug')
  @PublicCache(60)
  @ApiParam({ name: 'idOrSlug', description: 'uuid, legacy numeric id or slug' })
  @ApiOperation({ summary: 'Product page: gallery, authors, publisher/brand, specs, related' })
  detail(@Param('idOrSlug') idOrSlug: string) {
    return this.catalog.detail(idOrSlug);
  }

  @Get('search/suggest')
  @PublicCache(30)
  @ApiOperation({ summary: 'Search-box suggestions: products, authors, categories, bundles' })
  suggest(@Query() q: SuggestQueryDto) {
    return this.catalog.suggest(q);
  }
}
