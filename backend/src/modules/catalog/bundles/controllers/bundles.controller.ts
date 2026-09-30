import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/auth.decorators';
import { PublicCache } from '../../shared/http';
import { BundleCatalogService } from '../application/bundle-catalog.service';
import { PublicBundleQueryDto } from '../dto/bundle.dto';

@ApiTags('Catalog · ক্যাটালগ')
@Public()
@Controller({ path: 'bundles', version: '1' })
export class BundlesController {
  constructor(private readonly bundles: BundleCatalogService) {}

  @Get()
  @PublicCache(60)
  @ApiOperation({ summary: 'প্যাকেজ list: items, Σ separate price vs bundle price, saving, all-in-stock' })
  list(@Query() q: PublicBundleQueryDto) {
    return this.bundles.list(q);
  }

  @Get(':idOrSlug')
  @PublicCache(60)
  @ApiParam({ name: 'idOrSlug', description: 'uuid, legacy numeric id or slug' })
  @ApiOperation({ summary: 'Bundle page' })
  detail(@Param('idOrSlug') idOrSlug: string) {
    return this.bundles.detail(idOrSlug);
  }
}
