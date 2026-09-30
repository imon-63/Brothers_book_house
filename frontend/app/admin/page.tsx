"use client";

import { AdminPanel } from "@/components/admin/admin-panel";
import { useMe } from "@/lib/api/auth";
import { setAuth } from "@/store/slices/ui-slice";
import { useAppDispatch } from "@/store/hooks";

export default function AdminPage() {
  const dispatch = useAppDispatch();
  const { me, loading, isStaff } = useMe();

  if (loading) {
    return (
      <div className="adm-boot"><img src="/icons/cholo-mark.svg" alt="চলো" width={64} height={64} /></div>
    );
  }

  if (!me || !isStaff) {
    return (
      <div className="wrap desk-page">
        <p className="crumb">হোম / <b>অ্যাডমিন</b></p>
        <section className="desk-lock">
          <p className="me-kicker">চলো ডেস্ক</p>
          <h1>অ্যাডমিন</h1>
          <p>{me ? "এই অ্যাকাউন্টে অ্যাডমিন ডেস্কের অনুমতি নেই।" : "এই ডেস্ক শুধু স্টাফ অ্যাকাউন্টে খোলে।"}</p>
          {!me ? <button className="btn btn-primary" type="button" onClick={() => dispatch(setAuth(true))}>লগইন</button> : null}
        </section>
      </div>
    );
  }

  return <AdminPanel />;
}
