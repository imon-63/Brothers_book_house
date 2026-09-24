export type WaitItem = { kind: "book" | "pack"; id: number };

export type DemoUser = {
  id: number;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: "admin" | "user";
  wait?: WaitItem[];
};

export type OrderLine = {
  kind: "book" | "pack";
  id: number;
  title: string;
  qty: number;
  price: number;
  cost: number;
  costKnown: boolean;
  bookIds?: number[];
};

export type DemoOrder = {
  id: string;
  phone: string;
  email: string;
  name: string;
  total: number;
  status: number;
  items: string;
  address: string;
  pay: string;
  at: number;
  paid?: boolean;
  lines?: OrderLine[];
  sub?: number;
  coupon?: string;
  couponOff?: number;
  ship?: number;
  shipCost?: number;
  stockHeld?: boolean;
  confirmedAt?: number;
  cancelAt?: number;
};

export const COUPONS = [
  { code: "CHOLO10", off: 10, type: "pct" as const },
  { code: "BOI50", off: 50, type: "tk" as const },
];

export const DEMO_USERS: DemoUser[] = [
  { id: 1, name: "অ্যাডমিন", email: "admin@cholo.shop", phone: "01700000000", password: "admin123", role: "admin" },
  { id: 2, name: "রাফি আহমেদ", email: "rafi@gmail.com", phone: "01711111111", password: "123456", role: "user" },
];

export const STATUS = ["অর্ডার নিশ্চিত", "প্রস্তুত হচ্ছে", "কুরিয়ারে তোলা হয়েছে", "ডেলিভারিতে আছে", "ডেলিভারি সম্পন্ন", "বাতিল"];

export function statusLabel(status: number) {
  if (status < 0) return "অপেক্ষমাণ";
  return STATUS[status] || "অর্ডার";
}

export const SEED_ORDERS: DemoOrder[] = [
  {
    id: "CLO-2041",
    phone: "01711111111",
    email: "rafi@gmail.com",
    name: "রাফি আহমেদ",
    total: 620,
    status: 3,
    items: "হিমু × ১",
    address: "পূর্ব তুমুলিয়া, তুমুলিয়া, কালীগঞ্জ, গাজীপুর, ঢাকা",
    pay: "SSLCOMMERZ",
    at: Date.now() - 2 * 3600000,
  },
  {
    id: "CLO-2039",
    phone: "01711111111",
    email: "rafi@gmail.com",
    name: "রাফি আহমেদ",
    total: 260,
    status: 5,
    cancelAt: 1,
    items: "এসএসসি বাংলা সাজেশন × ১",
    address: "পূর্ব তুমুলিয়া, তুমুলিয়া, কালীগঞ্জ, গাজীপুর, ঢাকা",
    pay: "ক্যাশ অন ডেলিভারি",
    at: Date.now() - 6 * 86400000,
  },
];

export function publicUser(user: DemoUser) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role };
}
