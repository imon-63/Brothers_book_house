import { z } from 'zod';
import { normalizeBdPhone } from '@/common/utils/text';

/**
 * Known store settings (store_settings key/value). Every key has a zod
 * schema, a default and a visibility flag: `public` keys are served to the
 * storefront by GET /content/storefront, the rest are admin-only.
 * Unknown keys are rejected so typos never become silent config.
 */
const bdPhone = z.string().transform((v, ctx) => {
  const p = normalizeBdPhone(v);
  if (!p) {
    ctx.addIssue({ code: 'custom', message: 'সঠিক মোবাইল নম্বর দিন' });
    return z.NEVER;
  }
  return p;
});

export const SETTINGS = {
  store_name: { schema: z.string().trim().min(1).max(80), default: 'চলো', public: true, description: 'দোকানের নাম' },
  store_name_en: { schema: z.string().trim().min(1).max(80), default: 'Cholo', public: true, description: 'Store name (English)' },
  tagline: { schema: z.string().trim().max(160), default: '', public: true, description: 'ট্যাগলাইন' },
  helpline: { schema: bdPhone, default: '+8801700000000', public: true, description: 'হেল্পলাইন নম্বর' },
  whatsapp: { schema: bdPhone.nullable(), default: null, public: true, description: 'WhatsApp নম্বর' },
  support_email: { schema: z.string().trim().email().nullable(), default: null, public: true, description: 'সাপোর্ট ইমেইল' },
  support_hours: { schema: z.string().trim().max(80), default: 'সকাল ১০টা – রাত ১০টা', public: true, description: 'সাপোর্টের সময়' },
  facebook_url: { schema: z.string().trim().url().nullable(), default: null, public: true, description: 'Facebook পেজ' },
  address: { schema: z.string().trim().max(300), default: '', public: true, description: 'ঠিকানা' },
  cod_enabled: { schema: z.boolean(), default: true, public: true, description: 'ক্যাশ অন ডেলিভারি চালু' },
  online_payment_enabled: { schema: z.boolean(), default: true, public: true, description: 'অনলাইন পেমেন্ট চালু' },
  gateway_fee_pct: { schema: z.number().min(0).max(10), default: 2.5, public: false, description: 'SSLCOMMERZ ফি (%)' },
  default_low_stock_threshold: { schema: z.number().int().min(0).max(10_000), default: 5, public: false, description: 'ডিফল্ট কম-স্টক সীমা' },
  order_prefix: { schema: z.string().trim().regex(/^[A-Z]{2,6}-?$/, 'যেমন CLO-'), default: 'CLO-', public: false, description: 'অর্ডার নম্বরের শুরু' },
  cod_stale_days: { schema: z.number().int().min(1).max(60), default: 5, public: false, description: 'কত দিন পর COD সতর্কতা' },
  low_stock_alerts: { schema: z.boolean(), default: true, public: false, description: 'কম স্টকের নোটিফিকেশন' },
} as const satisfies Record<string, { schema: z.ZodType; default: unknown; public: boolean; description: string }>;

export type SettingKey = keyof typeof SETTINGS;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(k: string): k is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTINGS, k);
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

export function parseSetting(key: string, value: unknown): ParseResult {
  if (!isSettingKey(key)) return { ok: false, error: `অজানা সেটিং: ${key}` };
  const r = (SETTINGS[key].schema as z.ZodType).safeParse(value);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
}

/** Stored rows over defaults; stored values that no longer validate fall back to the default. */
export function resolveSettings(stored: { key: string; value: unknown }[], onlyPublic = false): Record<string, unknown> {
  const map = new Map(stored.map((s) => [s.key, s.value]));
  const out: Record<string, unknown> = {};
  for (const k of SETTING_KEYS) {
    if (onlyPublic && !SETTINGS[k].public) continue;
    const r = map.has(k) ? parseSetting(k, map.get(k)) : null;
    out[k] = r?.ok ? r.value : SETTINGS[k].default;
  }
  return out;
}

/** Scheduling window check used for announcements, popups and hero slides. */
export function isLive(row: { isActive: boolean; startsAt: Date | null; endsAt: Date | null }, now: Date = new Date()): boolean {
  return row.isActive && (!row.startsAt || row.startsAt <= now) && (!row.endsAt || row.endsAt > now);
}

/** Validate a reorder request: exactly the same ids, no duplicates. */
export function checkReorder(current: string[], requested: string[]): string | null {
  if (new Set(requested).size !== requested.length) return 'একই আইটেম দুবার দেওয়া হয়েছে';
  if (requested.length !== current.length || requested.some((id) => !current.includes(id))) return 'সব আইটেম ঠিকঠাক পাঠান';
  return null;
}
