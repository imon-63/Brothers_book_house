import type { DocumentKind, Prisma } from '@prisma/client';
import { allocate, D, toNumber, ZERO, type MoneyLike } from '@/common/utils/money';
import type { DocLine } from '../../documents/domain/document-snapshot';

type Dec = Prisma.Decimal;

/** What a paper contributes to profit (from financial_documents). */
export type PnlDoc = {
  kind: DocumentKind;
  lines: DocLine[];
  discount: MoneyLike;
  shippingFee: MoneyLike;
  shippingCost: MoneyLike;
  gatewayFee: MoneyLike;
  courierLoss: MoneyLike | null;
  reverseCourier: boolean;
};

export type Pnl = {
  sales: Dec;
  coupon: Dec;
  cogs: Dec;
  shipIn: Dec;
  courier: Dec;
  gatewayFee: Dec;
  courierLoss: Dec;
  invoices: number;
  credits: number;
  /** papers without a full cost snapshot — left out of the money figures */
  skipped: number;
};

export function emptyPnl(): Pnl {
  return { sales: ZERO, coupon: ZERO, cogs: ZERO, shipIn: ZERO, courier: ZERO, gatewayFee: ZERO, courierLoss: ZERO, invoices: 0, credits: 0, skipped: 0 };
}

function lineMoney(lines: DocLine[]) {
  let sales = ZERO;
  let cogs = ZERO;
  for (const l of lines) {
    sales = sales.plus(D(l.unitPrice).times(l.qty));
    cogs = cogs.plus(D(l.unitCost).times(l.qty));
  }
  return { sales, cogs, known: lines.length > 0 && lines.every((l) => l.unitCost != null) };
}

/**
 * Port of the storefront's `pnlFor`: invoices add, credit notes subtract.
 * The caller filters papers to the period (by issuedAt). Receipts are cash,
 * not revenue, and are ignored.
 */
export function pnlFor(docs: PnlDoc[]): Pnl {
  const out = emptyPnl();
  for (const doc of docs) {
    if (doc.kind === 'RECEIPT') continue;
    const credit = doc.kind === 'CREDIT_NOTE';
    if (credit) out.credits += 1;
    else out.invoices += 1;
    const money = lineMoney(doc.lines);
    if (!money.known) {
      out.skipped += 1;
      continue;
    }
    const sign = credit ? -1 : 1;
    out.sales = out.sales.plus(money.sales.times(sign));
    out.coupon = out.coupon.plus(D(doc.discount).times(sign));
    out.cogs = out.cogs.plus(money.cogs.times(sign));
    out.shipIn = out.shipIn.plus(D(doc.shippingFee).times(sign));
    out.gatewayFee = out.gatewayFee.plus(D(doc.gatewayFee).times(sign));
    if (!credit) out.courier = out.courier.plus(D(doc.shippingCost));
    else {
      if (doc.reverseCourier) out.courier = out.courier.minus(D(doc.shippingCost));
      out.courierLoss = out.courierLoss.plus(D(doc.courierLoss));
    }
  }
  return out;
}

export function grossOf(p: Pnl): Dec {
  return p.sales.minus(p.coupon).minus(p.cogs);
}

export function netOf(p: Pnl): Dec {
  return grossOf(p).plus(p.shipIn).minus(p.courier).minus(p.gatewayFee).minus(p.courierLoss);
}

export function marginPct(p: Pnl): number {
  return p.sales.greaterThan(0) ? grossOf(p).dividedBy(p.sales).times(100).toDecimalPlaces(0).toNumber() : 0;
}

export function pnlView(p: Pnl) {
  return {
    sales: toNumber(p.sales),
    coupon: toNumber(p.coupon),
    netSales: toNumber(p.sales.minus(p.coupon)),
    cogs: toNumber(p.cogs),
    gross: toNumber(grossOf(p)),
    marginPct: marginPct(p),
    deliveryIncome: toNumber(p.shipIn),
    courierCost: toNumber(p.courier),
    gatewayFee: toNumber(p.gatewayFee),
    courierLoss: toNumber(p.courierLoss),
    net: toNumber(netOf(p)),
    invoices: p.invoices,
    creditNotes: p.credits,
    skipped: p.skipped,
  };
}

export type CatRow = { category: string; qty: number; sales: Dec; cogs: Dec };

const OTHER = 'অন্যান্য';
const PACK = 'প্যাকেজ';

/**
 * Port of `categoryRows`: sales/COGS per category; bundles are split over
 * their component products by the bundle price allocation snapshot.
 */
export function categoryRows(docs: PnlDoc[]): CatRow[] {
  const map = new Map<string, CatRow>();
  const add = (cat: string, qty: number, sales: Dec, cogs: Dec) => {
    const row = map.get(cat) ?? { category: cat, qty: 0, sales: ZERO, cogs: ZERO };
    row.qty += qty;
    row.sales = row.sales.plus(sales);
    row.cogs = row.cogs.plus(cogs);
    map.set(cat, row);
  };
  for (const doc of docs) {
    if (doc.kind === 'RECEIPT' || !doc.lines.length) continue;
    const sign = doc.kind === 'CREDIT_NOTE' ? -1 : 1;
    for (const l of doc.lines) {
      const lineSales = D(l.unitPrice).times(l.qty);
      if (l.kind === 'BUNDLE') {
        const comps = l.components ?? [];
        if (!comps.length) {
          add(PACK, sign * l.qty, lineSales.times(sign), D(l.unitCost).times(l.qty).times(sign));
          continue;
        }
        const parts = allocate(lineSales, comps.map((c) => c.allocatedRevenue));
        comps.forEach((c, i) => {
          add(c.categoryName || OTHER, sign * c.qty, parts[i].times(sign), D(c.unitCost).times(c.qty).times(sign));
        });
        continue;
      }
      add(l.categoryName || OTHER, sign * l.qty, lineSales.times(sign), D(l.unitCost).times(l.qty).times(sign));
    }
  }
  return [...map.values()].filter((r) => r.qty !== 0 || !r.sales.isZero()).sort((a, b) => b.sales.comparedTo(a.sales));
}

export function catRowView(r: CatRow) {
  const gross = r.sales.minus(r.cogs);
  return {
    category: r.category,
    qty: r.qty,
    sales: toNumber(r.sales),
    cogs: toNumber(r.cogs),
    gross: toNumber(gross),
    marginPct: r.sales.greaterThan(0) ? gross.dividedBy(r.sales).times(100).toDecimalPlaces(0).toNumber() : 0,
  };
}

/**
 * Courier payable (port of `courierDue`): courier cost accrued on invoices,
 * minus costs reversed by credit notes, minus courier payments made.
 */
export function courierDue(docs: Pick<PnlDoc, 'kind' | 'shippingCost' | 'reverseCourier'>[], paid: MoneyLike): Dec {
  let accrued = ZERO;
  for (const d of docs) {
    if (d.kind === 'INVOICE') accrued = accrued.plus(D(d.shippingCost));
    if (d.kind === 'CREDIT_NOTE' && d.reverseCourier) accrued = accrued.minus(D(d.shippingCost));
  }
  const due = accrued.minus(D(paid));
  return due.isNegative() ? ZERO : due;
}
