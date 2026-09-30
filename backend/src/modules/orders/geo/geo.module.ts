import { Module } from '@nestjs/common';
import { GeoService } from './application/geo.service';
import { GeoController } from './controllers/geo.controller';

@Module({
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
