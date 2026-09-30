"use client";

import { PackCard } from "@/components/catalog/pack-card";
import { useBundles } from "@/lib/api/catalog";
import { useSection } from "@/lib/api/section";

export default function PacksPage() {
  const { code } = useSection();
  const q = useBundles({ section: code, pageSize: 60 });
  const packs = q.data?.items ?? [];
  return (
    <div className="wrap">
      <p className="crumb">হোম / <b>প্যাকেজ</b></p>
      <div className="section-head"><h2>{code === "book" ? "বইয়ের প্যাকেজ" : "প্যাকেজ"}</h2></div>
      <p className="lead" style={{ marginTop: -10 }}>একসাথে কয়েকটা — স্ট্যাক দেখে বেছে নিন।</p>
      <div className="grid">
        {packs.map((p) => <PackCard key={p.id} pack={p} />)}
        {!packs.length ? <div className="empty" style={{ gridColumn: "1 / -1" }}>{q.isLoading ? "লোড হচ্ছে…" : "এই বিভাগে এখনো প্যাকেজ নেই"}</div> : null}
      </div>
    </div>
  );
}
