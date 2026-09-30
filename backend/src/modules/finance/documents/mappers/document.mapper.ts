import type { FinancialDocument } from '@prisma/client';
import { toNumber } from '@/common/utils/money';
import { DOC_TITLE, type PrintableDocument } from '../domain/document-html';
import type { DocLine } from '../domain/document-snapshot';

type DocRow = FinancialDocument & {
  order?: { orderNo: string; paymentMethod: string } | null;
  credits?: { id: string; docNo: string } | null;
  creditedBy?: { id: string; docNo: string }[];
};

export function docLines(d: FinancialDocument): DocLine[] {
  return Array.isArray(d.lines) ? (d.lines as unknown as DocLine[]) : [];
}

export function toDocumentSummary(d: DocRow) {
  return {
    id: d.id,
    docNo: d.docNo,
    kind: d.kind,
    kindLabel: DOC_TITLE[d.kind],
    orderId: d.orderId,
    orderNo: d.order?.orderNo ?? null,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    paymentLabel: d.paymentLabel,
    total: toNumber(d.total),
    issuedAt: d.issuedAt,
  };
}

export function toDocumentDetail(d: DocRow) {
  return {
    ...toDocumentSummary(d),
    address: d.address,
    lines: docLines(d).map((l) => ({
      ...l,
      unitPrice: Number(l.unitPrice),
      unitCost: l.unitCost == null ? null : Number(l.unitCost),
      discount: Number(l.discount),
      lineTotal: Number(l.lineTotal),
      components: l.components?.map((c) => ({ ...c, unitCost: c.unitCost == null ? null : Number(c.unitCost), allocatedRevenue: Number(c.allocatedRevenue) })),
    })),
    subtotal: toNumber(d.subtotal),
    couponCode: d.couponCode,
    discount: toNumber(d.discount),
    shippingFee: toNumber(d.shippingFee),
    shippingCost: toNumber(d.shippingCost),
    gatewayFee: toNumber(d.gatewayFee),
    taxTotal: toNumber(d.taxTotal),
    reason: d.reason,
    courierLoss: d.courierLoss == null ? null : toNumber(d.courierLoss),
    reverseCourier: d.reverseCourier,
    credits: d.credits ? { id: d.credits.id, docNo: d.credits.docNo } : null,
    creditedBy: d.creditedBy?.map((c) => ({ id: c.id, docNo: c.docNo })) ?? [],
    issuedById: d.issuedById,
  };
}

export function toPrintable(d: DocRow): PrintableDocument {
  return {
    kind: d.kind,
    docNo: d.docNo,
    orderNo: d.order?.orderNo ?? '',
    issuedAt: d.issuedAt,
    paymentLabel: d.paymentLabel,
    paymentMethod: d.order?.paymentMethod ?? '',
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    address: d.address,
    lines: docLines(d),
    subtotal: d.subtotal,
    couponCode: d.couponCode,
    discount: d.discount,
    shippingFee: d.shippingFee,
    taxTotal: d.taxTotal,
    total: d.total,
    gatewayFee: d.gatewayFee,
    reason: d.reason,
    courierLoss: d.courierLoss,
    reverseCourier: d.reverseCourier,
    creditsDocNo: d.credits?.docNo ?? null,
  };
}
