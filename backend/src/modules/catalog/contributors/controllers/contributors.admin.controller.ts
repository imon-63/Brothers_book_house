import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { CatalogEditors } from '../../shared/catalog-roles';
import { ContributorAdminService } from '../application/contributor-admin.service';
import { AdminContributorQueryDto, CreateAuthorDto, CreateLabelDto, UpdateAuthorDto, UpdateLabelDto } from '../dto/contributor.dto';

@ApiTags('Admin · Authors, publishers & brands · লেখক')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class ContributorsAdminController {
  constructor(private readonly svc: ContributorAdminService) {}

  // authors
  @Get('authors') @Staff() @ApiOperation({ summary: 'Authors (with product counts)' })
  listAuthors(@Query() q: AdminContributorQueryDto) {
    return this.svc.listAuthors(q);
  }

  @Post('authors') @CatalogEditors()
  createAuthor(@Body() dto: CreateAuthorDto, @CurrentUser() user: AuthUser) {
    return this.svc.createAuthor(dto, user);
  }

  @Patch('authors/:id') @CatalogEditors()
  updateAuthor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAuthorDto, @CurrentUser() user: AuthUser) {
    return this.svc.updateAuthor(id, dto, user);
  }

  @Delete('authors/:id') @Managers()
  removeAuthor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.removeAuthor(id, user);
  }

  // publishers
  @Get('publishers') @Staff()
  listPublishers(@Query() q: AdminContributorQueryDto) {
    return this.svc.listLabels('publisher', q);
  }

  @Post('publishers') @CatalogEditors()
  createPublisher(@Body() dto: CreateLabelDto, @CurrentUser() user: AuthUser) {
    return this.svc.createLabel('publisher', dto, user);
  }

  @Patch('publishers/:id') @CatalogEditors()
  updatePublisher(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLabelDto, @CurrentUser() user: AuthUser) {
    return this.svc.updateLabel('publisher', id, dto, user);
  }

  @Delete('publishers/:id') @Managers()
  removePublisher(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.removeLabel('publisher', id, user);
  }

  // brands
  @Get('brands') @Staff()
  listBrands(@Query() q: AdminContributorQueryDto) {
    return this.svc.listLabels('brand', q);
  }

  @Post('brands') @CatalogEditors()
  createBrand(@Body() dto: CreateLabelDto, @CurrentUser() user: AuthUser) {
    return this.svc.createLabel('brand', dto, user);
  }

  @Patch('brands/:id') @CatalogEditors()
  updateBrand(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLabelDto, @CurrentUser() user: AuthUser) {
    return this.svc.updateLabel('brand', id, dto, user);
  }

  @Delete('brands/:id') @Managers()
  removeBrand(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.svc.removeLabel('brand', id, user);
  }
}
