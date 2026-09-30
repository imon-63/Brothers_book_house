import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/auth.decorators';
import { StorefrontService } from '../application/storefront.service';

@ApiTags('Content · স্টোরফ্রন্ট')
@Public()
@Controller({ path: 'content', version: '1' })
export class ContentController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get('storefront')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  @ApiOperation({ summary: 'Top-bar announcements, active promo popup (+coupon), hero slides per section, public settings' })
  get() {
    return this.storefront.storefront();
  }
}
