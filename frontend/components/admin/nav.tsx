"use client";

import { createContext, useContext } from "react";

export type AdminTab =
  | "dashboard" | "orders" | "customers" | "chat"
  | "products" | "packs" | "cats" | "home"
  | "finance" | "activity" | "settings";

export type AdminNav = {
  tab: AdminTab;
  /** optional record to open on arrival: order id, customer phone, product id */
  focus: string | null;
  go: (tab: AdminTab, focus?: string | null) => void;
  clearFocus: () => void;
};

export const AdminNavContext = createContext<AdminNav>({
  tab: "dashboard",
  focus: null,
  go: () => undefined,
  clearFocus: () => undefined,
});

export function useAdminNav() {
  return useContext(AdminNavContext);
}

export const NAV_GROUPS: { label: string; items: { id: AdminTab; bn: string; en: string }[] }[] = [
  { label: "Overview", items: [{ id: "dashboard", bn: "ড্যাশবোর্ড", en: "Dashboard" }] },
  {
    label: "Sales · বিক্রি",
    items: [
      { id: "orders", bn: "অর্ডার", en: "Orders" },
      { id: "customers", bn: "কাস্টমার", en: "Customers" },
      { id: "chat", bn: "চ্যাট", en: "Inbox" },
    ],
  },
  {
    label: "Catalog · ক্যাটালগ",
    items: [
      { id: "products", bn: "পণ্য", en: "Products" },
      { id: "packs", bn: "প্যাকেজ", en: "Bundles" },
      { id: "cats", bn: "ক্যাটাগরি", en: "Categories" },
      { id: "home", bn: "হোম পেজ", en: "Home layout" },
    ],
  },
  {
    label: "Money · হিসাব",
    items: [{ id: "finance", bn: "হিসাব", en: "Finance" }],
  },
  {
    label: "System",
    items: [
      { id: "activity", bn: "অ্যাক্টিভিটি", en: "Activity log" },
      { id: "settings", bn: "সেটিংস", en: "Settings" },
    ],
  },
];

export const TAB_META: Record<AdminTab, { bn: string; en: string; sub: string }> = {
  dashboard: { bn: "ড্যাশবোর্ড", en: "Dashboard", sub: "আজকের ব্যবসার পুরো ছবি · Overview" },
  orders: { bn: "অর্ডার", en: "Orders", sub: "কনফার্ম, প্যাকিং, কুরিয়ার, ডেলিভারি · Fulfilment" },
  customers: { bn: "কাস্টমার", en: "Customers", sub: "কে কিনছে, কত কিনছে · CRM" },
  chat: { bn: "চ্যাট", en: "Inbox", sub: "গ্রাহকের বার্তার জবাব · Support" },
  products: { bn: "পণ্য", en: "Products", sub: "দাম, স্টক, ছাড় · Inventory" },
  packs: { bn: "প্যাকেজ", en: "Bundles", sub: "বইয়ের বান্ডেল অফার" },
  cats: { bn: "ক্যাটাগরি", en: "Categories", sub: "ক্যাটাগরি ও সাব-ক্যাটাগরি সাজান" },
  home: { bn: "হোম পেজ", en: "Home layout", sub: "প্রতিটি বিভাগের হোম পেজ সাজান · আজকের ছাড় · Storefront" },
  finance: { bn: "হিসাব", en: "Finance", sub: "বিক্রি, ক্যাশবুক, লাভ-ক্ষতি · Accounting" },
  activity: { bn: "অ্যাক্টিভিটি", en: "Activity log", sub: "কে কখন কী বদলেছে · Audit trail" },
  settings: { bn: "সেটিংস", en: "Settings", sub: "ডেলিভারি, কুপন, অফার, টপবার · Store setup" },
};
