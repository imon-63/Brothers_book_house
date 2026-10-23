"use client";

import "./orders.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { BnRangeButton } from "@/components/ui/bangla-calendar";
import { bn, localPhone } from "@/lib/format";
import { phoneKey } from "@/lib/admin/insights";
import { FLOW, isClosedStatus, isSslMethod, statusLabel, statusTone, type OrderStatus } from "@/lib/admin/status";
import { useAdminSection } from "@/lib/admin/section-context";
import { adminErrorText, ms, useToast } from "@/lib/api/admin/core";
import {
  exportOrders, useAddOrderNote, useAddOrderTag, useAssignShipment, useBulkMarkPaid, useBulkStatus, useChangeOrderStatus, useCouriers,
  useDeleteOrderNote, useMarkPaid, useOrder, useOrderBoard, useOrderKpis, useOrderTags, useOrders, usePickList, useRegressOrder,
  useRemoveOrderTag, useReopenOrder, useSetPriority,
  type OrderDetail, type OrderFilter, type OrderListItem, type Priority as ApiPriority,
} from "@/lib/api/admin/orders";
import { DocModal } from "@/components/admin/doc-frame";
import { printElement } from "@/lib/admin/print";
import { Pager, SectionIcon, VertTags } from "@/components/admin/shared";
import { useAdminNav } from "@/components/admin/nav";
import { useConfirm, useConfirmInput } from "@/components/admin/confirm";
import {
  Avatar, Badge, CopyBtn, Drawer, Empty, Ico, Kbd, Menu, Modal, PageHead, Segmented, SearchInput, Stat, StatusPill,
  ago, dateOnly, num, tk, when, useSelection,
} from "@/components/admin/ui";

/* ───────── constants ───────── */

type StatusFilter = "all" | "pending" | "run" | "done" | "cancel";
type SortKey = "new" | "old" | "high" | "low" | "prio";
type View = "list" | "board";
type Priority = "normal" | "high" | "urgent";
type Row = OrderListItem;

const RETURN_REASONS = ["কাস্টমার ফেরত দিয়েছে", "কাস্টমার ফোন ধরেনি", "ভুল ঠিকানা", "পণ্য ক্ষতিগ্রস্ত", "স্টক নেই", "কাস্টমার বাতিল চেয়েছে"];
const REOPEN_REASONS = ["কাস্টমার ফোন করে আবার চেয়েছেন", "ভুল করে বাতিল হয়েছিল", "স্টক আবার এসেছে", "ঠিকানা ঠিক করা হয়েছে"];
const PRIORITY: Record<Priority, { bn: string; en: string }> = {
  normal: { bn: "সাধারণ", en: "Normal" },
  high: { bn: "উঁচু", en: "High" },
  urgent: { bn: "জরুরি", en: "Urgent" },
};
const toUi = (p: ApiPriority | string): Priority => (p === "URGENT" ? "urgent" : p === "HIGH" ? "high" : "normal");
const toApi = (p: Priority): ApiPriority => (p === "urgent" ? "URGENT" : p === "high" ? "HIGH" : "NORMAL");

const STEPS: { status: OrderStatus; bn: string; en: string }[] = [
  { status: "PENDING", bn: "অপেক্ষমাণ", en: "Placed" },
  { status: "CONFIRMED", bn: "কনফার্ম", en: "Confirmed" },
  { status: "PROCESSING", bn: "প্যাকিং", en: "Preparing" },
  { status: "HANDED_TO_COURIER", bn: "কুরিয়ারে", en: "Handed over" },
  { status: "OUT_FOR_DELIVERY", bn: "পথে", en: "Out for delivery" },
  { status: "DELIVERED", bn: "ডেলিভারি", en: "Delivered" },
];
const BOARD_LABEL: Partial<Record<OrderStatus, { bn: string; en: string }>> = {
  PENDING: { bn: "অপেক্ষমাণ", en: "Pending" },
  CONFIRMED: { bn: "কনফার্ম", en: "Confirmed" },
  PROCESSING: { bn: "প্যাকিং", en: "Preparing" },
  HANDED_TO_COURIER: { bn: "কুরিয়ারে", en: "With courier" },
  OUT_FOR_DELIVERY: { bn: "ডেলিভারিতে", en: "Out for delivery" },
  DELIVERED: { bn: "ডেলিভারি হয়েছে", en: "Delivered" },
  CANCELLED: { bn: "বাতিল", en: "Cancelled" },
  RETURNED: { bn: "ফেরত", en: "Returned" },
};
const TAB_STATUSES: Record<StatusFilter, OrderStatus[]> = {
  all: ["PENDING", "CONFIRMED", "PROCESSING", "HANDED_TO_COURIER", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED", "RETURNED"],
  pending: ["PENDING"], run: ["CONFIRMED", "PROCESSING", "HANDED_TO_COURIER", "OUT_FOR_DELIVERY"], done: ["DELIVERED"], cancel: ["CANCELLED", "RETURNED"],
};
const SORTS: { id: SortKey; bn: string; en: string }[] = [
  { id: "new", bn: "নতুন আগে", en: "Newest" },
  { id: "old", bn: "পুরনো আগে", en: "Oldest" },
  { id: "high", bn: "বেশি টাকা আগে", en: "Amount high" },
  { id: "low", bn: "কম টাকা আগে", en: "Amount low" },
  { id: "prio", bn: "প্রায়োরিটি আগে", en: "Priority" },
];
const RANGES: { id: string; label: string }[] = [
  { id: "all", label: "সব সময়" }, { id: "today", label: "আজ" }, { id: "7", label: "৭ দিন" }, { id: "30", label: "৩০ দিন" },
];
const DOC_NAME: Record<string, string> = { INVOICE: "ইনভয়েস", RECEIPT: "রিসিট", CREDIT_NOTE: "ক্রেডিট নোট" };
const DOC_KIND: Record<string, string> = { INVOICE: "invoice", RECEIPT: "receipt", CREDIT_NOTE: "credit" };

const I = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const OI = {
  more: <svg {...I}><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></svg>,
  flag: <svg {...I}><path d="M5.5 21V4.5M5.5 4.5h11l-2 4 2 4h-11" /></svg>,
  back: <svg {...I}><path d="m15 6-6 6 6 6" /></svg>,
  undo: <svg {...I}><path d="M9 7 4.5 11.5 9 16" /><path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-3" /></svg>,
  pin: <svg {...I}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z" /><circle cx="12" cy="10" r="2.3" /></svg>,
  sort: <svg {...I}><path d="M7 4.5v15M4 16.5l3 3 3-3M17 19.5v-15M14 7.5l3-3 3 3" /></svg>,
  x: <svg {...I}><path d="M6 6l12 12M18 6 6 18" /></svg>,
};

/* ───────── pure helpers ───────── */

type Orderish = { status: OrderStatus; paymentMethod: string; paymentStatus: string; next: { status: OrderStatus; label: string | null } | null; canRegress: boolean };

const FALLBACK_NEXT: Partial<Record<OrderStatus, string>> = {
  PENDING: "কনফার্ম করুন", CONFIRMED: "প্যাকিং শুরু", PROCESSING: "কুরিয়ারে তুলুন", HANDED_TO_COURIER: "ডেলিভারিতে পাঠান", OUT_FOR_DELIVERY: "ডেলিভারি সম্পন্ন",
};
function nextLabel(o: Orderish) {
  return o.next ? o.next.label || FALLBACK_NEXT[o.status] || "পরের ধাপ" : null;
}
function isPaid(o: Orderish) {
  return o.paymentStatus !== "UNPAID";
}
/** live (confirmed, not dead) and still unpaid */
function dueCod(o: Orderish) {
  return !isClosedStatus(o.status) && o.status !== "PENDING" && !isPaid(o);
}
/** Where "বাতিল / ফেরত" goes from here. */
function voidTarget(s: OrderStatus): OrderStatus | null {
  if (s === "PENDING" || s === "CONFIRMED" || s === "PROCESSING") return "CANCELLED";
  if (s === "HANDED_TO_COURIER" || s === "OUT_FOR_DELIVERY" || s === "DELIVERED") return "RETURNED";
  return null;
}
function waLink(phone: string) {
  return `https://wa.me/88${phoneKey(phone)}`;
}
function payName(method: string) {
  return isSslMethod(method) ? "SSLCOMMERZ" : method === "COD" ? "ক্যাশ অন ডেলিভারি" : method;
}
function refOf(o: { orderNo: string }) {
  return o.orderNo;
}

type Look = { img?: string; color?: string; title: string; productId?: string | null; packId?: string | null };
function rowLooks(o: Row): Look[] {
  return o.items.map((l) => ({ title: l.title, productId: l.productId, packId: l.bundleId }));
}

function Thumb({ look, size = 30 }: { look: Look; size?: number }) {
  return (
    <span className="od-thumb" style={{ width: size, height: Math.round(size * 1.3), background: look.img ? undefined : look.color || "var(--ap-surface3)" }} title={look.title}>
      {look.img ? <img src={look.img} alt="" loading="lazy" /> : <em>{look.title.slice(0, 1)}</em>}
    </span>
  );
}

function PayBadge({ o }: { o: Orderish }) {
  const ssl = isSslMethod(o.paymentMethod);
  return (
    <span className="od-pay">
      <Badge tone={ssl ? "blue" : "ink"}>{ssl ? "SSL" : o.paymentMethod === "COD" ? "COD" : o.paymentMethod}</Badge>
      {isClosedStatus(o.status) ? <small className="mute">—</small> : isPaid(o) ? <small className="ok">পরিশোধিত</small> : <small className="due">বকেয়া</small>}
    </span>
  );
}

function PrioFlag({ p }: { p: Priority }) {
  if (p === "normal") return null;
  return <span className={`od-flag ${p}`} title={`Priority · ${PRIORITY[p].en}`}>{OI.flag}</span>;
}

/** Order tag in its own colour (tags.color). */
function OrderTag({ t }: { t: { name: string; color: string | null } }) {
  return <span className="od-tag" style={{ ["--tc" as string]: t.color || "#8A6230" }}><i aria-hidden="true" />{t.name}</span>;
}

/** Priority + tags under the order number. */
function OrderBadges({ p, tags, max = 2 }: { p: Priority; tags: { id: string; name: string; color: string | null }[]; max?: number }) {
  if (p === "normal" && !tags.length) return null;
  return (
    <div className="od-tags">
      {p !== "normal" ? <span className={`od-prio-pill ${p}`}>{OI.flag}{PRIORITY[p].en}</span> : null}
      {tags.slice(0, max).map((t) => <OrderTag key={t.id} t={t} />)}
      {tags.length > max ? <span className="od-tag more" title={tags.slice(max).map((t) => t.name).join(", ")}>+{bn(tags.length - max)}</span> : null}
    </div>
  );
}

/* ═══════════════════════════ tab ═══════════════════════════ */

export function OrdersTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const ask = useConfirmInput();
  const lossRef = useRef(0);
  const reopenTo = useRef<"PENDING" | "CONFIRMED">("PENDING");
  const reopenM = useReopenOrder();
  const { focus, go, clearFocus } = useAdminNav();
  const { sections } = useAdminSection();

  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pay, setPay] = useState<"all" | "cod" | "ssl" | "due">("all");
  const [vert, setVert] = useState<string>("all");
  const [prio, setPrio] = useState<"all" | "flagged" | "urgent">("all");
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState<SortKey>("new");
  const [view, setView] = useState<View>("list");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ id: string; title: string } | null>(null);
  const [pick, setPick] = useState<string[] | null>(null);
  const [dragOver, setDragOver] = useState<OrderStatus | null>(null);
  const sel = useSelection<string>();

  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);

  const filter: OrderFilter = useMemo(() => ({
    tab: status, q: term || undefined, range: range as OrderFilter["range"], from: range === "custom" ? from || undefined : undefined,
    to: range === "custom" ? to || undefined : undefined, pay, section: vert === "all" ? undefined : vert, priority: prio,
    tag: tag === "all" ? undefined : tag, sort,
  }), [status, term, range, from, to, pay, vert, prio, tag, sort]);

  const listQ = useOrders(filter, page, size);
  const boardQ = useOrderBoard({ ...filter, tab: status }, view === "board");
  const kpiQ = useOrderKpis();
  const tagsQ = useOrderTags();
  const detailQ = useOrder(open);

  const changeM = useChangeOrderStatus();
  const regressM = useRegressOrder();
  const paidM = useMarkPaid();
  const bulkM = useBulkStatus();
  const bulkPaidM = useBulkMarkPaid();
  const prioM = useSetPriority();

  const rows = listQ.data?.items ?? [];
  const total = listQ.data?.total ?? 0;
  const counts: Record<StatusFilter, number> = listQ.data?.counts.tabs ?? { all: 0, pending: 0, run: 0, done: 0, cancel: 0 };
  const orderTags = tagsQ.data ?? [];

  /* deep links from other screens */
  useEffect(() => {
    if (!focus) return;
    if (focus.startsWith("status:")) {
      const s = focus.slice(7) as StatusFilter;
      if (s in TAB_STATUSES) { setStatus(s); setOpen(null); }
    } else {
      setOpen(focus);
    }
    clearFocus();
  }, [focus, clearFocus]);

  useEffect(() => { setPage(1); }, [term, status, range, pay, from, to, vert, prio, tag, sort]);
  const pages = Math.max(1, listQ.data?.pages ?? 1);
  const cur = Math.min(page, pages);
  function goPage(n: number) {
    setPage(n);
    document.querySelector(".adm .od-toolbar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const activeFilters = [q, range !== "all", pay !== "all", vert !== "all", prio !== "all", tag !== "all"].filter(Boolean).length;
  function clearFilters() {
    setQ(""); setRange("all"); setFrom(""); setTo(""); setPay("all"); setVert("all"); setPrio("all"); setTag("all");
  }

  /* KPIs */
  const kpi = kpiQ.data;

  /* ───────── business logic (server-side now) ───────── */

  function changeStatus(o: Orderish & { orderNo: string; version: number }, next: OrderStatus, credit?: { reason: string; courierLoss: number }) {
    const wasPending = o.status === "PENDING";
    let msg = "স্ট্যাটাস বদলেছে";
    if (wasPending && next === "CONFIRMED") msg = isSslMethod(o.paymentMethod) ? "কনফার্ম · ইনভয়েস ও রিসিট" : "কনফার্ম · ইনভয়েস কাটা হয়েছে";
    else if (next === "CANCELLED" && wasPending) msg = "বাতিল";
    else if (next === "CANCELLED" || next === "RETURNED") msg = "ক্রেডিট নোট কাটা হয়েছে · স্টক ফিরেছে";
    else if (next === "DELIVERED" && !isSslMethod(o.paymentMethod)) msg = "ডেলিভারি · রিসিট কাটা হয়েছে";
    changeM.mutate({ ref: refOf(o), to: next, version: o.version, credit, toast: msg });
  }

  async function payOrder(o: Row | OrderDetail) {
    if (!(await confirm({
      tone: "info", icon: Ico.cash,
      title: `${o.orderNo} — টাকা পেয়েছেন?`,
      body: <><b>{retName(o)}</b> এর অর্ডার «পরিশোধিত» হিসেবে খাতায় উঠবে, রিসিট কাটা হবে।</>,
      details: [{ label: "টাকা", value: tk(retTotal(o)) }, { label: "পেমেন্ট", from: "বকেয়া", to: "পরিশোধিত" }],
      confirmText: "হ্যাঁ, টাকা পেয়েছি",
    }))) return;
    paidM.mutate({ ref: refOf(o), version: o.version });
  }

  /** Cancel: pending → straight cancel; live → credit-note modal. */
  function askCancel(o: Row | OrderDetail) {
    const target = voidTarget(o.status);
    if (!target) return;
    if (o.status === "PENDING") {
      void confirm({
        tone: "danger",
        title: `${o.orderNo} বাতিল করবেন?`,
        body: <><b>{retName(o)}</b> এর অর্ডার বাতিল হবে, রিজার্ভ করা স্টক ফিরে যাবে। পরে «ফিরিয়ে আনুন» দিয়ে আবার চালু করা যায়।</>,
        details: [
          { label: "অর্ডার", value: `${bn(o.items.reduce((s2, i) => s2 + i.quantity, 0))}টি আইটেম · ${tk(retTotal(o))}` },
          { label: "স্ট্যাটাস", from: statusLabel(o.status), to: statusLabel("CANCELLED") },
        ],
        confirmText: "হ্যাঁ, বাতিল করুন", cancelText: "না, রাখুন",
      }).then((ok) => { if (ok) changeStatus(o, "CANCELLED"); });
    } else void askReturn(o, target);
  }
  /** Live order → credit note: reason + courier loss, all in the confirm sheet. */
  async function askReturn(o: Row | OrderDetail, target: OrderStatus) {
    lossRef.current = 0;
    const shipped = target === "RETURNED";
    const reason = await ask({
      tone: "danger",
      title: `ফেরত / বাতিল · ${o.orderNo}`,
      eyebrow: "ক্রেডিট নোট · Return",
      body: <>ক্রেডিট নোট কাটবে, স্টক ফিরবে।{shipped ? " এই অর্ডার কুরিয়ারে উঠেছে · ডেলিভারি খরচ ফেরত আসবে না।" : ""} বাড়তি লস আলাদা লাইনে উঠবে।</>,
      details: [
        { label: retName(o), value: tk(retTotal(o)) },
        { label: "পণ্য", value: o.items.map((i) => `${i.title} × ${bn(i.quantity)}`).join(", ") },
        { label: "স্ট্যাটাস", from: statusLabel(o.status), to: statusLabel(target) },
      ],
      detailsTitle: "অর্ডার",
      extra: <NumberField label="কুরিয়ার লস (৳) · Courier loss" onChange={(n) => { lossRef.current = n; }} />,
      input: { label: "কারণ · Reason", chips: RETURN_REASONS, initial: RETURN_REASONS[0], minLength: 1 },
      confirmText: "ক্রেডিট নোট কাটুন", cancelText: "থাক",
    });
    if (reason === null) return;
    changeStatus(o, target, { reason: reason || "ফেরত", courierLoss: lossRef.current });
  }
  /** Cancelled / returned → back to live. */
  async function reopenOrder(o: Row | OrderDetail) {
    const wasConfirmed = "cancelledFrom" in o ? !!o.cancelledFrom && o.cancelledFrom !== "PENDING" : o.status === "RETURNED";
    reopenTo.current = wasConfirmed ? "CONFIRMED" : "PENDING";
    const reason = await ask({
      tone: "warn", icon: OI.undo,
      title: `বাতিল থেকে ফিরিয়ে আনবেন? · ${o.orderNo}`,
      eyebrow: "Reopen order · কারণ লগে থাকবে",
      body: "স্টক আবার রিজার্ভ হবে, কুপন ফেরত আসবে। কারণসহ একটি পিন করা নোট ও ইতিহাসে এন্ট্রি যোগ হবে।",
      details: [
        { label: retName(o), value: tk(retTotal(o)) },
        { label: "পণ্য", value: o.items.map((i) => `${i.title} × ${bn(i.quantity)}`).join(", ") },
      ],
      detailsTitle: "অর্ডার",
      extra: <ReopenAs initial={reopenTo.current} onChange={(v) => { reopenTo.current = v; }} />,
      input: { label: "কারণ · Reason", chips: REOPEN_REASONS, placeholder: "কেন ফিরিয়ে আনছেন? (অন্তত ৩ অক্ষর)", minLength: 3 },
      confirmText: "আবার চালু করুন", cancelText: "থাক",
    });
    if (!reason) return;
    reopenM.mutate({ ref: o.orderNo, reason, to: reopenTo.current, version: o.version }, { onSuccess: () => setOpen(o.orderNo) });
  }
  function advance(o: Row | OrderDetail) {
    if (o.next) changeStatus(o, o.next.status);
  }
  async function regress(o: Row | OrderDetail) {
    if (!o.canRegress) return;
    const prev = FLOW[FLOW.indexOf(o.status) - 1];
    if (!(await confirm({
      tone: "warn",
      title: `${o.orderNo} আগের ধাপে ফেরাবেন?`,
      body: "ভুল করে এগিয়ে গেলে ব্যবহার করুন — ইতিহাসে এন্ট্রি থাকবে।",
      details: [{ label: "স্ট্যাটাস", from: statusLabel(o.status), to: prev ? statusLabel(prev) : "আগের ধাপ" }],
      confirmText: "হ্যাঁ, ফেরান",
    }))) return;
    regressM.mutate({ ref: refOf(o), version: o.version });
  }
  function moveTo(o: Row, target: OrderStatus) {
    if (o.status === target) return;
    if (target === "PENDING") { toast("অপেক্ষমাণে ফেরানো যায় না"); return; }
    if (target === "CANCELLED" || target === "RETURNED") {
      if (isClosedStatus(o.status)) return;
      askCancel(o);
      return;
    }
    if (isClosedStatus(o.status)) { void reopenOrder(o); return; }
    if (o.status === "PENDING" && target !== "CONFIRMED") { changeStatus(o, "CONFIRMED"); toast("আগে কনফার্ম হলো · এরপর ধাপ বদলান"); return; }
    const a = FLOW.indexOf(o.status);
    const b = FLOW.indexOf(target);
    if (b === a - 1 && o.canRegress) { void regress(o); return; }
    changeStatus(o, target);
  }

  /* bulk */
  const [selRows, setSelRows] = useState<Map<string, Row>>(new Map());
  useEffect(() => {
    setSelRows((m) => {
      const next = new Map<string, Row>();
      for (const id of sel.sel) {
        const r = rows.find((x) => x.orderNo === id) ?? m.get(id);
        if (r) next.set(id, r);
      }
      return next;
    });
  }, [sel.sel, rows]);
  const selected = useMemo(() => [...selRows.values()], [selRows]);
  const bulkPending = selected.filter((o) => o.status === "PENDING");
  const bulkNext = selected.filter((o) => o.next != null);
  const bulkPay = selected.filter(dueCod);
  async function bulkConfirm() {
    if (!(await confirm({
      tone: "info", title: `${bn(bulkPending.length)}টি অর্ডার কনফার্ম করবেন?`,
      body: "প্রতিটির ইনভয়েস কাটা হবে, স্টক নিশ্চিত হবে, কাস্টমার নোটিফিকেশন পাবেন।",
      details: [{ label: "অর্ডার", value: `${bn(bulkPending.length)}টি` }, { label: "মোট", value: tk(bulkPending.reduce((s2, o) => s2 + retTotal(o), 0)) }, { label: "স্ট্যাটাস", from: statusLabel("PENDING"), to: statusLabel("CONFIRMED") }],
      confirmText: "হ্যাঁ, কনফার্ম",
    }))) return;
    bulkM.mutate({ ids: bulkPending.map(refOf), action: "confirm", toast: `${bn(bulkPending.length)}টি অর্ডার কনফার্ম হয়েছে` });
  }
  async function bulkAdvance() {
    if (!(await confirm({
      tone: "info", title: `${bn(bulkNext.length)}টি অর্ডার পরের ধাপে নেবেন?`,
      body: "প্রতিটি অর্ডার নিজের পরের ধাপে যাবে (যেমন প্যাকিং → কুরিয়ার)।",
      details: [{ label: "অর্ডার", value: `${bn(bulkNext.length)}টি` }],
      confirmText: "হ্যাঁ, এগিয়ে দিন",
    }))) return;
    bulkM.mutate({ ids: bulkNext.map(refOf), action: "advance", toast: `${bn(bulkNext.length)}টি অর্ডার পরের ধাপে` });
  }
  async function bulkMarkPaid() {
    if (!(await confirm({
      tone: "info", icon: Ico.cash, title: `${bn(bulkPay.length)}টি অর্ডারের টাকা পেয়েছেন?`,
      body: "সবগুলো «পরিশোধিত» হিসেবে খাতায় উঠবে, রিসিট কাটা হবে।",
      details: [{ label: "অর্ডার", value: `${bn(bulkPay.length)}টি` }, { label: "মোট টাকা", value: tk(bulkPay.reduce((s2, o) => s2 + retTotal(o), 0)) }],
      confirmText: "হ্যাঁ, টাকা পেয়েছি",
    }))) return;
    bulkPaidM.mutate({ ids: bulkPay.map(refOf), toast: `${bn(bulkPay.length)}টি অর্ডারের টাকা পাওয়া গেছে` });
  }

  /* export */
  function exportRows(f: OrderFilter) {
    exportOrders(f).then(() => toast("অর্ডার CSV-তে নামানো হয়েছে")).catch((e) => toast(adminErrorText(e)));
  }
  function exportSelected() {
    const head = ["id", "date", "customer", "phone", "address", "items", "sections", "payment", "paid", "status", "total"];
    const esc = (v: unknown) => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const lines = selected.map((o) => [o.orderNo, o.placedAt, o.customer?.name, o.customer?.phone, o.address, o.items.map((i) => `${i.title} × ${i.quantity}`).join(", "),
      o.sections.join(" / "), o.paymentMethod, isPaid(o) ? "yes" : "no", statusLabel(o.status), o.grandTotal]);
    const csv = "﻿" + [head, ...lines].map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `orders-selected-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${bn(selected.length)}টি অর্ডার CSV-তে নামানো হয়েছে`);
  }
  function openPick() {
    const ids = selected.length ? selected.map(refOf) : rows.filter((o) => o.status === "PENDING" || o.status === "CONFIRMED" || o.status === "PROCESSING").map(refOf);
    if (!ids.length) { toast("পিক-লিস্টের জন্য অর্ডার নেই"); return; }
    setPick(ids);
  }

  /* drawer + keyboard j/k */
  const detail = open ? detailQ.data ?? null : null;
  const drawerOpen = !!open;
  const idx = open ? rows.findIndex((o) => o.orderNo === open || o.id === open || o.id === detail?.id) : -1;
  const step = useCallback((d: number) => {
    if (idx < 0) return;
    const nextRow = rows[idx + d];
    if (nextRow) setOpen(nextRow.orderNo);
  }, [rows, idx]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (sheet || document.querySelector(".ap-cf-wrap") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "j") { e.preventDefault(); step(1); }
      if (e.key === "k") { e.preventDefault(); step(-1); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, sheet, step]);
  const closeDrawer = useCallback(() => { if (!sheet && !pick) setOpen(null); }, [sheet, pick]);

  /* ───────── row pieces ───────── */

  function rowMenu(o: Row) {
    return (
      <Menu trigger={() => <button type="button" className="ap-icon-btn sm" aria-label="আরও">{OI.more}</button>}>
        {(close) => (
          <>
            <div className="ap-menu-label">{o.orderNo}</div>
            <button type="button" className="ap-menu-item" onClick={() => { close(); setOpen(o.orderNo); }}>{Ico.eye}খুলুন<small>Open</small></button>
            {o.next ? <button type="button" className="ap-menu-item" onClick={() => { close(); advance(o); }}>{Ico.check}{nextLabel(o)}<small>Next</small></button> : null}
            {o.canRegress ? <button type="button" className="ap-menu-item" onClick={() => { close(); void regress(o); }}>{OI.undo}আগের ধাপে<small>Back</small></button> : null}
            {dueCod(o) ? <button type="button" className="ap-menu-item" onClick={() => { close(); void payOrder(o); }}>{Ico.cash}টাকা পেয়েছি<small>Mark paid</small></button> : null}
            {isClosedStatus(o.status) ? <button type="button" className="ap-menu-item" onClick={() => { close(); void reopenOrder(o); }}>{OI.undo}বাতিল থেকে ফিরিয়ে আনুন<small>Reopen</small></button> : null}
            {o.customer?.id ? <button type="button" className="ap-menu-item" onClick={() => { close(); go("customers", o.customer!.id); }}>{Ico.user}কাস্টমার প্রোফাইল</button> : null}
            {voidTarget(o.status) ? (
              <>
                <div className="ap-menu-sep" />
                <button type="button" className="ap-menu-item danger" onClick={() => { close(); askCancel(o); }}>{Ico.close}{o.status === "PENDING" ? "বাতিল করুন" : "বাতিল / ফেরত"}<small>{o.status === "PENDING" ? "Cancel" : "Return"}</small></button>
              </>
            ) : null}
          </>
        )}
      </Menu>
    );
  }

  const pageIds = rows.map((o) => o.orderNo);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => sel.has(id));
  const someOnPage = pageIds.some((id) => sel.has(id));

  const list = (
    <div className="od-tablecard">
      <table className="ap-table od-table">
        <thead>
          <tr>
            <th className="od-c-chk">
              <input type="checkbox" className="ap-check" aria-label="সব বাছুন" checked={allOnPage}
                ref={(el) => { if (el) el.indeterminate = !allOnPage && someOnPage; }}
                onChange={(e) => sel.setAll(pageIds, e.target.checked)} />
            </th>
            <th>অর্ডার</th>
            <th>কাস্টমার</th>
            <th>পণ্য</th>
            <th className="od-c-vert">বিভাগ</th>
            <th>পেমেন্ট</th>
            <th>স্ট্যাটাস</th>
            <th className="num">মোট</th>
            <th className="od-c-age">সময়</th>
            <th aria-label="অ্যাকশন" />
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const looks = rowLooks(o);
            const at = ms(o.placedAt);
            const late = o.status === "PENDING" && Date.now() - at > 6 * 3_600_000;
            const p = toUi(o.priority);
            return (
              <tr key={o.id} className={`click od-row${sel.has(o.orderNo) ? " sel" : ""}${o.status === "PENDING" ? " hold" : ""}${o.status === "DELIVERED" ? " done" : ""}${o.status === "CANCELLED" || o.status === "RETURNED" ? " dead" : ""}${open === o.orderNo ? " cur" : ""}`}
                onClick={() => setOpen(o.orderNo)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpen(o.orderNo); }}>
                <td className="od-c-chk" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="ap-check" aria-label={`${o.orderNo} বাছুন`} checked={sel.has(o.orderNo)} onChange={() => sel.toggle(o.orderNo)} />
                </td>
                <td className="od-c-id">
                  <div className="od-id">
                    {o.status === "DELIVERED" ? <span className="od-done-tick" title="ডেলিভারি সম্পন্ন · Delivered">{Ico.check}</span> : null}
                    <b>{o.orderNo}</b>
                    <span className="od-copy"><CopyBtn text={o.orderNo} onCopied={() => toast("আইডি কপি হয়েছে")} /></span>
                  </div>
                  <OrderBadges p={p} tags={o.tags} />
                </td>
                <td className="od-c-cust">
                  <div className="od-cust">
                    <Avatar name={o.customer?.name || "গেস্ট"} size={32} />
                    <span><b>{o.customer?.name || "গেস্ট"}</b><small>{localPhone(o.customer?.phone)}</small></span>
                  </div>
                </td>
                <td className="od-c-items">
                  <div className="od-items">
                    <span className="od-thumbs">
                      {looks.slice(0, 3).map((l, i) => <Thumb key={i} look={l} size={24} />)}
                      {looks.length > 3 ? <span className="od-thumb more">+{bn(looks.length - 3)}</span> : null}
                    </span>
                    <span className="od-items-txt"><b>{looks[0]?.title || "—"}</b><small>{bn(o.itemCount)}টি পণ্য{o.lineCount > 1 ? ` · ${bn(o.lineCount)} লাইন` : ""}</small></span>
                  </div>
                </td>
                <td className="od-c-vert"><VertTags list={o.sections} /></td>
                <td className="od-c-pay"><PayBadge o={o} /></td>
                <td className="od-c-status"><StatusPill status={o.status} /></td>
                <td className="num od-c-total"><b>{tk(o.grandTotal)}</b></td>
                <td className={`od-c-age${late ? " late" : ""}`}><span title={when(at)}>{ago(at)}</span><small>{dateOnly(at)}</small></td>
                <td className="od-c-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="od-rowacts">
                    {o.status === "PENDING" ? <button type="button" className="ap-btn sm primary od-quick" onClick={() => changeStatus(o, "CONFIRMED")}>{Ico.check}কনফার্ম</button> : null}
                    {rowMenu(o)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const boardCols = boardQ.data?.columns ?? [];
  function onDrop(e: DragEvent, target: OrderStatus) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const o = boardCols.flatMap((c) => c.orders).find((x) => x.orderNo === id);
    if (o) moveTo(o, target);
  }

  const cols = boardCols.filter((c) => TAB_STATUSES[status].includes(c.status));
  const board = (
    <div className="od-board" style={{ ["--cols" as string]: cols.length }}>
      {cols.map((c) => {
        const label = BOARD_LABEL[c.status] ?? { bn: c.label, en: c.status };
        return (
          <section key={c.status} className={`od-col t-${statusTone(c.status)}${dragOver === c.status ? " over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); if (dragOver !== c.status) setDragOver(c.status); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
            onDrop={(e) => onDrop(e, c.status)}>
            <header>
              <span className="od-col-dot" />
              <b>{label.bn}</b><em>{label.en}</em>
              <span className="od-col-n">{bn(c.count)}</span>
            </header>
            <p className="od-col-sum">{tk(c.value)}</p>
            <div className="od-col-body">
              {c.orders.map((o) => {
                const p = toUi(o.priority);
                return (
                  <article key={o.id} className={`od-card${p !== "normal" ? ` p-${p}` : ""}`} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.orderNo); e.dataTransfer.effectAllowed = "move"; }}
                    onClick={() => setOpen(o.orderNo)}>
                    <div className="od-card-top">
                      <PrioFlag p={p} />
                      <b>{o.orderNo}</b>
                      <span className="od-card-age">{ago(ms(o.placedAt))}</span>
                    </div>
                    <div className="od-card-cust"><Avatar name={o.customer?.name || "গেস্ট"} size={22} /><span>{o.customer?.name || "গেস্ট"}</span></div>
                    <div className="od-card-mid">
                      <span className="od-thumbs">{rowLooks(o).slice(0, 3).map((l, i) => <Thumb key={i} look={l} size={18} />)}</span>
                      <b>{tk(o.grandTotal)}</b>
                    </div>
                    <div className="od-card-foot">
                      <PayBadge o={o} />
                      {o.tags.slice(0, 2).map((t) => <OrderTag key={t.id} t={t} />)}
                    </div>
                    <div className="od-card-acts" onClick={(e) => e.stopPropagation()}>
                      {o.canRegress ? <button type="button" className="ap-icon-btn sm" title="আগের ধাপ" aria-label="আগের ধাপ" onClick={() => void regress(o)}>{OI.back}</button> : null}
                      {voidTarget(o.status) ? <button type="button" className="ap-icon-btn sm od-x" title="বাতিল" aria-label="বাতিল" onClick={() => askCancel(o)}>{OI.x}</button> : null}
                      <span className="spacer" />
                      {o.next ? <button type="button" className="ap-btn sm primary" onClick={() => advance(o)}>{nextLabel(o)}{Ico.chevR}</button> : null}
                      {isClosedStatus(o.status) ? <button type="button" className="ap-btn sm" onClick={() => void reopenOrder(o)}>{OI.undo}ফিরিয়ে আনুন</button> : null}
                      {o.status === "DELIVERED" && dueCod(o) ? <button type="button" className="ap-btn sm gold" onClick={() => void payOrder(o)}>টাকা পেয়েছি</button> : null}
                    </div>
                  </article>
                );
              })}
              {c.count > c.orders.length ? <p className="od-col-more">+{bn(c.count - c.orders.length)}টি আরও · তালিকায় দেখুন</p> : null}
              {!c.orders.length ? <p className="od-col-empty">এখানে টেনে আনুন</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );

  const tabs: { id: StatusFilter; bn: string; en: string }[] = [
    { id: "all", bn: "সব", en: "All" },
    { id: "pending", bn: "অপেক্ষমাণ", en: "Pending" },
    { id: "run", bn: "চলমান", en: "In progress" },
    { id: "done", bn: "ডেলিভারি হয়েছে", en: "Delivered" },
    { id: "cancel", bn: "বাতিল", en: "Cancelled" },
  ];
  const anyOrders = (kpiQ.data?.today.orders ?? 0) > 0 || total > 0 || counts.all > 0;

  return (
    <div className="od">
      <PageHead
        title="অর্ডার"
        en="Orders"
        sub="কনফার্ম, প্যাকিং, কুরিয়ার, ডেলিভারি · Fulfilment"
        actions={(
          <>
            <Segmented<View> value={view} onChange={setView} options={[
              { id: "list", label: "তালিকা", icon: Ico.list },
              { id: "board", label: "বোর্ড", icon: Ico.board },
            ]} />
            <button type="button" className="ap-btn" onClick={openPick}>{Ico.print}পিক-লিস্ট{sel.size ? <em className="od-btn-n">{bn(sel.size)}</em> : null}</button>
            <button type="button" className="ap-btn" onClick={() => exportRows(filter)} disabled={!total}>{Ico.download}CSV</button>
          </>
        )}
      />

      <div className="od-kpis">
        <Stat label="আজকের অর্ডার" en="Today" value={num(kpi?.today.orders ?? 0)} hint={`${tk(kpi?.today.value ?? 0)} বিক্রি`} icon={Ico.orders} tone="wine"
          onClick={() => { setRange("today"); setFrom(""); setTo(""); setStatus("all"); }} />
        <Stat label="অপেক্ষমাণের মূল্য" en="Pending value" value={tk(kpi?.pending.value ?? 0)} tone="gold" icon={Ico.clock}
          hint={kpi?.pending.orders ? `${bn(kpi.pending.orders)}টি · পুরনোটি ${ago(ms(kpi.pending.oldestAt))}` : "সব কনফার্ম হয়ে গেছে"} onClick={() => setStatus("pending")} />
        <Stat label="COD আদায় বাকি" en="Cash to collect" value={tk(kpi?.codToCollect.value ?? 0)} tone="sage" icon={Ico.cash}
          hint={`${bn(kpi?.codToCollect.orders ?? 0)}টি অর্ডারে`} onClick={() => { setPay("due"); setStatus("all"); }} />
        <Stat label="চলমান অর্ডার" en="In progress" value={num(counts.run)} tone="blue" icon={Ico.truck}
          hint="কনফার্ম → ডেলিভারির পথে" onClick={() => setStatus("run")} />
      </div>

      <nav className="od-tabs" role="tablist" aria-label="স্ট্যাটাস">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={status === t.id} className={`od-tab t-${t.id}${status === t.id ? " on" : ""}`} onClick={() => setStatus(t.id)}>
            <span>{t.bn}<small>{t.en}</small></span>
            <em>{bn(counts[t.id] ?? 0)}</em>
          </button>
        ))}
      </nav>

      <div className="od-toolbar">
        <div className="od-toolbar-top">
          <SearchInput value={q} onChange={setQ} placeholder="আইডি, নাম, ফোন, পণ্য বা ট্র্যাকিং · Search" />
          <span className="od-prio-filter">
            <Menu align="left" trigger={() => (
              <button type="button" className={`ap-chip${prio !== "all" || tag !== "all" ? " on" : ""}`}>
                {Ico.tag}{prio === "all" && tag === "all" ? "Priority / Tag" : [prio === "flagged" ? "High + Urgent" : prio === "urgent" ? "Urgent" : "", tag !== "all" ? tag : ""].filter(Boolean).join(" · ")}{Ico.chevD}
              </button>
            )}>
              {(close) => (
                <>
                  <div className="ap-menu-label">প্রায়োরিটি · Priority</div>
                  {([["all", "All orders"], ["flagged", "High + Urgent"], ["urgent", "Urgent only"]] as const).map(([id, label]) => (
                    <button key={id} type="button" className="ap-menu-item" onClick={() => { setPrio(id); close(); }}>
                      {prio === id ? Ico.check : <i className="od-menu-gap" />}{label}
                    </button>
                  ))}
                  <div className="ap-menu-sep" />
                  <div className="ap-menu-label">ট্যাগ · Tag</div>
                  <button type="button" className="ap-menu-item" onClick={() => { setTag("all"); close(); }}>{tag === "all" ? Ico.check : <i className="od-menu-gap" />}All tags</button>
                  {orderTags.map((t) => (
                    <button key={t.id} type="button" className="ap-menu-item" onClick={() => { setTag(t.name); close(); }}>
                      {tag === t.name ? Ico.check : <i className="od-menu-gap" />}{t.name}
                      <small>{bn(t.orders)}</small>
                    </button>
                  ))}
                </>
              )}
            </Menu>
          </span>
          <span className="spacer" />
          <span className="od-count">{bn(total)}টি অর্ডার</span>
          {activeFilters ? <button type="button" className="ap-btn sm ghost" onClick={clearFilters}>{Ico.close}ফিল্টার মুছুন <em className="od-btn-n">{bn(activeFilters)}</em></button> : null}
          <Menu trigger={() => <button type="button" className="ap-btn sm">{OI.sort}{SORTS.find((s) => s.id === sort)?.bn}</button>}>
            {(close) => (
              <>
                <div className="ap-menu-label">সাজান · Sort</div>
                {SORTS.map((s) => (
                  <button key={s.id} type="button" className="ap-menu-item" onClick={() => { setSort(s.id); close(); }}>
                    {sort === s.id ? Ico.check : <i className="od-menu-gap" />}{s.bn}<small>{s.en}</small>
                  </button>
                ))}
              </>
            )}
          </Menu>
        </div>
        <div className="od-filters">
          <div className="od-fgroup">
            <span className="od-flabel">তারিখ</span>
            <Segmented size="sm" value={range === "custom" ? "custom" : range} onChange={(v) => { setRange(v); setFrom(""); setTo(""); }}
              options={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
            <span className="od-range">
              <BnRangeButton on={range === "custom"} from={from} to={to} marked={[]} onChange={(a, b) => { setRange("custom"); setFrom(a); setTo(b); }} />
            </span>
          </div>
          <div className="od-fgroup">
            <span className="od-flabel">পেমেন্ট</span>
            <Segmented size="sm" value={pay} onChange={setPay} options={[
              { id: "all", label: "সব" }, { id: "cod", label: "ক্যাশ অন" }, { id: "ssl", label: "SSL" }, { id: "due", label: "বকেয়া" },
            ]} />
          </div>
          <div className="od-fgroup">
            <span className="od-flabel">বিভাগ</span>
            <button type="button" className={`ap-chip${vert === "all" ? " on" : ""}`} onClick={() => setVert("all")}>সব</button>
            {sections.map((v) => (
              <button key={v.code} type="button" className={`ap-chip od-vchip${vert === v.code ? " on" : ""}`} onClick={() => setVert(v.code)}>
                <SectionIcon code={v.code} section={v} />{v.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "board" ? board : listQ.isLoading ? (
        <div className="od-tablecard"><Empty icon={Ico.orders} title="লোড হচ্ছে…" /></div>
      ) : !rows.length ? (
        <div className="od-tablecard">
          <Empty icon={Ico.orders} title={anyOrders ? "এই ফিল্টারে অর্ডার নেই" : "এখনো কোনো অর্ডার আসেনি"}
            sub={anyOrders ? "ফিল্টার বদলে বা মুছে আবার দেখুন · No orders match" : "নতুন অর্ডার এলে এখানে দেখা যাবে"}
            action={activeFilters || status !== "all" ? <button type="button" className="ap-btn sm" onClick={() => { clearFilters(); setStatus("all"); }}>সব ফিল্টার মুছুন</button> : undefined} />
        </div>
      ) : list}

      {view === "list" && rows.length ? <Pager cur={cur} pages={pages} total={total} size={size} onPage={goPage} onSize={(n) => { setSize(n); setPage(1); }} unit="টি অর্ডার" /> : null}

      {sel.size ? (
        <div className="ap-bulk od-bulk" role="toolbar" aria-label="বাছাই করা অর্ডার">
          <b>{bn(sel.size)}টি বাছাই</b>
          {bulkPending.length ? <button type="button" className="ap-btn gold" disabled={bulkM.isPending} onClick={() => void bulkConfirm()}>{Ico.check}কনফার্ম ({bn(bulkPending.length)})</button> : null}
          {bulkNext.length ? <button type="button" className="ap-btn" disabled={bulkM.isPending} onClick={() => void bulkAdvance()}>{Ico.chevR}পরের ধাপ ({bn(bulkNext.length)})</button> : null}
          {bulkPay.length ? <button type="button" className="ap-btn" disabled={bulkPaidM.isPending} onClick={() => void bulkMarkPaid()}>{Ico.cash}টাকা পেয়েছি ({bn(bulkPay.length)})</button> : null}
          <button type="button" className="ap-btn" onClick={openPick}>{Ico.print}পিক-লিস্ট</button>
          <button type="button" className="ap-btn" onClick={exportSelected}>{Ico.download}CSV</button>
          <button type="button" className="ap-btn" onClick={sel.clear}>{Ico.close}বাতিল</button>
        </div>
      ) : null}

      <Drawer open={drawerOpen} onClose={closeDrawer} width={620}
        title={!detail ? (detailQ.isError ? "অর্ডার পাওয়া যায়নি" : "লোড হচ্ছে…") : undefined}
        head={detail ? (
          <DrawerHead o={detail} onPriority={(p) => prioM.mutate({ ref: detail.orderNo, priority: toApi(p) })}
            onCopied={() => toast("আইডি কপি হয়েছে")} />
        ) : undefined}
        footer={detail ? (
          <div className="od-dfoot">
            <div className="od-nav">
              <button type="button" className="ap-icon-btn sm" aria-label="আগের অর্ডার" disabled={idx <= 0} onClick={() => step(-1)}>{Ico.up}</button>
              <button type="button" className="ap-icon-btn sm" aria-label="পরের অর্ডার" disabled={idx < 0 || idx >= rows.length - 1} onClick={() => step(1)}>{Ico.down}</button>
              <small>{idx >= 0 ? `${bn((cur - 1) * size + idx + 1)} / ${bn(total)}` : "ফিল্টারের বাইরে"} · <Kbd>J</Kbd><Kbd>K</Kbd></small>
            </div>
            <span className="spacer" />
            {isClosedStatus(detail.status) ? <button type="button" className="ap-btn" onClick={() => void reopenOrder(detail)}>{OI.undo}বাতিল থেকে ফিরিয়ে আনুন</button> : null}
            {detail.next ? (
              <button type="button" className="ap-btn primary" disabled={changeM.isPending} onClick={() => advance(detail)}>{Ico.check}{nextLabel(detail)}</button>
            ) : null}
          </div>
        ) : undefined}>
        {detail ? (
          <OrderPanel key={detail.id} o={detail}
            onAdvance={() => advance(detail)} onRegress={() => void regress(detail)} onCancel={() => askCancel(detail)} onReopen={() => void reopenOrder(detail)}
            onPay={() => void payOrder(detail)} onPaper={setSheet}
            onCustomer={() => (detail.customer ? go("customers", detail.customer.id) : undefined)}
            onProduct={(id) => go("products", id)} onPack={() => go("packs")} />
        ) : null}
      </Drawer>



      <Modal open={!!pick} onClose={() => setPick(null)} width={680} title="পিক-লিস্ট · Pick list"
        sub={pick ? `${bn(pick.length)}টি অর্ডার · পণ্য অনুযায়ী সাজানো` : undefined}
        footer={<><button type="button" className="ap-btn ghost" onClick={() => setPick(null)}>বন্ধ</button><button type="button" className="ap-btn primary" onClick={() => { const el = document.querySelector<HTMLElement>(".od-picklist-print"); if (el) printElement(el, "Pick list"); }}>{Ico.print}প্রিন্ট</button></>}>
        {pick ? <div className="od-picklist-print"><PickListView ids={pick} /></div> : null}
      </Modal>

      <DocModal doc={sheet} onClose={() => setSheet(null)} title={sheet?.title} sub="Document · প্রিন্ট করা যায়" />
    </div>
  );
}

function retName(o: Row | OrderDetail) {
  return "contact" in o ? o.contact.name : o.customer?.name || "গেস্ট";
}
function retTotal(o: Row | OrderDetail) {
  return "money" in o ? o.money.grandTotal : o.grandTotal;
}

/* ═══════════════════════════ confirm-sheet fields ═══════════════════════════ */

function NumberField({ label, onChange }: { label: string; onChange: (n: number) => void }) {
  const [v, setV] = useState("");
  return (
    <label>
      <span className="ap-cf-lbl">{label}</span>
      <input type="number" min={0} inputMode="numeric" value={v} placeholder="০" onChange={(e) => { setV(e.target.value); onChange(Math.max(0, Number(e.target.value) || 0)); }} />
    </label>
  );
}

function ReopenAs({ initial, onChange }: { initial: "PENDING" | "CONFIRMED"; onChange: (v: "PENDING" | "CONFIRMED") => void }) {
  const [to, setTo] = useState(initial);
  return (
    <div>
      <span className="ap-cf-lbl">কোন ধাপে ফিরবে · Reopen as</span>
      <Segmented<"PENDING" | "CONFIRMED"> value={to} onChange={(v) => { setTo(v); onChange(v); }} options={[
        { id: "PENDING", label: "অপেক্ষমাণ" },
        { id: "CONFIRMED", label: "কনফার্ম" },
      ]} />
      <p>{to === "CONFIRMED" ? "সরাসরি কনফার্ম — নতুন ইনভয়েস কাটা হবে।" : "অপেক্ষমাণে ফিরবে — আবার কনফার্ম করতে হবে।"}</p>
    </div>
  );
}

/* ═══════════════════════════ pieces ═══════════════════════════ */

function DrawerHead({ o, onPriority, onCopied }: { o: OrderDetail; onPriority: (p: Priority) => void; onCopied: () => void }) {
  const at = ms(o.timestamps.placedAt);
  const cur = toUi(o.priority);
  return (
    <div className="od-dhead">
      <div className="od-dhead-top">
        <h2>{o.orderNo}</h2>
        <CopyBtn text={o.orderNo} onCopied={onCopied} />
        <StatusPill status={o.status} />
      </div>
      <p>{when(at)} · {ago(at)} · {payName(o.paymentMethod)}</p>
      <div className="od-prio" role="radiogroup" aria-label="প্রায়োরিটি">
        {(Object.keys(PRIORITY) as Priority[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={cur === p} className={`p-${p}${cur === p ? " on" : ""}`} onClick={() => onPriority(p)}>
            {p !== "normal" ? OI.flag : null}{PRIORITY[p].en}
          </button>
        ))}
      </div>
    </div>
  );
}

function stepAt(o: OrderDetail, s: OrderStatus) {
  for (let i = o.history.length - 1; i >= 0; i--) if (o.history[i].to === s) return ms(o.history[i].at);
  if (s === "PENDING") return ms(o.timestamps.placedAt);
  if (s === "CONFIRMED") return ms(o.timestamps.confirmedAt);
  return 0;
}

function Stepper({ o }: { o: OrderDetail }) {
  const cancelled = isClosedStatus(o.status);
  const reachedStatus: OrderStatus = cancelled ? o.cancelledFrom ?? "PENDING" : o.status;
  const reached = FLOW.indexOf(reachedStatus);
  const steps = cancelled ? STEPS.filter((_, i) => i <= Math.max(0, reached)) : STEPS;
  const deadAt = ms(o.timestamps.cancelledAt);
  return (
    <ol className={`od-steps${cancelled ? " cancelled" : ""}`} style={{ ["--n" as string]: steps.length + (cancelled ? 1 : 0) }}>
      {steps.map((s, i) => {
        const done = i < reached || (i === reached && (cancelled || s.status === "DELIVERED"));
        const current = !cancelled && i === reached && s.status !== "DELIVERED";
        const at = stepAt(o, s.status);
        return (
          <li key={s.status} className={done ? "done" : current ? "cur" : ""}>
            <span className="od-step-dot">{done ? Ico.check : null}</span>
            <b>{s.bn}</b>
            <small>{at ? when(at) : s.en}</small>
          </li>
        );
      })}
      {cancelled ? (
        <li className="bad">
          <span className="od-step-dot">{Ico.close}</span>
          <b>{o.status === "RETURNED" ? "ফেরত" : "বাতিল"}</b>
          <small>{deadAt ? when(deadAt) : o.status === "RETURNED" ? "Returned" : "Cancelled"}</small>
        </li>
      ) : null}
    </ol>
  );
}

function OrderPanel({ o, onAdvance, onRegress, onCancel, onReopen, onPay, onPaper, onCustomer, onProduct, onPack }: {
  o: OrderDetail;
  onAdvance: () => void; onRegress: () => void; onCancel: () => void; onReopen: () => void; onPay: () => void;
  onPaper: (p: { id: string; title: string }) => void;
  onCustomer: () => void; onProduct: (id: string) => void; onPack: (id: string) => void;
}) {
  const toast = useToast();
  const couriersQ = useCouriers();
  const tagsQ = useOrderTags();
  const assign = useAssignShipment();
  const addTag = useAddOrderTag();
  const removeTag = useRemoveOrderTag();
  const addNote = useAddOrderNote();
  const delNote = useDeleteOrderNote();
  const ship = o.shipments.find((s) => s.status !== "CANCELLED" && s.status !== "RETURNED") ?? null;
  const couriers = (couriersQ.data ?? []).filter((c) => c.isActive);
  const [courier, setCourierCode] = useState(ship?.courier.code || "");
  const [tracking, setTracking] = useState(ship?.trackingNo || "");
  const [note, setNote] = useState("");
  useEffect(() => { if (!courier && couriers[0]) setCourierCode(ship?.courier.code || couriers[0].code); }, [couriers, courier, ship]);
  const m = o.money;
  const closed = isClosedStatus(o.status);
  const phone = o.contact.phone;
  const courierDirty = (ship?.courier.code || "") !== courier || (ship?.trackingNo || "") !== tracking;
  const orderTags = tagsQ.data ?? [];
  const sections = [...new Set(o.items.map((i) => i.sectionCode).filter((x): x is string => !!x))];

  function saveCourier() {
    if (!courier) return;
    if (ship && ship.courier.code === courier) assign.mutate({ order: o.orderNo, courier, trackingNo: tracking, shipmentId: ship.id });
    else assign.mutate({ order: o.orderNo, courier, trackingNo: tracking });
  }
  function submitNote() {
    if (!note.trim()) return;
    addNote.mutate({ ref: o.orderNo, body: note.trim() }, { onSuccess: () => setNote("") });
  }
  function copy(text: string, msg: string) {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    toast(msg);
  }
  function toggleTag(name: string) {
    const hit = o.tags.find((t) => t.name === name);
    if (hit) removeTag.mutate({ ref: o.orderNo, tagId: hit.id });
    else addTag.mutate({ ref: o.orderNo, name });
  }

  /* timeline: status history + courier + documents */
  const events = useMemo(() => {
    const out: { at: number; title: string; by?: string; note?: string | null; tone: string }[] = [];
    for (const h of o.history) {
      const reopened = !!h.from && isClosedStatus(h.from) && !isClosedStatus(h.to);
      out.push({
        at: ms(h.at),
        title: h.from == null ? "অর্ডার এসেছে" : reopened ? `ফিরিয়ে আনা → ${statusLabel(h.to)}` : statusLabel(h.to),
        by: h.by?.name ?? (h.actorType === "SYSTEM" ? "সিস্টেম" : undefined),
        note: h.note,
        tone: reopened ? "live" : statusTone(h.to),
      });
    }
    for (const s of o.shipments) if (s.createdAt) out.push({ at: ms(s.createdAt), title: `কুরিয়ার: ${s.courier.name}${s.trackingNo ? ` · ${s.trackingNo}` : ""}`, tone: "ship" });
    for (const d of o.documents) out.push({ at: ms(d.issuedAt), title: `${DOC_NAME[d.kind] ?? d.kind} কাটা হয়েছে`, tone: d.kind === "CREDIT_NOTE" ? "bad" : "paper" });
    return out.sort((a, b) => b.at - a.at);
  }, [o.history, o.shipments, o.documents]);

  const pinned = o.notes.filter((n) => n.isPinned);
  const rest = o.notes.filter((n) => !n.isPinned);

  return (
    <div className="od-panel">
      <Stepper o={o} />

      <div className="od-actions">
        {o.next ? <button type="button" className="ap-btn primary" onClick={onAdvance}>{Ico.check}{nextLabel(o)}</button> : null}
        {o.canRegress ? <button type="button" className="ap-btn" onClick={onRegress}>{OI.undo}আগের ধাপ</button> : null}
        {closed ? <button type="button" className="ap-btn primary" onClick={onReopen}>{OI.undo}বাতিল থেকে ফিরিয়ে আনুন</button> : null}
        {!closed && o.status !== "PENDING" && o.paymentStatus === "UNPAID" ? <button type="button" className="ap-btn gold" onClick={onPay}>{Ico.cash}বকেয়া · টাকা পেয়েছি</button> : null}
        {!closed && o.paymentStatus !== "UNPAID" ? <Badge tone="green" dot>টাকা পেয়েছি · Paid</Badge> : null}
        <span className="spacer" />
        <a className="ap-icon-btn" href={`tel:${phone}`} title="কল করুন" aria-label="কল করুন">{Ico.phone}</a>
        <a className="ap-icon-btn od-wa" href={waLink(phone)} target="_blank" rel="noreferrer" title="WhatsApp" aria-label="WhatsApp">{Ico.whatsapp}</a>
        <button type="button" className="ap-icon-btn" title="ঠিকানা কপি" aria-label="ঠিকানা কপি" onClick={() => copy(`${o.contact.name}\n${localPhone(phone)}\n${o.address.text}`, "ঠিকানা কপি হয়েছে")}>{OI.pin}</button>
        {voidTarget(o.status) ? <button type="button" className="ap-btn danger" onClick={onCancel}>{Ico.close}{o.status === "PENDING" ? "বাতিল" : "ফেরত"}</button> : null}
      </div>

      {closed && o.cancelReason ? <p className="od-hint">{Ico.alert}{o.status === "RETURNED" ? "ফেরতের" : "বাতিলের"} কারণ: {o.cancelReason}</p> : null}

      {pinned.length ? (
        <ul className="od-notes od-pinned">
          {pinned.map((nt) => (
            <li key={nt.id} style={{ borderLeft: "3px solid var(--ap-gold, #C4A15A)", background: "var(--ap-surface2, var(--k-faf6f0))" }}>
              <Avatar name={nt.by?.name || "স"} size={28} />
              <div>
                <p><b>📌 </b>{nt.body}</p>
                <small>{nt.by?.name || "সিস্টেম"} · <span title={when(ms(nt.at))}>{ago(ms(nt.at))}</span></small>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* customer */}
      <section className="od-sec">
        <h4>কাস্টমার <span>Customer</span></h4>
        {o.customer?.isBlocked ? (
          <div className="od-blocked" role="alert">
            {Ico.alert}
            <div><b>এই কাস্টমার ব্লক করা · Blocked</b><small>{o.customer.blockedReason || "কনফার্ম করার আগে ফোনে যাচাই করুন। COD এড়িয়ে চলুন।"}</small></div>
          </div>
        ) : null}
        <div className="od-custcard">
          <Avatar name={o.contact.name} size={44} />
          <div className="od-custcard-main">
            <b>{o.contact.name}</b>
            <span><a href={`tel:${phone}`}>{localPhone(phone)}</a>{o.contact.email ? ` · ${o.contact.email}` : ""}</span>
            <p>{Ico.store}{o.address.text || "ঠিকানা নেই"}</p>
          </div>
          {o.customer ? <button type="button" className="ap-btn sm" onClick={onCustomer}>প্রোফাইল{Ico.chevR}</button> : null}
        </div>
        <div className="od-custstats">
          <span><b>{bn(o.customer?.ordersCount ?? 1)}</b>মোট অর্ডার</span>
          <span><b>{tk(o.customer?.totalSpent ?? 0)}</b>মোট কেনা</span>
          <span className={o.customer?.cancelledOrders ? "warn" : ""}><b>{bn(o.customer?.cancelledOrders ?? 0)}</b>বাতিল</span>
          <span><VertTags list={sections} /></span>
        </div>
        {o.customerNote ? <p className="od-hint soft">{Ico.note}কাস্টমারের নোট: {o.customerNote}</p> : null}
      </section>

      {/* items */}
      <section className="od-sec">
        <h4>পণ্য <span>Items · {bn(o.items.length)}</span></h4>
        <ul className="od-lines">
          {o.items.map((line) => {
            const look: Look = { title: line.title };
            const margin = line.margin;
            return (
              <li key={line.id}>
                <Thumb look={look} size={40} />
                <div className="od-line-main">
                  <button type="button" className="od-link" onClick={() => (line.kind === "BUNDLE" ? onPack(line.bundleId ?? "") : line.productId && onProduct(line.productId))}>{line.title}</button>
                  <small>
                    {line.kind === "BUNDLE" ? <Badge tone="gold">প্যাকেজ · {bn(line.components.length)} বই</Badge> : null}
                    {bn(line.quantity)} × {tk(line.unitPrice)}
                    {line.unitCost != null ? ` · কেনা ${tk(line.unitCost)}` : " · কেনা দাম নেই"}
                    {line.quantityReturned ? ` · ফেরত ${bn(line.quantityReturned)}` : ""}
                  </small>
                </div>
                <div className="od-line-num">
                  <b>{tk(line.lineTotal)}</b>
                  {margin != null ? <small className={margin >= 0 ? "ok" : "bad"}>মার্জিন {tk(margin)}{line.lineTotal ? ` · ${bn(Math.round((margin / line.lineTotal) * 100))}%` : ""}</small> : <small>—</small>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* money */}
      <section className="od-sec">
        <h4>হিসাব <span>Money</span></h4>
        <dl className="ap-kv od-money">
          <dt>সাবটোটাল</dt><dd>{tk(m.itemsSubtotal)}</dd>
          {m.discountTotal ? <><dt>কুপন {m.couponCode ? <Badge tone="gold">{m.couponCode}</Badge> : null}</dt><dd className="neg">−{tk(m.discountTotal)}</dd></> : null}
          <dt>ডেলিভারি চার্জ (নেওয়া){m.shippingFeeReason ? <small> · {m.shippingFeeReason}</small> : null}</dt><dd>{tk(m.shippingFee)}</dd>
          <dt className="total">কাস্টমার দেবে</dt><dd className="total">{tk(m.grandTotal)}</dd>
          {m.amountPaid ? <><dt>পরিশোধ</dt><dd>{tk(m.amountPaid)}</dd></> : null}
          {m.amountRefunded ? <><dt>রিফান্ড</dt><dd className="neg">−{tk(m.amountRefunded)}</dd></> : null}
          <dt>পণ্যের কেনা দাম{!m.profitComplete ? " (আংশিক)" : ""}</dt><dd className="neg">{m.itemsCost != null ? `−${tk(m.itemsCost)}` : "—"}</dd>
          <dt>কুরিয়ার খরচ</dt><dd className="neg">−{tk(m.courierCost)}</dd>
          {m.gatewayFee ? <><dt>SSL ফি</dt><dd className="neg">−{tk(m.gatewayFee)}</dd></> : null}
          {m.courierLoss ? <><dt>কুরিয়ার লস</dt><dd className="neg">−{tk(m.courierLoss)}</dd></> : null}
          <dt className="profit">আনুমানিক নিট লাভ</dt>
          <dd className={`profit${(m.estimatedProfit ?? 0) < 0 ? " bad" : ""}`}>{m.estimatedProfit == null ? "—" : m.profitComplete ? tk(m.estimatedProfit) : `${tk(m.estimatedProfit)}*`}</dd>
        </dl>
        {!m.profitComplete ? <p className="od-hint soft">* কিছু পণ্যের কেনা দাম জানা নেই, লাভ বেশি দেখাতে পারে।</p> : null}
      </section>

      {/* courier */}
      <section className="od-sec">
        <h4>কুরিয়ার <span>Shipping</span></h4>
        <div className="od-courier">
          <div>
            <label htmlFor="od-cname">কুরিয়ার</label>
            <select id="od-cname" value={courier} onChange={(e) => setCourierCode(e.target.value)}>
              {couriers.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="od-track">ট্র্যাকিং নম্বর</label>
            <input id="od-track" value={tracking} placeholder="যেমন: DT0419…" onChange={(e) => setTracking(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveCourier(); }} />
          </div>
          <button type="button" className="ap-btn primary" disabled={(!courierDirty && !!ship) || assign.isPending || !courier} onClick={saveCourier}>সেভ</button>
        </div>
        {ship ? (
          <p className="od-courier-saved">{Ico.truck}<b>{ship.courier.name}</b>{ship.trackingNo ? <> · {ship.trackingUrl ? <a href={ship.trackingUrl} target="_blank" rel="noreferrer">{ship.trackingNo}</a> : ship.trackingNo} <CopyBtn text={ship.trackingNo} onCopied={() => toast("ট্র্যাকিং কপি হয়েছে")} /></> : null}<small>{ship.status}</small></p>
        ) : o.status === "CONFIRMED" || o.status === "PROCESSING" ? <p className="od-hint soft">কুরিয়ারে তোলার আগে কুরিয়ার ও ট্র্যাকিং দিন।</p> : null}
      </section>

      {/* tags */}
      <section className="od-sec">
        <h4>ট্যাগ <span>Tags</span></h4>
        <div className="od-tagpick">
          {[...new Set([...orderTags.map((t) => t.name), ...o.tags.map((t) => t.name)])].map((t) => {
            const on = o.tags.some((x) => x.name === t);
            const color = orderTags.find((x) => x.name === t)?.color || o.tags.find((x) => x.name === t)?.color || "#8A6230";
            return <button key={t} type="button" className={`od-tag-chip${on ? " on" : ""}`} style={{ ["--tc" as string]: color }} aria-pressed={on} onClick={() => toggleTag(t)}>{on ? Ico.check : Ico.plus}{t}</button>;
          })}
        </div>
      </section>

      {/* notes */}
      <section className="od-sec">
        <h4>ইন্টারনাল নোট <span>Notes · {bn(o.notes.length)}</span></h4>
        <div className="od-note-add">
          <textarea value={note} rows={2} placeholder="টিমের জন্য নোট লিখুন… (⌘/Ctrl + Enter)" onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submitNote(); } }} />
          <button type="button" className="ap-btn primary sm" disabled={!note.trim() || addNote.isPending} onClick={submitNote}>যোগ করুন</button>
        </div>
        {o.notes.length ? (
          <ul className="od-notes">
            {[...pinned, ...rest].map((nt) => (
              <li key={nt.id}>
                <Avatar name={nt.by?.name || "স"} size={28} />
                <div>
                  <p>{nt.isPinned ? "📌 " : ""}{nt.body}</p>
                  <small>{nt.by?.name || "সিস্টেম"} · <span title={when(ms(nt.at))}>{ago(ms(nt.at))}</span></small>
                </div>
                <button type="button" className="ap-icon-btn sm" aria-label="নোট মুছুন" onClick={() => delNote.mutate({ ref: o.orderNo, noteId: nt.id })}>{Ico.trash}</button>
              </li>
            ))}
          </ul>
        ) : <p className="od-hint soft">এখনো কোনো নোট নেই।</p>}
      </section>

      {/* papers */}
      <section className="od-sec">
        <h4>কাগজপত্র <span>Documents</span></h4>
        {o.documents.length ? (
          <div className="od-papers">
            {o.documents.map((d) => (
              <button key={d.id} type="button" className={`od-paper k-${DOC_KIND[d.kind] ?? "invoice"}`} onClick={() => onPaper({ id: d.id, title: `${DOC_NAME[d.kind] ?? d.kind} · ${d.docNo}` })}>
                {Ico.note}
                <span><b>{DOC_NAME[d.kind] ?? d.kind}</b><small>{d.docNo} · {when(ms(d.issuedAt))}</small></span>
                {Ico.chevR}
              </button>
            ))}
          </div>
        ) : <p className="od-hint soft">কনফার্ম করলে ইনভয়েস তৈরি হবে।</p>}
      </section>

      {/* timeline */}
      <section className="od-sec">
        <h4>ইতিহাস <span>History</span></h4>
        <ol className="od-timeline">
          {events.map((ev, i) => (
            <li key={i} className={`t-${ev.tone}`}>
              <i />
              <div><b>{ev.title}</b><small>{when(ev.at)}{ev.by ? ` · ${ev.by}` : ""}</small>{ev.note ? <small>{ev.note}</small> : null}</div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function PickListView({ ids }: { ids: string[] }) {
  const q = usePickList(ids);
  const d = q.data;
  if (!d) return <p className="od-hint soft">{q.isError ? "পিক-লিস্ট লোড করা যায়নি" : "লোড হচ্ছে…"}</p>;
  return (
    <div className="paper-print od-pick">
      <div className="od-pick-head">
        <b>পিক-লিস্ট · Pick list</b>
        <small>{dateOnly(Date.now())} · {bn(d.orders.length)}টি অর্ডার · {bn(d.units)}টি ইউনিট</small>
      </div>
      <table className="ap-table od-pick-table">
        <thead><tr><th aria-label="নেওয়া হয়েছে" /><th>পণ্য</th><th className="num">পরিমাণ</th><th className="num">স্টক</th><th>অর্ডার</th></tr></thead>
        <tbody>
          {d.groups.map((g) => (
            <tr key={g.productId}>
              <td><span className="od-pick-box" /></td>
              <td><div className="od-pick-item"><Thumb look={{ title: g.title }} size={26} /><span><b>{g.title}</b>{g.viaBundles.length ? <small>প্যাকেজ: {g.viaBundles.join(", ")}</small> : g.sku ? <small>{g.sku}</small> : null}</span></div></td>
              <td className="num"><b>{bn(g.quantity)}</b></td>
              <td className={`num${g.shortfall > 0 ? " short" : ""}`}>{bn(g.stockOnHand)}</td>
              <td className="od-pick-orders">{g.orders.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="od-pick-orderlist">
        {d.orders.map((o) => (
          <div key={o.orderNo}><b>{o.orderNo}</b> · {o.contactName} · {o.contactPhone}<small>{o.address}</small></div>
        ))}
      </div>
    </div>
  );
}
