"use client";

import { useMemo, useState, type ReactNode } from "react";
import { BN_DAYS, BN_MON, fmtIsoBn, fmtShipDt, hourName, isoOf, joinDt, pad2, parseDt } from "@/lib/calendar";
import { bn } from "@/lib/format";

function monthCells(y: number, m: number) {
  const start = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();
  const cells: { n: number; iso: string; in: boolean }[] = [];
  for (let i = 0; i < start; i++) {
    const d = prevDim - start + 1 + i;
    cells.push({ n: d, iso: isoOf(new Date(y, m - 1, d)), in: false });
  }
  for (let d = 1; d <= dim; d++) cells.push({ n: d, iso: isoOf(new Date(y, m, d)), in: true });
  const extra = (7 - (cells.length % 7)) % 7;
  for (let d = 1; d <= extra; d++) cells.push({ n: d, iso: isoOf(new Date(y, m + 1, d)), in: false });
  return cells;
}

function CalSheet({
  month, setMonth, marked, dayCls, onDay, foot,
}: {
  month: { y: number; m: number };
  setMonth: (next: { y: number; m: number }) => void;
  marked?: Set<string>;
  dayCls: (iso: string, inMonth: boolean) => string;
  onDay: (iso: string) => void;
  foot: ReactNode;
}) {
  const today = isoOf(new Date());
  const nowY = new Date().getFullYear();
  const yFrom = Math.min(month.y, nowY - 8);
  const yTo = Math.max(month.y, nowY + 10);
  const cells = monthCells(month.y, month.m);

  function shift(dir: number) {
    let m = month.m + dir;
    let y = month.y;
    if (m > 11) { m = 0; y += 1; }
    if (m < 0) { m = 11; y -= 1; }
    setMonth({ y, m });
  }

  return (
    <>
      <div className="cal-head">
        <button type="button" className="cal-nav" aria-label="আগের বছর" onClick={() => setMonth({ y: month.y - 1, m: month.m })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 6 5 12l6 6M18 6l-6 6 6 6" /></svg>
        </button>
        <button type="button" className="cal-nav" aria-label="আগের মাস" onClick={() => shift(-1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div className="cal-picks">
          <select className="cal-pick" aria-label="মাস" value={month.m} onChange={(e) => setMonth({ y: month.y, m: Number(e.target.value) })}>
            {BN_MON.map((name, i) => <option key={name} value={i}>{name}</option>)}
          </select>
          <select className="cal-pick" aria-label="বছর" value={month.y} onChange={(e) => setMonth({ y: Number(e.target.value), m: month.m })}>
            {Array.from({ length: yTo - yFrom + 1 }, (_, i) => yFrom + i).map((yy) => <option key={yy} value={yy}>{bn(yy)}</option>)}
          </select>
        </div>
        <button type="button" className="cal-nav" aria-label="পরের মাস" onClick={() => shift(1)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 5l7 7-7 7" /></svg>
        </button>
        <button type="button" className="cal-nav" aria-label="পরের বছর" onClick={() => setMonth({ y: month.y + 1, m: month.m })}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l6 6-6 6M13 6l6 6-6 6" /></svg>
        </button>
      </div>
      <div className="cal-week">{BN_DAYS.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="cal-grid">
        {cells.map((c) => {
          let cls = dayCls(c.iso, c.in);
          if (c.iso === today) cls += " today";
          if (marked?.has(c.iso)) cls += " has";
          return <button type="button" className={cls} key={`${c.iso}-${c.in ? "in" : "out"}-${c.n}`} onClick={() => onDay(c.iso)}>{bn(c.n)}</button>;
        })}
      </div>
      {foot}
    </>
  );
}

function Pop({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cal-pop" role="dialog" aria-label="তারিখ বাছুন">
        <button className="x" type="button" onClick={onClose} aria-label="বন্ধ">×</button>
        {children}
      </div>
    </div>
  );
}

function openMonth(iso: string) {
  const p = parseDt(iso) || { day: isoOf(new Date()), h: 0, min: 0 };
  const [y, m] = p.day.split("-").map(Number);
  return { y, m: m - 1 };
}

export function BnDateField({
  label, value, onChange, withTime, end, emptyText, marked, compact,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  end?: boolean;
  emptyText?: string;
  marked?: string[];
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => openMonth(value));
  const [pick, setPick] = useState({ day: "", h: end ? 23 : 0, min: end ? 59 : 0 });
  const marks = useMemo(() => new Set(marked || []), [marked]);
  const shown = withTime ? fmtShipDt(value) : fmtIsoBn(value);
  const placeholder = emptyText || (withTime ? "তারিখ ও সময় বাছুন" : "তারিখ বাছুন");

  function show() {
    const parsed = parseDt(value);
    setPick({
      day: parsed?.day || "",
      h: parsed ? parsed.h : end ? 23 : 0,
      min: parsed ? parsed.min : end ? 59 : 0,
    });
    setMonth(openMonth(parsed?.day || isoOf(new Date())));
    setOpen(true);
  }

  function choose(iso: string) {
    if (withTime) {
      setPick((p) => ({ ...p, day: iso }));
      return;
    }
    onChange(iso);
    setOpen(false);
  }

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const mins = [...Array.from({ length: 12 }, (_, i) => i * 5), 59, pick.min].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);

  return (
    <div>
      {label ? <label>{label}</label> : null}
      <button type="button" className={`dt-btn${shown ? "" : " empty"}`} style={compact ? { width: "auto", minWidth: 180 } : undefined} onClick={show}>
        {shown || placeholder}
      </button>
      {open ? (
        <Pop onClose={() => setOpen(false)}>
          <CalSheet
            month={month}
            setMonth={setMonth}
            marked={marks}
            onDay={choose}
            dayCls={(iso, inMonth) => {
              let cls = "cal-day";
              if (!inMonth) cls += " mute";
              if (withTime ? iso === pick.day : iso === value) cls += " start";
              return cls;
            }}
            foot={withTime ? (
              <>
                <div className="cal-time">
                  <div>
                    <label>ঘণ্টা</label>
                    <select value={pick.h} onChange={(e) => setPick((p) => ({ ...p, h: Number(e.target.value) }))}>
                      {hours.map((h) => <option key={h} value={h}>{bn(pad2(h))} {hourName(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>মিনিট</label>
                    <select value={pick.min} onChange={(e) => setPick((p) => ({ ...p, min: Number(e.target.value) }))}>
                      {mins.map((n) => <option key={n} value={n}>{bn(pad2(n))}</option>)}
                    </select>
                  </div>
                </div>
                <div className="cal-foot">
                  <span>{end ? "শেষ তারিখ ও সময়" : "শুরুর তারিখ ও সময়"}</span>
                  <strong>{pick.day ? `${fmtIsoBn(pick.day)} · ${bn(pad2(pick.h))}:${bn(pad2(pick.min))}` : "তারিখ বাছুন"}</strong>
                </div>
                <div className="cal-ship-acts">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(""); setOpen(false); }}>সরান</button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => { if (pick.day) onChange(joinDt(pick.day, pick.h, pick.min)); setOpen(false); }}>ঠিক আছে</button>
                </div>
              </>
            ) : (
              <div className="cal-foot">
                <span>নির্বাচিত</span>
                <strong>{fmtIsoBn(value) || "তারিখ বাছুন"}</strong>
              </div>
            )}
          />
        </Pop>
      ) : null}
    </div>
  );
}

export function BnRangeButton({
  on, from, to, marked, onChange,
}: {
  on: boolean;
  from: string;
  to: string;
  marked?: string[];
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => openMonth(from || isoOf(new Date())));
  const marks = useMemo(() => new Set(marked || []), [marked]);

  function pick(iso: string) {
    if (!from || (from && to)) onChange(iso, "");
    else if (iso < from) onChange(iso, from);
    else onChange(from, iso);
  }

  const rangeTxt = from && to
    ? `${fmtIsoBn(from)} — ${fmtIsoBn(to)}`
    : from ? `${fmtIsoBn(from)} — শেষ তারিখ বাছুন` : "প্রথমে শুরুর তারিখ, তারপর শেষ তারিখ বাছুন";

  return (
    <>
      <button type="button" className={`ofilt${on ? " on" : ""}`} onClick={() => { setMonth(openMonth(from || isoOf(new Date()))); setOpen(true); }}>ক্যালেন্ডার</button>
      {open ? (
        <Pop onClose={() => setOpen(false)}>
          <CalSheet
            month={month}
            setMonth={setMonth}
            marked={marks}
            onDay={pick}
            dayCls={(iso, inMonth) => {
              let cls = "cal-day";
              if (!inMonth) cls += " mute";
              if (iso === from) cls += " start";
              if (iso === to) cls += " end";
              if (from && to && iso > from && iso < to) cls += " in";
              return cls;
            }}
            foot={<div className="cal-foot"><span>নির্বাচিত রেঞ্জ</span><strong>{rangeTxt}</strong></div>}
          />
        </Pop>
      ) : null}
    </>
  );
}
