import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/auth.decorators';
import { CouponsService } from '../application/coupons.service';

@ApiTags('Coupons · কুপন')
@Controller({ path: 'coupons', version: '1' })
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Public()
  @Get('header')
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Live coupons for the storefront nav chips' })
  header() {
    return this.coupons.header();
  }
}
