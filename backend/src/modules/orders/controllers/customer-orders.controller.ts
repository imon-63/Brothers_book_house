import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CustomerOrdersService } from '../application/customer-orders.service';
import { CancelMyOrderDto, MyOrdersQueryDto, TrackOrderDto } from '../dto/track-order.dto';

@ApiTags('Orders · অর্ডার')
@Controller({ version: '1' })
export class CustomerOrdersController {
  constructor(private readonly orders: CustomerOrdersService) {}

  @ApiBearerAuth()
  @Get('me/orders')
  @ApiOperation({ summary: 'My orders (newest first) with a status glance' })
  list(@CurrentUser() u: AuthUser, @Query() q: MyOrdersQueryDto) {
    return this.orders.list(u, q);
  }

  @ApiBearerAuth()
  @Get('me/orders/:orderNo')
  @ApiOperation({ summary: 'My order with invoice lines, shipment and delivery timeline' })
  detail(@CurrentUser() u: AuthUser, @Param('orderNo') orderNo: string) {
    return this.orders.detail(u, orderNo);
  }

  @ApiBearerAuth()
  @Post('me/orders/:orderNo/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel my order while it is still pending' })
  cancel(@CurrentUser() u: AuthUser, @Param('orderNo') orderNo: string, @Body() dto: CancelMyOrderDto) {
    return this.orders.cancel(u, orderNo, dto.reason);
  }

  @Public()
  @Post('orders/track')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Track by order no + phone, or phone only (latest 5)' })
  track(@Body() dto: TrackOrderDto) {
    return this.orders.track(dto.phone, dto.orderNo);
  }
}
