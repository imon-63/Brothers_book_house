import { decideReview, displayNameFor, summarize } from './review-rules';

const line = (id: string, day: number) => ({ orderItemId: id, orderId: `o-${id}`, deliveredAt: new Date(2026, 0, day) });

describe('decideReview', () => {
  it('verified on a delivered, unreviewed line (newest first)', () => {
    expect(decideReview({ blocked: false, delivered: [line('a', 1), line('b', 5)], existing: [] })).toEqual({ ok: true, verified: true, orderItemId: 'b', orderId: 'o-b' });
  });

  it('skips lines already reviewed', () => {
    expect(decideReview({ blocked: false, delivered: [line('a', 1), line('b', 5)], existing: [{ orderItemId: 'b' }] })).toMatchObject({ ok: true, orderItemId: 'a' });
  });

  it('one review per order item', () => {
    expect(decideReview({ blocked: false, delivered: [line('a', 1)], existing: [{ orderItemId: 'a' }] })).toMatchObject({ ok: false, code: 'review.already_reviewed' });
  });

  it('unverified allowed once without a delivered purchase', () => {
    expect(decideReview({ blocked: false, delivered: [], existing: [] })).toEqual({ ok: true, verified: false, orderItemId: null, orderId: null });
    expect(decideReview({ blocked: false, delivered: [], existing: [{ orderItemId: null }] })).toMatchObject({ ok: false, code: 'review.already_reviewed' });
  });

  it('a later delivery upgrades to verified even after an unverified review', () => {
    expect(decideReview({ blocked: false, delivered: [line('c', 3)], existing: [{ orderItemId: null }] })).toMatchObject({ ok: true, verified: true, orderItemId: 'c' });
  });

  it('blocked customers cannot review', () => {
    expect(decideReview({ blocked: true, delivered: [line('a', 1)], existing: [] })).toMatchObject({ ok: false, code: 'review.blocked' });
  });
});

describe('summarize', () => {
  it('average, breakdown and percent', () => {
    const s = summarize([{ rating: 5, count: 3 }, { rating: 4, count: 1 }]);
    expect(s.average).toBe(4.8);
    expect(s.count).toBe(4);
    expect(s.breakdown).toEqual({ 1: 0, 2: 0, 3: 0, 4: 1, 5: 3 });
    expect(s.percent[5]).toBe(75);
  });
  it('empty', () => {
    expect(summarize([])).toMatchObject({ average: 0, count: 0 });
  });
});

describe('displayNameFor', () => {
  it('shortens surname unless chosen', () => {
    expect(displayNameFor('নুসরাত জাহান')).toBe('নুসরাত জ.');
    expect(displayNameFor('Rafi')).toBe('Rafi');
    expect(displayNameFor('Rafi Ahmed', 'R. A.')).toBe('R. A.');
    expect(displayNameFor('  ')).toBe('ক্রেতা');
  });
});
