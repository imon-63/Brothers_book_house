import { checkReorder, isLive, parseSetting, resolveSettings } from './store-settings';

describe('store settings', () => {
  it('validates known keys and rejects unknown', () => {
    expect(parseSetting('gateway_fee_pct', 2.2)).toEqual({ ok: true, value: 2.2 });
    expect(parseSetting('gateway_fee_pct', 20).ok).toBe(false);
    expect(parseSetting('order_prefix', 'CLO-')).toEqual({ ok: true, value: 'CLO-' });
    expect(parseSetting('order_prefix', 'clo').ok).toBe(false);
    expect(parseSetting('nope', 1)).toMatchObject({ ok: false });
  });

  it('normalises the helpline to E.164', () => {
    expect(parseSetting('helpline', '01711-111111')).toEqual({ ok: true, value: '+8801711111111' });
    expect(parseSetting('helpline', '123').ok).toBe(false);
  });

  it('resolves defaults, stored values and public subset', () => {
    const all = resolveSettings([{ key: 'store_name', value: 'চলো বাজার' }, { key: 'default_low_stock_threshold', value: 'bad' }]);
    expect(all.store_name).toBe('চলো বাজার');
    expect(all.default_low_stock_threshold).toBe(5);
    const pub = resolveSettings([], true);
    expect(pub).toHaveProperty('helpline');
    expect(pub).not.toHaveProperty('gateway_fee_pct');
  });
});

describe('isLive & reorder', () => {
  const now = new Date('2026-09-29T00:00:00Z');
  it('schedule window', () => {
    expect(isLive({ isActive: true, startsAt: null, endsAt: null }, now)).toBe(true);
    expect(isLive({ isActive: false, startsAt: null, endsAt: null }, now)).toBe(false);
    expect(isLive({ isActive: true, startsAt: new Date('2026-10-01'), endsAt: null }, now)).toBe(false);
    expect(isLive({ isActive: true, startsAt: null, endsAt: new Date('2026-09-28') }, now)).toBe(false);
  });
  it('reorder must be a permutation', () => {
    expect(checkReorder(['a', 'b'], ['b', 'a'])).toBeNull();
    expect(checkReorder(['a', 'b'], ['a'])).not.toBeNull();
    expect(checkReorder(['a', 'b'], ['a', 'a'])).not.toBeNull();
  });
});
