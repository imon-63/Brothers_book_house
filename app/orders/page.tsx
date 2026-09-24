"use client";

import Link from "next/link";
import { useState } from "react";
import { PaperView } from "@/components/books/paper";
import { OrderFacts, OrderSteps, orderGlance } from "@/components/orders/delivery-track";
import type { Paper } from "@/lib/books/ledger";
import { bn } from "@/lib/format";
import { setAuth } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function OrdersPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.session.users.find((u) => u.id === s.session.userId) ?? null);
  const orders = useAppSelector((s) => s.orders.orders.filter((o) => user && (o.email === user.email || o.phone === user.phone)));
  const papers = useAppSelector((s) => s.books.papers);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Paper | null>(null);
  const shown = openId ?? orders[0]?.id ?? null;

  return (
    <div className="wrap" style={{ paddingBottom: 48 }}>
      <div className="order-col">
      <p className="crumb">হোম / <b>আমার অর্ডার</b></p>
      <h2 style={{ marginBottom: 16 }}>আমার অর্ডার</h2>
      {!user ? (
        <div className="empty">
          <p className="serif">লগইন করলে অর্ডার এখানে দেখাবে।</p>
          <button className="btn btn-primary" type="button" style={{ marginTop: 12 }} onClick={() => dispatch(setAuth(true))}>লগইন</button>
          <p style={{ marginTop: 12 }}><Link href="/track">অর্ডার আইডি দিয়ে খুঁজুন</Link></p>
        </div>
      ) : !orders.length ? (
        <div className="empty"><p className="serif">এখনো কোনো অর্ডার নেই।</p></div>
      ) : (
        orders.map((o) => {
          const g = orderGlance(o);
          const open = o.id === shown;
          const mine = papers.filter((p) => p.orderId === o.id);
          return (
            <div className={`acc ${g.kind}${open ? " on" : ""}`} key={o.id}>
              <button type="button" className="acc-head" onClick={() => setOpenId(open ? "" : o.id)}>
                <i className="order-ico"><img src={g.icon} alt="" /></i>
                <div className="acc-main">
                  <div className="acc-top"><b>{o.id}</b></div>
                  <div className="now-line">{g.title}</div>
                </div>
                <div className="acc-sum">৳{bn(o.total)}</div>
                <span className="acc-chev" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
                </span>
              </button>
              <div className="acc-body">
                <OrderFacts order={o} mode="user" />
                <OrderSteps order={o} />
                {mine.length ? (
                  <div className="admin-ord-acts" style={{ marginTop: 10 }}>
                    {mine.map((p) => (
                      <button key={p.id} type="button" className="btn btn-ghost btn-sm" onClick={() => setSheet(p)}>
                        {p.kind === "invoice" ? "ইনভয়েস" : p.kind === "receipt" ? "রিসিট" : "ক্রেডিট নোট"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })
      )}
      </div>
      {sheet ? <PaperView paper={sheet} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}
