import { Body, Controller, Delete, Get, Header, Headers, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser, Fulfilment, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { AdminOrdersService } from '../application/admin-orders.service';
import { OrderBulkService } from '../application/order-bulk.service';
import { OrderMetaService } from '../application/order-meta.service';
import { OrderPaymentService } from '../application/order-payment.service';
import { OrderPlacementService } from '../application/order-placement.service';
import { OrderTransitionService } from '../application/order-transition.service';
import {
  AddNoteDto, AddTagDto, BoardQueryDto, BulkIdsDto, BulkStatusDto, ChangeStatusDto, MarkPaidDto, NoteParam, OrderFilterDto, OrderRefParam, PickListQueryDto,
  PriorityDto, RegressDto, ReopenOrderDto, TagParam,
} from '../dto/admin-orders.dto';
import { AdminCreateOrderDto } from '../dto/place-order.dto';

const staffActor = (u: AuthUser) => ({ id: u.id, name: u.name, type: 'STAFF' as const });

@ApiTags('Admin · Orders · অর্ডার')
@ApiBearerAuth()
@Controller({ path: 'admin/orders', version: '1' })
export class OrdersAdminController {
  constructor(
    private readonly query: AdminOrdersService,
    private readonly transitions: OrderTransitionService,
    private readonly payments: OrderPaymentService,
    private readonly bulk: OrderBulkService,
    private readonly meta: OrderMetaService,
    private readonly placement: OrderPlacementService,
  ) {}

  @Staff()
  @Get()
  @ApiOperation({ summary: 'List with filters (tab, date, payment, section, priority, tag, search) + tab counts' })
  list(@Query() q: OrderFilterDto) {
    return this.query.list(q);
  }

  @Staff()
  @Get('counts')
  counts(@Query() q: OrderFilterDto) {
    return this.query.counts(q);
  }

  @Staff()
  @Get('kpis')
  kpis() {
    return this.query.kpis();
  }

  @Staff()
  @Get('board')
  @ApiOperation({ summary: 'Kanban board grouped by status (count, value, first cards)' })
  board(@Query() q: BoardQueryDto) {
    return this.query.board(q);
  }

  @Staff()
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV export for the current filters (max 5000 rows)' })
  async export(@Query() q: OrderFilterDto, @CurrentUser() u: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="orders-${new Date().toISOString().slice(0, 10)}.csv"`);
    return this.query.exportCsv(q, u);
  }

  @Fulfilment()
  @Get('pick-list')
  @ApiOperation({ summary: 'Pick list grouped by product (bundles expanded) with stock shortfalls' })
  pickList(@Query() q: PickListQueryDto) {
    return this.query.pickList(q.ids);
  }

  @Staff()
  @Get('tags')
  tags() {
    return this.meta.listTags();
  }

  @Staff()
  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  @ApiOperation({ summary: 'Create a phone / admin order' })
  async create(@Body() dto: AdminCreateOrderDto, @CurrentUser() u: AuthUser, @Headers('idempotency-key') key: string | undefined, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { source, priority, staffNote, ...order } = dto;
    const r = await this.placement.place(order, { user: u, ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null, idempotencyKey: key }, { source: source ?? 'PHONE', priority, staffNote });
    res.status(r.code);
    return r.body;
  }

  @Fulfilment()
  @Post('bulk/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bulk confirm / advance / set status — per-order results' })
  bulkStatus(@Body() dto: BulkStatusDto, @CurrentUser() u: AuthUser) {
    return this.bulk.status(dto, u);
  }

  @Staff()
  @Post('bulk/mark-paid')
  @HttpCode(200)
  bulkMarkPaid(@Body() dto: BulkIdsDto, @CurrentUser() u: AuthUser) {
    return this.bulk.markPaid(dto.ids, u);
  }

  @Staff()
  @Get(':id')
  @ApiOperation({ summary: 'Order detail: items, components, history, notes, tags, shipments, payments, documents, customer' })
  detail(@Param() p: OrderRefParam) {
    return this.query.detail(p.id);
  }

  @Fulfilment()
  @Post(':id/status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Move forward / cancel / return (credit reason required for live orders)' })
  async status(@Param() p: OrderRefParam, @Body() dto: ChangeStatusDto, @CurrentUser() u: AuthUser) {
    await this.transitions.transition(p.id, { to: dto.to, note: dto.note, credit: dto.credit, expectedVersion: dto.version }, staffActor(u));
    return this.query.detail(p.id);
  }

  @Fulfilment()
  @Post(':id/regress')
  @HttpCode(200)
  @ApiOperation({ summary: 'One step back (before shipping)' })
  async regress(@Param() p: OrderRefParam, @Body() dto: RegressDto, @CurrentUser() u: AuthUser) {
    await this.transitions.regress(p.id, { note: dto.note, expectedVersion: dto.version }, staffActor(u));
    return this.query.detail(p.id);
  }

  @Managers()
  @Post(':id/reopen')
  @HttpCode(200)
  @ApiOperation({ summary: 'বাতিল/ফেরত অর্ডার আবার চালু করুন (কারণ বাধ্যতামূলক, পুরো লগ থাকে)' })
  async reopen(@Param() p: OrderRefParam, @Body() dto: ReopenOrderDto, @CurrentUser() u: AuthUser) {
    await this.transitions.reopen(p.id, { reason: dto.reason, to: dto.to, expectedVersion: dto.version }, staffActor(u));
    return this.query.detail(p.id);
  }

  @Staff()
  @Post(':id/mark-paid')
  @HttpCode(200)
  @ApiOperation({ summary: 'COD / cash received' })
  async markPaid(@Param() p: OrderRefParam, @Body() dto: MarkPaidDto, @CurrentUser() u: AuthUser) {
    await this.payments.markPaid(p.id, u, dto);
    return this.query.detail(p.id);
  }

  @Staff()
  @Patch(':id/priority')
  priority(@Param() p: OrderRefParam, @Body() dto: PriorityDto, @CurrentUser() u: AuthUser) {
    return this.meta.setPriority(p.id, dto.priority, u);
  }

  @Staff()
  @Post(':id/tags')
  addTag(@Param() p: OrderRefParam, @Body() dto: AddTagDto, @CurrentUser() u: AuthUser) {
    return this.meta.addTag(p.id, dto.name, dto.color, u);
  }

  @Staff()
  @Delete(':id/tags/:tagId')
  removeTag(@Param() p: TagParam, @CurrentUser() u: AuthUser) {
    return this.meta.removeTag(p.id, p.tagId, u);
  }

  @Staff()
  @Post(':id/notes')
  addNote(@Param() p: OrderRefParam, @Body() dto: AddNoteDto, @CurrentUser() u: AuthUser) {
    return this.meta.addNote(p.id, dto.body, dto.isPinned ?? false, u);
  }

  @Staff()
  @Delete(':id/notes/:noteId')
  @HttpCode(204)
  async deleteNote(@Param() p: NoteParam, @CurrentUser() u: AuthUser) {
    await this.meta.deleteNote(p.id, p.noteId, u);
  }
}
