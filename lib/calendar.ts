import { bn } from "@/lib/format";

export const BN_MON = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
export const BN_DAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function isoOf(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fmtIsoBn(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${bn(d)} ${BN_MON[m - 1]} ${bn(y)}`;
}

export function parseDt(s: string) {
  const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  return { day: m[1], h: m[2] != null ? Number(m[2]) : 0, min: m[3] != null ? Number(m[3]) : 0 };
}

export function joinDt(day: string, h: number, min: number) {
  return `${day}T${pad2(h)}:${pad2(min)}`;
}

export function fmtShipDt(s: string) {
  const p = parseDt(s);
  if (!p) return "";
  return `${fmtIsoBn(p.day)} · ${bn(pad2(p.h))}:${bn(pad2(p.min))}`;
}

export function hourName(h: number) {
  if (h >= 5 && h < 12) return "সকাল";
  if (h >= 12 && h < 16) return "দুপুর";
  if (h >= 16 && h < 19) return "বিকাল";
  if (h >= 19 && h < 21) return "সন্ধ্যা";
  return "রাত";
}
