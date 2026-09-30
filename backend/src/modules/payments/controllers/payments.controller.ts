import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { Response } from 'express';
import { CurrentUser, Finance, OptionalAuth, Public, Staff } from '@/common/decorators/auth.decorators';
import { PageQueryDto, skipTake, toPage } from '@/common/dto/pagination.dto';
import type { AuthUser } from '@/common/types/auth-user';
import { toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { RefundsService } from '../refunds/application/refunds.service';
import { PaymentCallbacksService, type CallbackKind } from '../sslcommerz/application/payment-callbacks.service';
import { PaymentCheckoutService } from '../sslcommerz/application/payment-checkout.service';

class InitPaymentDto {
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsString() @MaxLength(30) orderNo?: string;
  /** guests prove ownership with the order phone */
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}

class RefundDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsString() @Length(3, 300) reason: string;
  @IsOptional() @IsIn(['CASH', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'SSLCOMMERZ']) method?: PaymentMethod;
  @IsOptional() @IsUUID() paymentId?: string;
}

class PaymentListQuery extends PageQueryDto {
  @IsOptional() @IsIn(['INITIATED', 'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED']) status?: PaymentStatus;
  @IsOptional() @IsIn(['COD', 'SSLCOMMERZ', 'BKASH', 'NAGAD', 'BANK_TRANSFER', 'CASH']) method?: PaymentMethod;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

@ApiTags('Payments · পেমেন্ট')
@Controller({ path: 'payments/sslcommerz', version: '1' })
export class SslCommerzController {
  constructor(
    private readonly checkout: PaymentCheckoutService,
    private readonly callbacks: PaymentCallbacksService,
  ) {}

  @OptionalAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('init')
  @ApiOperation({ summary: 'Start SSLCOMMERZ hosted checkout for an unpaid order → GatewayPageURL' })
  init(@Body() dto: InitPaymentDto, @CurrentUser() user?: AuthUser) {
    return this.checkout.init(dto, user);
  }

  // Browser redirects from SSLCOMMERZ (application/x-www-form-urlencoded).
  @Public() @SkipThrottle() @ApiExcludeEndpoint() @Post('success')
  async success(@Body() body: Record<string, unknown>, @Res() res: Response) {
    res.redirect(302, await this.callbacks.callback('success', body));
  }

  @Public() @SkipThrottle() @ApiExcludeEndpoint() @Post('fail')
  async fail(@Body() body: Record<string, unknown>, @Res() res: Response) {
    res.redirect(302, await this.callbacks.callback('fail', body));
  }

  @Public() @SkipThrottle() @ApiExcludeEndpoint() @Post('cancel')
  async cancel(@Body() body: Record<string, unknown>, @Res() res: Response) {
    res.redirect(302, await this.callbacks.callback('cancel' as CallbackKind, body));
  }

  @Public() @SkipThrottle() @ApiExcludeEndpoint() @Post('ipn') @HttpCode(200)
  ipn(@Body() body: Record<string, unknown>) {
    return this.callbacks.ipn(body);
  }
}

@ApiTags('Admin · Payments')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class PaymentsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refunds: RefundsService,
  ) {}

  @Staff()
  @Get('payments')
  async list(@Query() q: PaymentListQuery) {
    const where: Prisma.PaymentWhereInput = {
      status: q.status,
      method: q.method,
      initiatedAt: q.from || q.to ? { gte: q.from ? new Date(q.from) : undefined, lte: q.to ? new Date(q.to) : undefined } : undefined,
      ...(q.q ? { OR: [{ tranId: { contains: q.q } }, { order: { orderNo: { contains: q.q } } }, { bankTranId: { contains: q.q } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { initiatedAt: q.order }, ...skipTake(q), include: { order: { select: { orderNo: true, contactName: true } } } }),
      this.prisma.payment.count({ where }),
    ]);
    return toPage(rows.map((p) => ({ ...p, amount: toNumber(p.amount), fee: toNumber(p.fee), gatewayPayload: undefined })), total, q);
  }

  @Staff()
  @Get('payments/:id')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    const p = await this.prisma.payment.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { receivedAt: 'asc' } }, refunds: true, order: { select: { orderNo: true, grandTotal: true } } } });
    return { ...p, amount: toNumber(p.amount), fee: toNumber(p.fee) };
  }

  @Finance()
  @Get('orders/:orderId/refunds')
  listRefunds(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.refunds.list(orderId);
  }

  @Finance()
  @Post('orders/:orderId/refunds')
  refund(@Param('orderId', ParseUUIDPipe) orderId: string, @Body() dto: RefundDto, @CurrentUser() user: AuthUser) {
    return this.refunds.create(orderId, dto, user);
  }

  @Finance()
  @Post('refunds/:id/refresh')
  @HttpCode(200)
  refresh(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.refunds.refresh(id, user);
  }
}
