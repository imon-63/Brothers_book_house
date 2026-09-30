"use client";

import { useForm } from "react-hook-form";
import { bn } from "@/lib/format";
import { useAdminSection } from "@/lib/admin/section-context";
import { useToast } from "@/lib/api/admin/core";
import { useCategoryTree, useCreateCategory, useDeleteCategory, useUpdateCategory } from "@/lib/api/admin/sections";

export function CategoriesTab() {
  const toast = useToast();
  const { section } = useAdminSection();
  const treeQ = useCategoryTree(section?.id);
  const createM = useCreateCategory();
  const updateM = useUpdateCategory();
  const deleteM = useDeleteCategory();
  const cats = (treeQ.data?.categories ?? []).map((c) => ({
    id: c.id, name: c.name, off: !c.isVisible, count: c.productCount + c.children.reduce((s2, x) => s2 + x.productCount, 0),
    subs: c.children.map((x) => ({ id: x.id, name: x.name, off: !x.isVisible, count: x.productCount })),
  }));
  const catForm = useForm({ defaultValues: { name: "", sub: "" } });

  return (
    <>
      <div className="box" style={{ marginBottom: 16 }}>
        <h3 className="serif">নতুন ক্যাটাগরি</h3>
        <form onSubmit={catForm.handleSubmit((values) => {
          const title = values.name.trim();
          if (!title) { toast("ক্যাটাগরির নাম দিন"); return; }
          if (cats.some((c) => c.name === title)) { toast("এই ক্যাটাগরি আগেই আছে"); return; }
          if (!section) return;
          const subName = values.sub.trim();
          createM.mutate({ sectionId: section.id, nameBn: title, toast: "ক্যাটাগরি যোগ হয়েছে · সাইটে দেখা যাচ্ছে" }, {
            onSuccess: (c) => {
              catForm.reset();
              if (subName) createM.mutate({ sectionId: section.id, parentId: c.id, nameBn: subName });
            },
          });
        })}>
          <div className="form-grid">
            <div><label>ক্যাটাগরির নাম</label><input {...catForm.register("name")} placeholder="যেমন: প্রাইমারি" /></div>
            <div><label>সাব-ক্যাটাগরি <span className="author">ঐচ্ছিক</span></label><input {...catForm.register("sub")} placeholder="যেমন: বাংলা" /></div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12 }} type="submit">যোগ করুন</button>
        </form>
      </div>
      {!cats.length ? <div className="empty">{treeQ.isLoading ? "লোড হচ্ছে…" : "ক্যাটাগরি নেই"}</div> : (
        <div className="cat-tree">
          {cats.map((c) => {
            const off = c.off;
            return (
            <article className={`cat-card${off ? " is-off" : ""}`} key={c.id}>
              <div className="cat-card-top">
                <span className="cat-card-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h10M4 18h16" /></svg></span>
                <div><b className="nm">{c.name}</b><small>{bn(c.subs.length)}টি সাব · {bn(c.count)}টি{off ? " · ইউজার দেখছে না" : ""}</small></div>
                <div className="acts">
                  <button type="button" className={`btn btn-sm ${off ? "btn-primary" : "btn-ghost"}`} onClick={() => {
                    updateM.mutate({ id: c.id, body: { isVisible: off }, toast: off ? "ক্যাটাগরি আবার দেখা যাচ্ছে" : "সব ক্রেতার কাছ থেকে লুকানো" });
                  }}>{off ? "দেখান" : "লুকান"}</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                    if (c.count) { toast("আগে পণ্য অন্য ক্যাটাগরিতে সরান"); return; }
                    deleteM.mutate({ id: c.id });
                  }}>মুছুন</button>
                </div>
              </div>
              {c.subs.length ? c.subs.map((x) => (
                <div className="cat-sub-row" key={x.id}>
                  <i className="dot" />
                  <b>{x.name}</b>
                  <span>{bn(x.count)}টি</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                    if (x.count) { toast("আগে পণ্য অন্য সাবে সরান"); return; }
                    deleteM.mutate({ id: x.id, toast: "সাব-ক্যাটাগরি মুছেছে" });
                  }}>মুছুন</button>
                </div>
              )) : <p className="cat-empty-subs">এখনো সাব-ক্যাটাগরি নেই</p>}
              <SubAddForm onAdd={(next) => {
                if (section) createM.mutate({ sectionId: section.id, parentId: c.id, nameBn: next });
              }} />
            </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function SubAddForm({ onAdd }: { onAdd: (name: string) => void }) {
  const { register, handleSubmit, reset } = useForm({ defaultValues: { sub: "" } });
  return (
    <form className="cat-sub-add" onSubmit={handleSubmit(({ sub }) => {
      const next = sub.trim();
      if (!next) return;
      onAdd(next);
      reset();
    })}>
      <input {...register("sub")} placeholder="সাব-ক্যাটাগরি · যেমন: বাংলা" />
      <button className="btn btn-gold btn-sm" type="submit">সাব যোগ</button>
    </form>
  );
}
