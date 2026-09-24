import type { DemoOrder } from "@/lib/demo/accounts";
import { bn } from "@/lib/format";

const STEPS = ["অর্ডার নিশ্চিত", "প্রস্তুত হচ্ছে", "কুরিয়ারে তোলা হয়েছে", "ডেলিভারিতে আছে", "ডেলিভারি সম্পন্ন"];
const SUBS = ["অর্ডার গ্রহণ করা হয়েছে", "বই প্যাক করা হচ্ছে", "কুরিয়ার পার্টনার নিয়েছে", "আপনার ঠিকানার পথে", "পণ্য হস্তান্তর হয়েছে"];
const IMGS = ["/icons/step-placed.svg", "/icons/step-process.svg", "/icons/step-courier.svg", "/icons/step-way.svg", "/icons/step-done.svg"];
const CANCEL_IMG = "/icons/step-cancel.svg";

function digitsOf(s: string) {
  return String(s || "").replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d))).replace(/\D/g, "");
}

function orderKey(s: string) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, "").replace(/^(clo|bbh)-?/, "");
}

export function matchOrders(orders: DemoOrder[], raw: string) {
  const q = raw.trim();
  if (!q) return [];
  const ph = digitsOf(q);
  const oid = orderKey(q);
  return orders.filter((o) => {
    if (oid && orderKey(o.id) === oid) return true;
    const op = digitsOf(o.phone);
    if (ph.length >= 10 && op.length >= 10 && ph.slice(-11) === op.slice(-11)) return true;
    return false;
  });
}

function reached(order: DemoOrder) {
  if (order.status < 0) return -1;
  if (order.status === 5) {
    if (order.cancelAt != null) return order.cancelAt;
    if (order.id === "CLO-2039") return 1;
    return 0;
  }
  return Math.min(order.status, STEPS.length - 1);
}

export function orderGlance(order: DemoOrder) {
  const cancel = order.status === 5;
  const pending = order.status < 0;
  const cur = reached(order);
  const delivered = !cancel && !pending && cur >= STEPS.length - 1;
  const title = cancel ? "অর্ডার বাতিল" : pending ? "অ্যাডমিন কনফার্মের অপেক্ষায়" : STEPS[cur];
  const sub = cancel
    ? "বাকি ধাপগুলো হয়নি, তালিকায় থাকবে"
    : pending
      ? "অর্ডার প্লেস হয়েছে। কনফার্ম হলে প্যাকিং ও কুরিয়ার শুরু হবে।"
      : delivered ? "পণ্য পৌঁছেছে" : SUBS[cur];
  const head = cancel ? "cancel" : pending ? "hold" : delivered ? "done" : "";
  const chip = cancel ? "বাতিল" : pending ? "অপেক্ষমাণ" : delivered ? "সম্পন্ন" : "চলমান";
  const kind = cancel ? "dead" : pending ? "hold" : delivered ? "ok" : "live";
  const icon = cancel ? CANCEL_IMG : IMGS[Math.max(cur, 0)] || IMGS[0];
  const flow = STEPS.map((label, i) => {
    let cls = "wait";
    let hint = SUBS[i];
    if (pending) hint = "কনফার্মের পর এই ধাপ শুরু";
    else if (cancel) {
      if (i <= cur) { cls = "done"; hint = "সম্পন্ন হয়েছিল"; }
      else { cls = "skip"; hint = "বাতিলের কারণে হয়নি"; }
    } else if (i < cur) { cls = "done"; hint = "সম্পন্ন"; }
    else if (i === cur) { cls = delivered ? "done now end" : "now"; hint = delivered ? "ডেলিভারি সম্পন্ন" : "বর্তমান অবস্থা"; }
    return { label, hint, cls, img: IMGS[i] };
  });
  flow.push({
    label: "অর্ডার বাতিল",
    hint: cancel ? "অর্ডার বাতিল করা হয়েছে" : "বাতিল হলে এই ধাপে দেখাবে",
    cls: cancel ? "cancel now" : "cancel wait",
    img: CANCEL_IMG,
  });
  return { title, sub, head, chip, kind, icon, flow };
}

export function OrderSteps({ order }: { order: DemoOrder }) {
  const g = orderGlance(order);
  return (
    <>
      <div className={`track-head ${g.head}`}>
        <div><b>{g.title}</b><span>{order.id} · {g.sub}</span></div>
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

export function OrderFacts({ order, mode }: { order: DemoOrder; mode: "user" | "done" }) {
  const payNote = order.paid ? " · পেয়েছি" : order.pay.includes("ক্যাশ") ? " · বকেয়া" : "";
  return (
    <div className="ord-facts">
      {mode !== "user" && order.name ? <span><i>নাম</i>{order.name}</span> : null}
      {order.phone ? <span><i>ফোন</i>{order.phone}</span> : null}
      {order.address ? <span><i>ঠিকানা</i>{order.address}</span> : null}
      <span><i>পণ্য</i>{order.items || "—"}</span>
      {order.pay ? <span><i>পেমেন্ট</i>{order.pay}{payNote}</span> : null}
    </div>
  );
}

export function DeliveryTrack({ order }: { order: DemoOrder }) {
  const shipTxt = order.ship == null ? "—" : order.ship > 0 ? `৳${bn(order.ship)}` : "ফ্রি";
  const lines = order.lines || [];
  const cols = 3;

  return (
    <div className="track-card">
      <div className="row total" style={{ border: 0, padding: 0, margin: "0 0 6px" }}>
        <span>{order.id}</span><span>৳{bn(order.total)}</span>
      </div>
      <OrderFacts order={order} mode="done" />
      <div className="inv-paper">
        <h4>ইনভয়েস · {order.id}</h4>
        <p className="muted">{order.name || "—"} · {order.pay} · {order.paid ? "টাকা পাওয়া গেছে" : order.pay.includes("ক্যাশ") ? "COD · বকেয়া" : ""}</p>
        <table>
          <tbody>
            <tr><th>পণ্য</th><th>কপি</th><th>দাম</th><th>মোট</th></tr>
            {lines.length ? lines.map((line) => (
              <tr key={`${line.kind}-${line.id}`}>
                <td>{line.title}{line.kind === "pack" ? <span className="muted"> প্যাকেজ</span> : null}</td>
                <td>{bn(line.qty)}</td>
                <td>৳{bn(line.price)}</td>
                <td>৳{bn(line.price * line.qty)}</td>
              </tr>
            )) : (
              <tr><td colSpan={4}>{order.items || "—"}</td></tr>
            )}
            <tr><td colSpan={cols}>সাবটোটাল</td><td>৳{bn(order.sub != null ? order.sub : order.total)}</td></tr>
            {order.couponOff ? <tr><td colSpan={cols}>কুপন {order.coupon || ""}</td><td>−৳{bn(order.couponOff)}</td></tr> : null}
            <tr><td colSpan={cols}>কুরিয়ার</td><td>{shipTxt}</td></tr>
            <tr><td colSpan={cols}><b>কাস্টমার মোট</b></td><td><b>৳{bn(order.total)}</b></td></tr>
          </tbody>
        </table>
        {order.address ? <p className="muted" style={{ marginTop: 8 }}>{order.address}</p> : null}
      </div>
      <OrderSteps order={order} />
    </div>
  );
}
