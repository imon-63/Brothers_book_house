import type { DemoOrder, OrderLine } from "@/lib/demo/accounts";
import type { ShopProduct } from "@/store/slices/shop-slice";

export const CASH_ACCOUNTS = ["ক্যাশ", "বিকাশ", "নগদ", "ব্যাংক"] as const;
export type CashAccount = (typeof CASH_ACCOUNTS)[number];
export type PaperKind = "invoice" | "receipt" | "credit";
export type CashKind = "ssl" | "cod" | "fee" | "purchase" | "refund" | "courier" | "manual";

export type Paper = {
  id: string;
  kind: PaperKind;
  orderId: string;
  at: number;
  name: string;
  phone: string;
  address: string;
  pay: string;
  items: string;
  lines: OrderLine[];
  sub: number;
  coupon?: string;
  couponOff: number;
  ship: number;
  shipCost: number;
  sslFee: number;
  total: number;
  reason?: string;
  courierLoss?: number;
  reverseCourier?: boolean;
};

export type PurchaseLine = { productId: number; title: string; qty: number; cost: number };
export type Purchase = {
  id: string;
  supplier: string;
  at: number;
  lines: PurchaseLine[];
  total: number;
  paid: boolean;
  account: CashAccount;
  note: string;
};

export type CashEntry = {
  id: string;
  at: number;
  account: CashAccount;
  dir: "in" | "out";
  amount: number;
  memo: string;
  ref?: string;
  kind: CashKind;
};

export type BooksState = {
  papers: Paper[];
  purchases: Purchase[];
  cash: CashEntry[];
  seq: number;
};

export function emptyBooks(): BooksState {
  return { papers: [], purchases: [], cash: [], seq: 100 };
}

export function isSslPay(pay: string) {
  return pay.toUpperCase().includes("SSL");
}

function orderNo(id: string) {
  return id.replace(/\D/g, "") || "0";
}

function hasPaper(state: BooksState, orderId: string, kind: PaperKind) {
  return state.papers.some((p) => p.orderId === orderId && p.kind === kind);
}

function hasCash(state: BooksState, ref: string, kind: CashKind) {
  return state.cash.some((c) => c.ref === ref && c.kind === kind);
}

function pushCash(state: BooksState, entry: Omit<CashEntry, "id"> & { id?: string }) {
  state.seq += 1;
  state.cash.unshift({ ...entry, id: entry.id || `CSH-${state.seq}` });
}

function makePaper(order: DemoOrder, kind: PaperKind, at: number, extra: Partial<Paper>): Paper {
  const prefix = kind === "invoice" ? "INV" : kind === "receipt" ? "RCP" : "CN";
  return {
    id: `${prefix}-${orderNo(order.id)}`,
    kind,
    orderId: order.id,
    at,
    name: order.name,
    phone: order.phone,
    address: order.address,
    pay: order.pay,
    items: order.items,
    lines: (order.lines || []).map((line) => ({ ...line, bookIds: line.bookIds ? [...line.bookIds] : undefined })),
    sub: order.sub ?? Math.max(0, order.total - (order.ship || 0) + (order.couponOff || 0)),
    coupon: order.coupon,
    couponOff: order.couponOff || 0,
    ship: order.ship || 0,
    shipCost: order.shipCost || 0,
    sslFee: extra.sslFee || 0,
    total: order.total,
    reason: extra.reason,
    courierLoss: extra.courierLoss,
    reverseCourier: extra.reverseCourier,
  };
}

export function bookOrder(
  state: BooksState,
  args: {
    order: DemoOrder;
    next: number;
    feePct: number;
    at?: number;
    markPaid?: boolean;
    credit?: { reason: string; courierLoss: number };
  },
) {
  const at = args.at ?? Date.now();
  const { order, next } = args;
  const prev = order.status;
  const ssl = isSslPay(order.pay);
  const fee = ssl ? Math.round((order.total * args.feePct) / 100) : 0;
  const liveNext = next >= 0 && next < 5;
  const wasLive = prev >= 0 && prev < 5;
  const becomingLive = prev < 0 && liveNext;

  if (becomingLive && !hasPaper(state, order.id, "invoice")) {
    state.papers.unshift(makePaper(order, "invoice", at, { sslFee: fee }));
  }

  const collectSsl = ssl && becomingLive;
  const collectCod = !ssl && (next === 4 || Boolean(args.markPaid)) && (wasLive || becomingLive || prev === 4);
  if ((collectSsl || collectCod) && !hasPaper(state, order.id, "receipt")) {
    state.papers.unshift(makePaper(order, "receipt", at, { sslFee: fee }));
    const account: CashAccount = ssl ? "ব্যাংক" : "ক্যাশ";
    const kind: CashKind = ssl ? "ssl" : "cod";
    if (!hasCash(state, order.id, kind)) {
      pushCash(state, {
        at,
        account,
        dir: "in",
        amount: order.total,
        memo: ssl ? `SSL ${order.id}` : `ক্যাশ অন ${order.id}`,
        ref: order.id,
        kind,
      });
    }
    if (fee > 0 && !hasCash(state, order.id, "fee")) {
      pushCash(state, {
        at,
        account: "ব্যাংক",
        dir: "out",
        amount: fee,
        memo: `SSL ফি ${order.id}`,
        ref: order.id,
        kind: "fee",
      });
    }
  }

  if (next === 5 && wasLive && !hasPaper(state, order.id, "credit")) {
    const reverseCourier = prev < 2;
    state.papers.unshift(makePaper(order, "credit", at, {
      sslFee: hasPaper(state, order.id, "receipt") ? fee : 0,
      reason: args.credit?.reason || "বাতিল",
      courierLoss: Math.max(0, args.credit?.courierLoss || 0),
      reverseCourier,
    }));
    if (hasPaper(state, order.id, "receipt") && !hasCash(state, order.id, "refund")) {
      pushCash(state, {
        at,
        account: ssl ? "ব্যাংক" : "ক্যাশ",
        dir: "out",
        amount: Math.max(0, order.total - fee),
        memo: `ফেরত ${order.id}`,
        ref: order.id,
        kind: "refund",
      });
    }
  }

  if (prev === 5 && liveNext) {
    state.papers = state.papers.filter((p) => !(p.orderId === order.id && p.kind === "credit"));
    state.cash = state.cash.filter((c) => !(c.ref === order.id && c.kind === "refund"));
  }
}

export function seedFromOrders(orders: DemoOrder[], feePct: number): BooksState {
  const state = emptyBooks();
  const sorted = [...orders].sort((a, b) => a.at - b.at);
  for (const order of sorted) {
    if (order.status < 0 || order.status === 5) continue;
    bookOrder(state, {
      order: { ...order, status: -1 },
      next: order.status,
      feePct,
      at: order.confirmedAt || order.at,
    });
  }
  return state;
}

export function signed(entry: CashEntry) {
  return entry.dir === "in" ? entry.amount : -entry.amount;
}

export function isoDay(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function dayRange(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const start = new Date(y, (m || 1) - 1, d || 1).getTime();
  const end = new Date(y, (m || 1) - 1, (d || 1) + 1).getTime();
  return { start, end };
}

export type Tenure = "day" | "month" | "year";

export function tenureRange(kind: Tenure, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (kind === "month") d.setDate(1);
  if (kind === "year") {
    d.setMonth(0, 1);
  }
  const start = d.getTime();
  const next = new Date(start);
  if (kind === "day") next.setDate(next.getDate() + 1);
  if (kind === "month") next.setMonth(next.getMonth() + 1);
  if (kind === "year") next.setFullYear(next.getFullYear() + 1);
  return { start, end: next.getTime() };
}

export type Pnl = {
  sales: number;
  coupon: number;
  cogs: number;
  shipIn: number;
  courier: number;
  sslFee: number;
  courierLoss: number;
  invoices: number;
  credits: number;
  skipped: number;
};

function lineMoney(lines: OrderLine[]) {
  return {
    sales: lines.reduce((s, line) => s + line.price * line.qty, 0),
    cogs: lines.reduce((s, line) => s + line.cost * line.qty, 0),
    known: lines.length > 0 && lines.every((line) => line.costKnown),
  };
}

export function pnlFor(papers: Paper[], from: number, to: number): Pnl {
  const out: Pnl = {
    sales: 0, coupon: 0, cogs: 0, shipIn: 0, courier: 0, sslFee: 0, courierLoss: 0, invoices: 0, credits: 0, skipped: 0,
  };
  for (const paper of papers) {
    if (paper.at < from || paper.at >= to) continue;
    if (paper.kind === "invoice") {
      out.invoices += 1;
      const money = lineMoney(paper.lines);
      if (!money.known) {
        out.skipped += 1;
        continue;
      }
      out.sales += money.sales;
      out.coupon += paper.couponOff;
      out.cogs += money.cogs;
      out.shipIn += paper.ship;
      out.courier += paper.shipCost;
      out.sslFee += paper.sslFee;
    }
    if (paper.kind === "credit") {
      out.credits += 1;
      const money = lineMoney(paper.lines);
      if (!money.known) {
        out.skipped += 1;
        continue;
      }
      out.sales -= money.sales;
      out.coupon -= paper.couponOff;
      out.cogs -= money.cogs;
      out.shipIn -= paper.ship;
      if (paper.reverseCourier) out.courier -= paper.shipCost;
      out.sslFee -= paper.sslFee;
      out.courierLoss += paper.courierLoss || 0;
    }
  }
  return out;
}

export function grossOf(pnl: Pnl) {
  return pnl.sales - pnl.coupon - pnl.cogs;
}

export function netOf(pnl: Pnl) {
  return grossOf(pnl) + pnl.shipIn - pnl.courier - pnl.sslFee - pnl.courierLoss;
}

export type CatRow = { cat: string; qty: number; sales: number; cogs: number };

function addCat(map: Map<string, CatRow>, cat: string, qty: number, sales: number, cogs: number) {
  const row = map.get(cat) || { cat, qty: 0, sales: 0, cogs: 0 };
  row.qty += qty;
  row.sales += sales;
  row.cogs += cogs;
  map.set(cat, row);
}

function absorb(map: Map<string, CatRow>, paper: Paper, products: ShopProduct[], sign: number) {
  for (const line of paper.lines) {
    if (line.kind === "pack" && line.bookIds?.length) {
      const books = line.bookIds
        .map((id) => products.find((p) => p.id === id))
        .filter((p): p is ShopProduct => Boolean(p));
      if (!books.length) {
        addCat(map, "প্যাকেজ", sign * line.qty, sign * line.price * line.qty, sign * line.cost * line.qty);
        continue;
      }
      const priceW = books.reduce((s, b) => s + b.price, 0) || books.length;
      const costW = books.reduce((s, b) => s + (b.cost || 0), 0);
      for (const book of books) {
        const ps = book.price / priceW;
        const cs = costW > 0 ? (book.cost || 0) / costW : 1 / books.length;
        addCat(map, book.cat || "অন্যান্য", sign * line.qty, sign * line.price * line.qty * ps, sign * line.cost * line.qty * cs);
      }
      continue;
    }
    const product = products.find((p) => p.id === line.id);
    addCat(map, product?.cat || "অন্যান্য", sign * line.qty, sign * line.price * line.qty, sign * line.cost * line.qty);
  }
}

export function categoryRows(papers: Paper[], products: ShopProduct[], from: number, to: number) {
  const map = new Map<string, CatRow>();
  for (const paper of papers) {
    if (paper.at < from || paper.at >= to || !paper.lines.length) continue;
    if (paper.kind === "invoice") absorb(map, paper, products, 1);
    if (paper.kind === "credit") absorb(map, paper, products, -1);
  }
  return [...map.values()].filter((row) => row.qty || row.sales).sort((a, b) => b.sales - a.sales);
}

export function supplierDue(purchases: Purchase[]) {
  return purchases.filter((p) => !p.paid).reduce((s, p) => s + p.total, 0);
}

export function courierDue(papers: Paper[], cash: CashEntry[]) {
  let accrued = 0;
  for (const paper of papers) {
    if (paper.kind === "invoice") accrued += paper.shipCost;
    if (paper.kind === "credit" && paper.reverseCourier) accrued -= paper.shipCost;
  }
  const paid = cash.filter((c) => c.kind === "courier").reduce((s, c) => s + c.amount, 0);
  return Math.max(0, accrued - paid);
}
