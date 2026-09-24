"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { describeLine } from "@/lib/cart/describe";
import { allDistricts, divOfDist, geoList } from "@/lib/geo";
import { snapshotLines, stockShort, stockUnits } from "@/lib/orders/ledger";
import { cartFreeShip, couponOff, quoteCheckout, shipNote } from "@/lib/demo/pricing";
import { bn } from "@/lib/format";
import { clearCart } from "@/store/slices/cart-slice";
import { holdStock } from "@/store/slices/shop-slice";
import { placeOrder, setCoupon } from "@/store/slices/order-slice";
import { showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

type CheckValues = {
  cName: string;
  cPhone: string;
  cEmail: string;
  cDist: string;
  cUpa: string;
  cUni: string;
  cDetail: string;
  pay: "cod" | "ssl";
};

function IcoUser() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c1.2-3.2 3.6-5 6.5-5s5.3 1.8 6.5 5" /></svg>;
}
function IcoPhone() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></svg>;
}
function IcoMail() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></svg>;
}
function IcoPin() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6.2 7-11.2A7 7 0 1 0 5 9.8C5 14.8 12 21 12 21z" /><circle cx="12" cy="10" r="2.2" /></svg>;
}
function IcoTicket() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 8.5A2.5 2.5 0 0 0 6.5 6h11A2.5 2.5 0 0 0 20 8.5v1a2 2 0 0 1 0 5v1A2.5 2.5 0 0 0 17.5 18h-11A2.5 2.5 0 0 0 4 15.5v-1a2 2 0 0 1 0-5v-1z" /><path d="M12 7v10" strokeDasharray="2 3" /></svg>;
}

export default function CheckoutPage() {
  const lines = useAppSelector((s) => s.cart.lines);
  const coupon = useAppSelector((s) => s.orders.coupon);
  const products = useAppSelector((s) => s.shop.products);
  const packs = useAppSelector((s) => s.shop.packs);
  const coupons = useAppSelector((s) => s.shop.coupons);
  const shipRates = useAppSelector((s) => s.shop.ship);
  const user = useAppSelector((s) => s.session.users.find((u) => u.id === s.session.userId) ?? null);
  const dispatch = useAppDispatch();
  const router = useRouter();

  const form = useForm<CheckValues>({
    defaultValues: {
      cName: user?.name || "",
      cPhone: user?.phone || "",
      cEmail: user?.email || "",
      cDist: "",
      cUpa: "",
      cUni: "",
      cDetail: "",
      pay: "cod",
    },
  });
  const seeded = useRef(false);
  useEffect(() => {
    if (!user || seeded.current) return;
    seeded.current = true;
    form.setValue("cName", user.name || "");
    form.setValue("cPhone", user.phone || "");
    form.setValue("cEmail", user.email || "");
  }, [user, form]);
  const dist = form.watch("cDist");
  const upa = form.watch("cUpa");
  const pay = form.watch("pay");
  const errs = form.formState.errors;
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [bad, setBad] = useState(false);
  const [hand, setHand] = useState<{ x: number; y: number; dx: number; dy: number; rot: number; id: number } | null>(null);
  const checkTimer = useRef(0);
  const handPlayed = useRef(false);

  const districts = useMemo(() => allDistricts(), []);
  const div = divOfDist(dist);
  const upazilas = dist ? geoList(div, dist) : [];
  const unions = dist && upa ? geoList(div, dist, upa) : [];

  const rows = lines.map((line) => ({ ...line, ...describeLine(line, products, packs) }));
  const sub = rows.reduce((s, r) => s + r.price * r.n, 0);
  const quote = quoteCheckout(sub, coupon, dist, coupons, shipRates, cartFreeShip(lines, products, packs, shipRates));
  const couponFits = !coupon && sub > 0 && coupons.some((c) => c.active && couponOff(sub, c.code, coupons) > 0);

  useEffect(() => {
    if (!couponFits || handPlayed.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let dead = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const clearPoint = () => {
      document.querySelectorAll(".nav-cpn.cpn-point").forEach((el) => el.classList.remove("cpn-point"));
    };
    const point = (id: number) => {
      if (dead) return;
      const dock = document.querySelector(".cpn-dock");
      const chips = [...document.querySelectorAll(".nav-cpns .nav-cpn")] as HTMLElement[];
      const chip = chips[0];
      if (!dock || !chip) return;
      const from = dock.getBoundingClientRect();
      const to = chip.getBoundingClientRect();
      if (from.width < 8 || to.width < 8) return;
      const x = from.left + from.width * 0.62;
      const y = from.top + 6;
      const tx = to.left + to.width / 2;
      const ty = to.bottom + 2;
      chips.forEach((el) => el.classList.add("cpn-point"));
      setHand({
        x,
        y,
        dx: tx - x,
        dy: ty - y,
        rot: Math.atan2(ty - y, tx - x) * (180 / Math.PI) + 90,
        id,
      });
      later(() => {
        clearPoint();
        setHand(null);
      }, 1150);
    };
    later(() => {
      if (dead) return;
      handPlayed.current = true;
      point(0);
      later(() => point(1), 3000);
      later(() => point(2), 6000);
    }, 700);
    return () => {
      dead = true;
      timers.forEach((id) => window.clearTimeout(id));
      clearPoint();
      setHand(null);
    };
  }, [couponFits]);

  function beginCheck(raw: string) {
    const next = raw.trim();
    if (!next || checking || coupon) return;
    setCode(next);
    setBad(false);
    setChecking(true);
    window.clearTimeout(checkTimer.current);
    checkTimer.current = window.setTimeout(() => {
      const hit = coupons.find((c) => c.active && c.code.toUpperCase() === next.toUpperCase());
      setChecking(false);
      if (!hit) {
        setBad(true);
        dispatch(showToast("কুপন সঠিক নয়"));
        return;
      }
      dispatch(setCoupon(hit.code));
      setCode("");
      dispatch(showToast("কুপন প্রয়োগ হয়েছে"));
    }, 900);
  }

  function removeCoupon() {
    window.clearTimeout(checkTimer.current);
    setChecking(false);
    setBad(false);
    setCode("");
    dispatch(setCoupon(""));
    dispatch(showToast("কুপন সরানো হয়েছে"));
  }

  function onInvalid(fieldErrs: FieldErrors<CheckValues>) {
    const first = Object.keys(fieldErrs)[0];
    if (first) document.getElementById(first)?.closest(".field-box")?.scrollIntoView({ behavior: "smooth", block: "center" });
    dispatch(showToast("খালি ঘরগুলো পূরণ করুন"));
  }

  function onValid(values: CheckValues) {
    if (quote.ship == null) {
      form.setError("cDist", { message: "জেলা বাছুন" });
      dispatch(showToast("জেলা বাছুন — তাহলে ডেলিভারি খরচ বসবে"));
      return;
    }
    if (values.pay === "ssl") {
      dispatch(showToast("স্যান্ডবক্স সার্ভার চালু নেই"));
      return;
    }
    const address = [values.cDetail.trim(), values.cUni, values.cUpa, values.cDist].filter(Boolean).join(", ");
    const snap = snapshotLines(lines, products, packs);
    const units = stockUnits(snap);
    const short = stockShort(units, products);
    if (short) {
      dispatch(showToast(`${short} এর স্টক নেই`));
      return;
    }
    dispatch(holdStock(units));
    dispatch(placeOrder({
      name: values.cName.trim(),
      phone: values.cPhone.trim(),
      email: values.cEmail.trim() || user?.email || "",
      total: quote.grand,
      items: rows.map((r) => `${r.title} × ${r.n}`).join(", "),
      address,
      pay: "ক্যাশ অন ডেলিভারি",
      lines: snap,
      sub: quote.sub,
      coupon: coupon || undefined,
      couponOff: quote.off,
      ship: quote.ship ?? 0,
      shipCost: values.cDist === "ঢাকা" ? shipRates.costDhaka : shipRates.costOutside,
      stockHeld: true,
    }));
    dispatch(clearCart());
    dispatch(showToast("অর্ডার নিশ্চিত হয়েছে"));
    router.push("/orders");
  }

  return (
    <div className="wrap">
      {!rows.length ? (
        <div className="empty cart-empty">
          <img className="empty-art" src="/icons/empty-cart.png" alt="কার্ট খালি" width={260} height={260} />
          <p className="serif">কার্ট এখন খালি</p>
          <Link className="btn btn-primary" href="/shop" style={{ marginTop: 16 }}>ক্যাটালগ দেখুন</Link>
        </div>
      ) : (
        <div className="check-layout">
          <div className="check-main">
          <h2 className="check-title">চেকআউট</h2>
          <form className="box check-form" onSubmit={form.handleSubmit(onValid, onInvalid)} noValidate>
            <h3 className="addr-head" style={{ marginTop: 0 }}>যোগাযোগ</h3>
            <div className="form-grid">
              <div>
                <label className="lab-ico" htmlFor="cName"><IcoUser /> পূর্ণ নাম</label>
                <div className={`field-box${errs.cName ? " bad" : ""}`}>
                  <span className="field-ico"><IcoUser /></span>
                  <input id="cName" placeholder="আপনার পূর্ণ নাম" {...form.register("cName", { validate: (v) => !!v.trim() || "পূর্ণ নাম লিখুন" })} />
                </div>
                <p className={`field-warn${errs.cName ? " on" : ""}`}>{errs.cName?.message}</p>
              </div>
              <div>
                <label className="lab-ico" htmlFor="cPhone"><IcoPhone /> ফোন</label>
                <div className={`field-box${errs.cPhone ? " bad" : ""}`}>
                  <span className="field-ico"><IcoPhone /></span>
                  <input id="cPhone" type="tel" placeholder="01XXXXXXXXX" {...form.register("cPhone", { validate: (v) => !v.trim() ? "মোবাইল নম্বর দিন" : v.replace(/\D/g, "").length >= 10 || "সঠিক মোবাইল নম্বর দিন" })} />
                </div>
                <p className={`field-warn${errs.cPhone ? " on" : ""}`}>{errs.cPhone?.message}</p>
              </div>
              <div className="span-2">
                <label className="lab-ico" htmlFor="cEmail"><IcoMail /> ইমেইল <span className="author">(ঐচ্ছিক)</span></label>
                <div className={`field-box${errs.cEmail ? " bad" : ""}`}>
                  <span className="field-ico"><IcoMail /></span>
                  <input id="cEmail" type="email" placeholder="name@email.com" {...form.register("cEmail", { validate: (v) => !v.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || "সঠিক ইমেইল দিন" })} />
                </div>
                <p className={`field-warn${errs.cEmail ? " on" : ""}`}>{errs.cEmail?.message}</p>
              </div>
            </div>

            <h3 className="addr-head">ডেলিভারি ঠিকানা</h3>
            <p className="addr-sub">জেলা ও উপজেলা বাছুন। ইউনিয়ন/পৌরসভা চাইলে দিন। গ্রাম, বাড়ি, রাস্তা আর ল্যান্ডমার্ক একসাথে লিখুন।</p>
            <div className="form-grid">
              <div>
                <label htmlFor="cDist">জেলা</label>
                <div className={`field-box${errs.cDist ? " bad" : ""}`}>
                  <span className="field-ico"><IcoPin /></span>
                  <select id="cDist" {...form.register("cDist", { required: "জেলা বাছুন", onChange: () => { form.setValue("cUpa", ""); form.setValue("cUni", ""); } })}>
                    <option value="">জেলা বাছুন</option>
                    {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <p className={`field-warn${errs.cDist ? " on" : ""}`}>{errs.cDist?.message}</p>
              </div>
              <div>
                <label htmlFor="cUpa">উপজেলা / থানা</label>
                <div className={`field-box${errs.cUpa ? " bad" : ""}`}>
                  <span className="field-ico"><IcoPin /></span>
                  <select id="cUpa" {...form.register("cUpa", { required: "উপজেলা / থানা বাছুন", onChange: () => form.setValue("cUni", "") })}>
                    <option value="">উপজেলা / থানা বাছুন</option>
                    {upazilas.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <p className={`field-warn${errs.cUpa ? " on" : ""}`}>{errs.cUpa?.message}</p>
              </div>
              <div className="span-2">
                <label htmlFor="cUni">ইউনিয়ন / পৌরসভা / ওয়ার্ড <span className="author">(ঐচ্ছিক)</span></label>
                <div className="field-box">
                  <span className="field-ico"><IcoPin /></span>
                  <select id="cUni" {...form.register("cUni")}>
                    <option value="">ইউনিয়ন / পৌরসভা (ঐচ্ছিক)</option>
                    {unions.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value="অন্যান্য">অন্যান্য</option>
                  </select>
                </div>
              </div>
              <div className="span-2">
                <label htmlFor="cDetail">বিস্তারিত ঠিকানা</label>
                <div className={`field-box area${errs.cDetail ? " bad" : ""}`}>
                  <span className="field-ico"><IcoPin /></span>
                  <textarea id="cDetail" placeholder="গ্রাম / মহল্লা, বাড়ি বা হোল্ডিং, রাস্তা, ল্যান্ডমার্ক (মসজিদ, স্কুল, বাজার)" {...form.register("cDetail", { validate: (v) => !!v.trim() || "বিস্তারিত ঠিকানা লিখুন" })} />
                </div>
                <p className={`field-warn${errs.cDetail ? " on" : ""}`}>{errs.cDetail?.message}</p>
              </div>
            </div>

            <h3 className="addr-head">পেমেন্ট</h3>
            <div className="pay-modes">
              <label className={`pay-card${pay === "cod" ? " on" : ""}`}>
                <input type="radio" value="cod" {...form.register("pay")} />
                <b>ক্যাশ অন ডেলিভারি</b>
                <span>পণ্য হাতে পেয়ে টাকা দিন</span>
              </label>
              <label className={`pay-card${pay === "ssl" ? " on" : ""}`}>
                <input type="radio" value="ssl" {...form.register("pay")} />
                <b>এখনই পেমেন্ট</b>
                <span>SSLCOMMERZ — বিকাশ, নগদ, কার্ড</span>
              </label>
            </div>
            {!user ? <p className="guest-note">গেস্ট হিসেবে অর্ডার করতে পারবেন। পরে মোবাইল নম্বর অথবা অর্ডার আইডি দিয়ে ট্র্যাক করবেন।</p> : null}
            <p className="note">{shipNote(quote)}</p>
            <button className="btn btn-primary btn-wide" type="submit" style={{ marginTop: 16 }}>
              {pay === "cod" ? "অর্ডার নিশ্চিত করুন" : "SSLCOMMERZ-এ পেমেন্ট"}
            </button>
          </form>
          </div>

          <aside className="sum check-sum">
            <h3 className="serif" style={{ fontSize: 22, marginBottom: 10 }}>অর্ডার</h3>
            <div className="sum-items">
              {rows.map((r) => (
                <div className="sum-item" key={`${r.kind}-${r.id}`}>
                  <div>
                    <b>{r.title}</b>
                    <span className="author">{bn(r.n)} × ৳{bn(r.price)}</span>
                  </div>
                  <div className="sum-price">৳{bn(r.price * r.n)}</div>
                </div>
              ))}
            </div>
            <div className="row"><span>সাবটোটাল</span><span>৳{bn(quote.sub)}</span></div>
            <div className="row"><span>কুপন ছাড়</span><span>{quote.off ? `−৳${bn(quote.off)}` : "—"}</span></div>
            {quote.ship ? (
              <div className="row">
                <span>ডেলিভারি{quote.why ? <small className="ship-why">{quote.why}</small> : null}</span>
                <span>৳{bn(quote.ship)}</span>
              </div>
            ) : null}
            <div className="row total"><span>মোট</span><span>৳{bn(quote.grand)}</span></div>
            <div className={`cpn-dock${coupon ? " on" : ""}${checking ? " wait" : ""}`}>
              {coupon ? (
                <div className="cpn-applied">
                  <span className="cpn-ico"><IcoTicket /></span>
                  <div>
                    <strong>{coupon}</strong>
                    <span>{quote.off ? `−৳${bn(quote.off)}` : "প্রয়োগ হয়েছে"}</span>
                  </div>
                  <button type="button" onClick={removeCoupon}>সরান</button>
                </div>
              ) : (
                <>
                  <div className="cpn-top">
                    <span className="cpn-ico">{checking ? <i className="spin" /> : <IcoTicket />}</span>
                    <div>
                      <b>কুপন</b>
                      <p>{checking ? "যাচাই হচ্ছে" : "কোড বসান"}</p>
                    </div>
                  </div>
                  <div className={`field-box${bad ? " bad" : ""}`}>
                    <input
                      value={code}
                      placeholder="পেস্ট করুন"
                      autoComplete="off"
                      disabled={checking}
                      onChange={(e) => { setCode(e.target.value); setBad(false); }}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text");
                        if (!text.trim()) return;
                        e.preventDefault();
                        beginCheck(text);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); beginCheck(code); } }}
                    />
                  </div>
                  <p className={`field-warn${bad ? " on" : ""}`}>এই কোড মেলেনি</p>
                </>
              )}
            </div>
            <p className="pay">বিকাশ · নগদ · ভিসা · মাস্টারকার্ড</p>
          </aside>
        </div>
      )}
      {hand ? (
        <span
          key={hand.id}
          className="cpn-hand"
          style={{
            left: hand.x,
            top: hand.y,
            ["--dx" as string]: `${hand.dx}px`,
            ["--dy" as string]: `${hand.dy}px`,
            ["--rot" as string]: `${hand.rot}deg`,
          }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 64 82" width="52" height="66">
            <path fill="#fff8ee" stroke="#7A2430" strokeWidth="2.2" strokeLinejoin="round" d="M14 50c0-6.2 4.4-10.4 10.2-10.4h16.2c5.8 0 10.2 4.2 10.2 10.4v12.4c0 10.4-8.2 18.6-18.4 18.6S14 72.8 14 62.4V50z" />
            <path fill="#fff8ee" stroke="#7A2430" strokeWidth="2.2" strokeLinecap="round" d="M15.2 52.5c-6.4 1.6-9.2 8-6.6 13.2 1.6 3.2 5 3.6 7.4 2" />
            <rect x="19" y="2" width="12" height="50" rx="6" fill="#fff8ee" stroke="#7A2430" strokeWidth="2.2" />
            <rect x="33" y="14" width="12" height="38" rx="6" fill="#fff8ee" stroke="#7A2430" strokeWidth="2.2" />
            <rect x="18" y="36" width="28" height="20" fill="#fff8ee" />
            <path d="M22 10h6M36 22h6" stroke="#C4A15A" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}
