import type { SslValidation, TranQuery } from '../domain/validation';

export const SSLCOMMERZ_GATEWAY = Symbol('SSLCOMMERZ_GATEWAY');

export type SslSessionResponse = {
  status?: string; // SUCCESS | FAILED
  failedreason?: string;
  sessionkey?: string;
  GatewayPageURL?: string;
  [k: string]: unknown;
};

export type SslRefundResponse = {
  APIConnect?: string;
  status?: string; // success | failed | processing | refunded | cancelled
  refund_ref_id?: string;
  bank_tran_id?: string;
  errorReason?: string;
  [k: string]: unknown;
};

/**
 * Port for the SSLCOMMERZ v4 APIs. The HTTP adapter adds store credentials,
 * timeouts and retries; tests bind a fake. Every method resolves with the
 * gateway's parsed JSON or throws `SslGatewayError` on transport failure.
 */
export interface SslCommerzGateway {
  /** gwprocess/v4/api.php — fields WITHOUT store_id/store_passwd */
  createSession(fields: Record<string, string>): Promise<SslSessionResponse>;
  /** validator/api/validationserverAPI.php?val_id= */
  validate(valId: string): Promise<SslValidation>;
  /** validator/api/merchantTransIDvalidationAPI.php?tran_id= */
  queryByTranId(tranId: string): Promise<TranQuery>;
  /** refund initiation (bank_tran_id + refund_amount) — NOT retried */
  refund(req: { bankTranId: string; amount: string; remarks: string; referenceId: string }): Promise<SslRefundResponse>;
  /** refund status by refund_ref_id */
  refundStatus(refundRefId: string): Promise<SslRefundResponse>;
}

export class SslGatewayError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SslGatewayError';
  }
}
