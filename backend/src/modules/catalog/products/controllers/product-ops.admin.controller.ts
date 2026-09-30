import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import type { UploadedImage } from '../../media/application/media.service';
import { imageUpload } from '../../media/controllers/media.admin.controller';
import { UploadMediaDto } from '../../media/dto/media.dto';
import { CatalogEditors, StockKeepers } from '../../shared/catalog-roles';
import { ToBool } from '../../shared/query-transforms';
import { DealService } from '../application/deal.service';
import { ProductBulkService } from '../application/product-bulk.service';
import { ProductImagesService } from '../application/product-images.service';
import { ProductStockService } from '../application/product-stock.service';
import {
  AttachImageDto,
  BulkDiscountDto,
  BulkFreeShippingDto,
  BulkIdsDto,
  BulkMoveDto,
  BulkPriceDto,
  BulkRestockDto,
  CreateDealDto,
  DealsQueryDto,
  ReorderImagesDto,
  StockAdjustDto,
  StockMovementsQueryDto,
} from '../dto/product-ops.dto';

class UploadProductImageDto extends UploadMediaDto {
  @IsOptional()
  @ToBool()
  @IsBoolean()
  isPrimary?: boolean;
}

@ApiTags('Admin · Products · পণ্য')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class ProductOpsAdminController {
  constructor(
    private readonly bulk: ProductBulkService,
    private readonly stock: ProductStockService,
    private readonly deals: DealService,
    private readonly images: ProductImagesService,
  ) {}

  // ─── bulk ───

  @Post('products/bulk/price')
  @HttpCode(200)
  @CatalogEditors()
  @ApiOperation({ summary: 'Bulk ±% price change, rounded to the nearest ৳5' })
  bulkPrice(@Body() dto: BulkPriceDto, @CurrentUser() user: AuthUser) {
    return this.bulk.price(dto, user);
  }

  @Post('products/bulk/discount')
  @HttpCode(200)
  @CatalogEditors()
  @ApiOperation({ summary: 'Bulk discount %: sets compare-at from the price (0 removes it)' })
  bulkDiscount(@Body() dto: BulkDiscountDto, @CurrentUser() user: AuthUser) {
    return this.bulk.discount(dto, user);
  }

  @Post('products/bulk/restock')
  @HttpCode(200)
  @StockKeepers()
  @ApiOperation({ summary: 'Bulk +N units (inventory ADJUSTMENT movements)' })
  bulkRestock(@Body() dto: BulkRestockDto, @CurrentUser() user: AuthUser) {
    return this.bulk.restock(dto, user);
  }

  @Post('products/bulk/free-shipping')
  @HttpCode(200)
  @CatalogEditors()
  @ApiOperation({ summary: 'Bulk free-shipping on/off' })
  bulkFree(@Body() dto: BulkFreeShippingDto, @CurrentUser() user: AuthUser) {
    return this.bulk.freeShipping(dto, user);
  }

  @Post('products/bulk/move')
  @HttpCode(200)
  @CatalogEditors()
  @ApiOperation({ summary: 'Bulk move to another category / sub-category' })
  bulkMove(@Body() dto: BulkMoveDto, @CurrentUser() user: AuthUser) {
    return this.bulk.move(dto, user);
  }

  @Post('products/bulk/delete')
  @HttpCode(200)
  @Managers()
  @ApiOperation({ summary: 'Bulk soft delete' })
  bulkDelete(@Body() dto: BulkIdsDto, @CurrentUser() user: AuthUser) {
    return this.bulk.remove(dto, user);
  }

  // ─── stock ───

  @Get('products/:id/stock/movements')
  @Staff()
  @ApiOperation({ summary: 'Stock ledger for a product (newest first)' })
  movements(@Param('id', ParseUUIDPipe) id: string, @Query() q: StockMovementsQueryDto) {
    return this.stock.movements(id, q);
  }

  @Post('products/:id/stock/adjust')
  @HttpCode(200)
  @StockKeepers()
  @ApiOperation({ summary: 'Set the absolute on-hand count with a reason (ADJUSTMENT / DAMAGE / WRITE_OFF)' })
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StockAdjustDto, @CurrentUser() user: AuthUser) {
    return this.stock.adjust(id, dto, user);
  }

  // ─── deals ───

  @Get('deals')
  @Staff()
  @ApiOperation({ summary: 'Timed deals: active, ending soon or scheduled' })
  listDeals(@Query() q: DealsQueryDto) {
    return this.deals.list(q);
  }

  @Post('products/:id/deals')
  @CatalogEditors()
  @ApiOperation({ summary: 'Start a timed deal (dealPrice < price; 409 deal.overlap unless replaceExisting)' })
  createDeal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateDealDto, @CurrentUser() user: AuthUser) {
    return this.deals.create(id, dto, user);
  }

  @Post('deals/:id/cancel')
  @HttpCode(200)
  @CatalogEditors()
  @ApiOperation({ summary: 'Cancel a live or scheduled deal (price returns to regular)' })
  cancelDeal(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.deals.cancel(id, user);
  }

  // ─── images ───

  @Post('products/:id/images')
  @CatalogEditors()
  @ApiOperation({ summary: 'Attach an uploaded media asset to the gallery' })
  attach(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AttachImageDto, @CurrentUser() user: AuthUser) {
    return this.images.attach(id, dto.mediaId, dto.isPrimary, user);
  }

  @Post('products/:id/images/upload')
  @CatalogEditors()
  @UseInterceptors(imageUpload())
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadProductImageDto })
  @ApiOperation({ summary: 'Upload an image and attach it in one step' })
  uploadAttach(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: UploadedImage | undefined, @Body() dto: UploadProductImageDto, @CurrentUser() user: AuthUser) {
    return this.images.uploadAndAttach(id, file, dto.alt, dto.isPrimary ?? false, user);
  }

  @Put('products/:id/images/order')
  @CatalogEditors()
  @ApiOperation({ summary: 'Reorder the gallery (all media ids, in order)' })
  reorderImages(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderImagesDto, @CurrentUser() user: AuthUser) {
    return this.images.reorder(id, dto.mediaIds, user);
  }

  @Post('products/:id/images/:mediaId/primary')
  @HttpCode(200)
  @CatalogEditors()
  @ApiOperation({ summary: 'Make an image the cover' })
  setPrimary(@Param('id', ParseUUIDPipe) id: string, @Param('mediaId', ParseUUIDPipe) mediaId: string, @CurrentUser() user: AuthUser) {
    return this.images.setPrimary(id, mediaId, user);
  }

  @Delete('products/:id/images/:mediaId')
  @CatalogEditors()
  @ApiOperation({ summary: 'Remove an image from the gallery (the media asset is kept)' })
  detach(@Param('id', ParseUUIDPipe) id: string, @Param('mediaId', ParseUUIDPipe) mediaId: string, @CurrentUser() user: AuthUser) {
    return this.images.detach(id, mediaId, user);
  }
}
