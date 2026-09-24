"use client";

import { useState } from "react";
import { DeliveryTrack, matchOrders, orderGlance } from "@/components/orders/delivery-track";
import type { DemoOrder } from "@/lib/demo/accounts";
import { bn } from "@/lib/format";
import { useAppSelector } from "@/store/hooks";

function when(at: number) {
  return new Date(at).toLocaleString("bn-BD", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function TrackList({ orders }: { orders: DemoOrder[] }) {
  const sorted = [...orders].sort((a, b) => b.at - a.at);
  const [openId, setOpenId] = useState(sorted[0]?.id ?? "");
  if (sorted.length < 2) {
    return (
      <div className="track-hits">
        {sorted.map((o) => <DeliveryTrack key={o.id} order={o} />)}
      </div>
    );
  }
  return (
    <div className="track-acc">
      {sorted.map((o) => {
        const g = orderGlance(o);
        const open = o.id === openId;
        return (
          <div className={`acc ${g.kind}${open ? " on" : ""}`} key={o.id}>
            <button type="button" className="acc-head" onClick={() => setOpenId(open ? "" : o.id)}>
              <i className="order-ico"><img src={g.icon} alt="" /></i>
              <div className="acc-main">
                <div className="acc-top"><b>{o.id}</b></div>
                <div className="now-line">{g.title}</div>
                <div className="acc-when">{when(o.at)}</div>
              </div>
              <div className="acc-sum">৳{bn(o.total)}</div>
              <span className="acc-chev" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
              </span>
            </button>
            <div className="acc-body">
              <DeliveryTrack order={o} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TrackPage() {
  const orders = useAppSelector((s) => s.orders.orders);
  const [q, setQ] = useState("");
  const [needle, setNeedle] = useState("");
  const [tried, setTried] = useState(false);
  const hit = tried ? matchOrders(orders, needle) : [];

  function search() {
    setNeedle(q);
    setTried(true);
  }

  return (
    <div className="wrap track-page">
      <p className="crumb">হোম / <b>অর্ডার খুঁজুন</b></p>
      <section className="track-hero">
        <div className="track-copy">
          <p className="me-kicker">ডেলিভারি অবস্থা</p>
          <h1>অর্ডার খুঁজুন</h1>
          <p>মোবাইল নম্বর অথবা অর্ডার আইডি দিন। স্ট্যাটাস, ধাপ আর ইনভয়েস এখানেই দেখাবে।</p>
        </div>
      </section>
      <div className="track-stage">
        <section className="track-find">
          <label>মোবাইল অথবা অর্ডার আইডি</label>
          <div className="coupon">
            <div className="field-box">
              <span className="field-ico">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
              </span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="মোবাইল নম্বর অথবা অর্ডার আইডি" onKeyDown={(e) => { if (e.key === "Enter") search(); }} />
            </div>
            <button className="btn btn-primary" type="button" onClick={search}>খুঁজুন</button>
          </div>
        </section>
        <aside className="track-aside">
          <h2>কীভাবে খুঁজবেন</h2>
          <ol>
            <li><b>১</b><span><strong>নম্বর বা আইডি</strong>মোবাইলের ১১ সংখ্যা, অথবা CLO- দিয়ে শুরু আইডি।</span></li>
            <li><b>২</b><span><strong>খুঁজুন</strong>বাটন চাপুন, অথবা ঘরে এন্টার দিন।</span></li>
            <li><b>৩</b><span><strong>ধাপ দেখুন</strong>প্যাকিং থেকে ডেলিভারি পর্যন্ত কোথায় আছে।</span></li>
          </ol>
        </aside>
      </div>
      {tried && needle.trim() && !hit.length ? (
        <p className="track-miss">এই মোবাইল বা অর্ডার আইডিতে কোনো অর্ডার নেই।</p>
      ) : null}
      {hit.length ? <TrackList key={needle} orders={hit} /> : null}
    </div>
  );
}
