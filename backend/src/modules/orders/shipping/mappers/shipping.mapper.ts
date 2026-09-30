import type { Courier, Prisma, Shipment, ShippingRule, ShippingZone } from '@prisma/client';
import { toNumber } from '@/common/utils/money';

export function toZone(z: ShippingZone, opts: { internal?: boolean } = {}) {
  return {
    id: z.id,
    code: z.code,
    nameBn: z.nameBn,
    fee: toNumber(z.fee),
    ...(opts.internal ? { courierCost: toNumber(z.courierCost) } : {}),
    etaMinDays: z.etaMinDays,
    etaMaxDays: z.etaMaxDays,
    updatedAt: z.updatedAt,
  };
}

export function toRule(r: ShippingRule & { section?: { code: string; nameBn: string } | null }) {
  return {
    id: r.id,
    type: r.type,
    label: r.label,
    minSubtotal: r.minSubtotal == null ? null : toNumber(r.minSubtotal),
    section: r.section ? { id: r.sectionId, code: r.section.code, nameBn: r.section.nameBn } : null,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    isActive: r.isActive,
    priority: r.priority,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toCourier(c: Courier & { _count?: { shipments: number } }) {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    trackingUrl: c.trackingUrl,
    isActive: c.isActive,
    apiConfig: c.apiConfig as Prisma.JsonObject,
    shipments: c._count?.shipments ?? undefined,
    createdAt: c.createdAt,
  };
}

export function trackingLink(c: Pick<Courier, 'trackingUrl'>, trackingNo: string | null) {
  return c.trackingUrl && trackingNo ? c.trackingUrl.replace('{tracking}', encodeURIComponent(trackingNo)) : null;
}

export function toShipment(s: Shipment & { courier: Courier; order?: { orderNo: string } }) {
  return {
    id: s.id,
    orderId: s.orderId,
    orderNo: s.order?.orderNo,
    courier: { id: s.courier.id, code: s.courier.code, name: s.courier.name },
    trackingNo: s.trackingNo,
    trackingUrl: trackingLink(s.courier, s.trackingNo),
    consignmentId: s.consignmentId,
    status: s.status,
    codAmount: toNumber(s.codAmount),
    codStatus: s.codStatus,
    deliveryCharge: toNumber(s.deliveryCharge),
    returnCharge: toNumber(s.returnCharge),
    weightGrams: s.weightGrams,
    bookedAt: s.bookedAt,
    pickedUpAt: s.pickedUpAt,
    deliveredAt: s.deliveredAt,
    returnedAt: s.returnedAt,
    codCollectedAt: s.codCollectedAt,
    codRemittedAt: s.codRemittedAt,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
