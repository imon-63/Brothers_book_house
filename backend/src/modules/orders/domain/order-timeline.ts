import type { OrderStatus } from '@prisma/client';
import { rank } from './order-status';

/** Customer-facing tracker — mirrors the storefront's DeliveryTrack / orderGlance. */
const STEPS: { status: OrderStatus; label: string; sub: string }[] = [
  { status: 'CONFIRMED', label: 'অর্ডার নিশ্চিত', sub: 'অর্ডার গ্রহণ করা হয়েছে' },
  { status: 'PROCESSING', label: 'প্রস্তুত হচ্ছে', sub: 'পণ্য প্যাক করা হচ্ছে' },
  { status: 'HANDED_TO_COURIER', label: 'কুরিয়ারে তোলা হয়েছে', sub: 'কুরিয়ার পার্টনার নিয়েছে' },
  { status: 'OUT_FOR_DELIVERY', label: 'ডেলিভারিতে আছে', sub: 'আপনার ঠিকানার পথে' },
  { status: 'DELIVERED', label: 'ডেলিভারি সম্পন্ন', sub: 'পণ্য হস্তান্তর হয়েছে' },
];

export type TimelineInput = {
  status: OrderStatus;
  cancelledFrom: OrderStatus | null;
  placedAt: Date;
  cancelledAt: Date | null;
  history: { toStatus: OrderStatus; at: Date }[];
};

export type TimelineStep = { status: OrderStatus | 'CANCELLED'; label: string; hint: string; state: 'done' | 'now' | 'wait' | 'skip' | 'cancel'; at: Date | null };

export type Timeline = {
  title: string;
  sub: string;
  chip: string;
  kind: 'hold' | 'live' | 'ok' | 'dead';
  steps: TimelineStep[];
};

/** index into STEPS reached so far (−1 = still pending) */
function reached(t: TimelineInput): number {
  const dead = t.status === 'CANCELLED' || t.status === 'RETURNED';
  const s = dead ? (t.cancelledFrom ?? 'PENDING') : t.status;
  return Math.min(rank(s) - 1, STEPS.length - 1);
}

export function buildTimeline(t: TimelineInput): Timeline {
  const dead = t.status === 'CANCELLED' || t.status === 'RETURNED';
  const pending = t.status === 'PENDING';
  const cur = reached(t);
  const delivered = !dead && cur === STEPS.length - 1;
  const lastAt = (s: OrderStatus) => {
    for (let i = t.history.length - 1; i >= 0; i--) if (t.history[i].toStatus === s) return t.history[i].at;
    return null;
  };

  const steps: TimelineStep[] = STEPS.map((step, i) => {
    const at = lastAt(step.status);
    if (pending) return { status: step.status, label: step.label, hint: 'কনফার্মের পর এই ধাপ শুরু', state: 'wait', at: null };
    if (dead) {
      return i <= cur
        ? { status: step.status, label: step.label, hint: 'সম্পন্ন হয়েছিল', state: 'done', at }
        : { status: step.status, label: step.label, hint: 'বাতিলের কারণে হয়নি', state: 'skip', at: null };
    }
    if (i < cur) return { status: step.status, label: step.label, hint: 'সম্পন্ন', state: 'done', at };
    if (i === cur) return { status: step.status, label: step.label, hint: delivered ? 'ডেলিভারি সম্পন্ন' : 'বর্তমান অবস্থা', state: delivered ? 'done' : 'now', at };
    return { status: step.status, label: step.label, hint: step.sub, state: 'wait', at: null };
  });
  const deadLabel = t.status === 'RETURNED' ? 'অর্ডার ফেরত' : 'অর্ডার বাতিল';
  steps.push({
    status: 'CANCELLED',
    label: deadLabel,
    hint: dead ? (t.status === 'RETURNED' ? 'অর্ডার ফেরত এসেছে' : 'অর্ডার বাতিল করা হয়েছে') : 'বাতিল হলে এই ধাপে দেখাবে',
    state: dead ? 'cancel' : 'wait',
    at: dead ? t.cancelledAt : null,
  });

  return {
    title: dead ? deadLabel : pending ? 'অ্যাডমিন কনফার্মের অপেক্ষায়' : STEPS[cur].label,
    sub: dead
      ? 'বাকি ধাপগুলো হয়নি, তালিকায় থাকবে'
      : pending
        ? 'অর্ডার প্লেস হয়েছে। কনফার্ম হলে প্যাকিং ও কুরিয়ার শুরু হবে।'
        : delivered
          ? 'পণ্য পৌঁছেছে'
          : STEPS[cur].sub,
    chip: dead ? (t.status === 'RETURNED' ? 'ফেরত' : 'বাতিল') : pending ? 'অপেক্ষমাণ' : delivered ? 'সম্পন্ন' : 'চলমান',
    kind: dead ? 'dead' : pending ? 'hold' : delivered ? 'ok' : 'live',
    steps,
  };
}
