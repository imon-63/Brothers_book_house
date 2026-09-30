import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Managers, Roles } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { ContentAdminService } from '../application/content-admin.service';
import { StoreSettingsService } from '../application/store-settings.service';
import {
  CreateAnnouncementDto, CreateHeroSlideDto, CreatePromoDto, ReorderDto, ReorderSlidesDto, SetSettingDto, SetSettingsDto,
  UpdateAnnouncementDto, UpdateHeroSlideDto, UpdatePromoDto,
} from '../dto/content.dto';

@ApiTags('Admin · Content · কনটেন্ট')
@ApiBearerAuth()
@Managers()
@Controller({ path: 'admin/content', version: '1' })
export class ContentAdminController {
  constructor(
    private readonly content: ContentAdminService,
    private readonly settings: StoreSettingsService,
  ) {}

  // announcements
  @Get('announcements') announcements() { return this.content.announcements(); }
  @Post('announcements') createAnnouncement(@CurrentUser() u: AuthUser, @Body() dto: CreateAnnouncementDto) { return this.content.createAnnouncement(u, dto); }
  @Put('announcements/order') @ApiOperation({ summary: 'Reorder (send all ids in the new order)' })
  reorderAnnouncements(@CurrentUser() u: AuthUser, @Body() dto: ReorderDto) { return this.content.reorderAnnouncements(u, dto.ids); }
  @Patch('announcements/:id') updateAnnouncement(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnnouncementDto) { return this.content.updateAnnouncement(u, id, dto); }
  @Delete('announcements/:id') @HttpCode(204) deleteAnnouncement(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.content.deleteAnnouncement(u, id); }

  // promo popups
  @Get('promos') promos() { return this.content.promos(); }
  @Post('promos') createPromo(@CurrentUser() u: AuthUser, @Body() dto: CreatePromoDto) { return this.content.createPromo(u, dto); }
  @Patch('promos/:id') updatePromo(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePromoDto) { return this.content.updatePromo(u, id, dto); }
  @Post('promos/:id/activate') @HttpCode(200) @ApiOperation({ summary: 'Make this the only active popup' })
  activatePromo(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.content.setPromoActive(u, id, true); }
  @Post('promos/:id/deactivate') @HttpCode(200)
  deactivatePromo(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.content.setPromoActive(u, id, false); }
  @Delete('promos/:id') @HttpCode(204) deletePromo(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.content.deletePromo(u, id); }

  // hero slides
  @Get('hero-slides') @ApiQuery({ name: 'sectionId', required: false })
  slides(@Query('sectionId', new ParseUUIDPipe({ optional: true })) sectionId?: string) { return this.content.slides(sectionId); }
  @Post('hero-slides') createSlide(@CurrentUser() u: AuthUser, @Body() dto: CreateHeroSlideDto) { return this.content.createSlide(u, dto); }
  @Put('hero-slides/order') reorderSlides(@CurrentUser() u: AuthUser, @Body() dto: ReorderSlidesDto) { return this.content.reorderSlides(u, dto.sectionId, dto.ids); }
  @Patch('hero-slides/:id') updateSlide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHeroSlideDto) { return this.content.updateSlide(u, id, dto); }
  @Delete('hero-slides/:id') @HttpCode(204) deleteSlide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.content.deleteSlide(u, id); }

  // store settings (ADMIN/OWNER only)
  @Get('settings') @Roles('ADMIN') @ApiOperation({ summary: 'All known settings with value, default, visibility' })
  getSettings() { return this.settings.describe(); }
  @Patch('settings') @Roles('ADMIN') @ApiOperation({ summary: 'Update several settings at once (all-or-nothing validation)' })
  setSettings(@CurrentUser() u: AuthUser, @Body() dto: SetSettingsDto) { return this.settings.setMany(u, dto.values); }
  @Put('settings/:key') @Roles('ADMIN')
  setSetting(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() dto: SetSettingDto) { return this.settings.setMany(u, { [key]: dto.value }); }
}
