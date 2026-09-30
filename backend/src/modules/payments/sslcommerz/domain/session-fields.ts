import { round2, type MoneyLike } from '@/common/utils/money';
import { localPhone } from '@/common/utils/text';

export const SSL_MIN_AMOUNT = 10;
export const SSL_MAX_AMOUNT = 500_000;

/** Our transaction id for attempt `n` of an order: "CLO-2042-1" (≤ 30 chars, unique). */
export function makeTranId(orderNo: string, attempt: number): string {
  return `${orderNo}-${attempt}`.slice(0, 30);
}

export type SessionOrder = {
  orderId: string;
  orderNo: string;
  paymentId: string;
  tranId: string;
  amount: MoneyLike;
  currency: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string | null;
  shipLine: string;
  shipUpazila: string | null;
  shipDistrict: string;
  shipDivision: string;
  items: { title: string; quantity: number; sectionCode: string }[];
};

export type SessionUrls = { success: string; fail: string; cancel: string; ipn: string };

const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/**
 * Form fields for the v4 session API (gwprocess/v4/api.php), minus the store
 * credentials which the gateway adapter adds. Customer/shipping come from the
 * order snapshot; value_a/value_b carry our ids back on callbacks.
 */
export function buildSessionFields(o: SessionOrder, urls: SessionUrls, fallbackEmailDomain = 'cholo.shop'): Record<string, string> {
  const phone = localPhone(o.contactPhone);
  const products = o.items.map((i) => `${i.title} × ${i.quantity}`).join(', ') || o.orderNo;
  const categories = [...new Set(o.items.map((i) => i.sectionCode).filter(Boolean))].join(',') || 'general';
  const units = o.items.reduce((s, i) => s + i.quantity, 0) || 1;
  const address = clip(o.shipLine, 50) || o.shipDistrict;
  return {
    total_amount: round2(o.amount).toFixed(2),
    currency: o.currency,
    tran_id: o.tranId,
    success_url: urls.success,
    fail_url: urls.fail,
    cancel_url: urls.cancel,
    ipn_url: urls.ipn,
    cus_name: clip(o.contactName, 50) || 'Customer',
    cus_email: o.contactEmail || `${phone}@${fallbackEmailDomain}`,
    cus_add1: address,
    cus_add2: clip(o.shipUpazila ?? '', 50),
    cus_city: clip(o.shipDistrict, 50),
    cus_state: clip(o.shipDivision, 50),
    cus_postcode: '1000',
    cus_country: 'Bangladesh',
    cus_phone: phone,
    shipping_method: 'Courier',
    num_of_item: String(units),
    ship_name: clip(o.contactName, 50) || 'Customer',
    ship_add1: address,
    ship_add2: clip(o.shipUpazila ?? '', 50),
    ship_city: clip(o.shipDistrict, 50),
    ship_state: clip(o.shipDivision, 50),
    ship_postcode: '1000',
    ship_country: 'Bangladesh',
    product_name: clip(products, 255),
    product_category: clip(categories, 100),
    product_profile: 'physical-goods',
    value_a: o.orderId,
    value_b: o.paymentId,
    value_c: o.orderNo,
  };
}
