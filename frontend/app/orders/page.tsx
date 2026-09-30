"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { OrderFacts, OrderSteps, orderGlance, toTrackOrder, type TrackOrder } from "@/components/orders/delivery-track";
import { api, get } from "@/lib/api/client";
import { useMe } from "@/lib/api/auth";
import { apiErrorText, startSslPayment, useCancelMyOrder, useGuestOrders, useMyOrders, placedOrders } from "@/lib/api/shop";
import { bn } from "@/lib/format";
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

  return (
    <div className="wrap" style={{ paddingBottom: 48 }}>
      <div className="order-col">
      <p className="crumb">হোম / <b>আমার অর্ডার</b></p>
      <h2 style={{ marginBottom: 16 }}>আমার অর্ডার</h2>
      {cheer ? (
        <div className="cheer" role="status">
          <span className="cheer-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 13.2 9.2 17.5 19 7" /></svg>
          </span>
          <div>
            <small>চলো</small>
            <h3>{sslNote === "fail" || sslNote === "cancel" ? "অর্ডার রাখা হয়েছে · পেমেন্ট হয়নি" : "অর্ডার হয়েছে"}</h3>
            <p>ধন্যবাদ{cheer.name ? `, ${cheer.name.split(" ")[0]}` : ""}। আপনার অর্ডার <b>{cheer.orderNo}</b></p>
          </div>
        </div>
      ) : null}
      {busy && !orders.length ? <div className="empty"><p className="serif">লোড হচ্ছে…</p></div> : !orders.length ? (
        <div className="empty">
          {user ? (
            <p className="serif">এখনো কোনো অর্ডার নেই।</p>
          ) : (
            <>
              <p className="serif">এই ডিভাইসে কোনো অর্ডার নেই।</p>
              <p className="author" style={{ marginTop: 6 }}>আগের অর্ডার দেখতে লগইন করুন, অথবা মোবাইল নম্বর দিয়ে খুঁজুন।</p>
              <button className="btn btn-primary" type="button" style={{ marginTop: 12 }} onClick={() => dispatch(setAuth(true))}>লগইন</button>
              <p style={{ marginTop: 12 }}><Link href="/track">মোবাইল নম্বর দিয়ে খুঁজুন</Link></p>
            </>
          )}
        </div>
      ) : (
        orders.map((o) => {
          const g = orderGlance(o);
          const open = o.orderNo === shown;
          return (
            <div className={`acc ${g.kind}${open ? " on" : ""}`} key={o.orderNo}>
              <button type="button" className="acc-head" onClick={() => setOpenId(open ? "" : o.orderNo)}>
                <i className="order-ico"><img src={g.icon} alt="" /></i>
                <div className="acc-main">
                  <div className="acc-top"><b>{o.orderNo}</b></div>
                  <div className="now-line">{g.title}</div>
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
