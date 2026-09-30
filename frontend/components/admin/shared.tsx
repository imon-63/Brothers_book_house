"use client";

import { VerticalIcon } from "@/components/icons";
import { bn } from "@/lib/format";
import { useAdminSection } from "@/lib/admin/section-context";
import type { AdminSection } from "@/lib/api/admin/sections";

export const COLORS = ["#7A2430", "#5C1B24", "#3D5A4C", "#8A6230", "#1a3a6b"];

const BUILTIN = new Set(["book", "food", "gadget"]);

/**
 * Icon for a (dynamic) section: the storefront's VerticalIcon for the three
 * built-in sections, else the section's emoji (content.icon), else a generic box.
 */
export function SectionIcon({ code, section }: { code: string; section?: Pick<AdminSection, "content"> | null }) {
  if (BUILTIN.has(code)) return <VerticalIcon id={code as "book" | "food" | "gadget"} />;
  const icon = typeof section?.content?.icon === "string" ? section.content.icon : "";
  if (icon) return <span className="ap-sec-emoji" aria-hidden="true" style={{ fontSize: "1.05em", lineHeight: 1 }}>{icon}</span>;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" /><path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
    </svg>
  );
}

/** Section name by code (falls back to the code itself). */
export function useSectionName() {
  const { byCode } = useAdminSection();
  return (code: string | null | undefined) => (code ? byCode(code)?.name ?? code : "");
}

export function readFile(file: File, done: (url: string) => void) {
  const reader = new FileReader();
  reader.onload = () => done(String(reader.result || ""));
  reader.readAsDataURL(file);
}

export function TabMark({ id }: { id: string }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };
  if (id === "books") return <svg {...p}><path d="M6 4.5h9.5A2.5 2.5 0 0 1 18 7v12.5H8.5A2.5 2.5 0 0 0 6 22z" /><path d="M6 4.5v17.5" /></svg>;
  if (id === "settings") return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3V21M3.5 12h2.2M18.3 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></svg>;
  if (id === "cats") return <svg {...p}><path d="M4 7h7l2 2h7v9.5H4z" /></svg>;
  if (id === "packs") return <svg {...p}><path d="M4 8l8-4 8 4-8 4z" /><path d="M4 8v8l8 4 8-4V8" /></svg>;
  if (id === "orders") return <svg {...p}><path d="M7 6h10l1 13H6z" /><path d="M9 6a3 3 0 0 1 6 0" /></svg>;
  if (id === "finance") return <svg {...p}><path d="M5 18V8M10 18V6M15 18v-5M20 18V9" /></svg>;
  return <svg {...p}><path d="M5 7h14v9H8l-3 3z" /></svg>;
}

export function pageList(cur: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, cur - 1);
  const to = Math.min(pages - 1, cur + 1);
  if (from > 2) out.push("gap");
  for (let n = from; n <= to; n++) out.push(n);
  if (to < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

export function Pager({ cur, pages, total, size, onPage, onSize, unit = "টি" }: { cur: number; pages: number; total: number; size: number; onPage: (n: number) => void; onSize?: (n: number) => void; unit?: string }) {
  const first = total ? (cur - 1) * size + 1 : 0;
  const last = Math.min(total, cur * size);
  return (
    <div className="pager adm-pager">
      <div className="pager-info"><b>{bn(first)}–{bn(last)}</b> / {bn(total)}{unit}</div>
      {onSize ? (
        <label className="size-lab">প্রতি পৃষ্ঠায়
          <select className="inline" value={size} onChange={(e) => onSize(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{bn(n)}</option>)}
          </select>
        </label>
      ) : null}
      <div className="pager-btns">
        <button type="button" className="pg" aria-label="আগের পৃষ্ঠা" disabled={cur <= 1} onClick={() => onPage(cur - 1)}>‹</button>
        {pageList(cur, pages).map((n, i) => n === "gap"
          ? <span key={`g${i}`} className="pg-gap">…</span>
          : <button key={n} type="button" className={`pg${n === cur ? " on" : ""}`} aria-current={n === cur ? "page" : undefined} onClick={() => onPage(n)}>{bn(n)}</button>)}
        <button type="button" className="pg" aria-label="পরের পৃষ্ঠা" disabled={cur >= pages} onClick={() => onPage(cur + 1)}>›</button>
      </div>
    </div>
  );
}

/** Section chips for an order (codes come from the API: order.sections). */
export function VertTags({ list }: { list: string[] }) {
  const { byCode } = useAdminSection();
  if (!list.length) return <span className="vt-tag none">অজানা</span>;
  return (
    <span className="vt-tags">
      {list.map((v) => {
        const s = byCode(v);
        return <span key={v} className={`vt-tag v-${v}`}><SectionIcon code={v} section={s} />{s?.name ?? v}</span>;
      })}
    </span>
  );
}

export function PackStack({ books, size = "md" }: { books: { id: string | number; title: string; color?: string | null; image?: string | null }[]; size?: "md" | "lg" }) {
  const top = books.slice(0, 5);
  if (!top.length) return <div className={`pk-stack ${size} empty-stack`}><span>বই বাছুন</span></div>;
  return (
    <div className={`pk-stack ${size}`} style={{ ["--n" as string]: top.length }}>
      {top.map((b, i) => (
        <span key={b.id} className="pk-cover" style={{ ["--i" as string]: i - (top.length - 1) / 2, background: b.image ? undefined : b.color || "#7A2430" }}>
          {b.image ? <img src={b.image} alt="" /> : <em>{b.title}</em>}
        </span>
      ))}
    </div>
  );
}
