import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Fulfilment, Managers, Staff } from '@/common/decorators/auth.decorators';
import type { AuthUser } from '@/common/types/auth-user';
import { ShipmentsService } from '../application/shipments.service';
import { ShippingSettingsService } from '../application/shipping-settings.service';
import {
  AssignShipmentDto, CreateCourierDto, CreateShippingRuleDto, CreateZoneDto, IdParam, IntIdParam, ShipmentListQueryDto,
  UpdateCourierDto, UpdateShipmentDto, UpdateShippingRuleDto, UpdateZoneDto,
} from '../dto/shipping.dto';

@ApiTags('Admin · Shipping · ডেলিভারি')
@ApiBearerAuth()
@Controller({ path: 'admin/shipping', version: '1' })
export class ShippingAdminController {
  constructor(
    private readonly settings: ShippingSettingsService,
    private readonly shipments: ShipmentsService,
  ) {}

  // zones
  @Staff()
  @Get('zones')
  zones() {
    return this.settings.listZones();
  }

  @Managers()
  @Post('zones')
  createZone(@Body() dto: CreateZoneDto, @CurrentUser() u: AuthUser) {
    return this.settings.createZone(dto, u);
  }

  @Managers()
  @Patch('zones/:id')
  @ApiOperation({ summary: 'Change a zone fee / courier cost / ETA' })
  updateZone(@Param() p: IntIdParam, @Body() dto: UpdateZoneDto, @CurrentUser() u: AuthUser) {
    return this.settings.updateZone(p.id, dto, u);
  }

  // free-delivery rules
  @Staff()
  @Get('rules')
  rules() {
    return this.settings.listRules();
  }

  @Managers()
  @Post('rules')
  createRule(@Body() dto: CreateShippingRuleDto, @CurrentUser() u: AuthUser) {
    return this.settings.createRule(dto, u);
  }

  @Managers()
  @Patch('rules/:id')
  updateRule(@Param() p: IdParam, @Body() dto: UpdateShippingRuleDto, @CurrentUser() u: AuthUser) {
    return this.settings.updateRule(p.id, dto, u);
  }

  @Managers()
  @Delete('rules/:id')
  @HttpCode(204)
  async deleteRule(@Param() p: IdParam, @CurrentUser() u: AuthUser) {
    await this.settings.deleteRule(p.id, u);
  }

  // couriers
  @Staff()
  @Get('couriers')
  couriers() {
    return this.settings.listCouriers();
  }

  @Managers()
  @Post('couriers')
  createCourier(@Body() dto: CreateCourierDto, @CurrentUser() u: AuthUser) {
    return this.settings.createCourier(dto, u);
  }

  @Managers()
  @Patch('couriers/:id')
  updateCourier(@Param() p: IdParam, @Body() dto: UpdateCourierDto, @CurrentUser() u: AuthUser) {
    return this.settings.updateCourier(p.id, dto, u);
  }

  @Managers()
  @Delete('couriers/:id')
  @ApiOperation({ summary: 'Delete (or deactivate when it has shipments)' })
  removeCourier(@Param() p: IdParam, @CurrentUser() u: AuthUser) {
    return this.settings.removeCourier(p.id, u);
  }

  // shipments
  @Staff()
  @Get('shipments')
  listShipments(@Query() q: ShipmentListQueryDto) {
    return this.shipments.list(q);
  }

  @Fulfilment()
  @Post('shipments')
  @ApiOperation({ summary: 'Assign courier + tracking to an order (one active shipment per order)' })
  assign(@Body() dto: AssignShipmentDto, @CurrentUser() u: AuthUser) {
    return this.shipments.assign(dto, u);
  }

  @Fulfilment()
  @Patch('shipments/:id')
  @ApiOperation({ summary: 'Update shipment status / COD status / courier charges' })
  update(@Param() p: IdParam, @Body() dto: UpdateShipmentDto, @CurrentUser() u: AuthUser) {
    return this.shipments.update(p.id, dto, u);
  }
}
