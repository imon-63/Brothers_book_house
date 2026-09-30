"use client";

import { useState } from "react";
import { useMe } from "@/lib/api/auth";
import { ms } from "@/lib/api/admin/core";
import { useCreateStaff, useResetStaffPassword, useSetStaffEnabled, useSetStaffRole, useStaff, type StaffRole } from "@/lib/api/admin/staff";
import { Avatar, Badge, CopyBtn, Empty, Ico, Modal, Toggle, ago } from "@/components/admin/ui";

const ROLES: { id: StaffRole; bn: string; hint: string }[] = [
  { id: "OWNER", bn: "মালিক", hint: "সব কিছু" },
  { id: "ADMIN", bn: "অ্যাডমিন", hint: "সব, স্টাফ ছাড়া মালিকানা" },
  { id: "MANAGER", bn: "ম্যানেজার", hint: "অর্ডার, পণ্য, সেটিংস" },
  { id: "SUPPORT", bn: "সাপোর্ট", hint: "চ্যাট ও অর্ডার দেখা" },
  { id: "ACCOUNTANT", bn: "হিসাবরক্ষক", hint: "হিসাব ও রিপোর্ট" },
  { id: "WAREHOUSE", bn: "গুদাম", hint: "স্টক ও প্যাকিং" },
];

/** Settings › স্টাফ — small team screen. */
export function StaffPanel() {
  const { me } = useMe();
  const q = useStaff();
  const createM = useCreateStaff();
  const roleM = useSetStaffRole();
  const enM = useSetStaffEnabled();
  const resetM = useResetStaffPassword();
  const [form, setForm] = useState({ name: "", email: "", role: "SUPPORT" as StaffRole });
  const [temp, setTemp] = useState<{ name: string; pw: string } | null>(null);
  const rows = q.data ?? [];
  const canEdit = me?.role === "OWNER" || me?.role === "ADMIN";

  return (
    <section className="cfg-card">
      <header className="cfg-head">
        <div><h3>টিম · স্টাফ অ্যাকাউন্ট</h3><p>কে অ্যাডমিনে ঢুকতে পারবে আর কী করতে পারবে</p></div>
        <span className="pk-count">{rows.length}জন</span>
      </header>
      {canEdit ? (
        <form className="cfg-add" onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim() || !form.email.trim()) return;
          createM.mutate({ name: form.name.trim(), email: form.email.trim(), role: form.role }, {
            onSuccess: (d) => { if (d?.tempPassword) setTemp({ name: form.name.trim(), pw: d.tempPassword }); setForm({ name: "", email: "", role: form.role }); },
          });
        }}>
          <input value={form.name} placeholder="নাম" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input value={form.email} type="email" placeholder="ইমেইল" onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}>
            {ROLES.filter((r) => r.id !== "OWNER").map((r) => <option key={r.id} value={r.id}>{r.bn}</option>)}
          </select>
          <button className="btn btn-primary btn-sm" type="submit" disabled={createM.isPending}>যোগ করুন</button>
        </form>
      ) : null}
      {!rows.length ? <Empty icon={Ico.user} title={q.isLoading ? "লোড হচ্ছে…" : "কোনো স্টাফ নেই"} /> : (
        <ol className="cfg-lines">
          {rows.map((u) => {
            const self = u.id === me?.id;
            return (
              <li key={u.id} style={{ alignItems: "center", gap: 10 }}>
                <Avatar name={u.name} size={32} />
                <span style={{ flex: 1, minWidth: 0, display: "grid" }}>
                  <b>{u.name}{self ? <Badge tone="sage">আপনি</Badge> : null}</b>
                  <small style={{ color: "var(--ap-muted, #8a7a70)" }}>{u.email ?? u.phone ?? ""} · শেষ লগইন {u.lastLoginAt ? ago(ms(u.lastLoginAt)) : "—"}</small>
                </span>
                <select value={u.role} disabled={!canEdit || self} onChange={(e) => roleM.mutate({ id: u.id, role: e.target.value as StaffRole })}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.bn}</option>)}
                </select>
                <Toggle checked={u.status === "ACTIVE"} disabled={!canEdit || self} onChange={(v) => enM.mutate({ id: u.id, enabled: v })} />
                {canEdit && !self ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => resetM.mutate({ id: u.id }, { onSuccess: (d) => setTemp({ name: u.name, pw: d.tempPassword }) })}>পাসওয়ার্ড রিসেট</button>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
      <Modal open={!!temp} onClose={() => setTemp(null)} title="অস্থায়ী পাসওয়ার্ড" sub={temp ? `${temp.name} · একবারই দেখানো হচ্ছে` : undefined} width={420}
        footer={<button type="button" className="ap-btn primary" onClick={() => setTemp(null)}>ঠিক আছে</button>}>
        {temp ? <p style={{ display: "flex", alignItems: "center", gap: 8 }}><code style={{ fontSize: 18 }}>{temp.pw}</code><CopyBtn text={temp.pw} /></p> : null}
      </Modal>
    </section>
  );
}
