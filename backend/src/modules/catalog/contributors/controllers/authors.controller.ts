import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import { Public } from '@/common/decorators/auth.decorators';
import { PublicCache } from '../../shared/http';
import { AuthorCatalogService } from '../application/author-catalog.service';
import { PublicAuthorQueryDto } from '../dto/contributor.dto';

@ApiTags('Catalog · ক্যাটালগ')
@Public()
@Controller({ path: 'authors', version: '1' })
export class AuthorsController {
  constructor(private readonly authors: AuthorCatalogService) {}

  @Get()
  @PublicCache(300)
  @ApiOperation({ summary: 'Authors with visible products (count, sold, categories — for the লেখক page groups)' })
  list(@Query() q: PublicAuthorQueryDto) {
    return this.authors.search(q);
  }

  @Get(':slug')
  @PublicCache(120)
  @ApiOperation({ summary: 'Author page with their products (paginated cards)' })
  detail(@Param('slug') slug: string, @Query() q: PageQueryDto) {
    return this.authors.detail(slug, q);
  }
}
