import { Logger } from '@nestjs/common';
import { toBdSmsNumber } from '../domain/sms-number';

/** Provider failure; `retryable=false` means "don't bother retrying" (bad number, 4xx). */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type SendResult = { providerRef: string | null };

export interface SmsProvider {
  readonly name: string;
  send(to: string, text: string): Promise<SendResult>;
}

export interface EmailProvider {
  readonly name: string;
  send(msg: { to: string; subject: string; text: string }): Promise<SendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

const TIMEOUT_MS = 10_000;
const mask = (s: string) => (s.length > 4 ? `${'*'.repeat(s.length - 4)}${s.slice(-4)}` : '****');

function classifyHttp(status: number): boolean {
  // 408/429/5xx are worth retrying; other 4xx are permanent.
  return status === 408 || status === 429 || status >= 500;
}

/**
 * BulkSMSBD-style HTTP API:
 *   POST {SMS_API_URL}  api_key, senderid, number=8801…, message
 *   → { response_code: 202, success_message, message_id? }
 */
export class BulkSmsBdProvider implements SmsProvider {
  readonly name = 'bulksmsbd';

  constructor(private readonly cfg: { url: string; apiKey: string; senderId: string }) {}

  async send(to: string, text: string): Promise<SendResult> {
    const number = toBdSmsNumber(to);
    if (!number) throw new ProviderError(`invalid BD number ${mask(to)}`, false);
    const body = new URLSearchParams({ api_key: this.cfg.apiKey, senderid: this.cfg.senderId, number, message: text, type: 'unicode' });
    let res: Response;
    try {
      res = await fetch(this.cfg.url, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      throw new ProviderError(`sms network error: ${(err as Error).message}`, true);
    }
    const raw = await res.text();
    if (!res.ok) throw new ProviderError(`sms http ${res.status}`, classifyHttp(res.status));
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* some gateways answer plain text */
    }
    const code = Number(json.response_code ?? 202);
    if (code !== 202) {
      // 1001-1007 are credential/number/sender problems → permanent; others (1011 balance…) retry.
      throw new ProviderError(`sms rejected: ${code} ${String(json.error_message ?? '')}`.trim(), !(code >= 1001 && code <= 1007));
    }
    return { providerRef: json.message_id != null ? String(json.message_id) : null };
  }
}

/** Dev / unconfigured fallback: logs the message instead of sending it. */
export class LogSmsProvider implements SmsProvider {
  readonly name = 'log';
  private readonly logger = new Logger('SMS');

  /** `revealText=false` in production so OTPs never land in logs. */
  constructor(private readonly revealText = true) {}

  async send(to: string, text: string): Promise<SendResult> {
    this.logger.warn(`[dry-run, SMS provider not configured] → ${mask(to)}: ${this.revealText ? text : `(${text.length} chars)`}`);
    return { providerRef: null };
  }
}

/**
 * Transactional-email HTTP API stub (Postmark/Resend/SES-HTTP shaped):
 *   POST {EMAIL_API_URL}  Authorization: Bearer {EMAIL_API_KEY}
 *   { from, to, subject, text }  → { id }
 * No SMTP dependency; swap the body mapping for the chosen vendor.
 */
export class HttpEmailProvider implements EmailProvider {
  readonly name = 'http';

  constructor(private readonly cfg: { url: string; apiKey: string; from: string }) {}

  async send(msg: { to: string; subject: string; text: string }): Promise<SendResult> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(msg.to)) throw new ProviderError('invalid email address', false);
    let res: Response;
    try {
      res = await fetch(this.cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify({ from: this.cfg.from, to: msg.to, subject: msg.subject, text: msg.text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new ProviderError(`email network error: ${(err as Error).message}`, true);
    }
    if (!res.ok) throw new ProviderError(`email http ${res.status}`, classifyHttp(res.status));
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { providerRef: json.id != null ? String(json.id) : json.MessageID != null ? String(json.MessageID) : null };
  }
}

export class LogEmailProvider implements EmailProvider {
  readonly name = 'log';
  private readonly logger = new Logger('Email');

  async send(msg: { to: string; subject: string; text: string }): Promise<SendResult> {
    const [user, domain] = msg.to.split('@');
    this.logger.warn(`[dry-run, email provider not configured] → ${user?.slice(0, 2)}***@${domain ?? ''}: ${msg.subject}`);
    return { providerRef: null };
  }
}
