"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { bn, discount } from "@/lib/format";
import { useAdminSection } from "@/lib/admin/section-context";
import { useToast } from "@/lib/api/admin/core";
import { useAdminProducts } from "@/lib/api/admin/products";
import { useAdminBundles, useCreateBundle, useDeleteBundle, usePatchBundle } from "@/lib/api/admin/bundles";
import { TabMark, PackStack } from "@/components/admin/shared";

type Book = { id: string; title: string; author: string; cat: string; price: number; color: string; image?: string };

export function PacksTab() {
  const toast = useToast();
  const { code, section } = useAdminSection();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setTerm(q.trim()), 250); return () => window.clearTimeout(t); }, [q]);
  const bundlesQ = useAdminBundles(code);
  const productsQ = useAdminProducts({ section: code, q: term || undefined, sort: "sold" }, 1, 60);
  const createM = useCreateBundle();
  const patchM = usePatchBundle();
  const delM = useDeleteBundle();
  const packs = useMemo(() => (bundlesQ.data?.items ?? []).map((b) => ({
    id: b.id, title: b.title, price: b.price, old: b.compareAt ?? b.separatePrice, freeShip: b.freeShipping,
    bookIds: b.items.map((i) => i.id),
    books: b.items.map((i) => ({ id: i.id, title: i.title, color: i.cover.color || "#7A2430", image: i.cover.url ?? undefined })),
  })), [bundlesQ.data]);
  const [pool, setPool] = useState<Map<string, Book>>(new Map());
  const shown: Book[] = useMemo(() => (productsQ.data?.items ?? []).map((p) => ({
    id: p.id, title: p.title, author: p.authorLine ?? "", cat: p.category?.name ?? "", price: p.regularPrice, color: p.cover.color || "#7A2430", image: p.cover.url ?? undefined,
  })), [productsQ.data]);
  useEffect(() => { setPool((m) => { const n = new Map(m); shown.forEach((b) => n.set(b.id, b)); return n; }); }, [shown]);
  const [picked, setPicked] = useState<string[]>([]);
  const packForm = useForm({ defaultValues: { title: "", price: "", old: "", free: false } });
  const live = packForm.watch();
  const pickedBooks = picked.map((id) => pool.get(id)).filter((b): b is Book => b != null);
  const sumPrice = pickedBooks.reduce((s, b) => s + b.price, 0);
  const livePrice = Number(live.price || 0);
  const liveOld = Number(live.old || 0) || sumPrice;
  const liveOff = discount(livePrice, liveOld);
  const avgOff = packs.length ? Math.round(packs.reduce((s, p) => s + discount(p.price, p.old), 0) / packs.length) : 0;
  const freeN = packs.filter((p) => p.freeShip).length;

  function add(data: { title: string; price: string; old: string; free: boolean }) {
    const title = data.title.trim();
    const price = Number(data.price || 0);
    if (!title || !price || picked.length < 2) { toast("নাম, দাম আর কমপক্ষে ২টি বই দিন"); return; }
    if (!section) return;
    createM.mutate({
      sectionId: section.id, title, price, compareAtPrice: Number(data.old || 0) || null,
      items: picked.map((productId) => ({ productId, quantity: 1 })), description: "প্যাকেজ অফার।", freeShipping: data.free,
    }, { onSuccess: () => { setPicked([]); packForm.reset(); } });
  }

  function flip(id: string) {
    setPicked((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  }

  return (
    <div className="pk-page">
      <div className="pk-stats">
        <article><span className="pk-stat-ico"><TabMark id="packs" /></span><div><b>{bn(packs.length)}</b><small>চলমান প্যাকেজ</small></div></article>
        <article><span className="pk-stat-ico gold">%</span><div><b>{bn(avgOff)}%</b><small>গড় ছাড়</small></div></article>
        <article><span className="pk-stat-ico sage"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></svg></span><div><b>{bn(freeN)}</b><small>ফ্রি ডেলিভারি</small></div></article>
      </div>

      <form className="pk-studio" onSubmit={packForm.handleSubmit(add)}>
        <div className="pk-build">
          <header className="pk-head">
            <span className="pk-step">১</span>
            <div><h3>প্যাকেজের নাম ও দাম</h3><p>নাম দিন, তারপর দাম বসান</p></div>
          </header>
          <label>প্যাকেজ নাম</label><input {...packForm.register("title")} placeholder="যেমন: এসএসসি প্যাকেজ" />
          <div className="form-grid">
            <div><label>নতুন দাম</label><input {...packForm.register("price")} type="number" min="1" placeholder="৳" /></div>
            <div><label>পুরনো দাম <span className="author">খালি থাকলে বইয়ের মোট</span></label><input {...packForm.register("old")} type="number" min="0" placeholder={sumPrice ? `৳${bn(sumPrice)}` : "৳"} /></div>
          </div>

          <header className="pk-head" style={{ marginTop: 22 }}>
            <span className="pk-step">২</span>
            <div><h3>{code === "book" ? "বই" : "পণ্য"} বেছে নিন</h3><p>কমপক্ষে ২টি · কভারে চাপ দিন</p></div>
            <em className="pk-count">{bn(picked.length)}টি</em>
          </header>
          <div className="pk-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
            <input type="search" placeholder="বই, লেখক বা ক্যাটাগরি খুঁজুন..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="pk-tiles">
            {shown.map((b) => {
              const on = picked.includes(b.id);
              return (
                <button type="button" key={b.id} className={`pk-tile${on ? " on" : ""}`} onClick={() => flip(b.id)}>
                  <span className="pk-tile-cover" style={{ background: b.image ? undefined : b.color }}>
                    {b.image ? <img src={b.image} alt="" /> : <em>{b.title}</em>}
                    <i className="pk-tick"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"><path d="M5 12.5 10 17.5 19 7.5" /></svg></i>
                  </span>
                  <b>{b.title}</b>
                  <small>৳{bn(b.price)} · {b.cat}</small>
                </button>
              );
            })}
            {!shown.length ? <p className="pk-none">কোনো বই মেলেনি</p> : null}
          </div>
        </div>

        <aside className="pk-preview">
          <p className="pk-live"><i /> লাইভ প্রিভিউ</p>
          <div className="pk-stage">
            {liveOff ? <span className="pk-ribbon">-{bn(liveOff)}%</span> : null}
            <PackStack books={pickedBooks} size="lg" />
          </div>
          <h4>{live.title?.trim() || "প্যাকেজের নাম"}</h4>
          <p className="pk-sub">{bn(pickedBooks.length)}টি বই{live.free ? " · ফ্রি ডেলিভারি" : ""}</p>
          <div className="pk-price">
            <b>৳{bn(livePrice || 0)}</b>
            {liveOld > livePrice && livePrice ? <s>৳{bn(liveOld)}</s> : null}
          </div>
          {liveOld > livePrice && livePrice ? <p className="pk-save">ক্রেতা বাঁচাবে ৳{bn(liveOld - livePrice)}</p> : null}
          <label className="pk-switch">
            <input type="checkbox" {...packForm.register("free")} />
            <span className="sw" aria-hidden="true" />
            <span>ফ্রি ডেলিভারি</span>
          </label>
          <button className="btn btn-primary btn-wide" type="submit" disabled={createM.isPending}>প্যাকেজ তৈরি করুন</button>
        </aside>
      </form>

      <div className="pk-gallery-head">
        <h3>চলমান প্যাকেজ</h3>
        <span>{bn(packs.length)}টি</span>
      </div>
      {!packs.length ? <div className="empty">এখনো কোনো প্যাকেজ নেই · উপরে তৈরি করুন</div> : (
        <div className="pk-gallery">
          {packs.map((p, i) => {
            const list = p.books;
            const off = discount(p.price, p.old);
            return (
              <article className="pk-card" key={p.id} style={{ animationDelay: `${i * 60}ms` }}>
                <div className="pk-card-stage">
                  {off ? <span className="pk-ribbon">-{bn(off)}%</span> : null}
                  {p.freeShip ? <span className="pk-free">ফ্রি ডেলিভারি</span> : null}
                  <PackStack books={list} />
                </div>
                <div className="pk-card-body">
                  <h4>{p.title}</h4>
                  <p className="pk-sub">{bn(p.bookIds.length)}টি বই</p>
                  <div className="pk-price"><b>৳{bn(p.price)}</b>{p.old > p.price ? <s>৳{bn(p.old)}</s> : null}</div>
                  <div className="pk-card-foot">
                    <label className="pk-switch sm">
                      <input type="checkbox" checked={!!p.freeShip} onChange={(e) => patchM.mutate({ id: p.id, body: { freeShipping: e.target.checked }, toast: e.target.checked ? "ফ্রি ডেলিভারি চালু হয়েছে" : "ফ্রি ডেলিভারি বন্ধ" })} />
                      <span className="sw" aria-hidden="true" />
                      <span>ফ্রি ডেলিভারি</span>
                    </label>
                    <button type="button" className="pk-del" aria-label="মুছুন" title="মুছুন" onClick={() => delM.mutate({ id: p.id })}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
