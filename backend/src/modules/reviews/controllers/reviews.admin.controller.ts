import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { ReviewsService } from '../application/reviews.service';
import { AdminReviewQueryDto, RejectReviewDto, ReplyReviewDto } from '../dto/reviews.dto';

@ApiTags('Admin · Reviews · রিভিউ')
@ApiBearerAuth()
@Roles('ADMIN', 'MANAGER', 'SUPPORT')
@Controller({ path: 'admin/reviews', version: '1' })
export class ReviewsAdminController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'Moderation queue with status counts' })
  list(@Query() q: AdminReviewQueryDto) {
    return this.reviews.adminList(q);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.approve(user, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectReviewDto) {
    return this.reviews.reject(user, id, dto.reason);
  }

  @Put(':id/reply')
  reply(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplyReviewDto) {
    return this.reviews.reply(user, id, dto.reply);
  }
}
