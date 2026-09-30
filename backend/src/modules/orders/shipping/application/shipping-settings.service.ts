import { Injectable } from '@nestjs/common';
import type { Prisma, ShippingRuleType } from '@prisma/client';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { PrismaService, type Tx } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import type { CreateCourierDto, CreateShippingRuleDto, CreateZoneDto, UpdateCourierDto, UpdateShippingRuleDto, UpdateZoneDto } from '../dto/shipping.dto';
import { toCourier, toRule, toZone } from '../mappers/shipping.mapper';

type Actor = Pick<AuthUser, 'id' | 'name'>;
const RULE_INCLUDE = { section: { select: { code: true, nameBn: true } } } as const;

/** ডেলিভারি সেটিং: zones, free-delivery rules and couriers (admin). */
@Injectable()
export class ShippingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── zones ───

  async listZones() {
    const rows = await this.prisma.shippingZone.findMany({ orderBy: { id: 'asc' }, include: { _count: { select: { districts: true } } } });
    return rows.map((z) => ({ ...toZone(z, { internal: true }), districts: z._count.districts }));
  }

  @Traced('shipping.zone.create')
  async createZone(dto: CreateZoneDto, actor: Actor) {
    this.checkEta(dto.etaMinDays ?? 1, dto.etaMaxDays ?? 2);
    return this.prisma.tx(async (tx) => {
      if (await tx.shippingZone.findUnique({ where: { code: dto.code } })) throw new ConflictError('shipping.zone_exists', 'এই কোডের জোন আগেই আছে');
      const z = await tx.shippingZone.create({ data: dto });
      await this.audit.record({ actor, action: 'CREATE', area: 'settings', entityType: 'ShippingZone', entityId: String(z.id), summary: `ডেলিভারি জোন যোগ: ${z.nameBn}`, after: dto as unknown as Prisma.InputJsonValue }, tx);
      return toZone(z, { internal: true });
    });
  }

  @Traced('shipping.zone.update')
  async updateZone(id: number, dto: UpdateZoneDto, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.shippingZone.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('ShippingZone', id);
      this.checkEta(dto.etaMinDays ?? cur.etaMinDays, dto.etaMaxDays ?? cur.etaMaxDays);
      const z = await tx.shippingZone.update({ where: { id }, data: dto });
      const d = AuditService.diff({ ...cur, fee: cur.fee.toString(), courierCost: cur.courierCost.toString() }, dto as Record<string, unknown>);
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'ShippingZone', entityId: String(id), summary: `ডেলিভারি রেট বদলেছে: ${z.nameBn}`, before: d.before, after: d.after }, tx);
      return toZone(z, { internal: true });
    });
  }

  private checkEta(minD: number, maxD: number) {
    if (minD > maxD) throw new BusinessRuleError('shipping.eta_invalid', 'সর্বনিম্ন দিন সর্বোচ্চের চেয়ে বেশি হতে পারে না');
  }

  // ─── free-delivery rules ───

  async listRules() {
    const rows = await this.prisma.shippingRule.findMany({ orderBy: [{ isActive: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }], include: RULE_INCLUDE });
    return rows.map(toRule);
  }

  @Traced('shipping.rule.create')
  async createRule(dto: CreateShippingRuleDto, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const data = await this.ruleData(tx, dto.type, dto);
      const r = await tx.shippingRule.create({ data: { type: dto.type, label: dto.label, ...data }, include: RULE_INCLUDE });
      await this.audit.record({ actor, action: 'CREATE', area: 'settings', entityType: 'ShippingRule', entityId: r.id, summary: `ফ্রি ডেলিভারি নিয়ম যোগ: ${r.label}`, after: dto as unknown as Prisma.InputJsonValue }, tx);
      return toRule(r);
    });
  }

  @Traced('shipping.rule.update')
  async updateRule(id: string, dto: UpdateShippingRuleDto, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.shippingRule.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('ShippingRule', id);
      const type = dto.type ?? cur.type;
      const merged: CreateShippingRuleDto = {
        type,
        label: dto.label ?? cur.label,
        minSubtotal: dto.minSubtotal !== undefined ? dto.minSubtotal : cur.minSubtotal?.toNumber() ?? null,
        section: dto.section !== undefined ? dto.section : cur.sectionId,
        startsAt: dto.startsAt !== undefined ? dto.startsAt : cur.startsAt?.toISOString() ?? null,
        endsAt: dto.endsAt !== undefined ? dto.endsAt : cur.endsAt?.toISOString() ?? null,
        isActive: dto.isActive ?? cur.isActive,
        priority: dto.priority ?? cur.priority,
      };
      const data = await this.ruleData(tx, type, merged);
      const r = await tx.shippingRule.update({ where: { id }, data: { type, label: merged.label, ...data }, include: RULE_INCLUDE });
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'ShippingRule', entityId: id, summary: `ফ্রি ডেলিভারি নিয়ম বদলেছে: ${r.label}`, after: dto as unknown as Prisma.InputJsonValue }, tx);
      return toRule(r);
    });
  }

  async deleteRule(id: string, actor: Actor) {
    await this.prisma.tx(async (tx) => {
      const cur = await tx.shippingRule.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('ShippingRule', id);
      await tx.shippingRule.delete({ where: { id } });
      await this.audit.record({ actor, action: 'DELETE', area: 'settings', entityType: 'ShippingRule', entityId: id, summary: `ফ্রি ডেলিভারি নিয়ম মুছেছে: ${cur.label}` }, tx);
    });
  }

  /** Enforce the shipping_rules_shape CHECK with friendly errors. */
  private async ruleData(tx: Tx, type: ShippingRuleType, dto: Partial<CreateShippingRuleDto>) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (startsAt && endsAt && endsAt <= startsAt) throw new BusinessRuleError('shipping.rule_window', 'শেষের সময় শুরুর পরে দিন');
    let sectionId: string | null = null;
    if (type === 'MIN_SUBTOTAL' && !(dto.minSubtotal && dto.minSubtotal > 0)) throw new BusinessRuleError('shipping.rule_min_required', 'কত টাকার উপরে ফ্রি, সেটি দিন');
    if (type === 'SECTION_ONLY') {
      if (!dto.section) throw new BusinessRuleError('shipping.rule_section_required', 'কোন বিভাগে ফ্রি, সেটি বাছুন');
      const s = await tx.section.findFirst({ where: /^[0-9a-f-]{36}$/i.test(dto.section) ? { id: dto.section } : { code: dto.section }, select: { id: true } });
      if (!s) throw new NotFoundError('Section', dto.section);
      sectionId = s.id;
    }
    return {
      minSubtotal: type === 'MIN_SUBTOTAL' ? dto.minSubtotal : null,
      sectionId,
      startsAt,
      endsAt,
      isActive: dto.isActive ?? true,
      priority: dto.priority ?? 0,
    };
  }

  // ─── couriers ───

  async listCouriers() {
    const rows = await this.prisma.courier.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], include: { _count: { select: { shipments: true } } } });
    return rows.map(toCourier);
  }

  @Traced('shipping.courier.create')
  async createCourier(dto: CreateCourierDto, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      if (await tx.courier.findUnique({ where: { code: dto.code } })) throw new ConflictError('courier.exists', 'এই কুরিয়ার আগেই আছে');
      const c = await tx.courier.create({ data: { ...dto, apiConfig: (dto.apiConfig ?? {}) as Prisma.InputJsonValue } });
      await this.audit.record({ actor, action: 'CREATE', area: 'settings', entityType: 'Courier', entityId: c.id, summary: `কুরিয়ার যোগ: ${c.name}` }, tx);
      return toCourier(c);
    });
  }

  @Traced('shipping.courier.update')
  async updateCourier(id: string, dto: UpdateCourierDto, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.courier.findUnique({ where: { id } });
      if (!cur) throw new NotFoundError('Courier', id);
      if (dto.code && dto.code !== cur.code && (await tx.courier.findUnique({ where: { code: dto.code } }))) throw new ConflictError('courier.exists', 'এই কুরিয়ার আগেই আছে');
      const { apiConfig, ...rest } = dto;
      const c = await tx.courier.update({ where: { id }, data: { ...rest, ...(apiConfig ? { apiConfig: apiConfig as Prisma.InputJsonValue } : {}) } });
      const d = AuditService.diff(cur as unknown as Record<string, unknown>, rest as Record<string, unknown>);
      await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'Courier', entityId: id, summary: `কুরিয়ার বদলেছে: ${c.name}`, before: d.before, after: d.after }, tx);
      return toCourier(c);
    });
  }

  /** Couriers with shipment history are deactivated, never deleted. */
  async removeCourier(id: string, actor: Actor) {
    return this.prisma.tx(async (tx) => {
      const cur = await tx.courier.findUnique({ where: { id }, include: { _count: { select: { shipments: true } } } });
      if (!cur) throw new NotFoundError('Courier', id);
      if (cur._count.shipments > 0) {
        await tx.courier.update({ where: { id }, data: { isActive: false } });
        await this.audit.record({ actor, action: 'UPDATE', area: 'settings', entityType: 'Courier', entityId: id, summary: `কুরিয়ার বন্ধ: ${cur.name}` }, tx);
        return { deleted: false, deactivated: true };
      }
      await tx.courier.delete({ where: { id } });
      await this.audit.record({ actor, action: 'DELETE', area: 'settings', entityType: 'Courier', entityId: id, summary: `কুরিয়ার মুছেছে: ${cur.name}` }, tx);
      return { deleted: true, deactivated: false };
    });
  }
}
