"use client";

import { PackCard } from "@/components/catalog/pack-card";
import { useAppSelector } from "@/store/hooks";

export default function PacksPage() {
  const packs = useAppSelector((s) => s.shop.packs);
  return (
    <div className="wrap">
      <p className="crumb">হোম / <b>প্যাকেজ</b></p>
      <div className="section-head"><h2>বইয়ের প্যাকেজ</h2></div>
      <p className="lead" style={{ marginTop: -10 }}>একসাথে কয়েকটা বই — স্ট্যাক দেখে বেছে নিন।</p>
      <div className="grid">
        {packs.map((p) => <PackCard key={p.id} pack={p} />)}
      </div>
    </div>
  );
}
