import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CatalogEditors } from '../../shared/catalog-roles';
import { BundleAdminService } from '../application/bundle-admin.service';
import { AdminBundleQueryDto, CreateBundleDto, UpdateBundleDto } from '../dto/bundle.dto';

@ApiTags('Admin · Bundles · প্যাকেজ')
@ApiBearerAuth()
@Controller({ path: 'admin/bundles', version: '1' })
export class BundlesAdminController {
  constructor(private readonly bundles: BundleAdminService) {}

  @Get()
  @Staff()
  @ApiOperation({ summary: 'All bundles (any status; ?deleted=true for the trash)' })
  list(@Query() q: AdminBundleQueryDto) {
    return this.bundles.list(q);
  }

  @Get(':id')
  @Staff()
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.bundles.get(id);
  }

  @Post()
  @CatalogEditors()
  @ApiOperation({ summary: 'Create a bundle (≥2 products of one section)' })
  create(@Body() dto: CreateBundleDto, @CurrentUser() user: AuthUser) {
    return this.bundles.create(dto, user);
  }

  @Patch(':id')
  @CatalogEditors()
  @ApiOperation({ summary: 'Update a bundle; `items` replaces the item list' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBundleDto, @CurrentUser() user: AuthUser) {
    return this.bundles.update(id, dto, user);
  }

  @Delete(':id')
  @Managers()
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.bundles.remove(id, user);
  }

  @Post(':id/restore')
  @Managers()
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.bundles.restore(id, user);
  }
}
