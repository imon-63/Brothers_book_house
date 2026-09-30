import type { OrderStatus, Prisma } from '@prisma/client';
import { dateWindow, phoneNeedle, TAB_STATUSES } from '../domain/order-filters';
import type { OrderFilterDto } from '../dto/admin-orders.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filters shared by list, counts, board and export — everything except the status tab. */
export function baseWhere(f: OrderFilterDto, now = new Date()): Prisma.OrderWhereInput {
  const and: Prisma.OrderWhereInput[] = [];
  const q = f.q?.trim();
  if (q) {
    const ci = { contains: q, mode: 'insensitive' as const };
    const or: Prisma.OrderWhereInput[] = [
      { orderNo: ci },
      { contactName: ci },
      { contactEmail: ci },
      { shipLine: ci },
      { shipDistrict: ci },
      { shipUpazila: ci },
      { shipUnion: ci },
      { items: { some: { title: ci } } },
      { shipments: { some: { trackingNo: ci } } },
    ];
    const phone = phoneNeedle(q);
    if (phone) or.push({ contactPhone: { contains: phone } });
    and.push({ OR: or });
  }
  const w = dateWindow(f.range, now, f.from, f.to);
  if (w.gte || w.lt) and.push({ placedAt: { ...(w.gte ? { gte: w.gte } : {}), ...(w.lt ? { lt: w.lt } : {}) } });
  if (f.pay === 'cod') and.push({ paymentMethod: 'COD' });
  if (f.pay === 'ssl') and.push({ paymentMethod: 'SSLCOMMERZ' });
  if (f.pay === 'due') and.push({ paymentStatus: 'UNPAID', status: { in: ['CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY', 'DELIVERED'] } });
  if (f.paymentMethod) and.push({ paymentMethod: f.paymentMethod });
  if (f.paid === 'paid') and.push({ paymentStatus: { not: 'UNPAID' } });
  if (f.paid === 'due') and.push({ paymentStatus: 'UNPAID' });
  if (f.section) and.push({ items: { some: { sectionCode: f.section } } });
  if (f.priority === 'flagged') and.push({ priority: { in: ['HIGH', 'URGENT'] } });
  else if (f.priority === 'urgent') and.push({ priority: 'URGENT' });
  else if (f.priority && f.priority !== 'all') and.push({ priority: f.priority });
  if (f.tag) and.push({ tags: { some: { tag: UUID.test(f.tag) ? { id: f.tag } : { name: f.tag, scope: 'ORDER' } } } });
  if (f.customerId) and.push({ customerId: f.customerId });
  return and.length ? { AND: and } : {};
}

export function statusesFor(f: OrderFilterDto): readonly OrderStatus[] {
  return f.status?.length ? f.status : TAB_STATUSES[f.tab];
}

export function listWhere(f: OrderFilterDto, now = new Date()): Prisma.OrderWhereInput {
  return { AND: [baseWhere(f, now), { status: { in: [...statusesFor(f)] } }] };
}

export function orderBy(sort: OrderFilterDto['sort']): Prisma.OrderOrderByWithRelationInput[] {
  switch (sort) {
    case 'old':
      return [{ placedAt: 'asc' }];
    case 'high':
      return [{ grandTotal: 'desc' }, { placedAt: 'desc' }];
    case 'low':
      return [{ grandTotal: 'asc' }, { placedAt: 'desc' }];
    case 'prio':
      return [{ priority: 'desc' }, { placedAt: 'desc' }];
    default:
      return [{ placedAt: 'desc' }];
  }
}
