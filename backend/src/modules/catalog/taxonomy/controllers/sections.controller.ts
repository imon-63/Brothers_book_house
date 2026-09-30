import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/auth.decorators';
import { PublicCache } from '../../shared/http';
import { TaxonomyQueryService } from '../application/taxonomy-query.service';

@ApiTags('Catalog · ক্যাটালগ')
@Public()
@Controller({ path: 'sections', version: '1' })
export class SectionsController {
  constructor(private readonly taxonomy: TaxonomyQueryService) {}

  @Get()
  @PublicCache(120)
  @ApiOperation({ summary: 'Visible sections with hero copy and their visible 2-level category tree' })
  list() {
    return this.taxonomy.sections();
  }
}
