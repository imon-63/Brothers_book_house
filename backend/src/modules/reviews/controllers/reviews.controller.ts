import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { ReviewsService } from '../application/reviews.service';
import { CreateReviewDto, PublicReviewQueryDto } from '../dto/reviews.dto';

@ApiTags('Reviews · রিভিউ')
@Controller({ path: 'products/:productId/reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Approved reviews (paginated) with rating breakdown' })
  list(@Param('productId', ParseUUIDPipe) productId: string, @Query() q: PublicReviewQueryDto) {
    return this.reviews.publicList(productId, q);
  }

  @Get('eligibility')
  @Roles('CUSTOMER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Can I review this product, and would it be a verified purchase?' })
  eligibility(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.reviews.eligibility(user, productId);
  }

  @Post()
  @Roles('CUSTOMER')
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Write a review (goes to moderation; verified when delivered)' })
  create(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, productId, dto);
  }
}
