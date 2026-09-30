import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, OptionalAuth } from '@/common/decorators/auth.decorators';
import { BusinessRuleError, UnauthorizedError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { CartService } from '../application/cart.service';
import { AddCartItemDto, ApplyCouponDto, CART_TOKEN_HEADER, CartItemParam, CartQueryDto, MergeCartDto, UpdateCartItemDto } from '../dto/cart.dto';

type CartView = Awaited<ReturnType<CartService['get']>>;

@ApiTags('Cart · কার্ট')
@ApiBearerAuth()
@ApiHeader({ name: CART_TOKEN_HEADER, required: false, description: 'Guest cart token (returned by POST /cart and every cart response)' })
@OptionalAuth()
@Controller({ path: 'cart', version: '1' })
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: 'Cart with a live quote (pass ?district= for the delivery fee)' })
  get(@CurrentUser() u: AuthUser | undefined, @Headers(CART_TOKEN_HEADER) token: string | undefined, @Query() q: CartQueryDto) {
    return this.cart.get(CartService.owner(u, token), q.district);
  }

  @Post()
  @ApiOperation({ summary: 'Create a cart (guests receive a token)' })
  async create(@CurrentUser() u: AuthUser | undefined, @Headers(CART_TOKEN_HEADER) token: string | undefined, @Res({ passthrough: true }) res: Response) {
    const c = await this.cart.ensure(CartService.owner(u, token));
    return this.withToken(res, await this.cart.get(u?.customerId ? { customerId: u.customerId } : { token: c.guestToken as string }));
  }

  @Post('items')
  async add(@CurrentUser() u: AuthUser | undefined, @Headers(CART_TOKEN_HEADER) token: string | undefined, @Body() dto: AddCartItemDto, @Res({ passthrough: true }) res: Response) {
    return this.withToken(res, await this.cart.add(CartService.owner(u, token), dto));
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Set quantity (0 removes)' })
  async update(
    @CurrentUser() u: AuthUser | undefined,
    @Headers(CART_TOKEN_HEADER) token: string | undefined,
    @Param() p: CartItemParam,
    @Body() dto: UpdateCartItemDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.withToken(res, await this.cart.setQuantity(CartService.owner(u, token), p.itemId, dto.quantity));
  }

  @Delete('items/:itemId')
  async remove(@CurrentUser() u: AuthUser | undefined, @Headers(CART_TOKEN_HEADER) token: string | undefined, @Param() p: CartItemParam, @Res({ passthrough: true }) res: Response) {
    return this.withToken(res, await this.cart.remove(CartService.owner(u, token), p.itemId));
  }

  @Delete()
  async clear(@CurrentUser() u: AuthUser | undefined, @Headers(CART_TOKEN_HEADER) token: string | undefined) {
    return this.cart.clear(CartService.owner(u, token));
  }

  @Post('coupon')
  @HttpCode(200)
  @ApiOperation({ summary: 'Apply a coupon (validated against this cart)' })
  async applyCoupon(@CurrentUser() u: AuthUser | undefined, @Headers(CART_TOKEN_HEADER) token: string | undefined, @Body() dto: ApplyCouponDto) {
    return this.cart.applyCoupon(CartService.owner(u, token), dto.code);
  }

  @Delete('coupon')
  async removeCoupon(@CurrentUser() u: AuthUser | undefined, @Headers(CART_TOKEN_HEADER) token: string | undefined) {
    return this.cart.removeCoupon(CartService.owner(u, token));
  }

  @Post('merge')
  @HttpCode(200)
  @ApiOperation({ summary: 'After login: merge the guest cart into the customer cart' })
  async merge(@CurrentUser() u: AuthUser | undefined, @Body() dto: MergeCartDto) {
    if (!u) throw new UnauthorizedError();
    if (!u.customerId) throw new BusinessRuleError('cart.no_customer', 'শুধু কাস্টমার অ্যাকাউন্টের কার্ট মার্জ হয়');
    return this.cart.merge(u.customerId, dto.guestToken);
  }

  private withToken(res: Response, view: CartView) {
    if (view.token) res.setHeader(CART_TOKEN_HEADER, view.token);
    return view;
  }
}
