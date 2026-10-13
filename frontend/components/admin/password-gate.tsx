"use client";

/** First sign-in with a temporary password: set your own before anything else. */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorText, post, refreshSession } from "@/lib/api/client";
import { logout, meKey } from "@/lib/api/auth";

export function PasswordGate({ name }: { name: string }) {
  const qc = useQueryClient();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const checks = [
    { ok: next.length >= 6, t: "কমপক্ষে ৬ অক্ষর" },
    { ok: !!next && next !== cur, t: "অস্থায়ী পাসওয়ার্ড থেকে আলাদা" },
    { ok: !!next && next === again, t: "দুইবার একই লেখা" },
  ];
  const ready = cur.length > 0 && checks.every((c) => c.ok);
  const strength = Math.min(4, (next.length >= 6 ? 1 : 0) + (/[A-Z]/.test(next) ? 1 : 0) + (/\d/.test(next) ? 1 : 0) + (/[^A-Za-z0-9]/.test(next) || next.length >= 12 ? 1 : 0));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setErr("");
    try {
      await post("/auth/password/change", { currentPassword: cur, newPassword: next });
      await refreshSession(); // new token without the "must change" flag
      await qc.invalidateQueries({ queryKey: meKey });
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm pw-gate">
      <form className="pw-card" onSubmit={(e) => void submit(e)}>
        <span className="pw-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.4" /></svg>
        </span>
        <small className="pw-eyebrow">FIRST SIGN-IN · প্রথম লগইন</small>
        <h2>স্বাগতম, {name.split(" ")[0]}!</h2>
        <p className="pw-lead">আপনি অ্যাডমিনের দেওয়া অস্থায়ী পাসওয়ার্ড দিয়ে ঢুকেছেন। এখন নিজের মতো একটা পাসওয়ার্ড সেট করে নিন (অন্তত ৬ অক্ষর) — তারপরই ড্যাশবোর্ড খুলবে।</p>

        <label><span>অস্থায়ী পাসওয়ার্ড</span><input type={show ? "text" : "password"} value={cur} autoComplete="current-password" onChange={(e) => setCur(e.target.value)} autoFocus /></label>
        <label><span>নতুন পাসওয়ার্ড</span><input type={show ? "text" : "password"} value={next} autoComplete="new-password" onChange={(e) => setNext(e.target.value)} /></label>
        <div className={`pw-meter s${strength}`} aria-hidden="true"><i /><i /><i /><i /></div>
        <label><span>আবার লিখুন</span><input type={show ? "text" : "password"} value={again} autoComplete="new-password" onChange={(e) => setAgain(e.target.value)} /></label>
        <label className="pw-show"><input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> পাসওয়ার্ড দেখান</label>

        <ul className="pw-checks">
          {checks.map((c) => <li key={c.t} className={c.ok ? "ok" : ""}><i aria-hidden="true">{c.ok ? "✓" : "•"}</i>{c.t}</li>)}
        </ul>
        {err ? <p className="pw-err" role="alert">{err}</p> : null}

        <button type="submit" className="pw-go" disabled={!ready || busy}>{busy ? "সেভ হচ্ছে…" : "পাসওয়ার্ড সেট করে ঢুকুন"}</button>
        <button type="button" className="pw-out" onClick={() => void logout().then(() => location.assign("/"))}>পরে করব · লগআউট</button>
      </form>
    </div>
  );
}
