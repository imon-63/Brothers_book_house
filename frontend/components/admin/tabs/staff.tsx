"use client";

import { useState } from "react";
import { useMe } from "@/lib/api/auth";
import { ms } from "@/lib/api/admin/core";
import { useCreateStaff, useResetStaffPassword, useSetStaffEnabled, useSetStaffRole, useStaff, type StaffRole } from "@/lib/api/admin/staff";
import { Avatar, Badge, CopyBtn, Empty, Ico, Menu, Modal, Toggle, ago, dateOnly } from "@/components/admin/ui";
import { useConfirm } from "@/components/admin/confirm";
import { bn, localPhone } from "@/lib/format";
import "./staff.css";

const ROLES: { id: StaffRole; bn: string; hint: string }[] = [
  { id: "OWNER", bn: "মালিক", hint: "সব কিছু" },
  { id: "ADMIN", bn: "অ্যাডমিন", hint: "সব, স্টাফ ছাড়া মালিকানা" },
  { id: "MANAGER", bn: "ম্যানেজার", hint: "অর্ডার, পণ্য, সেটিংস" },
  { id: "SUPPORT", bn: "সাপোর্ট", hint: "চ্যাট ও অর্ডার দেখা" },
  { id: "ACCOUNTANT", bn: "হিসাবরক্ষক", hint: "হিসাব ও রিপোর্ট" },
  { id: "WAREHOUSE", bn: "গুদাম", hint: "স্টক ও প্যাকিং" },
];

const DAY = 86400000;

/** Settings › স্টাফ — team screen. */
export function StaffPanel() {
  const { me } = useMe();
  const q = useStaff();
  const createM = useCreateStaff();
  const roleM = useSetStaffRole();
  const enM = useSetStaffEnabled();
  const resetM = useResetStaffPassword();
  const confirm = useConfirm();
  const roleBn = (r: string) => ROLES.find((x) => x.id === r)?.bn ?? r;
  const [form, setForm] = useState({ name: "", email: "", role: "SUPPORT" as StaffRole });
  const [temp, setTemp] = useState<{ name: string; pw: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const rows = q.data ?? [];
  const canEdit = me?.role === "OWNER" || me?.role === "ADMIN";

  const active = rows.filter((u) => u.status === "ACTIVE").length;
  const recent = rows.filter((u) => u.lastLoginAt && Date.now() - ms(u.lastLoginAt) < 7 * DAY).length;
  const byRole = ROLES.map((r) => ({ ...r, n: rows.filter((u) => u.role === r.id).length }));

  async function changeRole(u: (typeof rows)[number], role: StaffRole) {
    const up = role === "OWNER" || role === "ADMIN";
    if (!(await confirm({
      tone: up ? "danger" : "warn", icon: Ico.lock,
      title: `${u.name} এর রোল বদলাবেন?`,
      body: up ? "এই রোলে প্রায় সব কিছু বদলানোর ক্ষমতা থাকবে — স্টাফ, সেটিংস, হিসাব।" : "পরের লগইন থেকেই নতুন অনুমতি কাজ করবে।",
      details: [{ label: "রোল", from: roleBn(u.role), to: roleBn(role) }, { label: "অনুমতি", value: ROLES.find((x) => x.id === role)?.hint ?? "—" }],
      confirmText: "হ্যাঁ, বদলান",
    }))) return;
    roleM.mutate({ id: u.id, role });
  }
  async function setEnabled(u: (typeof rows)[number], v: boolean) {
    if (!v && !(await confirm({
      tone: "danger", icon: Ico.lock,
      title: `${u.name} এর অ্যাকাউন্ট বন্ধ করবেন?`,
      body: "সে আর অ্যাডমিনে ঢুকতে পারবে না। পরে সুইচ চালু করলেই আবার পারবে।",
      details: [{ label: "অ্যাকাউন্ট", from: "চালু", to: "বন্ধ" }, { label: "রোল", value: roleBn(u.role) }],
      confirmText: "হ্যাঁ, বন্ধ করুন",
    }))) return;
    enM.mutate({ id: u.id, enabled: v });
  }
  async function resetPw(u: (typeof rows)[number]) {
    if (!(await confirm({
      tone: "warn", icon: Ico.lock,
      title: `${u.name} এর পাসওয়ার্ড রিসেট করবেন?`,
      body: "পুরনো পাসওয়ার্ড সাথে সাথে বাতিল হবে। একটি অস্থায়ী পাসওয়ার্ড একবারই দেখানো হবে — তাকে পৌঁছে দিন।",
      details: [{ label: "অ্যাকাউন্ট", value: u.email ?? localPhone(u.phone) }],
      confirmText: "হ্যাঁ, রিসেট",
    }))) return;
    resetM.mutate({ id: u.id }, { onSuccess: (d) => setTemp({ name: u.name, pw: d.tempPassword }) });
  }

  return (
    <div className="sf">
      <header className="sf-hero">
        <div className="sf-hero-copy">
          <span className="sf-eyebrow">{Ico.customers} TEAM</span>
          <h2>টিম · স্টাফ অ্যাকাউন্ট</h2>
          <p>কে অ্যাডমিনে ঢুকতে পারবে আর কী করতে পারবে</p>
        </div>
        <div className="sf-hero-side">
          <div className="sf-faces" aria-hidden="true">
            {rows.slice(0, 5).map((u) => <Avatar key={u.id} name={u.name} size={36} />)}
            {rows.length > 5 ? <span className="sf-more">+{bn(rows.length - 5)}</span> : null}
          </div>
          {canEdit ? <button type="button" className="ap-btn gold" onClick={() => setAdding(true)}>{Ico.plus} নতুন স্টাফ</button> : null}
        </div>
      </header>

      <div className="sf-tiles">
        <div className="sf-tile t-wine"><span className="sf-tile-ico">{Ico.customers}</span><small>মোট স্টাফ</small><b>{bn(rows.length)}</b></div>
        <div className="sf-tile t-green"><span className="sf-tile-ico">{Ico.check}</span><small>চালু অ্যাকাউন্ট</small><b>{bn(active)}</b></div>
        <div className="sf-tile t-red"><span className="sf-tile-ico">{Ico.lock}</span><small>বন্ধ</small><b>{bn(rows.length - active)}</b></div>
        <div className="sf-tile t-gold"><span className="sf-tile-ico">{Ico.clock}</span><small>৭ দিনে লগইন</small><b>{bn(recent)}</b></div>
      </div>

      <div className="sf-grid">
        <section className="sf-list" aria-label="স্টাফ তালিকা">
          <div className="sf-sec-h"><h3>সদস্য</h3><span className="sf-count">{bn(rows.length)}জন</span></div>
          {!rows.length ? <div className="sf-empty"><Empty icon={Ico.user} title={q.isLoading ? "লোড হচ্ছে…" : "কোনো স্টাফ নেই"} /></div> : (
            <ol className="sf-people">
              {rows.map((u, i) => {
                const self = u.id === me?.id;
                const on = u.status === "ACTIVE";
                return (
                  <li key={u.id} className={`sf-person r-${u.role.toLowerCase()}${on ? "" : " off"}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <div className="sf-who">
                      <span className="sf-av"><Avatar name={u.name} size={46} /><i className={on ? "on" : ""} title={on ? "চালু" : "বন্ধ"} /></span>
                      <div className="sf-id">
                        <b>{u.name}{self ? <Badge tone="sage">আপনি</Badge> : null}</b>
                        <small>{u.email ?? localPhone(u.phone)}</small>
                      </div>
                      <span className="sf-role-pill">{roleBn(u.role)}</span>
                    </div>
                    <div className="sf-meta">
                      <span>{Ico.clock}শেষ লগইন <b>{u.lastLoginAt ? ago(ms(u.lastLoginAt)) : "—"}</b></span>
                      <span>{Ico.user}যোগ <b>{dateOnly(ms(u.createdAt))}</b></span>
                    </div>
                    <div className="sf-ctrl">
                      <label className="sf-select">
                        <span className="sr">রোল</span>
                        <select value={u.role} disabled={!canEdit || self} onChange={(e) => void changeRole(u, e.target.value as StaffRole)}>
                          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.bn}</option>)}
                        </select>
                        {Ico.chevD}
                      </label>
                      <span className="sf-tog">
                        <Toggle checked={on} disabled={!canEdit || self} onChange={(v) => void setEnabled(u, v)} />
                        <em>{on ? "চালু" : "বন্ধ"}</em>
                      </span>
                      {canEdit && !self ? (
                        <Menu align="right" trigger={() => <button type="button" className="ap-icon-btn sm sf-dots" aria-label="আরও">{DotIco}</button>}>
                          {(close) => (
                            <>
                              <div className="ap-menu-label">{u.name}</div>
                              <button type="button" className="ap-menu-item" onClick={() => { close(); void resetPw(u); }}>{Ico.lock}পাসওয়ার্ড রিসেট</button>
                            </>
                          )}
                        </Menu>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="sf-legend" aria-label="রোল ও অনুমতি">
          <div className="sf-sec-h"><h3>রোল ও অনুমতি</h3></div>
          <ul>
            {byRole.map((r) => (
              <li key={r.id} className={`r-${r.id.toLowerCase()}`}>
                <span className="sf-role-dot" />
                <div><b>{r.bn}</b><small>{r.hint}</small></div>
                <em>{bn(r.n)}</em>
              </li>
            ))}
          </ul>
          {rows.length ? (
            <div className="sf-dist" aria-hidden="true">
              {byRole.filter((r) => r.n).map((r) => <i key={r.id} className={`r-${r.id.toLowerCase()}`} style={{ flexGrow: r.n }} />)}
            </div>
          ) : null}
          <p className="sf-note">{Ico.lock} রোল বদলালে পরের লগইন থেকে নতুন অনুমতি কাজ করে।</p>
        </aside>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="নতুন স্টাফ যোগ করুন" sub="অস্থায়ী পাসওয়ার্ড তৈরি হবে — একবারই দেখানো হবে" width={520}
        footer={<>
          <button type="button" className="ap-btn ghost" onClick={() => setAdding(false)}>বাতিল</button>
          <button type="submit" form="sf-add" className="ap-btn primary" disabled={createM.isPending || !form.name.trim() || !form.email.trim()}>{createM.isPending ? "যোগ হচ্ছে…" : "যোগ করুন"}</button>
        </>}>
        <form id="sf-add" className="sf-form" onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim() || !form.email.trim()) return;
          createM.mutate({ name: form.name.trim(), email: form.email.trim(), role: form.role }, {
            onSuccess: (d) => { if (d?.tempPassword) setTemp({ name: form.name.trim(), pw: d.tempPassword }); setForm({ name: "", email: "", role: form.role }); setAdding(false); },
          });
        }}>
          <div className="sf-form-row">
            <label>নাম<input value={form.name} placeholder="যেমন: রাহিম উদ্দিন" autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label>ইমেইল<input value={form.email} type="email" placeholder="name@cholo.shop" onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          </div>
          <span className="sf-form-lbl">রোল বাছুন</span>
          <div className="sf-roles" role="radiogroup" aria-label="রোল">
            {ROLES.filter((r) => r.id !== "OWNER").map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={form.role === r.id} className={`r-${r.id.toLowerCase()}${form.role === r.id ? " on" : ""}`} onClick={() => setForm({ ...form, role: r.id })}>
                <span className="sf-role-dot" />
                <b>{r.bn}</b>
                <small>{r.hint}</small>
                <i aria-hidden="true">{Ico.check}</i>
              </button>
            ))}
          </div>
        </form>
      </Modal>

      <Modal open={!!temp} onClose={() => setTemp(null)} title="অস্থায়ী পাসওয়ার্ড" sub={temp ? `${temp.name} · একবারই দেখানো হচ্ছে` : undefined} width={420}
        footer={<button type="button" className="ap-btn primary" onClick={() => setTemp(null)}>ঠিক আছে</button>}>
        {temp ? (
          <div className="sf-temp">
            <span className="sf-temp-ico">{Ico.lock}</span>
            <div className="sf-temp-code"><code>{temp.pw}</code><CopyBtn text={temp.pw} /></div>
            <p>কপি করে নিরাপদে পৌঁছে দিন। প্রথম লগইনের পর পাসওয়ার্ড বদলে নিতে বলুন।</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

const DotIco = <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="18.5" cy="12" r="1.7" /></svg>;
