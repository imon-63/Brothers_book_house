"use client";

import { AdminPanel } from "@/components/admin/admin-panel";
import { setAuth } from "@/store/slices/ui-slice";
import { useAppDispatch, useAppSelector } from "@/store/hooks";

export default function AdminPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.session.users.find((u) => u.id === s.session.userId) ?? null);

  if (!user || user.role !== "admin") {
    return (
      <div className="wrap desk-page">
        <p className="crumb">হোম / <b>অ্যাডমিন</b></p>
        <section className="desk-lock">
          <p className="me-kicker">চলো ডেস্ক</p>
          <h1>অ্যাডমিন</h1>
          <p>এই ডেস্ক শুধু অ্যাডমিন অ্যাকাউন্টে খোলে।</p>
          <button className="btn btn-primary" type="button" onClick={() => dispatch(setAuth(true))}>লগইন</button>
        </section>
      </div>
    );
  }

  return <AdminPanel />;
}
