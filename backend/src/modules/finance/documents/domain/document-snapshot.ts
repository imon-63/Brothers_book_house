import type { OrderItemKind, PaymentMethod } from '@prisma/client';
import { D, percentOf, round2, sum, type MoneyLike } from '@/common/utils/money';

/**
 * Immutable line snapshot stored in financial_documents.lines. Money is kept as
 * 2dp strings so JSON never turns it into a float.
 */
export type DocComponent = {
  productId: string;
  title: string;
  categoryName: string | null;
  qty: number;
  unitCost: string | null;
  allocatedRevenue: string;
};

export type DocLine = {
  kind: OrderItemKind;
  id: string;
  title: string;
  sectionCode: string;
  categoryName: string | null;
  qty: number;
  unitPrice: string;
  /** null → cost unknown; the paper is skipped in profit maths */
  unitCost: string | null;
  discount: string;
  lineTotal: string;
  components?: DocComponent[];
};

export type SnapshotItem = {
  kind: OrderItemKind;
  productId: string | null;
  bundleId: string | null;
  title: string;
  sectionCode: string;
  categoryName: string | null;
  quantity: number;
  unitPrice: MoneyLike;
  unitCost: MoneyLike | null;
  discount: MoneyLike;
  lineTotal: MoneyLike;
  components: {
    productId: string;
    title: string;
    categoryName: string | null;
    quantity: number;
    unitCost: MoneyLike | null;
    allocatedRevenue: MoneyLike;
  }[];
};

const s2 = (v: MoneyLike) => round2(v).toFixed(2);

/**
 * Unit cost of a line. A bundle without its own cost is costed from its
 * components (component quantities are the units that left the shelf for the
 * whole line, so the per-bundle cost is Σ(cost × qty) / line qty).
 */
export function lineUnitCost(item: SnapshotItem): string | null {
  if (item.unitCost != null) return s2(item.unitCost);
  if (item.kind !== 'BUNDLE' || !item.components.length) return null;
  if (item.components.some((c) => c.unitCost == null)) return null;
  const total = sum(item.components.map((c) => D(c.unitCost).times(c.quantity)));
  return s2(total.dividedBy(Math.max(1, item.quantity)));
}

export function buildLines(items: SnapshotItem[]): DocLine[] {
  return items.map((it) => {
    const line: DocLine = {
      kind: it.kind,
      id: (it.kind === 'BUNDLE' ? it.bundleId : it.productId) ?? '',
      title: it.title,
      sectionCode: it.sectionCode,
      categoryName: it.categoryName,
      qty: it.quantity,
      unitPrice: s2(it.unitPrice),
      unitCost: lineUnitCost(it),
      discount: s2(it.discount),
      lineTotal: s2(it.lineTotal),
    };
    if (it.kind === 'BUNDLE' && it.components.length) {
      line.components = it.components.map((c) => ({
        productId: c.productId,
        title: c.title,
        categoryName: c.categoryName,
        qty: c.quantity,
        unitCost: c.unitCost == null ? null : s2(c.unitCost),
        allocatedRevenue: s2(c.allocatedRevenue),
      }));
    }
    return line;
  });
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  COD: 'ক্যাশ অন ডেলিভারি',
  SSLCOMMERZ: 'SSLCOMMERZ (অনলাইন)',
  BKASH: 'বিকাশ',
  NAGAD: 'নগদ',
  BANK_TRANSFER: 'ব্যাংক ট্রান্সফার',
  CASH: 'ক্যাশ',
};

export function addressLine(a: { shipLine: string; shipUnion?: string | null; shipUpazila?: string | null; shipDistrict: string; shipDivision: string }): string {
  return [a.shipLine, a.shipUnion, a.shipUpazila, a.shipDistrict, a.shipDivision]
    .map((x) => x?.trim())
    .filter((x): x is string => Boolean(x))
    .join(', ');
}

/**
 * Gateway fee on the paper: the real fee SSLCOMMERZ charged (sum of successful
 * payments) when known, otherwise the configured percentage of the total.
 * Non-gateway methods carry no fee.
 */
export function gatewayFeeFor(method: PaymentMethod, total: MoneyLike, paidFees: MoneyLike[], feePct: MoneyLike): string {
  if (method !== 'SSLCOMMERZ') return '0.00';
  if (paidFees.length) return s2(sum(paidFees));
  return s2(percentOf(total, feePct));
}
