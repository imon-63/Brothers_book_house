"use client";

import "./visibility.css";
import { useMemo, useState } from "react";
import { bn } from "@/lib/format";
import { adminErrorText, useToast } from "@/lib/api/admin/core";
import {
  useCategoryTree, useDeleteSection, useSectionCategoriesVisibility, useUpdateCategory, useUpdateSection, type AdminSection,
} from "@/lib/api/admin/sections";
import { useAdminSection } from "@/lib/admin/section-context";
import { useAdminNav } from "@/components/admin/nav";
import { SectionIcon } from "@/components/admin/shared";
import { SectionModal } from "@/components/admin/tabs/section-modal";
import { Badge, Empty, Ico, Modal, SearchInput, Stat, Toggle, num } from "@/components/admin/ui";

/*
 * Settings › ক্যাটাগরি — what the shopper can see.
 * Section (বিভাগ, dynamic) → category → sub-category, each with its own switch.
 * Hiding never deletes products; it only removes them from the storefront.
 * Owners can also add / edit / delete (empty) sections here.
 */

type CatRow = { id: string; name: string; off: boolean; count: number; subs: { id: string; name: string; off: boolean; count: number }[] };

export function VisibilityPanel() {
  const toast = useToast();
  const { go } = useAdminNav();
  const { sections, code: current, setCode } = useAdminSection();
  const [pickCode, setPick] = useState<string>(current);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ section: AdminSection | null } | null>(null);
  const [confirmDel, setConfirmDel] = useState<AdminSection | null>(null);
  const [delErr, setDelErr] = useState("");
  const updSection = useUpdateSection();
  const delSection = useDeleteSection();
  const updCat = useUpdateCategory();
  const bulkVis = useSectionCategoriesVisibility();

  const picked = sections.find((x) => x.code === pickCode) ?? sections[0] ?? null;
  const treeQ = useCategoryTree(picked?.id);
  const cats: CatRow[] = useMemo(() => (treeQ.data?.categories ?? []).map((c) => ({
    id: c.id, name: c.name, off: !c.isVisible, count: c.productCount + c.children.reduce((s2, x) => s2 + x.productCount, 0),
    subs: c.children.map((x) => ({ id: x.id, name: x.name, off: !x.isVisible, count: x.productCount })),
  })), [treeQ.data]);

  const data = useMemo(() => sections.map((v) => ({
    ...v,
    en: v.nameEn,
    note: v.searchHint ?? "",
    off: !v.isVisible,
    total: v.products,
    liveCats: v.categories - v.hiddenCategories,
    catsN: v.categories,
    unseen: !v.isVisible ? v.products : v.code === picked?.code ? cats.reduce((s2, c) => s2 + (c.off ? c.count : c.subs.filter((x) => x.off).reduce((a2, x) => a2 + x.count, 0)), 0) : 0,
  })), [sections, cats, picked?.code]);

  const sel = data.find((d) => d.code === picked?.code) ?? data[0];
  const liveVerts = data.filter((d) => !d.off).length;
  const allCats = data.reduce((s2, d) => s2 + d.catsN, 0);
  const liveCats = data.reduce((s2, d) => s2 + (d.off ? 0 : d.liveCats), 0);
  const hiddenN = data.reduce((s2, d) => s2 + d.hiddenCategories, 0);
  const unseen = data.reduce((s2, d) => s2 + d.unseen, 0);
  const totalProducts = data.reduce((s2, d) => s2 + d.total, 0);
  const term = q.trim().toLowerCase();
  const shown = cats.filter((c) => !term || c.name.toLowerCase().includes(term) || c.subs.some((x) => x.name.toLowerCase().includes(term)));
  const maxCount = Math.max(1, ...cats.map((c) => c.count));

  function flipVert(d: AdminSection, off: boolean) {
    if (!off && liveVerts <= 1) {
      toast("অন্তত একটা বিভাগ খোলা রাখুন");
      return;
    }
    updSection.mutate({ id: d.id, body: { isVisible: off }, toast: off ? "বিভাগ আবার দোকানে দেখাচ্ছে" : "বিভাগ ক্রেতার কাছ থেকে লুকানো" });
  }

  function flipCat(c: { id: string; name: string }, off: boolean) {
    updCat.mutate({ id: c.id, body: { isVisible: off }, toast: off ? `${c.name} আবার দেখাচ্ছে` : `${c.name} লুকানো হয়েছে` });
  }

  function flipSub(x: { id: string; name: string }, off: boolean) {
    updCat.mutate({ id: x.id, body: { isVisible: off }, toast: off ? `${x.name} আবার দেখাচ্ছে` : `${x.name} লুকানো হয়েছে` });
  }

  function setAll(on: boolean) {
    if (!sel) return;
    const changed = cats.filter((c) => (on ? c.off : !c.off)).length;
    if (!changed) { toast("কিছু বদলানোর নেই"); return; }
    bulkVis.mutate({ sectionId: sel.id, isVisible: on, toast: on ? `${bn(changed)}টি ক্যাটাগরি চালু হয়েছে` : `${bn(changed)}টি ক্যাটাগরি লুকানো হয়েছে` });
  }

  function move(d: AdminSection, dir: -1 | 1) {
    const i = sections.findIndex((x) => x.id === d.id);
    const other = sections[i + dir];
    if (!other) return;
    // swap sort orders (normalise when equal)
    const a2 = d.sortOrder === other.sortOrder ? i : d.sortOrder;
    const b2 = d.sortOrder === other.sortOrder ? i + dir : other.sortOrder;
    updSection.mutate({ id: d.id, body: { sortOrder: b2 }, toast: "ক্রম বদলেছে" });
    updSection.mutate({ id: other.id, body: { sortOrder: a2 }, toast: "" });
  }

  function askDelete(d: AdminSection) {
    setDelErr("");
    setConfirmDel(d);
  }
  function doDelete() {
    if (!confirmDel) return;
    const d = confirmDel;
    delSection.mutate({ id: d.id, name: d.name }, {
      onSuccess: () => {
        setConfirmDel(null);
        if (pickCode === d.code) setPick(sections.find((x) => x.id !== d.id)?.code ?? "");
        if (current === d.code) setCode(sections.find((x) => x.id !== d.id)?.code ?? "book");
      },
      onError: (e) => setDelErr(adminErrorText(e)),
    });
  }

  function toggleOpen(name: string) {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  return (
    <div className="vz">
      <div className="ap-grid-4 vz-kpis">
        <Stat label="বিভাগ চালু" en="Sections live" value={`${bn(liveVerts)}/${bn(data.length)}`} tone="wine" icon={Ico.store} hint={liveVerts === data.length ? "সব বিভাগ দেখাচ্ছে" : `${bn(data.length - liveVerts)}টি লুকানো`} />
        <Stat label="চালু ক্যাটাগরি" en="Categories live" value={`${bn(liveCats)}/${bn(allCats)}`} tone="green" icon={Ico.cats} hint="ক্রেতার মেনুতে" />
        <Stat label="লুকানো" en="Hidden rules" value={num(hiddenN)} tone="gold" icon={Ico.eye} hint="ক্যাটাগরি ও সাব মিলিয়ে" />
        <Stat label="ক্রেতা দেখছে না" en="Unseen products" value={num(unseen)} tone={unseen ? "red" : "sage"} icon={Ico.products} hint={totalProducts ? `মোট ${bn(totalProducts)}টির ${bn(Math.round((unseen / totalProducts) * 100))}%` : "কোনো পণ্য নেই"} />
      </div>

      <div className="vz-grid">
        <aside className="vz-verts" aria-label="বিভাগ">
          <div className="vz-verts-head">
            <p className="vz-label">বিভাগ <span>Sections</span></p>
            <button type="button" className="ap-btn sm primary" onClick={() => setModal({ section: null })}>{Ico.plus}নতুন বিভাগ</button>
          </div>
          {data.map((d, i) => {
            const share = d.catsN ? Math.round((d.liveCats / d.catsN) * 100) : 0;
            const color = typeof d.content?.color === "string" ? d.content.color : undefined;
            return (
              <div key={d.code} role="button" tabIndex={0} aria-pressed={d.code === sel?.code}
                className={`vz-vert v-${d.code}${d.code === sel?.code ? " on" : ""}${d.off ? " off" : ""}`}
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => setPick(d.code)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPick(d.code); } }}>
                <div className="vz-vert-top">
                  <span className="vz-vert-ico" style={color && !["book", "food", "gadget"].includes(d.code) ? { background: color, color: "#fff" } : undefined}><SectionIcon code={d.code} section={d} /></span>
                  <div className="vz-vert-txt">
                    <b>{d.name}<small>{d.en}</small></b>
                    <span>{d.note}</span>
                  </div>
                  <span onClick={(e) => e.stopPropagation()}>
                    <Toggle checked={!d.off} onChange={() => flipVert(d, d.off)} />
                  </span>
                </div>
                <div className="vz-vert-meta">
                  <span><b>{bn(d.total)}</b> পণ্য</span>
                  <span><b>{bn(d.liveCats)}</b>/{bn(d.catsN)} ক্যাটাগরি</span>
                  {d.off ? <Badge tone="red" dot>লুকানো</Badge> : d.unseen ? <Badge tone="gold">{bn(d.unseen)} লুকানো পণ্য</Badge> : <Badge tone="green" dot>লাইভ</Badge>}
                </div>
                <div className="vz-meter" aria-hidden="true"><i style={{ width: `${d.off ? 0 : share}%` }} /></div>
              </div>
            );
          })}
          <div className="vz-note">
            {Ico.alert}
            <p><b>লুকালে কিছু মুছে যায় না।</b> পণ্য, দাম, স্টক সব আগের মতো থাকে — শুধু ক্রেতার দোকান থেকে সরে যায়। আবার চালু করলেই ফিরে আসে।</p>
          </div>
        </aside>

        {sel ? <section className={`vz-panel v-${sel.code}${sel.off ? " off" : ""}`} key={sel.code}>
          <header className="vz-panel-head">
            <span className="vz-panel-ico"><SectionIcon code={sel.code} section={sel} /></span>
            <div className="vz-panel-title">
              <h3>{sel.name} <span>{sel.en}</span></h3>
              <p>{sel.off ? "এই বিভাগ এখন দোকানে লুকানো · ক্যাটাগরির সুইচ বন্ধ আছে" : `${bn(sel.liveCats)}টি ক্যাটাগরি দেখাচ্ছে · ${bn(sel.unseen)}টি পণ্য লুকানো`} · <code>{sel.code}</code></p>
            </div>
            <div className="vz-panel-acts">
              <span className="vz-order">
                <button type="button" className="ap-icon-btn sm" title="উপরে সরান" aria-label="উপরে সরান" disabled={sections[0]?.code === sel.code} onClick={() => move(sel, -1)}>{Ico.up}</button>
                <button type="button" className="ap-icon-btn sm" title="নিচে সরান" aria-label="নিচে সরান" disabled={sections.at(-1)?.code === sel.code} onClick={() => move(sel, 1)}>{Ico.down}</button>
              </span>
              <button type="button" className="ap-btn sm" onClick={() => setModal({ section: sections.find((x) => x.code === sel.code) ?? null })}>{Ico.edit}বিভাগ এডিট</button>
              <button type="button" className="ap-btn sm ghost" title={sel.catsN || sel.total ? "খালি বিভাগই মোছা যায়" : "বিভাগ মুছুন"} onClick={() => askDelete(sel)}>{Ico.trash}</button>
              <button type="button" className="ap-btn sm" disabled={sel.off} onClick={() => setAll(true)}>{Ico.eye}সব চালু</button>
              <button type="button" className="ap-btn sm" disabled={sel.off} onClick={() => setAll(false)}>সব লুকান</button>
              <button type="button" className="ap-btn sm ghost" onClick={() => { setCode(sel.code); go("cats"); }}>{Ico.cats}সাজান</button>
            </div>
          </header>

          <div className="vz-preview">
            <p>{Ico.store}ক্রেতা মেনুতে যা দেখবে <span>Storefront menu</span></p>
            {sel.off ? (
              <div className="vz-preview-off">{Ico.lock}এই বিভাগটাই দোকানে নেই — বাম পাশ থেকে চালু করুন</div>
            ) : (
              <div className="vz-pills">
                {cats.filter((c) => !c.off).map((c) => <span key={c.id}>{c.name}{c.subs.some((s) => !s.off) ? <i>{bn(c.subs.filter((s) => !s.off).length)}</i> : null}</span>)}
                {!cats.some((c) => !c.off) ? <em>কোনো ক্যাটাগরি চালু নেই — মেনু ফাঁকা দেখাবে</em> : null}
              </div>
            )}
          </div>

          <div className="vz-toolbar">
            <SearchInput value={q} onChange={setQ} placeholder="ক্যাটাগরি বা সাব খুঁজুন" />
            <button type="button" className="ap-btn sm ghost" onClick={() => setOpen(open.size ? new Set() : new Set(cats.filter((c) => c.subs.length).map((c) => c.name)))}>
              {open.size ? "সব গুটিয়ে নিন" : "সব খুলুন"}
            </button>
          </div>

          {!cats.length ? (
            <Empty icon={Ico.cats} title={treeQ.isLoading ? "লোড হচ্ছে…" : "এই বিভাগে কোনো ক্যাটাগরি নেই"} sub="ক্যাটাগরি পেজ থেকে নতুন ক্যাটাগরি যোগ করুন।" action={<button type="button" className="ap-btn primary sm" onClick={() => { setCode(sel.code); go("cats"); }}>{Ico.plus}ক্যাটাগরি যোগ</button>} />
          ) : !shown.length ? (
            <Empty icon={Ico.search} title={`“${q}” মেলেনি`} sub="অন্য নাম দিয়ে খুঁজুন।" />
          ) : (
            <ul className="vz-list">
              {shown.map((c, i) => {
                const expanded = open.has(c.name) || (!!term && c.subs.some((s) => s.name.toLowerCase().includes(term)));
                const liveSubs = c.subs.filter((s) => !s.off).length;
                return (
                  <li key={c.id} className={`vz-cat${c.off || sel.off ? " off" : ""}${expanded ? " open" : ""}`} style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}>
                    <div className="vz-cat-row">
                      <button type="button" className="vz-chev" aria-label={expanded ? "গুটান" : "খুলুন"} aria-expanded={expanded} disabled={!c.subs.length} onClick={() => toggleOpen(c.name)}>
                        {c.subs.length ? Ico.chevR : <i className="vz-dot" />}
                      </button>
                      <div className="vz-cat-txt">
                        <b>{c.name}</b>
                        <small>{bn(c.count)}টি পণ্য{c.subs.length ? ` · ${bn(liveSubs)}/${bn(c.subs.length)} সাব চালু` : " · সাব-ক্যাটাগরি নেই"}</small>
                      </div>
                      <div className="vz-share" title={`${bn(c.count)}টি পণ্য`}><i style={{ width: `${(c.count / maxCount) * 100}%` }} /></div>
                      {c.off ? <Badge tone="gold">লুকানো</Badge> : null}
                      <Toggle checked={!c.off} disabled={sel.off} onChange={() => flipCat(c, c.off)} />
                    </div>
                    {c.subs.length ? (
                      <div className="vz-subs" aria-hidden={!expanded}>
                        <div>
                          {c.subs.map((x) => (
                            <div key={x.id} className={`vz-sub${x.off || c.off || sel.off ? " off" : ""}`}>
                              <span className="vz-sub-line" />
                              <span className="vz-sub-txt"><b>{x.name}</b><small>{bn(x.count)}টি পণ্য</small></span>
                              {x.off ? <Badge tone="gold">লুকানো</Badge> : null}
                              <Toggle checked={!x.off} disabled={c.off || sel.off} onChange={() => flipSub(x, x.off)} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section> : null}
      </div>

      <SectionModal open={!!modal} section={modal?.section ?? null} onClose={() => setModal(null)}
        onSaved={(s2) => { setPick(s2.code); }} />

      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} width={440}
        title={confirmDel ? `«${confirmDel.name}» বিভাগ মুছবেন?` : undefined}
        sub="Delete section · শুধু খালি বিভাগ মোছা যায়"
        footer={confirmDel ? (
          <>
            <button type="button" className="ap-btn ghost" onClick={() => setConfirmDel(null)}>থাক</button>
            <button type="button" className="ap-btn primary" disabled={delSection.isPending} onClick={doDelete}>{Ico.trash}হ্যাঁ, মুছুন</button>
          </>
        ) : undefined}>
        {confirmDel ? (
          <div className="sx-form">
            <p style={{ margin: 0 }}>{confirmDel.categories || confirmDel.products
              ? <>এই বিভাগে <b>{bn(confirmDel.categories)}</b>টি ক্যাটাগরি ও <b>{bn(confirmDel.products)}</b>টি পণ্য আছে — সার্ভার সম্ভবত মুছতে দেবে না। মোছার বদলে বাম পাশের সুইচ দিয়ে লুকিয়ে রাখুন।</>
              : <>বিভাগটি খালি — মুছে ফেললে এর হিরো স্লাইড ও ডেলিভারি নিয়মও মুছবে। কাজটি অ্যাক্টিভিটি লগে থাকবে।</>}</p>
            {delErr ? <div className="sx-api" role="alert">{Ico.alert}<ul><li>{delErr}</li></ul></div> : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
