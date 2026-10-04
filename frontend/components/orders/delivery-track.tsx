import { bn, localPhone } from "@/lib/format";

/*
 * Order timeline cards — rendered from the API's `timeline` block
 * (/me/orders/:no, /orders/track). The API decides the steps and states;
 * this file only maps them onto the existing design.
 */

export type TimelineStep = { status: string; label: string; hint: string; state: "done" | "now" | "wait" | "skip" | "cancel" | string; at: string | null };
export type TrackOrder = {
  orderNo: string;
  status: string;
  placedAt: string;
  grandTotal: number;
  paymentMethod: string;
  paid: boolean;
  name?: string;
  phone?: string;
  address?: string;
  items: { title: string; quantity: number; kind?: string; unitPrice?: number; lineTotal?: number }[];
  money?: { itemsSubtotal: number; discountTotal: number; couponCode: string | null; shippingFee: number; grandTotal: number } | null;
  shipment?: { courier: string; trackingNo: string | null; trackingUrl: string | null } | null;
  timeline?: { title: string; sub: string; chip: string; kind: string; steps: TimelineStep[] } | null;
  canCancel?: boolean;
};

const IMG: Record<string, string> = {
  CONFIRMED: "/icons/step-placed.svg",
  PROCESSING: "/icons/step-process.svg",
  HANDED_TO_COURIER: "/icons/step-courier.svg",
  OUT_FOR_DELIVERY: "/icons/step-way.svg",
  DELIVERED: "/icons/step-done.svg",
  CANCELLED: "/icons/step-cancel.svg",
  RETURNED: "/icons/step-cancel.svg",
};

/** Normalise /me/orders/:no or /orders/track rows into one shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toTrackOrder(o: any): TrackOrder {
  return {
    orderNo: o.orderNo,
    status: o.status,
    placedAt: o.placedAt,
    grandTotal: Number(o.grandTotal ?? o.money?.grandTotal ?? 0),
    paymentMethod: o.paymentMethod,
    paid: o.paid ?? (o.paymentStatus ? o.paymentStatus !== "UNPAID" : false),
    name: o.contact?.name ?? o.customer ?? undefined,
    phone: o.contact?.phone ?? undefined,
    address: typeof o.address === "string" ? o.address : o.district ?? undefined,
    items: (o.items ?? []).map((i: { title: string; quantity: number; kind?: string; unitPrice?: number; lineTotal?: number }) => ({ title: i.title, quantity: i.quantity, kind: i.kind, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    money: o.money ?? null,
    shipment: o.shipment ?? null,
    timeline: o.timeline ?? null,
    canCancel: o.canCancel,
  };
}

function payName(m: string) {
  return m === "COD" ? "ক্যাশ অন ডেলিভারি" : m === "SSLCOMMERZ" ? "SSLCOMMERZ" : m;
}

export function orderGlance(order: TrackOrder) {
  const dead = order.status === "CANCELLED" || order.status === "RETURNED";
  const pending = order.status === "PENDING";
  const delivered = order.status === "DELIVERED";
  const t = order.timeline;
  const steps = t?.steps ?? [];
  const nowStep = [...steps].reverse().find((x) => x.state === "done" || x.state === "now");
  const title = t?.title ?? (dead ? "অর্ডার বাতিল" : pending ? "অ্যাডমিন কনফার্মের অপেক্ষায়" : nowStep?.label ?? "অর্ডার");
  const sub = t?.sub ?? "";
  const head = dead ? "cancel" : pending ? "hold" : delivered ? "done" : "";
  const chip = t?.chip ?? (dead ? "বাতিল" : pending ? "অপেক্ষমাণ" : delivered ? "সম্পন্ন" : "চলমান");
  const kind = dead ? "dead" : pending ? "hold" : delivered ? "ok" : "live";
  const icon = dead ? IMG.CANCELLED : IMG[nowStep?.status ?? "CONFIRMED"] ?? IMG.CONFIRMED;
  const flow = steps.map((step) => {
    const isCancel = step.status === "CANCELLED" || step.status === "RETURNED";
    let cls = step.state;
    if (isCancel) cls = dead ? "cancel now" : "cancel wait";
    else if (step.state === "now" && delivered) cls = "done now end";
    else if (step.state === "done" && delivered && step.status === "DELIVERED") cls = "done now end";
    return { label: step.label, hint: step.hint, cls, img: IMG[step.status] ?? IMG.CONFIRMED };
  });
  return { title, sub, head, chip, kind, icon, flow };
}

export function OrderSteps({ order }: { order: TrackOrder }) {
  const g = orderGlance(order);
  const live = g.flow.filter((x) => !x.cls.startsWith("cancel"));
  const reached = live.reduce((n, x, i) => (/(^|\s)(done|now)(\s|$)/.test(x.cls) ? i + 1 : n), 0);
  const pct = live.length ? Math.round((reached / live.length) * 100) : 0;
  return (
    <>
      {live.length > 1 ? (
        <div className={`sf-trackbar ${g.kind}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="ডেলিভারির অগ্রগতি">
          <span className="sf-trackbar-fill" style={{ width: `${pct}%` }} />
          <small>{g.kind === "dead" ? "অর্ডার বাতিল" : `${bn(reached)} / ${bn(live.length)} ধাপ সম্পন্ন`}</small>
        </div>
      ) : null}
      <div className={`track-head ${g.head}`}>
        <div><b>{g.title}</b><span>{order.orderNo} · {g.sub}</span></div>
        <i className="track-chip">{g.chip}</i>
      </div>
      <div className="steps">
        {g.flow.map((step) => (
          <div className={`step ${step.cls}`} key={step.label}>
            <i className="node"><img src={step.img} alt="" /></i>
            <div className="step-body"><b>{step.label}</b><div className="sub">{step.hint}</div></div>
          </div>
        ))}
      </div>
    </>
  );
}

export function OrderFacts({ order, mode }: { order: TrackOrder; mode: "user" | "done" }) {
  const payNote = order.paid ? " · পরিশোধ সম্পন্ন ✓" : order.paymentMethod === "COD" ? " · ডেলিভারিতে পরিশোধ" : " · পরিশোধ বাকি";
  const items = order.items.map((i) => `${i.title} × ${bn(i.quantity)}`).join(", ");
  return (
    <div className="ord-facts">
      {mode !== "user" && order.name ? <span><i>নাম</i>{order.name}</span> : null}
      {order.phone ? <span><i>ফোন</i>{localPhone(order.phone)}</span> : null}
      {order.address ? <span><i>ঠিকানা</i>{order.address}</span> : null}
      <span><i>পণ্য</i>{items || "—"}</span>
      {order.paymentMethod ? <span><i>পেমেন্ট</i>{payName(order.paymentMethod)}{payNote}</span> : null}
      {order.shipment ? <span><i>কুরিয়ার</i>{order.shipment.courier}{order.shipment.trackingNo ? <> · {order.shipment.trackingUrl ? <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">{order.shipment.trackingNo}</a> : order.shipment.trackingNo}</> : null}</span> : null}
    </div>
  );
}

function payState(order: TrackOrder) {
  if (order.paid) return { cls: "paid", text: "পরিশোধ সম্পন্ন" };
  if (order.status === "CANCELLED" || order.status === "RETURNED") return { cls: "void", text: "পরিশোধ নেই" };
  return order.paymentMethod === "COD" ? { cls: "cod", text: "ডেলিভারিতে পরিশোধ" } : { cls: "due", text: "পরিশোধ বাকি" };
}

function placedWhen(at: string) {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("bn-BD", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const TICK = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
);

/** Public tracker / done page — compact bill + delivery steps. */
export function DeliveryTrack({ order }: { order: TrackOrder }) {
  const m = order.money;
  const pay = payState(order);
  const qty = order.items.reduce((n, i) => n + i.quantity, 0);
  const shipTxt = m == null ? null : m.shippingFee > 0 ? `৳${bn(m.shippingFee)}` : "ফ্রি";
  const facts = [
    order.name ? { k: "নাম", v: order.name } : null,
    order.phone ? { k: "ফোন", v: localPhone(order.phone) } : null,
    order.address ? { k: "এলাকা", v: order.address } : null,
    { k: "পেমেন্ট", v: payName(order.paymentMethod) },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <article className="track-card dt">
      <header className="dt-head">
        <div className="dt-id">
          <small>অর্ডার আইডি</small>
          <b>{order.orderNo}</b>
          <span>{placedWhen(order.placedAt)}</span>
        </div>
        <div className="dt-sum">
          <small>মোট</small>
          <b>৳{bn(order.grandTotal)}</b>
          <span className={`dt-pay ${pay.cls}`}>{pay.cls === "paid" ? TICK : <i />}{pay.text}</span>
        </div>
      </header>

      <OrderSteps order={order} />

      <dl className="dt-facts">
        {facts.map((f) => (
          <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>
        ))}
        {order.shipment ? (
          <div className="wide">
            <dt>কুরিয়ার</dt>
            <dd>
              {order.shipment.courier}
              {order.shipment.trackingNo ? <> · {order.shipment.trackingUrl ? <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">{order.shipment.trackingNo} ↗</a> : order.shipment.trackingNo}</> : null}
            </dd>
          </div>
        ) : null}
      </dl>

      <section className="dt-bill" aria-label={`ইনভয়েস ${order.orderNo}`}>
        <div className="dt-bill-head"><b>ইনভয়েস</b><small>{bn(order.items.length)}টি পণ্য · {bn(qty)} কপি</small></div>
        <ul className="dt-lines">
          {order.items.map((line, i) => (
            <li key={`${line.title}-${i}`}>
              <span className="dt-q">{bn(line.quantity)}×</span>
              <span className="dt-t">
                {line.title}
                {line.kind === "BUNDLE" ? <em>প্যাকেজ</em> : null}
                {line.unitPrice != null && line.quantity > 1 ? <small>৳{bn(line.unitPrice)} করে</small> : null}
              </span>
              <span className="dt-a">{line.lineTotal != null ? `৳${bn(line.lineTotal)}` : ""}</span>
            </li>
          ))}
        </ul>
        <div className="dt-totals">
          {m ? <p><span>সাবটোটাল</span><span>৳{bn(m.itemsSubtotal)}</span></p> : null}
          {m?.discountTotal ? <p className="off"><span>কুপন{m.couponCode ? ` · ${m.couponCode}` : ""}</span><span>−৳{bn(m.discountTotal)}</span></p> : null}
          {shipTxt ? <p><span>ডেলিভারি চার্জ</span><span>{shipTxt}</span></p> : null}
          <p className="grand"><span>সর্বমোট</span><span>৳{bn(order.grandTotal)}</span></p>
        </div>
      </section>
    </article>
  );
}
