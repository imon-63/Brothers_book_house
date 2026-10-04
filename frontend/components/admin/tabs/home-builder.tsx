"use client";

/**
 * হোম পেজ — per-section storefront home arrangement.
 *  • order / show-hide / heading of every home block (saved to section.content.home)
 *  • "আজকের ছাড়": which products appear, add a product with a timer, edit/stop a running one
 */

import "./home-builder.css";
import { useEffect, useMemo, useState } from "react";
import { bn } from "@/lib/format";
import { fmtShipDt } from "@/lib/calendar";
import { useAdminSection } from "@/lib/admin/section-context";
import { useUpdateSection } from "@/lib/api/admin/sections";
import { useAdminProducts, useCancelDeal, useSectionDeals, type AdminDeal } from "@/lib/api/admin/products";
import { HOME_BLOCKS, readHomeLayout, type DealMode, type HomeBlock, type HomeLayout } from "@/lib/home-layout";
import { SectionIcon } from "@/components/admin/shared";
import { Badge, Empty, Ico, Modal, SearchInput, Segmented, Toggle, tk } from "@/components/admin/ui";
import { DealDialog, DealLayer, toLocalDt, toShop, type ShopProduct } from "./products";

const same = (a: HomeLayout, b: HomeLayout) => JSON.stringify(a) === JSON.stringify(b);

export function HomeBuilderTab() {
  const { code, section } = useAdminSection();
  const saved = useMemo(() => readHomeLayout(section?.content ?? null, code), [section?.content, code]);
  const [draft, setDraft] = useState<HomeLayout>(saved);
  const [open, setOpen] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const updateM = useUpdateSection();

  useEffect(() => setDraft(saved), [saved]);

  const dirty = !same(draft, saved);
  const onCount = draft.blocks.filter((b) => b.on).length;

  function move(from: number, to: number) {
    if (to < 0 || to >= draft.blocks.length || from === to) return;
    setDraft((d) => {
      const blocks = [...d.blocks];
      const [b] = blocks.splice(from, 1);
      blocks.splice(to, 0, b);
      return { ...d, blocks };
    });
  }
  function patchBlock(i: number, p: Partial<HomeBlock>) {
    setDraft((d) => ({ ...d, blocks: d.blocks.map((b, j) => (j === i ? { ...b, ...p } : b)) }));
  }
  function reset() {
    setDraft((d) => ({ ...d, blocks: readHomeLayout(null, code).blocks }));
  }
  function save() {
    if (!section) return;
    const home = {
      dealMode: draft.dealMode,
      blocks: draft.blocks.map((b) => ({ key: b.key, on: b.on, ...(b.title?.trim() ? { title: b.title.trim() } : {}) })),
    };
    updateM.mutate({ id: section.id, body: { content: { home } }, toast: `«${section.name}» এর হোম পেজ সেভ হয়েছে · স্টোরে এখনই দেখাবে` });
  }

  if (!section) return <div className="ap-card"><Empty title="বিভাগ লোড হচ্ছে…" /></div>;

  return (
    <div className="hb">
      <div className="hb-top">
        <div className="hb-sec">
          <span className="hb-sec-ico"><SectionIcon code={code} section={section} /></span>
          <div>
            <b>{section.name} · হোম পেজ</b>
            <small>উপরের বিভাগ বদলালে অন্য বিভাগের হোম পেজ সাজাতে পারবেন</small>
          </div>
        </div>
        <div className="hb-top-acts">
          {dirty ? <span className="hb-dirty">{Ico.alert}সেভ করা হয়নি</span> : <span className="hb-clean">{Ico.check}সব সেভ করা</span>}
          <button type="button" className="ap-btn ghost" onClick={reset}>ডিফল্ট ক্রম</button>
          <button type="button" className="ap-btn" disabled={!dirty} onClick={() => setDraft(saved)}>বাতিল</button>
          <button type="button" className="ap-btn primary" disabled={!dirty || updateM.isPending} onClick={save}>{updateM.isPending ? "সেভ হচ্ছে…" : "সেভ করুন"}</button>
        </div>
      </div>

      <div className="hb-grid">
        <section className="ap-card hb-blocks">
          <div className="ap-card-head">
            <div>
              <h3>অংশগুলোর ক্রম <span>Blocks</span></h3>
              <p>টেনে বা ↑↓ দিয়ে সাজান · সুইচ বন্ধ করলে ওই অংশ দেখাবে না · {bn(onCount)}টি চালু</p>
            </div>
          </div>

          <ol className="hb-list">
            <li className="hb-row locked">
              <span className="hb-n">{Ico.lock}</span>
              <div className="hb-name"><b>ব্যানার</b><small>Hero · সবসময় সবার উপরে · স্লাইড বদলাতে সেটিংস → অফার</small></div>
            </li>
            {draft.blocks.map((b, i) => {
              const meta = HOME_BLOCKS[b.key];
              const expanded = open === b.key;
              return (
                <li
                  key={b.key}
                  className={`hb-row${b.on ? "" : " off"}${drag === i ? " dragging" : ""}`}
                  draggable
                  onDragStart={(e) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { move(drag, i); setDrag(i); } }}
                  onDragEnd={() => setDrag(null)}
                >
                  <span className="hb-grip" aria-hidden="true">⋮⋮</span>
                  <span className="hb-n">{bn(i + 1)}</span>
                  <div className="hb-name">
                    <b>{b.title || meta.bn}{b.title ? <em>{meta.bn}</em> : null}</b>
                    <small>{meta.en} · {meta.desc}</small>
                    {expanded ? (
                      <div className="hb-edit" onClick={(e) => e.stopPropagation()}>
                        <label>
                          <span>শিরোনাম (ফাঁকা রাখলে ডিফল্ট)</span>
                          <input value={b.title ?? ""} maxLength={60} placeholder={meta.bn} onChange={(e) => patchBlock(i, { title: e.target.value })} />
                        </label>
                      </div>
                    ) : null}
                  </div>
                  <div className="hb-acts">
                    {meta.titled ? (
                      <button type="button" className={`ap-icon-btn sm${expanded ? " on" : ""}`} title="শিরোনাম বদলান" aria-label="শিরোনাম বদলান" onClick={() => setOpen(expanded ? null : b.key)}>{Ico.edit}</button>
                    ) : null}
                    <button type="button" className="ap-icon-btn sm" aria-label="উপরে" disabled={i === 0} onClick={() => move(i, i - 1)}>{Ico.up}</button>
                    <button type="button" className="ap-icon-btn sm" aria-label="নিচে" disabled={i === draft.blocks.length - 1} onClick={() => move(i, i + 1)}>{Ico.down}</button>
                    <Toggle checked={b.on} onChange={(v) => patchBlock(i, { on: v })} />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="hb-preview" aria-label="প্রিভিউ">
          <div className="hb-phone">
            <span className="hb-notch" />
            <div className="hb-screen">
              <div className="pv hero"><span>ব্যানার</span></div>
              {draft.blocks.filter((b) => b.on).map((b) => (
                <div key={b.key} className={`pv k-${b.key}`}>
                  <span>{b.title || HOME_BLOCKS[b.key].bn}</span>
                  <i /><i /><i />
                </div>
              ))}
            </div>
          </div>
          <p>প্রিভিউ · সেভ করার পর স্টোরের হোম পেজ এই ক্রমে দেখাবে</p>
          <a className="ap-btn sm" href="/" target="_blank" rel="noreferrer">{Ico.eye}স্টোরে দেখুন</a>
        </aside>
      </div>

      <DealsCard
        code={code}
        sectionName={section.name}
        mode={draft.dealMode}
        savedMode={saved.dealMode}
        dealsOn={draft.blocks.find((b) => b.key === "deals")?.on !== false}
        onMode={(m) => setDraft((d) => ({ ...d, dealMode: m }))}
      />
    </div>
  );
}

/* ───────── আজকের ছাড় ───────── */

function dealTarget(d: AdminDeal): ShopProduct {
  return {
    id: d.product.id, title: d.product.title, author: "", price: d.product.regularPrice, old: 0, cost: 0, sold: 0, color: "#7A2430",
    cat: "", catId: "", desc: "", vertical: d.product.section, stock: 0, copies: 0, freeShip: false, image: d.product.cover ?? undefined,
    deal: { id: d.id, price: d.dealPrice, until: toLocalDt(d.endsAt), from: toLocalDt(d.startsAt) }, version: 0, hidden: false,
  };
}

function left(endsAt: string) {
  const s = Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${bn(d)} দিন ${bn(h)} ঘণ্টা` : h ? `${bn(h)} ঘণ্টা ${bn(m)} মিনিট` : `${bn(m)} মিনিট`;
}

function DealsCard({ code, sectionName, mode, savedMode, dealsOn, onMode }: {
  code: string; sectionName: string; mode: DealMode; savedMode: DealMode; dealsOn: boolean; onMode: (m: DealMode) => void;
}) {
  const [tab, setTab] = useState<"active" | "scheduled">("active");
  const q = useSectionDeals(code, tab);
  const cancelM = useCancelDeal();
  const [target, setTarget] = useState<ShopProduct | null>(null);
  const [picking, setPicking] = useState(false);
  const deals = q.data?.items ?? [];

  return (
    <section className="ap-card hb-deals">
      <div className="ap-card-head">
        <div>
          <h3>আজকের ছাড় <span>Today&apos;s deals</span></h3>
          <p>পণ্যে টাইমার দিলে {sectionName} এর হোম পেজের &quot;আজকের ছাড়&quot;-এ আসবে · এখনই শুরু করুন বা পরে কোনো সময়ের জন্য শিডিউল করুন · সময় শেষে নিজে থেকে আগের দামে ফিরবে</p>
        </div>
        <div className="ap-card-acts">
          <button type="button" className="ap-btn gold" onClick={() => setPicking(true)}>{Ico.plus}{tab === "scheduled" ? "ছাড় শিডিউল করুন" : "পণ্য যোগ করুন"}</button>
        </div>
      </div>

      {!dealsOn ? <div className="hb-warn">{Ico.alert}&quot;আজকের ছাড়&quot; অংশটি উপরে বন্ধ করা আছে — চালু না করলে হোম পেজে দেখাবে না</div> : null}

      <div className="hb-mode">
        <b>কোন পণ্য দেখাবে?</b>
        <div className="hb-mode-opts">
          <button type="button" className={mode === "timed" ? "on" : ""} onClick={() => onMode("timed")}>
            <span className="hb-radio" />
            <span><b>শুধু টাইমার দেওয়া পণ্য</b><small>আপনি যেগুলো যোগ করবেন শুধু সেগুলো</small></span>
          </button>
          <button type="button" className={mode === "auto" ? "on" : ""} onClick={() => onMode("auto")}>
            <span className="hb-radio" />
            <span><b>টাইমার + দাম কমানো পণ্য</b><small>টাইমারগুলো আগে, তারপর আগের দাম কাটা সব পণ্য</small></span>
          </button>
        </div>
        {mode !== savedMode ? <small className="hb-mode-note">উপরের &quot;সেভ করুন&quot; চাপলে কার্যকর হবে</small> : null}
      </div>

      <div className="hb-deal-head">
        <Segmented size="sm" value={tab} onChange={setTab} options={[{ id: "active", label: "চলছে" }, { id: "scheduled", label: "আসছে" }]} />
        <small>{q.data ? `${bn(q.data.total)}টি` : ""}</small>
      </div>

      {q.isLoading ? <div className="hb-deal-skel" /> : deals.length ? (
        <ul className="hb-deal-list">
          {deals.map((d) => (
            <li key={d.id} className="hb-deal">
              <span className="hb-deal-img">{d.product.cover ? <img src={d.product.cover} alt="" /> : Ico.box}</span>
              <div className="hb-deal-info">
                <b>{d.product.title}</b>
                <small>
                  <s>{tk(d.product.regularPrice)}</s> <strong>{tk(d.dealPrice)}</strong> <Badge tone="green">{bn(d.discountPct)}% ছাড়</Badge>
                </small>
              </div>
              <div className="hb-deal-time">
                {d.state === "scheduled" ? <><small>শুরু</small><b>{fmtShipDt(toLocalDt(d.startsAt))}</b></> : <><small>বাকি</small><b>{left(d.endsAt)}</b></>}
                <small>{fmtShipDt(toLocalDt(d.endsAt))} পর্যন্ত</small>
              </div>
              <div className="hb-deal-acts">
                <button type="button" className="ap-btn sm" onClick={() => setTarget(dealTarget(d))}>{Ico.clock}বদলান</button>
                <button type="button" className="ap-btn sm danger" disabled={cancelM.isPending} onClick={() => cancelM.mutate({ dealId: d.id })}>সরান</button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty
          icon={Ico.clock}
          title={tab === "active" ? "এখন কোনো টাইমার ছাড় চলছে না" : "আগামীতে কোনো ছাড় সেট করা নেই"}
          sub={mode === "auto" ? "হোম পেজে শুধু দাম কমানো পণ্যগুলো দেখাবে" : "\"পণ্য যোগ করুন\" চেপে প্রথম ছাড়টি দিন"}
          action={<button type="button" className="ap-btn primary sm" onClick={() => setPicking(true)}>{Ico.plus}পণ্য যোগ করুন</button>}
        />
      )}

      <ProductPicker open={picking} code={code} onClose={() => setPicking(false)} onPick={(p) => { setPicking(false); setTarget(p); }} />
      {target ? <DealLayer><DealDialog product={target} scheduled={tab === "scheduled"} onClose={() => setTarget(null)} /></DealLayer> : null}
    </section>
  );
}

function ProductPicker({ open, code, onClose, onPick }: { open: boolean; code: string; onClose: () => void; onPick: (p: ShopProduct) => void }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const list = useAdminProducts({ section: code, q: debounced || undefined, sort: "sold", order: "desc" }, 1, 10);
  const rows = list.data?.items ?? [];

  return (
    <Modal open={open} onClose={onClose} title="আজকের ছাড়ে পণ্য যোগ করুন" sub="পণ্য বাছুন → ছাড়ের দাম ও শেষ হওয়ার সময় দিন" width={560}>
      <SearchInput value={q} onChange={setQ} placeholder="নাম বা SKU দিয়ে খুঁজুন" autoFocus />
      <ul className="hb-pick">
        {rows.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onPick(toShop(r))}>
              <span className="hb-deal-img">{r.cover.url ? <img src={r.cover.url} alt="" /> : Ico.box}</span>
              <span className="hb-pick-txt">
                <b>{r.title}</b>
                <small>{r.category?.name ?? "—"} · স্টক {bn(r.stock.available)}</small>
              </span>
              <span className="hb-pick-price">
                {r.deal ? <Badge tone="gold">টাইমার চলছে</Badge> : null}
                <b>{tk(r.regularPrice)}</b>
              </span>
            </button>
          </li>
        ))}
        {!list.isLoading && !rows.length ? <li className="hb-pick-empty">কিছু মেলেনি</li> : null}
      </ul>
    </Modal>
  );
}
