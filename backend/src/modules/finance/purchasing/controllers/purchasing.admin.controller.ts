import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Finance } from '@/common/decorators/auth.decorators';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import type { AuthUser } from '@/common/types/auth-user';
import { PurchasesService } from '../application/purchases.service';
import { SuppliersService } from '../application/suppliers.service';
import { CreatePurchaseDto, CreateSupplierDto, PurchasePaymentDto, PurchaseQueryDto, UpdateSupplierDto } from '../dto/purchasing.dto';

@ApiTags('Finance · ক্রয়')
@ApiBearerAuth()
@Finance()
@Controller({ path: 'admin/finance/suppliers', version: '1' })
export class SuppliersAdminController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  list(@Query() q: PageQueryDto) {
    return this.suppliers.list(q);
  }

  @Get('dues')
  @ApiOperation({ summary: 'সাপ্লায়ার বকেয়া per supplier' })
  dues() {
    return this.suppliers.dues();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.get(id);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto, @CurrentUser() user: AuthUser) {
    return this.suppliers.create(dto, user);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() user: AuthUser) {
    return this.suppliers.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete (refused while the supplier has dues)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.suppliers.remove(id, user);
  }
}

@ApiTags('Finance · ক্রয়')
@ApiBearerAuth()
@Finance()
@Controller({ path: 'admin/finance/purchases', version: '1' })
export class PurchasesAdminController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  list(@Query() q: PurchaseQueryDto) {
    return this.purchases.list(q);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchases.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'ক্রয় বিল — receives stock (weighted-avg cost) and optionally pays now' })
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: AuthUser) {
    return this.purchases.create(dto, user);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record a later payment against the bill' })
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PurchasePaymentDto, @CurrentUser() user: AuthUser) {
    return this.purchases.pay(id, dto, user);
  }
}
