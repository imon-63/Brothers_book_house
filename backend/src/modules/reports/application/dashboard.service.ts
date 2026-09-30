import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { delta, rangeFor, type Period, type Range } from '../domain/period';

const LIVE = Prisma.sql`o.status NOT IN ('CANCELLED','RETURNED')`;
const n = (v: unknown) => Number(v ?? 0);

type Kpi = { revenue: number; orders: number; aov: number; gross: number; unknownCost: number; newCustomers: number };

/**
 * Admin dashboard. Each block is one parameterised SQL query over indexed
 * columns (placed_at, status, customer_id), bucketed in Asia/Dhaka time.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  @Traced('reports.dashboard')
  async dashboard(period: Period) {
    const r = rangeFor(period);
    const [cur, prev, series, pipeline, payments, sections, categories, topProducts, topCustomers, hours, weekdays, coupons, recent, attention] = await Promise.all([
      this.kpis(r.from, r.to),
      this.kpis(r.prevFrom, r.prevTo),
      this.series(r),
      this.pipeline(r),
      this.paymentMix(r),
      this.bySection(r),
      this.byCategory(r),
      this.topProducts(r),
      this.topCustomers(r),
      this.hours(r),
      this.weekdays(r),
      this.coupons(r),
      this.recent(),
      this.attention(),
    ]);
    return {
      period,
      range: { from: r.from, to: r.to },
      kpis: {
        revenue: { value: cur.revenue, delta: delta(cur.revenue, prev.revenue) },
        orders: { value: cur.orders, delta: delta(cur.orders, prev.orders) },
        aov: { value: cur.aov, delta: delta(cur.aov, prev.aov) },
        grossProfit: { value: cur.gross, delta: delta(cur.gross, prev.gross), unknownCostOrders: cur.unknownCost },
        newCustomers: { value: cur.newCustomers, delta: delta(cur.newCustomers, prev.newCustomers) },
        pending: { value: attention.pendingOrders, oldestAt: attention.oldestPendingAt },
      },
      series,
      pipeline,
      payments,
      sections,
      categories,
      topProducts,
      topCustomers,
      hours,
      weekdays,
      coupons,
      recentOrders: recent,
      attention,
    };
  }

  private async kpis(from: Date, to: Date): Promise<Kpi> {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT coalesce(sum(o.grand_total),0) AS revenue, count(*) AS orders,
             coalesce(sum(o.items_subtotal - o.discount_total - o.items_cost) FILTER (WHERE o.items_cost IS NOT NULL),0) AS gross,
             count(*) FILTER (WHERE o.items_cost IS NULL) AS unknown_cost
        FROM orders o WHERE o.placed_at >= ${from} AND o.placed_at < ${to} AND ${LIVE}`;
    const [c] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM customers WHERE first_order_at >= ${from} AND first_order_at < ${to}`;
    const orders = n(row.orders);
    const revenue = n(row.revenue);
    return { revenue, orders, aov: orders ? Math.round(revenue / orders) : 0, gross: n(row.gross), unknownCost: n(row.unknown_cost), newCustomers: n(c?.n) };
  }

  private async series(r: Range) {
    const unit = r.bucket === 'hour' ? Prisma.sql`'hour'` : Prisma.sql`'day'`;
    const step = r.bucket === 'hour' ? Prisma.sql`interval '1 hour'` : Prisma.sql`interval '1 day'`;
    const rows = await this.prisma.$queryRaw<{ t: Date; revenue: unknown; orders: bigint }[]>`
      WITH b AS (
        SELECT generate_series(date_trunc(${unit}, ${r.from}::timestamptz AT TIME ZONE 'Asia/Dhaka'),
                               date_trunc(${unit}, ${r.to}::timestamptz AT TIME ZONE 'Asia/Dhaka'), ${step}) t)
      SELECT b.t, coalesce(sum(o.grand_total),0) AS revenue, count(o.id) AS orders
        FROM b LEFT JOIN orders o
          ON date_trunc(${unit}, o.placed_at AT TIME ZONE 'Asia/Dhaka') = b.t
         AND o.placed_at >= ${r.from} AND ${LIVE}
       GROUP BY b.t ORDER BY b.t`;
    return rows.map((x) => ({ t: x.t, revenue: n(x.revenue), orders: n(x.orders) }));
  }

  private async pipeline(r: Range) {
    const rows = await this.prisma.$queryRaw<{ status: string; n: bigint }[]>`
      SELECT status, count(*) AS n FROM orders WHERE placed_at >= ${r.from} GROUP BY status`;
    return Object.fromEntries(rows.map((x) => [x.status, n(x.n)]));
  }

  private async paymentMix(r: Range) {
    const rows = await this.prisma.$queryRaw<{ method: string; paid: boolean; n: bigint; total: unknown }[]>`
      SELECT o.payment_method AS method, (o.payment_status <> 'UNPAID') AS paid, count(*) AS n, coalesce(sum(o.grand_total),0) AS total
        FROM orders o WHERE o.placed_at >= ${r.from} AND ${LIVE} GROUP BY 1, 2`;
    return rows.map((x) => ({ method: x.method, paid: x.paid, orders: n(x.n), total: n(x.total) }));
  }

  private async bySection(r: Range) {
    const rows = await this.prisma.$queryRaw<{ section: string; revenue: unknown; units: bigint; orders: bigint }[]>`
      SELECT i.section_code AS section, coalesce(sum(i.line_total),0) AS revenue, coalesce(sum(i.quantity),0) AS units, count(DISTINCT i.order_id) AS orders
        FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.placed_at >= ${r.from} AND ${LIVE} GROUP BY 1 ORDER BY 2 DESC`;
    return rows.map((x) => ({ section: x.section, revenue: n(x.revenue), units: n(x.units), orders: n(x.orders) }));
  }

  private async byCategory(r: Range) {
    const rows = await this.prisma.$queryRaw<{ category: string | null; revenue: unknown; units: bigint }[]>`
      SELECT CASE WHEN i.kind = 'BUNDLE' THEN 'প্যাকেজ' ELSE coalesce(i.category_name, '—') END AS category,
             coalesce(sum(i.line_total),0) AS revenue, coalesce(sum(i.quantity),0) AS units
        FROM order_items i JOIN orders o ON o.id = i.order_id
       WHERE o.placed_at >= ${r.from} AND ${LIVE} GROUP BY 1 ORDER BY 2 DESC LIMIT 8`;
    return rows.map((x) => ({ category: x.category, revenue: n(x.revenue), units: n(x.units) }));
  }

  private async topProducts(r: Range) {
    const rows = await this.prisma.$queryRaw<{ id: string; title: string; units: bigint; revenue: unknown; stock: number }[]>`
      SELECT p.id, p.title, sum(q.qty) AS units, sum(q.revenue) AS revenue, p.stock_on_hand AS stock FROM (
          SELECT i.product_id AS pid, i.quantity AS qty, i.line_total AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
           WHERE i.kind = 'PRODUCT' AND o.placed_at >= ${r.from} AND ${LIVE}
          UNION ALL
          SELECT c.product_id, c.quantity, c.allocated_revenue FROM order_item_components c
            JOIN order_items i ON i.id = c.order_item_id JOIN orders o ON o.id = i.order_id
           WHERE o.placed_at >= ${r.from} AND ${LIVE}) q
        JOIN products p ON p.id = q.pid GROUP BY p.id ORDER BY units DESC LIMIT 8`;
    return rows.map((x) => ({ id: x.id, title: x.title, units: n(x.units), revenue: n(x.revenue), stock: x.stock }));
  }

  private async topCustomers(r: Range) {
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; orders: bigint; spent: unknown }[]>`
      SELECT c.id, c.name, count(o.id) AS orders, sum(o.grand_total) AS spent
        FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.placed_at >= ${r.from} AND ${LIVE} GROUP BY c.id ORDER BY spent DESC LIMIT 6`;
    return rows.map((x) => ({ id: x.id, name: x.name, orders: n(x.orders), spent: n(x.spent) }));
  }

  private async hours(r: Range) {
    const rows = await this.prisma.$queryRaw<{ h: number; n: bigint }[]>`
      SELECT extract(hour FROM o.placed_at AT TIME ZONE 'Asia/Dhaka')::int AS h, count(*) AS n
        FROM orders o WHERE o.placed_at >= ${r.from} AND ${LIVE} GROUP BY 1`;
    const out = Array.from({ length: 24 }, () => 0);
    for (const x of rows) out[x.h] = n(x.n);
    return out;
  }

  private async weekdays(r: Range) {
    const rows = await this.prisma.$queryRaw<{ d: number; n: bigint }[]>`
      SELECT extract(dow FROM o.placed_at AT TIME ZONE 'Asia/Dhaka')::int AS d, count(*) AS n
        FROM orders o WHERE o.placed_at >= ${r.from} AND ${LIVE} GROUP BY 1`;
    const out = Array.from({ length: 7 }, () => 0); // 0 = Sunday
    for (const x of rows) out[x.d] = n(x.n);
    return out;
  }

  private async coupons(r: Range) {
    const rows = await this.prisma.$queryRaw<{ code: string; uses: bigint; discount: unknown; revenue: unknown; active: boolean }[]>`
      SELECT c.code, count(cr.id) FILTER (WHERE cr.revoked_at IS NULL) AS uses,
             coalesce(sum(cr.discount) FILTER (WHERE cr.revoked_at IS NULL),0) AS discount,
             coalesce(sum(o.grand_total) FILTER (WHERE cr.revoked_at IS NULL),0) AS revenue, c.is_active AS active
        FROM coupons c
        LEFT JOIN coupon_redemptions cr ON cr.coupon_id = c.id AND cr.created_at >= ${r.from}
        LEFT JOIN orders o ON o.id = cr.order_id
       WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY uses DESC`;
    return rows.map((x) => ({ code: x.code, uses: n(x.uses), discount: n(x.discount), revenue: n(x.revenue), active: x.active }));
  }

  private async recent() {
    const rows = await this.prisma.order.findMany({
      orderBy: { placedAt: 'desc' },
      take: 7,
      select: { id: true, orderNo: true, contactName: true, grandTotal: true, status: true, paymentMethod: true, placedAt: true },
    });
    return rows.map((o) => ({ ...o, grandTotal: n(o.grandTotal) }));
  }

  private async attention() {
    const [row] = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        (SELECT count(*) FROM orders WHERE status = 'PENDING') AS pending_orders,
        (SELECT min(placed_at) FROM orders WHERE status = 'PENDING') AS oldest_pending_at,
        (SELECT count(*) FROM orders WHERE status IN ('CONFIRMED','PROCESSING')) AS to_ship,
        (SELECT count(*) FROM conversations WHERE status IN ('OPEN','PENDING') AND last_message_from = 'CUSTOMER') AS unreplied_chats,
        (SELECT count(*) FROM products WHERE deleted_at IS NULL AND track_inventory AND stock_on_hand <= 0) AS out_of_stock,
        (SELECT count(*) FROM products WHERE deleted_at IS NULL AND track_inventory AND stock_on_hand > 0
                                          AND stock_on_hand <= coalesce(low_stock_threshold, 5)) AS low_stock,
        (SELECT coalesce(sum(grand_total - amount_paid),0) FROM orders
          WHERE payment_method = 'COD' AND payment_status = 'UNPAID' AND status IN ('HANDED_TO_COURIER','OUT_FOR_DELIVERY','DELIVERED')) AS cod_to_collect,
        (SELECT count(*) FROM product_deals WHERE cancelled_at IS NULL AND ends_at > now() AND ends_at < now() + interval '24 hours') deals_ending`;
    return {
      pendingOrders: n(row.pending_orders),
      oldestPendingAt: (row.oldest_pending_at as Date | null) ?? null,
      toShip: n(row.to_ship),
      unrepliedChats: n(row.unreplied_chats),
      outOfStock: n(row.out_of_stock),
      lowStock: n(row.low_stock),
      codToCollect: n(row.cod_to_collect),
      dealsEnding: n(row.deals_ending),
    };
  }
}
