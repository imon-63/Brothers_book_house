import { Module } from '@nestjs/common';
import { CustomersModule } from '@/modules/customers/customers.module';
import { ReviewsService } from './application/reviews.service';
import { ReviewsAdminController } from './controllers/reviews.admin.controller';
import { ReviewsController } from './controllers/reviews.controller';

/** Product reviews: storefront list/submit, verified purchase, moderation, cached rating. */
@Module({
  imports: [CustomersModule],
  controllers: [ReviewsController, ReviewsAdminController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
