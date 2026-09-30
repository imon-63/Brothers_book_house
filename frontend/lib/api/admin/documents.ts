"use client";

/** Invoices / receipts / credit notes — /admin/documents (list, detail, printable HTML). */

import { useQuery } from "@tanstack/react-query";
import { api, get, post } from "@/lib/api/client";
import { adminKeys, useAdminMutation, type Paged } from "./core";

export type DocKind = "INVOICE" | "RECEIPT" | "CREDIT_NOTE" | string;
export type AdminDocument = {
  id: string;
  docNo: string;
  kind: DocKind;
  kindLabel: string;
  orderId: string | null;
  orderNo: string | null;
  customerName: string | null;
  customerPhone: string | null;
  paymentLabel: string | null;
  total: number;
  issuedAt: string;
};

export type DocumentQuery = { page?: number; pageSize?: number; q?: string; kind?: string; orderId?: string; from?: string; to?: string };

export function useDocuments(query: DocumentQuery, enabled = true) {
  return useQuery({
    queryKey: [...adminKeys.documents, "list", query],
    enabled,
    placeholderData: (prev) => prev,
    queryFn: () => get<Paged<AdminDocument>>("/admin/documents", query),
  });
}

/** Printable HTML of one document (fetched with auth, rendered via iframe srcDoc). */
export function useDocumentHtml(id: string | null | undefined) {
  return useQuery({
    queryKey: [...adminKeys.documents, "html", id],
    enabled: !!id,
    staleTime: 10 * 60_000,
    queryFn: () => api<string>(`/admin/documents/${id}/html`, { headers: { accept: "text/html" } }),
  });
}

export function useResyncDocuments() {
  return useAdminMutation<{ orderId: string }, unknown>({
    fn: ({ orderId }) => post(`/admin/documents/resync/${orderId}`),
    invalidate: [adminKeys.documents, adminKeys.orders],
    success: "কাগজ আবার তৈরি হয়েছে",
  });
}
