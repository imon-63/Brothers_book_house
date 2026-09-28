"use client";

import { useState } from "react";
import { PaperView } from "@/components/books/paper";
import { BnDateField } from "@/components/ui/bangla-calendar";
import {
  CASH_ACCOUNTS, categoryRows, courierDue, dayRange, grossOf, isoDay, netOf, pnlFor, signed, supplierDue, tenureRange,
  type CashAccount, type Paper, type PurchaseLine, type Tenure,
} from "@/lib/books/ledger";
import { bn } from "@/lib/format";
import { addCash, addPurchase } from "@/store/slices/books-slice";
import { receiveStock } from "@/store/slices/shop-slice";
import { showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

type View = "sum" | "paper" | "buy" | "cash" | "pnl";

const I = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
const TABS: { id: View; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "sum", label: "সারাংশ", hint: "বিল ও বকেয়া", icon: <svg {...I}><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></svg> },
  { id: "paper", label: "কাগজ", hint: "ইনভয়েস · রিসিট", icon: <svg {...I}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg> },
  { id: "buy", label: "ক্রয়", hint: "সাপ্লায়ার বিল", icon: <svg {...I}><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M6 6 5 3H2" /></svg> },
  { id: "cash", label: "ক্যাশবুক", hint: "দিনের ক্লোজ", icon: <svg {...I}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></svg> },
  { id: "pnl", label: "লাভ-ক্ষতি", hint: "মার্জিন ও নেট", icon: <svg {...I}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2.1-.6-2.6-1.6" /></svg> },
];

function noon(iso: string) {
  return dayRange(iso).start + 12 * 3600000;
}

export function FinanceDesk() {
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.orders.orders);
  const products = useAppSelector((s) => s.shop.products);
  const fee = useAppSelector((s) => s.shop.ship.sslFeePct);
  const books = useAppSelector((s) => s.books);
  const [view, setView] = useState<View>("sum");
  const [range, setRange] = useState("30");
  const [pay, setPay] = useState("all");
  const [paperKind, setPaperKind] = useState("all");
  const [open, setOpen] = useState<Paper | null>(null);
  const [day, setDay] = useState(isoDay());
  const [tenure, setTenure] = useState<Tenure>("month");
  const missingCost = products.filter((p) => !(p.cost && p.cost > 0)).length;

  const now = Date.now();
  const list = orders.filter((o) => {
    if (o.status < 0 || o.status === 5) return false;
    const age = now - (o.confirmedAt || o.at);
    if (range === "today" && age > 86400000) return false;
    if (range === "7" && age > 7 * 86400000) return false;
    if (range === "30" && age > 30 * 86400000) return false;
    return true;
  });
  const billed = list.reduce((s, o) => s + o.total, 0);
  const cod = list.filter((o) => !o.pay.toUpperCase().includes("SSL"));
  const due = cod.filter((o) => !o.paid && o.status !== 4).reduce((s, o) => s + o.total, 0);
  const cashNet = books.cash.reduce((s, entry) => s + signed(entry), 0);
  const rows = list.filter((o) => {
    const got = o.paid || o.status === 4 || o.pay.toUpperCase().includes("SSL");
    if (pay === "got") return got;
    if (pay === "due") return !got;
    return true;
  });
  const papers = books.papers.filter((p) => paperKind === "all" || p.kind === paperKind);
  const bounds = dayRange(day);
  const opening = books.cash.filter((e) => e.at < bounds.start).reduce((s, e) => s + signed(e), 0);
  const dayRows = books.cash.filter((e) => e.at >= bounds.start && e.at < bounds.end).slice().sort((a, b) => a.at - b.at);
  const dayIn = dayRows.filter((e) => e.dir === "in").reduce((s, e) => s + e.amount, 0);
  const dayOut = dayRows.filter((e) => e.dir === "out").reduce((s, e) => s + e.amount, 0);
  const balances = CASH_ACCOUNTS.map((account) => ({
    account,
    amount: books.cash.filter((e) => e.account === account).reduce((s, e) => s + signed(e), 0),
  }));
  const period = tenureRange(tenure);
  const pnl = pnlFor(books.papers, period.start, period.end);
  const gross = grossOf(pnl);
  const net = netOf(pnl);
  const cats = categoryRows(books.papers, products, period.start, period.end);
  const stockValue = products.reduce((s, p) => s + p.stock * (p.cost || 0), 0);
  const payable = supplierDue(books.purchases);
  const courier = courierDue(books.papers, books.cash);
  const pnlAll = pnlFor(books.papers, 0, now + 1);
  const spark = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - (13 - i) * 86400000);
    const key = isoDay(d.getTime());
    const { start, end } = dayRange(key);
    const sum = orders.filter((o) => o.status >= 0 && o.status !== 5 && o.at >= start && o.at < end).reduce((t, o) => t + o.total, 0);
    return { key, sum, today: i === 13, label: d.toLocaleDateString("bn-BD", { day: "numeric", month: "short" }) };
  });
  const peak = Math.max(0, ...spark.map((d) => d.sum));
  const month = orders.filter((o) => o.status >= 0 && o.status !== 5 && now - o.at < 30 * 86400000).reduce((t, o) => t + o.total, 0);

  const chips = (cur: string, set: (v: string) => void, items: [string, string][]) => (
    <div className="ord-chips">
      {items.map(([id, lab]) => (
        <button key={id} type="button" className={`ofilt${cur === id ? " on" : ""}`} onClick={() => set(id)}>{lab}</button>
      ))}
    </div>
  );

  return (
    <div className="fin-page">
      <div className="fin-hero fin-hero-x">
        <div className="fin-hero-copy">
          <p className="fin-kick">চলো · হিসাবখাত</p>
          <h2>৳{bn(cashNet.toLocaleString("en-IN"))}</h2>
          <p className="fin-hero-sub">হাতে আছে · চার খাত মিলিয়ে</p>
          <div className="fin-hero-pills">
            <span className="up">▲ ৩০ দিনে ৳{bn(month.toLocaleString("en-IN"))}</span>
            {due ? <span className="warn">COD বকেয়া ৳{bn(due.toLocaleString("en-IN"))}</span> : <span>কোনো বকেয়া নেই</span>}
          </div>
        </div>
        <div className="fin-spark" aria-label="গত ১৪ দিনের বিক্রি">
          <div className="fin-spark-head"><b>গত ১৪ দিন</b><small>সর্বোচ্চ ৳{bn(peak.toLocaleString("en-IN"))}</small></div>
          <div className="fin-bars">
            {spark.map((d, i) => (
              <span key={d.key} className={d.today ? "today" : ""} title={`${d.label} · ৳${bn(d.sum)}`} style={{ ["--h" as string]: `${peak ? Math.max(4, (d.sum / peak) * 100) : 4}%`, animationDelay: `${i * 35}ms` }}>
                <i />
              </span>
            ))}
          </div>
          <div className="fin-spark-axis"><small>{spark[0]?.label}</small><small>আজ</small></div>
        </div>
      </div>
      <nav className="fin-tabs" aria-label="হিসাব">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={view === t.id ? "on" : ""} onClick={() => setView(t.id)}>
            <span className="fin-tab-ico">{t.icon}</span>
            <span><b>{t.label}</b><small>{t.hint}</small></span>
          </button>
        ))}
      </nav>

      {view === "sum" ? (
        <>
          {chips(range, setRange, [["today", "আজ"], ["7", "৭ দিন"], ["30", "৩০ দিন"], ["all", "সব"]])}
          <div className="fin-kpis">
            <div className="fin-kpi ok"><i className="fin-kpi-ico">৳</i><span>কাস্টমার বিল</span><b>৳{bn(billed)}</b><small>{bn(list.length)}টি কনফার্মড অর্ডার</small></div>
            <div className="fin-kpi ok"><i className="fin-kpi-ico">◎</i><span>হাতে টাকা</span><b>৳{bn(cashNet)}</b><small>চার খাত মিলিয়ে · SSL ফি {bn(fee)}%</small></div>
            <div className={`fin-kpi ${due ? "warn" : "ok"}`}><i className="fin-kpi-ico">⏳</i><span>COD বকেয়া</span><b>৳{bn(due)}</b><small>{due ? "পৌঁছালে হাতে আসবে" : "কোনো বকেয়া নেই"}</small></div>
          </div>
          {missingCost ? (
            <div className="fin-notes"><div className="fin-note">{bn(missingCost)}টি পণ্যে কেনা দাম নেই। লাভের সংখ্যা বন্ধ — আগে কেনা দাম দিন। বিল ও বকেয়া উপরে আছে।</div></div>
          ) : pnlAll.sales || pnlAll.credits ? (
            <div className="fin-kpis">
              <div className="fin-kpi ok"><span>গ্রস</span><b>৳{bn(grossOf(pnlAll))}</b><small>স্ন্যাপশটসহ কনফার্মড বিক্রি</small></div>
              <div className="fin-kpi"><span>স্টকে আটকে</span><b>৳{bn(stockValue)}</b><small>বাকি কপি × কেনা দাম</small></div>
            </div>
          ) : (
            <div className="fin-notes"><div className="fin-note">কেনা দাম আছে, কিন্তু স্ন্যাপশটসহ কনফার্মড বিক্রি নেই। পুরনো অর্ডার লাভে গোনা হয়নি।</div></div>
          )}
          <section className="fin-card fin-tbl-card">
            <div className="fin-tbl-top">
              <h3>অর্ডার অনুযায়ী</h3>
              {chips(pay, setPay, [["all", "সব"], ["got", "পেয়েছি"], ["due", "বকেয়া"]])}
            </div>
            {!rows.length ? <div className="empty">এই সময়ে কনফার্মড অর্ডার নেই</div> : (
              <table className="fin-tbl"><tbody>
                <tr><th>অর্ডার</th><th>পেমেন্ট</th><th>বিল</th><th>টাকা</th></tr>
                {rows.map((o) => {
                  const got = o.paid || o.status === 4 || o.pay.toUpperCase().includes("SSL");
                  return (
                    <tr key={o.id}>
                      <td><b>{o.id}</b></td>
                      <td>{o.pay.includes("ক্যাশ") ? "ক্যাশ অন" : "SSL"}</td>
                      <td>৳{bn(o.total)}</td>
                      <td><span className={`fin-pill ${got ? "ok" : "warn"}`}>{got ? "পেয়েছি" : "বকেয়া"}</span></td>
                    </tr>
                  );
                })}
              </tbody></table>
            )}
          </section>
        </>
      ) : null}

      {view === "paper" ? <Papers papers={papers} paperKind={paperKind} setPaperKind={setPaperKind} onOpen={setOpen} /> : null}
      {view === "buy" ? <Purchases /> : null}
      {view === "cash" ? (
        <CashBook
          day={day}
          setDay={setDay}
          balances={balances}
          opening={opening}
          dayIn={dayIn}
          dayOut={dayOut}
          close={opening + dayIn - dayOut}
          rows={dayRows}
          payable={payable}
          courier={courier}
        />
      ) : null}
      {view === "pnl" ? (
        <PnlView
          tenure={tenure}
          setTenure={setTenure}
          missingCost={missingCost}
          pnl={pnl}
          gross={gross}
          net={net}
          cats={cats}
          stockValue={stockValue}
          costsReady={!missingCost}
        />
      ) : null}
      {open ? <PaperView paper={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Papers({
  papers, paperKind, setPaperKind, onOpen,
}: {
  papers: Paper[];
  paperKind: string;
  setPaperKind: (v: string) => void;
  onOpen: (p: Paper) => void;
}) {
  return (
    <section className="fin-card fin-tbl-card">
      <div className="fin-tbl-top">
        <h3>ইনভয়েস, রিসিট, ক্রেডিট নোট</h3>
        <div className="ord-chips">
          {[["all", "সব"], ["invoice", "ইনভয়েস"], ["receipt", "রিসিট"], ["credit", "ক্রেডিট"]].map(([id, lab]) => (
            <button key={id} type="button" className={`ofilt${paperKind === id ? " on" : ""}`} onClick={() => setPaperKind(id)}>{lab}</button>
          ))}
        </div>
      </div>
      <p className="sub">ক্যাশ অন ডেলিভারিতে ইনভয়েস কনফার্মে, রিসিট ডেলিভারিতে। SSL-এ দুটোই কনফার্মে। ফেরত হলে ক্রেডিট নোট।</p>
      {!papers.length ? <div className="empty">এই কাগজ এখনো কাটেনি</div> : (
        <table className="fin-tbl"><tbody>
          <tr><th>কাগজ</th><th>অর্ডার</th><th>তারিখ</th><th>মোট</th><th></th></tr>
          {papers.map((p) => (
            <tr key={p.id}>
              <td><b>{p.id}</b><div className="author">{p.kind === "invoice" ? "ইনভয়েস" : p.kind === "receipt" ? "রিসিট" : "ক্রেডিট নোট"}</div></td>
              <td>{p.orderId}<div className="author">{p.name}</div></td>
              <td>{new Date(p.at).toLocaleDateString("bn-BD")}</td>
              <td>৳{bn(p.total)}</td>
              <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen(p)}>খুলুন</button></td>
            </tr>
          ))}
        </tbody></table>
      )}
    </section>
  );
}

function Purchases() {
  const dispatch = useAppDispatch();
  const products = useAppSelector((s) => s.shop.products);
  const purchases = useAppSelector((s) => s.books.purchases);
  const [supplier, setSupplier] = useState("");
  const [when, setWhen] = useState(isoDay());
  const [paid, setPaid] = useState(true);
  const [account, setAccount] = useState<CashAccount>("ক্যাশ");
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState(products[0]?.id || 0);
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [lines, setLines] = useState<PurchaseLine[]>([]);

  function addLine() {
    const product = products.find((p) => p.id === Number(productId));
    if (!product || qty < 1 || !(cost > 0)) {
      dispatch(showToast("পণ্য, কপি ও কেনা দাম দিন"));
      return;
    }
    setLines((cur) => {
      const hit = cur.find((l) => l.productId === product.id);
      if (hit) return cur.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + qty, cost } : l));
      return [...cur, { productId: product.id, title: product.title, qty, cost }];
    });
  }

  function save() {
    if (!supplier.trim() || !lines.length) {
      dispatch(showToast("সাপ্লায়ার ও অন্তত একটা লাইন দিন"));
      return;
    }
    const at = noon(when);
    dispatch(receiveStock(lines.map((l) => ({ id: l.productId, n: l.qty, cost: l.cost }))));
    dispatch(addPurchase({ supplier, at, lines, paid, account, note }));
    dispatch(showToast(paid ? "ক্রয় বিল সেভ · স্টক বেড়েছে · টাকা কমেছে" : "ক্রয় বিল সেভ · স্টক বেড়েছে · সাপ্লায়ার বকেয়া"));
    setLines([]);
    setSupplier("");
    setNote("");
  }

  const total = lines.reduce((s, l) => s + l.qty * l.cost, 0);

  return (
    <div className="fin-page">
      <section className="fin-card">
        <h3>নতুন ক্রয় বিল</h3>
        <p className="sub">সাপ্লায়ার, কপি, কেনা দাম। সেভ করলে স্টক বাড়ে এবং ওই কেনা দাম পণ্যে বসে।</p>
        <div className="form-grid">
          <div><label>সাপ্লায়ার</label><input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="পাঞ্জেরী / রokomারি" /></div>
          <BnDateField label="তারিখ" value={when} onChange={setWhen} />
        </div>
        <div className="form-grid">
          <div>
            <label>পণ্য</label>
            <select value={productId} onChange={(e) => setProductId(Number(e.target.value))}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
          <div className="form-grid">
            <div><label>কপি</label><input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} /></div>
            <div><label>কেনা দাম</label><input type="number" min={1} value={cost || ""} onChange={(e) => setCost(Number(e.target.value) || 0)} /></div>
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={addLine}>লাইন যোগ</button>
        {lines.length ? (
          <table className="fin-tbl"><tbody>
            {lines.map((l) => (
              <tr key={l.productId}>
                <td>{l.title}</td>
                <td>{bn(l.qty)} × ৳{bn(l.cost)}</td>
                <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setLines((cur) => cur.filter((x) => x.productId !== l.productId))}>বাদ</button></td>
              </tr>
            ))}
          </tbody></table>
        ) : null}
        <label className="tog" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          <span>এখনই পরিশোধ — নাহলে সাপ্লায়ার বকেয়া</span>
        </label>
        {paid ? (
          <div style={{ marginTop: 8 }}>
            <label>কোন খাত থেকে</label>
            <select value={account} onChange={(e) => setAccount(e.target.value as CashAccount)}>
              {CASH_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}><label>নোট</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="চালান নম্বর, ঐচ্ছিক" /></div>
        <div className="save-row">
          <span className="hint-txt">মোট ৳{bn(total)}</span>
          <button type="button" className="btn btn-primary" onClick={save}>ক্রয় সেভ</button>
        </div>
      </section>
      <section className="fin-card fin-tbl-card">
        <h3>ক্রয় খতিয়ান</h3>
        {!purchases.length ? <div className="empty">এখনো কোনো ক্রয় বিল নেই</div> : (
          <table className="fin-tbl"><tbody>
            <tr><th>বিল</th><th>সাপ্লায়ার</th><th>লাইন</th><th>মোট</th><th>টাকা</th></tr>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td><b>{p.id}</b><div className="author">{new Date(p.at).toLocaleDateString("bn-BD")}</div></td>
                <td>{p.supplier}</td>
                <td>{p.lines.map((l) => `${l.title} × ${bn(l.qty)}`).join(", ")}</td>
                <td>৳{bn(p.total)}</td>
                <td><span className={`fin-pill ${p.paid ? "ok" : "warn"}`}>{p.paid ? `পরিশোধ · ${p.account}` : "বকেয়া"}</span></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </section>
    </div>
  );
}

function CashBook({
  day, setDay, balances, opening, dayIn, dayOut, close, rows, payable, courier,
}: {
  day: string;
  setDay: (v: string) => void;
  balances: { account: CashAccount; amount: number }[];
  opening: number;
  dayIn: number;
  dayOut: number;
  close: number;
  rows: { id: string; at: number; account: string; dir: "in" | "out"; amount: number; memo: string }[];
  payable: number;
  courier: number;
}) {
  const dispatch = useAppDispatch();
  const orders = useAppSelector((s) => s.orders.orders);
  const [account, setAccount] = useState<CashAccount>("ক্যাশ");
  const [dir, setDir] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");
  const [courierId, setCourierId] = useState(orders.find((o) => (o.shipCost || 0) > 0 && o.status >= 0 && o.status < 5)?.id || "");

  function add() {
    if (!memo.trim() || !(amount > 0)) {
      dispatch(showToast("খাত, টাকা ও খতিয়ান লিখুন"));
      return;
    }
    dispatch(addCash({ at: noon(day), account, dir, amount, memo }));
    dispatch(showToast("ক্যাশবুক এন্ট্রি বসেছে"));
    setMemo("");
    setAmount(0);
  }

  function payCourier() {
    const order = orders.find((o) => o.id === courierId);
    if (!order || !(order.shipCost && order.shipCost > 0)) {
      dispatch(showToast("কুরিয়ার খরচসহ অর্ডার বাছুন"));
      return;
    }
    dispatch(addCash({
      at: noon(day),
      account,
      dir: "out",
      amount: order.shipCost,
      memo: `কুরিয়ার ${order.id}`,
      kind: "courier",
      ref: order.id,
    }));
    dispatch(showToast("কুরিয়ার পরিশোধ ক্যাশবুকে"));
  }

  return (
    <>
      <div className="fin-kpis fin-kpis-4">
        {balances.map((b) => (
          <div key={b.account} className={`fin-kpi fin-acct a-${CASH_ACCOUNTS.indexOf(b.account)}`}><i className="fin-kpi-ico">{b.account.slice(0, 1)}</i><span>{b.account}</span><b>৳{bn(b.amount)}</b><small>সব দিন মিলিয়ে</small></div>
        ))}
      </div>
      <section className="fin-card">
        <div className="fin-tbl-top">
          <h3>দিনের ক্লোজ</h3>
          <BnDateField compact value={day} onChange={setDay} />
        </div>
        <div className="fin-led">
          <div className="r"><span>অপেনিং</span><b className="v">৳{bn(opening)}</b></div>
          <div className="r plus"><span>ঢুকেছে</span><b className="v">৳{bn(dayIn)}</b></div>
          <div className="r minus"><span>বেরিয়েছে</span><b className="v">৳{bn(dayOut)}</b></div>
          <div className="r net"><span>ক্লোজ</span><b className="v">৳{bn(close)}</b></div>
        </div>
        <p className="sub">সাপ্লায়ার বকেয়া ৳{bn(payable)} · কুরিয়ার বকেয়া ৳{bn(courier)} — এ দুটো হাতের টাকায় গোনা হয়নি।</p>
        {!rows.length ? <div className="empty">এই দিনে কোনো এন্ট্রি নেই</div> : (
          <table className="fin-tbl"><tbody>
            <tr><th>সময়</th><th>খাত</th><th>খতিয়ান</th><th>ঢোকা</th><th>বের</th></tr>
            {rows.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.at).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>{e.account}</td>
                <td>{e.memo}</td>
                <td>{e.dir === "in" ? `৳${bn(e.amount)}` : ""}</td>
                <td>{e.dir === "out" ? `৳${bn(e.amount)}` : ""}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </section>
      <section className="fin-card">
        <h3>হাতে লিখুন</h3>
        <div className="form-grid">
          <div>
            <label>খাত</label>
            <select value={account} onChange={(e) => setAccount(e.target.value as CashAccount)}>
              {CASH_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label>দিক</label>
            <select value={dir} onChange={(e) => setDir(e.target.value as "in" | "out")}>
              <option value="in">ঢুকেছে</option>
              <option value="out">বেরিয়েছে</option>
            </select>
          </div>
          <div><label>টাকা</label><input type="number" min={1} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></div>
          <div><label>খতিয়ান</label><input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="প্যাকিং, বিজ্ঞাপন, হেল্পলাইন" /></div>
        </div>
        <div className="save-row">
          <button type="button" className="btn btn-primary btn-sm" onClick={add}>এন্ট্রি বসান</button>
        </div>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div>
            <label>কুরিয়ার পরিশোধ</label>
            <select value={courierId} onChange={(e) => setCourierId(e.target.value)}>
              <option value="">অর্ডার বাছুন</option>
              {orders.filter((o) => (o.shipCost || 0) > 0 && o.status >= 0 && o.status !== 5).map((o) => (
                <option key={o.id} value={o.id}>{o.id} · ৳{bn(o.shipCost || 0)}</option>
              ))}
            </select>
          </div>
          <div className="save-row"><button type="button" className="btn btn-ghost btn-sm" onClick={payCourier}>কুরিয়ার দিন</button></div>
        </div>
      </section>
    </>
  );
}

function PnlView({
  tenure, setTenure, missingCost, pnl, gross, net, cats, stockValue, costsReady,
}: {
  tenure: Tenure;
  setTenure: (v: Tenure) => void;
  missingCost: number;
  pnl: ReturnType<typeof pnlFor>;
  gross: number;
  net: number;
  cats: { cat: string; qty: number; sales: number; cogs: number }[];
  stockValue: number;
  costsReady: boolean;
}) {
  const salesNet = pnl.sales - pnl.coupon;
  const margin = pnl.sales > 0 ? Math.round((gross / pnl.sales) * 100) : 0;
  const label = tenure === "day" ? "আজকের" : tenure === "month" ? "এই মাসের" : "এই বছরের";
  return (
    <>
      <div className="ord-chips">
        {([["day", "আজ"], ["month", "এই মাস"], ["year", "এই বছর"]] as const).map(([id, lab]) => (
          <button key={id} type="button" className={`ofilt${tenure === id ? " on" : ""}`} onClick={() => setTenure(id)}>{lab}</button>
        ))}
      </div>
      {missingCost ? (
        <div className="fin-notes"><div className="fin-note">{bn(missingCost)}টি পণ্যে কেনা দাম নেই। {label} লাভ, COGS ও মার্জিন বন্ধ। বিল ও ক্যাশবুক আগের ট্যাবে।</div></div>
      ) : (
        <div className="fin-kpis">
          <div className="fin-kpi"><span>বিক্রি</span><b>৳{bn(pnl.sales)}</b><small>কুপন বাদ দিলে ৳{bn(salesNet)}</small></div>
          <div className="fin-kpi ok fin-kpi-ring"><span>গ্রস প্রফিট</span><b>৳{bn(gross)}</b><small>{bn(margin)}% · বিক্রির উপর</small><i className="fin-ring" style={{ ["--p" as string]: Math.max(0, Math.min(100, margin)) }}><em>{bn(margin)}%</em></i></div>
          <div className={`fin-kpi ${net >= 0 ? "ok" : "warn"}`}><span>নেট</span><b>৳{bn(net)}</b><small>শিপ, কুরিয়ার, ফি, ফেরতের লস</small></div>
        </div>
      )}
      <section className="fin-card">
        <h3>{label} হিসাব</h3>
        <p className="sub">শুধু স্ন্যাপশটসহ ইনভয়েস ও ক্রেডিট নোট। পেন্ডিং গোনা হয় না। {pnl.skipped ? `${bn(pnl.skipped)}টিতে কেনা দামের স্ন্যাপশট নেই — সেগুলো লাভে বাদ।` : `${bn(pnl.invoices)} ইনভয়েস · ${bn(pnl.credits)} ক্রেডিট নোট।`}</p>
        {costsReady && pnl.sales > 0 ? (() => {
          const other = Math.max(0, pnl.coupon + pnl.courier + pnl.sslFee + pnl.courierLoss - pnl.shipIn);
          const total = Math.max(1, pnl.cogs + other + Math.max(0, net));
          return (
            <div className="fin-flow">
              <div className="fin-flow-bar">
                <i className="c" style={{ width: `${(pnl.cogs / total) * 100}%` }} />
                <i className="o" style={{ width: `${(other / total) * 100}%` }} />
                <i className="n" style={{ width: `${(Math.max(0, net) / total) * 100}%` }} />
              </div>
              <div className="fin-flow-leg">
                <span><em className="c" />কেনা দাম ৳{bn(pnl.cogs)}</span>
                <span><em className="o" />অন্যান্য খরচ ৳{bn(other)}</span>
                <span><em className="n" />নেট ৳{bn(net)}</span>
              </div>
            </div>
          );
        })() : null}
        {costsReady ? (
          <div className="fin-led">
            <div className="r plus"><span>বিক্রি</span><b className="v">৳{bn(pnl.sales)}</b></div>
            <div className="r minus"><span>কুপন</span><b className="v">৳{bn(pnl.coupon)}</b></div>
            <div className="r minus"><span>কেনা দাম</span><b className="v">৳{bn(pnl.cogs)}</b></div>
            <div className="r mid"><span>গ্রস</span><b className="v">৳{bn(gross)}</b></div>
            <div className="r plus"><span>ডেলিভারি আয়</span><b className="v">৳{bn(pnl.shipIn)}</b></div>
            <div className="r minus"><span>কুরিয়ার</span><b className="v">৳{bn(pnl.courier)}</b></div>
            <div className="r minus"><span>SSL ফি</span><b className="v">৳{bn(pnl.sslFee)}</b></div>
            <div className="r minus"><span>ফেরতের কুরিয়ার লস</span><b className="v">৳{bn(pnl.courierLoss)}</b></div>
            <div className="r net"><span>নেট</span><b className="v">৳{bn(net)}</b></div>
          </div>
        ) : null}
        {costsReady ? <p className="sub">স্টকে আটকে ৳{bn(stockValue)} — বাকি কপি × কেনা দাম।</p> : null}
      </section>
      {cats.length ? (
        <section className="fin-card fin-tbl-card">
          <h3>ক্যাটাগরি</h3>
          <table className="fin-tbl"><tbody>
            <tr><th>ক্যাটাগরি</th><th>কপি</th><th>বিক্রি</th>{costsReady ? <th>মার্জিন</th> : null}</tr>
            {cats.map((row) => {
              const g = row.sales - row.cogs;
              const pct = row.sales > 0 ? Math.round((g / row.sales) * 100) : 0;
              return (
                <tr key={row.cat}>
                  <td>{row.cat}</td>
                  <td>{bn(row.qty)}</td>
                  <td>৳{bn(row.sales)}</td>
                  {costsReady ? <td>৳{bn(g)} · {bn(pct)}%</td> : null}
                </tr>
              );
            })}
          </tbody></table>
        </section>
      ) : null}
    </>
  );
}
