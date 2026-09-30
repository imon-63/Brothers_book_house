import { D } from '@/common/utils/money';
import { accountForMethod, kindAllowsDirection, opposite, rollDays, signed } from './cashbook/domain/cash-math';
import { escapeHtml, renderDocumentHtml, type PrintableDocument } from './documents/domain/document-html';
import { checkPayment, mergeLines, outstanding, purchaseTotals, settlementStatus } from './purchasing/domain/purchase-math';
import { toCsv } from './reports/domain/csv';
import { bnMoney, bnTaka } from './shared/domain/bn-format';
import { dayRange, dhakaDay, eachDay, isIsoDay, parseWhen, tenureRange } from './shared/domain/dhaka-time';

describe('dhaka time', () => {
  it('a Dhaka day starts at 18:00 UTC the previous day', () => {
    const r = dayRange('2026-09-29');
    expect(r.start.toISOString()).toBe('2026-09-28T18:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-09-29T18:00:00.000Z');
  });

  it('maps instants to the Dhaka calendar day', () => {
    expect(dhakaDay(new Date('2026-09-28T17:59:59Z'))).toBe('2026-09-28');
    expect(dhakaDay(new Date('2026-09-28T18:00:00Z'))).toBe('2026-09-29');
  });

  it('month and year ranges roll over correctly', () => {
    expect(tenureRange('month', '2026-12-15').end.toISOString()).toBe('2026-12-31T18:00:00.000Z');
    expect(tenureRange('year', '2026-03-01').start.toISOString()).toBe('2025-12-31T18:00:00.000Z');
  });

  it('validates days and parses "when" inputs', () => {
    expect(isIsoDay('2026-02-30')).toBe(false);
    expect(isIsoDay('2026-02-28')).toBe(true);
    expect(parseWhen('2026-09-29')?.toISOString()).toBe('2026-09-29T06:00:00.000Z');
    expect(parseWhen('yesterday')).toBeNull();
    expect(eachDay('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });
});

describe('cash math', () => {
  it('rolls day close: each opening is the previous closing', () => {
    const per = new Map([
      ['2026-09-01', { in: D(500), out: D(120) }],
      ['2026-09-03', { in: D(0), out: D(80) }],
    ]);
    const rows = rollDays(['2026-09-01', '2026-09-02', '2026-09-03'], 1000, per).map((r) => [r.day, r.opening.toNumber(), r.in.toNumber(), r.out.toNumber(), r.closing.toNumber()]);
    expect(rows).toEqual([
      ['2026-09-01', 1000, 500, 120, 1380],
      ['2026-09-02', 1380, 0, 0, 1380],
      ['2026-09-03', 1380, 0, 80, 1300],
    ]);
  });

  it('signs and reverses', () => {
    expect(signed('OUT', 50).toNumber()).toBe(-50);
    expect(opposite('IN')).toBe('OUT');
  });

  it('routes payment methods to accounts', () => {
    expect(accountForMethod('SSLCOMMERZ')).toBe('sslcommerz');
    expect(accountForMethod('COD')).toBe('cash');
    expect(accountForMethod('BKASH')).toBe('bkash');
    expect(accountForMethod('BANK_TRANSFER')).toBe('bank');
  });

  it('expenses only go out, capital only comes in', () => {
    expect(kindAllowsDirection('EXPENSE', 'IN')).toBe(false);
    expect(kindAllowsDirection('OWNER_CAPITAL', 'OUT')).toBe(false);
    expect(kindAllowsDirection('MANUAL', 'IN')).toBe(true);
  });
});

describe('purchase math', () => {
  it('totals match the DB checks', () => {
    const t = purchaseTotals([{ productId: 'a', quantity: 3, unitCost: 33.335 }, { productId: 'b', quantity: 1, unitCost: 10 }], 25);
    expect(t.lines[0].unitCost.toString()).toBe('33.34');
    expect(t.lines[0].lineTotal.toString()).toBe('100.02');
    expect(t.subtotal.toString()).toBe('110.02');
    expect(t.total.toString()).toBe('135.02');
  });

  it('merges repeated products', () => {
    expect(mergeLines([{ productId: 'a', quantity: 1, unitCost: 5 }, { productId: 'a', quantity: 2, unitCost: 6 }])).toEqual([{ productId: 'a', quantity: 3, unitCost: 6 }]);
  });

  it('settlement status and payment checks', () => {
    expect(settlementStatus(100, 0)).toBe('UNPAID');
    expect(settlementStatus(100, 40)).toBe('PARTIAL');
    expect(settlementStatus(100, 100)).toBe('PAID');
    expect(outstanding(100, 140).toNumber()).toBe(0);
    expect(checkPayment(100, 40, 60)).toEqual({ ok: true });
    expect(checkPayment(100, 40, 61)).toMatchObject({ ok: false, code: 'purchase.overpayment' });
    expect(checkPayment(100, 100, 1)).toMatchObject({ ok: false, code: 'purchase.already_paid' });
  });
});

describe('csv', () => {
  it('escapes, neutralises formulas and adds a BOM', () => {
    const out = toCsv(['a', 'b'], [['x,y', '=SUM(A1)'], [-5, 'he said "hi"']]);
    expect(out.startsWith('﻿a,b\r\n')).toBe(true);
    expect(out).toContain('"x,y",\'=SUM(A1)');
    expect(out).toContain('-5,"he said ""hi"""');
  });
});

describe('bangla formatting + document html', () => {
  it('formats money with Indian grouping and Bangla digits', () => {
    expect(bnMoney(1234567)).toBe('১২,৩৪,৫৬৭');
    expect(bnTaka('620.5')).toBe('৳৬২০.৫০');
  });

  const paper: PrintableDocument = {
    kind: 'CREDIT_NOTE',
    docNo: 'CRN-000001',
    orderNo: 'CLO-2041',
    issuedAt: new Date('2026-09-29T06:00:00Z'),
    paymentLabel: 'ক্যাশ অন ডেলিভারি',
    paymentMethod: 'COD',
    customerName: '<script>alert(1)</script>',
    customerPhone: '+8801711111111',
    address: 'ঢাকা',
    lines: [{ kind: 'PRODUCT', id: 'p', title: 'হিমু', sectionCode: 'book', categoryName: null, qty: 1, unitPrice: '560.00', unitCost: '400.00', discount: '0.00', lineTotal: '560.00' }],
    subtotal: 560,
    couponCode: null,
    discount: 0,
    shippingFee: 60,
    taxTotal: 0,
    total: 620,
    gatewayFee: 0,
    reason: 'কাস্টমার বাতিল',
    courierLoss: 60,
    reverseCourier: false,
    creditsDocNo: 'INV-000001',
  };

  it('renders a printable Bangla credit note and escapes user text', () => {
    const html = renderDocumentHtml(paper);
    expect(html).toContain('ক্রেডিট নোট');
    expect(html).toContain('৳৬২০');
    expect(html).toContain('কুরিয়ার লস ৳৬০');
    expect(html).toContain('INV-000001');
    expect(html).not.toContain('<script>alert');
    expect(escapeHtml(`a&"'<>`)).toBe('a&amp;&quot;&#39;&lt;&gt;');
  });

  it('COD invoice explains that it is not a receipt', () => {
    expect(renderDocumentHtml({ ...paper, kind: 'INVOICE' })).toContain('এটা রিসিট নয়');
  });
});
