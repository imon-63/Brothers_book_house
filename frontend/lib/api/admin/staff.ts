"use client";

/** স্টাফ — /admin/staff (list, create, role, enable/disable, reset password) */

import { useQuery } from "@tanstack/react-query";
import { get, patch, post } from "@/lib/api/client";
import { adminKeys, useAdminMutation } from "./core";

export type StaffRole = "OWNER" | "ADMIN" | "MANAGER" | "SUPPORT" | "ACCOUNTANT" | "WAREHOUSE";
export type StaffMember = { id: string; name: string; email: string | null; phone: string | null; role: StaffRole; status: string; lastLoginAt: string | null; createdAt: string };

export function useStaff() {
  return useQuery({ queryKey: [...adminKeys.staff, "list"], queryFn: () => get<StaffMember[]>("/admin/staff") });
}
export function useCreateStaff() {
  return useAdminMutation<{ name: string; email: string; role: StaffRole }, { tempPassword?: string }>({
    fn: (body) => post("/admin/staff", body),
    invalidate: [adminKeys.staff],
    success: "স্টাফ যোগ হয়েছে",
  });
}
export function useSetStaffRole() {
  return useAdminMutation<{ id: string; role: StaffRole }, unknown>({
    fn: ({ id, role }) => patch(`/admin/staff/${id}/role`, { role }),
    invalidate: [adminKeys.staff],
    success: "রোল বদলেছে",
  });
}
export function useSetStaffEnabled() {
  return useAdminMutation<{ id: string; enabled: boolean }, unknown>({
    fn: ({ id, enabled }) => patch(`/admin/staff/${id}/enabled`, { enabled }),
    invalidate: [adminKeys.staff],
    success: (_d, v) => (v.enabled ? "অ্যাকাউন্ট চালু" : "অ্যাকাউন্ট বন্ধ"),
  });
}
export function useResetStaffPassword() {
  return useAdminMutation<{ id: string }, { tempPassword: string }>({
    fn: ({ id }) => post(`/admin/staff/${id}/reset-password`),
    invalidate: [adminKeys.staff],
  });
}
