import type { PaymentStatus, Prisma } from '@prisma/client';
import { D, percentOf, round2, ZERO, type MoneyLike } from '@/common/utils/money';

/** Fields of the validation API / IPN we rely on (everything arrives as strings). */
export type SslValidation = {
  status?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string;
  store_amount?: string;
  currency?: string;
  currency_type?: string;
  currency_amount?: string;
  bank_tran_id?: string;
  card_type?: string;
  card_brand?: string;
  card_issuer?: string;
  risk_level?: string;
  risk_title?: string;
  error?: string;
  [k: string]: unknown;
};

export type Expected = { tranId: string; amount: MoneyLike; currency: string };

export type ValidationDecision =
  | { kind: 'success'; valId: string; bankTranId: string | null; cardType: string | null; cardBrand: string | null; riskLevel: number | null }
  /** a real answer about THIS transaction: it is not paid */
  | { kind: 'not_paid'; status: Extract<PaymentStatus, 'FAILED' | 'CANCELLED' | 'EXPIRED'>; reason: string }
  /** paid, but not what we asked for (tampered amount/currency) */
  | { kind: 'mismatch'; reason: string }
  /** does not describe our transaction (wrong/forged val_id) — do not touch the payment */
  | { kind: 'foreign'; reason: string }
  /** gateway has no final answer yet */
  | { kind: 'pending'; reason: string };

const PAID = new Set(['VALID', 'VALIDATED']);

/**
 * Decide what a validation-API answer means for our payment. Success requires
 * status VALID/VALIDATED, the same tran_id, and the same amount + currency we
 * sent in the session (currency_type/currency_amount are the originals; amount
 * is already converted to BDT).
 */
export function evaluateValidation(expected: Expected, v: SslValidation | null | undefined): ValidationDecision {
  if (!v) return { kind: 'pending', reason: 'no_response' };
  const status = String(v.status ?? '').toUpperCase();
  if (v.tran_id && v.tran_id !== expected.tranId) return { kind: 'foreign', reason: 'tran_id_mismatch' };
  if (status === 'INVALID_TRANSACTION' || !v.tran_id) return { kind: 'foreign', reason: status ? status.toLowerCase() : 'no_tran_id' };

  if (PAID.has(status)) {
    const currency = String(v.currency_type || v.currency || '').toUpperCase();
    const amount = v.currency_amount ?? v.amount;
    if (currency !== expected.currency.toUpperCase()) return { kind: 'mismatch', reason: `currency ${currency || '?'}` };
    if (amount == null || !isNumeric(amount) || !round2(amount).equals(round2(expected.amount))) {
      return { kind: 'mismatch', reason: `amount ${amount ?? '?'}` };
    }
    if (!v.val_id) return { kind: 'pending', reason: 'no_val_id' };
    const risk = v.risk_level != null && v.risk_level !== '' ? Number(v.risk_level) : null;
    return {
      kind: 'success',
      valId: String(v.val_id),
      bankTranId: v.bank_tran_id ? String(v.bank_tran_id) : null,
      cardType: v.card_type ? String(v.card_type).slice(0, 60) : null,
      cardBrand: v.card_brand ? String(v.card_brand).slice(0, 30) : null,
      riskLevel: Number.isFinite(risk) ? risk : null,
    };
  }
  const notPaid = mapNotPaid(status);
  if (notPaid) return { kind: 'not_paid', status: notPaid, reason: String(v.error || status).slice(0, 200) };
  return { kind: 'pending', reason: status ? status.toLowerCase() : 'unknown' };
}

export function mapNotPaid(status: string): 'FAILED' | 'CANCELLED' | 'EXPIRED' | null {
  switch (status.toUpperCase()) {
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'EXPIRED':
    case 'UNATTEMPTED':
      return 'EXPIRED';
    default:
      return null;
  }
}

export type TranQuery = { APIConnect?: string; no_of_trans_found?: number | string; element?: SslValidation[] };

export type QueryOutcome =
  | { kind: 'paid'; valId: string }
  | { kind: 'not_paid'; status: 'FAILED' | 'CANCELLED' | 'EXPIRED'; reason: string }
  | { kind: 'none' }
  | { kind: 'pending' };

/** Interpret the transaction-status API (by tran_id). Any VALID attempt wins. */
export function interpretTransactionQuery(q: TranQuery | null | undefined, tranId: string): QueryOutcome {
  if (!q || (q.APIConnect && q.APIConnect !== 'DONE')) return { kind: 'pending' };
  const els = (q.element ?? []).filter((e) => !e.tran_id || e.tran_id === tranId);
  if (!els.length) return { kind: 'none' };
  const paid = els.find((e) => PAID.has(String(e.status ?? '').toUpperCase()) && e.val_id);
  if (paid) return { kind: 'paid', valId: String(paid.val_id) };
  if (els.some((e) => String(e.status ?? '').toUpperCase() === 'PENDING')) return { kind: 'pending' };
  const last = els[els.length - 1];
  const np = mapNotPaid(String(last.status ?? ''));
  return np ? { kind: 'not_paid', status: np, reason: String(last.error || last.status).slice(0, 200) } : { kind: 'pending' };
}

/**
 * Gateway fee = amount − store_amount (what SSLCOMMERZ keeps). When
 * store_amount is missing/odd, fall back to the configured fee %.
 */
export function computeGatewayFee(amount: MoneyLike, storeAmount: MoneyLike | null | undefined, fallbackPct: MoneyLike = 0): Prisma.Decimal {
  if (storeAmount != null && storeAmount !== '' && isNumeric(storeAmount)) {
    const fee = round2(D(amount).minus(D(storeAmount)));
    if (!fee.isNegative() && fee.lessThanOrEqualTo(D(amount))) return fee;
  }
  const pct = D(fallbackPct);
  return pct.greaterThan(0) ? percentOf(amount, pct) : ZERO;
}

const SECRET_KEYS = /^(card_no|card_number|cardnumber|pan|cvv|cvc|store_passwd|store_password|verify_key|verify_sign|verify_sign_sha2)$/i;

/** Keep the gateway's answer for support, minus card numbers and secrets. */
export function sanitizeGatewayPayload(v: Record<string, unknown>): Prisma.InputJsonObject {
  const out: Record<string, Prisma.InputJsonValue> = {};
  for (const [k, val] of Object.entries(v)) {
    if (SECRET_KEYS.test(k) || val === undefined || val === null) continue;
    if (typeof val === 'string') out[k] = /^\d{12,19}$/.test(val.replace(/[\s-]/g, '')) && /card/i.test(k) ? '[redacted]' : val.slice(0, 500);
    else if (typeof val === 'number' || typeof val === 'boolean') out[k] = val;
    else out[k] = JSON.stringify(val).slice(0, 1000);
  }
  return out;
}

function isNumeric(v: unknown) {
  return /^-?\d+(\.\d+)?$/.test(String(v).trim());
}
