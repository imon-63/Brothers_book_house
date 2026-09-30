import { Logger } from '@nestjs/common';
import { AppConfig } from '@/config/app-config.service';
import type { SslValidation, TranQuery } from '../domain/validation';
import { SslGatewayError, type SslCommerzGateway, type SslRefundResponse, type SslSessionResponse } from './sslcommerz.gateway';

export const SSL_SANDBOX_BASE = 'https://sandbox.sslcommerz.com';
export const SSL_LIVE_BASE = 'https://securepay.sslcommerz.com';

export type HttpOptions = { timeoutMs: number; attempts: number; backoffMs: number };
const DEFAULTS: HttpOptions = { timeoutMs: 10_000, attempts: 3, backoffMs: 300 };

type Fetch = typeof fetch;

/**
 * SSLCOMMERZ v4 over HTTPS with the global fetch. Store credentials never
 * leave the server. Transient failures (network, timeout, 5xx, 429) are
 * retried with exponential backoff; refund initiation is attempted once.
 * Built by a factory provider (see payments.module.ts).
 */
export class SslCommerzHttpGateway implements SslCommerzGateway {
  private readonly logger = new Logger('SslCommerz');
  private readonly base: string;
  private readonly storeId: string;
  private readonly storePasswd: string;

  constructor(
    config: AppConfig,
    private readonly fetchImpl: Fetch = globalThis.fetch.bind(globalThis),
    private readonly opts: HttpOptions = DEFAULTS,
  ) {
    this.base = config.get('SSLCOMMERZ_SANDBOX') ? SSL_SANDBOX_BASE : SSL_LIVE_BASE;
    this.storeId = config.get('SSLCOMMERZ_STORE_ID');
    this.storePasswd = config.get('SSLCOMMERZ_STORE_PASSWORD');
  }

  createSession(fields: Record<string, string>): Promise<SslSessionResponse> {
    const body = new URLSearchParams({ ...fields, store_id: this.storeId, store_passwd: this.storePasswd });
    return this.call<SslSessionResponse>('session', `${this.base}/gwprocess/v4/api.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
    });
  }

  validate(valId: string): Promise<SslValidation> {
    return this.get<SslValidation>('validate', '/validator/api/validationserverAPI.php', { val_id: valId, v: '1' });
  }

  queryByTranId(tranId: string): Promise<TranQuery> {
    return this.get<TranQuery>('query', '/validator/api/merchantTransIDvalidationAPI.php', { tran_id: tranId });
  }

  refund(req: { bankTranId: string; amount: string; remarks: string; referenceId: string }): Promise<SslRefundResponse> {
    return this.get<SslRefundResponse>(
      'refund',
      '/validator/api/merchantTransIDvalidationAPI.php',
      { bank_tran_id: req.bankTranId, refund_amount: req.amount, refund_remarks: req.remarks.slice(0, 250), refe_id: req.referenceId, v: '1' },
      1,
    );
  }

  refundStatus(refundRefId: string): Promise<SslRefundResponse> {
    return this.get<SslRefundResponse>('refund_status', '/validator/api/merchantTransIDvalidationAPI.php', { refund_ref_id: refundRefId });
  }

  // ─── internals ───

  private get<T>(op: string, path: string, params: Record<string, string>, attempts?: number) {
    const qs = new URLSearchParams({ ...params, store_id: this.storeId, store_passwd: this.storePasswd, format: 'json' });
    return this.call<T>(op, `${this.base}${path}?${qs.toString()}`, { method: 'GET', headers: { Accept: 'application/json' } }, attempts);
  }

  private async call<T>(op: string, url: string, init: RequestInit, attempts = this.opts.attempts): Promise<T> {
    let last: SslGatewayError | undefined;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.opts.timeoutMs) });
        const text = await res.text();
        if (res.status >= 500 || res.status === 429) throw new SslGatewayError(`${op}: HTTP ${res.status}`, true);
        if (!res.ok) throw new SslGatewayError(`${op}: HTTP ${res.status}`, false);
        try {
          return JSON.parse(text.replace(/^﻿/, '')) as T;
        } catch {
          throw new SslGatewayError(`${op}: non-JSON response (${text.slice(0, 120)})`, false);
        }
      } catch (err) {
        const e = err instanceof SslGatewayError ? err : new SslGatewayError(`${op}: ${(err as Error)?.name === 'TimeoutError' ? 'timeout' : (err as Error)?.message ?? 'network error'}`, true);
        last = e;
        if (!e.retryable || i === attempts - 1) break;
        this.logger.warn(`${e.message} — retry ${i + 1}/${attempts - 1}`);
        await new Promise((r) => setTimeout(r, this.opts.backoffMs * 2 ** i));
      }
    }
    throw last ?? new SslGatewayError(`${op}: failed`, true);
  }
}
