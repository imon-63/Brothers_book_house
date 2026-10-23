"use client";

/**
 * অ্যাক্সেস — every account (staff + customers): who can sign in. Block / unblock
 * revokes all sessions at once (the API re-checks sessions every few seconds).
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get, patch } from "@/lib/api/client";
import { adminKeys, useAdminMutation } from "@/lib/api/admin/core";
import { bn, localPhone } from "@/lib/format";
import { useMe } from "@/lib/api/auth";
import { useConfirmInput } from "@/components/admin/confirm";
import { Avatar, Empty, Ico, SearchInput } from "@/components/admin/ui";

type Role = "OWNER" | "ADMIN" | "MANAGER" | "SUPPORT" | "ACCOUNTANT" | "WAREHOUSE" | "CUSTOMER";
type AccessUser = {
  id: string; name: string; email: string | null; phone: string | null; role: Role; status: "ACTIVE" | "SUSPENDED" | "DISABLED";
  mustChangePassword: boolean; lastLoginAt: string | null; createdAt: string; activeSessions: number;
  customer: { id: string; isBlocked: boolean; ordersCount: number } | null;
};
type UsersPage = { items: AccessUser[]; total: number; page: number; pageSize: number; counts: Partial<Record<Role | "blocked", number>> };

const ROLES: { id: Role; bn: string; tone: string }[] = [
  { id: "OWNER", bn: "মালিক", tone: "var(--k-7a2430)" },
  { id: "ADMIN", bn: "অ্যাডমিন", tone: "#6B3F7A" },
  { id: "MANAGER", bn: "ম্যানেজার", tone: "#2F5D8A" },
  { id: "SUPPORT", bn: "সাপোর্ট", tone: "#146C3A" },
  { id: "ACCOUNTANT", bn: "হিসাবরক্ষক", tone: "#8A6230" },
  { id: "WAREHOUSE", bn: "গুদাম", tone: "#3D5A4C" },
  { id: "CUSTOMER", bn: "কাস্টমার", tone: "var(--k-5e4e43)" },
];
const roleOf = (r: Role) => ROLES.find((x) => x.id === r) ?? ROLES[6];

function ago(iso: string | null) {
  if (!iso) return "কখনো না";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "এইমাত্র";
  if (m < 60) return `${bn(m)} মিনিট আগে`;
  const h = Math.round(m / 60);
  if (h < 24) return `${bn(h)} ঘণ্টা আগে`;
  return `${bn(Math.round(h / 24))} দিন আগে`;
}

export function AccessPanel() {
  const { me } = useMe();
  const ask = useConfirmInput();
  const [role, setRole] = useState<Role | "all">("all");
  const [status, setStatus] = useState<"all" | "ACTIVE" | "BLOCKED">("all");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => setPage(1), [role, status, term]);

  const query = { role: role === "all" ? undefined : role, status: status === "all" ? undefined : status, q: term || undefined, page, pageSize: 20 };
  const listQ = useQuery({ queryKey: [...adminKeys.staff, "users", query], placeholderData: (p) => p, queryFn: () => get<UsersPage>("/admin/users", query) });
  const accessM = useAdminMutation<{ id: string; blocked: boolean; reason?: string; name: string }, unknown>({
    fn: ({ id, blocked, reason }) => patch(`/admin/users/${id}/access`, { blocked, reason }),
    invalidate: [adminKeys.staff],
    success: (_r, v) => (v.blocked ? `${v.name} — লগইন ব্লক করা হয়েছে` : `${v.name} — লগইন চালু হয়েছে`),
  });

  const d = listQ.data;
  const counts = d?.counts ?? {};
  const total = Object.entries(counts).filter(([k]) => k !== "blocked").reduce((n, [, v]) => n + (v ?? 0), 0);
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  async function toggle(u: AccessUser) {
    const blocking = u.status === "ACTIVE";
    if (blocking) {
      const reason = await ask({
        title: `${u.name}-এর লগইন ব্লক করবেন?`,
        body: "সব ডিভাইস থেকে সাথে সাথে লগআউট হবে, আর আবার চালু না করা পর্যন্ত লগইন করতে পারবে না।",
        tone: "danger",
        confirmText: "হ্যাঁ, ব্লক করুন",
        details: [
          { label: "রোল", value: roleOf(u.role).bn },
          { label: "চালু সেশন", value: `${bn(u.activeSessions)}টি` },
          ...(u.customer ? [{ label: "অর্ডার", value: `${bn(u.customer.ordersCount)}টি` }] : []),
        ],
        input: { label: "কারণ", chips: ["সন্দেহজনক কার্যক্রম", "চাকরি ছেড়েছে", "ভুয়া অর্ডার", "অনুরোধে বন্ধ"], minLength: 3 },
      });
      if (reason == null) return;
      accessM.mutate({ id: u.id, blocked: true, reason, name: u.name });
    } else {
      accessM.mutate({ id: u.id, blocked: false, name: u.name });
    }
  }

  return (
    <div className="ax">
      <header className="ax-hero">
        <div>
          <span className="ax-eyebrow">ACCESS CONTROL</span>
          <h2>অ্যাক্সেস · কে লগইন করতে পারবে</h2>
          <p>যেকোনো রোলের অ্যাকাউন্ট এক চাপে ব্লক করুন — সাথে সাথে সব ডিভাইস থেকে বের হয়ে যাবে।</p>
        </div>
        <div className="ax-hero-stats">
          <div><b>{bn(total)}</b><small>মোট অ্যাকাউন্ট</small></div>
          <div className="bad"><b>{bn(counts.blocked ?? 0)}</b><small>ব্লক করা</small></div>
        </div>
      </header>

      <div className="ax-roles" role="tablist" aria-label="রোল">
        <button type="button" className={role === "all" ? "on" : ""} onClick={() => setRole("all")}>সব<em>{bn(total)}</em></button>
        {ROLES.map((r) => (
          <button key={r.id} type="button" className={role === r.id ? "on" : ""} style={{ ["--rt" as string]: r.tone }} onClick={() => setRole(r.id)}>
            <i />{r.bn}<em>{bn(counts[r.id] ?? 0)}</em>
          </button>
        ))}
      </div>

      <div className="ax-tools">
        <SearchInput value={q} onChange={setQ} placeholder="নাম, ইমেইল বা ফোন" />
        <div className="ax-seg">
          {([["all", "সব"], ["ACTIVE", "চালু"], ["BLOCKED", "ব্লক"]] as const).map(([id, l]) => (
            <button key={id} type="button" className={status === id ? "on" : ""} onClick={() => setStatus(id)}>{l}</button>
          ))}
        </div>
      </div>

      {listQ.isLoading ? <div className="ax-skel" /> : !d?.items.length ? (
        <Empty icon={Ico.lock} title="কোনো অ্যাকাউন্ট পাওয়া যায়নি" sub="ফিল্টার বদলে দেখুন" />
      ) : (
        <ul className="ax-list">
          {d.items.map((u) => {
            const r = roleOf(u.role);
            const blocked = u.status !== "ACTIVE";
            const self = u.id === me?.id;
            return (
              <li key={u.id} className={`ax-row${blocked ? " blocked" : ""}`} style={{ ["--rt" as string]: r.tone }}>
                <Avatar name={u.name} size={40} />
                <div className="ax-who">
                  <b>{u.name}{self ? <em className="ax-you">আপনি</em> : null}</b>
                  <small>{u.email || localPhone(u.phone) || "—"}</small>
                </div>
                <span className="ax-role"><i />{r.bn}</span>
                <div className="ax-meta">
                  <span>শেষ লগইন <b>{ago(u.lastLoginAt)}</b></span>
                  <span>{u.activeSessions ? <><i className="live" />{bn(u.activeSessions)}টি সেশন চালু</> : "কোনো সেশন নেই"}</span>
                  {u.mustChangePassword ? <span className="warn">পাসওয়ার্ড বদলানো বাকি</span> : null}
                  {u.customer?.isBlocked ? <span className="warn">COD বন্ধ</span> : null}
                </div>
                <span className={`ax-status${blocked ? " off" : ""}`}>{blocked ? "ব্লক" : "চালু"}</span>
                <button type="button" className={`ap-btn sm ${blocked ? "" : "danger"}`} disabled={self || accessM.isPending} onClick={() => void toggle(u)}
                  title={self ? "নিজেকে ব্লক করা যাবে না" : undefined}>
                  {blocked ? <>{Ico.check}চালু করুন</> : <>{Ico.lock}ব্লক করুন</>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {d && pages > 1 ? (
        <div className="ax-pager">
          <button type="button" className="ap-btn sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>‹ আগের</button>
          <span>{bn(page)} / {bn(pages)}</span>
          <button type="button" className="ap-btn sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>পরের ›</button>
        </div>
      ) : null}
    </div>
  );
}
