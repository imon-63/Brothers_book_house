"use client";

/**
 * থিম — the whole app's colour palette (storefront + admin). Saved as the public
 * store setting `theme`; every open tab picks it up on its next storefront fetch.
 */

import { useQueryClient } from "@tanstack/react-query";
import { patch } from "@/lib/api/client";
import { adminKeys, useAdminMutation } from "@/lib/api/admin/core";
import { useStoreSettings } from "@/lib/api/admin/settings";
import { applyTheme, type AppTheme } from "@/lib/theme";
import { useConfirm } from "@/components/admin/confirm";
import { Ico } from "@/components/admin/ui";
import "./theme.css";

const OPTIONS: { id: AppTheme; name: string; en: string; sub: string; swatches: string[] }[] = [
  { id: "classic", name: "ক্লাসিক", en: "Wine & Cream", sub: "চলো-র আসল রং — গাঢ় ওয়াইন, উষ্ণ ক্রিম আর সোনালি ছোঁয়া।", swatches: ["#7A2430", "#5C1B24", "#F6F0E4", "#C4A15A"] },
  { id: "mint", name: "গ্লসি", en: "Teal Glass", sub: "গ্লসি টিল, হালকা আকাশি নীল আর মিন্ট — ফ্রস্টেড গ্লাস আর নরম অরোরা আলো।", swatches: ["#0E9F8E", "#3AA0D8", "#D3F0EA", "#F5B83D"] },
];

export function ThemePanel() {
  const confirm = useConfirm();
  const qc = useQueryClient();
  const kv = useStoreSettings();
  const current = ((kv.data?.find((r) => r.key === "theme")?.value as AppTheme | undefined) ?? "classic");
  const saveM = useAdminMutation<AppTheme, unknown>({
    fn: (theme) => patch("/admin/content/settings", { values: { theme } }),
    invalidate: [adminKeys.settings],
    success: (_r, t) => `থিম বদলেছে — ${OPTIONS.find((o) => o.id === t)?.name}`,
    onSuccess: (_r, t) => {
      applyTheme(t);
      void qc.invalidateQueries({ queryKey: ["content", "storefront"] });
    },
  });

  async function pick(o: (typeof OPTIONS)[number]) {
    if (o.id === current || saveM.isPending) return;
    const ok = await confirm({
      title: `পুরো অ্যাপ "${o.name}" থিমে বদলাবেন?`,
      body: "কাস্টমারদের সাইট আর অ্যাডমিন প্যানেল — সবার জন্য রং সাথে সাথে বদলে যাবে। যেকোনো সময় আবার ফেরানো যাবে।",
      confirmText: "হ্যাঁ, বদলান",
      details: [{ label: "থিম", from: OPTIONS.find((x) => x.id === current)?.name, to: o.name }],
    });
    if (ok) saveM.mutate(o.id);
  }

  return (
    <div className="thm">
      <header className="thm-head">
        <h2>অ্যাপের থিম</h2>
        <p>পুরো সাইটের রং এক ক্লিকে বদলান — কাস্টমার আর অ্যাডমিন দুই দিকেই।</p>
      </header>
      <div className="thm-grid">
        {OPTIONS.map((o) => {
          const on = o.id === current;
          return (
            <button key={o.id} type="button" className={`thm-card t-${o.id}${on ? " on" : ""}`} aria-pressed={on}
              disabled={kv.isLoading || saveM.isPending} onClick={() => void pick(o)}>
              <div className="thm-prev" aria-hidden="true">
                <div className="thm-bar"><i /><span /><span /><b /></div>
                <div className="thm-body">
                  <div className="thm-chips"><i /><i /><i /><i /></div>
                  <div className="thm-table">
                    <div className="thm-th"><span /><span /></div>
                    <div className="thm-tr"><span /><span /></div>
                    <div className="thm-tr"><span /><span /></div>
                    <div className="thm-tot"><span /><span /></div>
                  </div>
                </div>
              </div>
              <div className="thm-info">
                <div className="thm-name">
                  <b>{o.name}</b><em>{o.en}</em>
                  {on ? <span className="thm-on">{Ico.check}চালু আছে</span> : null}
                </div>
                <p>{o.sub}</p>
                <div className="thm-sw">{o.swatches.map((c) => <i key={c} style={{ background: c }} />)}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
