import { buildTimeline, type TimelineInput } from './order-timeline';

const at = (h: number) => new Date(Date.UTC(2026, 8, 29, h));
const base: TimelineInput = { status: 'PENDING', cancelledFrom: null, placedAt: at(1), cancelledAt: null, history: [{ toStatus: 'PENDING', at: at(1) }] };

describe('customer timeline', () => {
  it('pending: every step waits', () => {
    const t = buildTimeline(base);
    expect(t.kind).toBe('hold');
    expect(t.chip).toBe('অপেক্ষমাণ');
    expect(t.steps.slice(0, 5).every((s) => s.state === 'wait')).toBe(true);
    expect(t.steps).toHaveLength(6);
  });

  it('in transit: earlier steps done, current is now', () => {
    const t = buildTimeline({
      ...base,
      status: 'HANDED_TO_COURIER',
      history: [...base.history, { toStatus: 'CONFIRMED', at: at(2) }, { toStatus: 'HANDED_TO_COURIER', at: at(4) }],
    });
    expect(t.steps.map((s) => s.state)).toEqual(['done', 'done', 'now', 'wait', 'wait', 'wait']);
    expect(t.steps[0].at).toEqual(at(2));
    expect(t.steps[2].at).toEqual(at(4));
    expect(t.title).toBe('কুরিয়ারে তোলা হয়েছে');
    expect(t.kind).toBe('live');
  });

  it('delivered ends as done', () => {
    const t = buildTimeline({ ...base, status: 'DELIVERED' });
    expect(t.steps[4].state).toBe('done');
    expect(t.kind).toBe('ok');
    expect(t.chip).toBe('সম্পন্ন');
  });

  it('cancelled after processing shows reached steps and skips the rest', () => {
    const t = buildTimeline({ ...base, status: 'CANCELLED', cancelledFrom: 'PROCESSING', cancelledAt: at(5) });
    expect(t.steps.map((s) => s.state)).toEqual(['done', 'done', 'skip', 'skip', 'skip', 'cancel']);
    expect(t.steps[5].at).toEqual(at(5));
    expect(t.kind).toBe('dead');
  });

  it('cancelled while pending: nothing done', () => {
    const t = buildTimeline({ ...base, status: 'CANCELLED', cancelledFrom: 'PENDING', cancelledAt: at(2) });
    expect(t.steps.slice(0, 5).every((s) => s.state === 'skip')).toBe(true);
  });

  it('returned uses the return wording', () => {
    const t = buildTimeline({ ...base, status: 'RETURNED', cancelledFrom: 'DELIVERED', cancelledAt: at(9) });
    expect(t.chip).toBe('ফেরত');
    expect(t.steps[4].state).toBe('done');
  });
});
