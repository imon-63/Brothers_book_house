import { Body, Controller, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, OptionalAuth } from '@/common/decorators/auth.decorators';
import { BusinessRuleError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { CartService } from '../cart/application/cart.service';
import { CART_TOKEN_HEADER } from '../cart/dto/cart.dto';
import { CartLinesDto } from '../pricing/dto/quote-line.dto';
import { OrderPlacementService } from '../application/order-placement.service';
import { PlaceOrderDto } from '../dto/place-order.dto';

const districtRef = (dto: CartLinesDto) => (dto.districtId || dto.district ? { id: dto.districtId, name: dto.district } : null);

@ApiTags('Checkout · চেকআউট')
@ApiBearerAuth()
@OptionalAuth()
@Controller({ version: '1' })
export class CheckoutController {
  constructor(private readonly placement: OrderPlacementService) {}

  @Post('checkout/quote')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Server-side price quote: lines + district + coupon → totals, delivery fee and reason' })
  quote(@Body() dto: CartLinesDto, @CurrentUser() u: AuthUser | undefined) {
    return this.placement.quote({ lines: dto.lines, couponCode: dto.couponCode, district: districtRef(dto), customerId: u?.customerId ?? null, phone: dto.phone });
  }

  @Post('coupons/validate')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Check a coupon against cart lines (discount it would give, or why not)' })
  async validateCoupon(@Body() dto: CartLinesDto, @CurrentUser() u: AuthUser | undefined) {
    if (!dto.couponCode?.trim()) throw new BusinessRuleError('coupon.code_required', 'কুপন কোড দিন');
    const q = await this.placement.quote({ lines: dto.lines, couponCode: dto.couponCode, district: districtRef(dto), customerId: u?.customerId ?? null, phone: dto.phone });
    return {
      valid: !!q.coupon,
      code: q.coupon?.code ?? dto.couponCode.trim().toUpperCase(),
      discount: q.coupon?.discount ?? 0,
      freeShipping: q.coupon?.freeShipping ?? false,
      message: q.couponError?.message ?? 'কুপন প্রয়োগ হয়েছে',
      error: q.couponError,
      quote: q,
    };
  }

  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique per checkout attempt (uuid). Same key → same response.' })
  @ApiHeader({ name: CART_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: 'Place an order (COD or SSLCOMMERZ). Prices are recomputed on the server.' })
  async place(
    @Body() dto: PlaceOrderDto,
    @CurrentUser() u: AuthUser | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Headers(CART_TOKEN_HEADER) cartToken: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.placement.place(dto, { user: u, cart: CartService.owner(u, cartToken), ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null, idempotencyKey: key });
    res.status(r.code);
    if (r.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return r.body;
  }
}
