import { Module } from '@nestjs/common';
import { CouponLookupService } from './application/coupon-lookup.service';
import { CouponsService } from './application/coupons.service';
import { CouponsAdminController } from './controllers/coupons.admin.controller';
import { CouponsController } from './controllers/coupons.controller';

/** POST /coupons/validate needs cart pricing, so it lives with checkout in OrdersModule. */
@Module({
  controllers: [CouponsController, CouponsAdminController],
  providers: [CouponsService, CouponLookupService],
  exports: [CouponLookupService],
})
export class PromotionsModule {}
