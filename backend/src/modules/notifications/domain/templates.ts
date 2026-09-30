/**
 * Bangla message templates for the outbox. Pure: payload + context → text.
 * SMS copy is kept short (Unicode SMS = 70 chars/segment). Missing required
 * fields raise TemplateError, which the worker treats as non-retryable.
 */
export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

export type RenderContext = { storeName: string; webUrl: string; helpline?: string | null };
export type Rendered = { subject: string; text: string };
type Payload = Record<string, unknown>;

const BN = '০১২৩৪৫৬৭৮৯';
export const bnDigits = (v: string | number) => String(v).replace(/\d/g, (d) => BN[Number(d)]);

/** 1234.5 → "৳১,২৩৪.৫০", 1200 → "৳১,২০০" */
export function taka(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return '৳০';
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [int, frac] = fixed.split('.');
  // South-Asian grouping: last 3, then pairs (১২,৩৪,৫৬৭)
  const head = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const grouped = head ? `${head},${int.slice(-3)}` : int;
  return `৳${bnDigits(grouped)}${frac ? `.${bnDigits(frac)}` : ''}`;
}

function req(p: Payload, key: string): string {
  const v = p[key];
  if (v === undefined || v === null || v === '') throw new TemplateError(`template payload missing "${key}"`);
  return String(v);
}
const opt = (p: Payload, key: string) => (p[key] === undefined || p[key] === null || p[key] === '' ? null : String(p[key]));
const hi = (p: Payload) => (opt(p, 'name') ? `প্রিয় ${opt(p, 'name')}, ` : '');

const TEMPLATES: Record<string, (p: Payload, c: RenderContext) => Rendered> = {
  'order.placed': (p, c) => ({
    subject: `অর্ডার ${req(p, 'orderNo')} পেয়েছি`,
    text: `${hi(p)}আপনার অর্ডার ${req(p, 'orderNo')} (${taka(req(p, 'total'))}) পেয়েছি। শিগগিরই কনফার্ম করা হবে। ট্র্যাক: ${c.webUrl}/track?order=${req(p, 'orderNo')} — ${c.storeName}`,
  }),
  'order.confirmed': (p, c) => ({
    subject: `অর্ডার ${req(p, 'orderNo')} নিশ্চিত`,
    text: `${hi(p)}আপনার অর্ডার ${req(p, 'orderNo')} নিশ্চিত হয়েছে। প্যাক করে দ্রুত পাঠাচ্ছি। — ${c.storeName}`,
  }),
  'order.shipped': (p, c) => {
    const courier = opt(p, 'courier');
    const tracking = opt(p, 'trackingNo');
    const link = opt(p, 'trackingUrl') ?? `${c.webUrl}/track?order=${req(p, 'orderNo')}`;
    return {
      subject: `অর্ডার ${req(p, 'orderNo')} পাঠানো হয়েছে`,
      text: `${hi(p)}অর্ডার ${req(p, 'orderNo')} ${courier ? `${courier}-এ ` : 'কুরিয়ারে '}তুলে দেওয়া হয়েছে${tracking ? ` (ট্র্যাকিং: ${tracking})` : ''}। ট্র্যাক: ${link} — ${c.storeName}`,
    };
  },
  'order.delivered': (p, c) => ({
    subject: `অর্ডার ${req(p, 'orderNo')} ডেলিভারি সম্পন্ন`,
    text: `${hi(p)}অর্ডার ${req(p, 'orderNo')} পৌঁছে গেছে। ${c.storeName}-এর সাথে থাকার জন্য ধন্যবাদ! রিভিউ দিন: ${c.webUrl}/orders`,
  }),
  'order.cancelled': (p, c) => ({
    subject: `অর্ডার ${req(p, 'orderNo')} বাতিল`,
    text: `${hi(p)}অর্ডার ${req(p, 'orderNo')} বাতিল হয়েছে${opt(p, 'reason') ? ` (${opt(p, 'reason')})` : ''}।${c.helpline ? ` প্রশ্ন থাকলে কল করুন ${c.helpline}।` : ''} — ${c.storeName}`,
  }),
  'auth.password_reset': (p, c) => ({
    subject: `${c.storeName} পাসওয়ার্ড রিসেট কোড`,
    text: `${c.storeName}: আপনার পাসওয়ার্ড রিসেট কোড ${req(p, 'code')}। ${bnDigits(opt(p, 'minutes') ?? '10')} মিনিটের মধ্যে ব্যবহার করুন। কাউকে কোডটি দেবেন না।`,
  }),
  'wishlist.restocked': (p, c) => ({
    subject: `${req(p, 'title')} আবার স্টকে`,
    text: `${hi(p)}"${req(p, 'title')}" আবার স্টকে এসেছে! এখনই অর্ডার করুন: ${c.webUrl}/${opt(p, 'kind') === 'bundle' ? 'pack' : 'product'}/${req(p, 'slug')} — ${c.storeName}`,
  }),
  'staff.invite': (p, c) => ({
    subject: `${c.storeName} অ্যাডমিনে আপনাকে যুক্ত করা হয়েছে`,
    text: `${hi(p)}${c.storeName} অ্যাডমিন প্যানেলে আপনার অ্যাকাউন্ট তৈরি হয়েছে (${req(p, 'role')})।\nইমেইল: ${req(p, 'email')}\nঅস্থায়ী পাসওয়ার্ড: ${req(p, 'tempPassword')}\nলগইন: ${opt(p, 'loginUrl') ?? `${c.webUrl}/admin`}\nপ্রথম লগইনের পর পাসওয়ার্ড বদলে নিন।`,
  }),
  'staff.password_reset': (p, c) => ({
    subject: `${c.storeName} অ্যাডমিন পাসওয়ার্ড রিসেট`,
    text: `${hi(p)}আপনার অ্যাডমিন পাসওয়ার্ড রিসেট করা হয়েছে।\nঅস্থায়ী পাসওয়ার্ড: ${req(p, 'tempPassword')}\nলগইন: ${opt(p, 'loginUrl') ?? `${c.webUrl}/admin`}`,
  }),
};

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

/** Keys removed from the stored payload once delivered (secrets must not linger in the DB). */
export const SENSITIVE_KEYS = ['code', 'tempPassword', 'otp'];

export function render(template: string, payload: unknown, ctx: RenderContext): Rendered {
  const fn = TEMPLATES[template];
  if (!fn) throw new TemplateError(`unknown template "${template}"`);
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as Payload) : {};
  return fn(p, ctx);
}

export function scrub(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) out[k] = SENSITIVE_KEYS.includes(k) ? '[redacted]' : v;
  return out;
}
