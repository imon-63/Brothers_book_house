"use client";

import { useEffect, useRef, useState } from "react";
import { bn } from "@/lib/format";
import { joinDesc, parseDesc, type DescParts } from "@/lib/desc";

/**
 * বিবরণ — intro + bullet points. Enter adds the next point, Backspace on an
 * empty point removes it, ↑/↓ reorder. Emits the plain-text form (see lib/desc).
 */
export function DescEditor({ value, onChange, placeholder }: { value: string; onChange: (text: string) => void; placeholder?: string }) {
  const [parts, setParts] = useState<DescParts>(() => withBlank(parseDesc(value)));
  const last = useRef(value);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusAt, setFocusAt] = useState<number | null>(null);

  /* a different product / a reset from outside */
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setParts(withBlank(parseDesc(value)));
    }
  }, [value]);

  useEffect(() => {
    if (focusAt == null) return;
    refs.current[focusAt]?.focus();
    setFocusAt(null);
  }, [focusAt, parts.points.length]);

  function commit(next: DescParts) {
    setParts(next);
    const text = joinDesc(next);
    last.current = text;
    onChange(text);
  }
  const setPoint = (i: number, v: string) => commit({ ...parts, points: parts.points.map((p, j) => (j === i ? v : p)) });
  const insertAt = (i: number) => {
    const points = [...parts.points];
    points.splice(i, 0, "");
    commit({ ...parts, points });
    setFocusAt(i);
  };
  const remove = (i: number) => {
    const points = parts.points.filter((_, j) => j !== i);
    commit({ ...parts, points: points.length ? points : [""] });
    setFocusAt(Math.max(0, i - 1));
  };
  const move = (i: number, to: number) => {
    if (to < 0 || to >= parts.points.length) return;
    const points = [...parts.points];
    const [p] = points.splice(i, 1);
    points.splice(to, 0, p);
    commit({ ...parts, points });
    setFocusAt(to);
  };
  /* paste a whole list into one point → split into many */
  function paste(i: number, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n")) return;
    e.preventDefault();
    const lines = text.split(/\r?\n/).map((l) => l.replace(/^\s*(?:[•\-*✓✔▪●]|\d+[.)])\s+/, "").trim()).filter(Boolean);
    const points = [...parts.points];
    points.splice(i, points[i] ? 0 : 1, ...lines);
    commit({ ...parts, points });
    setFocusAt(i + lines.length - 1);
  }

  const filled = parts.points.filter((p) => p.trim()).length;

  return (
    <div className="de">
      <label className="de-intro">
        <span>ভূমিকা <small>এক-দুই লাইনে পণ্যের পরিচয়</small></span>
        <textarea rows={2} value={parts.intro} placeholder={placeholder || "যেমন: নবম-দশম শ্রেণির জন্য সম্পূর্ণ রঙিন গাইড, নতুন সিলেবাস অনুযায়ী।"}
          onChange={(e) => commit({ ...parts, intro: e.target.value })} />
      </label>

      <div className="de-head">
        <span>মূল বৈশিষ্ট্য <small>{filled ? `${bn(filled)}টি পয়েন্ট` : "পয়েন্ট আকারে"}</small></span>
        <small className="de-tip">Enter = নতুন পয়েন্ট · খালি ঘরে ⌫ = মুছুন</small>
      </div>
      <ol className="de-list">
        {parts.points.map((p, i) => (
          <li key={i} className="de-row">
            <span className="de-dot" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
            </span>
            <input
              ref={(el) => { refs.current[i] = el; }}
              value={p}
              maxLength={200}
              placeholder={i === 0 ? "যেমন: অধ্যায়ভিত্তিক MCQ ও সৃজনশীল প্রশ্ন" : "আরেকটি বৈশিষ্ট্য…"}
              onChange={(e) => setPoint(i, e.target.value)}
              onPaste={(e) => paste(i, e)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); insertAt(i + 1); }
                else if (e.key === "Backspace" && !p && parts.points.length > 1) { e.preventDefault(); remove(i); }
                else if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); move(i, i - 1); }
                else if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); move(i, i + 1); }
              }}
            />
            <span className="de-acts">
              <button type="button" aria-label="উপরে" disabled={i === 0} onClick={() => move(i, i - 1)}>↑</button>
              <button type="button" aria-label="নিচে" disabled={i === parts.points.length - 1} onClick={() => move(i, i + 1)}>↓</button>
              <button type="button" className="del" aria-label="মুছুন" onClick={() => remove(i)}>×</button>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="de-add" onClick={() => insertAt(parts.points.length)}>＋ পয়েন্ট যোগ করুন</button>

      {parts.intro.trim() || filled ? (
        <div className="de-preview" aria-label="প্রিভিউ">
          <small>ক্রেতা যেভাবে দেখবে</small>
          {parts.intro.trim() ? <p>{parts.intro}</p> : null}
          {filled ? <ul>{parts.points.filter((x) => x.trim()).map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}

function withBlank(p: DescParts): DescParts {
  return p.points.length ? p : { ...p, points: [""] };
}
