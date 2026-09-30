import type { Prisma, Purchase, PurchaseItem, Supplier } from '@prisma/client';
import { toNumber } from '@/common/utils/money';
import { outstanding } from '../domain/purchase-math';

export function toSupplier(s: Supplier, due?: number) {
  return {
    id: s.id,
    name: s.name,
    phone: s.phone,
    email: s.email,
    address: s.address,
    note: s.note,
    createdAt: s.createdAt,
    ...(due !== undefined ? { due } : {}),
  };
}

type PurchaseRow = Purchase & {
  supplier?: Pick<Supplier, 'id' | 'name'> | null;
  items?: PurchaseItem[];
  payments?: { id: string; amount: Prisma.Decimal; direction: string; occurredAt: Date; memo: string; account: { name: string } }[];
};

export function toPurchase(p: PurchaseRow) {
  return {
    id: p.id,
    purchaseNo: p.purchaseNo,
    supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : { id: p.supplierId },
    status: p.status,
    paymentStatus: p.paymentStatus,
    subtotal: toNumber(p.subtotal),
    otherCharges: toNumber(p.otherCharges),
    total: toNumber(p.total),
    amountPaid: toNumber(p.amountPaid),
    due: toNumber(outstanding(p.total, p.amountPaid)),
    invoiceRef: p.invoiceRef,
    note: p.note,
    purchasedAt: p.purchasedAt,
    receivedAt: p.receivedAt,
    createdAt: p.createdAt,
    items: p.items?.map((i) => ({ id: i.id, productId: i.productId, title: i.title, quantity: i.quantity, unitCost: toNumber(i.unitCost), lineTotal: toNumber(i.lineTotal) })),
    payments: p.payments?.map((c) => ({ id: c.id, amount: toNumber(c.amount), direction: c.direction, occurredAt: c.occurredAt, memo: c.memo, account: c.account.name })),
  };
}
