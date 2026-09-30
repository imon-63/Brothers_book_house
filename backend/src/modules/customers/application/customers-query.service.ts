import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError } from '@/common/errors/domain.error';
import { toPage } from '@/common/dto/pagination.dto';
import { toNumber } from '@/common/utils/money';
import { asciiDigits, localPhone } from '@/common/utils/text';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { dhakaMonthStart, favourite, LIVE_STATUSES, monthlySeries, share } from '../domain/customer-stats';
import { toCsv } from '../domain/csv';
import { cancelRate, segmentCaseSql, segmentOf, SEGMENT_LABEL, SEGMENTS, type Segment } from '../domain/segment';
import { bundleStock, productStock } from '../domain/stock-status';
import type { CustomerFilterDto, CustomerListQueryDto, CustomerSort } from '../dto/admin-customers.dto';
import { addressInclude, mapAddress, mapCustomerRow, type CustomerListRow } from '../mappers/customer.mapper';

type Filters = Pick<CustomerFilterDto, 'segment' | 'kind' | 'tag' | 'blocked' | 'q'>;

const SEG_SQL = Prisma.raw(segmentCaseSql('c'));
const LIVE_SQL = Prisma.join(LIVE_STATUSES.map((s) => Prisma.sql`${s}::order_status`));
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

const SORT_SQL: Record<CustomerSort, string> = {
  last: 'c.last_order_at',
  spent: 'c.total_spent',
  orders: 'c.live_orders',
  aov: 'CASE WHEN c.live_orders > 0 THEN c.total_spent / c.live_orders ELSE 0 END',
  name: 'c.name',
  created: 'c.created_at',
};

/** Suggested CRM tags (frontend CUSTOMER_TAGS) — shown even before first use. */
export const SUGGESTED_TAGS = ['VIP', 'পাইকারি', 'শিক্ষক', 'স্টুডেন্ট', 'বাকি আছে', 'সাবধান'];

/** Read side of the admin CRM: list, KPIs, 360° profile, export. */
@Injectable()
export class CustomersQueryService {
  constructor(private readonly prisma: PrismaService) {}

  @Traced('customers.list')
  async list(q: CustomerListQueryDto) {
    const where = this.where(q);
    const orderBy = this.orderBy(q.sort, q.order);
    const offset = (q.page - 1) * q.pageSize;
    const [rows, count] = await Promise.all([
      this.prisma.$queryRaw<CustomerListRow[]>`${this.selectSql()} WHERE ${where} ORDER BY ${orderBy} LIMIT ${q.pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM customers c WHERE ${where}`,
    ]);
    const sparks = await this.sparks(rows.map((r) => r.id), 6);
    return toPage(rows.map((r) => mapCustomerRow(r, sparks.get(r.id))), Number(count[0]?.n ?? 0), q);
  }

  @Traced('customers.kpis')
  async kpis(now = new Date()) {
    const monthStart = dhakaMonthStart(now);
    const prevStart = dhakaMonthStart(now, -1);
    const sixStart = dhakaMonthStart(now, -5);
    const segCounts = Prisma.join(SEGMENTS.map((s) => Prisma.sql`count(*) FILTER (WHERE seg = ${s})::int AS ${Prisma.raw(`"seg_${s}"`)}`));
    const [k] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE user_id IS NOT NULL)::int AS registered,
             count(*) FILTER (WHERE live_orders >= 1)::int AS buyers,
             count(*) FILTER (WHERE live_orders >= 2)::int AS repeaters,
             COALESCE(sum(total_spent) FILTER (WHERE live_orders >= 1), 0) AS buyer_spend,
             COALESCE(max(total_spent), 0) AS top_spend,
             count(*) FILTER (WHERE first_order_at >= ${monthStart})::int AS new_this,
             count(*) FILTER (WHERE first_order_at >= ${prevStart} AND first_order_at < ${monthStart})::int AS new_prev,
             count(*) FILTER (WHERE first_order_at IS NOT NULL AND first_order_at < ${sixStart})::int AS before_six,
             count(*) FILTER (WHERE is_blocked)::int AS blocked,
             ${segCounts}
        FROM (SELECT c.*, ${SEG_SQL} AS seg FROM customers c WHERE c.deleted_at IS NULL) c`;
    const monthly = await this.prisma.$queryRaw<{ month: string; n: number }[]>`
      SELECT to_char(first_order_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM') AS month, count(*)::int AS n
        FROM customers WHERE deleted_at IS NULL AND first_order_at >= ${sixStart} GROUP BY 1`;
    const newSeries = monthlySeries(monthly.map((m) => ({ month: m.month, amount: m.n })), 6, now).map((m) => ({ month: m.month, count: m.amount }));
    let run = Number(k.before_six);
    const cumulative = newSeries.map((m) => ({ month: m.month, count: (run += m.count) }));

    const buyers = Number(k.buyers);
    const segments = Object.fromEntries(SEGMENTS.map((s) => [s, Number(k[`seg_${s}`])])) as Record<Segment, number>;
    const [topCustomers, followUps] = await Promise.all([
      this.prisma.$queryRaw<CustomerListRow[]>`${this.selectSql()} WHERE c.deleted_at IS NULL AND c.total_spent > 0 ORDER BY c.total_spent DESC LIMIT 5`,
      this.prisma.$queryRaw<CustomerListRow[]>`${this.selectSql()}
        WHERE c.deleted_at IS NULL AND NOT c.is_blocked
          AND ((${SEG_SQL}) IN ('sleep', 'risk') OR (c.live_orders >= 1 AND c.last_order_at < now() - interval '30 days'))
        ORDER BY c.total_spent DESC LIMIT 5`,
    ]);
    return {
      total: Number(k.total),
      registered: Number(k.registered),
      guests: Number(k.total) - Number(k.registered),
      buyers,
      repeaters: Number(k.repeaters),
      repeatRate: share(Number(k.repeaters), buyers),
      avgLtv: buyers ? Math.round(toNumber(k.buyer_spend as Prisma.Decimal) / buyers) : 0,
      topSpend: toNumber(k.top_spend as Prisma.Decimal),
      newThisMonth: Number(k.new_this),
      newLastMonth: Number(k.new_prev),
      atRisk: segments.risk,
      dormant: segments.sleep,
      blocked: Number(k.blocked),
      segments,
      newSeries,
      cumulative,
      topCustomers: topCustomers.map((r) => mapCustomerRow(r)),
      followUps: followUps.map((r) => mapCustomerRow(r)),
    };
  }

  @Traced('customers.detail')
  async detail(id: string, now = new Date()) {
    const c = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        user: { select: { id: true, email: true, status: true, lastLoginAt: true, createdAt: true } },
        addresses: { where: { deletedAt: null }, include: addressInclude, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] },
        notes: { include: { author: { select: { id: true, name: true } } }, orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }] },
        tags: { include: { tag: true } },
        wishlist: {
          orderBy: { createdAt: 'desc' },
          include: {
            product: { select: { id: true, title: true, slug: true, price: true, trackInventory: true, allowBackorder: true, stockOnHand: true, stockReserved: true, lowStockThreshold: true } },
            bundle: { select: { id: true, title: true, slug: true, price: true, items: { select: { quantity: true, product: { select: { trackInventory: true, allowBackorder: true, stockOnHand: true, stockReserved: true } } } } } },
          },
        },
        _count: { select: { conversations: true, reviews: true } },
      },
    });
    if (!c) throw new NotFoundError('Customer', id);

    const [orders, methods, sections, categories, items, monthly] = await Promise.all([
      this.prisma.order.findMany({
        where: { customerId: id },
        orderBy: { placedAt: 'desc' },
        take: 50,
        select: { id: true, orderNo: true, status: true, paymentMethod: true, paymentStatus: true, grandTotal: true, placedAt: true, _count: { select: { items: true } } },
      }),
      this.prisma.order.groupBy({ by: ['paymentMethod'], where: { customerId: id }, _count: { _all: true } }),
      this.prisma.$queryRaw<{ key: string; amount: Prisma.Decimal }[]>`
        SELECT oi.section_code AS key, sum(oi.line_total) AS amount
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.customer_id = ${id}::uuid AND o.status IN (${LIVE_SQL}) GROUP BY 1`,
      this.prisma.$queryRaw<{ key: string | null; amount: Prisma.Decimal }[]>`
        SELECT oi.category_name AS key, sum(oi.line_total) AS amount
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.customer_id = ${id}::uuid AND o.status IN (${LIVE_SQL}) GROUP BY 1`,
      this.prisma.$queryRaw<{ kind: string; ref_id: string; title: string; qty: bigint; amount: Prisma.Decimal }[]>`
        SELECT oi.kind::text AS kind, COALESCE(oi.product_id, oi.bundle_id) AS ref_id, max(oi.title) AS title,
               sum(oi.quantity) AS qty, sum(oi.line_total) AS amount
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE o.customer_id = ${id}::uuid AND o.status IN (${LIVE_SQL})
         GROUP BY 1, 2 ORDER BY qty DESC, amount DESC LIMIT 5`,
      this.prisma.$queryRaw<{ month: string; amount: Prisma.Decimal; orders: number }[]>`
        SELECT to_char(placed_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM') AS month, sum(grand_total) AS amount, count(*)::int AS orders
          FROM orders WHERE customer_id = ${id}::uuid AND status IN (${LIVE_SQL})
           AND placed_at >= ${dhakaMonthStart(now, -11)} GROUP BY 1`,
    ]);

    const spent = toNumber(c.totalSpent);
    const segment = segmentOf({ ordersCount: c.ordersCount, liveOrders: c.liveOrders, cancelledOrders: c.cancelledOrders, totalSpent: spent, lastOrderAt: c.lastOrderAt }, now);
    const totalOrders = methods.reduce((s, m) => s + m._count._all, 0);
    const cod = methods.find((m) => m.paymentMethod === 'COD')?._count._all ?? 0;
    const ssl = methods.find((m) => m.paymentMethod === 'SSLCOMMERZ')?._count._all ?? 0;
    const favSection = favourite(sections.map((s) => ({ key: s.key, amount: toNumber(s.amount) })));
    const favCategory = favourite(categories.map((s) => ({ key: s.key, amount: toNumber(s.amount) })));

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      registered: !!c.userId,
      account: c.user,
      marketingOptIn: c.marketingOptIn,
      adminNote: c.adminNote,
      blocked: c.isBlocked,
      blockedReason: c.blockedReason,
      blockedAt: c.blockedAt,
      createdAt: c.createdAt,
      segment,
      segmentLabel: SEGMENT_LABEL[segment],
      tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
      stats: {
        ordersCount: c.ordersCount,
        liveOrders: c.liveOrders,
        cancelledOrders: c.cancelledOrders,
        cancelRate: cancelRate(c.ordersCount, c.cancelledOrders),
        totalSpent: spent,
        aov: c.liveOrders ? Math.round(spent / c.liveOrders) : 0,
        firstOrderAt: c.firstOrderAt,
        lastOrderAt: c.lastOrderAt,
        daysSinceLastOrder: c.lastOrderAt ? Math.max(0, Math.floor((now.getTime() - c.lastOrderAt.getTime()) / 86_400_000)) : null,
        payment: { cod, ssl, other: totalOrders - cod - ssl, codShare: share(cod, totalOrders), sslShare: share(ssl, totalOrders) },
        favouriteSection: favSection,
        favouriteCategory: favCategory,
        conversations: c._count.conversations,
        reviews: c._count.reviews,
      },
      monthlySpend: monthlySeries(monthly.map((m) => ({ month: m.month, amount: toNumber(m.amount), orders: m.orders })), 12, now),
      topItems: items.map((i) => ({ kind: i.kind, id: i.ref_id, title: i.title, qty: Number(i.qty), amount: toNumber(i.amount) })),
      orders: orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        grandTotal: toNumber(o.grandTotal),
        itemCount: o._count.items,
        placedAt: o.placedAt,
      })),
      addresses: c.addresses.map(mapAddress),
      wishlist: c.wishlist.map((w) => ({
        id: w.id,
        kind: w.productId ? 'product' : 'bundle',
        refId: w.productId ?? w.bundleId,
        title: w.product?.title ?? w.bundle?.title ?? '',
        price: toNumber(w.product?.price ?? w.bundle?.price),
        stock: w.product ? productStock(w.product) : bundleStock(w.bundle?.items ?? []),
        notifyOnRestock: w.notifyOnRestock,
        notifiedAt: w.notifiedAt,
        createdAt: w.createdAt,
      })),
      notes: c.notes.map((n) => ({ id: n.id, body: n.body, isPinned: n.isPinned, author: n.author, createdAt: n.createdAt })),
    };
  }

  async tags() {
    const rows = await this.prisma.tag.findMany({ where: { scope: 'CUSTOMER' }, include: { _count: { select: { customers: true } } }, orderBy: { name: 'asc' } });
    const used = rows.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.customers }));
    const suggested = SUGGESTED_TAGS.filter((s) => !used.some((u) => u.name === s));
    return { tags: used, suggested };
  }

  @Traced('customers.export')
  async exportCsv(f: CustomerFilterDto, limit = 10_000) {
    const rows = await this.prisma.$queryRaw<CustomerListRow[]>`
      ${this.selectSql()} WHERE ${this.where(f)} ORDER BY ${this.orderBy(f.sort, f.order)} LIMIT ${limit}`;
    const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
    const csv = toCsv([
      ['Name', 'Phone', 'Email', 'Registered', 'Segment', 'Orders', 'Live orders', 'Cancelled', 'Spent (BDT)', 'AOV (BDT)', 'First order', 'Last order', 'Tags', 'Blocked'],
      ...rows.map((r) => {
        const m = mapCustomerRow(r);
        return [m.name, localPhone(m.phone), m.email, m.registered ? 'yes' : 'no', SEGMENT_LABEL[m.segment].en, m.ordersCount, m.liveOrders, m.cancelledOrders, Math.round(m.totalSpent), m.aov, iso(m.firstOrderAt), iso(m.lastOrderAt), m.tags.map((t) => t.name).join('; '), m.blocked ? 'yes' : 'no'];
      }),
    ]);
    return { csv, count: rows.length };
  }

  // ─── SQL building blocks ───

  private selectSql() {
    return Prisma.sql`
      SELECT c.id, c.name, c.phone, c.email, c.user_id, c.is_blocked, c.blocked_reason,
             c.orders_count, c.live_orders, c.cancelled_orders, c.total_spent,
             c.first_order_at, c.last_order_at, c.created_at,
             ${SEG_SQL} AS segment,
             COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY t.name)
                         FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id WHERE ct.customer_id = c.id), '[]'::json) AS tags
        FROM customers c`;
  }

  private where(f: Filters): Prisma.Sql {
    const conds: Prisma.Sql[] = [Prisma.sql`c.deleted_at IS NULL`];
    if (f.segment) conds.push(Prisma.sql`(${SEG_SQL}) = ${f.segment}`);
    if (f.kind === 'registered') conds.push(Prisma.sql`c.user_id IS NOT NULL`);
    if (f.kind === 'guest') conds.push(Prisma.sql`c.user_id IS NULL`);
    if (f.blocked !== undefined) conds.push(Prisma.sql`c.is_blocked = ${f.blocked}`);
    if (f.tag) {
      conds.push(Prisma.sql`EXISTS (SELECT 1 FROM customer_tags ct JOIN tags t ON t.id = ct.tag_id
                                     WHERE ct.customer_id = c.id AND t.scope = 'CUSTOMER' AND t.name = ${f.tag})`);
    }
    const q = f.q?.trim();
    if (q) {
      const like = `%${escapeLike(q)}%`;
      const ors: Prisma.Sql[] = [Prisma.sql`c.name ILIKE ${like}`, Prisma.sql`c.email::text ILIKE ${like}`];
      const digits = asciiDigits(q).replace(/\D/g, '');
      if (digits.length >= 3) ors.push(Prisma.sql`c.phone LIKE ${`%${digits}%`}`);
      ors.push(Prisma.sql`EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.order_no = ${q.toUpperCase()})`);
      conds.push(Prisma.sql`(${Prisma.join(ors, ' OR ')})`);
    }
    return Prisma.join(conds, ' AND ');
  }

  private orderBy(sort: CustomerSort = 'last', dir: 'asc' | 'desc' = 'desc') {
    const d = dir === 'asc' ? 'ASC' : 'DESC';
    return Prisma.raw(`${SORT_SQL[sort] ?? SORT_SQL.last} ${d} NULLS LAST, c.total_spent DESC, c.id DESC`);
  }

  /** Monthly live spend for a page of customers (sparklines), in one query. */
  private async sparks(ids: string[], months: number) {
    const out = new Map<string, number[]>();
    if (!ids.length) return out;
    const rows = await this.prisma.$queryRaw<{ customer_id: string; month: string; amount: Prisma.Decimal }[]>`
      SELECT customer_id, to_char(placed_at AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM') AS month, sum(grand_total) AS amount
        FROM orders
       WHERE customer_id = ANY(${ids}::uuid[]) AND status IN (${LIVE_SQL}) AND placed_at >= ${dhakaMonthStart(new Date(), -(months - 1))}
       GROUP BY 1, 2`;
    for (const id of ids) {
      const mine = rows.filter((r) => r.customer_id === id).map((r) => ({ month: r.month, amount: toNumber(r.amount) }));
      out.set(id, monthlySeries(mine, months).map((m) => m.amount));
    }
    return out;
  }
}
