import { Module } from '@nestjs/common';
import { GeoModule } from '../geo/geo.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PricingService } from './application/pricing.service';

/** Server-side pricing shared by cart, checkout and order placement. */
@Module({
  imports: [GeoModule, PromotionsModule, ShippingModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
