"use client";

import { bn } from "@/lib/format";
import type { Paper } from "@/lib/books/ledger";

const TITLE = { invoice: "ইনভয়েস", receipt: "রিসিট", credit: "ক্রেডিট নোট" } as const;

function bnDigits(s: string) {
  const n = Number(s.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))));
  return Number.isFinite(n) ? n : 0;
}

function namedLines(items: string) {
  return items.split(",").map((s) => s.trim()).filter(Boolean).map((chunk) => {
    const m = chunk.match(/^(.*?)\s*[×x]\s*([০-৯0-9]+)\s*$/);
    if (!m) return { title: chunk, qty: 1 };
    return { title: m[1].trim() || chunk, qty: bnDigits(m[2]) || 1 };
  });
}

export function PaperView({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const title = TITLE[paper.kind];
  const when = new Date(paper.at).toLocaleString("bn-BD", { dateStyle: "medium", timeStyle: "short" });
  const goods = paper.lines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const sub = paper.sub || goods;
  const rows = paper.lines.length
    ? paper.lines.map((line) => ({
      key: `${line.kind}-${line.id}`,
      title: line.title,
      tag: line.kind === "pack" ? "প্যাকেজ" : "পণ্য",
      qty: line.qty,
      price: line.price,
      total: line.price * line.qty,
    }))
    : namedLines(paper.items).map((line, i, all) => ({
      key: `item-${i}`,
      title: line.title,
      tag: "",
      qty: line.qty,
      price: all.length === 1 && line.qty ? Math.round(sub / line.qty) : 0,
      total: all.length === 1 ? sub : 0,
    }));
  return (
    <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="box paper-print paper-sheet">
        <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>প্রিন্ট</button>
          <button type="button" className="x" onClick={onClose}>×</button>
        </div>
        <div className="paper-head">
          <div>
            <div className="paper-shop">
              <b>চলো</b>
              <span>কিনে ফেলি</span>
            </div>
            <h3>{title}</h3>
          </div>
          <p>{paper.id}</p>
        </div>
        <div className="paper-facts">
          <span><i>তারিখ</i>{when}</span>
          <span><i>অর্ডার</i>{paper.orderId}</span>
          <span><i>পেমেন্ট</i>{paper.pay}</span>
        </div>
        <div className="paper-who">
          <i>ক্রেতা</i>
          <b>{paper.name}</b>
          <span>{paper.phone}</span>
          {paper.address ? <p>{paper.address}</p> : null}
        </div>
        {rows.length ? (
          <table className="paper-tbl">
            <thead>
              <tr><th>পণ্য</th><th className="num">পরিমাণ</th><th className="num">দাম</th><th className="num">মোট</th></tr>
            </thead>
            <tbody>
              {rows.map((line) => (
                <tr key={line.key}>
                  <td>
                    <b>{line.title}</b>
                    {line.tag ? <small>{line.tag}</small> : null}
                  </td>
                  <td className="num">{bn(line.qty)}</td>
                  <td className="num">{line.price ? `৳${bn(line.price)}` : "—"}</td>
                  <td className="num">{line.total ? `৳${bn(line.total)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="paper-sum">
          <p><span>সাবটোটাল</span><b>৳{bn(sub)}</b></p>
          {paper.couponOff ? <p><span>কুপন {paper.coupon || ""}</span><b>−৳{bn(paper.couponOff)}</b></p> : null}
          <p><span>ডেলিভারি</span><b>{paper.ship ? `৳${bn(paper.ship)}` : "ফ্রি"}</b></p>
          <p className="grand"><span>মোট</span><b>৳{bn(paper.total)}</b></p>
          {paper.kind === "receipt" && paper.sslFee ? <p><span>গেটওয়ে ফি</span><b>৳{bn(paper.sslFee)}</b></p> : null}
        </div>
        {paper.kind === "invoice" ? (
          <p className="paper-note">{paper.pay.includes("ক্যাশ") ? "বিক্রির কাগজ। ক্যাশ অন ডেলিভারিতে টাকা পরে আসবে — এটা রিসিট নয়।" : "বিক্রির কাগজ। পেমেন্ট আলাদা রিসিটে।"}</p>
        ) : null}
        {paper.kind === "receipt" ? <p className="paper-note">টাকা পাওয়া গেছে ৳{bn(paper.total)}।</p> : null}
        {paper.kind === "credit" ? (
          <p className="paper-note">
            কারণ: {paper.reason || "ফেরত"}। বিক্রি বাতিল, স্টক ফেরত।
            {paper.courierLoss ? ` কুরিয়ার লস ৳${bn(paper.courierLoss)} আলাদা খরচ।` : ""}
            {paper.reverseCourier ? " কুরিয়ারে ওঠেনি — কুরিয়ার খরচও উল্টেছে।" : " কুরিয়ার খরচ থেকে যাচ্ছে।"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
