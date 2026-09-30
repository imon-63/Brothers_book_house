"use client";

/** ড্যাশবোর্ড — GET /admin/reports/dashboard?period=today|7d|30d|90d */

import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api/client";
import { adminKeys } from "./core";

export type DashPeriod = "today" | "7d" | "30d" | "90d";
export type Kpi = { value: number; delta: number | null };

export type Dashboard = {
  period: DashPeriod;
  range: { from: string; to: string };
  kpis: {
    revenue: Kpi;
    orders: Kpi;
    aov: Kpi;
    grossProfit: Kpi & { unknownCostOrders: number };
    newCustomers: Kpi;
    pending: { value: number; oldestAt: string | null };
  };
  /** `t` is a Dhaka wall-clock bucket start encoded as UTC (read it with timeZone "UTC"). */
  series: { t: string; revenue: number; orders: number }[];
  pipeline: Partial<Record<string, number>>;
  payments: { method: string; paid: boolean; orders: number; total: number }[];
  sections: { section: string; revenue: number; units: number; orders: number }[];
  categories: { category: string | null; revenue: number; units: number }[];
  topProducts: { id: string; title: string; units: number; revenue: number; stock: number }[];
  topCustomers: { id: string; name: string; orders: number; spent: number }[];
  hours: number[];
  /** 0 = Sunday */
  weekdays: number[];
  coupons: { code: string; uses: number; discount: number; revenue: number; active: boolean }[];
  recentOrders: { id: string; orderNo: string; contactName: string | null; grandTotal: number; status: string; paymentMethod: string; placedAt: string }[];
  attention: {
    pendingOrders: number;
    oldestPendingAt: string | null;
    toShip: number;
    unrepliedChats: number;
    outOfStock: number;
    lowStock: number;
    /** ৳ amount (not a count) */
    codToCollect: number;
    dealsEnding: number;
  };
};

export function useDashboard(period: DashPeriod) {
  return useQuery({
    queryKey: adminKeys.dashboard(period),
    queryFn: () => get<Dashboard>("/admin/reports/dashboard", { period }),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Attention counters for the shell badges / bell (cheap: shares the "today" dashboard cache). */
export function useAttention() {
  const q = useQuery({
    queryKey: adminKeys.dashboard("today"),
    queryFn: () => get<Dashboard>("/admin/reports/dashboard", { period: "today" }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return q.data?.attention ?? null;
}

/** Coupon definitions (type/value) for the dashboard coupon card. */
export type CouponDef = { id: string; code: string; type: "PERCENT" | "FIXED" | string; value: number; isActive: boolean };
export function useCouponDefs() {
  return useQuery({
    queryKey: [...adminKeys.coupons, "defs"],
    staleTime: 5 * 60_000,
    queryFn: async () => (await get<{ items: CouponDef[] }>("/admin/coupons", { pageSize: 100 })).items,
  });
}
