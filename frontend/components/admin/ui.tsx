"use client";

import "./admin-ui.css";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { bn } from "@/lib/format";
import { statusLabel, statusTone } from "@/lib/admin/status";

/* ───────── formatting ───────── */

/** ৳১২,৩৪০ */
export function tk(n: number) {
  const v = Math.round(n || 0);
  return `${v < 0 ? "−" : ""}৳${bn(Math.abs(v).toLocaleString("en-IN"))}`;
}
/** ১২,৩৪০ */
export function num(n: number) {
  return bn(Math.round(n || 0).toLocaleString("en-IN"));
}
/** ১২.৪k style for big axis numbers */
export function short(n: number) {
  const a = Math.abs(n);
  if (a >= 100000) return `${bn((n / 100000).toFixed(a >= 1000000 ? 0 : 1))} লাখ`;
  if (a >= 1000) return `${bn((n / 1000).toFixed(a >= 10000 ? 0 : 1))}k`;
  return bn(Math.round(n));
}
export function when(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("bn-BD", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
export function dateOnly(ts: number) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" });
}
export function ago(ts: number) {
  if (!ts) return "—";
  const d = Math.max(0, Date.now() - ts);
  const m = Math.floor(d / 60000);
  if (m < 1) return "এইমাত্র";
  if (m < 60) return `${bn(m)} মিনিট আগে`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${bn(h)} ঘণ্টা আগে`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${bn(days)} দিন আগে`;
  return `${bn(Math.floor(days / 30))} মাস আগে`;
}

/** Download rows as a UTF-8 CSV that opens correctly in Excel. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ───────── icons (1.8 stroke, 24 box) ───────── */

const P = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const Ico = {
  dashboard: <svg {...P}><rect x="3.5" y="3.5" width="7" height="8" rx="1.8" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.8" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.8" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.8" /></svg>,
  orders: <svg {...P}><path d="M6.5 7h11l1 12.5h-13z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>,
  customers: <svg {...P}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.9-3 3-4.8 5.5-4.8s4.6 1.8 5.5 4.8" /><path d="M16 5.5a3 3 0 0 1 0 6M17.5 14.9c1.6.6 2.6 2.1 3 4.6" /></svg>,
  chat: <svg {...P}><path d="M20 12a7.5 7.5 0 0 1-7.5 7.5H7l-3.5 2.5V12A7.5 7.5 0 1 1 20 12z" /><path d="M8.5 11h7M8.5 14h4" /></svg>,
  products: <svg {...P}><path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5H8.5A2.5 2.5 0 0 0 6 22z" /><path d="M6 4.5v17.5" /></svg>,
  packs: <svg {...P}><path d="M4 8l8-4 8 4-8 4z" /><path d="M4 8v8l8 4 8-4V8M12 12v8" /></svg>,
  cats: <svg {...P}><path d="M4 7h6l2 2h8v9.5H4z" /></svg>,
  finance: <svg {...P}><path d="M4 19.5V5M4 19.5h16" /><path d="M8 15.5l3.5-4 3 2.5 5-6" /></svg>,
  activity: <svg {...P}><path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" /></svg>,
  settings: <svg {...P}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>,
  search: <svg {...P}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>,
  bell: <svg {...P}><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>,
  plus: <svg {...P}><path d="M12 5v14M5 12h14" /></svg>,
  close: <svg {...P}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  chevR: <svg {...P}><path d="m9 6 6 6-6 6" /></svg>,
  chevD: <svg {...P}><path d="m6 9 6 6 6-6" /></svg>,
  up: <svg {...P}><path d="M7 14l5-5 5 5" /></svg>,
  down: <svg {...P}><path d="M7 10l5 5 5-5" /></svg>,
  download: <svg {...P}><path d="M12 4v11M7 10l5 5 5-5M5 19.5h14" /></svg>,
  print: <svg {...P}><path d="M7 8V4h10v4M7 17H5a1.5 1.5 0 0 1-1.5-1.5V10A1.5 1.5 0 0 1 5 8.5h14a1.5 1.5 0 0 1 1.5 1.5v5.5A1.5 1.5 0 0 1 19 17h-2" /><path d="M7 14h10v6H7z" /></svg>,
  phone: <svg {...P}><path d="M7.2 3.8h2.6l1.2 3-1.7 1.2a12 12 0 0 0 5.7 5.7l1.2-1.7 3 1.2v2.6c0 .8-.7 1.5-1.5 1.5C9.8 17.3 6.7 8.2 6.7 5.3c0-.8.7-1.5 1.5-1.5z" /></svg>,
  mail: <svg {...P}><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></svg>,
  whatsapp: <svg {...P}><path d="M4 20l1.2-3.6A8 8 0 1 1 8 19z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z" /></svg>,
  copy: <svg {...P}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>,
  truck: <svg {...P}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></svg>,
  note: <svg {...P}><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v4h4M8.5 12.5h7M8.5 16h5" /></svg>,
  tag: <svg {...P}><path d="M3.5 12.2V4.5h7.7l9.3 9.3-7.7 7.7z" /><circle cx="8" cy="9" r="1.3" /></svg>,
  alert: <svg {...P}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2h.01" /></svg>,
  check: <svg {...P}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  box: <svg {...P}><path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" /></svg>,
  cash: <svg {...P}><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></svg>,
  store: <svg {...P}><path d="M4 9.5 5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5.5 12v8h13v-8" /></svg>,
  logout: <svg {...P}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" /></svg>,
  filter: <svg {...P}><path d="M4 5.5h16l-6 7.5v5l-4 1.5v-6.5z" /></svg>,
  grid: <svg {...P}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>,
  list: <svg {...P}><path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" /></svg>,
  board: <svg {...P}><rect x="3.5" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="11" rx="1.5" /><rect x="16.5" y="4" width="4" height="7" rx="1.5" /></svg>,
  star: <svg {...P}><path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z" /></svg>,
  clock: <svg {...P}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
  trend: <svg {...P}><path d="M3.5 17 9 11.5l3.5 3.5 8-8" /><path d="M15 7h5.5v5.5" /></svg>,
  user: <svg {...P}><circle cx="12" cy="8" r="3.4" /><path d="M5 20c1.2-3.4 3.8-5.2 7-5.2s5.8 1.8 7 5.2" /></svg>,
  edit: <svg {...P}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></svg>,
  trash: <svg {...P}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg>,
  eye: <svg {...P}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>,
  lock: <svg {...P}><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  spark: <svg {...P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></svg>,
};

/* ───────── layout ───────── */

export function PageHead({ title, en, sub, actions, children }: { title: string; en?: string; sub?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="ap-head">
      <div className="ap-head-copy">
        <h1>{title}{en ? <span>{en}</span> : null}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {actions ? <div className="ap-head-acts">{actions}</div> : null}
      {children}
    </header>
  );
}

export function Card({ title, en, sub, actions, children, className = "", pad = true, id }: {
  title?: ReactNode; en?: string; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; pad?: boolean; id?: string;
}) {
  return (
    <section className={`ap-card${pad ? "" : " flush"} ${className}`} id={id}>
      {title || actions ? (
        <header className="ap-card-head">
          <div>
            {title ? <h3>{title}{en ? <span>{en}</span> : null}</h3> : null}
            {sub ? <p>{sub}</p> : null}
          </div>
          {actions ? <div className="ap-card-acts">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export type Tone = "wine" | "gold" | "sage" | "green" | "red" | "ink" | "blue";

export function Stat({ label, en, value, delta, deltaGood = "up", hint, spark, tone = "wine", icon, onClick }: {
  label: string; en?: string; value: ReactNode; delta?: number | null; deltaGood?: "up" | "down"; hint?: ReactNode;
  spark?: number[]; tone?: Tone; icon?: ReactNode; onClick?: () => void;
}) {
  const good = delta == null || delta === 0 ? null : (delta > 0) === (deltaGood === "up");
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`ap-stat t-${tone}${onClick ? " click" : ""}`} onClick={onClick} type={onClick ? "button" : undefined}>
      <div className="ap-stat-top">
        {icon ? <span className="ap-stat-ico">{icon}</span> : null}
        <span className="ap-stat-label">{label}{en ? <em>{en}</em> : null}</span>
      </div>
      <b className="ap-stat-val">{value}</b>
      <div className="ap-stat-foot">
        {delta != null ? (
          <span className={`ap-delta${good == null ? "" : good ? " good" : " bad"}`}>
            {delta > 0 ? Ico.up : delta < 0 ? Ico.down : null}{bn(Math.abs(delta))}%
          </span>
        ) : null}
        {hint ? <small>{hint}</small> : null}
      </div>
      {spark && spark.length > 1 ? <Spark data={spark} tone={tone} /> : null}
    </Tag>
  );
}

export function Badge({ tone = "ink", dot, children, title }: { tone?: Tone | "hold" | "live" | "ship" | "done" | "bad"; dot?: boolean; children: ReactNode; title?: string }) {
  return <span className={`ap-badge b-${tone}${dot ? " dot" : ""}`} title={title}>{children}</span>;
}

export function StatusPill({ status }: { status: string }) {
  return <Badge tone={statusTone(status)} dot>{statusLabel(status)}</Badge>;
}

export function Avatar({ name, size = 36, tone }: { name: string; size?: number; tone?: number }) {
  const t = tone ?? [...(name || "?")].reduce((s, c) => s + c.charCodeAt(0), 0) % 5;
  return <span className={`ap-av av-${t}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>{(name || "?").trim().slice(0, 1)}</span>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ap-kbd">{children}</kbd>;
}

export function Empty({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ap-empty">
      <span className="ap-empty-ico">{icon ?? Ico.box}</span>
      <b>{title}</b>
      {sub ? <p>{sub}</p> : null}
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = "md" }: {
  value: T; onChange: (v: T) => void; options: { id: T; label: ReactNode; count?: number; icon?: ReactNode }[]; size?: "sm" | "md";
}) {
  return (
    <div className={`ap-seg ${size}`} role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.icon}{o.label}{o.count != null ? <em>{bn(o.count)}</em> : null}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <label className="ap-search">
      {Ico.search}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "খুঁজুন · Search"} autoFocus={autoFocus} />
      {value ? <button type="button" aria-label="মুছুন" onClick={() => onChange("")}>{Ico.close}</button> : null}
    </label>
  );
}

export function Toggle({ checked, onChange, label, sub, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; sub?: ReactNode; disabled?: boolean }) {
  return (
    <label className={`ap-toggle${disabled ? " off" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="ap-sw" aria-hidden="true" />
      {label ? <span className="ap-toggle-txt"><b>{label}</b>{sub ? <small>{sub}</small> : null}</span> : null}
    </label>
  );
}

/* ───────── overlays ───────── */

/** Only the top-most open layer reacts to Escape. */
const layers: number[] = [];
let layerSeq = 0;
export function useEscLayer(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = ++layerSeq;
    layers.push(id);
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || layers[layers.length - 1] !== id) return;
      e.stopImmediatePropagation();
      close.current();
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      const i = layers.indexOf(id);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [open]);
}

export function Drawer({ open, onClose, title, sub, head, footer, width = 560, children }: {
  open: boolean; onClose: () => void; title?: ReactNode; sub?: ReactNode; head?: ReactNode; footer?: ReactNode; width?: number; children?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEscLayer(open, onClose);
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("ap-lock");
    return () => document.body.classList.remove("ap-lock");
  }, [open]);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="ap-drawer-wrap" role="dialog" aria-modal="true">
      <button type="button" className="ap-drawer-scrim" aria-label="বন্ধ" onClick={onClose} />
      <aside className="ap-drawer" style={{ width: `min(${width}px, 100vw)` }}>
        <header className="ap-drawer-head">
          {head ?? (
            <div>
              {title ? <h2>{title}</h2> : null}
              {sub ? <p>{sub}</p> : null}
            </div>
          )}
          <button type="button" className="ap-icon-btn" aria-label="বন্ধ" onClick={onClose}>{Ico.close}</button>
        </header>
        <div className="ap-drawer-body">{children}</div>
        {footer ? <footer className="ap-drawer-foot">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, sub, children, footer, width = 480 }: {
  open: boolean; onClose: () => void; title?: ReactNode; sub?: ReactNode; children?: ReactNode; footer?: ReactNode; width?: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEscLayer(open, onClose);
  if (!mounted || !open) return null;
  return createPortal(
    <div className="ap-modal-wrap" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ap-modal" style={{ width: `min(${width}px, calc(100vw - 24px))` }}>
        <header className="ap-modal-head">
          <div>{title ? <h3>{title}</h3> : null}{sub ? <p>{sub}</p> : null}</div>
          <button type="button" className="ap-icon-btn" aria-label="বন্ধ" onClick={onClose}>{Ico.close}</button>
        </header>
        <div className="ap-modal-body">{children}</div>
        {footer ? <footer className="ap-modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Menu({ trigger, children, align = "right", placement = "bottom" }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; placement?: "bottom" | "top" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEscLayer(open, () => setOpen(false));
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  return (
    <div className={`ap-menu${open ? " on" : ""}`} ref={ref}>
      <span onClick={() => setOpen((v) => !v)}>{trigger(open)}</span>
      {open ? <div className={`ap-menu-pop ${align}${placement === "top" ? " top" : ""}`}>{children(() => setOpen(false))}</div> : null}
    </div>
  );
}

/* ───────── charts (plain SVG, no deps) ───────── */

const TONE_HEX: Record<Tone, string> = {
  wine: "#7A2430", gold: "#C4A15A", sage: "#3D5A4C", green: "#146C3A", red: "#B42318", ink: "#5C1B24", blue: "#2F5D8A",
};

export function Spark({ data, tone = "wine", height = 34 }: { data: number[]; tone?: Tone; height?: number }) {
  const id = useId().replace(/:/g, "");
  const max = Math.max(1, ...data);
  const min = Math.min(0, ...data);
  const w = 100;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - ((v - min) / (max - min || 1)) * (height - 4) - 2]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const c = TONE_HEX[tone];
  return (
    <svg className="ap-spark" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id={`sg${id}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".28" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w},${height} L0,${height} Z`} fill={`url(#sg${id})`} />
      <path d={line} fill="none" stroke={c} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaChart({ points, height = 240, series }: {
  points: { label: string }[];
  series: { key: string; name: string; tone: Tone; values: number[]; format?: (n: number) => string; axis?: "left" | "right" }[];
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const [hoverRaw, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = height;
  const pad = { l: 8, r: 8, t: 16, b: 26 };
  const n = points.length;
  const x = (i: number) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r));
  const scaled = series.map((s) => {
    const max = Math.max(1, ...s.values) * 1.15;
    const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
    const pts = s.values.map((v, i) => [x(i), y(v)] as const);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    return { ...s, max, y, pts, line };
  });
  const tickEvery = Math.max(1, Math.ceil(n / 8));
  // points can shrink under a resting cursor (e.g. stepping customers with ←/→)
  const hover = hoverRaw != null && hoverRaw < n ? hoverRaw : null;
  return (
    <div className="ap-area" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="চার্ট">
        <defs>
          {scaled.map((s) => (
            <linearGradient key={s.key} id={`ag${id}${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={TONE_HEX[s.tone]} stopOpacity=".26" />
              <stop offset="1" stopColor={TONE_HEX[s.tone]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={pad.l} x2={W - pad.r} y1={pad.t + (1 - g) * (H - pad.t - pad.b)} y2={pad.t + (1 - g) * (H - pad.t - pad.b)} className="ap-grid" />
        ))}
        {scaled.map((s, si) => (
          <g key={s.key}>
            {si === 0 ? <path d={`${s.line} L${x(n - 1)},${H - pad.b} L${x(0)},${H - pad.b} Z`} fill={`url(#ag${id}${s.key})`} className="ap-area-fill" /> : null}
            <path d={s.line} fill="none" stroke={TONE_HEX[s.tone]} strokeWidth={si === 0 ? 2.4 : 1.8} strokeDasharray={si === 0 ? undefined : "5 5"} vectorEffect="non-scaling-stroke" className="ap-area-line" />
          </g>
        ))}
        {hover != null ? <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="ap-cursor" /> : null}
        {hover != null ? scaled.map((s) => <circle key={s.key} cx={s.pts[hover][0]} cy={s.pts[hover][1]} r="5" fill="#fff" stroke={TONE_HEX[s.tone]} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />) : null}
        {points.map((p, i) => (i % tickEvery === 0 || i === n - 1 ? <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="ap-tick">{p.label}</text> : null))}
        {points.map((_, i) => (
          <rect key={`h${i}`} x={x(i) - (W / Math.max(1, n)) / 2} y={0} width={W / Math.max(1, n)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null ? (
        <div className="ap-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{points[hover].label}</b>
          {scaled.map((s) => (
            <span key={s.key}><i style={{ background: TONE_HEX[s.tone] }} />{s.name}<strong>{s.format ? s.format(s.values[hover]) : num(s.values[hover])}</strong></span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Donut({ data, size = 168, thick = 22, center }: { data: { label: string; value: number; tone: Tone }[]; size?: number; thick?: number; center?: ReactNode }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = (size - thick) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="ap-donut">
      <div className="ap-donut-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ap-line2)" strokeWidth={thick} />
          {total > 0 ? data.map((d, i) => {
            const len = (d.value / total) * c;
            const seg = (
              <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE_HEX[d.tone]} strokeWidth={hover === i ? thick + 6 : thick}
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="ap-donut-seg" style={{ animationDelay: `${i * 90}ms` }} />
            );
            acc += len;
            return seg;
          }) : null}
        </svg>
        <div className="ap-donut-center">
          {hover != null && data[hover] ? <><b>{num(data[hover].value)}</b><small>{data[hover].label}</small></> : center}
        </div>
      </div>
      <ul className="ap-legend">
        {data.map((d, i) => (
          <li key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={hover === i ? "on" : ""}>
            <i style={{ background: TONE_HEX[d.tone] }} />
            <span>{d.label}</span>
            <b>{num(d.value)}</b>
            <small>{total ? bn(Math.round((d.value / total) * 100)) : "০"}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Bars({ rows, format = num, tone = "wine" }: { rows: { label: ReactNode; value: number; sub?: ReactNode; key?: string }[]; format?: (n: number) => string; tone?: Tone }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="ap-bars">
      {rows.map((r, i) => (
        <li key={r.key ?? i}>
          <div className="ap-bars-top"><span>{r.label}</span><b>{format(r.value)}</b></div>
          <div className="ap-bars-track"><i style={{ width: `${(r.value / max) * 100}%`, background: TONE_HEX[tone], animationDelay: `${i * 60}ms` }} /></div>
          {r.sub ? <small>{r.sub}</small> : null}
        </li>
      ))}
    </ul>
  );
}

/** Column mini chart, e.g. orders by hour. */
export function Columns({ values, labels, tone = "wine", height = 90, format = num }: { values: number[]; labels?: string[]; tone?: Tone; height?: number; format?: (n: number) => string }) {
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  return (
    <div className="ap-cols" style={{ height }}>
      {values.map((v, i) => (
        <span key={i} title={`${labels?.[i] ?? ""} · ${format(v)}`} className={i === peak && v > 0 ? "peak" : ""}>
          <i style={{ height: `${Math.max(3, (v / max) * 100)}%`, background: TONE_HEX[tone], animationDelay: `${i * 18}ms` }} />
        </span>
      ))}
    </div>
  );
}

/* ───────── misc ───────── */

export function useSelection<T extends string | number>() {
  const [sel, setSel] = useState<Set<T>>(new Set());
  return useMemo(() => ({
    sel,
    has: (id: T) => sel.has(id),
    toggle: (id: T) => setSel((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
    setAll: (ids: T[], on: boolean) => setSel((cur) => { const next = new Set(cur); ids.forEach((id) => (on ? next.add(id) : next.delete(id))); return next; }),
    clear: () => setSel(new Set()),
    size: sel.size,
  }), [sel]);
}

export function CopyBtn({ text, onCopied }: { text: string; onCopied?: () => void }) {
  return (
    <button type="button" className="ap-icon-btn sm" aria-label="কপি" title="কপি" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(text).catch(() => undefined); onCopied?.(); }}>
      {Ico.copy}
    </button>
  );
}
