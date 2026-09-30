import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CatalogEditors } from '../../shared/catalog-roles';
import { CategoryAdminService } from '../application/category-admin.service';
import { SectionAdminService } from '../application/section-admin.service';
import { CategoryVisibilityDto, CreateCategoryDto, CreateSectionDto, ReorderCategoriesDto, UpdateCategoryDto, UpdateSectionDto } from '../dto/taxonomy.dto';

@ApiTags('Admin · Catalog taxonomy · বিভাগ ও ক্যাটাগরি')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class TaxonomyAdminController {
  constructor(
    private readonly sections: SectionAdminService,
    private readonly categories: CategoryAdminService,
  ) {}

  @Get('sections')
  @Staff()
  @ApiOperation({ summary: 'All sections (visible or not) with category/product counts' })
  listSections() {
    return this.sections.list();
  }

  @Post('sections')
  @Managers()
  @ApiOperation({ summary: 'নতুন বিভাগ যোগ করুন (শুরুতে লুকানো; ক্যাটাগরি/পণ্য সাজিয়ে চালু করুন)' })
  createSection(@Body() dto: CreateSectionDto, @CurrentUser() user: AuthUser) {
    return this.sections.create(dto, user);
  }

  @Delete('sections/:id')
  @Managers()
  @ApiOperation({ summary: 'খালি বিভাগ মুছুন (ক্যাটাগরি/পণ্য থাকলে লুকিয়ে রাখুন)' })
  deleteSection(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.sections.remove(id, user);
  }

  @Patch('sections/:id')
  @Managers()
  @ApiOperation({ summary: 'Show/hide a section (≥1 must stay visible) and edit its copy' })
  updateSection(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSectionDto, @CurrentUser() user: AuthUser) {
    return this.sections.update(id, dto, user);
  }

  @Get('sections/:id/categories')
  @Staff()
  @ApiOperation({ summary: 'Category tree of a section incl. hidden nodes, with product counts' })
  tree(@Param('id', ParseUUIDPipe) id: string) {
    return this.categories.tree(id);
  }

  @Post('sections/:id/categories/visibility')
  @CatalogEditors()
  @ApiOperation({ summary: 'Bulk show/hide every category of a section' })
  bulkVisibility(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryVisibilityDto, @CurrentUser() user: AuthUser) {
    return this.categories.bulkVisibility(id, dto, user);
  }

  @Post('categories')
  @CatalogEditors()
  @ApiOperation({ summary: 'Create a category, or a sub-category when parentId is given (max 2 levels)' })
  create(@Body() dto: CreateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categories.create(dto, user);
  }

  @Post('categories/reorder')
  @CatalogEditors()
  @ApiOperation({ summary: 'Reorder sibling categories' })
  reorder(@Body() dto: ReorderCategoriesDto, @CurrentUser() user: AuthUser) {
    return this.categories.reorder(dto, user);
  }

  @Patch('categories/:id')
  @CatalogEditors()
  @ApiOperation({ summary: 'Rename, re-slug, reorder or show/hide a category' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() user: AuthUser) {
    return this.categories.update(id, dto, user);
  }

  @Delete('categories/:id')
  @Managers()
  @ApiOperation({ summary: 'Soft-delete a category (409 category.has_products with the count when in use)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.categories.remove(id, user);
  }
}
