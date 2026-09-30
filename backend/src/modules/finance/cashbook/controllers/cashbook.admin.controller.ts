import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Finance } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CashAccountsService } from '../application/cash-accounts.service';
import { CashbookService } from '../application/cashbook.service';
import {
  CashbookQueryDto,
  CodRemittanceDto,
  CourierPaymentDto,
  CreateCashAccountDto,
  DailyQueryDto,
  DayCloseQueryDto,
  ManualEntryDto,
  ReverseEntryDto,
  TransferDto,
  UpdateCashAccountDto,
} from '../dto/cashbook.dto';

@ApiTags('Finance · হিসাব')
@ApiBearerAuth()
@Finance()
@Controller({ path: 'admin/finance/accounts', version: '1' })
export class CashAccountsAdminController {
  constructor(private readonly accounts: CashAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'Cash accounts with live balances' })
  list(@Query('includeInactive') includeInactive?: string) {
    return this.accounts.list({ includeInactive: includeInactive === 'true' || includeInactive === '1' });
  }

  @Post()
  @ApiOperation({ summary: 'Open a cash account (ক্যাশ / বিকাশ / নগদ / ব্যাংক / gateway)' })
  create(@Body() dto: CreateCashAccountDto, @CurrentUser() user: AuthUser) {
    return this.accounts.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename / change account no. / opening balance (only before first entry)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCashAccountDto, @CurrentUser() user: AuthUser) {
    return this.accounts.update(id, dto, user);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: 'Close an account for new entries (history stays)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.accounts.setActive(id, false, user);
  }

  @Post(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.accounts.setActive(id, true, user);
  }
}

@ApiTags('Finance · হিসাব')
@ApiBearerAuth()
@Finance()
@Controller({ path: 'admin/finance/cashbook', version: '1' })
export class CashbookAdminController {
  constructor(private readonly cashbook: CashbookService) {}

  @Get()
  @ApiOperation({ summary: 'Cashbook entries (filters: account, Dhaka date range, kind, direction, order)' })
  list(@Query() q: CashbookQueryDto) {
    return this.cashbook.list(q);
  }

  @Get('day-close')
  @ApiOperation({ summary: 'দিনের ক্লোজ — opening / in / out / closing per account + entries' })
  dayClose(@Query() q: DayCloseQueryDto) {
    return this.cashbook.dayClose(q.date, q.accountId);
  }

  @Get('daily')
  @ApiOperation({ summary: 'Day-by-day close for a date span' })
  daily(@Query() q: DailyQueryDto) {
    return this.cashbook.daily(q.from, q.to, q.accountId);
  }

  @Post('entries')
  @ApiOperation({ summary: 'হাতে লিখুন — manual IN/OUT (EXPENSE needs expenseCategory)' })
  manual(@Body() dto: ManualEntryDto, @CurrentUser() user: AuthUser) {
    return this.cashbook.manualEntry(dto, user);
  }

  @Post('entries/:id/reverse')
  @ApiOperation({ summary: 'Reverse an entry with an opposite entry (transfers reverse both legs)' })
  reverse(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReverseEntryDto, @CurrentUser() user: AuthUser) {
    return this.cashbook.reverse(id, dto, user);
  }

  @Post('transfers')
  @ApiOperation({ summary: 'Internal transfer between accounts (paired OUT/IN)' })
  transfer(@Body() dto: TransferDto, @CurrentUser() user: AuthUser) {
    return this.cashbook.transfer(dto, user);
  }

  @Post('courier-payments')
  @ApiOperation({ summary: 'কুরিয়ার পরিশোধ for an order' })
  courier(@Body() dto: CourierPaymentDto, @CurrentUser() user: AuthUser) {
    return this.cashbook.courierPayment(dto, user);
  }

  @Post('cod-remittances')
  @ApiOperation({ summary: 'Courier paid us collected COD (optionally settles shipments → REMITTED)' })
  cod(@Body() dto: CodRemittanceDto, @CurrentUser() user: AuthUser) {
    return this.cashbook.codRemittance(dto, user);
  }
}
