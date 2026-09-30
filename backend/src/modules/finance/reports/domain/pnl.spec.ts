import type { DocLine } from '../../documents/domain/document-snapshot';
import { categoryRows, catRowView, courierDue, grossOf, netOf, pnlFor, pnlView, type PnlDoc } from './pnl';

const line = (over: Partial<DocLine> = {}): DocLine => ({
  kind: 'PRODUCT',
  id: 'p1',
  title: 'বই',
  sectionCode: 'book',
  categoryName: 'উপন্যাস',
  qty: 2,
  unitPrice: '250.00',
  unitCost: '150.00',
  discount: '0.00',
  lineTotal: '500.00',
  ...over,
});

const doc = (over: Partial<PnlDoc> = {}): PnlDoc => ({
  kind: 'INVOICE',
  lines: [line()],
  discount: 50,
  shippingFee: 60,
  shippingCost: 70,
  gatewayFee: 12,
  courierLoss: null,
  reverseCourier: false,
  ...over,
});

describe('pnlFor (port of frontend pnlFor)', () => {
  it('sums an invoice', () => {
    const v = pnlView(pnlFor([doc()]));
    expect(v).toMatchObject({ sales: 500, coupon: 50, cogs: 300, gross: 150, deliveryIncome: 60, courierCost: 70, gatewayFee: 12, net: 128, invoices: 1, creditNotes: 0, skipped: 0 });
    expect(v.marginPct).toBe(30);
  });

  it('a credit note before shipping cancels the sale and the courier cost', () => {
    const p = pnlFor([doc(), doc({ kind: 'CREDIT_NOTE', reverseCourier: true, courierLoss: 0 })]);
    expect(pnlView(p)).toMatchObject({ sales: 0, coupon: 0, cogs: 0, deliveryIncome: 0, courierCost: 0, gatewayFee: 0, courierLoss: 0, net: 0, invoices: 1, creditNotes: 1 });
  });

  it('a credit note after shipping keeps courier cost and adds courier loss', () => {
    const p = pnlFor([doc(), doc({ kind: 'CREDIT_NOTE', reverseCourier: false, courierLoss: 40, gatewayFee: 0 })]);
    expect(p.courier.toNumber()).toBe(70);
    expect(p.courierLoss.toNumber()).toBe(40);
    expect(netOf(p).toNumber()).toBe(-70 - 12 - 40);
  });

  it('skips papers without a full cost snapshot and counts them', () => {
    const p = pnlFor([doc(), doc({ lines: [line(), line({ unitCost: null })] }), doc({ lines: [] })]);
    expect(p.invoices).toBe(3);
    expect(p.skipped).toBe(2);
    expect(p.sales.toNumber()).toBe(500);
  });

  it('ignores receipts (cash, not revenue)', () => {
    const p = pnlFor([doc({ kind: 'RECEIPT' })]);
    expect(p.invoices + p.credits).toBe(0);
    expect(grossOf(p).toNumber()).toBe(0);
  });

  it('never drifts with decimals', () => {
    const docs = Array.from({ length: 10 }, () => doc({ lines: [line({ qty: 1, unitPrice: '0.10', unitCost: '0.20' })], discount: 0, shippingFee: 0, shippingCost: 0, gatewayFee: 0 }));
    expect(pnlFor(docs).sales.toString()).toBe('1');
  });
});

describe('categoryRows', () => {
  it('groups by category and nets credit notes', () => {
    const docs = [
      doc({ lines: [line(), line({ id: 'p2', categoryName: 'বিজ্ঞান', unitPrice: '100.00', unitCost: '60.00', qty: 1 })] }),
      doc({ kind: 'CREDIT_NOTE', lines: [line({ qty: 1 })] }),
    ];
    const rows = categoryRows(docs).map(catRowView);
    expect(rows).toEqual([
      { category: 'উপন্যাস', qty: 1, sales: 250, cogs: 150, gross: 100, marginPct: 40 },
      { category: 'বিজ্ঞান', qty: 1, sales: 100, cogs: 60, gross: 40, marginPct: 40 },
    ]);
  });

  it('splits a bundle over its components by allocated revenue', () => {
    const bundle = line({
      kind: 'BUNDLE',
      id: 'b1',
      qty: 1,
      unitPrice: '900.00',
      unitCost: '500.00',
      components: [
        { productId: 'a', title: 'A', categoryName: 'গণিত', qty: 1, unitCost: '300.00', allocatedRevenue: '600.00' },
        { productId: 'b', title: 'B', categoryName: 'পদার্থ', qty: 1, unitCost: '200.00', allocatedRevenue: '300.00' },
      ],
    });
    const rows = categoryRows([doc({ lines: [bundle] })]).map(catRowView);
    expect(rows.find((r) => r.category === 'গণিত')).toMatchObject({ sales: 600, cogs: 300 });
    expect(rows.find((r) => r.category === 'পদার্থ')).toMatchObject({ sales: 300, cogs: 200 });
  });

  it('a bundle without components goes to প্যাকেজ; missing category → অন্যান্য', () => {
    const rows = categoryRows([doc({ lines: [line({ kind: 'BUNDLE', components: [] }), line({ categoryName: null })] })]).map((r) => r.category);
    expect(rows.sort()).toEqual(['অন্যান্য', 'প্যাকেজ'].sort());
  });
});

describe('courierDue', () => {
  it('accrues invoices, reverses unshipped credit notes, subtracts payments, floors at 0', () => {
    const docs = [doc(), doc(), doc({ kind: 'CREDIT_NOTE', reverseCourier: true }), doc({ kind: 'CREDIT_NOTE', reverseCourier: false })];
    expect(courierDue(docs, 30).toNumber()).toBe(40);
    expect(courierDue(docs, 500).toNumber()).toBe(0);
  });
});
