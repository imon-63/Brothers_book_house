import type { Prisma } from '@prisma/client';
import { toNumber } from '@/common/utils/money';
import { cancelRate, SEGMENT_LABEL, type Segment } from '../domain/segment';

export type CustomerListRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  user_id: string | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  orders_count: number;
  live_orders: number;
  cancelled_orders: number;
  total_spent: Prisma.Decimal;
  first_order_at: Date | null;
  last_order_at: Date | null;
  created_at: Date;
  segment: Segment;
  tags: { id: string; name: string; color: string | null }[];
};

export function mapCustomerRow(r: CustomerListRow, spark?: number[]) {
  const spent = toNumber(r.total_spent);
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    registered: !!r.user_id,
    blocked: r.is_blocked,
    blockedReason: r.blocked_reason,
    segment: r.segment,
    segmentLabel: SEGMENT_LABEL[r.segment],
    ordersCount: r.orders_count,
    liveOrders: r.live_orders,
    cancelledOrders: r.cancelled_orders,
    cancelRate: cancelRate(r.orders_count, r.cancelled_orders),
    totalSpent: spent,
    aov: r.live_orders ? Math.round(spent / r.live_orders) : 0,
    firstOrderAt: r.first_order_at,
    lastOrderAt: r.last_order_at,
    createdAt: r.created_at,
    tags: r.tags ?? [],
    ...(spark ? { spark } : {}),
  };
}

export type CustomerListItem = ReturnType<typeof mapCustomerRow>;

type AddressRow = Prisma.CustomerAddressGetPayload<{ include: { district: { select: { id: true; nameBn: true; division: { select: { nameBn: true } } } } } }>;

export function mapAddress(a: AddressRow) {
  return {
    id: a.id,
    label: a.label,
    recipientName: a.recipientName,
    phone: a.phone,
    districtId: a.districtId,
    district: a.district.nameBn,
    division: a.district.division.nameBn,
    upazila: a.upazila,
    union: a.union,
    line: a.line,
    landmark: a.landmark,
    postcode: a.postcode,
    isDefault: a.isDefault,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export const addressInclude = { district: { select: { id: true, nameBn: true, division: { select: { nameBn: true } } } } } as const;
