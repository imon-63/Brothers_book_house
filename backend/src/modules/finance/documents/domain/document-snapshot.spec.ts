import { addressLine, buildLines, gatewayFeeFor, lineUnitCost, type SnapshotItem } from './document-snapshot';

const product = (over: Partial<SnapshotItem> = {}): SnapshotItem => ({
  kind: 'PRODUCT',
  productId: 'p1',
  bundleId: null,
  title: 'হিমু',
  sectionCode: 'book',
  categoryName: 'উপন্যাস',
  quantity: 2,
  unitPrice: 250,
  unitCost: 180,
  discount: 0,
  lineTotal: 500,
  components: [],
  ...over,
});

describe('document snapshot', () => {
  it('stores money as 2dp strings and keeps unknown cost as null', () => {
    const [l] = buildLines([product({ unitCost: null })]);
    expect(l).toMatchObject({ kind: 'PRODUCT', id: 'p1', qty: 2, unitPrice: '250.00', unitCost: null, lineTotal: '500.00' });
  });

  it('costs a bundle from its components when it has no own cost', () => {
    const bundle = product({
      kind: 'BUNDLE',
      productId: null,
      bundleId: 'b1',
      quantity: 2,
      unitCost: null,
      components: [
        { productId: 'a', title: 'A', categoryName: 'X', quantity: 2, unitCost: 100, allocatedRevenue: 300 },
        { productId: 'b', title: 'B', categoryName: 'Y', quantity: 2, unitCost: 50.5, allocatedRevenue: 200 },
      ],
    });
    expect(lineUnitCost(bundle)).toBe('150.50');
    const [l] = buildLines([bundle]);
    expect(l.id).toBe('b1');
    expect(l.components).toHaveLength(2);
  });

  it('bundle cost is unknown if any component cost is unknown', () => {
    expect(
      lineUnitCost(product({ kind: 'BUNDLE', unitCost: null, components: [{ productId: 'a', title: 'A', categoryName: null, quantity: 1, unitCost: null, allocatedRevenue: 1 }] })),
    ).toBeNull();
  });

  it('address follows the storefront order (line, union, upazila, district, division)', () => {
    expect(addressLine({ shipLine: 'পূর্ব তুমুলিয়া', shipUnion: 'তুমুলিয়া', shipUpazila: 'কালীগঞ্জ', shipDistrict: 'গাজীপুর', shipDivision: 'ঢাকা' })).toBe(
      'পূর্ব তুমুলিয়া, তুমুলিয়া, কালীগঞ্জ, গাজীপুর, ঢাকা',
    );
    expect(addressLine({ shipLine: 'Road 1', shipUnion: null, shipUpazila: '', shipDistrict: 'ঢাকা', shipDivision: 'ঢাকা' })).toBe('Road 1, ঢাকা, ঢাকা');
  });

  describe('gatewayFeeFor', () => {
    it('uses the real fees when payments are known', () => expect(gatewayFeeFor('SSLCOMMERZ', 1000, ['25.00', '1.5'], 2.5)).toBe('26.50'));
    it('falls back to the fee % setting', () => expect(gatewayFeeFor('SSLCOMMERZ', 1000, [], 2.5)).toBe('25.00'));
    it('non-gateway methods carry no fee', () => expect(gatewayFeeFor('COD', 1000, [], 2.5)).toBe('0.00'));
  });
});
