import { buildPickList, type PickOrderInput } from './pick-list';

const o = (orderNo: string, items: PickOrderInput['items']): PickOrderInput => ({ orderNo, contactName: 'রাফি', contactPhone: '+8801711111111', address: 'ঢাকা', items });

describe('pick list', () => {
  it('groups products across orders and expands bundles', () => {
    const list = buildPickList(
      [
        o('CLO-1', [{ kind: 'PRODUCT', productId: 'a', title: 'বই A', quantity: 2, components: [] }]),
        o('CLO-2', [
          { kind: 'PRODUCT', productId: 'a', title: 'বই A', quantity: 1, components: [] },
          { kind: 'BUNDLE', productId: null, title: 'প্যাক', quantity: 2, components: [{ productId: 'a', title: 'বই A', quantity: 2 }, { productId: 'b', title: 'বই B', quantity: 2 }] },
        ]),
      ],
      new Map([
        ['a', { stockOnHand: 4, stockReserved: 5, sku: 'A1' }],
        ['b', { stockOnHand: 10, stockReserved: 2 }],
      ]),
    );
    expect(list.groups[0]).toMatchObject({ productId: 'a', quantity: 5, orders: ['CLO-1', 'CLO-2'], viaBundles: ['প্যাক'], shortfall: 1, sku: 'A1' });
    expect(list.groups[1]).toMatchObject({ productId: 'b', quantity: 2, shortfall: 0 });
    expect(list.units).toBe(7);
    expect(list.shortCount).toBe(1);
    expect(list.orders).toHaveLength(2);
  });

  it('unknown stock never reports a shortfall', () => {
    const list = buildPickList([o('CLO-1', [{ kind: 'PRODUCT', productId: 'x', title: 'X', quantity: 3, components: [] }])], new Map());
    expect(list.groups[0]).toMatchObject({ stockOnHand: null, shortfall: 0 });
  });
});
