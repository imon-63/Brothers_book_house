"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { bn } from "@/lib/format";
import { setUser, updateUser } from "@/store/slices/session-slice";
import { setAuth, showToast } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

function IcoUser() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19c1.2-3.2 3.6-5 6.5-5s5.3 1.8 6.5 5" /></svg>;
}
function IcoPhone() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></svg>;
}
function IcoMail() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></svg>;
}

function tail(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 11 ? digits.slice(-11) : digits;
}

export default function ProfilePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const user = useAppSelector((s) => s.session.users.find((u) => u.id === s.session.userId) ?? null);
  const orders = useAppSelector((s) => s.orders.orders);
  const cartCount = useAppSelector((s) => s.cart.lines.length);
  const productCount = useAppSelector((s) => s.shop.products.length);
  const couponCount = useAppSelector((s) => s.shop.coupons.filter((c) => c.active).length);
  const form = useForm({ defaultValues: { name: user?.name || "", phone: user?.phone || "", email: user?.email || "" } });
  const [checked, setChecked] = useState(false);
  const leftOnPurpose = useRef(false);

  useEffect(() => { setChecked(true); }, []);
  const resetProfile = form.reset;
  useEffect(() => {
    if (!user) return;
    resetProfile({ name: user.name, phone: user.phone, email: user.email });
  }, [user, resetProfile]);
  useEffect(() => {
    if (!checked || user || leftOnPurpose.current) return;
    router.replace("/");
    dispatch(setAuth(true));
  }, [checked, user, router, dispatch]);

  if (!user) return null;

  const mine = orders.filter((o) => (user.phone && tail(o.phone) === tail(user.phone)) || (user.email && o.email === user.email));
  const moving = mine.filter((o) => o.status >= 0 && o.status < 4).length;
  const shopMoving = orders.filter((o) => o.status >= 0 && o.status < 4).length;
  const mark = user.name.trim().slice(0, 1) || "চ";
  const admin = user.role === "admin";

  function save(values: { name: string; phone: string; email: string }) {
    dispatch(updateUser({ id: user!.id, patch: { name: values.name.trim() || user!.name, phone: values.phone.trim(), email: values.email.trim() } }));
    dispatch(showToast("প্রোফাইল আপডেট"));
  }

  function logout() {
    leftOnPurpose.current = true;
    dispatch(setUser(null));
    dispatch(showToast("লগআউট"));
    router.push("/");
  }

  if (admin) {
    return (
      <div className="wrap me-page me-admin">
        <p className="crumb">হোম / <b>প্রোফাইল</b></p>
        <section className="me-hero">
          <div className="me-mark" aria-hidden>{mark}</div>
          <div className="me-id">
            <p className="me-kicker">দোকান ডেস্ক</p>
            <h1>{user.name}</h1>
            <span className="me-role">অ্যাডমিন</span>
            <div className="me-chips">
              {user.phone ? <span>{user.phone}</span> : null}
              {user.email ? <span>{user.email}</span> : null}
            </div>
          </div>
        </section>
        <div className="me-stats">
          <article><b>{bn(productCount)}</b><span>পণ্য</span></article>
          <article><b>{bn(shopMoving)}</b><span>চলমান অর্ডার</span></article>
          <article><b>{bn(couponCount)}</b><span>চালু কুপন</span></article>
        </div>
        <div className="me-grid">
          <form className="me-card" onSubmit={form.handleSubmit(save)}>
            <h2>অ্যাকাউন্ট</h2>
            <p className="me-sub">এই নাম ও নম্বর দোকান ডেস্কে থাকবে। এখান থেকে কেনাকাটা হয় না।</p>
            <label className="lab-ico"><IcoUser /> পূর্ণ নাম</label>
            <div className="field-box"><span className="field-ico"><IcoUser /></span><input {...form.register("name")} /></div>
            <label className="lab-ico"><IcoPhone /> মোবাইল</label>
            <div className="field-box"><span className="field-ico"><IcoPhone /></span><input type="tel" {...form.register("phone")} /></div>
            <label className="lab-ico"><IcoMail /> ইমেইল <span className="author">(ঐচ্ছিক)</span></label>
            <div className="field-box"><span className="field-ico"><IcoMail /></span><input type="email" {...form.register("email")} /></div>
            <button className="btn btn-primary me-save" type="submit">সেভ</button>
          </form>
          <aside className="me-side">
            <div className="me-card me-addr">
              <h2>দোকান চালান</h2>
              <p>পণ্য, দাম, কুপন, ডেলিভারি আর হিসাব — সব অ্যাডমিন ডেস্কে।</p>
              <Link className="btn btn-gold btn-sm" href="/admin">অ্যাডমিন ডেস্ক</Link>
            </div>
            <div className="me-links">
              <button type="button" onClick={logout}>লগআউট</button>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap me-page">
      <p className="crumb">হোম / <b>প্রোফাইল</b></p>
      <section className="me-hero">
        <div className="me-mark" aria-hidden>{mark}</div>
        <div className="me-id">
          <p className="me-kicker">চলো অ্যাকাউন্ট</p>
          <h1>{user.name}</h1>
          <span className="me-role">ক্রেতা</span>
          <div className="me-chips">
            {user.phone ? <span>{user.phone}</span> : null}
            {user.email ? <span>{user.email}</span> : null}
          </div>
        </div>
      </section>
      <div className="me-stats">
        <article><b>{bn(mine.length)}</b><span>আমার অর্ডার</span></article>
        <article><b>{bn(moving)}</b><span>পথে আছে</span></article>
        <article><b>{bn(cartCount)}</b><span>কার্টে</span></article>
      </div>
      <div className="me-grid">
        <form className="me-card" onSubmit={form.handleSubmit(save)}>
          <h2>তথ্য বদলান</h2>
          <p className="me-sub">নাম, মোবাইল আর ইমেইল সেভ হলে চেকআউট ও অর্ডারে এই তথ্যই যাবে।</p>
          <label className="lab-ico"><IcoUser /> পূর্ণ নাম</label>
          <div className="field-box"><span className="field-ico"><IcoUser /></span><input {...form.register("name")} /></div>
          <label className="lab-ico"><IcoPhone /> মোবাইল</label>
          <div className="field-box"><span className="field-ico"><IcoPhone /></span><input type="tel" {...form.register("phone")} /></div>
          <label className="lab-ico"><IcoMail /> ইমেইল <span className="author">(ঐচ্ছিক)</span></label>
          <div className="field-box"><span className="field-ico"><IcoMail /></span><input type="email" {...form.register("email")} /></div>
          <button className="btn btn-primary me-save" type="submit">সেভ</button>
        </form>
        <aside className="me-side">
          <div className="me-card me-addr">
            <h2>ডেলিভারি ঠিকানা</h2>
            <p>এখনো সেভ নেই। চেকআউটে ঠিকানা দিলে পরের অর্ডারে সেটাই মনে থাকবে।</p>
            <Link className="btn btn-gold btn-sm" href="/checkout">চেকআউটে যান</Link>
          </div>
          <div className="me-links">
            <Link href="/orders">
              <b>আমার অর্ডার</b>
              <small>স্টেপ আর রসিদ</small>
            </Link>
            <Link href="/wait">
              <b>ভবিষ্যৎ অর্ডার</b>
              <small>{bn((user.wait || []).length)}টি রাখা আছে</small>
            </Link>
            <Link href="/track">
              <b>অর্ডার খুঁজুন</b>
              <small>ফোন বা অর্ডার আইডি</small>
            </Link>
            <button type="button" onClick={logout}>লগআউট</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
