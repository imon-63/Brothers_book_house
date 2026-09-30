import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/common/errors/domain.error';
import type { AuthUser } from '@/common/types/auth-user';
import { D, toNumber } from '@/common/utils/money';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Traced } from '@/infrastructure/telemetry/traced.decorator';
import { AuditService } from '@/platform/audit/audit.service';
import { CashAccountsService } from '../../cashbook/application/cash-accounts.service';
import { CashbookService } from '../../cashbook/application/cashbook.service';
import { KIND_LABEL } from '../../cashbook/domain/cash-math';
import { DOC_TITLE } from '../../documents/domain/document-html';
import { docLines } from '../../documents/mappers/document.mapper';
import { daySpan, dhakaDay, tenureRange, type Range } from '../../shared/domain/dhaka-time';
import { toCsv } from '../domain/csv';
import { catRowView, categoryRows, pnlFor, pnlView, type PnlDoc } from '../domain/pnl';
import type { CashbookExportQueryDto, DocumentsExportQueryDto, ReportQueryDto } from '../dto/reports.dto';

const MAX_CUSTOM_DAYS = 800;

export function resolveRange(q: ReportQueryDto): Range & { period: string; from: string; to: string } {
  const period = q.period ?? 'month';
  let r: Range;
  if (period === 'custom') {
    if (!q.from || !q.to) throw new BusinessRuleError('report.range_required', 'কাস্টম সময়ের জন্য শুরু ও শেষের তারিখ দিন');
    if (q.from > q.to) throw new BusinessRuleError('report.range_invalid', 'শুরুর তারিখ শেষের পরে হতে পারে না');
    r = daySpan(q.from, q.to);
    if (r.end.getTime() - r.start.getTime() > MAX_CUSTOM_DAYS * 86_400_000) throw new BusinessRuleError('report.range_too_long', 'সময়সীমা বেশি লম্বা');
  } else {
    r = tenureRange(period, q.date ?? dhakaDay());
  }
  return { ...r, period, from: dhakaDay(r.start), to: dhakaDay(new Date(r.end.getTime() - 1)) };
}

@Injectable()
export class FinanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: CashAccountsService,
    private readonly cashbook: CashbookService,
    private readonly audit: AuditService,
  ) {}

  private async pnlDocs(r: Range): Promise<PnlDoc[]> {
    const rows = await this.prisma.financialDocument.findMany({
      where: { kind: { in: ['INVOICE', 'CREDIT_NOTE'] }, issuedAt: { gte: r.start, lt: r.end } },
      select: { kind: true, lines: true, discount: true, shippingFee: true, shippingCost: true, gatewayFee: true, courierLoss: true, reverseCourier: true },
    });
    return rows.map((d) => ({ ...d, lines: docLines(d as never) }));
  }

  /** লাভ-ক্ষতি from immutable papers (invoices − credit notes), like the storefront's pnlFor. */
  @Traced('finance.reports.pnl')
  async pnl(q: ReportQueryDto) {
    const range = resolveRange(q);
    const docs = await this.pnlDocs(range);
    const missingCost = await this.missingCostCount();
    return {
      period: range.period,
      from: range.from,
      to: range.to,
      ...pnlView(pnlFor(docs)),
      missingCostProducts: missingCost,
      costsReady: missingCost === 0,
    };
  }

  async categories(q: ReportQueryDto) {
    const range = resolveRange(q);
    const rows = categoryRows(await this.pnlDocs(range)).map(catRowView);
    return { period: range.period, from: range.from, to: range.to, items: rows };
  }

  /** সারাংশ KPIs. */
  @Traced('finance.reports.summary')
  async summary(q: ReportQueryDto) {
    const range = resolveRange(q);
    const [billedRows, balances, cod, courierHeld, stock, payables, missingCost, docs] = await Promise.all([
      this.prisma.financialDocument.groupBy({
        by: ['kind'],
        where: { kind: { in: ['INVOICE', 'CREDIT_NOTE'] }, issuedAt: { gte: range.start, lt: range.end } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.accounts.list(),
      this.prisma.$queryRaw<{ n: bigint; due: Prisma.Decimal | null }[]>`
        SELECT COUNT(*) AS n, COALESCE(SUM(grand_total - amount_paid), 0) AS due
          FROM orders
         WHERE payment_method IN ('COD', 'CASH') AND payment_status = 'UNPAID'
           AND status IN ('CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY')`,
      this.prisma.$queryRaw<{ n: bigint; due: Prisma.Decimal | null }[]>`
        SELECT COUNT(*) AS n, COALESCE(SUM(cod_amount), 0) AS due
          FROM shipments WHERE cod_status IN ('PENDING', 'COLLECTED') AND status = 'DELIVERED'`,
      this.prisma.$queryRaw<{ value: Prisma.Decimal | null; units: bigint | null }[]>`
        SELECT COALESCE(SUM(stock_value), 0) AS value, COALESCE(SUM(stock_on_hand), 0) AS units FROM v_product_stock`,
      this.cashbook.payables(),
      this.missingCostCount(),
      this.pnlDocs(range),
    ]);
    const inv = billedRows.find((r) => r.kind === 'INVOICE');
    const crn = billedRows.find((r) => r.kind === 'CREDIT_NOTE');
    const pnl = pnlView(pnlFor(docs));
    return {
      period: range.period,
      from: range.from,
      to: range.to,
      billed: toNumber(D(inv?._sum.total).minus(D(crn?._sum.total))),
      invoices: inv?._count._all ?? 0,
      creditNotes: crn?._count._all ?? 0,
      cashInHand: balances.totalBalance,
      accounts: balances.items.map((a) => ({ id: a.id, code: a.code, name: a.name, balance: a.balance })),
      codDue: toNumber(cod[0]?.due),
      codDueOrders: Number(cod[0]?.n ?? 0),
      codWithCourier: toNumber(courierHeld[0]?.due),
      codWithCourierShipments: Number(courierHeld[0]?.n ?? 0),
      stockValue: toNumber(stock[0]?.value),
      stockUnits: Number(stock[0]?.units ?? 0),
      supplierDue: payables.supplierDue,
      courierDue: payables.courierDue,
      missingCostProducts: missingCost,
      gross: pnl.gross,
      net: pnl.net,
      skipped: pnl.skipped,
      last14Days: await this.spark(),
    };
  }

  /** Billed per Dhaka day for the last 14 days (invoices − credit notes). */
  private async spark() {
    const end = tenureRange('day').end;
    const start = new Date(end.getTime() - 14 * 86_400_000);
    const rows = await this.prisma.$queryRaw<{ day: string; billed: Prisma.Decimal | null }[]>`
      SELECT to_char((issued_at AT TIME ZONE 'Asia/Dhaka')::date, 'YYYY-MM-DD') AS day,
             SUM(CASE WHEN kind = 'INVOICE' THEN total ELSE -total END) AS billed
        FROM financial_documents
       WHERE kind IN ('INVOICE', 'CREDIT_NOTE') AND issued_at >= ${start} AND issued_at < ${end}
    GROUP BY 1`;
    const map = new Map(rows.map((r) => [r.day, toNumber(r.billed)]));
    return Array.from({ length: 14 }, (_, i) => {
      const day = dhakaDay(new Date(start.getTime() + i * 86_400_000 + 3_600_000));
      return { day, billed: map.get(day) ?? 0 };
    });
  }

  private missingCostCount() {
    return this.prisma.product.count({ where: { deletedAt: null, status: 'ACTIVE', OR: [{ costPrice: null }, { costPrice: { lte: 0 } }] } });
  }

  // ─────────── CSV ───────────

  async pnlCsv(q: ReportQueryDto, actor: AuthUser) {
    const p = await this.pnl(q);
    const cats = await this.categories(q);
    const head = ['section', 'metric', 'value'];
    const rows: (string | number)[][] = [
      ['pnl', 'from', p.from],
      ['pnl', 'to', p.to],
      ['pnl', 'বিক্রি (sales)', p.sales],
      ['pnl', 'কুপন (coupon)', p.coupon],
      ['pnl', 'কেনা দাম (cogs)', p.cogs],
      ['pnl', 'গ্রস (gross)', p.gross],
      ['pnl', 'ডেলিভারি আয় (delivery income)', p.deliveryIncome],
      ['pnl', 'কুরিয়ার (courier)', p.courierCost],
      ['pnl', 'SSL ফি (gateway fee)', p.gatewayFee],
      ['pnl', 'কুরিয়ার লস (courier loss)', p.courierLoss],
      ['pnl', 'নেট (net)', p.net],
      ['pnl', 'invoices', p.invoices],
      ['pnl', 'credit notes', p.creditNotes],
      ['pnl', 'skipped (no cost snapshot)', p.skipped],
      ...cats.items.flatMap((c) => [
        ['category', `${c.category} · qty`, c.qty],
        ['category', `${c.category} · sales`, c.sales],
        ['category', `${c.category} · cogs`, c.cogs],
        ['category', `${c.category} · gross`, c.gross],
      ]),
    ];
    await this.logExport(actor, 'pnl', p.from, p.to);
    return { filename: `cholo-pnl-${p.from}_${p.to}.csv`, body: toCsv(head, rows) };
  }

  async cashbookCsv(q: CashbookExportQueryDto, actor: AuthUser) {
    const range = resolveRange(q);
    const rows = await this.prisma.cashTransaction.findMany({
      where: { occurredAt: { gte: range.start, lt: range.end }, accountId: q.accountId, kind: q.kind },
      include: { account: { select: { code: true, name: true } }, order: { select: { orderNo: true } }, purchase: { select: { purchaseNo: true } } },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
      take: 50_000,
    });
    const body = toCsv(
      ['occurred_at', 'day', 'account', 'direction', 'kind', 'amount', 'memo', 'expense_category', 'order', 'purchase', 'reverses_id', 'id'],
      rows.map((t) => [t.occurredAt, dhakaDay(t.occurredAt), t.account.name, t.direction, KIND_LABEL[t.kind], toNumber(t.amount), t.memo, t.expenseCategory, t.order?.orderNo, t.purchase?.purchaseNo, t.reversesId, t.id]),
    );
    await this.logExport(actor, 'cashbook', range.from, range.to);
    return { filename: `cholo-cashbook-${range.from}_${range.to}.csv`, body };
  }

  async documentsCsv(q: DocumentsExportQueryDto, actor: AuthUser) {
    const range = resolveRange(q);
    const rows = await this.prisma.financialDocument.findMany({
      where: { issuedAt: { gte: range.start, lt: range.end }, kind: q.kind },
      include: { order: { select: { orderNo: true } }, credits: { select: { docNo: true } } },
      orderBy: [{ issuedAt: 'asc' }, { docNo: 'asc' }],
      take: 50_000,
    });
    const body = toCsv(
      ['doc_no', 'kind', 'issued_at', 'order', 'customer', 'phone', 'payment', 'subtotal', 'discount', 'shipping_fee', 'courier_cost', 'gateway_fee', 'total', 'credits', 'reason', 'courier_loss', 'reverse_courier'],
      rows.map((d) => [
        d.docNo,
        DOC_TITLE[d.kind],
        d.issuedAt,
        d.order.orderNo,
        d.customerName,
        d.customerPhone,
        d.paymentLabel,
        toNumber(d.subtotal),
        toNumber(d.discount),
        toNumber(d.shippingFee),
        toNumber(d.shippingCost),
        toNumber(d.gatewayFee),
        toNumber(d.total),
        d.credits?.docNo,
        d.reason,
        d.courierLoss == null ? null : toNumber(d.courierLoss),
        d.reverseCourier,
      ]),
    );
    await this.logExport(actor, 'documents', range.from, range.to);
    return { filename: `cholo-documents-${range.from}_${range.to}.csv`, body };
  }

  private logExport(actor: AuthUser, what: string, from: string, to: string) {
    return this.audit.record({ actor, action: 'EXPORT', area: 'finance', entityType: 'Report', entityId: what, summary: `হিসাব এক্সপোর্ট: ${what} (${from} → ${to})` });
  }
}
