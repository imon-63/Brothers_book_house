"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminNav } from "@/components/admin/nav";
import { BnDateField } from "@/components/ui/bangla-calendar";
import { bn } from "@/lib/format";
import { adminErrorText, isoDay, ms, useToast } from "@/lib/api/admin/core";
import { useDocuments, type AdminDocument } from "@/lib/api/admin/documents";
import {
  exportFinance, useCashAccounts, useCategoryReport, useCourierPayment, useCreatePurchase, useCreateSupplier, useDayClose, useFinanceOrders,
  useFinanceSummary, useManualEntry, usePnl, useProductPicker, usePurchases, useReverseEntry, useSuppliers,
  type CashAccount, type CashEntry, type Pnl, type ReportPeriod,
} from "@/lib/api/admin/finance";
import { isSslMethod } from "@/lib/admin/status";
import { DocModal } from "@/components/admin/doc-frame";

type View = "sum" | "paper" | "buy" | "cash" | "pnl";
type Tenure = "day" | "month" | "year";

const I = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
const TABS: { id: View; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "sum", label: "সারাংশ", hint: "বিল ও বকেয়া", icon: <svg {...I}><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></svg> },
  { id: "paper", label: "কাগজ", hint: "ইনভয়েস · রিসিট", icon: <svg {...I}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg> },
  { id: "buy", label: "ক্রয়", hint: "সাপ্লায়ার বিল", icon: <svg {...I}><path d="M6 6h15l-1.5 9h-12z" /><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M6 6 5 3H2" /></svg> },
  { id: "cash", label: "ক্যাশবুক", hint: "দিনের ক্লোজ", icon: <svg {...I}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M16 15h2" /></svg> },
  { id: "pnl", label: "লাভ-ক্ষতি", hint: "মার্জিন ও নেট", icon: <svg {...I}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2.1-.6-2.6-1.6" /></svg> },
];
const DOC_KIND: Record<string, string> = { invoice: "INVOICE", receipt: "RECEIPT", credit: "CREDIT_NOTE" };

function periodOf(range: string): ReportPeriod {
  const today = isoDay();
  if (range === "today") return { period: "day", date: today };
  if (range === "7" || range === "30") return { period: "custom", from: isoDay(Date.now() - (Number(range) - 1) * 86400000), to: today };
  return { period: "custom", from: "2020-01-01", to: today };
}

export function FinanceDesk() {
  const toast = useToast();
  const { focus, clearFocus } = useAdminNav();
  const [view, setView] = useState<View>(() => (TABS.some((t) => t.id === focus) ? (focus as View) : "sum"));
  useEffect(() => {
    if (focus && TABS.some((t) => t.id === focus)) { setView(focus as View); clearFocus(); }
  }, [focus, clearFocus]);
  const [range, setRange] = useState("30");
  const [pay, setPay] = useState("all");
  const [paperKind, setPaperKind] = useState("all");
  const [open, setOpen] = useState<AdminDocument | null>(null);
  const [day, setDay] = useState(isoDay());
  const [tenure, setTenure] = useState<Tenure>("month");

  const sumQ = useFinanceSummary(periodOf(range));
  const monthQ = useFinanceSummary({ period: "custom", from: isoDay(Date.now() - 29 * 86400000), to: isoDay() });
  const ordersQ = useFinanceOrders(range as "today" | "7" | "30" | "all", pay as "all" | "got" | "due");
  const accountsQ = useCashAccounts();
  const sum = sumQ.data;
  const missingCost = sum?.missingCostProducts ?? 0;
  const billed = sum?.billed ?? 0;
  const due = sum?.codDue ?? 0;
  const cashNet = accountsQ.data?.totalBalance ?? sum?.cashInHand ?? 0;
  const rows = ordersQ.data?.items ?? [];
  const spark = (monthQ.data?.last14Days ?? sum?.last14Days ?? []).map((d, i, all) => ({
    key: d.day, sum: d.billed, today: i === all.length - 1,
    label: new Date(`${d.day}T00:00:00`).toLocaleDateString("bn-BD", { day: "numeric", month: "short" }),
  }));
  const peak = Math.max(0, ...spark.map((d) => d.sum));
  const month = monthQ.data?.billed ?? 0;
  const tenureP: ReportPeriod = { period: tenure, date: isoDay() };

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
          <h2>৳{bn(Math.round(cashNet).toLocaleString("en-IN"))}</h2>
          <p className="fin-hero-sub">হাতে আছে · {bn(accountsQ.data?.items.filter((a) => a.isActive).length ?? 0)} খাত মিলিয়ে</p>
          <div className="fin-hero-pills">
            <span className="up">▲ ৩০ দিনে ৳{bn(Math.round(month).toLocaleString("en-IN"))}</span>
            {due ? <span className="warn">COD বকেয়া ৳{bn(Math.round(due).toLocaleString("en-IN"))}</span> : <span>কোনো বকেয়া নেই</span>}
          </div>
        </div>
        <div className="fin-spark" aria-label="গত ১৪ দিনের বিক্রি">
          <div className="fin-spark-head"><b>গত ১৪ দিন</b><small>সর্বোচ্চ ৳{bn(Math.round(peak).toLocaleString("en-IN"))}</small></div>
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
            <div className="fin-kpi ok"><i className="fin-kpi-ico">৳</i><span>কাস্টমার বিল</span><b>৳{bn(billed)}</b><small>{bn(sum?.invoices ?? 0)}টি ইনভয়েস{sum?.creditNotes ? ` · ${bn(sum.creditNotes)}টি ক্রেডিট নোট` : ""}</small></div>
            <div className="fin-kpi ok"><i className="fin-kpi-ico">◎</i><span>হাতে টাকা</span><b>৳{bn(cashNet)}</b><small>সব খাত মিলিয়ে</small></div>
            <div className={`fin-kpi ${due ? "warn" : "ok"}`}><i className="fin-kpi-ico">⏳</i><span>COD বকেয়া</span><b>৳{bn(due)}</b><small>{due ? `${bn(sum?.codDueOrders ?? 0)}টি অর্ডার · পৌঁছালে হাতে আসবে` : "কোনো বকেয়া নেই"}</small></div>
          </div>
          {missingCost ? (
            <div className="fin-notes"><div className="fin-note">{bn(missingCost)}টি পণ্যে কেনা দাম নেই। লাভের সংখ্যা বন্ধ — আগে কেনা দাম দিন। বিল ও বকেয়া উপরে আছে।</div></div>
          ) : sum && (sum.invoices || sum.creditNotes) ? (
            <div className="fin-kpis">
              <div className="fin-kpi ok"><span>গ্রস</span><b>৳{bn(sum.gross)}</b><small>কনফার্মড বিক্রির স্ন্যাপশট থেকে</small></div>
              <div className="fin-kpi"><span>স্টকে আটকে</span><b>৳{bn(sum.stockValue)}</b><small>{bn(sum.stockUnits)} কপি × কেনা দাম</small></div>
            </div>
          ) : (
            <div className="fin-notes"><div className="fin-note">এই সময়ে কনফার্মড বিক্রির কোনো ইনভয়েস নেই।</div></div>
          )}
          <section className="fin-card fin-tbl-card">
            <div className="fin-tbl-top">
              <h3>অর্ডার অনুযায়ী</h3>
              {chips(pay, setPay, [["all", "সব"], ["got", "পেয়েছি"], ["due", "বকেয়া"]])}
            </div>
            {!rows.length ? <div className="empty">{ordersQ.isLoading ? "লোড হচ্ছে…" : "এই সময়ে কনফার্মড অর্ডার নেই"}</div> : (
              <table className="fin-tbl"><tbody>
                <tr><th>অর্ডার</th><th>পেমেন্ট</th><th>বিল</th><th>টাকা</th></tr>
                {rows.map((o) => {
                  const got = o.paymentStatus !== "UNPAID";
                  return (
                    <tr key={o.id}>
                      <td><b>{o.orderNo}</b></td>
                      <td>{isSslMethod(o.paymentMethod) ? "SSL" : o.paymentMethod === "COD" ? "ক্যাশ অন" : o.paymentMethod}</td>
                      <td>৳{bn(o.grandTotal)}</td>
                      <td><span className={`fin-pill ${got ? "ok" : "warn"}`}>{got ? "পেয়েছি" : "বকেয়া"}</span></td>
                    </tr>
                  );
                })}
              </tbody></table>
            )}
          </section>
        </>
      ) : null}

      {view === "paper" ? <Papers paperKind={paperKind} setPaperKind={setPaperKind} onOpen={setOpen} /> : null}
      {view === "buy" ? <Purchases accounts={accountsQ.data?.items ?? []} /> : null}
      {view === "cash" ? <CashBook day={day} setDay={setDay} accounts={accountsQ.data?.items ?? []} payable={sum?.supplierDue ?? 0} courier={sum?.courierDue ?? 0} /> : null}
      {view === "pnl" ? <PnlView tenure={tenure} setTenure={setTenure} period={tenureP} stockValue={sum?.stockValue ?? 0} onExport={(kind) => exportFinance(kind, tenureP).then(() => toast("CSV নামানো হয়েছে")).catch((e) => toast(adminErrorText(e)))} /> : null}
      <DocModal doc={open} onClose={() => setOpen(null)} title={open ? `${open.kindLabel} · ${open.docNo}` : undefined} sub={open?.orderNo ? `অর্ডার ${open.orderNo} · Document` : undefined} />
    </div>
  );
}

function Papers({
  paperKind, setPaperKind, onOpen,
}: {
  paperKind: string;
  setPaperKind: (v: string) => void;
  onOpen: (p: AdminDocument) => void;
}) {
  const q = useDocuments({ kind: paperKind === "all" ? undefined : DOC_KIND[paperKind], pageSize: 100 });
  const papers = q.data?.items ?? [];
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
      {!papers.length ? <div className="empty">{q.isLoading ? "লোড হচ্ছে…" : "এই কাগজ এখনো কাটেনি"}</div> : (
        <table className="fin-tbl"><tbody>
          <tr><th>কাগজ</th><th>অর্ডার</th><th>তারিখ</th><th>মোট</th><th></th></tr>
          {papers.map((p) => (
            <tr key={p.id}>
              <td><b>{p.docNo}</b><div className="author">{p.kindLabel}</div></td>
              <td>{p.orderNo ?? "—"}<div className="author">{p.customerName}</div></td>
              <td>{new Date(ms(p.issuedAt)).toLocaleDateString("bn-BD")}</td>
              <td>৳{bn(p.total)}</td>
              <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen(p)}>খুলুন</button></td>
            </tr>
          ))}
        </tbody></table>
      )}
    </section>
  );
}

type PurchaseLine = { productId: string; title: string; qty: number; cost: number };

function Purchases({ accounts }: { accounts: CashAccount[] }) {
  const toast = useToast();
  const suppliersQ = useSuppliers();
  const purchasesQ = usePurchases();
  const createSup = useCreateSupplier();
  const createM = useCreatePurchase();
  const [find, setFind] = useState("");
  const pickerQ = useProductPicker(find.trim());
  const products = pickerQ.data ?? [];
  const purchases = purchasesQ.data?.items ?? [];
  const live = accounts.filter((a) => a.isActive && a.type !== "GATEWAY");
  const [supplier, setSupplier] = useState("");
  const [when, setWhen] = useState(isoDay());
  const [paid, setPaid] = useState(true);
  const [account, setAccount] = useState("");
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [cost, setCost] = useState(0);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  useEffect(() => { if (!account && live[0]) setAccount(live[0].id); }, [live, account]);
  useEffect(() => { if (!products.some((p) => p.id === productId) && products[0]) setProductId(products[0].id); }, [products, productId]);

  function addLine() {
    const product = products.find((p) => p.id === productId);
    if (!product || qty < 1 || !(cost > 0)) {
      toast("পণ্য, কপি ও কেনা দাম দিন");
      return;
    }
    setLines((cur) => {
      const hit = cur.find((l) => l.productId === product.id);
      if (hit) return cur.map((l) => (l.productId === product.id ? { ...l, qty: l.qty + qty, cost } : l));
      return [...cur, { productId: product.id, title: product.title, qty, cost }];
    });
  }

  async function save() {
    const name = supplier.trim();
    if (!name || !lines.length) {
      toast("সাপ্লায়ার ও অন্তত একটা লাইন দিন");
      return;
    }
    if (paid && !account) { toast("কোন খাত থেকে দেবেন বাছুন"); return; }
    let supplierId = (suppliersQ.data?.items ?? []).find((x) => x.name.trim() === name)?.id;
    if (!supplierId) {
      try { supplierId = (await createSup.mutateAsync({ name })).id; } catch { return; }
    }
    createM.mutate({
      supplierId, purchasedAt: when, note: note.trim() || undefined,
      lines: lines.map((l) => ({ productId: l.productId, quantity: l.qty, unitCost: l.cost })),
      payment: paid ? { accountId: account } : undefined,
      toast: paid ? "ক্রয় বিল সেভ · স্টক বেড়েছে · টাকা কমেছে" : "ক্রয় বিল সেভ · স্টক বেড়েছে · সাপ্লায়ার বকেয়া",
    }, { onSuccess: () => { setLines([]); setSupplier(""); setNote(""); } });
  }

  const total = lines.reduce((s, l) => s + l.qty * l.cost, 0);

  return (
    <div className="fin-page">
      <section className="fin-card">
        <h3>নতুন ক্রয় বিল</h3>
        <p className="sub">সাপ্লায়ার, কপি, কেনা দাম। সেভ করলে স্টক বাড়ে এবং ওই কেনা দাম পণ্যে বসে।</p>
        <div className="form-grid">
          <div><label>সাপ্লায়ার</label><input list="fin-suppliers" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="পাঞ্জেরী / রকমারি" />
            <datalist id="fin-suppliers">{(suppliersQ.data?.items ?? []).map((x) => <option key={x.id} value={x.name} />)}</datalist></div>
          <BnDateField label="তারিখ" value={when} onChange={setWhen} />
        </div>
        <div className="form-grid">
          <div>
            <label>পণ্য</label>
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="পণ্য খুঁজুন…" style={{ marginBottom: 6 }} />
            <select value={productId} onChange={(e) => { setProductId(e.target.value); const p = products.find((x) => x.id === e.target.value); if (p?.costPrice) setCost(p.costPrice); }}>
              {products.map((p) => <option key={p.id} value={p.id}>{p.title} · {p.section.name}</option>)}
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
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              {live.map((a) => <option key={a.id} value={a.id}>{a.name} · ৳{bn(a.balance)}</option>)}
            </select>
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}><label>নোট</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="চালান নম্বর, ঐচ্ছিক" /></div>
        <div className="save-row">
          <span className="hint-txt">মোট ৳{bn(total)}</span>
          <button type="button" className="btn btn-primary" disabled={createM.isPending || createSup.isPending} onClick={() => void save()}>ক্রয় সেভ</button>
        </div>
      </section>
      <section className="fin-card fin-tbl-card">
        <h3>ক্রয় খতিয়ান</h3>
        {!purchases.length ? <div className="empty">{purchasesQ.isLoading ? "লোড হচ্ছে…" : "এখনো কোনো ক্রয় বিল নেই"}</div> : (
          <table className="fin-tbl"><tbody>
            <tr><th>বিল</th><th>সাপ্লায়ার</th><th>লাইন</th><th>মোট</th><th>টাকা</th></tr>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td><b>{p.purchaseNo}</b><div className="author">{new Date(ms(p.purchasedAt)).toLocaleDateString("bn-BD")}</div></td>
                <td>{p.supplier.name}</td>
                <td>{p.items.map((l) => `${l.title} × ${bn(l.quantity)}`).join(", ")}</td>
                <td>৳{bn(p.total)}</td>
                <td><span className={`fin-pill ${p.paymentStatus === "PAID" ? "ok" : "warn"}`}>{p.paymentStatus === "PAID" ? "পরিশোধ" : p.paymentStatus === "PARTIAL" ? `আংশিক · বাকি ৳${bn(p.due)}` : "বকেয়া"}</span></td>
              </tr>
            ))}
          </tbody></table>
        )}
      </section>
    </div>
  );
}

function CashBook({
  day, setDay, accounts, payable, courier,
}: {
  day: string;
  setDay: (v: string) => void;
  accounts: CashAccount[];
  payable: number;
  courier: number;
}) {
  const toast = useToast();
  const closeQ = useDayClose(day);
  const entryM = useManualEntry();
  const reverseM = useReverseEntry();
  const courierM = useCourierPayment();
  const ordersQ = useFinanceOrders("30", "all");
  const live = accounts.filter((a) => a.isActive);
  const [account, setAccount] = useState("");
  const [dir, setDir] = useState<"in" | "out">("out");
  const [amount, setAmount] = useState(0);
  const [memo, setMemo] = useState("");
  const [courierId, setCourierId] = useState("");
  useEffect(() => { if (!account && live[0]) setAccount(live[0].id); }, [live, account]);
  const shipped = (ordersQ.data?.items ?? []).filter((o) => o.shipment);
  const balances = live.map((a) => ({ account: a.name, id: a.id, amount: a.balance }));
  const dc = closeQ.data;
  const opening = dc?.opening ?? 0;
  const dayIn = dc?.in ?? 0;
  const dayOut = dc?.out ?? 0;
  const close = dc?.closing ?? 0;
  const rows = (dc?.entries ?? []).slice().sort((a, b) => ms(a.occurredAt) - ms(b.occurredAt));

  function add() {
    if (!memo.trim() || !(amount > 0) || !account) {
      toast("খাত, টাকা ও খতিয়ান লিখুন");
      return;
    }
    entryM.mutate({ accountId: account, direction: dir === "in" ? "IN" : "OUT", amount, memo: memo.trim(), occurredAt: day }, { onSuccess: () => { setMemo(""); setAmount(0); } });
  }

  function payCourier() {
    if (!courierId || !account) {
      toast("কুরিয়ার খরচসহ অর্ডার বাছুন");
      return;
    }
    courierM.mutate({ orderId: courierId, accountId: account, occurredAt: day });
  }

  function reverse(e: CashEntry) {
    const reason = window.prompt("কেন উল্টাচ্ছেন? (কারণ লগে থাকবে)", "ভুল এন্ট্রি");
    if (!reason || reason.trim().length < 2) return;
    reverseM.mutate({ id: e.id, reason: reason.trim() });
  }

  return (
    <>
      <div className="fin-kpis fin-kpis-4">
        {balances.map((b, i) => (
          <div key={b.id} className={`fin-kpi fin-acct a-${i % 4}`}><i className="fin-kpi-ico">{b.account.slice(0, 1)}</i><span>{b.account}</span><b>৳{bn(b.amount)}</b><small>সব দিন মিলিয়ে</small></div>
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
        {!rows.length ? <div className="empty">{closeQ.isLoading ? "লোড হচ্ছে…" : "এই দিনে কোনো এন্ট্রি নেই"}</div> : (
          <table className="fin-tbl"><tbody>
            <tr><th>সময়</th><th>খাত</th><th>খতিয়ান</th><th>ঢোকা</th><th>বের</th><th></th></tr>
            {rows.map((e) => (
              <tr key={e.id} style={e.reversedById ? { opacity: 0.55 } : undefined}>
                <td>{new Date(ms(e.occurredAt)).toLocaleTimeString("bn-BD", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>{e.account.name}</td>
                <td>{e.memo}<div className="author">{e.kindLabel}{e.reversedById ? " · উল্টানো" : e.reversesId ? " · উল্টো এন্ট্রি" : ""}</div></td>
                <td>{e.direction === "IN" ? `৳${bn(e.amount)}` : ""}</td>
                <td>{e.direction === "OUT" ? `৳${bn(e.amount)}` : ""}</td>
                <td>{!e.reversedById && !e.reversesId ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => reverse(e)}>উল্টান</button> : null}</td>
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
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              {live.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
          <button type="button" className="btn btn-primary btn-sm" disabled={entryM.isPending} onClick={add}>এন্ট্রি বসান</button>
        </div>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div>
            <label>কুরিয়ার পরিশোধ</label>
            <select value={courierId} onChange={(e) => setCourierId(e.target.value)}>
              <option value="">অর্ডার বাছুন</option>
              {shipped.map((o) => (
                <option key={o.id} value={o.id}>{o.orderNo} · ৳{bn(o.grandTotal)}</option>
              ))}
            </select>
          </div>
          <div className="save-row"><button type="button" className="btn btn-ghost btn-sm" disabled={courierM.isPending} onClick={payCourier}>কুরিয়ার দিন</button></div>
        </div>
      </section>
    </>
  );
}

function PnlView({
  tenure, setTenure, period, stockValue, onExport,
}: {
  tenure: Tenure;
  setTenure: (v: Tenure) => void;
  period: ReportPeriod;
  stockValue: number;
  onExport: (kind: "pnl" | "cashbook" | "documents") => void;
}) {
  const pnlQ = usePnl(period);
  const catsQ = useCategoryReport(period);
  const empty: Pnl = { period: tenure, from: "", to: "", sales: 0, coupon: 0, netSales: 0, cogs: 0, gross: 0, marginPct: 0, deliveryIncome: 0, courierCost: 0, gatewayFee: 0, courierLoss: 0, net: 0, invoices: 0, creditNotes: 0, skipped: 0, missingCostProducts: 0, costsReady: true };
  const p = pnlQ.data ?? empty;
  const pnl = { sales: p.sales, coupon: p.coupon, cogs: p.cogs, shipIn: p.deliveryIncome, courier: p.courierCost, sslFee: p.gatewayFee, courierLoss: p.courierLoss, skipped: p.skipped, invoices: p.invoices, credits: p.creditNotes };
  const gross = p.gross;
  const net = p.net;
  const missingCost = p.missingCostProducts;
  const costsReady = p.costsReady && !missingCost;
  const cats = useMemo(() => (catsQ.data?.items ?? []).map((r) => ({ cat: r.category, qty: r.qty, sales: r.sales, cogs: r.cogs })), [catsQ.data]);
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
        <div className="fin-tbl-top">
          <h3>{label} হিসাব</h3>
          <div className="ord-chips">
            <button type="button" className="ofilt" onClick={() => onExport("pnl")}>লাভ-ক্ষতি CSV</button>
            <button type="button" className="ofilt" onClick={() => onExport("cashbook")}>ক্যাশবুক CSV</button>
            <button type="button" className="ofilt" onClick={() => onExport("documents")}>কাগজ CSV</button>
          </div>
        </div>
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
