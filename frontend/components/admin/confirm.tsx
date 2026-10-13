"use client";

import "./confirm.css";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ico, useEscLayer } from "@/components/admin/ui";

/* ═══════════════════════════════════════════════════════════
   Confirm · one premium "are you sure?" sheet for every
   critical admin change.

     const confirm = useConfirm();
     if (!(await confirm({ title, body, tone: "danger", confirmText: "হ্যাঁ, মুছুন" }))) return;
   ═══════════════════════════════════════════════════════════ */

export type ConfirmTone = "danger" | "warn" | "info";
export type ConfirmDetail = {
  label: ReactNode;
  /** plain value — or use from/to for a before → after row */
  value?: ReactNode;
  from?: ReactNode;
  to?: ReactNode;
  /** colour the row's value red (e.g. "below cost") */
  bad?: boolean;
};
export type ConfirmOptions = {
  title: ReactNode;
  body?: ReactNode;
  tone?: ConfirmTone;
  confirmText?: ReactNode;
  cancelText?: ReactNode;
  /** "what will change" summary rows */
  details?: ConfirmDetail[];
  /** heading above the details box */
  detailsTitle?: ReactNode;
  /** the user must type this exactly before Confirm unlocks */
  requireText?: string;
  /** override the badge icon */
  icon?: ReactNode;
  /** icon inside the confirm button */
  confirmIcon?: ReactNode;
  /** small caps line above the title */
  eyebrow?: ReactNode;
  /** extra self-contained controls (they keep their own state, e.g. write into a ref) */
  extra?: ReactNode;
};
/** A required free-text answer (e.g. a block reason) — used by useConfirmInput. */
export type ConfirmInput = { label: ReactNode; placeholder?: string; minLength?: number; chips?: string[]; initial?: string };
type Ask = (o: ConfirmOptions & { input?: ConfirmInput }) => Promise<string | null>;
type Confirm = (o: ConfirmOptions) => Promise<boolean>;
type ConfirmWithInput = (o: ConfirmOptions & { input: ConfirmInput }) => Promise<string | null>;

const ConfirmContext = createContext<Ask | null>(null);

/** Falls back to the browser dialog if no provider is mounted (never in the admin shell). */
const fallback: Ask = async (o) => {
  if (typeof window === "undefined") return null;
  const t = typeof o.title === "string" ? o.title : "নিশ্চিত?";
  if (o.input) return window.prompt(t, o.input.initial ?? "");
  return window.confirm(t) ? "" : null;
};

/** `if (!(await confirm({ title, tone: "danger" }))) return;` */
export function useConfirm(): Confirm {
  const ask = useContext(ConfirmContext) ?? fallback;
  return useCallback<Confirm>(async (o) => (await ask(o)) !== null, [ask]);
}
/** Same sheet, plus a required text answer. Resolves the trimmed text, or null on cancel. */
export function useConfirmInput(): ConfirmWithInput {
  const ask = useContext(ConfirmContext) ?? fallback;
  return useCallback<ConfirmWithInput>((o) => ask(o), [ask]);
}

type Req = ConfirmOptions & { input?: ConfirmInput; resolve: (v: string | null) => void; key: number };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Req | null>(null);
  const cur = useRef<Req | null>(null);
  const seq = useRef(0);
  const ask = useCallback<Ask>((o) => new Promise<string | null>((resolve) => {
    cur.current?.resolve(null); // a newer question replaces an unanswered one
    const next = { ...o, resolve, key: ++seq.current };
    cur.current = next;
    setReq(next);
  }), []);
  const settle = useCallback((v: string | null) => {
    const r = cur.current;
    cur.current = null;
    setReq(null);
    r?.resolve(v);
  }, []);
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {req ? <ConfirmDialog key={req.key} req={req} onSettle={settle} /> : null}
    </ConfirmContext.Provider>
  );
}

const S = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const ICON: Record<ConfirmTone, ReactNode> = {
  danger: <svg {...S}><path d="M12 3.8 2.6 19.6h18.8z" /><path d="M12 9.6v4.6M12 17h.01" /></svg>,
  warn: <svg {...S}><circle cx="12" cy="12" r="8.6" /><path d="M12 7.6v5.2M12 16.2h.01" /></svg>,
  info: <svg {...S}><circle cx="12" cy="12" r="8.6" /><path d="M12 11v5.2M12 7.8h.01" /></svg>,
};
const EYEBROW: Record<ConfirmTone, string> = { danger: "সতর্কতা · Critical change", warn: "নিশ্চিত করুন · Please check", info: "নিশ্চিত করুন · Confirm" };

function ConfirmDialog({ req, onSettle }: { req: Req; onSettle: (v: string | null) => void }) {
  const tone = req.tone ?? "warn";
  const [typed, setTyped] = useState("");
  const [answer, setAnswer] = useState(req.input?.initial ?? "");
  const answerRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const okBtn = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const need = req.requireText?.trim();
  const answered = !req.input || answer.trim().length >= (req.input.minLength ?? 1);
  const ok = answered && (!need || typed.trim().toLowerCase() === need.toLowerCase());
  const accept = () => { if (ok) onSettle(req.input ? answer.trim() : ""); };

  useEffect(() => setMounted(true), []);
  useEscLayer(true, () => onSettle(null));

  useEffect(() => {
    if (!mounted) return;
    const prev = document.activeElement as HTMLElement | null;
    document.body.classList.add("ap-lock");
    const t = window.setTimeout(() => (req.input ? answerRef.current : need ? input.current : okBtn.current)?.focus(), 30);
    return () => {
      window.clearTimeout(t);
      if (!document.querySelector(".ap-drawer-wrap, .ap-modal-wrap:not(.ap-cf-wrap)")) document.body.classList.remove("ap-lock");
      prev?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, need]);

  function onKey(e: ReactKeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !(e.nativeEvent as KeyboardEvent).isComposing) {
      const el = e.target as HTMLElement;
      if (el.tagName === "BUTTON" && el !== okBtn.current) return; // let Enter press the focused button
      e.preventDefault();
      accept();
      return;
    }
    if (e.key !== "Tab" || !box.current) return;
    const f = [...box.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)")];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  if (!mounted) return null;
  return createPortal(
    <div className={`ap-modal-wrap ap-cf-wrap cf-${tone}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onSettle(null); }}>
      <div ref={box} className="ap-cf" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={req.body ? bodyId : undefined} onKeyDown={onKey}>
        <i className="ap-cf-grab" aria-hidden="true" />
        <button type="button" className="ap-icon-btn ap-cf-x" aria-label="বন্ধ" onClick={() => onSettle(null)}>{Ico.close}</button>
        <div className="ap-cf-top">
          <span className="ap-cf-badge" aria-hidden="true"><span>{req.icon ?? ICON[tone]}</span></span>
          <small className="ap-cf-eyebrow">{req.eyebrow ?? EYEBROW[tone]}</small>
          <h3 id={titleId}>{req.title}</h3>
          {req.body ? <div className="ap-cf-body" id={bodyId}>{req.body}</div> : null}
        </div>

        {req.details?.length ? (
          <div className="ap-cf-sum">
            <p className="ap-cf-sum-h">{req.detailsTitle ?? <>যা বদলাবে<span>What changes</span></>}</p>
            <dl>
              {req.details.map((d, i) => (
                <div key={i} className={`ap-cf-row${d.bad ? " bad" : ""}`}>
                  <dt>{d.label}</dt>
                  <dd>
                    {d.from !== undefined || d.to !== undefined ? (
                      <><s className="ap-cf-from">{d.from ?? "—"}</s><span className="ap-cf-arrow" aria-label="থেকে">→</span><b className="ap-cf-to">{d.to ?? "—"}</b></>
                    ) : <b>{d.value}</b>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {req.extra ? <div className="ap-cf-extra">{req.extra}</div> : null}

        {req.input ? (
          <div className="ap-cf-type ap-cf-ask">
            <span>{req.input.label}</span>
            {req.input.chips?.length ? (
              <div className="ap-cf-chips">
                {req.input.chips.map((c) => <button key={c} type="button" className={`ap-chip${answer === c ? " on" : ""}`} onClick={() => { setAnswer(c); answerRef.current?.focus(); }}>{c}</button>)}
              </div>
            ) : null}
            <textarea ref={answerRef} rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={req.input.placeholder} aria-label={typeof req.input.label === "string" ? req.input.label : "কারণ"} />
            {req.input.minLength && answer.trim().length < req.input.minLength ? <small>অন্তত {req.input.minLength.toLocaleString("bn-BD")} অক্ষর লিখুন</small> : null}
          </div>
        ) : null}

        {need ? (
          <label className="ap-cf-type">
            <span>নিশ্চিত করতে লিখুন <code>{need}</code></span>
            <input ref={input} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={need} autoComplete="off" spellCheck={false} aria-invalid={!!typed && !ok} />
          </label>
        ) : null}

        <footer className="ap-cf-foot">
          <button type="button" className="ap-btn ghost ap-cf-cancel" onClick={() => onSettle(null)}>{req.cancelText ?? "না, থাক"}</button>
          <button ref={okBtn} type="button" className="ap-btn ap-cf-ok" disabled={!ok} onClick={accept}>
            {req.confirmIcon ?? null}{req.confirmText ?? "হ্যাঁ, নিশ্চিত"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
