import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { AuditService } from '@/platform/audit/audit.service';
import { CustomerCrmService } from '../application/customer-crm.service';
import { CustomersQueryService } from '../application/customers-query.service';
import { AddNoteDto, BlockCustomerDto, BulkTagDto, CustomerFilterDto, CustomerListQueryDto, PinNoteDto, SetTagsDto, UpdateCustomerDto } from '../dto/admin-customers.dto';

@ApiTags('Admin · Customers · কাস্টমার')
@ApiBearerAuth()
@Staff()
@Controller({ path: 'admin/customers', version: '1' })
export class CustomersAdminController {
  constructor(
    private readonly query: CustomersQueryService,
    private readonly crm: CustomerCrmService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List customers with segment, filters and sort' })
  list(@Query() q: CustomerListQueryDto) {
    return this.query.list(q);
  }

  @Get('kpis')
  @ApiOperation({ summary: 'CRM KPIs: totals, repeat rate, LTV, new this vs last month, segment counts, top & follow-ups' })
  kpis() {
    return this.query.kpis();
  }

  @Get('tags')
  @ApiOperation({ summary: 'Customer tags with usage counts + suggestions' })
  tags() {
    return this.query.tags();
  }

  @Get('export.csv')
  @Managers()
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'CSV export of the filtered list (max 10k rows)' })
  async export(@CurrentUser() user: AuthUser, @Query() f: CustomerFilterDto, @Res({ passthrough: true }) res: Response) {
    const { csv, count } = await this.query.exportCsv(f);
    await this.audit.record({ actor: user, action: 'EXPORT', area: 'customer', entityType: 'customer', summary: `${count} জন কাস্টমার CSV-তে এক্সপোর্ট`, after: { ...f } });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  }

  @Post('tags/bulk')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add or remove one tag on many customers' })
  bulkTag(@CurrentUser() user: AuthUser, @Body() dto: BulkTagDto) {
    return this.crm.bulkTag(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '360° profile: stats, favourite section/category, monthly spend, orders, items, addresses, wishlist, notes' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.query.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update admin note / marketing opt-in / display name' })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCustomerDto) {
    return this.crm.update(user, id, dto);
  }

  @Post(':id/notes')
  addNote(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddNoteDto) {
    return this.crm.addNote(user, id, dto);
  }

  @Patch(':id/notes/:noteId')
  pinNote(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('noteId', ParseUUIDPipe) noteId: string, @Body() dto: PinNoteDto) {
    return this.crm.pinNote(user, id, noteId, dto.isPinned);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  deleteNote(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('noteId', ParseUUIDPipe) noteId: string) {
    return this.crm.deleteNote(user, id, noteId);
  }

  @Put(':id/tags')
  @ApiOperation({ summary: 'Replace the customer tag set (creates missing CUSTOMER tags)' })
  setTags(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetTagsDto) {
    return this.crm.setTags(user, id, dto.tags);
  }

  @Post(':id/block')
  @HttpCode(200)
  @Managers()
  block(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BlockCustomerDto) {
    return this.crm.block(user, id, dto.reason);
  }

  @Post(':id/unblock')
  @HttpCode(200)
  @Managers()
  unblock(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.crm.unblock(user, id);
  }

  @Post(':id/recompute')
  @HttpCode(200)
  @Managers()
  @ApiOperation({ summary: 'Recompute cached order aggregates from orders (repair tool)' })
  recompute(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.crm.recompute(user, id);
  }
}
