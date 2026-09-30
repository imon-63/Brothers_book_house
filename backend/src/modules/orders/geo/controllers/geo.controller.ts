import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/auth.decorators';
import { GeoService } from '../application/geo.service';
import { DistrictsQueryDto, UnionsQueryDto, UpazilasQueryDto } from '../dto/geo.dto';

const CACHE = 'public, max-age=86400, stale-while-revalidate=604800';

@ApiTags('Geo · ঠিকানা')
@Public()
@Controller({ path: 'geo', version: '1' })
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('divisions')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'বিভাগ list' })
  divisions() {
    return this.geo.divisions();
  }

  @Get('districts')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'জেলা list (optionally within a division), with shipping zone code' })
  districts(@Query() q: DistrictsQueryDto) {
    return this.geo.districts(q.division);
  }

  @Get('upazilas')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'উপজেলা / থানা of a district' })
  upazilas(@Query() q: UpazilasQueryDto) {
    return this.geo.upazilas(q.district);
  }

  @Get('unions')
  @Header('Cache-Control', CACHE)
  @ApiOperation({ summary: 'ইউনিয়ন of an upazila' })
  unions(@Query() q: UnionsQueryDto) {
    return this.geo.unions(q.upazila);
  }
}
