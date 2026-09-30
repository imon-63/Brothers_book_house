import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { ShipmentsService } from './application/shipments.service';
import { ShippingLookupService } from './application/shipping-lookup.service';
import { ShippingSettingsService } from './application/shipping-settings.service';
import { ShippingAdminController } from './controllers/shipping.admin.controller';
import { ShippingController } from './controllers/shipping.controller';

@Module({
  imports: [GeoModule],
  controllers: [ShippingController, ShippingAdminController],
  providers: [ShippingLookupService, ShippingSettingsService, ShipmentsService],
  exports: [ShippingLookupService, ShipmentsService],
})
export class ShippingModule {}
