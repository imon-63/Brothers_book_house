import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CouponsService } from '../application/coupons.service';
import { CouponListQueryDto, CreateCouponDto, ReplaceTargetsDto, UpdateCouponDto } from '../dto/coupon.dto';

@ApiTags('Admin · Coupons · কুপন')
@ApiBearerAuth()
@Controller({ path: 'admin/coupons', version: '1' })
export class CouponsAdminController {
  constructor(private readonly coupons: CouponsService) {}

  @Staff()
  @Get()
  @ApiOperation({ summary: 'Coupons with redemption stats (uses, discount given, revenue)' })
  list(@Query() q: CouponListQueryDto) {
    return this.coupons.list(q);
  }

  @Staff()
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.coupons.get(id);
  }

  @Managers()
  @Post()
  create(@Body() dto: CreateCouponDto, @CurrentUser() u: AuthUser) {
    return this.coupons.create(dto, u);
  }

  @Managers()
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCouponDto, @CurrentUser() u: AuthUser) {
    return this.coupons.update(id, dto, u);
  }

  @Managers()
  @Post(':id/activate')
  @HttpCode(200)
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.coupons.setActive(id, true, u);
  }

  @Managers()
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    return this.coupons.setActive(id, false, u);
  }

  @Managers()
  @Put(':id/targets')
  @ApiOperation({ summary: 'Replace scope + targets (section / category / product / bundle)' })
  targets(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceTargetsDto, @CurrentUser() u: AuthUser) {
    return this.coupons.replaceTargets(id, dto, u);
  }

  @Managers()
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) {
    await this.coupons.remove(id, u);
  }
}
