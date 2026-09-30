import { bn } from "@/lib/format";

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
  return (
    <>
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
  const payNote = order.paid ? " · পেয়েছি" : order.paymentMethod === "COD" ? " · বকেয়া" : "";
  const items = order.items.map((i) => `${i.title} × ${bn(i.quantity)}`).join(", ");
  return (
    <div className="ord-facts">
      {mode !== "user" && order.name ? <span><i>নাম</i>{order.name}</span> : null}
      {order.phone ? <span><i>ফোন</i>{order.phone}</span> : null}
      {order.address ? <span><i>ঠিকানা</i>{order.address}</span> : null}
      <span><i>পণ্য</i>{items || "—"}</span>
      {order.paymentMethod ? <span><i>পেমেন্ট</i>{payName(order.paymentMethod)}{payNote}</span> : null}
      {order.shipment ? <span><i>কুরিয়ার</i>{order.shipment.courier}{order.shipment.trackingNo ? <> · {order.shipment.trackingUrl ? <a href={order.shipment.trackingUrl} target="_blank" rel="noreferrer">{order.shipment.trackingNo}</a> : order.shipment.trackingNo}</> : null}</span> : null}
    </div>
  );
}

export function DeliveryTrack({ order }: { order: TrackOrder }) {
  const m = order.money;
  const shipTxt = m == null ? "—" : m.shippingFee > 0 ? `৳${bn(m.shippingFee)}` : "ফ্রি";
  const cols = 3;

  return (
    <div className="track-card">
      <div className="row total" style={{ border: 0, padding: 0, margin: "0 0 6px" }}>
        <span>{order.orderNo}</span><span>৳{bn(order.grandTotal)}</span>
      </div>
      <OrderFacts order={order} mode="done" />
      <div className="inv-paper">
        <h4>ইনভয়েস · {order.orderNo}</h4>
        <p className="muted">{order.name || "—"} · {payName(order.paymentMethod)} · {order.paid ? "টাকা পাওয়া গেছে" : order.paymentMethod === "COD" ? "COD · বকেয়া" : ""}</p>
        <table>
          <tbody>
            <tr><th>পণ্য</th><th>কপি</th><th>দাম</th><th>মোট</th></tr>
            {order.items.map((line, i) => (
              <tr key={`${line.title}-${i}`}>
                <td>{line.title}{line.kind === "BUNDLE" ? <span className="muted"> প্যাকেজ</span> : null}</td>
                <td>{bn(line.quantity)}</td>
                <td>{line.unitPrice != null ? `৳${bn(line.unitPrice)}` : "—"}</td>
                <td>{line.lineTotal != null ? `৳${bn(line.lineTotal)}` : "—"}</td>
              </tr>
            ))}
            {m ? <tr><td colSpan={cols}>সাবটোটাল</td><td>৳{bn(m.itemsSubtotal)}</td></tr> : null}
            {m?.discountTotal ? <tr><td colSpan={cols}>কুপন {m.couponCode || ""}</td><td>−৳{bn(m.discountTotal)}</td></tr> : null}
            <tr><td colSpan={cols}>কুরিয়ার</td><td>{shipTxt}</td></tr>
            <tr><td colSpan={cols}><b>কাস্টমার মোট</b></td><td><b>৳{bn(order.grandTotal)}</b></td></tr>
          </tbody>
        </table>
        {order.address ? <p className="muted" style={{ marginTop: 8 }}>{order.address}</p> : null}
      </div>
      <OrderSteps order={order} />
    </div>
  );
}
