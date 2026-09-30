import type { OrderStatus, PaymentMethod } from '@prisma/client';
import { planBooks, reverseCourier, type BooksState } from './document-policy';

const base = (over: Partial<BooksState> = {}): BooksState => ({
  method: 'COD',
  status: 'PENDING',
  cancelledFrom: null,
  paid: false,
  liveInvoice: false,
  receipt: false,
  codCashBooked: false,
  ...over,
});

describe('planBooks — COD', () => {
  it('pending order gets nothing', () => {
    expect(planBooks(base())).toEqual({ invoice: false, receipt: false, credit: null, codCashIn: false });
  });

  it('confirm → invoice only (receipt waits for delivery)', () => {
    const p = planBooks(base({ status: 'CONFIRMED' }));
    expect(p.invoice).toBe(true);
    expect(p.receipt).toBe(false);
    expect(p.codCashIn).toBe(false);
  });

  it('delivered → receipt + cash in (invoice already there)', () => {
    const p = planBooks(base({ status: 'DELIVERED', liveInvoice: true }));
    expect(p).toEqual({ invoice: false, receipt: true, credit: null, codCashIn: true });
  });

  it('marked paid before delivery → receipt + cash in', () => {
    const p = planBooks(base({ status: 'PROCESSING', liveInvoice: true, paid: true }));
    expect(p.receipt).toBe(true);
    expect(p.codCashIn).toBe(true);
  });

  it('jumping straight from pending to delivered issues invoice AND receipt', () => {
    const p = planBooks(base({ status: 'DELIVERED' }));
    expect(p.invoice && p.receipt && p.codCashIn).toBe(true);
  });

  it('is idempotent: nothing more once every paper exists', () => {
    const p = planBooks(base({ status: 'DELIVERED', liveInvoice: true, receipt: true, codCashBooked: true }));
    expect(p).toEqual({ invoice: false, receipt: false, credit: null, codCashIn: false });
  });

  it('never issues a second invoice for a live order', () => {
    for (const status of ['CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER', 'OUT_FOR_DELIVERY', 'DELIVERED'] as OrderStatus[]) {
      expect(planBooks(base({ status, liveInvoice: true })).invoice).toBe(false);
    }
  });

  it('cancelling a pending order issues no credit note', () => {
    expect(planBooks(base({ status: 'CANCELLED', cancelledFrom: 'PENDING' })).credit).toBeNull();
  });

  it('cancel before courier → credit note reversing courier cost', () => {
    const p = planBooks(base({ status: 'CANCELLED', cancelledFrom: 'PROCESSING', liveInvoice: true }));
    expect(p.credit).toEqual({ reverseCourier: true });
    expect(p.invoice).toBe(false);
  });

  it('cancel after handing to courier keeps the courier cost', () => {
    const p = planBooks(base({ status: 'CANCELLED', cancelledFrom: 'OUT_FOR_DELIVERY', liveInvoice: true }));
    expect(p.credit).toEqual({ reverseCourier: false });
  });

  it('returned orders always keep the courier cost', () => {
    expect(planBooks(base({ status: 'RETURNED', liveInvoice: true })).credit).toEqual({ reverseCourier: false });
  });

  it('uses the event hint when cancelled_from is missing', () => {
    expect(planBooks(base({ status: 'CANCELLED', liveInvoice: true }), { from: 'HANDED_TO_COURIER' }).credit).toEqual({ reverseCourier: false });
  });

  it('second cancel event does not issue a second credit note', () => {
    // after the credit note the invoice is no longer live
    expect(planBooks(base({ status: 'CANCELLED', cancelledFrom: 'CONFIRMED', liveInvoice: false })).credit).toBeNull();
  });

  it('re-opened order after a credit note is billed again', () => {
    expect(planBooks(base({ status: 'CONFIRMED', liveInvoice: false })).invoice).toBe(true);
  });
});

describe('planBooks — prepaid (SSLCOMMERZ …)', () => {
  const ssl = (over: Partial<BooksState>) => base({ method: 'SSLCOMMERZ', ...over });

  it('paid + confirmed → invoice and receipt together, no COD cash', () => {
    expect(planBooks(ssl({ status: 'CONFIRMED', paid: true }))).toEqual({ invoice: true, receipt: true, credit: null, codCashIn: false });
  });

  it('paid but still pending → wait for confirm', () => {
    expect(planBooks(ssl({ status: 'PENDING', paid: true }))).toEqual({ invoice: false, receipt: false, credit: null, codCashIn: false });
  });

  it('confirmed but not yet paid → invoice only; receipt when payment lands', () => {
    expect(planBooks(ssl({ status: 'CONFIRMED' })).receipt).toBe(false);
    expect(planBooks(ssl({ status: 'CONFIRMED', liveInvoice: true, paid: true })).receipt).toBe(true);
  });

  it('delivery alone is not money for a prepaid order', () => {
    expect(planBooks(ssl({ status: 'DELIVERED', liveInvoice: true })).receipt).toBe(false);
  });

  it.each<PaymentMethod>(['BKASH', 'NAGAD', 'BANK_TRANSFER'])('%s behaves as prepaid', (method) => {
    expect(planBooks(base({ method, status: 'DELIVERED', liveInvoice: true })).codCashIn).toBe(false);
  });
});

describe('reverseCourier', () => {
  it.each<[OrderStatus, OrderStatus | null, boolean]>([
    ['CANCELLED', 'CONFIRMED', true],
    ['CANCELLED', 'PROCESSING', true],
    ['CANCELLED', 'HANDED_TO_COURIER', false],
    ['CANCELLED', 'DELIVERED', false],
    ['CANCELLED', null, true],
    ['RETURNED', 'DELIVERED', false],
  ])('%s from %s → %s', (status, from, expected) => {
    expect(reverseCourier(status, from)).toBe(expected);
  });
});
