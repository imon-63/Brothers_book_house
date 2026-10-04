"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OrderFacts, OrderSteps, orderGlance, toTrackOrder, type TrackOrder } from "@/components/orders/delivery-track";
import { api, get } from "@/lib/api/client";
import { useMe } from "@/lib/api/auth";
import { apiErrorText, startSslPayment, useCancelMyOrder, useGuestOrders, useMyOrders, placedOrders } from "@/lib/api/shop";
import { bn } from "@/lib/format";
import { EmptyState } from "@/components/storefront/empty-state";
import { GBox } from "@/components/storefront/glyphs";
import { PageHero } from "@/components/storefront/page-head";
import { RowSkeleton } from "@/components/storefront/skeleton";
import { setAuth, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch } from "@/store/hooks";

type MyDoc = { id: string; docNo: string; kind: string; kindLabel?: string; orderId?: string; orderNo?: string };

function DocSheet({ doc, onClose }: { doc: MyDoc; onClose: () => void }) {
  const q = useQuery({ queryKey: ["me", "doc", doc.id], queryFn: () => api<string>(`/me/documents/${doc.id}/html`, { headers: { accept: "text/html" } }) });
  return (
    <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="box" style={{ maxWidth: 820, margin: "4vh auto", width: "calc(100vw - 24px)" }}>
        <button type="button" className="x" onClick={onClose}>×</button>
        <h3 className="serif">{doc.kindLabel ?? doc.kind} · {doc.docNo}</h3>
        {q.data ? <iframe title="document" srcDoc={q.data} sandbox="allow-same-origin allow-modals" style={{ width: "100%", height: "70vh", border: 0, background: "#fff" }} /> : <p className="author">{q.isError ? "কাগজটি লোড করা যায়নি" : "লোড হচ্ছে…"}</p>}
      </div>
    </div>
  );
}

function MyOrderBody({ order, docs, onPaper }: { order: TrackOrder; docs: MyDoc[]; onPaper: (d: MyDoc) => void }) {
  const { me } = useMe();
  const dispatch = useAppDispatch();
  const cancel = useCancelMyOrder();
  const detail = useQuery({
    queryKey: ["me", "order", order.orderNo],
    enabled: !!me,
    queryFn: () => get(`/me/orders/${encodeURIComponent(order.orderNo)}`).then(toTrackOrder),
  });
  const o = detail.data ?? order;
  const mine = docs.filter((d) => d.orderNo === o.orderNo);
  const unpaidSsl = o.paymentMethod === "SSLCOMMERZ" && !o.paid && o.status !== "CANCELLED";
  async function pay() {
    try {
      const url = await startSslPayment({ orderNo: o.orderNo, phone: o.phone ?? placedOrders().find((x) => x.orderNo === o.orderNo)?.phone });
      if (url) window.location.assign(url);
    } catch (e) {
      dispatch(showToast(apiErrorText(e)));
    }
  }
  return (
    <>
      <OrderFacts order={o} mode="user" />
      <OrderSteps order={o} />
      <div className="admin-ord-acts" style={{ marginTop: 10 }}>
        {mine.map((p) => (
          <button key={p.id} type="button" className="btn btn-ghost btn-sm" onClick={() => onPaper(p)}>
            {p.kindLabel ?? (p.kind === "INVOICE" ? "ইনভয়েস" : p.kind === "RECEIPT" ? "রিসিট" : "ক্রেডিট নোট")}
          </button>
        ))}
        {unpaidSsl ? <button type="button" className="btn btn-gold btn-sm" onClick={() => void pay()}>এখন পেমেন্ট করুন</button> : null}
        {me && o.canCancel ? (
          <button type="button" className="btn btn-ghost btn-sm" disabled={cancel.isPending} onClick={() => {
            if (!window.confirm("অর্ডারটি বাতিল করবেন?")) return;
            cancel.mutate({ orderNo: o.orderNo, reason: "কাস্টমার বাতিল করেছেন" }, {
              onSuccess: () => dispatch(showToast("অর্ডার বাতিল হয়েছে")),
              onError: (e) => dispatch(showToast(apiErrorText(e))),
            });
          }}>অর্ডার বাতিল</button>
        ) : null}
      </div>
    </>
  );
}

export default function OrdersPage() {
  const dispatch = useAppDispatch();
  const { me: user, loading } = useMe();
  const mineQ = useMyOrders();
  const guestQ = useGuestOrders(!loading && !user);
  const docsQ = useQuery({ queryKey: ["me", "docs", user?.id], enabled: !!user, queryFn: () => get<{ items: MyDoc[] }>("/me/documents").then((r) => r.items) });
  const [cheerId, setCheerId] = useState("");
  const [sslNote, setSslNote] = useState<"" | "success" | "fail" | "cancel">("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<MyDoc | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("cholo_placed") === "1" || new URLSearchParams(window.location.search).get("ssl")) {
        const last = placedOrders()[0];
        if (last) setCheerId(last.orderNo);
        sessionStorage.removeItem("cholo_placed");
      }
    } catch { /* ignore */ }
    const ssl = new URLSearchParams(window.location.search).get("ssl");
    if (ssl === "success" || ssl === "fail" || ssl === "cancel") {
      setSslNote(ssl);
      dispatch(showToast(ssl === "success" ? "পেমেন্ট সফল হয়েছে" : ssl === "cancel" ? "পেমেন্ট বাতিল" : "পেমেন্ট হয়নি"));
      window.history.replaceState(null, "", "/orders");
    }
  }, [dispatch]);

  const orders: TrackOrder[] = useMemo(() => {
    if (user) return (mineQ.data?.items ?? []).map(toTrackOrder);
    return (guestQ.data ?? []).map(toTrackOrder);
  }, [user, mineQ.data, guestQ.data]);

  const shown = openId ?? cheerId ?? orders[0]?.orderNo ?? null;
  const cheer = orders.find((o) => o.orderNo === cheerId);
  const busy = loading || (user ? mineQ.isLoading : guestQ.isLoading);

  const liveN = orders.filter((o) => orderGlance(o).kind === "live" || orderGlance(o).kind === "hold").length;
  const spent = orders.filter((o) => o.status !== "CANCELLED" && o.status !== "RETURNED").reduce((s2, o) => s2 + o.grandTotal, 0);

  return (
    <div className="wrap sf-orders" style={{ paddingBottom: 48 }}>
      <div className="order-col sf-order-col">
      <PageHero
        crumbs={[{ label: "হোম", href: "/" }, { label: "আমার অর্ডার" }]}
        kicker="অর্ডার ও ডেলিভারি"
        icon={<GBox size={16} />}
        title="আমার অর্ডার"
        sub={user ? "প্রতিটা অর্ডারের ধাপ, রসিদ আর পেমেন্ট এক জায়গায়।" : "এই ডিভাইস থেকে করা অর্ডার এখানে দেখাবে।"}
        aside={orders.length ? (
          <>
            <span className="sf-stat-chip"><b>{bn(orders.length)}</b><small>মোট অর্ডার</small></span>
            <span className="sf-stat-chip"><b>{bn(liveN)}</b><small>চলমান</small></span>
            {spent ? <span className="sf-stat-chip"><b>৳{bn(spent)}</b><small>কেনাকাটা</small></span> : null}
          </>
        ) : null}
      />
      {cheer ? (
        <div className={`cheer sf-cheer${sslNote === "fail" || sslNote === "cancel" ? " warn" : ""}`} role="status">
          <span className="sf-confetti" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</span>
          <span className="cheer-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 13.2 9.2 17.5 19 7" /></svg>
          </span>
          <div>
            <small>চলো</small>
            <h3>{sslNote === "fail" || sslNote === "cancel" ? "অর্ডার রাখা হয়েছে · পেমেন্ট হয়নি" : "অর্ডার হয়েছে"}</h3>
            <p>ধন্যবাদ{cheer.name ? `, ${cheer.name.split(" ")[0]}` : ""}। আপনার অর্ডার <b>{cheer.orderNo}</b></p>
          </div>
          <Link className="sf-cheer-go" href="/shop">আরও কেনাকাটা</Link>
        </div>
      ) : null}
      {busy && !orders.length ? <RowSkeleton n={3} /> : !orders.length ? (
        user ? (
          <EmptyState art="box" title="এখনো কোনো অর্ডার নেই" text="প্রথম অর্ডারটা করে ফেলুন — ধাপে ধাপে ডেলিভারি এখানেই দেখবেন।">
            <Link className="btn btn-primary" href="/shop">কেনাকাটা শুরু করুন</Link>
          </EmptyState>
        ) : (
          <EmptyState art="truck" title="এই ডিভাইসে কোনো অর্ডার নেই" text="আগের অর্ডার দেখতে লগইন করুন, অথবা মোবাইল নম্বর দিয়ে খুঁজুন।">
            <button className="btn btn-primary" type="button" onClick={() => dispatch(setAuth(true))}>লগইন</button>
            <Link className="btn btn-ghost sf-btn-ghost" href="/track">মোবাইল নম্বর দিয়ে খুঁজুন</Link>
          </EmptyState>
        )
      ) : (
        orders.map((o) => {
          const g = orderGlance(o);
          const open = o.orderNo === shown;
          const n = o.items.reduce((s2, it) => s2 + it.quantity, 0);
          return (
            <div className={`acc sf-ord ${g.kind}${open ? " on" : ""}`} key={o.orderNo}>
              <button type="button" className="acc-head" aria-expanded={open} onClick={() => setOpenId(open ? "" : o.orderNo)}>
                <i className="order-ico"><img src={g.icon} alt="" /></i>
                <div className="acc-main">
                  <div className="acc-top"><b>{o.orderNo}</b><span className={`sf-ord-chip ${g.kind}`}>{g.chip}</span></div>
                  <div className="now-line">{g.title}</div>
                  <div className="sf-ord-meta">{o.placedAt ? new Date(o.placedAt).toLocaleDateString("bn-BD", { day: "numeric", month: "long", year: "numeric" }) : ""}{n ? ` · ${bn(n)}টি আইটেম` : ""}</div>
                </div>
                <div className="acc-sum">৳{bn(o.grandTotal)}</div>
                <span className="acc-chev" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
                </span>
              </button>
              <div className="acc-body">
                {open ? <MyOrderBody order={o} docs={docsQ.data ?? []} onPaper={setSheet} /> : null}
              </div>
            </div>
          );
        })
      )}
      </div>
      {sheet ? <DocSheet doc={sheet} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}
