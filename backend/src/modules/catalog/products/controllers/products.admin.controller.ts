import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { PageQueryDto } from '@/common/dto/pagination.dto';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CatalogEditors } from '../../shared/catalog-roles';
import { ProductAdminService } from '../application/product-admin.service';
import { ProductExportService } from '../application/product-export.service';
import { AdminProductQueryDto } from '../dto/product-query.dto';
import { CreateProductDto, SetProductAuthorsDto, UpdateProductDto } from '../dto/product-write.dto';

@ApiTags('Admin · Products · পণ্য')
@ApiBearerAuth()
@Controller({ path: 'admin/products', version: '1' })
export class ProductsAdminController {
  constructor(
    private readonly products: ProductAdminService,
    private readonly exporter: ProductExportService,
  ) {}

  @Get()
  @Staff()
  @ApiOperation({ summary: 'Admin product table: filters, quick filters, sort (name/price/stock/sold/margin/new)' })
  list(@Query() q: AdminProductQueryDto) {
    return this.products.search(q);
  }

  @Get('summary')
  @Staff()
  @ApiOperation({ summary: 'Quick-filter counts + stock valuation (cost & retail)' })
  summary(@Query() q: AdminProductQueryDto) {
    return this.products.summary(q.section, q.lowStock);
  }

  @Get('export.csv')
  @Staff()
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'CSV (UTF-8 BOM) with the admin export columns; accepts the list filters' })
  async export(@Query() q: AdminProductQueryDto, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const file = await this.exporter.csv(q, user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Total-Count', String(file.count));
    return file.body;
  }

  @Get(':id')
  @Staff()
  @ApiOperation({ summary: 'Product editor payload (incl. cost, stock internals, deal history, version)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.get(id);
  }

  @Get(':id/price-history')
  @Staff()
  @ApiOperation({ summary: 'Price / compare-at / cost changes, newest first' })
  priceHistory(@Param('id', ParseUUIDPipe) id: string, @Query() q: PageQueryDto) {
    return this.products.priceHistory(id, q.page, q.pageSize);
  }

  @Post()
  @CatalogEditors()
  @ApiOperation({ summary: 'Create a product (auto sku/slug; initialCopies → OPENING stock movement)' })
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.products.create(dto, user);
  }

  @Patch(':id')
  @CatalogEditors()
  @ApiOperation({ summary: 'Update with optimistic locking (`version`); price changes are written to price history' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: AuthUser) {
    return this.products.update(id, dto, user);
  }

  @Put(':id/authors')
  @CatalogEditors()
  @ApiOperation({ summary: 'Replace the product’s authors/editors/translators' })
  setAuthors(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetProductAuthorsDto, @CurrentUser() user: AuthUser) {
    return this.products.setAuthors(id, dto.authors, user);
  }

  @Post(':id/duplicate')
  @CatalogEditors()
  @ApiOperation({ summary: 'Duplicate as a DRAFT with zero stock' })
  duplicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.products.duplicate(id, user);
  }

  @Delete(':id')
  @Managers()
  @ApiOperation({ summary: 'Soft delete' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.products.remove(id, user);
  }

  @Post(':id/restore')
  @Managers()
  @ApiOperation({ summary: 'Restore a soft-deleted product' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.products.restore(id, user);
  }
}
