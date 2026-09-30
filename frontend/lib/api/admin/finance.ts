"use client";

/** হিসাব — /admin/finance/{accounts,cashbook,suppliers,purchases,reports} */

import { useQuery } from "@tanstack/react-query";
import { download, get, post } from "@/lib/api/client";
import { adminKeys, isoDay, useAdminMutation, type Paged } from "./core";

const k = adminKeys.finance;

export type ReportPeriod = { period: "day" | "month" | "year" | "custom"; date?: string; from?: string; to?: string };

export type CashAccount = { id: string; code: string; name: string; type: string; accountNo: string | null; isActive: boolean; openingBalance: number; balance: number };
export type CashEntry = {
  id: string; account: { id: string; code: string; name: string }; direction: "IN" | "OUT"; kind: string; kindLabel: string; amount: number; signedAmount: number;
  memo: string; orderId: string | null; purchaseId: string | null; reversesId: string | null; reversedById: string | null; occurredAt: string;
};
export type DayClose = { date: string; opening: number; in: number; out: number; closing: number; accounts: { account: { id: string; name: string }; opening: number; in: number; out: number; closing: number }[]; entries: CashEntry[] };
export type FinanceSummary = {
  period: string; from: string; to: string; billed: number; invoices: number; creditNotes: number; cashInHand: number;
  accounts: { id: string; code: string; name: string; balance: number }[];
  codDue: number; codDueOrders: number; codWithCourier: number; stockValue: number; stockUnits: number; supplierDue: number; courierDue: number;
  missingCostProducts: number; gross: number; net: number; skipped: number; last14Days: { day: string; billed: number }[];
};
export type Pnl = {
  period: string; from: string; to: string; sales: number; coupon: number; netSales: number; cogs: number; gross: number; marginPct: number;
  deliveryIncome: number; courierCost: number; gatewayFee: number; courierLoss: number; net: number; invoices: number; creditNotes: number;
  skipped: number; missingCostProducts: number; costsReady: boolean;
};
export type CategoryReport = { items: { category: string; qty: number; sales: number; cogs: number; gross: number; marginPct: number }[] };
export type Supplier = { id: string; name: string; phone: string | null };
export type Purchase = {
  id: string; purchaseNo: string; supplier: { id: string; name: string }; status: string; paymentStatus: "PAID" | "PARTIAL" | "UNPAID" | string;
  total: number; amountPaid: number; due: number; note: string | null; purchasedAt: string;
  items: { id: string; productId: string; title: string; quantity: number; unitCost: number; lineTotal: number }[];
};

export function useCashAccounts() {
  return useQuery({ queryKey: [...k, "accounts"], queryFn: () => get<{ items: CashAccount[]; totalBalance: number }>("/admin/finance/accounts") });
}
export function useFinanceSummary(p: ReportPeriod) {
  return useQuery({ queryKey: [...k, "summary", p], placeholderData: (x) => x, queryFn: () => get<FinanceSummary>("/admin/finance/reports/summary", p) });
}
export function usePnl(p: ReportPeriod) {
  return useQuery({ queryKey: [...k, "pnl", p], placeholderData: (x) => x, queryFn: () => get<Pnl>("/admin/finance/reports/pnl", p) });
}
export function useCategoryReport(p: ReportPeriod) {
  return useQuery({ queryKey: [...k, "cats", p], placeholderData: (x) => x, queryFn: () => get<CategoryReport>("/admin/finance/reports/categories", p) });
}
export function useDayClose(date: string, accountId?: string) {
  return useQuery({ queryKey: [...k, "day", date, accountId], queryFn: () => get<DayClose>("/admin/finance/cashbook/day-close", { date, accountId }) });
}
export function useSuppliers() {
  return useQuery({ queryKey: [...k, "suppliers"], queryFn: () => get<Paged<Supplier>>("/admin/finance/suppliers", { pageSize: 100 }) });
}
export function usePurchases() {
  return useQuery({ queryKey: [...k, "purchases"], queryFn: () => get<Paged<Purchase>>("/admin/finance/purchases", { pageSize: 50 }) });
}

/** Small product picker for the purchase form (does not import the products tab). */
export function useProductPicker(q: string) {
  return useQuery({
    queryKey: [...adminKeys.products, "picker", q],
    placeholderData: (x) => x,
    queryFn: async () => (await get<Paged<{ id: string; title: string; costPrice: number | null; section: { name: string } }>>("/admin/products", { q: q || undefined, pageSize: 50, sort: "name", order: "asc" })).items,
  });
}

/** Confirmed orders for the summary table (server-side range / paid filters). */
export function useFinanceOrders(range: "today" | "7" | "30" | "all", pay: "all" | "got" | "due") {
  return useQuery({
    queryKey: [...k, "orders", range, pay],
    placeholderData: (x) => x,
    queryFn: () => get<Paged<{ id: string; orderNo: string; paymentMethod: string; paymentStatus: string; grandTotal: number; status: string; shipment: unknown }>>("/admin/orders", {
      tab: "all", range, paid: pay === "got" ? "paid" : pay === "due" ? "due" : undefined, pageSize: 100,
      status: ["CONFIRMED", "PROCESSING", "HANDED_TO_COURIER", "OUT_FOR_DELIVERY", "DELIVERED"],
    }),
  });
}

const fallout = [k, ["admin", "dashboard"], adminKeys.documents];

export function useManualEntry() {
  return useAdminMutation<{ accountId: string; direction: "IN" | "OUT"; amount: number; memo: string; occurredAt?: string; kind?: string; expenseCategory?: string }, unknown>({
    fn: (body) => post("/admin/finance/cashbook/entries", { kind: "MANUAL", ...body }),
    invalidate: fallout,
    success: "ক্যাশবুক এন্ট্রি বসেছে",
  });
}
export function useReverseEntry() {
  return useAdminMutation<{ id: string; reason: string }, unknown>({
    fn: ({ id, reason }) => post(`/admin/finance/cashbook/entries/${id}/reverse`, { reason }),
    invalidate: fallout,
    success: "এন্ট্রি উল্টে দেওয়া হয়েছে",
  });
}
export function useCourierPayment() {
  return useAdminMutation<{ orderId: string; accountId: string; occurredAt?: string }, unknown>({
    fn: (body) => post("/admin/finance/cashbook/courier-payments", body),
    invalidate: fallout,
    success: "কুরিয়ার পরিশোধ ক্যাশবুকে",
  });
}
export function useCreateSupplier() {
  return useAdminMutation<{ name: string }, Supplier>({ fn: (body) => post<Supplier>("/admin/finance/suppliers", body), invalidate: [[...k, "suppliers"]] });
}
export function useCreatePurchase() {
  return useAdminMutation<{ supplierId: string; purchasedAt?: string; lines: { productId: string; quantity: number; unitCost: number }[]; note?: string; payment?: { accountId: string }; toast: string }, Purchase>({
    fn: ({ toast: _t, ...body }) => post<Purchase>("/admin/finance/purchases", body),
    invalidate: [...fallout, adminKeys.products],
    success: (_d, v) => v.toast,
  });
}
export function usePayPurchase() {
  return useAdminMutation<{ id: string; accountId: string; amount: number }, unknown>({
    fn: ({ id, ...body }) => post(`/admin/finance/purchases/${id}/payments`, body),
    invalidate: fallout,
    success: "সাপ্লায়ারকে পরিশোধ হয়েছে",
  });
}

export function exportFinance(kind: "pnl" | "cashbook" | "documents", p: ReportPeriod) {
  return download(`/admin/finance/reports/${kind}.csv`, `cholo-${kind}-${isoDay()}.csv`, p);
}
