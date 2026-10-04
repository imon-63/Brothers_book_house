"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { SectionGlyph } from "@/components/icons";
import { Reveal } from "@/components/storefront/reveal";
import { GArrow, GCash, GChat, GHeadset, GMap, GPhone, GShield, GTruck, GWhatsapp } from "@/components/storefront/glyphs";
import type { StorefrontDto } from "@/lib/api/content";
import type { SectionView } from "@/lib/api/section";
import { bn } from "@/lib/format";

/** Section heading used by the new home blocks. */
export function BlockHead({ kicker, title, href, more = "সব দেখুন", id, children }: { kicker?: string; title: string; href?: string; more?: string; id?: string; children?: ReactNode }) {
  return (
    <div className="sf-bhead">
      <div>
        {kicker ? <p className="sf-bkick"><i />{kicker}</p> : null}
        <h2 id={id}>{title}</h2>
      </div>
      {children}
      {href ? <Link className="sf-more" href={href}>{more} <GArrow size={16} /></Link> : null}
    </div>
  );
}

/** Colour per section code, so every বিভাগ gets its own accent. */
export function accentOf(code: string) {
  return code === "food" ? "#3D5A4C" : code === "gadget" ? "#245A6B" : code === "book" ? "#7A2430" : "#5C1B24";
}

export function SectionSwitch({ sections, current, onPick }: { sections: SectionView[]; current: string; onPick: (code: string) => void }) {
  if (sections.length < 2) return null;
  return (
    <Reveal className="wrap sf-switch" stagger aria-label="বিভাগ বাছুন">
      {sections.map((s) => {
        const items = s.tree.reduce((sum, c) => sum + c.count + c.subs.reduce((a, x) => a + x.count, 0), 0);
        const on = s.code === current;
        return (
          <button
            key={s.code}
            type="button"
            className={`sf-switch-card${on ? " on" : ""}`}
            aria-pressed={on}
            style={{ ["--c" as string]: accentOf(s.code) }}
            onClick={() => onPick(s.code)}
          >
            <span className="sf-switch-ico"><SectionGlyph code={s.code} icon={s.icon} /></span>
            <span className="sf-switch-txt">
              <b>{s.name}</b>
              <small>{bn(s.tree.length)}টি ক্যাটাগরি{items ? ` · ${bn(items)}+ পণ্য` : ""}</small>
            </span>
            <span className="sf-switch-go" aria-hidden="true">{on ? "এখানে আছেন" : <GArrow size={16} />}</span>
          </button>
        );
      })}
    </Reveal>
  );
}

export function TrustStrip({ settings }: { settings?: StorefrontDto["settings"] }) {
  const cod = settings?.cod_enabled !== false;
  const online = settings?.online_payment_enabled !== false;
  const pay = [cod ? "ক্যাশ অন ডেলিভারি" : "", online ? "বিকাশ · নগদ · কার্ড" : ""].filter(Boolean).join(" · ") || "নিরাপদ পেমেন্ট";
  const items = [
    { ico: <GTruck size={24} />, t: "সারা দেশে হোম ডেলিভারি", s: "ঢাকায় সাধারণত ১–২ দিন, বাইরে ২–৪ দিন" },
    { ico: <GCash size={24} />, t: "সহজ পেমেন্ট", s: pay },
    { ico: <GShield size={24} />, t: "১০০% আসল পণ্য", s: "সমস্যা হলে হেল্পলাইনে জানান, বদলে দেব" },
    { ico: <GHeadset size={24} />, t: "পাশে আছি", s: settings?.support_hours ? `হেল্পলাইন · ${settings.support_hours}` : "হেল্পলাইন ও লাইভ চ্যাট" },
  ];
  return (
    <Reveal className="wrap sf-trust" stagger aria-label="কেন চলো">
      {items.map((x) => (
        <div className="sf-trust-item" key={x.t}>
          <span className="sf-trust-ico">{x.ico}</span>
          <div><b>{x.t}</b><small>{x.s}</small></div>
        </div>
      ))}
    </Reveal>
  );
}

export function HelpBand({ helpline, whatsapp, hours, onChat }: { helpline: string; whatsapp?: string | null; hours?: string | null; onChat: () => void }) {
  const wa = String(whatsapp || helpline).replace(/\D/g, "").replace(/^0/, "880");
  return (
    <Reveal className="wrap sf-help" aria-labelledby="sf-help-h">
      <div className="sf-help-in">
        <span className="sf-help-orb" aria-hidden="true" />
        <div className="sf-help-copy">
          <p className="sf-bkick light"><i />সাহায্য লাগবে?</p>
          <h2 id="sf-help-h">অর্ডার, ডেলিভারি বা পণ্য — যেকোনো প্রশ্নে কথা বলুন</h2>
          <p>{hours ? `আমরা আছি ${hours}।` : "আমরা সাধারণত সাথে সাথে জবাব দিই।"} অর্ডার আইডি হাতে রাখলে আরও দ্রুত সাহায্য করতে পারব।</p>
        </div>
        <div className="sf-help-acts">
          <a className="sf-help-btn gold" href={`tel:${helpline}`}><GPhone size={20} /><span><small>কল করুন</small><b>{helpline}</b></span></a>
          <a className="sf-help-btn" href={`https://wa.me/${wa}`} target="_blank" rel="noopener"><GWhatsapp size={20} /><span><small>হোয়াটসঅ্যাপ</small><b>মেসেজ দিন</b></span></a>
          <button className="sf-help-btn" type="button" onClick={onChat}><GChat size={20} /><span><small>লাইভ চ্যাট</small><b>এখনই শুরু</b></span></button>
          <Link className="sf-help-btn" href="/track"><GMap size={20} /><span><small>ডেলিভারি</small><b>অর্ডার খুঁজুন</b></span></Link>
        </div>
      </div>
    </Reveal>
  );
}
